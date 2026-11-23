/**
 * The 23 lists that the vendor risk database added on 2026-11-10, checked against every registry of
 * the server that names a list: the unions of the ids, the category and the cap of a list's records,
 * the class of its publisher and how surely a name matches it, the name the briefing gives it and the
 * name the verifier is told, whether its records only describe, whether the briefing names it when it
 * found nothing, and whether its records are events or states. One table below says all of this for
 * each; the registries are held to it, and the table is never read out of them. Two
 * registries are private to their module, and are reached by what they do: the classes by
 * `classifyRecord` and `recordMatchOf`, the event record types by `offerRecords`.
 *
 * Not repeated here: the marks of the lists are in marks.test.ts, the sheets of the registry in
 * sources.test.ts, the schedule in queue.test.ts, the connectors in worker.test.ts and their own tests.
 * The record type of a record of each connector is not checked either: no connector test exports a
 * record (their fixtures are the files of the shipped lists, and their helpers are contract helpers).
 * GLEIF is the one connector called below, through `gleifRecordsOf`, which is exported and takes an
 * answer. Three tests assert on the table alone (the counts, the disjoint record types and the
 * 30 characters): no change of the code can turn them red, and they guard the table itself.
 */
jest.mock("../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
// What lookup.ts imports from the database and from the queue: nothing here reads either.
jest.mock("../../../../utils/vrdb.utils", () => ({
  saveReadThroughAnswerQuery: jest.fn(),
  getVrdbSourceStatesQuery: jest.fn(),
  findVrdbRecordsByKeysQuery: jest.fn(),
  recordVendorVrdbMatchesQuery: jest.fn(),
}));
jest.mock("../queue", () => ({ enqueueRelabel: jest.fn() }));

import {
  RECORD_SOURCE_IDS,
  type ResearchCategory,
  VRDB_SOURCE_IDS,
  type VrdbSourceId,
} from "../../../../domain.layer/interfaces/i.vendorResearch";
import { describeGathered } from "../../gather";
import { VERIFIER_DATABASE_NAMES } from "../../prompts";
import {
  CONTEXT_ONLY_RECORD_SOURCES,
  LISTS_NAMED_WHEN_FOUND,
  MAX_RECORDS,
  RECORD_CATEGORY,
  type RecordsOutcome,
} from "../../records/types";
import { classifyRecord, recordMatchOf } from "../../sourceRegistry/classify";
import type { ResearchTarget } from "../../target";
import { gleifRecordsOf } from "../connectors/gleif";
import { offerRecords } from "../lookup";
import type { ParsedRecord, VrdbRow, VrdbSourceState } from "../types";
import { ACME_LEI } from "./helpers/lei";

/**
 * The 23 lists added on 2026-11-10, one row each: what each record is,
 * how many a run is given, whether it is an event (a lookback applies, the record keeps its day) or
 * a state (offered whatever its age, as of the copy), whether it can raise a risk or is context for
 * another, the class of its publisher and how surely a name matches, whether the briefing of the
 * loop names the list when it found nothing, the name the verifier is told for a record of the list,
 * and the name the briefing gives it. The registries are checked against this table and never the
 * table against them.
 */
interface NewList {
  id: VrdbSourceId;
  category: ResearchCategory;
  recordType: ParsedRecord["recordType"];
  maxRecords: number;
  temporal: "event" | "state";
  promptRole: "raises_risk" | "context_only";
  publisherClass: "official" | "trusted_press" | "unverified";
  match: "strong" | "weak";
  /** True when the briefing names the list only if it found records or failed. */
  namedWhenFound: boolean;
  verifierName: string;
  gatherName: string;
}

const NEW_LISTS: readonly NewList[] = [
  {
    id: "canada_sema",
    category: "legal_regulatory",
    recordType: "sanctions_entity",
    maxRecords: 2,
    temporal: "state",
    promptRole: "raises_risk",
    publisherClass: "official",
    match: "weak",
    namedWhenFound: false,
    verifierName: "Consolidated Canadian Autonomous Sanctions List",
    gatherName:
      "Consolidated Canadian Autonomous Sanctions List (entities Canada lists under its autonomous sanctions regulations; individuals and ships are not copied)",
  },
  {
    id: "california_breaches",
    category: "security_incidents",
    recordType: "breach_notice_summary",
    maxRecords: 2,
    temporal: "event",
    promptRole: "raises_risk",
    publisherClass: "official",
    match: "weak",
    namedWhenFound: true,
    verifierName: "California Attorney General data breach list",
    gatherName:
      "California Attorney General data breach list (data breach notices filed with the California Attorney General, summarised by the organisation that has the name of the vendor)",
  },
  {
    id: "uk_ofsi",
    category: "legal_regulatory",
    recordType: "sanctions_penalty_notice",
    maxRecords: 1,
    temporal: "event",
    promptRole: "raises_risk",
    publisherClass: "official",
    match: "weak",
    namedWhenFound: true,
    verifierName: "UK OFSI financial sanctions enforcement notices",
    gatherName:
      "UK OFSI financial sanctions enforcement notices (monetary penalties and breach disclosures whose party has the name of the vendor)",
  },
  {
    id: "charlotin",
    category: "ai_specific",
    recordType: "hallucination_cases",
    maxRecords: 2,
    temporal: "event",
    promptRole: "raises_risk",
    publisherClass: "trusted_press",
    match: "weak",
    namedWhenFound: true,
    verifierName: "AI Hallucination Cases database",
    gatherName:
      "AI Hallucination Cases database (court decisions on fabricated content in filings, counted by the AI tool named, which has the name of the vendor or of one of its products)",
  },
  {
    id: "ftc_penalties",
    category: "legal_regulatory",
    recordType: "civil_penalty_summary",
    maxRecords: 2,
    temporal: "event",
    promptRole: "raises_risk",
    publisherClass: "official",
    match: "weak",
    namedWhenFound: true,
    verifierName: "FTC civil penalty cases",
    gatherName:
      "FTC civil penalty cases (consumer protection civil penalty orders of the US Federal Trade Commission, summarised by the defendant company that has the name of the vendor)",
  },
  {
    id: "piperoll",
    category: "ai_specific",
    recordType: "agent_incidents",
    maxRecords: 1,
    temporal: "event",
    promptRole: "raises_risk",
    publisherClass: "unverified",
    match: "weak",
    namedWhenFound: true,
    verifierName: "PipeRoll Agent Incident Registry",
    gatherName:
      "PipeRoll Agent Incident Registry (incidents of AI agents kept by one editor, summarised by the company named as the agent's operator or written as a brand in an entry's title)",
  },
  {
    id: "eu_dg_comp",
    category: "legal_regulatory",
    recordType: "eu_competition_cases",
    maxRecords: 2,
    temporal: "event",
    promptRole: "raises_risk",
    publisherClass: "official",
    match: "weak",
    namedWhenFound: true,
    verifierName: "European Commission competition cases",
    gatherName:
      "European Commission competition cases (antitrust, cartel and Digital Markets Act cases of DG Competition that name an undertaking with the name of the vendor as a party; mergers are not included)",
  },
  {
    id: "disclose_io",
    category: "security_incidents",
    recordType: "disclosure_program",
    maxRecords: 1,
    temporal: "state",
    promptRole: "context_only",
    publisherClass: "unverified",
    match: "weak",
    namedWhenFound: true,
    verifierName: "disclose.io program list",
    gatherName:
      "disclose.io program list (a community-maintained list of organisations that publish a vulnerability disclosure policy; an entry is a contributor's claim, and a missing entry says nothing)",
  },
  {
    id: "uk_cma",
    category: "legal_regulatory",
    recordType: "competition_case_summary",
    maxRecords: 1,
    temporal: "event",
    promptRole: "raises_risk",
    publisherClass: "official",
    match: "weak",
    namedWhenFound: true,
    verifierName: "UK Competition and Markets Authority cases",
    gatherName:
      "UK Competition and Markets Authority cases (merger interventions and competition, consumer protection and digital markets cases whose party has the name of the vendor)",
  },
  {
    id: "canada_ai_register",
    category: "ai_specific",
    recordType: "algorithm_register_supplier",
    maxRecords: 1,
    temporal: "state",
    promptRole: "context_only",
    publisherClass: "official",
    match: "weak",
    namedWhenFound: true,
    verifierName: "Government of Canada AI Register",
    gatherName:
      "Government of Canada AI Register (federal AI systems whose vendor information has the name of the vendor; the departments' own statement, as of its release)",
  },
  {
    id: "ftc_competition",
    category: "legal_regulatory",
    recordType: "competition_action_summary",
    maxRecords: 2,
    temporal: "event",
    promptRole: "raises_risk",
    publisherClass: "official",
    match: "weak",
    namedWhenFound: true,
    verifierName: "FTC nonmerger enforcement actions",
    gatherName:
      "FTC nonmerger enforcement actions (antitrust enforcement actions of the US Federal Trade Commission whose matter title names a party with the name of the vendor)",
  },
  {
    id: "omb_ai_inventory",
    category: "ai_specific",
    recordType: "algorithm_register_supplier",
    maxRecords: 1,
    temporal: "state",
    promptRole: "context_only",
    publisherClass: "official",
    match: "weak",
    namedWhenFound: true,
    verifierName: "US federal AI use case inventory",
    gatherName:
      "US federal AI use case inventory (federal AI use cases whose vendor has the name of the vendor; the agencies' own statement, 2025 edition)",
  },
  {
    id: "co_sic_penalties",
    category: "legal_regulatory",
    recordType: "consumer_sanction_summary",
    maxRecords: 2,
    temporal: "event",
    promptRole: "raises_risk",
    publisherClass: "official",
    match: "weak",
    namedWhenFound: true,
    verifierName: "Colombia SIC consumer protection sanctions",
    gatherName:
      "Colombia SIC consumer protection sanctions (fines that Colombia's Superintendencia de Industria y Comercio imposed, summarised by the company that has the name of the vendor)",
  },
  {
    id: "uk_atrs",
    category: "ai_specific",
    recordType: "algorithm_register_supplier",
    maxRecords: 1,
    temporal: "state",
    promptRole: "context_only",
    publisherClass: "official",
    match: "weak",
    namedWhenFound: true,
    verifierName: "UK Algorithmic Transparency Records",
    gatherName:
      "UK Algorithmic Transparency Records (UK public bodies' records of algorithmic tools whose supplier has the name of the vendor)",
  },
  {
    id: "nhtsa_recalls",
    category: "legal_regulatory",
    recordType: "vehicle_recall_summary",
    maxRecords: 2,
    temporal: "event",
    promptRole: "raises_risk",
    publisherClass: "official",
    match: "weak",
    namedWhenFound: true,
    verifierName: "NHTSA vehicle and equipment recalls",
    gatherName:
      "NHTSA vehicle and equipment recalls (recall campaigns reported since 2010, summarised by the filer that has the name of the vendor)",
  },
  {
    id: "fmti",
    category: "ai_specific",
    recordType: "transparency_index_score",
    maxRecords: 1,
    temporal: "state",
    promptRole: "context_only",
    publisherClass: "trusted_press",
    match: "weak",
    namedWhenFound: true,
    verifierName: "Foundation Model Transparency Index",
    gatherName:
      "Foundation Model Transparency Index (the transparency indicators met by the developer that has the name of the vendor, December 2025 edition)",
  },
  {
    id: "uk_mhra",
    category: "legal_regulatory",
    recordType: "field_safety_notice_summary",
    maxRecords: 1,
    temporal: "event",
    promptRole: "raises_risk",
    publisherClass: "official",
    match: "weak",
    namedWhenFound: true,
    verifierName: "UK MHRA field safety notice lists",
    gatherName:
      "UK MHRA field safety notice lists (medical device field safety notices whose manufacturer has the name of the vendor)",
  },
  {
    id: "nl_algoritmeregister",
    category: "ai_specific",
    recordType: "algorithm_register_supplier",
    maxRecords: 1,
    temporal: "state",
    promptRole: "context_only",
    publisherClass: "official",
    match: "weak",
    namedWhenFound: true,
    verifierName: "Dutch Algorithm Register",
    gatherName:
      "Dutch Algorithm Register (algorithms of Dutch public bodies whose provider has the name of the vendor; the bodies' own statement)",
  },
  {
    id: "nhtsa_odi",
    category: "legal_regulatory",
    recordType: "defect_investigations",
    maxRecords: 2,
    temporal: "event",
    promptRole: "raises_risk",
    publisherClass: "official",
    match: "weak",
    namedWhenFound: true,
    verifierName: "NHTSA defect investigations",
    gatherName:
      "NHTSA defect investigations (investigations of vehicle and equipment defects, summarised by the manufacturer that has the name of the vendor)",
  },
  {
    id: "fedramp",
    category: "certifications",
    recordType: "cloud_authorization_status",
    maxRecords: 2,
    temporal: "state",
    promptRole: "context_only",
    publisherClass: "official",
    match: "weak",
    namedWhenFound: true,
    verifierName: "FedRAMP Marketplace",
    gatherName:
      "FedRAMP Marketplace (the US government's list of cloud offerings that are FedRAMP Authorized, Ready or In Process, summarised by the provider that has the name or the website of the vendor)",
  },
  {
    id: "epoch_ai",
    category: "ai_specific",
    recordType: "ai_model_developer",
    maxRecords: 1,
    temporal: "state",
    promptRole: "context_only",
    publisherClass: "trusted_press",
    match: "weak",
    namedWhenFound: true,
    verifierName: "Epoch AI Data on AI Models",
    gatherName:
      "Epoch AI Data on AI Models (AI models whose developing organisation has the name of the vendor, as Epoch classifies them)",
  },
  {
    id: "c2pa_conforming",
    category: "certifications",
    recordType: "c2pa_conformance",
    maxRecords: 1,
    temporal: "state",
    promptRole: "context_only",
    publisherClass: "trusted_press",
    match: "weak",
    namedWhenFound: true,
    verifierName: "C2PA Conforming Products List",
    gatherName:
      "C2PA Conforming Products List (products of the applicant that has the name of the vendor, accepted as conformant by the C2PA)",
  },
  {
    id: "gleif",
    category: "financial_health",
    recordType: "lei_record",
    maxRecords: 1,
    temporal: "state",
    promptRole: "context_only",
    publisherClass: "trusted_press",
    match: "strong",
    namedWhenFound: true,
    verifierName: "GLEIF LEI records",
    gatherName:
      "GLEIF LEI records (the reference data of the legal entity identifier stored on the vendor)",
  },
];

const EVENT_LISTS = NEW_LISTS.filter((list) => list.temporal === "event");
const STATE_LISTS = NEW_LISTS.filter((list) => list.temporal === "state");
const CONTEXT_ONLY_LISTS = NEW_LISTS.filter((list) => list.promptRole === "context_only");

const NOW = new Date("2026-10-30T12:00:00Z");
const ACME: ResearchTarget = {
  name: "Acme Analytics",
  domain: "acme-analytics.example",
  provides: "Analytics software",
};

describe("the table of the 23 lists", () => {
  it("holds 23 distinct lists: 12 events and 11 states, 13 that can raise a risk and 10 that only describe", () => {
    expect(NEW_LISTS).toHaveLength(23);
    expect(new Set(NEW_LISTS.map((list) => list.id)).size).toBe(23);
    expect(EVENT_LISTS).toHaveLength(12);
    expect(STATE_LISTS).toHaveLength(11);
    expect(CONTEXT_ONLY_LISTS).toHaveLength(10);
    expect(NEW_LISTS.filter((list) => list.promptRole === "raises_risk")).toHaveLength(13);
  });

  it("gives an event type to no state and a state type to no event: the lookup tells them apart by the record type", () => {
    const eventTypes = new Set(EVENT_LISTS.map((list) => list.recordType));
    const stateTypes = new Set(STATE_LISTS.map((list) => list.recordType));

    // Twelve events of twelve types; the eleven states share eight (four registers of algorithms
    // have one, and Canada's sanctions list keeps the type of the sanctions lists).
    expect(eventTypes.size).toBe(12);
    expect(stateTypes.size).toBe(8);
    expect([...eventTypes].filter((type) => stateTypes.has(type))).toEqual([]);
  });

  it("gives every list a record type that fits the column of the table of records (30 characters)", () => {
    // vrdb_records.record_type is VARCHAR(30), in the migration of the database.
    expect(NEW_LISTS.filter((list) => list.recordType.length > 30)).toEqual([]);
  });
});

describe("the unions of the server", () => {
  it("hold the 23 lists after the 14 shipped, and no list twice", () => {
    expect(VRDB_SOURCE_IDS).toHaveLength(37);
    expect(new Set(VRDB_SOURCE_IDS).size).toBe(37);
    // The record sources are the lists of the database, the status page and Have I Been Pwned.
    expect(RECORD_SOURCE_IDS).toHaveLength(39);
    expect(new Set(RECORD_SOURCE_IDS).size).toBe(39);
  });

  it.each(NEW_LISTS)("$id is a list of the database and a source of records", (list) => {
    expect(VRDB_SOURCE_IDS).toContain(list.id);
    expect(RECORD_SOURCE_IDS).toContain(list.id);
  });
});

describe("the registries that hold a value for each list", () => {
  it.each(NEW_LISTS)("$id: its records are of the category $category", (list) => {
    expect(RECORD_CATEGORY[list.id]).toBe(list.category);
  });

  it.each(NEW_LISTS)("$id: a run is given $maxRecords record(s) of it at most", (list) => {
    expect(MAX_RECORDS[list.id]).toBe(list.maxRecords);
  });

  it.each(NEW_LISTS)(
    "$id: a record is classified by its database as $publisherClass, with the database as its publisher",
    (list) => {
      expect(classifyRecord(list.id)).toEqual({
        category: list.publisherClass,
        publisher: list.id,
        entry: null,
        reviewed: true,
      });
    },
  );

  it.each(NEW_LISTS)(
    "$id: a name matches it $match, whatever identifier a person stored on the vendor",
    (list) => {
      const identified: ResearchTarget = {
        ...ACME,
        identifiers: { lei: ACME_LEI, registrationNumber: "HRB 12345 B", secCik: "0001234567" },
      };

      expect(recordMatchOf(list.id)).toBe(list.match);
      // A stored CIK strengthens the SEC's records and no list's other than the SEC's.
      expect(recordMatchOf(list.id, identified)).toBe(list.match);
    },
  );

  it.each(NEW_LISTS)("$id: the verifier is told its records by the name of the list", (list) => {
    expect(VERIFIER_DATABASE_NAMES[list.id]).toBe(list.verifierName);
  });
});

describe("the sets of the lists", () => {
  it.each(NEW_LISTS)(
    "$id: its records only describe, and never raise a risk, exactly when the table says: $promptRole",
    (list) => {
      expect(CONTEXT_ONLY_RECORD_SOURCES.has(list.id)).toBe(list.promptRole === "context_only");
    },
  );

  it("holds the ten lists whose records only describe, and no other", () => {
    expect([...CONTEXT_ONLY_RECORD_SOURCES].sort()).toEqual(
      CONTEXT_ONLY_LISTS.map((list) => list.id).sort(),
    );
    expect(CONTEXT_ONLY_RECORD_SOURCES.size).toBe(10);
  });

  it.each(NEW_LISTS)(
    "$id: the briefing names it only when it found records or failed, except Canada's sanctions list: $namedWhenFound",
    (list) => {
      expect(LISTS_NAMED_WHEN_FOUND.has(list.id)).toBe(list.namedWhenFound);
    },
  );

  it("holds 22 lists, all of those of the table but Canada's sanctions list, and no other", () => {
    expect([...LISTS_NAMED_WHEN_FOUND].sort()).toEqual(
      NEW_LISTS.filter((list) => list.id !== "canada_sema")
        .map((list) => list.id)
        .sort(),
    );
    expect(LISTS_NAMED_WHEN_FOUND.size).toBe(22);
  });
});

describe("the briefing of the loop (describeGathered)", () => {
  const outcomeOf = (
    source: VrdbSourceId,
    count: number,
    outcome: RecordsOutcome["outcome"] = "ok",
  ): RecordsOutcome => ({
    source,
    url: "https://list.example/",
    outcome,
    records: Array.from({ length: count }, (_, index) => ({
      url: `https://list.example/${index + 1}`,
      title: `Record ${index + 1}`,
      text: `The text of record ${index + 1}.`,
      publishedAt: "2026-08-15",
    })),
    omitted: {},
    ms: 1,
  });
  const linesOf = (list: NewList, count: number, outcome: RecordsOutcome["outcome"] = "ok") =>
    (describeGathered([], [], [list.category], [outcomeOf(list.id, count, outcome)]) ?? "").split(
      "\n",
    );

  it.each(NEW_LISTS)("$id is named by its own name when it gave a record", (list) => {
    expect(linesOf(list, 1)).toContain(`- ${list.gatherName}: 1 record`);
  });

  it.each(NEW_LISTS)("$id is named by its own name, with the failure, when it failed", (list) => {
    expect(linesOf(list, 0, "failed")).toContain(
      `- ${list.gatherName}: the database could not be reached`,
    );
  });

  it.each(NEW_LISTS)(
    "$id found nothing: counted in one line, and not named, when the briefing names it only when found ($namedWhenFound)",
    (list) => {
      const lines = linesOf(list, 0, "empty");

      // A list that is named when it found records is only counted when it found none.
      expect(lines.includes(`- ${list.gatherName}: no records`)).toBe(!list.namedWhenFound);
      expect(lines.includes("- 1 other list of the vendor risk database: no records")).toBe(
        list.namedWhenFound,
      );
    },
  );
});

describe("the lookup of the records (offerRecords)", () => {
  const stateOf = (id: VrdbSourceId): VrdbSourceState => ({
    id,
    lastSuccessAt: NOW,
    lastOutcome: "ok",
    sourceVersion: null,
    etag: null,
    lastModified: null,
    activeRecords: 10,
  });
  /** A record of the list that its list dated in 2000, and that matches the vendor by name and by LEI. */
  const oldRow = (list: NewList): VrdbRow => ({
    id: 1,
    sourceId: list.id,
    sourceRecordId: "X-1",
    recordType: list.recordType,
    status: "active",
    title: "Record 1",
    summary: "The text of record 1.",
    url: "https://list.example/?uid=X-1",
    matchKeys: ["name:acmeanalytics", `lei:${ACME_LEI}`],
    publishedAt: "2000-01-01",
  });
  /** The run of 2026-10-30 that researches the category of the list; GLEIF has an answer for the LEI. */
  const offerList = (list: NewList, cutoffs?: Partial<Record<ResearchCategory, string>>) =>
    offerRecords({
      rows: [oldRow(list)],
      states: [stateOf(list.id)],
      target: { ...ACME, identifiers: { lei: ACME_LEI } },
      researchable: [list.category],
      cutoffs,
      now: NOW,
      verifiedDomains: [],
      enabled: true,
      readThrough: new Map([
        ["gleif", { key: `lei:${ACME_LEI}`, weak: false, outcome: "fetched", fetchedAt: NOW }],
      ]),
    });
  const recordsOf = (result: ReturnType<typeof offerList>, id: VrdbSourceId) =>
    result.outcome.records.find((entry) => entry.source === id);

  it.each(EVENT_LISTS)(
    "$id: $recordType is an event type: the record keeps its day, and the lookback leaves a record of the year 2000 out",
    (list) => {
      const unlimited = offerList(list);
      const limited = offerList(list, { [list.category]: "2024-10-30" });

      expect(recordsOf(unlimited, list.id)?.records.map((record) => record.publishedAt)).toEqual([
        "2000-01-01",
      ]);
      expect(recordsOf(limited, list.id)).toEqual({
        source: list.id,
        records: [],
        omitted: { old: 1 },
      });
    },
  );

  it.each(STATE_LISTS)(
    "$id: $recordType is a state type: the record is as of the copy, and no lookback leaves it out",
    (list) => {
      const limited = offerList(list, { [list.category]: "2024-10-30" });

      expect(recordsOf(limited, list.id)?.records.map((record) => record.publishedAt)).toEqual([
        "2026-10-30",
      ]);
      expect(recordsOf(limited, list.id)?.omitted).toEqual({});
    },
  );
});

describe("the record of GLEIF's connector", () => {
  it("has the record type of the table, and the LEI as its one key, so that a name cannot reach it", () => {
    const gleif = NEW_LISTS.find((list) => list.id === "gleif");
    // What a filter by one LEI answers, with the fields the record reads.
    const body = {
      data: [
        {
          attributes: {
            lei: ACME_LEI,
            entity: { legalName: { name: "Acme Analytics Limited" }, jurisdiction: "IE" },
            registration: { status: "ISSUED" },
          },
        },
      ],
      meta: { pagination: { total: 1 } },
    };

    const records: ParsedRecord[] = gleifRecordsOf(body, ACME_LEI);

    expect(records).toHaveLength(1);
    expect(records[0].recordType).toBe(gleif?.recordType);
    expect(records[0].matchKeys).toEqual([`lei:${ACME_LEI}`]);
  });
});
