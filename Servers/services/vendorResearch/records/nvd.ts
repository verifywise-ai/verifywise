/**
 * The National Vulnerability Database (NVD): the public list of vulnerabilities (CVE) with their
 * scores. The API needs no key (5 requests in 30 seconds without one). The records here are the
 * critical ones (CVSS 9.0 and above) published in the last 120 days, for the products of one CPE
 * vendor: the vendor part of a CPE name (`cpe:2.3:a:fortinet:...`) is matched whole by the API, so
 * a vendor that is not the one the token names finds nothing. The NVD is a work of the United
 * States government and free to use.
 */
import { cleanText } from "../text";
import { cvePageOf } from "./kev";
import { joinSentences, sentence } from "./sentence";
import { MAX_RECORDS, type SourceRecord } from "./types";

export const NVD_MAX_BYTES = 2 * 1024 * 1024;
/** The API refuses a window longer than 120 days. */
const WINDOW_DAYS = 119;
const MAX_DESCRIPTION_CHARS = 1200;
const CRITICAL = 9;

const dayOf = (date: Date): string => date.toISOString().slice(0, 10);

/** The first day a lookup asks for: 119 days back, or the cutoff when that is later. */
export function nvdWindowStart(now: Date, cutoff?: string): string {
  const back = dayOf(new Date(now.getTime() - WINDOW_DAYS * 86_400_000));
  return cutoff !== undefined && cutoff > back ? cutoff : back;
}

export function nvdUrl(token: string, now: Date, cutoff?: string): string {
  const query = new URLSearchParams({
    virtualMatchString: `cpe:2.3:a:${token}`,
    cvssV3Severity: "CRITICAL",
    pubStartDate: `${nvdWindowStart(now, cutoff)}T00:00:00.000`,
    pubEndDate: `${dayOf(now)}T23:59:59.999`,
    resultsPerPage: "50",
  });
  return `https://services.nvd.nist.gov/rest/json/cves/2.0?${query.toString()}`;
}

export interface Cve {
  id: string;
  /** YYYY-MM-DD */
  published: string;
  score: number;
  severity: string;
  description: string;
  /** A CVE the NVD rejected (`vulnStatus` "Rejected"); absent for any other status. */
  status?: "rejected";
}

const CVE_ID = /^CVE-\d{4}-\d{4,}$/;
const DAY = /^\d{4}-\d{2}-\d{2}/;

/** The highest CVSS score among the metrics of a CVE, with its severity; null when it has none. */
function topScore(metrics: unknown): { score: number; severity: string } | null {
  if (typeof metrics !== "object" || metrics === null) return null;
  let top: { score: number; severity: string } | null = null;
  for (const list of Object.values(metrics)) {
    if (!Array.isArray(list)) continue;
    for (const metric of list) {
      const data = (metric as { cvssData?: { baseScore?: unknown; baseSeverity?: unknown } })
        ?.cvssData;
      const score = data?.baseScore;
      if (typeof score !== "number" || !Number.isFinite(score)) continue;
      if (top === null || score > top.score) {
        top = { score, severity: typeof data?.baseSeverity === "string" ? data.baseSeverity : "" };
      }
    }
  }
  return top;
}

/** The critical CVEs of an answer of the API, with the NVD's rejection of one. */
export function parseNvd(body: unknown): Cve[] {
  const list = (body as { vulnerabilities?: unknown } | null)?.vulnerabilities;
  if (!Array.isArray(list)) return [];
  const cves: Cve[] = [];
  for (const item of list) {
    const cve = (item as { cve?: Record<string, unknown> } | null)?.cve;
    if (typeof cve !== "object" || cve === null) continue;
    const id = typeof cve.id === "string" ? cve.id : "";
    const published = typeof cve.published === "string" ? cve.published.slice(0, 10) : "";
    if (!CVE_ID.test(id) || !DAY.test(published)) continue;
    const top = topScore(cve.metrics);
    if (top === null || top.score < CRITICAL) continue;
    const english = Array.isArray(cve.descriptions)
      ? cve.descriptions.find((entry) => (entry as { lang?: unknown } | null)?.lang === "en")
      : undefined;
    const value = (english as { value?: unknown } | undefined)?.value;
    cves.push({
      id,
      published,
      score: top.score,
      severity: top.severity,
      description: typeof value === "string" ? cleanText(value).replace(/\s+/g, " ").trim() : "",
      ...(cve.vulnStatus === "Rejected" ? { status: "rejected" as const } : {}),
    });
  }
  return cves;
}

/** A CVE as a source: its page, its name, and its text in the NVD's words. */
export function nvdSourceOf(cve: Cve): SourceRecord {
  const text = joinSentences([
    "National Vulnerability Database (nvd.nist.gov).",
    sentence("CVE", cve.id),
    sentence("Published", cve.published),
    sentence(
      "CVSS base score",
      `${cve.score.toFixed(1)}${cve.severity === "" ? "" : ` (${cve.severity})`}`,
    ),
    sentence("Description", cve.description.slice(0, MAX_DESCRIPTION_CHARS)),
  ]);
  return {
    url: cvePageOf(cve.id),
    title: `${cve.id}: critical vulnerability (CVSS ${cve.score.toFixed(1)})`,
    text,
    publishedAt: cve.published,
  };
}

/**
 * The critical CVEs as sources: those published since `cutoff`, the highest score first, then the
 * newest, at most MAX_RECORDS.nvd of them. What was left out is counted.
 */
export function nvdRecords(
  cves: readonly Cve[],
  input: { cutoff?: string },
): { records: SourceRecord[]; omitted: { old?: number; more?: number } } {
  const recent = cves.filter((cve) => input.cutoff === undefined || cve.published >= input.cutoff);
  recent.sort(
    (a, b) =>
      b.score - a.score ||
      b.published.localeCompare(a.published) ||
      b.id.localeCompare(a.id, "en", { numeric: true }),
  );
  const kept = recent.slice(0, MAX_RECORDS.nvd);
  const old = cves.length - recent.length;
  const more = recent.length - kept.length;
  return {
    records: kept.map(nvdSourceOf),
    omitted: { ...(old > 0 ? { old } : {}), ...(more > 0 ? { more } : {}) },
  };
}
