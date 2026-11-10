/**
 * The LEI records of the Global Legal Entity Identifier Foundation (GLEIF) as a read-through source
 * of the vendor risk database. An LEI record is reference data: the legal name, the jurisdiction and
 * the status of a legal entity, that the entity reports and its LEI issuer validates. It is no
 * finding. The record raises no risk by itself; it can describe another one (a parent that controls
 * the vendor, a registration that was not renewed).
 *
 * Only a vendor with a STORED LEI is looked up, by that LEI and by nothing else: `keyOf` gives the
 * `lei:` key of the vendor's own identifier (a strong match) or none, and never asks the database to
 * find an LEI by the vendor's name (the completions of a name hold funds and subsidiaries beside the
 * company, and cost several requests within the eight seconds of a run). `fetch` makes ONE request
 * through `ctx.fetchJson`, in the plain filter form `lei-records?filter[lei]=<LEI>`:
 *
 * - `fetchJson` sends `Accept: application/json`, which makes GLEIF answer `application/json`; an
 *   Accept that allows any type would give `application/vnd.api+json`, which `fetchJson` refuses.
 * - The path form `lei-records/<LEI>` is not used: it answers 404 for an LEI GLEIF does not know,
 *   which `fetchJson` would turn into a failed lookup. The filter answers 200 with a total of 0
 *   and no entry, which is an empty answer and no failure.
 * - There is no `include=` and no request for a parent: the answer names, in `relationships`, which
 *   kind of link each parent has, and that is all the record says of it. A parent's name would cost
 *   a request each, under GLEIF's limit of 60 a minute that a shared spacer keeps.
 * - The brackets of the filter are written as they are: the page guard's address policy keeps them,
 *   and GLEIF reads them as it reads their percent-encoded form.
 *
 * The answer is read as hostile: it must be what a filter by one LEI gives (a list of at most one
 * entry whose total is that number, and whose LEI is the one asked), or the lookup fails as an
 * unreadable format. Only the fields below are read; every other field is never copied anywhere.
 * That leaves out the addresses, the BIC, MIC, OCID, QCC, GEM and S&P numbers, the LEI issuer that
 * manages the registration and the way it validated the entity, the number in the entity's own
 * register (`registeredAs`), the other names, the successor and associated entities, the links
 * (the address of a parent's record is none of ours) and the paging.
 *
 * Natural persons: an LEI belongs to a legal entity, and `category` can be `SOLE_PROPRIETOR` (a
 * person acting in business). The LEI here is the vendor's own stored identifier, so the record
 * holds the reference data of the vendor itself and no address; no filter by kind of entity is
 * needed, and none is applied.
 *
 * Terms: GLEIF's data are CC0, under terms that forbid implying that a product is provided,
 * supported, authorised or associated by or with GLEIF. So the second sentence of every record says
 * that GLEIF is not associated with VerifyWise, and no text says that GLEIF endorses or certifies
 * anything, or that the entity did anything wrong: a lapsed registration is a registration whose
 * data were not renewed on time.
 *
 * The record is a state, as of the last answer: its day is the day of the registration's last
 * update. It keeps no address, no body and no message in an error or in a log; the failures are the
 * page guard's own.
 */
import { FetchError } from "../../../webResearch/guardedFetch";
import { joinSentences } from "../../records/sentence";
import { isLei, leiKey } from "../keys";
import type { ParsedRecord } from "../types";
import { endsCut, instantText, isObject, lineOf, shorten, withoutAngles } from "./kit/clean";
import { RECORD_SUMMARY_MAX, recordOf } from "./kit/record";
import type { ReadThroughConnector } from "./types";

/** What the text of a record begins with, and what the analysis prompt names it by. */
export const GLEIF_RECORD_MARK = "GLEIF LEI records";

const RECORDS_URL = "https://api.gleif.org/api/v1/lei-records";
/** An answer for one LEI is about 3 KB: the limit is forty times that. */
const MAX_BYTES = 131_072;
const LEI_PREFIX = "lei:";

