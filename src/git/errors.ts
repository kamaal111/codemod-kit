import type { types } from '@kamaalio/kamaal';

import type Repository from './repository.js';

export class GitError<Tag = string> extends Error {
  readonly cause: types.Optional<unknown>;
  readonly repository: Repository<Tag>;

  constructor(message: string, repository: Repository<Tag>, options?: { cause: unknown }) {
    super(message);

    this.repository = repository;
    this.cause = options?.cause;
  }
}

export class CloneError<Tag = string> extends GitError<Tag> {
  constructor(repository: Repository<Tag>) {
    super(`Git clone failed for ${repository.address}`, repository);
  }
}

export class CheckoutError<Tag = string> extends GitError<Tag> {
  constructor(repository: Repository<Tag>, branchName: string) {
    super(`Git checkout failed for ${repository.address}, couldn't checkout to ${branchName}`, repository);
  }
}

export class GetMainBranchError<Tag = string> extends GitError<Tag> {
  constructor(repository: Repository<Tag>, options?: { cause: unknown }) {
    super(`Failed to get main branch for ${repository.address}`, repository, options);
  }
}

export class PushError<Tag = string> extends GitError<Tag> {
  constructor(repository: Repository<Tag>, message: string, options?: { cause: unknown }) {
    super(`Git push failed for ${repository.address}; message: ${message}`, repository, options);
  }
}

export class RebaseError<Tag = string> extends GitError<Tag> {
  constructor(repository: Repository<Tag>, options?: { cause: unknown }) {
    super(`Git rebase failed for ${repository.address}`, repository, options);
  }
}
