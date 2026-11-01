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
 *
 * The vendor risk database mirrors the list (vrdb/connectors/ofac.ts) and a run looks the vendor up
 * there. The run no longer downloads the files itself (M3 Part B), so this path keeps the names
 * that other code imports from it, and the sentence that every name-only match carries.
 */
import {
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
} from "../vrdb/connectors/ofac";

// The parser and the text of a record are the mirror's connector's; this path keeps their names.
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
