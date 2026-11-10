/**
 * The GLEIF LEI records as a read-through source of the vendor risk database: a vendor with a
 * stored LEI is asked once, in the plain filter form, and the answer becomes one record that is
 * keyed by the LEI alone. The answers are synthetic: they copy the shape of GLEIF's JSON:API
 * answers (a `meta` block with the golden copy and the paging, one record in `data`, the
 * `relationships` that tell which kind of link each parent has), with every name, LEI and token
 * invented. Every field the connector must leave out holds a token that starts with `ZZ-`, so that
 * a copy of it anywhere in a record is found. Every character that is hard to type is built with
 * `cp`.
 */
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import {
  BOT_USER_AGENT,
  FetchError,
  type Transport,
  guardedFetch,
} from "../../../../webResearch/guardedFetch";
import { fetchJson as defaultFetchJson } from "../../../records";
import type { FetchJson } from "../../../records/types";
import type { ResearchTarget } from "../../../target";
import { leiOf } from "../../__tests__/helpers/lei";
import { isLei } from "../../keys";
import type { ParsedRecord } from "../../types";
import {
  GLEIF_RECORD_MARK,
  type GleifFacts,
  gleifConnector,
  gleifRecordsOf,
  gleifSummaryOf,
} from "../gleif";
import { expectWellFormedRecords } from "./helpers/kitContract";

jest.setTimeout(30_000);

jest.mock("../../../../webResearch/guardedFetch", () => ({
  ...jest.requireActual("../../../../webResearch/guardedFetch"),
  guardedFetch: jest.fn(),
}));

const cp = (...codes: number[]): string => String.fromCodePoint(...codes);

type Json = Record<string, unknown>;

const NOW = new Date("2026-11-10T12:00:00Z");

/** Made-up LEIs: 18 characters that name no real entity, and the check digits ISO 17442 gives them. */
const LEI = leiOf("TEST00GLEIFAMPLE01");
const OTHER_LEI = leiOf("TEST00GLEIFOTHERX1");
const LOU_LEI = leiOf("TEST00LOUSENTINEL1");
const NAME = "Acme Analytics Holdings Ltd";

const KEY = `lei:${LEI}`;
const REQUEST_URL = `https://api.gleif.org/api/v1/lei-records?filter[lei]=${LEI}`;

/** The tokens of the fields that the connector leaves out: each is in a field no record may hold. */
const LEFT_OUT = {
  addressLine: "ZZ-ADDRESS-LINE",
  city: "ZZ-CITY",
  postalCode: "ZZ-POSTAL-CODE",
  region: "ZZ-R1",
  country: "ZZ-COUNTRY",
  mailRouting: "ZZ-MAIL-ROUTING",
  otherName: "ZZ-OTHER-NAME",
  transliterated: "ZZ-TRANSLITERATED-NAME",
  registeredAt: "ZZ-REGISTERED-AT",
  registeredAs: "ZZ-REGISTERED-AS-4711",
  successor: "ZZ-SUCCESSOR",
  corroboration: "ZZ-CORROBORATION",
  validatedAt: "ZZ-VALIDATED-AT",
  validatedAs: "ZZ-VALIDATED-AS-4711",
  otherAuthority: "ZZ-OTHER-AUTHORITY",
  bic: "ZZ-BIC",
  mic: "ZZ-MIC",
  ocid: "ZZ-OCID",
  qcc: "ZZ-QCC",
  gem: "ZZ-GEM",
  spglobal: "ZZ-SPGLOBAL",
  conformity: "ZZ-CONFORMITY",
  linkSelf: "https://sentinel.example/ZZ-LINK-SELF",
  linkFirst: "https://sentinel.example/ZZ-LINK-FIRST",
  linkLou: "https://sentinel.example/ZZ-LINK-LOU",
  linkDirect: "https://sentinel.example/ZZ-LINK-DIRECT",
  linkDirectRelationship: "https://sentinel.example/ZZ-LINK-DIRECT-RELATIONSHIP",
  linkUltimate: "https://sentinel.example/ZZ-LINK-ULTIMATE",
  linkUltimateRelationship: "https://sentinel.example/ZZ-LINK-ULTIMATE-RELATIONSHIP",
  linkDirectException: "https://sentinel.example/ZZ-LINK-DIRECT-EXCEPTION",
  linkUltimateException: "https://sentinel.example/ZZ-LINK-ULTIMATE-EXCEPTION",
};

const addressOf = (): Json => ({
  language: "en",
  addressLines: [LEFT_OUT.addressLine],
  addressNumber: null,
  addressNumberWithinBuilding: null,
  mailRouting: LEFT_OUT.mailRouting,
  city: LEFT_OUT.city,
  region: LEFT_OUT.region,
  country: LEFT_OUT.country,
  postalCode: LEFT_OUT.postalCode,
});

/** The two parents as GLEIF gives them when the entity has parents: each has a record and a relationship record. */
const PARENT_RECORDS: Json = {
  "direct-parent": {
    links: {
      "relationship-record": LEFT_OUT.linkDirectRelationship,
      "lei-record": LEFT_OUT.linkDirect,
    },
  },
  "ultimate-parent": {
    links: {
      "relationship-record": LEFT_OUT.linkUltimateRelationship,
      "lei-record": LEFT_OUT.linkUltimate,
    },
  },
};

/** The two parents as GLEIF gives them when the entity has none to report: each has a reporting exception instead. */
const PARENT_EXCEPTIONS: Json = {
  "direct-parent": { links: { "reporting-exception": LEFT_OUT.linkDirectException } },
  "ultimate-parent": { links: { "reporting-exception": LEFT_OUT.linkUltimateException } },
};

interface Changes {
  /** Keys that replace those of `attributes.entity`. */
  entity?: Json;
  /** Keys that replace those of `attributes.registration`. */
  registration?: Json;
  /** Keys that replace those of `attributes`. */
  attributes?: Json;
  /** Replaces the whole `relationships` block. */
  relationships?: unknown;
}

/** One entry of `data`, as GLEIF gives it: a lapsed registration whose parents have records. */
function entryFor(lei: string, changes: Changes = {}): Json {
  return {
    type: "lei-records",
    id: lei,
    attributes: {
      lei,
      entity: {
        legalName: { name: NAME, language: "en" },
        otherNames: [{ name: LEFT_OUT.otherName, language: "en", type: "ALTERNATIVE" }],
        transliteratedOtherNames: [{ name: LEFT_OUT.transliterated, language: "en" }],
        legalAddress: addressOf(),
        headquartersAddress: addressOf(),
        registeredAt: { id: LEFT_OUT.registeredAt, other: null },
        registeredAs: LEFT_OUT.registeredAs,
        jurisdiction: "IE",
        category: "GENERAL",
        legalForm: { id: "AB12", other: null },
        associatedEntity: { lei: null, name: null },
        status: "ACTIVE",
        expiration: { date: null, reason: null },
        successorEntity: { lei: null, name: LEFT_OUT.successor },
        successorEntities: [],
        creationDate: "1999-01-02T03:04:05Z",
        subCategory: null,
        otherAddresses: [],
        eventGroups: [],
        ...changes.entity,
      },
      registration: {
        initialRegistrationDate: "2025-03-04T23:00:00Z",
        lastUpdateDate: "2026-04-22T23:00:00Z",
        status: "LAPSED",
        nextRenewalDate: "2026-04-07T23:00:00Z",
        managingLou: LOU_LEI,
        corroborationLevel: LEFT_OUT.corroboration,
        validatedAt: { id: LEFT_OUT.validatedAt, other: null },
        validatedAs: LEFT_OUT.validatedAs,
        otherValidationAuthorities: [{ id: LEFT_OUT.otherAuthority }],
        ...changes.registration,
      },
      bic: [LEFT_OUT.bic],
      mic: [LEFT_OUT.mic],
      ocid: LEFT_OUT.ocid,
      qcc: LEFT_OUT.qcc,
      gem: LEFT_OUT.gem,
      spglobal: [LEFT_OUT.spglobal],
      conformityFlag: LEFT_OUT.conformity,
      ...changes.attributes,
    },
    relationships:
      "relationships" in changes
        ? changes.relationships
        : {
            "managing-lou": { links: { related: LEFT_OUT.linkLou } },
            "lei-issuer": { links: { related: LEFT_OUT.linkLou } },
            "field-modifications": { links: { related: LEFT_OUT.linkLou } },
            ...PARENT_RECORDS,
          },
    links: { self: LEFT_OUT.linkSelf },
  };
}

