import path from 'node:path';
import fs from 'node:fs/promises';

import fg from 'fast-glob';
import { err, ok, type Result } from 'neverthrow';

import { LANG_TO_EXTENSIONS_MAPPING } from './constants';
import type { Codemod, Modifications } from './types';
import { collectionIsEmpty } from '../utils/collections';
import type { Optional } from '../utils/type-utils';

type RunCodemodHooks = {
  targetFiltering?: (filepath: string) => boolean;
  preCodemodRun?: (codemod: Codemod) => Promise<void>;
  postTransform?: (transformedContent: string) => Promise<string>;
};

type RunCodemodOptions = {
  hooks?: RunCodemodHooks;
  log?: boolean;
  dry?: boolean;
};

export async function runCodemods(
  codemods: Array<Codemod>,
  transformationPath: string,
  options?: RunCodemodOptions,
): Promise<Record<string, Array<Result<Modifications, Error>>>> {
  const globItems = await fg.glob(['**/*'], { cwd: transformationPath });
  const results: Record<string, Array<Result<Modifications, Error>>> = {};
  for (const codemod of codemods) {
    results[codemod.name] = await runCodemod(codemod, transformationPath, globItems, options);
  }

  return results;
}

export async function runCodemod(
  codemod: Codemod,
  transformationPath: string,
  globItems: Array<string>,
  options?: RunCodemodOptions,
): Promise<Array<Result<Modifications, Error>>> {
  const { hooks, log: enableLogging, dry: runInDryMode } = defaultedOptions(options);

  const extensions = new Set(
    Array.from(codemod.languages).reduce<Array<string>>((acc, language) => {
      const e = LANG_TO_EXTENSIONS_MAPPING[language.toLowerCase()];
      if (e == null) return acc;

      return acc.concat(Array.from(e));
    }, []),
  );
  const targets = globItems.filter(filepath => {
    if (!hooks.targetFiltering(filepath)) return false;

    const projectName = filepath.split('/')[0];
    if (projectName == null) throw new Error('Invariant found, project name should be present');

    return collectionIsEmpty(extensions) || extensions.has(path.extname(filepath));
  });
  if (targets.length === 0) return [];

  if (enableLogging) {
    console.log(
      `🧉 '${codemod.name}' targeting ${targets.length} ${targets.length === 1 ? 'file' : 'files'} to transform, chill and grab some maté`,
    );
  }

  return Promise.all(
    targets.map(async filepath => {
      const fullPath = path.join(transformationPath, filepath);
      try {
        const content = await fs.readFile(fullPath, { encoding: 'utf-8' });
        const modifications = await codemod.transformer(content, fullPath);
        if (modifications.report.changesApplied > 0) {
          const transformedContent = await hooks.postTransform(modifications.ast.root().text());
          if (!runInDryMode) {
            await fs.writeFile(fullPath, transformedContent);
          }
          if (enableLogging) {
            console.log(`🚀 finished '${codemod.name}'`, { filename: filepath, report: modifications.report });
          }
        }

        return ok(modifications);
      } catch (error) {
        if (enableLogging) {
          console.error(`❌ '${codemod.name}' failed to parse file`, filepath, error);
        }

        return err(error as Error);
      }
    }),
  );
}

function defaultedOptions(
  options: Optional<RunCodemodOptions>,
): Required<Omit<RunCodemodOptions, 'hooks'>> & { hooks: Required<RunCodemodHooks> } {
  return { hooks: defaultedHooks(options?.hooks), log: options?.log ?? true, dry: options?.dry ?? false };
}

function defaultedHooks(hooks: Optional<RunCodemodHooks>): Required<RunCodemodHooks> {
  const targetFiltering = hooks?.targetFiltering ?? (() => true);
  const postTransform = hooks?.postTransform ?? (async content => content);
  const preCodemodRun = hooks?.preCodemodRun ?? (async () => {});

  return { targetFiltering, postTransform, preCodemodRun };
}