/** The longest legal name that a record keeps. */
const NAME_MAX = 200;
/** A country, and a region of it when there is one: `IE`, `US-DE`. */
const JURISDICTION = /^[A-Z]{2}(?:-[A-Z0-9]{1,3})?$/;
/** The code of a legal form in the ISO 20275 list, as it is written there. */
const LEGAL_FORM_CODE = /^[A-Z0-9]{4}$/;
/** A category or a status: words in upper case that are joined by underscores. */
const STATUS_WORDS = /^[A-Z_]{1,30}$/;

const PARENT_REPORTED = "reported (not looked up)";
const PARENT_EXCEPTION = "an exception is reported instead";

/** The first sentence of every record: the list, its host and what kind of list it is. */
const FIRST_SENTENCE = `${GLEIF_RECORD_MARK} (gleif.org), a register or status list.`;
/**
 * The second sentence of every record. It says what the record is and is not, and that GLEIF is not
 * associated with VerifyWise, as GLEIF's terms require. It is never cut and never left out.
 */
const PROTECTED_SENTENCE =
  "An LEI record is reference data that the entity reports and its LEI issuer validates; a lapsed " +
  "registration means the data were not renewed on time, not anything about the entity's conduct, " +
  "and GLEIF is not associated with VerifyWise.";

/** What a record keeps of an answer. A fact that the answer does not give, or gives in no form that is kept, is empty. */
export interface GleifFacts {
  /** The LEI, in upper case. */
  lei: string;
  legalName: string;
  jurisdiction: string;
  legalFormId: string;
  category: string;
  entityStatus: string;
  registrationStatus: string;
  /** The UTC day (YYYY-MM-DD) of the registration's next renewal and of its last update. */
  nextRenewal: string;
  lastUpdate: string;
  /** What the answer says of each parent: that it is reported, or that an exception is. */
  directParent: string;
  ultimateParent: string;
  /** The UTC day of the golden copy that the answer is taken from. */
  goldenCopy: string;
}

const unreadable = (): FetchError => new FetchError("unsupported_type");

/** The text of a field when it has the form of its kind, else none. */
const codeOf = (value: unknown, form: RegExp): string =>
  typeof value === "string" && form.test(value) ? value : "";

/**
 * The UTC day (YYYY-MM-DD) of an ISO 8601 day, or of a day and time with a zone; none for anything
 * else. GLEIF writes the local midnight of the issuer in UTC (`2026-04-07T23:00:00Z` is the start of
 * the 8th in a zone one hour ahead of UTC), so the UTC day can be one day early: the issuer's zone
 * is not guessed, and the text that shows the day says that it is UTC. `instantText` gives only
 * what `Date` reads, within the years 1 to 9999.
 */
function utcDayOf(value: unknown): string {
  const instant = instantText(value);
  return instant === null ? "" : new Date(Date.parse(instant)).toISOString().slice(0, 10);
}

/** True when `links` has a link of that kind: text that is not empty. */
function hasLink(links: Record<string, unknown>, kind: string): boolean {
  const link = links[kind];
  return typeof link === "string" && link !== "";
}

/**
 * What the answer says of a parent, by the kind of link it holds and nothing else: a link to the
 * parent's record means that the entity reports a parent (the record is not asked for), a link to a
 * reporting exception means that it reports an exception instead; neither says nothing.
 */
function parentOf(relationships: unknown, parent: "direct-parent" | "ultimate-parent"): string {
  const entry = isObject(relationships) ? relationships[parent] : undefined;
  const links = isObject(entry) ? entry.links : undefined;
  if (!isObject(links)) return "";
  if (hasLink(links, "lei-record")) return PARENT_REPORTED;
  return hasLink(links, "reporting-exception") ? PARENT_EXCEPTION : "";
}

