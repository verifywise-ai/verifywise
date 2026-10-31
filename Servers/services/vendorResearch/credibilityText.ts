/**
 * The English line of a credibility label (spec D5.5): the sentence of the rule that decided it,
 * written from the stored basis; then, when a cited copy of the vendor risk database was out of
 * date, the day of the oldest one; then the name-only note, when a record matched the vendor by
 * name only and the rule is not already that one. The API adds the line to every finding for the
 * clients that do not translate it; the client writes the same basis in the person's language.
 *
 * The sentence names what its rule held with, as credibility.ts chose it: the sources that are
 * neither contradicted nor an inactive record, and the first of them that was read.
 *
 * A label the backfill wrote (spec D4.6) says so: a pending finding's, decided again by the rule,
 * reads the rule's line and then that it was rated again; a decided finding's, carried over from
 * its confidence, says only that.
 */
import {
  type BackfilledCredibilityBasis,
  type CredibilityBasis,
  type CredibilitySource,
  type RecordSourceId,
  type RecordStatus,
  type StoredCredibilityBasis,
  LEGACY_CONFIDENCE_RULE,
} from "../../domain.layer/interfaces/i.vendorResearch";
import { isCredibilityRule } from "./credibility";
import { joinSentences } from "./records/sentence";
import { VRDB_SOURCES } from "./vrdb/sources";

/** What a label says when a cited record matched the vendor by name only (D5.3, step 5). */
export const NAME_ONLY_NOTE = "Matched by name only: this may be another company.";

/** What a pending finding's label that the backfill decided says after its rule's line (D4.6). */
export const BACKFILL_NOTE = "Rated again with the current rule.";

/** What a decided finding's label carried over from its confidence says (D4.6). */
export const LEGACY_NOTE = "Rated with the earlier confidence rule.";

const BACKFILL_PREFIX = "backfill_";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A day as the line writes it, "28 Oct 2026", in UTC, from a day (YYYY-MM-DD) or an ISO 8601
 * time; null for anything else.
 */
