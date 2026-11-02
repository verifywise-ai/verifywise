/**
 * Cache of active syslog sources used by the listener to route lines.
 *
 * Every active row is loaded at most once per TTL (or right after
 * `invalidateSourceCache()`), never per line: the cross-organization query
 * behind it costs 1 + 2N statements. Concurrent callers share one in-flight
 * reload.
 */

import logger from "../../utils/logger/fileLogger";
import { listActiveSyslogSourcesQuery } from "../../utils/shadowAiConfig.utils";
import { normalizeIp } from "./ip";
import { hashSourceKey, orgIdFromKey } from "./sourceKey";
import type { ParserType } from "./types";

export interface CachedSource {
  configId: number;
  organizationId: number;
  parserType: ParserType;
  allowedIp: string | null;
  /** SHA-256 of the source key, or null for a source without a key yet. */
  keyHash: string | null;
}

export const SOURCE_CACHE_TTL_MS = 60_000;
// After a failed reload, keep serving the previous rows and retry this soon.
const RELOAD_RETRY_MS = 5_000;

const PARSER_TYPES: readonly ParserType[] = ["zscaler", "netskope", "squid", "generic_kv"];

let byHash = new Map<string, CachedSource>();
let byId = new Map<number, CachedSource>();
let byIp = new Map<string, CachedSource[]>();
let expiresAt = 0;
let generation = 0;
let inflight: Promise<void> | null = null;

async function reload(): Promise<void> {
  const startedGeneration = generation;
  try {
    const rows = await listActiveSyslogSourcesQuery();
    const nextHash = new Map<string, CachedSource>();
    const nextId = new Map<number, CachedSource>();
    const nextIp = new Map<string, CachedSource[]>();
    for (const row of rows) {
      if (!PARSER_TYPES.includes(row.parser_type as ParserType)) continue;
      const src: CachedSource = {
        configId: row.id,
        organizationId: row.organization_id,
        parserType: row.parser_type as ParserType,
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
    logger.error(
      `Shadow AI syslog source cache reload failed: ${(error as Error)?.message ?? "unknown error"}`,
    );
    expiresAt = Date.now() + RELOAD_RETRY_MS;
  }
}

async function ensureFresh(): Promise<void> {
  if (Date.now() < expiresAt) return;
  if (!inflight) {
    inflight = reload().finally(() => {
      inflight = null;
    });
  }
  await inflight;
}

/** Drop the cached sources so the next lookup reloads them. */
export function invalidateSourceCache(): void {
  generation++;
  expiresAt = 0;
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

export async function resolveByIp(ip: string): Promise<CachedSource | "ambiguous" | null> {
  const matches = await sourcesForIp(ip);
  if (matches.length === 0) return null;
  return matches.length === 1 ? matches[0] : "ambiguous";
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