/** The facts of an entry of the answer: the fields that are kept, each read in its own form. */
function factsOf(
  entry: Record<string, unknown>,
  attributes: Record<string, unknown>,
  meta: unknown,
  lei: string,
): GleifFacts {
  const entity = isObject(attributes.entity) ? attributes.entity : {};
  const registration = isObject(attributes.registration) ? attributes.registration : {};
  const legalName = isObject(entity.legalName) ? entity.legalName.name : undefined;
  const legalForm = isObject(entity.legalForm) ? entity.legalForm.id : undefined;
  const goldenCopy =
    isObject(meta) && isObject(meta.goldenCopy) ? meta.goldenCopy.publishDate : undefined;
  return {
    lei,
    // The name is a line that no markup is made of; it is the one field of free text that is kept.
    legalName: withoutAngles(lineOf(legalName, NAME_MAX)),
    jurisdiction: codeOf(entity.jurisdiction, JURISDICTION),
    legalFormId: codeOf(legalForm, LEGAL_FORM_CODE),
    category: codeOf(entity.category, STATUS_WORDS),
    entityStatus: codeOf(entity.status, STATUS_WORDS),
    registrationStatus: codeOf(registration.status, STATUS_WORDS),
    nextRenewal: utcDayOf(registration.nextRenewalDate),
    lastUpdate: utcDayOf(registration.lastUpdateDate),
    directParent: parentOf(entry.relationships, "direct-parent"),
    ultimateParent: parentOf(entry.relationships, "ultimate-parent"),
    goldenCopy: utcDayOf(goldenCopy),
  };
}

/** `label value`, or nothing for a value that is empty. */
const partOf = (label: string, value: string): string => (value === "" ? "" : `${label} ${value}`);

const withDay = (day: string): string => (day === "" ? "" : `${day} (UTC)`);

