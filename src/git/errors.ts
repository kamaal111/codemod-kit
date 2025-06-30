import type { types } from '@kamaalio/kamaal';

import type Repository from './repository.js';

export class GitError extends Error {
  readonly cause: types.Optional<unknown>;
  readonly repository: Repository;

  constructor(message: string, repository: Repository, options?: { cause: unknown }) {
    super(message);

    this.repository = repository;
    this.cause = options?.cause;
  }
}

export class CloneError extends GitError {
  constructor(repository: Repository) {
    super(`Git clone failed for ${repository.address}`, repository);
  }
}

export class CheckoutError extends GitError {
  constructor(repository: Repository, branchName: string) {
    super(`Git checkout failed for ${repository.address}, couldn't checkout to ${branchName}`, repository);
  }
}

export class GetMainBranchError extends GitError {
  constructor(repository: Repository, options?: { cause: unknown }) {
    super(`Failed to get main branch for ${repository.address}`, repository, options);
  }
}

export class PushError extends GitError {
  constructor(repository: Repository, message: string, options?: { cause: unknown }) {
    super(`Git push failed for ${repository.address}; message: ${message}`, repository, options);
  }
}

export class RebaseError extends GitError {
  constructor(repository: Repository, options?: { cause: unknown }) {
    super(`Git rebase failed for ${repository.address}`, repository, options);
  }
}
