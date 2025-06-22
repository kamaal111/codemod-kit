export type Optional<T> = T | undefined | null;

export type ReplaceObjectProperty<A extends Record<string, unknown>, K extends keyof A, B> = Omit<A, K> & {
  [P in K]: B;
};
