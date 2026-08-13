import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Lang } from '@ast-grep/napi';
import { afterEach, beforeEach, expect, test } from 'vitest';

import type { Codemod } from '../../src/codemods/types.js';
import { runCodemod } from '../../src/codemods/utils.js';

let workingDirectory: string;

beforeEach(async () => {
  workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'codemod-kit-'));
});

afterEach(async () => {
  await fs.rm(workingDirectory, { recursive: true, force: true });
});

function makeUppercaseCodemod(): Codemod {
  return {
    name: 'uppercase-codemod',
    languages: [Lang.TypeScript],
    transformer: async content => content.toUpperCase(),
  };
}

test('that runCodemod transforms a single file directly', async () => {
  const filepath = path.join(workingDirectory, 'target.ts');
  await fs.writeFile(filepath, 'const value = 1;');

  const results = await runCodemod(makeUppercaseCodemod(), filepath, { log: false });

  expect(results).toHaveLength(1);
  expect(results[0]?.isOk()).toBe(true);
  expect(await fs.readFile(filepath, 'utf-8')).toEqual('CONST VALUE = 1;');
});

test('that runCodemod does not write a single file when dry is true', async () => {
  const filepath = path.join(workingDirectory, 'target.ts');
  await fs.writeFile(filepath, 'const value = 1;');

  const results = await runCodemod(makeUppercaseCodemod(), filepath, { log: false, dry: true });

  expect(results).toHaveLength(1);
  expect(await fs.readFile(filepath, 'utf-8')).toEqual('const value = 1;');
});

test('that runCodemod skips a single file with an unsupported extension', async () => {
  const filepath = path.join(workingDirectory, 'target.md');
  await fs.writeFile(filepath, 'const value = 1;');

  const results = await runCodemod(makeUppercaseCodemod(), filepath, { log: false });

  expect(results).toHaveLength(0);
  expect(await fs.readFile(filepath, 'utf-8')).toEqual('const value = 1;');
});

test('that runCodemod skips a single file rejected by targetFiltering', async () => {
  const filepath = path.join(workingDirectory, 'target.ts');
  await fs.writeFile(filepath, 'const value = 1;');

  const results = await runCodemod(makeUppercaseCodemod(), filepath, {
    log: false,
    hooks: { targetFiltering: () => false },
  });

  expect(results).toHaveLength(0);
  expect(await fs.readFile(filepath, 'utf-8')).toEqual('const value = 1;');
});