export function dayOf(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return null;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return null;
  const at = new Date(time);
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}`;
}

/**
 * The databases as a sentence names them where the name of a definition (vrdb/sources.ts) does
 * not do: a sentence may need it with its article, and the CVE records by who keeps them ("the CVE
 * Program rejected the record", spec D5.7 case 10).
 */
const DATABASE_NAMES: Partial<Record<RecordSourceId, string>> = {
  nvd: "the National Vulnerability Database",
  sec: "SEC EDGAR",
  cve: "the CVE Program",
  hibp: "Have I Been Pwned",
  statuspage: "the vendor's status page",
};

/** The database as the subject of a sentence: "CISA Known Exploited Vulnerabilities lists it". */
function databaseOf(id: RecordSourceId): string {
  const defined = VRDB_SOURCES.find((source) => source.id === id);
  return DATABASE_NAMES[id] ?? defined?.name ?? id;
}

/** The list in "the {list} entry": "OFAC SDN list". */
function listOf(id: RecordSourceId): string {
  const mirrored = VRDB_SOURCES.find((source) => source.id === id);
  return (mirrored?.listName ?? databaseOf(id)).replace(/^the /, "");
}

const PAST_TENSE: Record<Exclude<RecordStatus, "active">, string> = {
  withdrawn: "withdrew",
  rejected: "rejected",
  delisted: "removed",
};

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** " (a, b)" for the values, each once, or nothing when there is none. */
function listed(values: ReadonlyArray<string | null>): string {
  const kept = [...new Set(values.filter((value): value is string => value !== null))];
  return kept.length === 0 ? "" : ` (${kept.join(", ")})`;
}

/** The first of the sources that was read, or else the first. */
const firstRead = (sources: readonly CredibilitySource[]): CredibilitySource | undefined =>
  sources.find((source) => source.reading === "read") ?? sources[0];

const isActive = (source: CredibilitySource): boolean =>
  source.record === undefined || source.record.status === "active";

/** The trusted publishers, each once by its registry entry, named by the registry or the host. */
function publishersOf(sources: readonly CredibilitySource[]): Array<string | null> {
  const names = new Map<string, string | null>();
  for (const source of sources) {
    if (source.category !== "trusted_press") continue;
    const key = source.entry ?? source.publisher;
    if (!names.has(key)) names.set(key, source.publisher_name ?? hostOf(source.url));
  }
  return [...names.values()];
}

/** The sentence of the rule; empty for a rule it does not know or a basis without its source. */
function ruleSentence(basis: CredibilityBasis): string {
  const sources = Array.isArray(basis.sources) ? basis.sources : [];
  const supporting = sources.filter(
    (source) => source.reading !== "contradicted" && isActive(source),
  );
  const strong = supporting.filter((source) => source.record?.match !== "weak");

  switch (basis.rule) {
    case "official_record": {
      const record = firstRead(
        strong.filter(
          (source) => source.category === "official" && source.record?.match === "strong",
        ),
      )?.record;
      if (record === undefined) return "";
      const day = record.as_of === undefined ? null : dayOf(record.as_of);
      return `High: ${databaseOf(record.source)} lists it${listed([record.source_record_id ?? null])}${
        day === null ? "" : `, as of ${day}`
      }.`;
    }
    case "official_page": {
      const page = firstRead(
        strong.filter((source) => source.category === "official" && source.record === undefined),
      );
      return page === undefined
        ? ""
        : `High: an official source reports it${listed([hostOf(page.url)])}.`;
    }
    case "vendor_statement": {
      const page = firstRead(
        strong.filter(
          (source) => source.category === "vendor" && source.vendor_kind === "statement",
        ),
      );
      return page === undefined
        ? ""
        : `High: the vendor states it on its own pages${listed([hostOf(page.url)])}.`;
    }
    case "trusted_press_two": {
      const publishers = publishersOf(strong);
      return `High: ${publishers.length} independent trusted publishers report it${listed(publishers)}.`;
    }
    case "trusted_press_one":
      return `Medium: one trusted publisher reports it${listed(publishersOf(supporting))}; no official source and no second independent publisher.`;
    case "capped_unconfirmed":
      return "Medium: only search results show it; the pages could not be read.";
    case "contradicted":
      return "Low: the pages do not hold what the search results quoted.";
    case "name_only": {
      const record = supporting.find((source) => source.record?.match === "weak")?.record;
      return record === undefined
        ? ""
        : `Low: the ${listOf(record.source)} entry matches the vendor by name only.`;
    }
    case "unverified": {
      const hosts = supporting
        .filter((source) => source.category === "unverified")
        .map((source) => hostOf(source.url));
      return `Low: only unverified sources report it${listed(hosts)}.`;
    }
    case "self_claim":
      return "Low: only the vendor's own claims support it.";
    case "inactive": {
      const record = sources.find((source) => !isActive(source))?.record;
      if (record === undefined || record.status === "active") return "";
      const day = record.as_of === undefined ? null : dayOf(record.as_of);
      // A CVE another list rejected is rejected by that list (Ruling 9 of the M2 plan).
      return `Low: ${databaseOf(record.rejected_by ?? record.source)} ${PAST_TENSE[record.status]} the record${
        day === null ? "" : ` on ${day}`
      }.`;
    }
    default:
      return "";
  }
}

/** "The source has not been updated since {day}." for the oldest out-of-date copy cited. */
function staleSentence(sources: readonly CredibilitySource[]): string {
  const days = sources
    .flatMap((source) =>
      source.record?.stale === true && source.record.as_of !== undefined
        ? [source.record.as_of]
        : [],
    )
    .sort();
  const day = days.length === 0 ? null : dayOf(days[0]);
  return day === null ? "" : `The source has not been updated since ${day}.`;
}

// A stored basis is read as stored: a rule that is not text is no rule, and gives no line.
const isBackfilled = (basis: StoredCredibilityBasis): basis is BackfilledCredibilityBasis =>
  typeof basis.rule === "string" &&
  basis.rule.startsWith(BACKFILL_PREFIX) &&
  isCredibilityRule(basis.rule.slice(BACKFILL_PREFIX.length));

/** The English line of a label (see the header). Pure, and it never throws. */
export function credibilityRationale(basis: StoredCredibilityBasis): string {
  if (basis.rule === LEGACY_CONFIDENCE_RULE) return LEGACY_NOTE;
  if (isBackfilled(basis)) {
    const rule = basis.rule.slice(BACKFILL_PREFIX.length) as CredibilityBasis["rule"];
    return ruleLine({ ...basis, rule }, BACKFILL_NOTE) || BACKFILL_NOTE;
  }
  return ruleLine(basis);
}

/**
 * The line of a basis the rule decided: its sentence, then the backfill's note when there is one
 * (where the screen puts it, beside the sentence), the stale sentence and the name-only note.
 */
function ruleLine(basis: CredibilityBasis, backfillNote = ""): string {
  const rule = ruleSentence(basis);
  if (rule === "") return "";
  const sources = Array.isArray(basis.sources) ? basis.sources : [];
  return joinSentences([
    rule,
    backfillNote,
    staleSentence(sources),
    basis.name_only === true && basis.rule !== "name_only" ? NAME_ONLY_NOTE : "",
  ]);
}
