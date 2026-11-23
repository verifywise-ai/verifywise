/**
 * A memory of answers that a process keeps for a while, so that the catalog of known exploited
 * vulnerabilities (1.8 MB, one file for every vendor) is not fetched again for each run. A call
 * that asks for a key that is being loaded shares that load. A load that fails is forgotten at
 * once: the next call tries again.
 */
export interface Memo<T> {
  get(key: string, load: () => Promise<T>): Promise<T>;
}

export function createMemo<T>(
  ttlMs: number,
  maxEntries = 64,
  now: () => number = Date.now,
): Memo<T> {
  const entries = new Map<string, { promise: Promise<T>; expiresAt: number }>();
  return {
    get(key, load) {
      const held = entries.get(key);
      if (held !== undefined && held.expiresAt > now()) return held.promise;
      const promise = load();
      entries.delete(key);
      entries.set(key, { promise, expiresAt: now() + ttlMs });
      promise.catch(() => {
        if (entries.get(key)?.promise === promise) entries.delete(key);
      });
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
      return promise;
    },
  };
}
