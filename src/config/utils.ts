import fs from 'node:fs/promises';

import type z from 'zod';

import { ConfigNotFoundError, ConfigParseError, ConfigValidationError } from './errors.js';
import { CodemodConfigSchema, type CodemodConfig } from './schemas.js';
import { tryCatch, tryCatchAsync } from '../utils/results.js';

export async function loadCodemodConfig(configPath: string): Promise<CodemodConfig>;
export async function loadCodemodConfig<Schema extends z.ZodType<CodemodConfig>>(
  configPath: string,
  schema: Schema,
): Promise<z.infer<Schema>>;
export async function loadCodemodConfig(
  configPath: string,
  schema: z.ZodType<CodemodConfig> = CodemodConfigSchema,
): Promise<CodemodConfig> {
  const readResult = await tryCatchAsync(() => fs.readFile(configPath, { encoding: 'utf-8' }));
  if (readResult.isErr()) throw new ConfigNotFoundError(configPath, { cause: readResult.error });

  const parsedResult = tryCatch(() => JSON.parse(readResult.value));
  if (parsedResult.isErr()) throw new ConfigParseError(configPath, { cause: parsedResult.error });

  const validated = await schema.safeParseAsync(parsedResult.value);
  if (!validated.success) throw new ConfigValidationError(configPath, validated.error);

  return validated.data;
}
