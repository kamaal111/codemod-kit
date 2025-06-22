type AnyCollection = Array<unknown> | Set<unknown>;

function getCollectionCount<T extends AnyCollection>(collection: T): number {
  if (Array.isArray(collection)) return collection.length;
  return collection.size;
}

export function collectionIsEmpty<T extends AnyCollection>(collection: T): boolean {
  return getCollectionCount(collection) === 0;
}
