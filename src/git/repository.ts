import path from 'node:path';

import { $ } from 'execa';
import { err, ok, type ResultAsync, type Result } from 'neverthrow';
import { arrays, type types } from '@kamaalio/kamaal';

import { CheckoutError, CloneError, GetMainBranchError, GitError, PushError, RebaseError } from './errors.js';
import Branch from './branch.js';
import { DefaultBranchRefSchema } from './schemas.js';
import { tryCatch, tryCatchAsync } from '../utils/results.js';

interface IRepository {
  name: string;
  address: string;
  path: string;
}

class Repository implements IRepository {
  readonly name: string;
  readonly address: string;
  readonly path: string;

  private currentBranch: types.Optional<Branch>;

  private constructor(params: IRepository) {
    this.name = params.name;
    this.address = params.address;
    this.path = params.path;
  }

  clone = async (): Promise<Result<void, GitError>> => {
    const cwd = this.path.split('/').slice(0, -1).join('/');
    const exec = $({ cwd });
    const cloneResult = await exec`git clone ${this.address}`;
    if (cloneResult.code != null && cloneResult.code !== '0') {
      return err(new CloneError(this));
    }

    return ok();
  };

  commit = async (message: string) => {
    await this.exec`git add .`;
    await tryCatchAsync(() => this.exec`git commit -m ${message} --no-verify`);
  };

  push = async (): Promise<Result<void, GitError>> => {
    const [remoteName, currentBranch, mainBranchNameResult] = await Promise.all([
      this.getRemoteName(),
      this.getCurrentBranch(),
      this.getMainBranchName(),
    ]);
    if (remoteName == null || currentBranch == null) return err(new PushError(this, 'Failed to find remote name'));
    if (mainBranchNameResult.isErr()) return err(mainBranchNameResult.error);
    if (mainBranchNameResult.value === currentBranch.name) {
      return err(new PushError(this, "Can't push to main branch"));
    }

    await this.exec`git add .`;
    await this.exec`git push --force --no-verify --set-upstream ${remoteName} ${currentBranch.name}`;

    return ok();
  };

  resetBranch = async (workingBranchName: string): Promise<Result<void, GitError>> => {
    await this.exec`git add .`;
    await this.exec`git reset --hard`;
    await this.exec`git fetch`;

    return this.updateBranchToLatestMain(workingBranchName);
  };

  updateBranchToLatestMain = async (workingBranchName: string): Promise<Result<void, GitError>> => {
    const [remoteName, mainBranchNameResult] = await Promise.all([this.getRemoteName(), this.getMainBranchName()]);
    if (mainBranchNameResult.isErr()) return err(new RebaseError(this, { cause: mainBranchNameResult.error }));
    if (remoteName == null) return err(new RebaseError(this));

    const remoteBranches = await this.getRemoteBranches();
    const existsInRemote = remoteBranches.some(branch => branch.name === workingBranchName);
    const checkoutWorkingBranchResult = await this.checkoutBranch(workingBranchName);
    if (checkoutWorkingBranchResult.isErr()) return err(checkoutWorkingBranchResult.error);

    const rebaseResult = await tryCatchAsync(() => this.exec`git rebase ${remoteName}/${mainBranchNameResult.value}`);
    if (rebaseResult.isErr() || !existsInRemote) {
      if (workingBranchName === mainBranchNameResult.value) {
        return err(new GitError('Checked out branch is main branch', this));
      }

      const checkoutResult = await this.checkoutBranch(mainBranchNameResult.value);
      if (checkoutResult.isErr()) return err(checkoutResult.error);

      await this.deleteBranch(workingBranchName);
      const checkoutWorkingBranchResult = await this.checkoutBranch(workingBranchName, { forceCreateNew: true });
      if (checkoutWorkingBranchResult.isErr()) return err(checkoutWorkingBranchResult.error);

      const currentBranch = await this.getCurrentBranch();
      if (currentBranch == null) return err(new GitError('Failed to find current branch', this));
      if (currentBranch.name === mainBranchNameResult.value) {
        return err(new GitError('Checked out branch is main branch', this));
      }
    }

    return ok();
  };

  deleteBranch = (branchName: string): ResultAsync<unknown, unknown> => {
    return tryCatchAsync(() => this.exec`git branch -D ${branchName}`);
  };

  prepareForUpdate = async (workingBranchName: string): Promise<Result<Repository, GitError>> => {
    const checkoutBranchResult = await this.checkoutBranch(workingBranchName);
    if (checkoutBranchResult.isErr()) return err(checkoutBranchResult.error);

    const resetBranchResult = await this.resetBranch(workingBranchName);
    if (resetBranchResult.isErr()) return err(resetBranchResult.error);

    return ok(this);
  };