/** The answer to a filter by one LEI: the entries, and the `meta` block of the golden copy and the paging. */
function answerFor(entries: unknown[], meta: Json = {}): Json {
  return {
    meta: {
      goldenCopy: { publishDate: "2026-10-27T16:00:00Z" },
      pagination: {
        currentPage: 1,
        perPage: 15,
        from: entries.length === 0 ? null : 1,
        to: entries.length === 0 ? null : entries.length,
        total: entries.length,
        lastPage: 1,
      },
      ...meta,
    },
    links: { first: LEFT_OUT.linkFirst, last: LEFT_OUT.linkFirst },
    data: entries,
  };
}

/** The answer for the vendor's LEI, with the changes a test is about. */
const answerWith = (changes: Changes = {}, meta: Json = {}): Json =>
  answerFor([entryFor(LEI, changes)], meta);

const signal = new AbortController().signal;

/** A `fetchJson` that answers one body and keeps what it was asked. */
function answering(body: unknown) {
  return jest.fn(async (..._asked: Parameters<FetchJson>): Promise<unknown> => body);
}

/** A `fetchJson` that fails as the page guard does. */
function failing(error: unknown) {
  return jest.fn(async (..._asked: Parameters<FetchJson>): Promise<unknown> => {
    throw error;
  });
}

const ctx = (fetchJson: FetchJson, over: { now?: Date; signal?: AbortSignal } = {}) => ({
  now: over.now ?? NOW,
  signal: over.signal ?? signal,
  fetchJson,
});

const vendor = (lei?: string): ResearchTarget => ({
  name: NAME,
  domain: "acme-analytics.example",
  provides: "Analytics",
  ...(lei === undefined ? {} : { identifiers: { lei } }),
});

/** The LEI with its last digit changed: its check digits no longer match. */
const BROKEN_LEI = `${LEI.slice(0, 19)}${(Number(LEI[19]) + 1) % 10}`;

describe("the test's own LEIs", () => {
  it("are 20 characters that pass the check digits, and are not the same", () => {
    for (const lei of [LEI, OTHER_LEI, LOU_LEI]) {
      expect(lei).toMatch(/^[A-Z0-9]{18}[0-9]{2}$/);
      expect(isLei(lei)).toBe(true);
    }
    expect(new Set([LEI, OTHER_LEI, LOU_LEI]).size).toBe(3);
    expect(isLei(BROKEN_LEI)).toBe(false);
  });
});

describe("the connector", () => {
  it("is the source gleif, and its mark is the list's name", () => {
    expect(gleifConnector.id).toBe("gleif");
    expect(GLEIF_RECORD_MARK).toBe("GLEIF LEI records");
  });
});

