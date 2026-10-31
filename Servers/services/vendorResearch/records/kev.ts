/**
 * The CISA catalog of known exploited vulnerabilities (KEV): one public JSON file, keyless, that
 * lists the vulnerabilities which CISA has evidence of being exploited in the wild. An entry names
 * the vendor or project by one string (`vendorProject`), and it is the vendor's only when that
 * string is a name of the vendor (see match.ts). The catalog is a work of the United States
 * government and free to use.
 */
import {
  KEV_MAX_BYTES,
  KEV_URL,
  type KevEntry,
  cvePageOf,
  kevSourceOf,
  parseKev,
} from "../vrdb/connectors/kev";
import { matchesVendor } from "./match";
import { MAX_RECORDS, type SourceRecord } from "./types";

// The parser and the text of a record moved to the mirror's connector; this path keeps them.
export { KEV_MAX_BYTES, KEV_URL, type KevEntry, cvePageOf, parseKev };

const recordOf = (entry: KevEntry): SourceRecord => ({
  ...kevSourceOf(entry),
  publishedAt: entry.dateAdded,
});

/**
 * The entries of the vendor as sources: those added since `cutoff`, the newest first (for one day
 * the greater CVE id first), at most MAX_RECORDS.kev of them. What was left out is counted.
 */
export function kevRecords(
  entries: readonly KevEntry[],
  input: { keys: readonly string[]; cutoff?: string },
): { records: SourceRecord[]; omitted: { old?: number; more?: number } } {
  const ofVendor = entries.filter((entry) => matchesVendor(entry.vendorProject, input.keys));
  const recent = ofVendor.filter(
    (entry) => input.cutoff === undefined || entry.dateAdded >= input.cutoff,
  );
  recent.sort(
    (a, b) =>
      b.dateAdded.localeCompare(a.dateAdded) ||
      b.cveID.localeCompare(a.cveID, "en", { numeric: true }),
  );
  const kept = recent.slice(0, MAX_RECORDS.kev);
  const old = ofVendor.length - recent.length;
  const more = recent.length - kept.length;
  return {
    records: kept.map(recordOf),
    omitted: { ...(old > 0 ? { old } : {}), ...(more > 0 ? { more } : {}) },
  };
}
