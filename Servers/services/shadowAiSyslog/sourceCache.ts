/**
 * Cache of active syslog sources used by the listener to route lines.
 *
 * Every active row is loaded at most once per TTL (or right after
 * `invalidateSourceCache()`), never per line. Concurrent callers share one
 * in-flight reload. A failed reload leaves no usable rows until a later one succeeds.
 */

import type { Transaction } from "sequelize";
import logger from "../../utils/logger/fileLogger";
import { listActiveSyslogSourcesQuery } from "../../utils/shadowAiConfig.utils";
import { normalizeIp } from "./ip";
import { hashSourceKey, orgIdFromKey } from "./sourceKey";
import { isParserType, type ParserType } from "./types";

export interface CachedSource {
  configId: number;
  organizationId: number;
  parserType: ParserType;
  allowedIp: string | null;
  /** SHA-256 of the source key, or null for a source without a key yet. */
  keyHash: string | null;
}

export const SOURCE_CACHE_TTL_MS = 60_000;
// After a failed reload, nothing is served; the next lookup after this retries.
const RELOAD_RETRY_MS = 5_000;

let byHash = new Map<string, CachedSource>();
let byId = new Map<number, CachedSource>();
let byIp = new Map<string, CachedSource[]>();
let expiresAt = 0;
let generation = 0;
// The reload in progress and the generation it started at.
let inflight: { generation: number; promise: Promise<void> } | null = null;

async function reload(): Promise<void> {
  const startedGeneration = generation;
  try {
    const rows = await listActiveSyslogSourcesQuery();
    const nextHash = new Map<string, CachedSource>();
    const nextId = new Map<number, CachedSource>();
    const nextIp = new Map<string, CachedSource[]>();
    for (const row of rows) {
      if (!isParserType(row.parser_type)) continue;
      const src: CachedSource = {
        configId: row.id,
        organizationId: row.organization_id,
        parserType: row.parser_type,
        allowedIp: row.source_identifier,
        keyHash: row.key_hash,
      };
      nextId.set(src.configId, src);
      if (src.keyHash) nextHash.set(src.keyHash, src);
      const ip = src.allowedIp ? normalizeIp(src.allowedIp) : null;
      if (ip) nextIp.set(ip, [...(nextIp.get(ip) ?? []), src]);
    }
    byHash = nextHash;
    byId = nextId;
    byIp = nextIp;
    // An invalidation during the reload may mean these rows are already old.
    expiresAt = generation === startedGeneration ? Date.now() + SOURCE_CACHE_TTL_MS : 0;
  } catch (error) {
    // Fail closed: rows this old may include revoked or re-keyed sources, so
    // nothing routes (and no waiting batch is written) until a reload succeeds.
    byHash = new Map();
    byId = new Map();
    byIp = new Map();
    logger.error(
      `Shadow AI syslog source cache reload failed, routing nothing until it succeeds: ${(error as Error)?.message ?? "unknown error"}`,
    );
    expiresAt = Date.now() + RELOAD_RETRY_MS;
  }
}

/**
 * Wait for rows loaded no earlier than the current generation. A reload that
 * started before an `invalidateSourceCache()` is not joined as the answer: it
 * is awaited (reloads never overlap, so an old one cannot overwrite a newer
 * one) and then a fresh reload runs, shared by every caller of that generation.
 */
async function ensureFresh(): Promise<void> {
  const wanted = generation;
  while (Date.now() >= expiresAt) {
    if (!inflight) {
      const entry = { generation, promise: Promise.resolve() };
      entry.promise = reload().finally(() => {
        if (inflight === entry) inflight = null;
      });
      inflight = entry;
    }
    const current = inflight;
    await current.promise;
    if (current.generation >= wanted) return;
  }
}

/** Drop the cached sources so the next lookup reloads them. */
export function invalidateSourceCache(): void {
  generation++;
  expiresAt = 0;
}

/**
 * Invalidate once a write is visible to other connections. Pass the
 * transaction the write ran in (with RLS enforcement, `req.rlsTransaction`,
 * committed only when the response finishes). Invalidating before the commit
 * would let a concurrent reload cache the old row, such as a revoked key, for
 * a full TTL. A rollback changed nothing, so it invalidates nothing. Without
 * a transaction the write is already committed and the cache is dropped now.
 */
export function invalidateSourceCacheAfterCommit(transaction?: Transaction | null): void {
  if (transaction) transaction.afterCommit(() => invalidateSourceCache());
  else invalidateSourceCache();
}

export async function resolveByKeyHash(hash: string): Promise<CachedSource | null> {
  await ensureFresh();
  return byHash.get(hash) ?? null;
}

/**
 * Resolve a full source key. A key whose embedded organization differs from
 * the row's organization never resolves.
 */
export async function resolveByKey(key: string): Promise<CachedSource | null> {
  const embeddedOrg = orgIdFromKey(key);
  if (embeddedOrg === null) return null;
  const src = await resolveByKeyHash(hashSourceKey(key));
  return src && src.organizationId === embeddedOrg ? src : null;
}

/** Every active source whose allowed sender IP equals `ip`. */
export async function sourcesForIp(ip: string): Promise<CachedSource[]> {
  const normalized = normalizeIp(ip);
  if (!normalized) return [];
  await ensureFresh();
  return byIp.get(normalized) ?? [];
}

/**
 * The current version of a source if it is still active with the same
 * organization and key; null once it was deleted, deactivated or re-keyed.
 */
export async function revalidateSource(src: CachedSource): Promise<CachedSource | null> {
  await ensureFresh();
  const current = byId.get(src.configId);
  if (!current) return null;
  if (current.organizationId !== src.organizationId || current.keyHash !== src.keyHash) {
    return null;
  }
  return current;
}
