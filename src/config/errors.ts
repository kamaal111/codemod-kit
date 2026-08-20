import type { types } from '@kamaalio/kamaal';
import { prettifyError, type z } from 'zod';

export class ConfigError extends Error {
  readonly cause: types.Optional<unknown>;

  constructor(message: string, options?: { cause: unknown }) {
    super(message);

    this.cause = options?.cause;
  }
}

export class ConfigNotFoundError extends ConfigError {
  constructor(configPath: string, options?: { cause: unknown }) {
    super(`No config file found at '${configPath}'. Check that the path is correct.`, options);
  }
}

export class ConfigParseError extends ConfigError {
  constructor(configPath: string, options?: { cause: unknown }) {
    const reason = options?.cause instanceof Error ? options.cause.message : String(options?.cause);
    super(`Config file at '${configPath}' is not valid JSON: ${reason}`, options);
  }
}

export class ConfigValidationError extends ConfigError {
  constructor(configPath: string, zodError: z.ZodError, options?: { cause: unknown }) {
    super(`Config file at '${configPath}' failed schema validation:\n${prettifyError(zodError)}`, options);
  }
}
