function shallowCopy<T>(array: Array<T>): Array<T> {
  return [...array];
}

export function groupBy<T, K extends keyof T>(array: Array<T>, key: K): Record<string, Array<T>> {
  return shallowCopy(array).reduce<Record<string, Array<T>>>((acc, current) => {
    const keyValue = String(current[key]);
    if (acc[keyValue] == null) {
      acc[keyValue] = [current];
    } else {
      acc[keyValue].push(current);
    }

    return acc;
  }, {});
}

export function groupByFlat<T, K extends keyof T>(array: Array<T>, key: K): Record<string, T> {
  return shallowCopy(array).reduce<Record<string, T>>((acc, current) => {
    const keyValue = String(current[key]);
    acc[keyValue] = current;

    return acc;
  }, {});
}
