import path from 'node:path';
import fs from 'node:fs/promises';

import fg from 'fast-glob';
import { err, ok, type Result } from 'neverthrow';

import { type CodeMod, LANG_TO_EXTENSIONS_MAPPING } from './constants';
import type { Modifications } from './types';
import { getCollectionCount } from '../utils/collections';

type RunCodemodHooks = {
  targetFiltering?: (filepath: string) => boolean;
  preCodemodRun: (codemod: CodeMod) => Promise<void>;
};

export async function runCodemods(
  codemods: Array<CodeMod>,
  cwd: string,
  hooks?: RunCodemodHooks,
): Promise<Record<string, Array<Result<Modifications, Error>>>> {
  const globItems = await fg.glob(['**/*'], { cwd });
  const results: Record<string, Array<Result<Modifications, Error>>> = {};
  for (const codemod of codemods) {
    results[codemod.name] = await runCodemod(codemod, cwd, globItems, hooks);
  }

  return results;
}

export async function runCodemod(
  codemod: CodeMod,
  cwd: string,
  globItems: Array<string>,
  hooks?: RunCodemodHooks,
): Promise<Array<Result<Modifications, Error>>> {
  await (hooks?.preCodemodRun ?? (async () => {}))(codemod);

  const unwrappedTargetFiltering = hooks?.targetFiltering ?? (() => true);
  const extensions = new Set(
    Array.from(codemod.languages).reduce<Array<string>>((acc, language) => {
      const e = LANG_TO_EXTENSIONS_MAPPING[language];
      if (e == null) return acc;

      return acc.concat(Array.from(e));
    }, []),
  );
  const targets = globItems.filter(filepath => {
    if (!unwrappedTargetFiltering(filepath)) return false;

    const projectName = filepath.split('/')[0];
    if (projectName == null) throw new Error('Invariant found, project name should be present');

    return getCollectionCount(extensions) == 0 || extensions.has(path.extname(filepath));
  });
  if (targets.length === 0) return [];

  console.log(
    `🧉 '${codemod.name}' targeting ${targets.length} ${targets.length === 1 ? 'file' : 'files'} to transform, chill and grab some maté`,
  );

  return Promise.all(
    targets.map(async filepath => {
      const fullPath = path.join(cwd, filepath);
      try {
        const content = await fs.readFile(fullPath, { encoding: 'utf-8' });
        const modifications = await codemod.transformer(content, fullPath);
        if (modifications.report.changesApplied > 0) {
          await fs.writeFile(fullPath, modifications.ast.root().text());
          console.log(`🚀 finished '${codemod.name}'`, { filename: filepath, report: modifications.report });
        }

        return ok(modifications);
      } catch (error) {
        console.error(`❌ '${codemod.name}' failed to parse file`, filepath, error);

        return err(error as Error);
      }
    }),
  );
}
