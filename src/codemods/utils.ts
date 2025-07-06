import path from 'node:path';
import fs from 'node:fs/promises';

import { $ } from 'execa';
import fg from 'fast-glob';
import { err, ok } from 'neverthrow';
import { parseAsync, type Rule, type Edit, type SgRoot, type SgNode } from '@ast-grep/napi';
import type { Kinds, TypesMap } from '@ast-grep/napi/types/staticTypes.js';
import type { NapiLang } from '@ast-grep/napi/types/lang.js';
import { arrays, asserts, type types } from '@kamaalio/kamaal';

import { LANG_TO_EXTENSIONS_MAPPING } from './constants.js';
import type {
  Codemod,
  CodemodRunnerCodemod,
  FindAndReplaceConfig,
  Modifications,
  RepositoryToClone,
  RunCodemodOkResult,
  RunCodemodResult,
} from './types.js';
import { collectionContains, collectionIsEmpty } from '../utils/collections.js';
import type { ReplaceObjectProperty } from '../utils/type-utils.js';
import { groupBy, groupByFlat } from '../utils/arrays.js';
import { cloneRepositories, type Repository } from '../git/index.js';
import { groupResults } from '../utils/results.js';
import { makePullRequestsForCodemodResults } from '../github/index.js';

type RunCodemodHooks<C extends Codemod = Codemod> = {
  targetFiltering?: (filepath: string, codemod: C) => boolean;
  preCodemodRun?: (codemod: C) => Promise<void>;
  postTransform?: (transformedContent: string, codemod: C) => Promise<string>;
};

type RunCodemodOptions<C extends Codemod = Codemod> = {
  hooks?: RunCodemodHooks<C>;
  log?: boolean;
  dry?: boolean;
  rootPaths?: Array<string>;
};

export async function runCodemodsOnProjects<Tag = string, C extends Codemod = Codemod>(
  repositoriesToClone: Array<RepositoryToClone<Tag>>,
  codemods: Array<CodemodRunnerCodemod<Tag, C>>,
  options: { workingDirectory: string; pushChanges: boolean },
) {
  const clonedRepositories = await cloneRepositories(repositoriesToClone, options.workingDirectory);
  console.log(
    `🖨️ cloned ${clonedRepositories.length} ${clonedRepositories.length === 1 ? 'repository' : 'repositories'}`,
  );

  const codemodResults = await runCodemodRunner(codemods, clonedRepositories, options.workingDirectory);
  if (options.pushChanges) {
    await makePullRequestsForCodemodResults(codemods, codemodResults, clonedRepositories);
  }
}

function codemodTargetFiltering<Tag = string, C extends Codemod = Codemod>(
  repositories: Record<string, Repository<Tag>>,
  failedRepositoryAddressesMappedByCodemodNames: Record<string, Set<string>>,
): (filepath: string, codemod: CodemodRunnerCodemod<Tag, C>) => boolean {
  return (filepath, codemod) => {
    const projectName = filepath.split('/')[0];
    asserts.invariant(projectName != null, 'project name should be present');

    const repository = repositories[projectName];
    if (repository == null) return false;

    const failedRepositoryAddressesSet = failedRepositoryAddressesMappedByCodemodNames[codemod.name];
    if (failedRepositoryAddressesSet == null || collectionIsEmpty(failedRepositoryAddressesSet)) {
      return true;
    }

    return (
      !failedRepositoryAddressesSet.has(repository.address) &&
      (collectionIsEmpty(codemod.tags) ||
        collectionIsEmpty(repository.tags) ||
        [...codemod.tags].some(tag => collectionContains(repository.tags, tag)))
    );
  };
}

async function codemodPreCodemodRun<Tag = string, C extends Codemod = Codemod>(
  repositories: Array<Repository<Tag>>,
  codemod: CodemodRunnerCodemod<Tag, C>,
): Promise<Set<string>> {
  const preparationResults = await Promise.all(repositories.map(repo => repo.prepareForUpdate(codemod.name)));
  const { failure: preparationFailures } = groupResults(preparationResults);
  const failedRepositoryAddresses = preparationFailures.map(failure => failure.repository.address);
  if (preparationFailures.length > 0) {
    console.error(`❌ failed to prepare [${failedRepositoryAddresses.join(', ')}] for '${codemod.name}'`);
  }

  return new Set(failedRepositoryAddresses);
}

async function codemodPostTransform(transformedContent: string) {
  return transformedContent;
}

