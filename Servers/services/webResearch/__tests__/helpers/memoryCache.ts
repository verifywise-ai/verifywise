import type { CacheKind, WebCache } from "../../webCache";

/**
 * A web cache that lives in memory and remembers what it was asked, for the tests of what sits in
 * front of it. Nothing expires: a test that needs an entry to be gone deletes it from `store`.
 */
export function memoryCache() {
  const store = new Map<string, string>();
  const reads: Array<{ kind: CacheKind; key: string }> = [];
  const writes: Array<{ kind: CacheKind; key: string; value: string }> = [];
  const cache: WebCache = {
    async get(kind, key) {
      reads.push({ kind, key });
      return store.get(`${kind}\n${key}`) ?? null;
    },
    async set(kind, key, value) {
      writes.push({ kind, key, value });
      store.set(`${kind}\n${key}`, value);
    },
  };
  return {
    cache,
    store,
    reads,
    writes,
    /** Puts an entry in as an earlier run would have. */
    seed(kind: CacheKind, key: string, value: string) {
      store.set(`${kind}\n${key}`, value);
    },
  };
}

/** Lets the writes that a decorator does not wait for finish. */
export async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}
