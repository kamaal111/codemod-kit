import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Lang } from '@ast-grep/napi';
import { afterEach, beforeEach, expect, test } from 'vitest';

import { CodemodTargetNotFoundError } from '../../src/codemods/errors.js';
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

  const results = await runCodemod(makeUppercaseCodemod(), { paths: [filepath], log: false });

  expect(results).toHaveLength(1);
  expect(results[0]?.isOk()).toBe(true);
  expect(await fs.readFile(filepath, 'utf-8')).toEqual('CONST VALUE = 1;');
});

test('that runCodemod does not write a single file when dry_run is true', async () => {
  const filepath = path.join(workingDirectory, 'target.ts');
  await fs.writeFile(filepath, 'const value = 1;');

  const results = await runCodemod(makeUppercaseCodemod(), { paths: [filepath], log: false, dry_run: true });

  expect(results).toHaveLength(1);
  expect(await fs.readFile(filepath, 'utf-8')).toEqual('const value = 1;');
});

test('that runCodemod skips a single file with an unsupported extension', async () => {
  const filepath = path.join(workingDirectory, 'target.md');
  await fs.writeFile(filepath, 'const value = 1;');

  const results = await runCodemod(makeUppercaseCodemod(), { paths: [filepath], log: false });

  expect(results).toHaveLength(0);
  expect(await fs.readFile(filepath, 'utf-8')).toEqual('const value = 1;');
});

test('that runCodemod skips a single file rejected by targetFiltering', async () => {
  const filepath = path.join(workingDirectory, 'target.ts');
  await fs.writeFile(filepath, 'const value = 1;');

  const results = await runCodemod(
    makeUppercaseCodemod(),
    { paths: [filepath], log: false },
    { hooks: { targetFiltering: () => false } },
  );

  expect(results).toHaveLength(0);
  expect(await fs.readFile(filepath, 'utf-8')).toEqual('const value = 1;');
});

test('that runCodemod transforms multiple paths from a single config and flattens results', async () => {
  const fileA = path.join(workingDirectory, 'a.ts');
  const fileB = path.join(workingDirectory, 'b.ts');
  await fs.writeFile(fileA, 'const value = 1;');
  await fs.writeFile(fileB, 'const value = 2;');

  const results = await runCodemod(makeUppercaseCodemod(), { paths: [fileA, fileB], log: false });

  expect(results).toHaveLength(2);
  expect(results.every(result => result.isOk())).toBe(true);
  expect(await fs.readFile(fileA, 'utf-8')).toEqual('CONST VALUE = 1;');
  expect(await fs.readFile(fileB, 'utf-8')).toEqual('CONST VALUE = 2;');
});

test('that runCodemod throws a CodemodTargetNotFoundError for a missing path', async () => {
  const missingPath = path.join(workingDirectory, 'does-not-exist.ts');

  await expect(runCodemod(makeUppercaseCodemod(), { paths: [missingPath], log: false })).rejects.toBeInstanceOf(
    CodemodTargetNotFoundError,
  );
});

test('that runCodemod dedupes a literal duplicate path and only transforms it once', async () => {
  const filepath = path.join(workingDirectory, 'target.ts');
  await fs.writeFile(filepath, 'const value = 1;');

  const results = await runCodemod(makeUppercaseCodemod(), { paths: [filepath, filepath], log: false });

  expect(results).toHaveLength(1);
  expect(await fs.readFile(filepath, 'utf-8')).toEqual('CONST VALUE = 1;');
});

test('that runCodemod dedupes a file reachable through an overlapping directory path', async () => {
  const subDir = path.join(workingDirectory, 'sub');
  await fs.mkdir(subDir);
  const filepath = path.join(subDir, 'target.ts');
  await fs.writeFile(filepath, 'const value = 1;');

  const results = await runCodemod(makeUppercaseCodemod(), { paths: [workingDirectory, filepath], log: false });

  expect(results).toHaveLength(1);
  expect(await fs.readFile(filepath, 'utf-8')).toEqual('CONST VALUE = 1;');
});

test('that runCodemod dedupes an overlapping path while still transforming unrelated files', async () => {
  const subDir = path.join(workingDirectory, 'sub');
  await fs.mkdir(subDir);
  const sharedFile = path.join(subDir, 'shared.ts');
  const uniqueFile = path.join(workingDirectory, 'unique.ts');
  await fs.writeFile(sharedFile, 'const value = 1;');
  await fs.writeFile(uniqueFile, 'const value = 2;');

  const results = await runCodemod(makeUppercaseCodemod(), {
    paths: [workingDirectory, sharedFile],
    log: false,
  });

  expect(results).toHaveLength(2);
  expect(await fs.readFile(sharedFile, 'utf-8')).toEqual('CONST VALUE = 1;');
  expect(await fs.readFile(uniqueFile, 'utf-8')).toEqual('CONST VALUE = 2;');
});

test('that runCodemod dedupes overlapping paths even when one is relative and the other absolute', async () => {
  const filepath = path.join(workingDirectory, 'target.ts');
  await fs.writeFile(filepath, 'const value = 1;');
  const relativeWorkingDirectory = path.relative(process.cwd(), workingDirectory);

  const results = await runCodemod(makeUppercaseCodemod(), {
    paths: [relativeWorkingDirectory, filepath],
    log: false,
  });

  expect(results).toHaveLength(1);
  expect(await fs.readFile(filepath, 'utf-8')).toEqual('CONST VALUE = 1;');
});
