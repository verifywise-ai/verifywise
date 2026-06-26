// Servers/utils/aiTrustIndexFeed.ts
import axios from "axios";
import { ITrustIndexAppData } from "../domain.layer/interfaces/i.aiTrustIndex";

export const FEED_URL = "https://verifywise.ai/ai-trust-index.json";
const ABSOLUTE_FLOOR = 10;
// feedVersion 2 is backward-compatible with 1 (adds a per-app `history` object;
// every v1 field is still present). Newer/unknown versions abort the run.
const SUPPORTED_FEED_VERSIONS = [1, 2];

const REQUIRED_KEYS: (keyof ITrustIndexAppData)[] = [
  "slug",
  "name",
  "category",
  "scoreOutOf100",
  "letterGrade",
  "displayedGrade",
  "dealbreakerFlags",
  "processesBiometrics",
];

function hasRequired(a: any): a is ITrustIndexAppData {
  return (
    a && typeof a === "object" && REQUIRED_KEYS.every((k) => a[k] !== undefined && a[k] !== null)
  );
}

export type ValidateResult =
  // `presentSlugs` is every normalized slug that appeared in the raw feed —
  // including apps that were dropped for a missing required field. Callers use
  // it so a transiently-malformed-but-present app is left untouched rather than
  // soft-deleted (which would send a false "no longer assessed" notification).
  // `rawCount` is the total number of apps in the raw feed (before the
  // required-field filter). It's stored as `last_good_count` so the weekly
  // floor check compares like-for-like against the raw feed length.
  | { ok: true; apps: ITrustIndexAppData[]; presentSlugs: string[]; rawCount: number }
  | { ok: false; reason: string };

export function validateFeed(raw: unknown, lastGoodCount: number | null): ValidateResult {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "feed is not an object" };
  const f = raw as Record<string, unknown>;
  if (typeof f.feedVersion !== "number" || !SUPPORTED_FEED_VERSIONS.includes(f.feedVersion))
    return { ok: false, reason: `unsupported feedVersion ${String(f.feedVersion)}` };
  if (!Array.isArray(f.apps)) return { ok: false, reason: "apps is not an array" };
  if (typeof f.count !== "number" || f.count !== f.apps.length)
    return { ok: false, reason: `count (${String(f.count)}) != apps.length (${f.apps.length})` };
  if (f.apps.length < ABSOLUTE_FLOOR)
    return { ok: false, reason: `below absolute floor (${f.apps.length})` };
  if (lastGoodCount != null && f.apps.length < lastGoodCount * 0.5)
    return {
      ok: false,
      reason: `below 50% of last good count (${f.apps.length} < ${lastGoodCount})`,
    };
  const apps = (f.apps as unknown[]).filter(hasRequired) as ITrustIndexAppData[];
  // Collect every present slug (normalized) regardless of whether the app passed
  // the required-field check, so dropped-but-present apps aren't treated as removed.
  const presentSlugs = (f.apps as unknown[])
    .map((a) =>
      a && typeof a === "object" && typeof (a as Record<string, unknown>).slug === "string"
        ? String((a as Record<string, unknown>).slug)
            .trim()
            .toLowerCase()
        : null,
    )
    .filter((s): s is string => !!s);
  return { ok: true, apps, presentSlugs, rawCount: f.apps.length };
}

export async function fetchFeed(deps?: {
  get?: (url: string) => Promise<{ status: number; data: unknown }>;
}): Promise<unknown> {
  const get = deps?.get ?? ((url: string) => axios.get(url, { timeout: 20000 }));
  const res = await get(FEED_URL);
  if (res.status !== 200) throw new Error(`feed HTTP ${res.status}`);
  return res.data;
}
