type AnyCollection<Value = unknown> = Array<Value> | Set<Value>;

function getCollectionCount<T extends AnyCollection>(collection: T): number {
  if (Array.isArray(collection)) return collection.length;
  return collection.size;
}

export function collectionIsEmpty<T extends AnyCollection>(collection: T): boolean {
  return getCollectionCount(collection) === 0;
}

export function collectionContains<Value, T extends AnyCollection<Value>>(collection: T, value: Value): boolean {
  if (Array.isArray(collection)) return collection.includes(value);
  return collection.has(value);
}
