import { $, type ExecaScriptMethod } from 'execa';
import { ok, type Result } from 'neverthrow';
import { arrays } from '@kamaalio/kamaal';

import { CloneError } from './errors.js';
import Repository from './repository.js';

type DedupeResult<Tag> = {
  result: Array<Repository<Tag>>;
  names: Array<string>;
};

export async function cloneRepositories<Tag = string>(
  repositories: Array<{ address: string; tags: Array<Tag> | Set<Tag> }>,
  location: string,
): Promise<Array<Repository<Tag>>> {
  await $`mkdir -p ${location}`;
  const exec = $({ cwd: location });
  const dedupedRepos = dedupeRepositoriesToClone(repositories, location);
  const existingRepositories = await getExistingRepositories(exec, repositories);
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

async function getExistingRepositories<Tag>(
  exec: ExecaScriptMethod<{ cwd: string }>,
  repositories: Array<{ address: string; tags: Array<Tag> | Set<Tag> }>,
): Promise<Array<Repository<Tag>>> {
  const lsResult = await exec`ls`;
  const existingNames = new Set(lsResult.stdout.split('\n'));

  return arrays.compactMap(repositories, repo => {
    const repository = Repository.fromAddressAndCwd({ address: repo.address, cwd: lsResult.cwd, tags: repo.tags });
    if (repository == null) return null;
    if (!existingNames.has(repository.name)) return null;
    return repository;
  });
}

function cloneRepositoryInternal<Tag>(
  existingRepositories: Array<Repository<Tag>>,
): (repository: Repository<Tag>) => Promise<Result<void, CloneError<Tag>>> {
  const existingRepositoryAddresses = new Set(existingRepositories.map(repo => repo.address));

  return async repository => {
    if (existingRepositoryAddresses.has(repository.address)) return ok();
    return repository.clone();
  };
}

function dedupeRepositoriesToClone<Tag>(
  repositories: Array<{ address: string; tags: Array<Tag> | Set<Tag> }>,
  cwd: string,
): Array<Repository<Tag>> {
  const initialDedupeResult: DedupeResult<Tag> = { result: [], names: [] };
  const dedupedRepos = repositories.reduce<DedupeResult<Tag>>((acc, repo) => {
    const repository = Repository.fromAddressAndCwd({ address: repo.address, cwd, tags: repo.tags });
    if (repository == null) return acc;
    if (acc.names.includes(repository.name)) return acc;

    return { result: [...acc.result, repository], names: [...acc.names, repository.name] };
  }, initialDedupeResult).result;

  return dedupedRepos;
}
