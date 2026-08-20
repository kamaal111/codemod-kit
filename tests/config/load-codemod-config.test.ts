import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, test } from 'vitest';
import z from 'zod';

import { ConfigNotFoundError, ConfigParseError, ConfigValidationError } from '../../src/config/errors.js';
import { CodemodConfigSchema } from '../../src/config/schemas.js';
import { loadCodemodConfig } from '../../src/config/utils.js';

let workingDirectory: string;

beforeEach(async () => {
  workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'codemod-kit-'));
});

afterEach(async () => {
  await fs.rm(workingDirectory, { recursive: true, force: true });
});

test('that loadCodemodConfig loads a valid config without dry_run', async () => {
  const configPath = path.join(workingDirectory, 'config.json');
  await fs.writeFile(configPath, JSON.stringify({ paths: ['src/controllers'] }));

  await expect(loadCodemodConfig(configPath)).resolves.toEqual({ paths: ['src/controllers'] });
});

test('that loadCodemodConfig loads a valid config with dry_run', async () => {
  const configPath = path.join(workingDirectory, 'config.json');
  await fs.writeFile(configPath, JSON.stringify({ paths: ['src/controllers'], dry_run: true }));

  await expect(loadCodemodConfig(configPath)).resolves.toEqual({ paths: ['src/controllers'], dry_run: true });
});

test('that loadCodemodConfig throws a ConfigNotFoundError when the file does not exist', async () => {
  const configPath = path.join(workingDirectory, 'missing.json');

  await expect(loadCodemodConfig(configPath)).rejects.toBeInstanceOf(ConfigNotFoundError);
});

test('that loadCodemodConfig throws a ConfigParseError for invalid JSON', async () => {
  const configPath = path.join(workingDirectory, 'config.json');
  await fs.writeFile(configPath, '{ not valid json');

  await expect(loadCodemodConfig(configPath)).rejects.toBeInstanceOf(ConfigParseError);
});

test('that loadCodemodConfig throws a ConfigValidationError when paths is missing', async () => {
  const configPath = path.join(workingDirectory, 'config.json');
  await fs.writeFile(configPath, JSON.stringify({}));

  await expect(loadCodemodConfig(configPath)).rejects.toBeInstanceOf(ConfigValidationError);
});

test('that loadCodemodConfig throws a ConfigValidationError when dry_run is not a boolean', async () => {
  const configPath = path.join(workingDirectory, 'config.json');
  await fs.writeFile(configPath, JSON.stringify({ paths: ['src/controllers'], dry_run: 'yes' }));

  await expect(loadCodemodConfig(configPath)).rejects.toBeInstanceOf(ConfigValidationError);
});

test('that loadCodemodConfig accepts an extended schema', async () => {
  const configPath = path.join(workingDirectory, 'config.json');
  await fs.writeFile(configPath, JSON.stringify({ paths: ['src/controllers'], extra_field: 'value' }));

  const ExtendedSchema = CodemodConfigSchema.extend({ extra_field: z.string() });

  await expect(loadCodemodConfig(configPath, ExtendedSchema)).resolves.toEqual({
    paths: ['src/controllers'],
    extra_field: 'value',
  });
});