/** The parts that are not empty, joined, as a sentence that begins with a capital; nothing when none is left. */
function sentenceOf(parts: readonly string[], glue: string): string {
  const text = parts.filter((part) => part !== "").join(glue);
  return text === "" ? "" : `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/**
 * The text of a record: the list and what kind it is (S1), what an LEI record is and is not and
 * that GLEIF is not associated with VerifyWise (S2), the identity of the entity (S3), its status and
 * the dates of its registration (S4), its parents (S5) and the golden copy that the answer is as of
 * (S6). A part that the answer does not give is left out of its sentence, and a sentence that has
 * no part left is left out.
 *
 * Every part is capped, so that the longest text is about 910 characters, and the limit of 1,300 is
 * out of reach. Were a cap raised, S1 and S2 stay whole and S6 stays, and the facts between them
 * (S3 to S5) give way: they are cut, with the mark of a cut.
 */
export function gleifSummaryOf(facts: GleifFacts): string {
  const opening = [FIRST_SENTENCE, PROTECTED_SENTENCE];
  const details = [
    sentenceOf(
      [
        partOf("legal name:", facts.legalName),
        partOf("LEI", facts.lei),
        partOf("jurisdiction", facts.jurisdiction),
        partOf("legal form code", facts.legalFormId),
        partOf("category", facts.category),
      ],
      "; ",
    ),
    sentenceOf(
      [
        partOf("entity status", facts.entityStatus),
        [
          partOf("LEI registration status", facts.registrationStatus),
          partOf("next renewal", withDay(facts.nextRenewal)),
          partOf("last update", withDay(facts.lastUpdate)),
        ]
          .filter((part) => part !== "")
          .join(", "),
      ],
      "; ",
    ),
    sentenceOf(
      [
        partOf("direct parent:", facts.directParent),
        partOf("ultimate parent:", facts.ultimateParent),
      ],
      "; ",
    ),
  ];
  const closing = facts.goldenCopy === "" ? "" : `Golden copy of ${facts.goldenCopy}.`;

  const whole = joinSentences([...opening, ...details, closing]);
  if (whole.length <= RECORD_SUMMARY_MAX) return whole;
  const room = RECORD_SUMMARY_MAX - joinSentences([...opening, closing]).length - 1;
  return joinSentences([...opening, shorten(joinSentences(details), room), closing]);
}

/** The identifiers of the record: the LEI and the facts that name the entity and its standing, those the answer gives. */
function identifiersOf(facts: GleifFacts): Record<string, string> {
  const given = {
    // A name that was cut (it ends in the marker) is shown in the title and the text, never an identifier:
    // an identifier is a name as it is or nothing.
    legalName: endsCut(facts.legalName) ? "" : facts.legalName,
    registrationStatus: facts.registrationStatus,
    entityStatus: facts.entityStatus,
    jurisdiction: facts.jurisdiction,
  };
  return {
    lei: facts.lei,
    ...Object.fromEntries(Object.entries(given).filter(([, value]) => value !== "")),
  };
}

function recordFor(facts: GleifFacts): ParsedRecord {
  return recordOf({
    id: `gleif:${facts.lei}`,
    type: "lei_record",
    title: `LEI record: ${facts.legalName === "" ? facts.lei : facts.legalName}`,
    summary: gleifSummaryOf(facts),
    url: `${RECORDS_URL}/${facts.lei}`,
    identifiers: identifiersOf(facts),
    // The LEI is the one key: a name would match the record to every vendor of the same name.
    names: [],
    leis: [facts.lei],
    publishedAt: facts.lastUpdate === "" ? null : facts.lastUpdate,
    sourceUpdatedAt: null,
  });
}

/**
 * The records of an answer to a filter by the LEI `lei`, as the copy keeps them: none when GLEIF
 * does not know the LEI (a total of 0), one when it does. It throws a FetchError (an unreadable
 * format) for an answer that a filter by one LEI cannot give: a body that is no object, data that
 * is no list or holds more than one entry, a total that is not the number of entries (so 0 or 1),
 * an entry without attributes, or an LEI in them that is not the one asked, or does not pass its
 * check digits. It holds no part of the answer.
 */
export function gleifRecordsOf(body: unknown, lei: string): ParsedRecord[] {
  if (!isObject(body)) throw unreadable();
  const { data, meta } = body;
  if (!Array.isArray(data) || data.length > 1) throw unreadable();
  // A total that is the number of entries, and they are at most one, is 0 or 1.
  const pagination = isObject(meta) ? meta.pagination : undefined;
  if ((isObject(pagination) ? pagination.total : undefined) !== data.length) throw unreadable();
  if (data.length === 0) return [];
  const entry: unknown = data[0];
  const attributes = isObject(entry) ? entry.attributes : undefined;
  if (!isObject(entry) || !isObject(attributes)) throw unreadable();
  const answered = typeof attributes.lei === "string" ? attributes.lei.toUpperCase() : "";
  if (answered !== lei.toUpperCase() || !isLei(answered)) throw unreadable();
  return [recordFor(factsOf(entry, attributes, meta, answered))];
}

export const gleifConnector: ReadThroughConnector = {
  id: "gleif",
  async keyOf(target) {
    const lei = target.identifiers?.lei;
    return typeof lei === "string" && isLei(lei) ? { key: leiKey(lei), weak: false } : null;
  },
  async fetch(key, { signal, fetchJson }) {
    const stored = key.startsWith(LEI_PREFIX) ? key.slice(LEI_PREFIX.length) : "";
    // A key that `keyOf` did not make is a mistake of the caller, not a failure of the source.
    if (!isLei(stored)) throw new FetchError("not_allowed");
    // Only the LEI in its stored form, upper case and without white space, goes into the address.
    const lei = leiKey(stored).slice(LEI_PREFIX.length);
    const body = await fetchJson(`${RECORDS_URL}?filter[lei]=${lei}`, {
      maxBytes: MAX_BYTES,
      signal,
    });
    return { records: gleifRecordsOf(body, lei), coversSince: null };
  },
};