  getMainBranch = async (): Promise<Result<Branch, GitError>> => {
    const [branches, mainBranchNameResult] = await Promise.all([this.getBranches(), this.getMainBranchName()]);
    if (mainBranchNameResult.isErr()) return err(mainBranchNameResult.error);

    const mainBranch = branches.find(branch => branch.name === mainBranchNameResult.value);
    if (mainBranch == null) return err(new GetMainBranchError(this));

    return ok(mainBranch);
  };

  getRemoteName = async (): Promise<types.Optional<string>> => {
    const remoteResult = await this.exec`git remote`;

    return remoteResult.stdout.split('\n')[0];
  };

  checkoutBranch = async (
    branchName: string,
    options?: { forceCreateNew: boolean },
  ): Promise<Result<Branch, GitError>> => {
    const currentBranch = await this.getCurrentBranch();
    const forceCreateNew = options?.forceCreateNew ?? false;
    if (currentBranch != null && currentBranch.name === branchName && !forceCreateNew) {
      return ok(currentBranch);
    }

    const branches = await this.getBranches();
    const existingBranch = branches.find(branch => branch.name === branchName);
    if (existingBranch != null && !forceCreateNew) {
      const checkoutResult = await this.exec`git checkout ${branchName}`;
      if (checkoutResult.code != null && checkoutResult.code !== '0') {
        return err(new CheckoutError(this, branchName));
      }

      return ok(existingBranch);
    }

    const checkoutResult = await this.exec`git checkout -b ${branchName}`;
    if (checkoutResult.code != null && checkoutResult.code !== '0') {
      return err(new CheckoutError(this, branchName));
    }

    const branch = new Branch({ name: branchName, isSelected: true });
    this.setCurrentBranch(branch);

    return ok(branch);
  };

  getSelectedBranch = async (): Promise<types.Optional<Branch>> => {
    const currentBranch = await this.getCurrentBranch();
    if (currentBranch != null) return currentBranch;

    const branches = await this.getBranches();
    const branch = branches.find(branch => branch.isSelected);
    if (branch == null) return null;

    this.setCurrentBranch(branch);

    return branch;
  };

  getRemoteBranches = async (): Promise<Array<Branch>> => {
    const remoteHeadsResult = await this.exec`git ls-remote --heads`;

    return arrays.compactMap(remoteHeadsResult.stdout.split('\n'), line => {
      const isValid = line.includes('refs/heads/');
      if (!isValid) return null;

      const name = line.trim().split('refs/heads/')[1];
      if (!name) return null;

      return new Branch({ name, isSelected: false });
    });
  };

  getBranches = async (): Promise<Array<Branch>> => {
    const branchResult = await this.exec`git branch`;

    return branchResult.stdout.split('\n').map(branch => {
      const name = branch.split('*').join('').trim();
      const isSelected = branch.startsWith('*');

      return new Branch({ name, isSelected });
    });
  };

  private get exec() {
    return $({ cwd: this.path });
  }

  private getCurrentBranch = async (): Promise<types.Optional<Branch>> => {
    if (this.currentBranch != null) return this.currentBranch;

    const branches = await this.getBranches();

    return branches.find(branch => branch.isSelected);
  };

  private setCurrentBranch = (branch: Branch) => {
    this.currentBranch = branch;
  };

  private getMainBranchName = async (): Promise<Result<string, GitError>> => {
    const rawDefaultBranchRefResult = await this.exec`gh repo view --json defaultBranchRef`;
    if (rawDefaultBranchRefResult.code != null && rawDefaultBranchRefResult.code !== '0') {
      return err(new GetMainBranchError(this));
    }

    const parsedStdoutResult = tryCatch(() => JSON.parse(rawDefaultBranchRefResult.stdout)).mapErr(
      e => new GetMainBranchError(this, { cause: e }),
    );
    if (parsedStdoutResult.isErr()) return err(parsedStdoutResult.error);

    const defaultBranchRef = await DefaultBranchRefSchema.safeParseAsync(parsedStdoutResult.value);
    if (defaultBranchRef.error) return err(new GetMainBranchError(this, { cause: defaultBranchRef.error }));

    return ok(defaultBranchRef.data.defaultBranchRef.name);
  };

  static fromAddressAndCwd = ({ address, cwd }: { address: string; cwd: string }): types.Optional<Repository> => {
    const name = Repository.getRepoNameFromRepoAddress(address);
    if (name == null) return null;

    return new Repository({ name, address, path: path.resolve(cwd, name) });
  };

  private static getRepoNameFromRepoAddress = (repoAddress: string): types.Optional<string> => {
    const repoAddressComponents = repoAddress.split('/');

    return repoAddressComponents[repoAddressComponents.length - 1]?.split('.').slice(0, -1).join('.');
  };
}

export default Repository;
