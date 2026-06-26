import axios from "axios";
import { IManifestCountry } from "../domain.layer/interfaces/i.regulationsTracker";

export const FEED_ORIGIN = "https://verifywise.ai";
export const MANIFEST_URL = `${FEED_ORIGIN}/api/regulations`;
export const EXPECTED_FEED_VERSION = 1;
export const ABSOLUTE_FLOOR = 20;

const REQUIRED_KEYS: (keyof IManifestCountry)[] = ["slug", "name", "region", "hash"];

function hasRequired(c: any): c is IManifestCountry {
  return c && typeof c === "object" && REQUIRED_KEYS.every((k) => c[k] !== undefined && c[k] !== null);
}

function normalizeSlug(s: string): string {
  return String(s).trim().toLowerCase();
}

export type ValidateResult =
  | { ok: true; countries: IManifestCountry[]; presentSlugs: string[]; rawCount: number; generatedAt: string }
  | { ok: false; reason: string };

export function validateManifest(raw: unknown, lastGoodCount: number | null): ValidateResult {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "feed is not an object" };
  const f = raw as Record<string, unknown>;
  if (f.feedVersion !== EXPECTED_FEED_VERSION)
    return { ok: false, reason: `unsupported feedVersion ${String(f.feedVersion)}` };
  if (!Array.isArray(f.countries)) return { ok: false, reason: "countries is not an array" };
  const counts = (f.counts as Record<string, unknown>) ?? {};
  if (typeof counts.countries === "number" && counts.countries !== f.countries.length)
    return { ok: false, reason: `counts.countries (${counts.countries}) != length (${f.countries.length})` };
  if (f.countries.length < ABSOLUTE_FLOOR)
    return { ok: false, reason: `below absolute floor (${f.countries.length})` };
  if (lastGoodCount != null && f.countries.length < lastGoodCount * 0.5)
    return { ok: false, reason: `below 50% of last good count (${f.countries.length} < ${lastGoodCount})` };

  const countries = (f.countries as unknown[]).filter(hasRequired) as IManifestCountry[];
  const presentSlugs = (f.countries as unknown[])
    .map((c) =>
      c && typeof c === "object" && typeof (c as Record<string, unknown>).slug === "string"
        ? normalizeSlug((c as Record<string, unknown>).slug as string)
        : null,
    )
    .filter((s): s is string => !!s);
  return {
    ok: true,
    countries,
    presentSlugs,
    rawCount: f.countries.length,
    generatedAt: typeof f.generatedAt === "string" ? f.generatedAt : new Date().toISOString(),
  };
}

export async function fetchManifest(deps?: {
  get?: (url: string) => Promise<{ status: number; data: unknown }>;
}): Promise<unknown> {
  const get = deps?.get ?? ((url: string) => axios.get(url, { timeout: 20000 }));
  const res = await get(MANIFEST_URL);
  if (res.status !== 200) throw new Error(`manifest HTTP ${res.status}`);
  return res.data;
}

export async function fetchCountryDetail(
  slug: string,
  deps?: { get?: (url: string) => Promise<{ status: number; data: unknown }> },
): Promise<unknown> {
  const get = deps?.get ?? ((url: string) => axios.get(url, { timeout: 10000 }));
  const res = await get(`${FEED_ORIGIN}/api/regulations/country/${encodeURIComponent(slug)}`);
  if (res.status !== 200) throw new Error(`country detail HTTP ${res.status}`);
  return res.data;
}
