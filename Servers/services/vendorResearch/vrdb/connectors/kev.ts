/**
 * The CISA catalog of known exploited vulnerabilities (KEV): one public JSON file, keyless, that
 * lists the vulnerabilities which CISA has evidence of being exploited in the wild. The catalog is
 * a work of the United States government and free to use (CC0 1.0).
 *
 * The parser and the text of a record live here, for the mirror (`kevConnector`) and for the
 * per-run lookup of records/kev.ts, which re-exports them. An entry names the vendor or project by
 * one string (`vendorProject`), its KEV key (vrdb/keys.ts), and it is the vendor's only when that
 * string is a name of the vendor.
 */
import { cleanText } from "../../text";
import { joinSentences, sentence } from "../../records/sentence";
import type { ParsedRecord } from "../types";
import { kevKey } from "../keys";
import { type Connector, bodyText } from "./types";

export const KEV_URL =
  "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";
/** The file is 1.8 MB today and grows by a tenth a year. */
export const KEV_MAX_BYTES = 8 * 1024 * 1024;
const KEV_TYPES = ["application/json"];
const KEV_TOTAL_TIMEOUT_MS = 60_000;

export interface KevEntry {
  cveID: string;
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  dateAdded: string;
  shortDescription: string;
  requiredAction: string;
  dueDate: string;
  knownRansomwareCampaignUse: string;
}

const CVE_ID = /^CVE-\d{4}-\d{4,}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const textOf = (value: unknown): string => (typeof value === "string" ? value : "");

/**
 * The entries of the catalog that can be used, and how many of its entries could not be: one
 * whose id is no CVE id, whose date is no day, or that names no vendor. Null when the body is not
 * the catalog (no list of vulnerabilities). Fields it does not know are left out.
 */
function readCatalog(body: unknown): { entries: KevEntry[]; errors: number } | null {
  if (typeof body !== "object" || body === null) return null;
  const list = (body as { vulnerabilities?: unknown }).vulnerabilities;
  if (!Array.isArray(list)) return null;
  const entries: KevEntry[] = [];
  let errors = 0;
  for (const item of list) {
    if (typeof item !== "object" || item === null) {
      errors += 1;
      continue;
    }
    const fields = item as Record<string, unknown>;
    const cveID = textOf(fields.cveID);
    const dateAdded = textOf(fields.dateAdded);
    const vendorProject = textOf(fields.vendorProject).trim();
    if (!CVE_ID.test(cveID) || !DAY.test(dateAdded) || vendorProject === "") {
      errors += 1;
      continue;
    }
    entries.push({
      cveID,
      vendorProject,
      product: textOf(fields.product),
      vulnerabilityName: textOf(fields.vulnerabilityName),
      dateAdded,
      shortDescription: textOf(fields.shortDescription),
      requiredAction: textOf(fields.requiredAction),
      dueDate: textOf(fields.dueDate),
      knownRansomwareCampaignUse: textOf(fields.knownRansomwareCampaignUse),
    });
  }
  return { entries, errors };
}

/** The entries of the catalog that can be used; anything else in the file is left out. */
export function parseKev(body: unknown): KevEntry[] {
  return readCatalog(body)?.entries ?? [];
}

/** The page of the CVE in the NVD, which also shows that the catalog lists it. */
export const cvePageOf = (cveID: string): string => `https://nvd.nist.gov/vuln/detail/${cveID}`;

/** An entry as a source: its NVD page, its name, and its text word for word the catalog's. */
export function kevSourceOf(entry: KevEntry): { url: string; title: string; text: string } {
  const text = joinSentences([
    "CISA Known Exploited Vulnerabilities Catalog (cisa.gov).",
    sentence("CVE", entry.cveID),
    sentence("Vendor or project", entry.vendorProject),
    sentence("Product", entry.product),
    sentence("Vulnerability name", entry.vulnerabilityName),
    sentence("Date added to the catalog", entry.dateAdded),
    sentence("Description", entry.shortDescription),
    sentence("Required action", entry.requiredAction),
    sentence("Due date", entry.dueDate),
    sentence("Known use in ransomware campaigns", entry.knownRansomwareCampaignUse),
  ]);
  const name = cleanText(entry.vulnerabilityName);
  return {
    url: cvePageOf(entry.cveID),
    title: name === "" ? entry.cveID : `${entry.cveID}: ${name}`,
    text,
  };
}

function recordOf(entry: KevEntry): ParsedRecord {
  const { url, title, text } = kevSourceOf(entry);
  return {
    sourceRecordId: entry.cveID,
    recordType: "vulnerability",
    title,
    summary: text,
    url,
    identifiers: {
      cveID: entry.cveID,
      vendorProject: entry.vendorProject,
      product: entry.product,
    },
    matchKeys: [kevKey(entry.vendorProject)],
    publishedAt: entry.dateAdded,
    sourceUpdatedAt: null,
  };
}

export const kevConnector: Connector = {
  id: "kev",
  version: 1,
  async download(fetch, validators) {
    const response = await fetch(KEV_URL, validators, {
      maxBytes: KEV_MAX_BYTES,
      allowedContentTypes: KEV_TYPES,
      totalTimeoutMs: KEV_TOTAL_TIMEOUT_MS,
    });
    if (response.notModified) return "unchanged";
    const body = bodyText(response);
    return {
      bodies: [body],
      etag: response.etag,
      lastModified: response.lastModified,
      bytes: response.body.length,
    };
  },
  parse(snapshot) {
    let body: unknown;
    try {
      body = JSON.parse(snapshot.bodies[0] ?? "");
    } catch {
      return { records: [], errors: 1, sourceVersion: null, root: null };
    }
    const catalog = readCatalog(body);
    if (catalog === null) return { records: [], errors: 1, sourceVersion: null, root: null };
    const version = (body as { catalogVersion?: unknown }).catalogVersion;
    return {
      records: catalog.entries.map(recordOf),
      errors: catalog.errors,
      sourceVersion: typeof version === "string" && version.trim() !== "" ? version.trim() : null,
      root: "vulnerabilities",
    };
  },
};
