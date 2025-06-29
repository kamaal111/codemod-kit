export function groupBy<T, K extends keyof T>(array: Array<T>, key: K): Record<string, Array<T>> {
  const arrayCopy = [...array];
  return arrayCopy.reduce<Record<string, Array<T>>>((acc, current) => {
    const keyValue = String(current[key]);
    if (acc[keyValue] == null) {
      acc[keyValue] = [current];
    } else {
      acc[keyValue].push(current);
    }

    return acc;
  }, {});
}
