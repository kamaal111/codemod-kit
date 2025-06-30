import { $ } from 'execa';
import type { Result } from 'neverthrow';

import { groupResults, tryCatchAsync } from '../utils/results.js';
import type { Repository } from '../git/index.js';
import type { Codemod, CodemodRunnerCodemod } from '../codemods/index.js';

export async function makePullRequestsForCodemodResults<Tag = string, C extends Codemod = Codemod>(
  codemods: Array<CodemodRunnerCodemod<Tag, C>>,
  codemodResults: Record<string, Array<Result<{ hasChanges: boolean; content: string }, Error>>>,
  repositories: Array<Repository>,
) {
  for (const [codemodName, codemodResult] of Object.entries(codemodResults)) {
    const codemod = codemods.find(c => c.name === codemodName);
    if (codemod == null) throw new Error('Invariant found codemod should be present');

    await makePullRequestsForCodemodResult(codemod, codemodResult, repositories);
  }
}

export async function makePullRequestsForCodemodResult<Tag = string, C extends Codemod = Codemod>(
  codemod: CodemodRunnerCodemod<Tag, C>,
  codemodResult: Array<Result<{ hasChanges: boolean; content: string }, Error>>,
  repositories: Array<Repository>,
) {
  const { success } = groupResults(codemodResult);
  const hasChanges = success.some(result => result.hasChanges);
  if (!hasChanges) {
    console.log(`🐸 nothing transformed for '${codemod.name}'`);
    return;
  }

  await Promise.all(
    repositories.map(async repository => {
      await repository.commit(codemod.commitMessage);
      const pushResult = await repository.push();
      if (pushResult.isErr()) {
        console.error(`❌ Failed to push changes`, pushResult.error.message);
        return;
      }

      const pullRequestResult = await makePullRequest({
        workingDirectory: repository.path,
        title: codemod.commitMessage,
      });
      if (pullRequestResult.isErr()) {
        console.error(`✅ already pushed transformation for`, repository.address);
        return;
      }

      console.log(`✅ pull request created`, pullRequestResult.value.stdout);
    }),
  );
}

async function makePullRequest(params: { workingDirectory: string; title: string }) {
  return tryCatchAsync(() => $({ cwd: params.workingDirectory })`gh pr create --title ${params.title} --fill`);
}