describe("keyOf", () => {
  it("asks for a vendor by its stored LEI: a strong key, and no request", async () => {
    const fetchJson = answering({});

    await expect(gleifConnector.keyOf(vendor(LEI), { signal, fetchJson })).resolves.toEqual({
      key: KEY,
      weak: false,
    });
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it.each([
    ["in lower case", LEI.toLowerCase()],
    ["with white space in it and around it", ` ${LEI.slice(0, 4)} ${LEI.slice(4).toLowerCase()} `],
  ])("gives the upper-case key of an LEI %s", async (_how, stored) => {
    const found = await gleifConnector.keyOf(vendor(stored), { signal, fetchJson: answering({}) });

    expect(found).toEqual({ key: KEY, weak: false });
  });

  it("gives no key to a vendor without an LEI, and does not look for one by its name", async () => {
    const fetchJson = answering({});

    await expect(gleifConnector.keyOf(vendor(), { signal, fetchJson })).resolves.toBeNull();
    await expect(
      gleifConnector.keyOf(
        { ...vendor(), identifiers: { country: "IE", registrationNumber: "5550142" } },
        { signal, fetchJson },
      ),
    ).resolves.toBeNull();
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it.each([
    ["whose check digits fail", BROKEN_LEI],
    ["that is one character short", LEI.slice(0, 19)],
    ["that is one character long", `${LEI}0`],
    ["that has a character no LEI has", `${LEI.slice(0, 10)}-${LEI.slice(11)}`],
    ["that is empty", ""],
    ["that is only white space", "   "],
    ["that is a number, not text", 12345 as unknown as string],
  ])("gives no key to an LEI %s, and makes no request", async (_why, stored) => {
    const fetchJson = answering({});

    await expect(gleifConnector.keyOf(vendor(stored), { signal, fetchJson })).resolves.toBeNull();
    expect(fetchJson).not.toHaveBeenCalled();
  });
});

describe("fetch: the request", () => {
  it("makes one request, in the plain filter form, within the size of an answer", async () => {
    const fetchJson = answering(answerWith());

    await gleifConnector.fetch(KEY, ctx(fetchJson));

    expect(fetchJson).toHaveBeenCalledTimes(1);
    const [url, options] = fetchJson.mock.calls[0];
    expect(url).toBe(REQUEST_URL);
    expect(options).toEqual({ maxBytes: 131072, signal });
    // Nothing else is asked of the guard: the bot's own User-Agent, and no other option.
    expect(Object.keys(options).sort()).toEqual(["maxBytes", "signal"]);
  });

  it("asks for no parent, no include and no search, though the answer names two parents", async () => {
    const fetchJson = answering(answerWith());

    await gleifConnector.fetch(KEY, ctx(fetchJson));

    expect(fetchJson).toHaveBeenCalledTimes(1);
    const url = String(fetchJson.mock.calls[0][0]);
    expect(url).not.toContain("include");
    expect(url).not.toContain("fuzzycompletions");
    expect(url).not.toContain("parent");
    expect(new URL(url).host).toBe("api.gleif.org");
  });

  it.each([
    ["lower case", `lei:${LEI.toLowerCase()}`],
    ["white space in it", `lei:${LEI.slice(0, 6)} ${LEI.slice(6)}`],
  ])("asks for the upper-case LEI alone when the key has %s", async (_how, key) => {
    const fetchJson = answering(answerWith());

    await gleifConnector.fetch(key, ctx(fetchJson));

    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(fetchJson.mock.calls[0][0]).toBe(REQUEST_URL);
  });

  it("gives the answer's record and no window: a registry entry is a state", async () => {
    const fetched = await gleifConnector.fetch(KEY, ctx(answering(answerWith())));

    expect(fetched.coversSince).toBeNull();
    expect(fetched.records).toHaveLength(1);
  });
});

describe("fetch: a key the connector did not make", () => {
  it.each([
    ["a name key", "name:acmeanalytics"],
    ["a key of another source", "cpe:acmeanalytics"],
    ["an LEI without its prefix", LEI],
    ["a prefix in upper case", `LEI:${LEI}`],
    ["no LEI after the prefix", "lei:"],
    ["an LEI that is one character short", `lei:${LEI.slice(0, 19)}`],
    ["an LEI whose check digits fail", `lei:${BROKEN_LEI}`],
    ["an LEI with a character no LEI has", `lei:${LEI.slice(0, 10)}-${LEI.slice(11)}`],
    ["a query in the place of the LEI", `lei:${LEI}&include=direct-parent`],
    ["nothing", ""],
  ])("fails as not allowed, with no request, for %s", async (_what, key) => {
    const fetchJson = answering(answerWith());

    const failure = await gleifConnector
      .fetch(key, ctx(fetchJson))
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(FetchError);
    expect(failure).toMatchObject({ reason: "not_allowed" });
    expect(fetchJson).not.toHaveBeenCalled();
  });
});

describe("an answer for an LEI that GLEIF does not know", () => {
  it("is no failure: a total of 0 and no entry give no record and no window", async () => {
    const fetchJson = answering(answerFor([]));

    await expect(gleifConnector.fetch(KEY, ctx(fetchJson))).resolves.toEqual({
      records: [],
      coversSince: null,
    });
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it("gives no record from the answer alone", () => {
    expect(gleifRecordsOf(answerFor([]), LEI)).toEqual([]);
  });
});

/** Answers that a filter by one LEI cannot give: the connector does not read them. */
const UNREADABLE_ANSWERS: Array<[string, unknown]> = [
  ["a body that is null", null],
  ["a body that is a string", "[]"],
  ["a body that is a list", []],
  ["a body that is a number", 7],
  ["no data", { meta: { pagination: { total: 0 } } }],
  ["data that is an object", { ...answerWith(), data: entryFor(LEI) }],
  ["data that is null", { ...answerWith(), data: null }],
  ["data that is a string", { ...answerWith(), data: "lei-records" }],
  ["a total of 1 and no entry", answerFor([], { pagination: { total: 1 } })],
  ["a total of 0 and an entry", answerFor([entryFor(LEI)], { pagination: { total: 0 } })],
  ["a total of 2 and one entry", answerFor([entryFor(LEI)], { pagination: { total: 2 } })],
  ["two entries and a total of 2", answerFor([entryFor(LEI), entryFor(OTHER_LEI)])],
  [
    "two entries and a total of 1",
    answerFor([entryFor(LEI), entryFor(OTHER_LEI)], { pagination: { total: 1 } }),
  ],
  ["a total that is a string", answerFor([entryFor(LEI)], { pagination: { total: "1" } })],
  ["a total that is a fraction", answerFor([entryFor(LEI)], { pagination: { total: 1.5 } })],
  ["a total that is negative", answerFor([], { pagination: { total: -1 } })],
  ["a total that is null", answerFor([entryFor(LEI)], { pagination: { total: null } })],
  ["no total", answerFor([entryFor(LEI)], { pagination: { currentPage: 1 } })],
  ["no pagination", answerFor([entryFor(LEI)], { pagination: undefined })],
  ["a pagination that is a list", answerFor([entryFor(LEI)], { pagination: [] })],
  ["no meta", { data: [entryFor(LEI)] }],
  ["a meta that is a list", { meta: [], data: [entryFor(LEI)] }],
  ["an entry that is null", answerFor([null])],
  ["an entry that is a list", answerFor([[entryFor(LEI)]])],
  ["an entry that is a string", answerFor([LEI])],
  ["an entry that is a number", answerFor([42])],
  ["an entry without attributes", answerFor([{ type: "lei-records", id: LEI }])],
  ["attributes that are null", answerFor([{ type: "lei-records", id: LEI, attributes: null }])],
  ["attributes that are a list", answerFor([{ type: "lei-records", id: LEI, attributes: [] }])],
  ["attributes that are a string", answerFor([{ type: "lei-records", id: LEI, attributes: LEI }])],
  ["attributes without an LEI", answerWith({ attributes: { lei: undefined } })],
  ["an LEI that is null", answerWith({ attributes: { lei: null } })],
  ["an LEI that is a number", answerWith({ attributes: { lei: 12345 } })],
  ["an LEI that is a list", answerWith({ attributes: { lei: [LEI] } })],
  ["the LEI of another entity", answerFor([entryFor(OTHER_LEI)])],
  [
    "another LEI in the attributes of the entry that has the asked id",
    answerWith({ attributes: { lei: OTHER_LEI } }),
  ],
  ["the asked LEI with a blank around it", answerWith({ attributes: { lei: ` ${LEI} ` } })],
  ["the asked LEI with a character added", answerWith({ attributes: { lei: `${LEI}0` } })],
];

describe("an answer that a filter by one LEI cannot give", () => {
  it.each(UNREADABLE_ANSWERS)("fails as an unreadable format: %s", async (_what, body) => {
    const failure = await gleifConnector
      .fetch(KEY, ctx(answering(body)))
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(FetchError);
    expect(failure).toMatchObject({ reason: "unsupported_type" });
  });

  it("says nothing of the answer when it fails: no address, no name, no LEI", async () => {
    const failure = await gleifConnector
      .fetch(KEY, ctx(answering(answerFor([entryFor(OTHER_LEI)]))))
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(FetchError);
    const seen = JSON.stringify([
      (failure as Error).message,
      (failure as Error).name,
      Object.values(failure as object),
    ]);
    expect(seen).toContain("not in a format that can be read");
    for (const text of [LEI, OTHER_LEI, NAME, "gleif", "sentinel", "http"]) {
      expect(seen).not.toContain(text);
    }
  });

  it("does not read the answer for an LEI that fails its check digits, even when the answer has it", () => {
    const body = answerWith({ attributes: { lei: BROKEN_LEI } });

    expect(() => gleifRecordsOf(body, BROKEN_LEI)).toThrow(FetchError);
  });
});

/** The sentences of the summary of the answer that `answerWith()` gives, as they are written. */
const FIRST_SENTENCE = "GLEIF LEI records (gleif.org), a register or status list.";
const DISCLAIMER =
  "An LEI record is reference data that the entity reports and its LEI issuer validates; a lapsed " +
  "registration means the data were not renewed on time, not anything about the entity's conduct, " +
  "and GLEIF is not associated with VerifyWise.";
const IDENTITY = `Legal name: ${NAME}; LEI ${LEI}; jurisdiction IE; legal form code AB12; category GENERAL.`;
const STATUS =
  "Entity status ACTIVE; LEI registration status LAPSED, next renewal 2026-04-07 (UTC), last update 2026-04-22 (UTC).";
const REPORTED = "reported (not looked up)";
const EXCEPTION = "an exception is reported instead";
const PARENTS = `Direct parent: ${REPORTED}; ultimate parent: ${REPORTED}.`;
const GOLDEN = "Golden copy of 2026-10-27.";

/** The summary made of the sentences that are not empty. */
const summaryOf = (...sentences: string[]): string =>
  [FIRST_SENTENCE, DISCLAIMER, ...sentences].filter((sentence) => sentence !== "").join(" ");

const CANONICAL_SUMMARY = summaryOf(IDENTITY, STATUS, PARENTS, GOLDEN);

/** The one record of an answer for the vendor's LEI. */
function recordOf(body: unknown = answerWith()) {
  const records = gleifRecordsOf(body, LEI);
  expect(records).toHaveLength(1);
  return records[0];
}

describe("the record of an answer", () => {
  it("is one record per LEI, under the LEI's id, with the facts of the entry and no more", () => {
    expect(recordOf()).toEqual({
      sourceRecordId: `gleif:${LEI}`,
      recordType: "lei_record",
      title: `LEI record: ${NAME}`,
      summary: CANONICAL_SUMMARY,
      url: `https://api.gleif.org/api/v1/lei-records/${LEI}`,
      identifiers: {
        lei: LEI,
        legalName: NAME,
        registrationStatus: "LAPSED",
        entityStatus: "ACTIVE",
        jurisdiction: "IE",
      },
      matchKeys: [`lei:${LEI}`],
      publishedAt: "2026-04-22",
      sourceUpdatedAt: null,
    });
  });

  it("is matched by the LEI alone: no name, no domain and no registration number", () => {
    expect(recordOf().matchKeys).toStrictEqual([`lei:${LEI}`]);
  });

  it("is the record that fetch gives, with the same text", async () => {
    const { records } = await gleifConnector.fetch(KEY, ctx(answering(answerWith())));

    expect(records).toEqual([recordOf()]);
  });

  it("holds what the columns and the prompt need", () => {
    expectWellFormedRecords(gleifRecordsOf(answerWith(), LEI), {
      sourceId: "gleif",
      mark: GLEIF_RECORD_MARK,
    });
  });

  it("is stored under the LEI in upper case, whatever case the answer writes it in", () => {
    const record = recordOf(answerWith({ attributes: { lei: LEI.toLowerCase() } }));

    expect(record.sourceRecordId).toBe(`gleif:${LEI}`);
    expect(record.matchKeys).toStrictEqual([`lei:${LEI}`]);
    expect(record.identifiers.lei).toBe(LEI);
    expect(record.url).toBe(`https://api.gleif.org/api/v1/lei-records/${LEI}`);
  });

  it("is the same record every time, and does not depend on the clock", async () => {
    const body = answerWith();
    const first = await gleifConnector.fetch(KEY, ctx(answering(body)));
    const again = await gleifConnector.fetch(
      KEY,
      ctx(answering(JSON.parse(JSON.stringify(body))), { now: new Date("2031-01-01T00:00:00Z") }),
    );

    expect(again).toEqual(first);
    expect(JSON.stringify(again)).toBe(JSON.stringify(first));
  });

  it("keeps a registration that is not lapsed as it is, with no remark on the date", () => {
    const record = recordOf(
      answerWith({
        entity: { jurisdiction: "US-DE" },
        registration: {
          status: "ISSUED",
          lastUpdateDate: "2026-02-17T09:12:34Z",
          nextRenewalDate: "2027-02-17T09:12:41Z",
        },
        relationships: PARENT_EXCEPTIONS,
      }),
    );

    expect(record.summary).toBe(
      summaryOf(
        `Legal name: ${NAME}; LEI ${LEI}; jurisdiction US-DE; legal form code AB12; category GENERAL.`,
        "Entity status ACTIVE; LEI registration status ISSUED, next renewal 2027-02-17 (UTC), last update 2026-02-17 (UTC).",
        `Direct parent: ${EXCEPTION}; ultimate parent: ${EXCEPTION}.`,
        GOLDEN,
      ),
    );
    expect(record.publishedAt).toBe("2026-02-17");
  });

  it("is made of what the answer holds, and of nothing else, when the answer holds little", () => {
    const record = recordOf(
      answerFor([{ type: "lei-records", id: LEI, attributes: { lei: LEI } }], {
        goldenCopy: undefined,
      }),
    );

    expect(record).toEqual({
      sourceRecordId: `gleif:${LEI}`,
      recordType: "lei_record",
      title: `LEI record: ${LEI}`,
      summary: summaryOf(`LEI ${LEI}.`),
      url: `https://api.gleif.org/api/v1/lei-records/${LEI}`,
      identifiers: { lei: LEI },
      matchKeys: [`lei:${LEI}`],
      publishedAt: null,
      sourceUpdatedAt: null,
    });
    expect(record.identifiers).toStrictEqual({ lei: LEI });
  });

  it("is no different for an entity that is a sole proprietor: no filter by kind of entity", () => {
    const record = recordOf(answerWith({ entity: { category: "SOLE_PROPRIETOR" } }));

    expect(record.summary).toContain("category SOLE_PROPRIETOR.");
    expect(record.matchKeys).toStrictEqual([`lei:${LEI}`]);
  });
});

describe("the parents", () => {
  const parentLink = (key: string) => ({ links: { [key]: "https://sentinel.example/ZZ-LINK" } });

  it.each([
    [
      "both have a record",
      PARENT_RECORDS,
      `Direct parent: ${REPORTED}; ultimate parent: ${REPORTED}.`,
    ],
    [
      "both have a reporting exception",
      PARENT_EXCEPTIONS,
      `Direct parent: ${EXCEPTION}; ultimate parent: ${EXCEPTION}.`,
    ],
    [
      "the direct one has a record and the ultimate one an exception",
      { ...PARENT_RECORDS, "ultimate-parent": PARENT_EXCEPTIONS["ultimate-parent"] },
      `Direct parent: ${REPORTED}; ultimate parent: ${EXCEPTION}.`,
    ],
    [
      "only the ultimate parent is given",
      { "ultimate-parent": PARENT_RECORDS["ultimate-parent"] },
      `Ultimate parent: ${REPORTED}.`,
    ],
    [
      "only the direct parent is given",
      { "direct-parent": PARENT_EXCEPTIONS["direct-parent"] },
      `Direct parent: ${EXCEPTION}.`,
    ],
    [
      "a parent has both a record and an exception: the record counts",
      {
        "direct-parent": {
          links: {
            "reporting-exception": "https://sentinel.example/ZZ-A",
            "lei-record": "https://sentinel.example/ZZ-B",
          },
        },
        "ultimate-parent": parentLink("lei-record"),
      },
      `Direct parent: ${REPORTED}; ultimate parent: ${REPORTED}.`,
    ],
    [
      "the link of a record is null and there is an exception: the exception counts",
      {
        "direct-parent": {
          links: { "lei-record": null, "reporting-exception": "https://sentinel.example/ZZ-A" },
        },
        "ultimate-parent": parentLink("reporting-exception"),
      },
      `Direct parent: ${EXCEPTION}; ultimate parent: ${EXCEPTION}.`,
    ],
  ])("says, when %s, what kind of link each has", (_what, relationships, parents) => {
    expect(recordOf(answerWith({ relationships })).summary).toBe(
      summaryOf(IDENTITY, STATUS, parents, GOLDEN),
    );
  });

  it.each([
    ["there are no relationships", undefined],
    ["the relationships are null", null],
    ["the relationships are a list", []],
    ["the relationships are text", "direct-parent"],
    ["they hold no parent", { "managing-lou": parentLink("related") }],
    ["a parent is null", { "direct-parent": null, "ultimate-parent": null }],
    ["a parent is a list", { "direct-parent": [], "ultimate-parent": [] }],
    ["a parent has no links", { "direct-parent": {}, "ultimate-parent": {} }],
    [
      "the links of a parent are a list",
      { "direct-parent": { links: [] }, "ultimate-parent": { links: "x" } },
    ],
    [
      "the links hold neither a record nor an exception",
      {
        "direct-parent": parentLink("relationship-record"),
        "ultimate-parent": parentLink("related"),
      },
    ],
    [
      "the links are empty or are not text",
      {
        "direct-parent": { links: { "lei-record": "", "reporting-exception": null } },
        "ultimate-parent": { links: { "lei-record": 7, "reporting-exception": {} } },
      },
    ],
  ])("leaves the sentence out when %s", (_what, relationships) => {
    const { summary } = recordOf(answerWith({ relationships }));

    expect(summary).toBe(summaryOf(IDENTITY, STATUS, GOLDEN));
    expect(summary).not.toContain("parent");
  });
});

describe("the dates", () => {
  const statusWith = (renewal: string, update: string): string =>
    [
      "Entity status ACTIVE; LEI registration status LAPSED",
      renewal === "" ? "" : `, next renewal ${renewal}`,
      update === "" ? "" : `, last update ${update}`,
      ".",
    ].join("");

  it("shows a lapsed registration with its renewal day: the UTC day of the instant, so marked", () => {
    const { summary } = recordOf(
      answerWith({ registration: { status: "LAPSED", nextRenewalDate: "2026-04-07T23:00:00Z" } }),
    );

    expect(summary).toContain("LEI registration status LAPSED, next renewal 2026-04-07 (UTC)");
  });

  it.each([
    ["an instant in UTC", "2026-04-07T23:00:00Z", "2026-04-07"],
    [
      "an instant in another zone: the UTC day, not the day as written",
      "2026-04-08T01:30:00+02:00",
      "2026-04-07",
    ],
    ["an instant west of UTC, a day later in UTC", "2026-04-07T20:00:00-05:00", "2026-04-08"],
    ["an instant with a fraction of a second", "2026-04-07T23:00:00.123456789Z", "2026-04-07"],
    ["a day alone", "2026-04-07", "2026-04-07"],
  ])("reads %s as the UTC day", (_what, written, day) => {
    const { summary, publishedAt } = recordOf(
      answerWith({ registration: { nextRenewalDate: written, lastUpdateDate: written } }),
    );

    expect(summary).toContain(statusWith(`${day} (UTC)`, `${day} (UTC)`));
    expect(publishedAt).toBe(day);
  });

  const NOT_AN_INSTANT: Array<[string, unknown]> = [
    ["a day written as dd/mm/yyyy", "07/04/2026"],
    ["a day in words", "7 April 2026"],
    ["a time with a blank in place of the T", "2026-04-07 23:00:00"],
    ["a time without a zone", "2026-04-07T23:00:00"],
    ["a day that does not exist", "2026-02-30T00:00:00Z"],
    ["an hour that does not exist", "2026-04-07T25:00:00Z"],
    ["a year 0", "0000-01-01T00:00:00Z"],
    ["text before the instant", " 2026-04-07T23:00:00Z"],
    ["text after the instant", "2026-04-07T23:00:00Z (UTC)"],
    ["empty text", ""],
    ["null", null],
    ["a number", 20260407],
    ["an object", {}],
  ];

  it.each(NOT_AN_INSTANT)(
    "leaves out a renewal that is %s, and keeps the rest",
    (_what, written) => {
      const { summary } = recordOf(answerWith({ registration: { nextRenewalDate: written } }));

      expect(summary).toBe(
        summaryOf(IDENTITY, statusWith("", "2026-04-22 (UTC)"), PARENTS, GOLDEN),
      );
    },
  );

  it.each(NOT_AN_INSTANT)(
    "leaves out a last update that is %s, and the record has no day",
    (_what, written) => {
      const { summary, publishedAt } = recordOf(
        answerWith({ registration: { lastUpdateDate: written } }),
      );

      expect(summary).toBe(
        summaryOf(IDENTITY, statusWith("2026-04-07 (UTC)", ""), PARENTS, GOLDEN),
      );
      expect(publishedAt).toBeNull();
    },
  );

  it("leaves out both dates, and the status stays", () => {
    const { summary } = recordOf(
      answerWith({ registration: { nextRenewalDate: "soon", lastUpdateDate: "recently" } }),
    );

    expect(summary).toBe(summaryOf(IDENTITY, statusWith("", ""), PARENTS, GOLDEN));
  });

  it("says nothing about how late a renewal is: that depends on the day, and is no fact of the record", () => {
    const { summary } = recordOf(answerWith());

    expect(summary).not.toMatch(/\b(overdue|late|ago|days?|months?|expired|expires)\b/i);
  });

  it.each([
    ["an instant", "2026-10-27T16:00:00Z", "Golden copy of 2026-10-27."],
    ["an instant in another zone", "2026-10-28T01:00:00+09:00", "Golden copy of 2026-10-27."],
    ["a day", "2026-10-27", "Golden copy of 2026-10-27."],
  ])("gives the day of the golden copy that is %s", (_what, published, sentence) => {
    expect(recordOf(answerWith({}, { goldenCopy: { publishDate: published } })).summary).toBe(
      summaryOf(IDENTITY, STATUS, PARENTS, sentence),
    );
  });

  it.each([
    ["is not an instant", { publishDate: "yesterday" }],
    ["has no publish date", {}],
    ["is not an object", "2026-10-27"],
    ["is null", null],
  ])("leaves out the golden copy when it %s", (_what, goldenCopy) => {
    expect(recordOf(answerWith({}, { goldenCopy })).summary).toBe(
      summaryOf(IDENTITY, STATUS, PARENTS),
    );
  });
});

describe("the codes, the statuses and the name", () => {
  const LINE_FEED = cp(0x0a);

  /** The sentence of the identity with the parts it has: a part that is empty is left out. */
  const identityOf = (jurisdiction: string, form: string, category: string): string =>
    `${[
      `Legal name: ${NAME}`,
      `LEI ${LEI}`,
      jurisdiction === "" ? "" : `jurisdiction ${jurisdiction}`,
      form === "" ? "" : `legal form code ${form}`,
      category === "" ? "" : `category ${category}`,
    ]
      .filter((part) => part !== "")
      .join("; ")}.`;

  it.each(["IE", "GB", "US-DE", "CA-ON", "FR-75C", "US-ABC"])(
    "reads the jurisdiction %s as it is written",
    (code) => {
      const record = recordOf(answerWith({ entity: { jurisdiction: code } }));

      expect(record.summary).toContain(`; jurisdiction ${code}; `);
      expect(record.identifiers.jurisdiction).toBe(code);
    },
  );

  it.each([
    ["in lower case", "ie"],
    ["of three letters", "IRL"],
    ["of one letter", "I"],
    ["with an empty region", "IE-"],
    ["with a region of four characters", "IE-ABCD"],
    ["with a region in lower case", "IE-d"],
    ["with a blank in it", "IE D"],
    ["with a blank before it", " IE"],
    ["with a line feed after it", `IE${LINE_FEED}`],
    ["that is empty", ""],
    ["that is null", null],
    ["that is a number", 5],
    ["that is a list", ["IE"]],
  ])("leaves out a jurisdiction %s", (_what, code) => {
    const record = recordOf(answerWith({ entity: { jurisdiction: code } }));

    expect(record.summary).toBe(
      summaryOf(identityOf("", "AB12", "GENERAL"), STATUS, PARENTS, GOLDEN),
    );
    expect(record.identifiers).not.toHaveProperty("jurisdiction");
  });

  it.each(["AB12", "QX7Z", "0000", "ZZZZ"])(
    "reads the legal form code %s as it is written",
    (id) => {
      const record = recordOf(answerWith({ entity: { legalForm: { id, other: null } } }));

      expect(record.summary).toContain(`; legal form code ${id}; `);
    },
  );

  it.each([
    ["in lower case", { id: "ab12", other: null }],
    ["of three characters", { id: "AB1", other: null }],
    ["of five characters", { id: "AB123", other: null }],
    ["with a blank in it", { id: "AB 1", other: null }],
    ["with a line feed after it", { id: `AB12${LINE_FEED}`, other: null }],
    ["that is null, with a free text of its own", { id: null, other: "ZZ-FORM-IN-WORDS" }],
    ["that is a number", { id: 1234, other: null }],
    ["that is not an object", "AB12"],
    ["that is null", null],
  ])("leaves out a legal form code %s", (_what, legalForm) => {
    const record = recordOf(answerWith({ entity: { legalForm } }));

    expect(record.summary).toBe(
      summaryOf(identityOf("IE", "", "GENERAL"), STATUS, PARENTS, GOLDEN),
    );
    expect(JSON.stringify(record)).not.toContain("ZZ-FORM-IN-WORDS");
  });

  it.each(["GENERAL", "FUND", "SOLE_PROPRIETOR", "RESIDENT_GOVERNMENT_ENTITY", "A".repeat(30)])(
    "reads the category %s as it is written",
    (category) => {
      expect(recordOf(answerWith({ entity: { category } })).summary).toContain(
        `; category ${category}.`,
      );
    },
  );

  it.each([
    ["in lower case", "general"],
    ["with a digit", "GENERAL1"],
    ["with a blank", "SOLE PROPRIETOR"],
    ["of 31 characters", "A".repeat(31)],
    ["that is empty", ""],
    ["that is null", null],
    ["that is a number", 7],
  ])("leaves out a category %s", (_what, category) => {
    expect(recordOf(answerWith({ entity: { category } })).summary).toBe(
      summaryOf(identityOf("IE", "AB12", ""), STATUS, PARENTS, GOLDEN),
    );
  });

  it.each(["INACTIVE", "NULL", "A".repeat(30)])(
    "reads the entity status %s as it is written",
    (status) => {
      const record = recordOf(answerWith({ entity: { status } }));

      expect(record.summary).toContain(`Entity status ${status}; LEI registration status LAPSED`);
      expect(record.identifiers.entityStatus).toBe(status);
    },
  );

  it.each(["ISSUED", "RETIRED", "MERGED", "PENDING_TRANSFER", "A".repeat(30)])(
    "reads the registration status %s as it is written",
    (status) => {
      const record = recordOf(answerWith({ registration: { status } }));

      expect(record.summary).toContain(`Entity status ACTIVE; LEI registration status ${status}, `);
      expect(record.identifiers.registrationStatus).toBe(status);
    },
  );

  it.each([
    ["in lower case", "lapsed"],
    ["with a blank after it", "LAPSED "],
    ["with a digit", "LAPSED2"],
    ["of 31 characters", "A".repeat(31)],
    ["that is empty", ""],
    ["that is null", null],
  ])("leaves out a status %s, and the sentence keeps the facts it still has", (_what, status) => {
    const entity = recordOf(answerWith({ entity: { status } }));
    const registration = recordOf(answerWith({ registration: { status } }));

    expect(entity.summary).toBe(
      summaryOf(
        IDENTITY,
        "LEI registration status LAPSED, next renewal 2026-04-07 (UTC), last update 2026-04-22 (UTC).",
        PARENTS,
        GOLDEN,
      ),
    );
    expect(entity.identifiers).not.toHaveProperty("entityStatus");
    expect(registration.summary).toBe(
      summaryOf(
        IDENTITY,
        "Entity status ACTIVE; next renewal 2026-04-07 (UTC), last update 2026-04-22 (UTC).",
        PARENTS,
        GOLDEN,
      ),
    );
    expect(registration.identifiers).not.toHaveProperty("registrationStatus");
  });

  it("leaves out the whole sentence of the status when it has nothing left", () => {
    const record = recordOf(
      answerWith({
        entity: { status: null },
        registration: { status: null, nextRenewalDate: null, lastUpdateDate: null },
      }),
    );

    expect(record.summary).toBe(summaryOf(IDENTITY, PARENTS, GOLDEN));
    expect(record.publishedAt).toBeNull();
  });

  it.each([
    ["no legal name", { legalName: undefined }],
    ["a legal name that is text, not an object", { legalName: NAME }],
    ["a legal name without a name", { legalName: { language: "en" } }],
    ["a name that is empty", { legalName: { name: "" } }],
    ["a name that is only white space", { legalName: { name: " \t " } }],
    ["a name that is a number", { legalName: { name: 5 } }],
    [
      "a name that is only characters nobody sees",
      { legalName: { name: cp(0x200b, 0x200e, 0xfeff) } },
    ],
  ])("falls back on the LEI for the title, with %s", (_what, entity) => {
    const record = recordOf(answerWith({ entity }));

    expect(record.title).toBe(`LEI record: ${LEI}`);
    expect(record.summary).toBe(
      summaryOf(
        `LEI ${LEI}; jurisdiction IE; legal form code AB12; category GENERAL.`,
        STATUS,
        PARENTS,
        GOLDEN,
      ),
    );
    expect(record.identifiers).not.toHaveProperty("legalName");
  });
});

describe("a legal name that someone else wrote", () => {
  const ZWSP = cp(0x200b);
  const LRM = cp(0x200e);
  const RLO = cp(0x202e);
  const BOM = cp(0xfeff);
  const NUL = cp(0);
  const BELL = cp(7);
  const LESS_FULLWIDTH = cp(0xff1c);
  const GREATER_FULLWIDTH = cp(0xff1e);
  const LONE_SURROGATE = cp(0xd800);
  const OPEN_QUOTE = cp(0x2039);
  const CLOSE_QUOTE = cp(0x203a);

  const recordNamed = (name: unknown): ParsedRecord =>
    recordOf(answerWith({ entity: { legalName: { name, language: "en" } } }));

  /** What no title, summary or identifier of a record may hold: markup, a control, a character nobody sees, a lone surrogate. */
  const HIDDEN_OR_MARKUP = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}<>]/u;

  function expectNameShown(record: ParsedRecord, shown: string): void {
    expect(record.title).toBe(`LEI record: ${shown}`);
    expect(record.summary).toContain(`Legal name: ${shown}; LEI ${LEI}; `);
    expect(record.identifiers.legalName).toBe(shown);
    for (const text of [record.title, record.summary, JSON.stringify(record.identifiers)]) {
      expect(text).not.toMatch(HIDDEN_OR_MARKUP);
    }
  }

  it("is shown without the characters nobody sees: zero-width, bidirectional, byte order mark", () => {
    const record = recordNamed(`Ac${ZWSP}me ${RLO}Analy${LRM}tics${BOM} Holdings Ltd`);

    expectNameShown(record, "Acme Analytics Holdings Ltd");
  });

  it("is shown without controls, and with the white space as one blank", () => {
    const record = recordNamed(`  Acme${NUL}  Analytics\t\r\n Holdings${BELL} Ltd  `);

    expectNameShown(record, "Acme Analytics Holdings Ltd");
  });

  it("is shown with its angle brackets written as the angle quotation marks, as a tag cannot be", () => {
    const record = recordNamed("Acme <script>alert(1)</script> Ltd");

    expectNameShown(
      record,
      `Acme ${OPEN_QUOTE}script${CLOSE_QUOTE}alert(1)${OPEN_QUOTE}/script${CLOSE_QUOTE} Ltd`,
    );
  });

  it("is shown with the full-width angle brackets that a fold would make real ones", () => {
    const record = recordNamed(`Acme ${LESS_FULLWIDTH}b${GREATER_FULLWIDTH} Ltd`);

    expectNameShown(record, `Acme ${OPEN_QUOTE}b${CLOSE_QUOTE} Ltd`);
  });

  it("is shown folded to its compatibility form, as every cell of every list is", () => {
    const record = recordNamed(`${cp(0xff21, 0xff23, 0xff2d, 0xff25)} Ltd`);

    expectNameShown(record, "ACME Ltd");
  });

  it("is shown with a lone surrogate replaced, so that no store refuses it", () => {
    const record = recordNamed(`Acme ${LONE_SURROGATE} Analytics`);

    expectNameShown(record, `Acme ${cp(0xfffd)} Analytics`);
    expect(JSON.stringify(record)).not.toMatch(/\\ud[89ab][0-9a-f]{2}/i);
    expectWellFormedRecords([record], {
      sourceId: "gleif",
      mark: GLEIF_RECORD_MARK,
    });
  });

  it.each([
    ["one word", "A".repeat(100_000)],
    ["many words", "Acme ".repeat(25_000)],
  ])("is cut to its limit, and the cut says so, when it is 100 KB of %s", (_what, name) => {
    const record = recordNamed(name);

    expect(record.title.length).toBeLessThanOrEqual(200);
    expect(record.title.startsWith("LEI record: ")).toBe(true);
    expect(record.title.endsWith(" [shortened]")).toBe(true);
    expect(record.summary.length).toBeLessThanOrEqual(1300);
    expect(record.summary.startsWith(`${FIRST_SENTENCE} ${DISCLAIMER} `)).toBe(true);
    // A name that was cut is no identifier: the title and the text show it cut, the identifiers leave it out.
    expect(record.identifiers).not.toHaveProperty("legalName");
    expectWellFormedRecords([record], {
      sourceId: "gleif",
      mark: GLEIF_RECORD_MARK,
    });
  });

  it("is shown with 100 KB of white space in it as one blank, and is no longer than it was", () => {
    expectNameShown(recordNamed(`Acme${" ".repeat(100_000)}Ltd`), "Acme Ltd");
  });

  it("is kept at 200 characters, a mark of the cut included, in the text; the identifiers leave a cut name out", () => {
    const record = recordNamed("N".repeat(250));

    const shown = `${"N".repeat(188)} [shortened]`;
    expect(shown).toHaveLength(200);
    // The title is cut again at its own limit, with its prefix: it still says that it was cut.
    expect(record.title.endsWith(" [shortened]")).toBe(true);
    expect(record.summary).toContain(`Legal name: ${shown}; LEI `);
    expect(record.identifiers).not.toHaveProperty("legalName");
    expect(JSON.stringify(record.identifiers)).not.toContain("shortened");
  });

  it("is an identifier whole when it fits in 200 characters, and no identifier at all when it is one more", () => {
    const fits = recordNamed("N".repeat(200));
    expect(fits.identifiers.legalName).toBe("N".repeat(200));

    const over = recordNamed("N".repeat(201));
    expect(over.identifiers).not.toHaveProperty("legalName");
    expect(over.title.endsWith(" [shortened]")).toBe(true);
    // A blank at the place of the cut: the cut line is shorter than the limit and still ends in the marker.
    const blank = recordNamed(`${"N".repeat(187)} ${"M".repeat(40)}`);
    expect(blank.identifiers).not.toHaveProperty("legalName");
    expect(JSON.stringify(blank.identifiers)).not.toContain("shortened");
    // A pair of surrogates at the place of the cut.
    const pair = recordNamed(`${"N".repeat(187)}${cp(0x1f600)}${"M".repeat(40)}`);
    expect(pair.identifiers).not.toHaveProperty("legalName");
    expect(JSON.stringify(pair.identifiers)).not.toContain("shortened");
  });

  it("stays in its place, after its label, when it reads like a sentence of the record", () => {
    const record = recordNamed("Acme. GLEIF endorses Acme. An LEI record is not reference data");

    expect(record.summary).toBe(
      summaryOf(
        `Legal name: Acme. GLEIF endorses Acme. An LEI record is not reference data; LEI ${LEI}; jurisdiction IE; legal form code AB12; category GENERAL.`,
        STATUS,
        PARENTS,
        GOLDEN,
      ),
    );
  });
});

describe("the fields that are never copied", () => {
  /** The two answers of the tests, which between them hold every token: the parents have a record, or an exception. */
  const WITH_RECORDS = answerWith();
  const WITH_EXCEPTIONS = answerWith({ relationships: PARENT_EXCEPTIONS });

  it("are in the answers of this test, so that a copy of one would be found", () => {
    const body = JSON.stringify([WITH_RECORDS, WITH_EXCEPTIONS]);

    for (const token of Object.values(LEFT_OUT)) expect(body).toContain(token);
    expect(body).toContain(LOU_LEI);
  });

  it.each([
    ["a parent that has a record", WITH_RECORDS],
    ["a parent that has a reporting exception", WITH_EXCEPTIONS],
  ])(
    "are in no part of the record: not the addresses, the codes of other registers, the issuer or the links, for %s",
    (_what, body) => {
      const everything = JSON.stringify(recordOf(body));

      for (const token of Object.values(LEFT_OUT)) expect(everything).not.toContain(token);
      expect(everything).not.toContain(LOU_LEI);
      expect(everything).not.toContain("sentinel.example");
      // The dates of fields that are not read.
      expect(everything).not.toContain("1999-01-02");
      expect(everything).not.toContain("2025-03-04");
    },
  );

  it("are in no part of the record that holds little: the title and the identifiers included", () => {
    const record = recordOf(answerWith({ entity: { legalName: undefined } }));

    expect(
      JSON.stringify([record.title, record.identifiers, record.url, record.matchKeys]),
    ).not.toMatch(/ZZ-|sentinel/);
  });

  it("do not give the record an address of the answer: its address is built from the LEI", () => {
    const body = answerWith();
    (body.data as Json[])[0].links = { self: "https://sentinel.example/ZZ-LINK-SELF" };

    expect(recordOf(body).url).toBe(`https://api.gleif.org/api/v1/lei-records/${LEI}`);
  });
});

describe("the text of a record", () => {
  /** Answers of every shape that the tests above made records of. */
  const BODIES: Array<[string, Json]> = [
    ["the answer of a lapsed registration, with parent records", answerWith()],
    [
      "the answer of a registration in force, with reporting exceptions",
      answerWith({ registration: { status: "ISSUED" }, relationships: PARENT_EXCEPTIONS }),
    ],
    ["an answer with no parent", answerWith({ relationships: {} })],
    [
      "an answer with no dates",
      answerWith(
        { registration: { nextRenewalDate: null, lastUpdateDate: null } },
        { goldenCopy: null },
      ),
    ],
    ["an answer with no name", answerWith({ entity: { legalName: null } })],
    [
      "an answer with a name of 100 KB",
      answerWith({ entity: { legalName: { name: "A".repeat(100_000) } } }),
    ],
    [
      "an answer with a name that holds markup",
      answerWith({ entity: { legalName: { name: "<b>Acme</b> Ltd" } } }),
    ],
  ];

  it.each(BODIES)("begins with its mark and keeps its second sentence whole: %s", (_what, body) => {
    const { summary } = recordOf(body);

    expect(summary.startsWith(GLEIF_RECORD_MARK)).toBe(true);
    expect(summary.startsWith("GLEIF LEI records (gleif.org)")).toBe(true);
    expect(summary.startsWith(`${FIRST_SENTENCE} ${DISCLAIMER}`)).toBe(true);
    expect(summary).toContain("GLEIF is not associated with VerifyWise");
    expect(summary.length).toBeLessThanOrEqual(1300);
  });

  it.each(BODIES)("holds no markup and nothing that is hidden: %s", (_what, body) => {
    const { title, summary } = recordOf(body);

    expect(title).not.toMatch(/[\p{Cc}\p{Cf}\p{Cs}<>]/u);
    expect(summary).not.toMatch(/[\p{Cc}\p{Cf}\p{Cs}<>]/u);
    expect(title.length).toBeLessThanOrEqual(200);
  });

  it.each(BODIES)(
    "says nothing of wrongdoing, and nothing that GLEIF vouches for: %s",
    (_what, body) => {
      const { title, summary } = recordOf(body);

      expect(`${title} ${summary}`).not.toMatch(
        /\b(endors\w*|certif\w*|approv\w*|guarant\w*|violat\w*|fraud\w*|illegal\w*|unlawful\w*|misconduct|penalt\w*|sanction\w*|breach\w*|fine[ds]?|fail\w*)\b/i,
      );
      expect(summary).not.toMatch(
        /GLEIF (provides|supports|authori[sz]es|vouches|confirms|has verified)/i,
      );
    },
  );

  it("is, at its worst, far under the limit, with its second sentence whole and its last one kept", () => {
    const record = recordOf(
      answerWith({
        entity: {
          legalName: { name: "N".repeat(250) },
          jurisdiction: "US-ABC",
          legalForm: { id: "ZZ99" },
          category: "C".repeat(30),
          status: "E".repeat(30),
        },
        registration: {
          status: "R".repeat(30),
          nextRenewalDate: "2026-12-31T23:59:59Z",
          lastUpdateDate: "2026-12-31T23:59:59Z",
        },
        relationships: PARENT_EXCEPTIONS,
      }),
    );

    const { summary } = record;
    expect(summary).toContain(
      `Legal name: ${"N".repeat(188)} [shortened]; LEI ${LEI}; jurisdiction US-ABC; legal form code ZZ99; category ${"C".repeat(30)}.`,
    );
    expect(summary).toContain(
      `Entity status ${"E".repeat(30)}; LEI registration status ${"R".repeat(30)}, next renewal 2026-12-31 (UTC), last update 2026-12-31 (UTC).`,
    );
    expect(summary).toContain(`Direct parent: ${EXCEPTION}; ultimate parent: ${EXCEPTION}.`);
    expect(summary.startsWith(`${FIRST_SENTENCE} ${DISCLAIMER} `)).toBe(true);
    expect(summary.endsWith(` ${GOLDEN}`)).toBe(true);
    // About 910 characters, far from the 1,300 that the evidence pack leaves room for.
    expect(summary.length).toBeGreaterThan(850);
    expect(summary.length).toBeLessThan(1000);
    expect(record.title.length).toBeLessThanOrEqual(200);
    expectWellFormedRecords([record], {
      sourceId: "gleif",
      mark: GLEIF_RECORD_MARK,
    });
  });
});

describe("gleifSummaryOf", () => {
  const FACTS: GleifFacts = {
    lei: LEI,
    legalName: NAME,
    jurisdiction: "IE",
    legalFormId: "AB12",
    category: "GENERAL",
    entityStatus: "ACTIVE",
    registrationStatus: "LAPSED",
    nextRenewal: "2026-04-07",
    lastUpdate: "2026-04-22",
    directParent: REPORTED,
    ultimateParent: REPORTED,
    goldenCopy: "2026-10-27",
  };

  it("writes the six sentences in their order", () => {
    expect(gleifSummaryOf(FACTS)).toBe(CANONICAL_SUMMARY);
  });

  it("writes nothing but the first two sentences and the LEI for a record that holds nothing else", () => {
    expect(
      gleifSummaryOf({
        lei: LEI,
        legalName: "",
        jurisdiction: "",
        legalFormId: "",
        category: "",
        entityStatus: "",
        registrationStatus: "",
        nextRenewal: "",
        lastUpdate: "",
        directParent: "",
        ultimateParent: "",
        goldenCopy: "",
      }),
    ).toBe(summaryOf(`LEI ${LEI}.`));
  });

  it("gives way in the facts, and in them alone, when its parts are longer than their caps", () => {
    const summary = gleifSummaryOf({ ...FACTS, legalName: "N".repeat(5000) });

    expect(summary.length).toBeLessThanOrEqual(1300);
    expect(summary.length).toBeGreaterThan(1280);
    expect(summary.startsWith(`${FIRST_SENTENCE} ${DISCLAIMER} Legal name: NNNN`)).toBe(true);
    expect(summary).toContain(" [shortened] ");
    expect(summary.endsWith(` ${GOLDEN}`)).toBe(true);
  });
});

describe("fetch: what goes wrong", () => {
  it.each([
    new FetchError("not_found"),
    new FetchError("unreachable"),
    new FetchError("blocked_by_site", undefined, { status: 429, retryAfterMs: 5000 }),
    new FetchError("unsupported_type"),
    new FetchError("not_allowed"),
    new Error("a failure that is no FetchError"),
  ])("lets %s through as it is, and asks once", async (error) => {
    const fetchJson = failing(error);

    await expect(gleifConnector.fetch(KEY, ctx(fetchJson))).rejects.toBe(error);
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it("passes the signal of the run to the request, and lets the failure of an aborted one through", async () => {
    const controller = new AbortController();
    controller.abort();
    const aborted = new FetchError("unreachable");
    const fetchJson = jest.fn(async (_url: string, options: { signal: AbortSignal }) => {
      if (options.signal.aborted) throw aborted;
      return answerWith();
    });

    await expect(
      gleifConnector.fetch(KEY, ctx(fetchJson, { signal: controller.signal })),
    ).rejects.toBe(aborted);
    expect(fetchJson.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it("writes nothing to the console, whatever the answer", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      jest.spyOn(console, method).mockImplementation(() => undefined),
    );
    try {
      await gleifConnector.fetch(KEY, ctx(answering(answerWith())));
      await gleifConnector.fetch(KEY, ctx(answering(answerFor([])))).catch(() => undefined);
      await gleifConnector.fetch(KEY, ctx(answering({ data: 1 }))).catch(() => undefined);
      await gleifConnector
        .fetch(KEY, ctx(failing(new FetchError("unreachable"))))
        .catch(() => undefined);
      await gleifConnector.fetch("name:acme", ctx(answering({}))).catch(() => undefined);
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it("has no console and no logger in its code", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../gleif.ts"), "utf8");

    expect(source).not.toMatch(/console\.|logger/);
  });
});

describe("through the page guard's fetchJson, over a transport that makes no connection", () => {
  const guarded = guardedFetch as jest.MockedFunction<typeof guardedFetch>;
  const { guardedFetch: realGuardedFetch } = jest.requireActual<
    typeof import("../../../../webResearch/guardedFetch")
  >("../../../../webResearch/guardedFetch");

  /** Answers every request with one body and keeps what was sent. */
  function overTransport(contentType: string, body: string, status = 200) {
    const sent: Array<{ url: string; headers: Record<string, string> }> = [];
    const transport: Transport = async ({ url, headers }) => {
      sent.push({ url: url.href, headers });
      return {
        status,
        headers: { "content-type": contentType },
        body: Readable.from([Buffer.from(body, "utf8")], { objectMode: false }),
      };
    };
    guarded.mockImplementation((url, options) => realGuardedFetch(url, options, { transport }));
    return sent;
  }

  beforeEach(() => guarded.mockReset());

  it("is asked in the plain filter form: the brackets as written, JSON asked for, the bot's own name", async () => {
    const sent = overTransport("application/json", JSON.stringify(answerWith()));

    const { records } = await gleifConnector.fetch(KEY, ctx(defaultFetchJson));

    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(REQUEST_URL);
    expect(sent[0].headers.Accept).toBe("application/json, */*;q=0.1");
    expect(sent[0].headers["User-Agent"]).toBe(BOT_USER_AGENT);
    expect(records).toEqual([recordOf()]);
    expect(guarded).toHaveBeenCalledWith(REQUEST_URL, {
      allowedContentTypes: ["application/json"],
      maxBytes: 131072,
      signal,
    });
  });

  it("refuses an answer that GLEIF types application/vnd.api+json, which it does for an Accept that allows any type", async () => {
    const sent = overTransport("application/vnd.api+json", JSON.stringify(answerWith()));

    const failure = await gleifConnector
      .fetch(KEY, ctx(defaultFetchJson))
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(FetchError);
    expect(failure).toMatchObject({ reason: "unsupported_type" });
    expect(sent).toHaveLength(1);
  });

  it("reads the answer for an LEI that GLEIF does not know as no record: it answers 200", async () => {
    overTransport("application/json", JSON.stringify(answerFor([])));

    await expect(gleifConnector.fetch(KEY, ctx(defaultFetchJson))).resolves.toEqual({
      records: [],
      coversSince: null,
    });
  });

  it("reads an answer with a name of 100 KB, which is within the limit of an answer", async () => {
    const body = JSON.stringify(
      answerWith({ entity: { legalName: { name: "A".repeat(100_000), language: "en" } } }),
    );
    expect(Buffer.byteLength(body)).toBeLessThan(131072);
    overTransport("application/json", body);

    const { records } = await gleifConnector.fetch(KEY, ctx(defaultFetchJson));

    expect(records).toHaveLength(1);
    expect(records[0].title.length).toBeLessThanOrEqual(200);
  });

  it("fails as an unreadable format for an answer that is longer than the limit, and does not read it", async () => {
    const body = JSON.stringify(
      answerWith({ entity: { legalName: { name: "A".repeat(200_000), language: "en" } } }),
    );
    expect(Buffer.byteLength(body)).toBeGreaterThan(131072);
    overTransport("application/json", body);

    await expect(gleifConnector.fetch(KEY, ctx(defaultFetchJson))).rejects.toMatchObject({
      reason: "unsupported_type",
    });
  });

  it("fails as an unreadable format for an answer that is no JSON", async () => {
    overTransport("application/json", "<html>not json</html>");

    await expect(gleifConnector.fetch(KEY, ctx(defaultFetchJson))).rejects.toMatchObject({
      reason: "unsupported_type",
    });
  });

  it.each([
    [404, "not_found"],
    [429, "blocked_by_site"],
    [500, "unreachable"],
  ])("fails as the guard fails for a status of %i", async (status, reason) => {
    overTransport("application/json", JSON.stringify({ message: "ZZ-MESSAGE" }), status);

    const failure = await gleifConnector
      .fetch(KEY, ctx(defaultFetchJson))
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(FetchError);
    expect(failure).toMatchObject({ reason });
    expect(
      JSON.stringify([(failure as Error).message, Object.values(failure as object)]),
    ).not.toContain("ZZ-MESSAGE");
  });
});
