import { $, type ExecaScriptMethod } from 'execa';
import { ok, type Result } from 'neverthrow';
import { arrays, type types } from '@kamaalio/kamaal';

import { CloneError } from './errors.js';
import Repository from './repository.js';

type DedupeResult = {
  result: Array<Repository>;
  names: Array<string>;
};

export async function cloneRepositories(repoAddresses: Array<string>, location: string): Promise<Array<Repository>> {
  await $`mkdir -p ${location}`;
  const exec = $({ cwd: location });
  const dedupedRepos = dedupeRepositoriesToClone(repoAddresses, location);
  const existingRepositories = await getExistingRepositories(exec, repoAddresses);
  const results = await Promise.all(dedupedRepos.map(cloneRepositoryInternal(existingRepositories)));

  return arrays.compactMap(results, (result, index) => {
    const repo = dedupedRepos[index];
    if (result.isErr()) {
      console.error(result.error.message);
      return null;
    }

    return repo;
  });
}

export async function cloneRepository(repoAddress: string, location: string): Promise<types.Optional<Repository>> {
  const repositories = await cloneRepositories([repoAddress], location);

  return repositories[0];
}

async function getExistingRepositories(
  exec: ExecaScriptMethod<{ cwd: string }>,
  repoAddresses: Array<string>,
): Promise<Array<Repository>> {
  const lsResult = await exec`ls`;
  const existingNames = new Set(lsResult.stdout.split('\n'));

  return arrays.compactMap(repoAddresses, address => {
    const repository = Repository.fromAddressAndCwd({ address, cwd: lsResult.cwd });
    if (repository == null) return null;
    if (!existingNames.has(repository.name)) return null;
    return repository;
  });
}

function cloneRepositoryInternal(
  existingRepositories: Array<Repository>,
): (repository: Repository) => Promise<Result<void, CloneError>> {
  const existingRepositoryAddresses = new Set(existingRepositories.map(repo => repo.address));

  return async repository => {
    if (existingRepositoryAddresses.has(repository.address)) return ok();
    return repository.clone();
  };
}

function dedupeRepositoriesToClone(repoAddresses: Array<string>, cwd: string): Array<Repository> {
  const initialDedupeResult: DedupeResult = { result: [], names: [] };
  const dedupedRepos = repoAddresses.reduce<DedupeResult>((acc, repoAddress) => {
    const repository = Repository.fromAddressAndCwd({ address: repoAddress, cwd });
    if (repository == null) return acc;
    if (acc.names.includes(repository.name)) return acc;

    return { result: [...acc.result, repository], names: [...acc.names, repository.name] };
  }, initialDedupeResult).result;

  return dedupedRepos;
}
