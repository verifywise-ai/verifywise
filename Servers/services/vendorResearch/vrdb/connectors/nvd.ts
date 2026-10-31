/**
 * The National Vulnerability Database as a read-through source of the vendor risk database (M2,
 * spec D2.7, Rulings 2 and 3 of the M2 plan). The vendor is asked by its CPE vendor token
 * (records/match.ts `cpeVendorOf`), a strong key; the query is the per-run lookup's (the critical
 * CVEs of the last 119 days, records/nvd.ts) without the run's cutoff, so that one answer serves
 * every run of the key, and the lookback applies when its records are offered. A CVE the NVD
 * rejected is stored rejected, which keeps the same CVE from being offered by any list.
 */
import { cpeVendorOf } from "../../records/match";
import {
  NVD_MAX_BYTES,
  type Cve,
  nvdSourceOf,
  nvdUrl,
  nvdWindowStart,
  parseNvd,
} from "../../records/nvd";
import { cpeKey } from "../keys";
import type { ParsedRecord } from "../types";
import type { ReadThroughConnector } from "./types";

const CPE_PREFIX = "cpe:";

function recordOf(cve: Cve, token: string): ParsedRecord {
  const { url, title, text } = nvdSourceOf(cve);
  return {
    sourceRecordId: cve.id,
    recordType: "vulnerability",
    title,
    summary: text,
    url,
    identifiers: { cveID: cve.id, cpeVendor: token },
    matchKeys: [cpeKey(token)],
    publishedAt: cve.published,
    sourceUpdatedAt: null,
    ...(cve.status === undefined ? {} : { status: cve.status }),
  };
}

/**
 * The records of an answer of the API, as the copy keeps them: what `fetch` stores for the token,
 * and what a case of the evaluation is built from (eval/cases/).
 */
export const nvdRecordsOf = (body: unknown, token: string): ParsedRecord[] =>
  parseNvd(body).map((cve) => recordOf(cve, token));

/**
 * True when an answer holds every CVE the query found: its total fits the CVEs it gives (one page
 * holds 50). Only such an answer tells that a stored CVE it lacks has left the window's critical
 * CVEs of the vendor (M2 final review, Important 1).
 */
function isComplete(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const { totalResults, vulnerabilities } = body as {
    totalResults?: unknown;
    vulnerabilities?: unknown;
  };
  return (
    Array.isArray(vulnerabilities) &&
    typeof totalResults === "number" &&
    Number.isInteger(totalResults) &&
    totalResults >= 0 &&
    totalResults <= vulnerabilities.length
  );
}

export const nvdConnector: ReadThroughConnector = {
  id: "nvd",
  async keyOf(target) {
    const token = cpeVendorOf(target);
    return token === null ? null : { key: cpeKey(token), weak: false };
  },
  async fetch(key, { now, signal, fetchJson }) {
    if (!key.startsWith(CPE_PREFIX)) throw new Error("The NVD is asked by a CPE vendor token");
    const token = key.slice(CPE_PREFIX.length);
    const body = await fetchJson(nvdUrl(token, now), { maxBytes: NVD_MAX_BYTES, signal });
    return {
      records: nvdRecordsOf(body, token),
      coversSince: isComplete(body) ? nvdWindowStart(now) : null,
    };
  },
};
