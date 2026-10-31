/**
 * The Specially Designated Nationals and Blocked Persons List (SDN) of the Office of Foreign Assets
 * Control (OFAC) of the United States Treasury: the people, companies, vessels and aircraft that
 * persons of the United States may not deal with. The Sanctions List Service of the Treasury
 * publishes it as two public files, keyless: SDN.CSV (the entries) and ALT.CSV (the other names of
 * the entries). The list is a work of the United States government and free to use.
 *
 * Only the entities (companies and organizations) are read: a vendor is a company, and a person
 * who shares a name with it is no reason to look at it twice. The vendor is matched to an entry by
 * name alone, letter for letter as match.ts does, so the match is weak, and the record says so: it
 * is a reason to check who the vendor is, never a finding that the vendor is sanctioned.
 */
import {
  MAX_OFAC_REMARKS_CHARS,
  MIN_OFAC_NAME_CHARS,
  OFAC_ALT_MAX_BYTES,
  OFAC_ALT_URL,
  OFAC_RECORD_MARK,
  OFAC_SDN_MAX_BYTES,
  OFAC_SDN_URL,
  type OfacEntry,
  type OfacList,
  ofacEntryUrl,
  ofacSourceOf,
  parseCsv,
  parseOfac,
} from "../vrdb/connectors/ofac";
import { joinSentences } from "./sentence";
import { MAX_RECORDS, type SourceRecord } from "./types";

// The parser and the text of a record moved to the mirror's connector; this path keeps them.
export {
  MAX_OFAC_REMARKS_CHARS,
  OFAC_ALT_MAX_BYTES,
  OFAC_ALT_URL,
  OFAC_RECORD_MARK,
  OFAC_SDN_MAX_BYTES,
  OFAC_SDN_URL,
  type OfacEntry,
  type OfacList,
  ofacEntryUrl,
  parseCsv,
  parseOfac,
};

/**
 * What a record found by the vendor's name alone says after the list's text: the analysis prompt
 * knows this sentence (vr-6), and the vendor risk database adds it to every name-only match.
 */
export const NAME_ONLY_LOOKUP_NOTE =
  "Lookup note: the vendor was matched to this entry by name only, so it may be another company with the same name; the address, the country and the identifiers would tell.";

/** The note of a record found by name, and the day it was on the list: what a run adds. */
function recordOf(entry: OfacEntry, day: string): SourceRecord {
  const { url, title, text } = ofacSourceOf(entry);
  return {
    url,
    title,
    text: joinSentences([text, NAME_ONLY_LOOKUP_NOTE, `On the list on ${day}.`]),
    publishedAt: day,
  };
}

/**
 * The entries listed under a name of the vendor (`keys`, compact; see match.ts#nameKeys), as
 * sources: the day of the record is the day of the run, since the list dates no entry. At most
 * MAX_RECORDS.ofac of them, the lowest numbers first, and what was left out is counted.
 */
export function ofacRecords(
  list: OfacList,
  input: { keys: readonly string[]; now: Date },
): { records: SourceRecord[]; omitted: { old?: number; more?: number } } {
  const found = new Set<number>();
  for (const key of input.keys) {
    if (key.length < MIN_OFAC_NAME_CHARS) continue;
    for (const id of list.index.get(key) ?? []) found.add(id);
  }
  const ids = [...found].sort((a, b) => a - b);
  const kept = ids.slice(0, MAX_RECORDS.ofac);
  const more = ids.length - kept.length;
  const day = input.now.toISOString().slice(0, 10);
  return {
    records: kept.flatMap((id) => {
      const entry = list.byId.get(id);
      return entry === undefined ? [] : [recordOf(entry, day)];
    }),
    omitted: more > 0 ? { more } : {},
  };
}