async function runCodemodRunner<Tag = string, C extends Codemod = Codemod>(
  codemods: Array<CodemodRunnerCodemod<Tag, C>>,
  repositories: Array<Repository<Tag>>,
  workingDirectory: string,
): Promise<Record<string, Array<RunCodemodResult>>> {
  const codemodRepositoriesMappedByCodemodName = await prepareRepositoriesForCodemods(
    repositories,
    codemods,
    workingDirectory,
  );
  const results: Record<string, Array<RunCodemodResult>> = Object.fromEntries(
    await Promise.all(
      codemods.map<Promise<[string, Array<RunCodemodResult>]>>(async codemod => {
        const start = performance.now();
        const codemodRepositories = codemodRepositoriesMappedByCodemodName[codemod.name];
        asserts.invariant(codemodRepositories != null, 'Codemod repositories should be present');

        const codemodWorkingDirectory = path.resolve(workingDirectory, codemod.name.replace(/\//g, '-'));
        const failedRepositoryAddressesMappedByCodemodNames: Record<string, Set<string>> = {};
        const result = await runCodemod(codemod, codemodWorkingDirectory, {
          rootPaths: codemodRepositories.map(repository => repository.path),
          hooks: {
            preCodemodRun: async codemod => {
              failedRepositoryAddressesMappedByCodemodNames[codemod.name] = await codemodPreCodemodRun(
                repositories,
                codemod,
              );
            },
            targetFiltering: codemodTargetFiltering(
              groupByFlat(codemodRepositories, 'name'),
              failedRepositoryAddressesMappedByCodemodNames,
            ),
            postTransform: codemodPostTransform,
          },
        });
        const end = performance.now();
        console.log(`✨ '${codemod.name}' codemod took ${((end - start) / 1000).toFixed(2)} seconds`);

        return [codemod.name, result];
      }),
    ),
  );

  return results;
}

async function prepareRepositoriesForCodemods<Tag, C extends Codemod>(
  repositories: Array<Repository<Tag>>,
  codemods: Array<CodemodRunnerCodemod<Tag, C>>,
  workingDirectory: string,
): Promise<Record<string, Array<Repository<Tag>>>> {
  const reposMappedByMainBranch: Array<{ mainBranchName: string; repository: Repository<Tag> }> = await Promise.all(
    repositories.map<Promise<{ mainBranchName: string; repository: Repository<Tag> }>>(async repo => {
      const mainBranchResult = await repo.getMainBranch();
      if (mainBranchResult.isErr()) throw mainBranchResult.error;

      return { mainBranchName: mainBranchResult.value.name, repository: repo };
    }),
  );
  const updatedRepositories = await Promise.all(
    reposMappedByMainBranch.map(async ({ mainBranchName, repository }) => {
      const prepareResult = await repository.prepareForUpdate(mainBranchName);
      if (prepareResult.isErr()) throw prepareResult.error;

      return prepareResult.value;
    }),
  );
  console.log(
    `📋 prepared the following repos for codemods:\n· ${updatedRepositories.map(repo => repo.address).join('\n· ')}`,
  );

  return Object.fromEntries(
    await Promise.all(
      codemods.map<Promise<[string, Array<Repository<Tag>>]>>(async codemod => {
        const codemodWorkingDirectory = path.resolve(workingDirectory, codemod.name.replace(/\//g, '-'));
        await $`mkdir -p ${codemodWorkingDirectory}`;

        const codeRepositories = await Promise.all(
          updatedRepositories.map(repo => {
            const newPath = path.join(codemodWorkingDirectory, repo.name);
            console.log(`©️ copying ${repo.name} -> ${newPath}`);

            return repo.copy(newPath);
          }),
        );

        return [codemod.name, codeRepositories];
      }),
    ),
  );
}

export async function runCodemods<C extends Codemod = Codemod>(
  codemods: Array<C>,
  transformationPath: string,
  options?: RunCodemodOptions<C>,
): Promise<Record<string, Array<RunCodemodResult>>> {
  const results: Record<string, Array<RunCodemodResult>> = {};
  for (const codemod of codemods) {
    results[codemod.name] = await runCodemod(codemod, transformationPath, options);
  }

  return results;
}

export async function runCodemod<C extends Codemod = Codemod>(
  codemod: C,
  transformationPath: string,
  options?: RunCodemodOptions<C>,
): Promise<Array<RunCodemodResult>> {
  const { hooks, log: enableLogging, dry: runInDryMode, rootPaths } = defaultedOptions(options);
  await hooks.preCodemodRun(codemod);

  const globItems = await fg.glob(['**/*'], { cwd: transformationPath });
  const extensions = new Set(
    Array.from(codemod.languages).reduce<Array<string>>((acc, language) => {
      const mappedExtensions = LANG_TO_EXTENSIONS_MAPPING[language.toLowerCase()];
      if (mappedExtensions == null) return acc;

      return acc.concat(Array.from(mappedExtensions));
    }, []),
  );
  const codemodTargetFiltering = codemod.targetFiltering ?? (() => true);
  const targets = globItems.filter(filepath => {
    if (!hooks.targetFiltering(filepath, codemod)) return false;
    if (!codemodTargetFiltering(filepath, codemod)) return false;

    return collectionIsEmpty(extensions) || extensions.has(path.extname(filepath));
  });
  if (targets.length === 0) return [];

  if (enableLogging) {
    console.log(
      `🧉 '${codemod.name}' targeting ${targets.length} ${targets.length === 1 ? 'file' : 'files'} to transform, chill and grab some maté`,
    );
  }

  const results: Array<RunCodemodResult> = await Promise.all(
    targets.map(async filepath => {
      const fullPath = path.join(transformationPath, filepath);
      try {
        const content = await fs.readFile(fullPath, { encoding: 'utf-8' });
        const modifiedContent = await codemod.transformer(content, fullPath);
        const hasChanges = modifiedContent !== content;
        if (hasChanges) {
          const transformedContent = await hooks.postTransform(modifiedContent, codemod);
          if (!runInDryMode) {
            await fs.writeFile(fullPath, transformedContent);
          }
          if (enableLogging) {
            console.log(`🚀 finished '${codemod.name}'`, { filename: filepath });
          }
        }

        return ok({
          hasChanges,
          content: modifiedContent,
          fullPath,
          root: path.resolve(transformationPath, filepath.split('/')[0]),
        });
      } catch (error) {
        if (enableLogging) {
          console.error(`❌ '${codemod.name}' failed to parse file`, filepath, error);
        }

        return err(error as Error);
      }
    }),
  );

  const successes: Array<RunCodemodOkResult> = arrays.compactMap(results, result => {
    if (result.isErr()) return null;
    return result.value;
  });
  const successesGroupedByRoot = groupBy(successes, 'root');
  const rootPathsWithResults: Array<{
    root: string;
    results: Array<RunCodemodOkResult>;
  }> = rootPaths.map(root => ({ root, results: successesGroupedByRoot[root] ?? [] }));
  await Promise.all(rootPathsWithResults.map(r => (codemod.postTransform ?? (async () => {}))(r)));

  return results;
}

export function traverseUp(
  node: SgNode<TypesMap, Kinds<TypesMap>>,
  until: (node: SgNode<TypesMap, Kinds<TypesMap>>) => boolean,
): types.Optional<SgNode<TypesMap, Kinds<TypesMap>>> {
  let current = node.parent();
  if (current == null) return null;

  while (current != null) {
    const next: types.Optional<SgNode<TypesMap, Kinds<TypesMap>>> = current.parent();
    if (next == null) break;
    if (until(next)) {
      current = next;
      break;
    }

    current = next;
  }

  if (!until(current)) return null;
  return current;
}

export async function findAndReplaceConfigModifications(
  modifications: Modifications,
  config: Array<FindAndReplaceConfig>,
): Promise<Modifications> {
  let currentModifications = { ...modifications };
  for (const { rule, transformer } of config) {
    const edits = findAndReplaceEdits(currentModifications.ast, rule, transformer);
    currentModifications = await commitEditModifications(edits, currentModifications);
  }

  return currentModifications;
}

async function findAndReplaceConfigEdits(
  content: SgRoot<TypesMap>,
  lang: NapiLang,
  config: Array<FindAndReplaceConfig>,
): Promise<Array<{ content: SgRoot<TypesMap>; edits: Array<Edit> }>> {
  let currentContent = content;
  const editsAndContent: Array<{ content: SgRoot<TypesMap>; edits: Array<Edit> }> = [];
  for (const { rule, transformer } of config) {
    const edits = findAndReplaceEdits(currentContent, rule, transformer);
    const updatedContent = currentContent.root().commitEdits(edits);
    editsAndContent.push({ content: currentContent, edits });
    currentContent = await parseAsync(lang, updatedContent);
  }

  return editsAndContent;
}

export async function findAndReplaceConfig(
  content: SgRoot<TypesMap>,
  lang: NapiLang,
  config: Array<FindAndReplaceConfig>,
): Promise<string> {
  const edits = await findAndReplaceConfigEdits(content, lang, config);

  return edits.at(-1)?.content.root().text() ?? content.root().text();
}

export function findAndReplaceEdits(
  content: SgRoot<TypesMap>,
  rule: FindAndReplaceConfig['rule'],
  transformer: FindAndReplaceConfig['transformer'],
): Array<Edit> {
  const nodes = content.root().findAll({ rule });

  return arrays
    .compactMap(nodes, node => {
      const transformed = typeof transformer === 'string' ? transformer : transformer(node, rule);
      if (transformed == null) return null;

      const edits: Array<Edit> = [];
      const valuesToTransform: Array<string> = [];
      if (Array.isArray(transformed)) {
        for (const item of transformed) {
          if (typeof item === 'string') {
            valuesToTransform.push(item);
          } else {
            edits.push(item);
          }
        }
      } else {
        if (typeof transformed === 'string') {
          valuesToTransform.push(transformed);
        } else {
          edits.push(transformed);
        }
      }

      const metaVariables = Object.values(extractMetaVariables(node, rule));
      const transformedValuesWithMetaVariablesReplaced = valuesToTransform.map(transformedValue => {
        return metaVariables.reduce((acc, { original, value }) => acc.replaceAll(original, value), transformedValue);
      });

      return arrays
        .compactMap(transformedValuesWithMetaVariablesReplaced, transformedValueWithMetaVariablesReplaced => {
          if (transformedValueWithMetaVariablesReplaced === node.text()) return null;
          return node.replace(transformedValueWithMetaVariablesReplaced);
        })
        .concat(edits);
    })
    .flat(1);
}

function extractMetaVariables(
  node: SgNode<TypesMap, Kinds<TypesMap>>,
  rule: Rule<TypesMap>,
): Record<string, { start: number; end: number; value: string; original: string }> {
  const pattern = rule.pattern?.toString();
  if (pattern == null) return {};

  // Find all meta variables in the pattern (starting with $ or $$$ followed by capital letters)
  const metaVarRegex = /\$(\$\$)?([A-Z]+)/g;
  const patternMetaVars = [];

  let match: types.Optional<RegExpExecArray>;
  while ((match = metaVarRegex.exec(pattern)) !== null) {
    const isMultiple = match[1] != null; // Check if $$$ pattern
    const varName = match[2]; // Variable name is now in group 2
    patternMetaVars.push({
      name: varName,
      fullMatch: match[0],
      patternIndex: match.index,
      isMultiple, // Flag to indicate if this is a $$$ variable
    });
  }
  if (patternMetaVars.length === 0) return {};

  let regexPattern = pattern
    // Escape special regex characters except for our meta variables
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  for (const metaVar of patternMetaVars) {
    const escapedFullMatch = metaVar.fullMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (metaVar.isMultiple) {
      regexPattern = regexPattern
        // For $$$ variables, match zero or more of anything (non-greedy)
        .replace(escapedFullMatch, '(.*?)');
    } else {
      regexPattern = regexPattern
        // For $ variables, match one or more of anything (non-greedy)
        .replace(escapedFullMatch, '(.+?)');
    }
  }

  const nodeText = node.text();
  const textMatch = nodeText.match(new RegExp(regexPattern));
  if (textMatch == null) return {};

  const metaVariables: Record<string, { start: number; end: number; value: string; original: string }> = {};
  for (let index = 0; index < patternMetaVars.length; index += 1) {
    const metaVar = patternMetaVars[index];
    const capturedValue = textMatch[index + 1];
    if (!capturedValue) continue;

    const valueStart = nodeText.indexOf(capturedValue);
    const valueEnd = valueStart + capturedValue.length;
    metaVariables[metaVar.name] = {
      start: valueStart,
      end: valueEnd,
      value: capturedValue,
      original: metaVar.fullMatch,
    };
  }

  return metaVariables;
}

export function findAndReplace(
  content: SgRoot<TypesMap>,
  rule: FindAndReplaceConfig['rule'],
  transformer: FindAndReplaceConfig['transformer'],
): string {
  const root = content.root();
  const edits = findAndReplaceEdits(content, rule, transformer);

  return root.commitEdits(edits);
}

export async function commitEditModifications(
  edits: Array<Edit>,
  modifications: Modifications,
): Promise<Modifications> {
  if (edits.length === 0) return modifications;

  const root = modifications.ast.root();
  const committed = root.commitEdits(edits);
  const modifiedAST = await parseAsync(modifications.lang, committed);

  return {
    ...modifications,
    ast: modifiedAST,
    report: { changesApplied: modifications.report.changesApplied + edits.length },
    history: modifications.history.concat([modifiedAST]),
  };
}

function defaultedOptions<C extends Codemod = Codemod>(
  options: types.Optional<RunCodemodOptions<C>>,
): Required<ReplaceObjectProperty<RunCodemodOptions<C>, 'hooks', Required<RunCodemodHooks<C>>>> {
  return {
    hooks: defaultedHooks<C>(options?.hooks),
    log: options?.log ?? true,
    dry: options?.dry ?? false,
    rootPaths: options?.rootPaths ?? [],
  };
}

function defaultedHooks<C extends Codemod = Codemod>(
  hooks: types.Optional<RunCodemodHooks<C>>,
): Required<RunCodemodHooks<C>> {
  const targetFiltering = hooks?.targetFiltering ?? (() => true);
  const postTransform = hooks?.postTransform ?? (async content => content);
  const preCodemodRun = hooks?.preCodemodRun ?? (async () => {});

  return { targetFiltering, postTransform, preCodemodRun };
}
