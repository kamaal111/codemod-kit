import type { types } from '@kamaalio/kamaal';

export class CodemodError extends Error {
  readonly cause: types.Optional<unknown>;

  constructor(message: string, options?: { cause: unknown }) {
    super(message);

    this.cause = options?.cause;
  }
}

export class CodemodTargetNotFoundError extends CodemodError {
  constructor(targetPath: string, options?: { cause: unknown }) {
    super(`No file or directory found at '${targetPath}'`, options);
  }
}
