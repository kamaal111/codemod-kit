import path from 'node:path';
import fs from 'node:fs/promises';

import fg from 'fast-glob';
import { err, ok, type Result } from 'neverthrow';

import { LANG_TO_EXTENSIONS_MAPPING } from './constants.js';
import type { Codemod } from './types.js';
import { collectionIsEmpty } from '../utils/collections.js';
import type { Optional, ReplaceObjectProperty } from '../utils/type-utils.js';

type RunCodemodHooks<C extends Codemod> = {
  targetFiltering?: (filepath: string, codemod: C) => boolean;
  preCodemodRun?: (codemod: C) => Promise<void>;
  postTransform?: (transformedContent: string, codemod: C) => Promise<string>;
};

type RunCodemodOptions<C extends Codemod> = {
  hooks?: RunCodemodHooks<C>;
  log?: boolean;
  dry?: boolean;
};

export async function runCodemods<C extends Codemod>(
  codemods: Array<C>,
  transformationPath: string,
  options?: RunCodemodOptions<C>,
): Promise<Record<string, Array<Result<{ hasChanges: boolean; content: string }, Error>>>> {
  const results: Record<string, Array<Result<{ hasChanges: boolean; content: string }, Error>>> = {};
  for (const codemod of codemods) {
    results[codemod.name] = await runCodemod(codemod, transformationPath, options);
  }

  return results;
}

export async function runCodemod<C extends Codemod>(
  codemod: C,
  transformationPath: string,
  options?: RunCodemodOptions<C>,
): Promise<Array<Result<{ hasChanges: boolean; content: string }, Error>>> {
  const { hooks, log: enableLogging, dry: runInDryMode } = defaultedOptions(options);
  const globItems = await fg.glob(['**/*'], { cwd: transformationPath });

  const extensions = new Set(
    Array.from(codemod.languages).reduce<Array<string>>((acc, language) => {
      const mappedExtensions = LANG_TO_EXTENSIONS_MAPPING[language.toLowerCase()];
      if (mappedExtensions == null) return acc;

      return acc.concat(Array.from(mappedExtensions));
    }, []),
  );
  const targets = globItems.filter(filepath => {
    if (!hooks.targetFiltering(filepath, codemod)) return false;

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

        return ok({ hasChanges, content: modifiedContent });
      } catch (error) {
        if (enableLogging) {
          console.error(`❌ '${codemod.name}' failed to parse file`, filepath, error);
        }

        return err(error as Error);
      }
    }),
  );
}

function defaultedOptions<C extends Codemod>(
  options: Optional<RunCodemodOptions<C>>,
): Required<ReplaceObjectProperty<RunCodemodOptions<C>, 'hooks', Required<RunCodemodHooks<C>>>> {
  return { hooks: defaultedHooks<C>(options?.hooks), log: options?.log ?? true, dry: options?.dry ?? false };
}

function defaultedHooks<C extends Codemod>(hooks: Optional<RunCodemodHooks<C>>): Required<RunCodemodHooks<C>> {
  const targetFiltering = hooks?.targetFiltering ?? (() => true);
  const postTransform = hooks?.postTransform ?? (async content => content);
  const preCodemodRun = hooks?.preCodemodRun ?? (async () => {});

  return { targetFiltering, postTransform, preCodemodRun };
}
