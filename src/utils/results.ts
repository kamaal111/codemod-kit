import { err, ok, ResultAsync, type Result } from 'neverthrow';

export function tryCatch<T>(callback: () => T): Result<T, unknown> {
  try {
    return ok(callback());
  } catch (error) {
    return err(error);
  }
}

export function tryCatchAsync<T>(callback: () => Promise<T>): ResultAsync<T, unknown> {
  return ResultAsync.fromPromise(callback(), e => e);
}

export function groupResults<S, E>(results: Array<Result<S, E>>): { success: Array<S>; failure: Array<E> } {
  return results.reduce<{
    success: Array<S>;
    failure: Array<E>;
  }>(
    (acc, result) => {
      if (result.isErr()) return { ...acc, failure: [...acc.failure, result.error] };
      return { ...acc, success: [...acc.success, result.value] };
    },
    { success: [], failure: [] },
  );
}
