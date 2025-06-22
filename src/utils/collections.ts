export function getCollectionCount<T extends Array<unknown> | Set<unknown>>(collection: T): number {
  if (Array.isArray(collection)) return collection.length;
  return collection.size;
}
