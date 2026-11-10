/**
 * The PipeRoll Agent Incident Registry (connectors/piperoll.ts): one static JSON file of entries
 * with no vendor field, read into one record per NAME that the entries show (the head of an
 * enterprise or startup operator, and brand-shaped words of a title). Every file here is invented:
 * the names are made up, the root has the registry's real shape, and no test touches the network
 * (a fake fetch serves the files).
 */
import { readFileSync } from "fs";
import { join } from "path";
import { FetchError } from "../../../../webResearch/guardedFetch";
import { compactName } from "../../../records/match";
import { PIPEROLL_RECORD_MARK, piperollConnector } from "../piperoll";
import { unreadableAllowed } from "../kit/clean";
import { BodyTooLargeError, NotTheListError } from "../types";
import {
  type FakeFile,
  expectDeterministic,
  expectWellFormedRecords,
  fakeFetch,
} from "./helpers/kitContract";

jest.setTimeout(30_000);

const MARK = PIPEROLL_RECORD_MARK;
const FILE_URL = "https://piperoll.org/registry.json";
const ETAG = 'W/"7c1d-4464e"';
const LAST_MODIFIED = "Wed, 04 Nov 2026 13:09:47 GMT";

/** The first sentence, the "not a finding" sentence and the attribution: fixed text of every record. */
const S1 = "PipeRoll Agent Incident Registry (piperoll.org), an AI incident list.";
const S2 =
  "Each entry is one editor's account of an incident involving an AI agent, not a finding of any authority, and naming a company in an entry does not say that it caused the incident.";
const S8 =
  "Source: PipeRoll, CC BY 4.0; titles shortened and edited, and entries counted, by VerifyWise.";

const RIGHT_QUOTE = String.fromCodePoint(0x2019);
/** Characters by code point, so that this file stays ASCII. */
const cp = (...codes: number[]): string => String.fromCodePoint(...codes);

/** The sort key of a name is the compact name; these brands are invented and brand-shaped. */
const BRANDS = [
  "ZorbixAI",
  "FrobNitz",
  "WumbaTek",
  "PlinkOps",
  "GrondleLab",
  "ThimbleX",
  "SnarfBot",
  "KlobbyDB",
];
const BRAND_KEYS = BRANDS.map(compactName).sort();
const CAUSES = [
  "policy-violation",
  "plain-error",
  "prompt-injection",
  "operator-error",
  "tool-error",
];
const SEVERITIES = ["near-miss", "loss", "degraded", "loss", "near-miss", "catastrophic"];

interface Spec {
  id: string;
  title?: string;
  sort_date?: string;
  status?: string;
  operator_type?: string;
  cause_key?: string;
  severity_key?: string;
  /** The page address of the entry as written; null leaves the key out. */
  url?: string | null;
  /** A cross-reference to another database, when the entry has one. */
  aiid?: string;
  /** Text of the fields that no record keeps. */
  prose?: string;
  /** Keys to leave out. */
  omit?: readonly string[];
}

/** An entry as the registry writes it: every value a string, 21 keys, 22 with a cross-reference. */
function entry(spec: Spec): Record<string, string> {
  const number = spec.id.slice(4);
  const prose = spec.prose ?? "plain prose";
  const pairs: Array<[string, string | undefined]> = [
    ["id", spec.id],
    ["title", spec.title ?? "agent changed a setting without review"],
    ["date_occurred", `${prose} date occurred`],
    ["date_disclosed", `${prose} date disclosed`],
    ["root_cause", `${prose} root cause`],
    ["failure_locus", `${prose} failure locus`],
    ["severity", `${prose} severity text`],
    ["exploitation_status", `${prose} exploitation`],
    ["direct_loss_usd", `${prose} loss`],
    ["status", spec.status ?? "corroborated (two independent sources)"],
    ["confidence", `${prose} confidence`],
    ["telemetry_grade", `${prose} telemetry`],
    ["operator_type", spec.operator_type ?? "unknown (no operator named)"],
    ["blast_radius", `${prose} blast radius`],
    ["aiid_incident_id", spec.aiid],
    ["url", spec.url === null ? undefined : (spec.url ?? `pir/${number}/`)],
    ["cause_key", spec.cause_key ?? "plain-error"],
    ["severity_key", spec.severity_key ?? "near-miss"],
    ["status_key", `${prose} status key`],
    ["locus_key", `${prose} locus key`],
    ["sort_date", spec.sort_date ?? "2025-06-15"],
    ["year_key", `${prose} year key`],
  ];
  const omitted = new Set(spec.omit ?? []);
  const out: Record<string, string> = {};
  for (const [key, value] of pairs) {
    if (value !== undefined && !omitted.has(key)) out[key] = value;
  }
  return out;
}

const pad = (value: number): string => String(value).padStart(4, "0");

/** A real day `offset` days after 2025-01-01. */
const dayAt = (offset: number): string =>
  new Date(Date.UTC(2025, 0, 1 + offset)).toISOString().slice(0, 10);

const FILLERS = 56;

/** Entries that fill the registry up to its floor: seven for each of the eight invented brands. */
function fillers(count = FILLERS): Array<Record<string, string>> {
  return Array.from({ length: count }, (_, at) =>
    entry({
      id: `PIR-2025-${pad(at + 1)}`,
      title: `${BRANDS[at % BRANDS.length]} agent exposed a staging credential in run ${at}`,
      sort_date: dayAt(at * 3),
      cause_key: CAUSES[at % CAUSES.length],
      severity_key: SEVERITIES[at % SEVERITIES.length],
    }),
  );
}

const registryText = (records: readonly unknown[]): string =>
  JSON.stringify(
    { registry: "PipeRoll Agent Incident Registry", generated_from: "incidents/*.md", records },
    null,
    2,
  );

const filesOf = (body: string, over: Partial<FakeFile> = {}): Record<string, FakeFile> => ({
  [FILE_URL]: {
    body,
    contentType: "application/json; charset=utf-8",
    etag: ETAG,
    lastModified: LAST_MODIFIED,
    ...over,
  },
});

interface Body {
  v: number;
  rows: Array<Record<string, unknown>>;
  total: number;
  unreadable: number;
}

/** The registry of these entries, downloaded and parsed. */
async function run(records: readonly unknown[], over: Partial<FakeFile> = {}) {
  const fetch = fakeFetch(filesOf(registryText(records), over));
  const snapshot = await piperollConnector.download(fetch, {});
  if (snapshot === "unchanged") throw new Error("The fake fetch answered unchanged.");
  const result = piperollConnector.parse(snapshot);
  const body = JSON.parse(snapshot.bodies[0]) as Body;
  const byId = new Map(result.records.map((record) => [record.sourceRecordId, record]));
  return { fetch, snapshot, result, body, byId };
}

/** The keys of the records that the fillers do not make. */
const extraKeys = (byId: ReadonlyMap<string, unknown>): string[] =>
  [...byId.keys()].filter((key) => !BRAND_KEYS.includes(key)).sort();

/**
 * What one entry of QuarkHub's with this title shows: the title as the text of the record and
 * the stored row quote it, and every byte that is kept. The operator names QuarkHub, so that an
 * entry whose title names nobody still makes a record.
 */
async function quotedEntry(title: string) {
  const { byId, body, snapshot, result } = await run([
    ...fillers(),
    entry({
      id: "PIR-2026-0960",
      title,
      operator_type: "enterprise (QuarkHub-operated SaaS, x)",
    }),
  ]);
  const row = body.rows.find((candidate) => candidate.id === "quarkhub");
  const newest = row?.newest as Array<{ title: string }> | undefined;
  return {
    byId,
    body,
    summary: byId.get("quarkhub")?.summary ?? "",
    stored: newest?.[0]?.title ?? "",
    everything: `${snapshot.bodies.join("")}${JSON.stringify(result.records)}`,
  };
}

/** The quote of a title: the same in the stored row and in the text of the record, or the test fails. */
async function expectQuote(title: string, expected: string): Promise<void> {
  const { summary, stored } = await quotedEntry(title);
  expect(stored).toBe(expected);
  expect(summary).toContain(`PIR-2026-0960 (2025-06-15, plain-error, near-miss): ${expected}.`);
}

/** The failure of a promise, or undefined when it did not fail. */
const failureOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );

const fullWidth = (text: string): string =>
  [...text]
    .map((char) => {
      const code = char.charCodeAt(0);
      return (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)
        ? String.fromCodePoint(code + 0xfee0)
        : char;
    })
    .join("");

/** `n` as letters only, so that a brand made of it holds no digit. */
const lettersOf = (n: number): string =>
  [...n.toString(26)].map((digit) => String.fromCharCode(97 + parseInt(digit, 26))).join("");
const brandOf = (n: number): string => `Brnd${lettersOf(n)}Tek`;

/**
 * A text of exactly `units` UTF-16 units (5 or more) that names nobody, lower-case words with single
 * blanks, and that ends in a blank: a title is built after it, so that the cut of a title to 300
 * units falls where a test needs it (the reader keeps the first 288 units and the marker).
 */
const fillerOf = (units: number): string => {
  const words = Math.floor(units / 5);
  return `${"w".repeat(4 + (units - words * 5))} ${"word ".repeat(words - 1)}`;
};

/** The separators of a case caption as a cleaned title writes them: a blank on each side, any letter case. */
const CAPTION_SEPARATORS = [
  " v. ",
  " v ",
  " vs. ",
  " vs ",
  " V. ",
  " V ",
  " VS. ",
  " VS ",
  " Vs. ",
  " vS ",
];

/** The one record that a single invented entry about `ZibbleCo` makes, with the fillers beside it. */
async function oneRecord(over: Partial<Spec>) {
  const { byId, body } = await run([
    ...fillers(),
    entry({ id: "PIR-2026-0300", title: "ZibbleCo agent did a thing", ...over }),
  ]);
  return { record: byId.get("zibbleco"), byId, body };
}

describe("piperollConnector", () => {
  describe("the connector", () => {
    it("is the snapshot connector of the list, at its first version", () => {
      expect(piperollConnector.id).toBe("piperoll");
      expect(piperollConnector.version).toBe(1);
      expect(piperollConnector.kind).toBeUndefined();
      expect(MARK).toBe("PipeRoll Agent Incident Registry");
    });

    it("asks the registry file once, with the limits of the list and the stored validators", async () => {
      const fetch = fakeFetch(filesOf(registryText(fillers())));
      const first = await piperollConnector.download(fetch, {});
      expect(first).not.toBe("unchanged");
      expect(fetch.calls).toHaveLength(1);
      expect(fetch.calls[0].url).toBe(FILE_URL);
      expect(fetch.calls[0].validators).toEqual({});
      expect(fetch.calls[0].limits).toEqual({
        maxBytes: 4_194_304,
        allowedContentTypes: ["application/json"],
        totalTimeoutMs: 60_000,
      });
    });

    it("keeps the validators of the file behind the version of its reading", async () => {
      const { snapshot } = await run(fillers());
      expect(snapshot.etag).toBe(`k1:${ETAG}`);
      expect(snapshot.lastModified).toBe(LAST_MODIFIED);
    });

    it("writes nothing to the console, and its code holds no console and no logger", async () => {
      const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
        jest.spyOn(console, method).mockImplementation(() => undefined),
      );
      try {
        await run([...fillers(), entry({ id: "PIR-2026-0301", sort_date: "garbage" })]);
      } finally {
        for (const spy of spies) {
          expect(spy).not.toHaveBeenCalled();
          spy.mockRestore();
        }
      }
      const source = readFileSync(join(__dirname, "..", "piperoll.ts"), "utf8");
      expect(source).not.toMatch(/console\.|logger/);
    });
  });

  describe("a registry that holds the names of eight brands", () => {
    it("gives one record for each name, whose id is the compact name", async () => {
      const { result, body } = await run(fillers());
      expect(result.records.map((record) => record.sourceRecordId)).toEqual(BRAND_KEYS);
      expect(result).toMatchObject({ errors: 0, skipped: 0, root: "registry.json" });
      expect(body.rows).toHaveLength(8);
      expect(body.total).toBe(FILLERS);
      expect(body.unreadable).toBe(0);
    });

    it("gives records that the database and the prompt can take", async () => {
      const { result } = await run(fillers());
      expectWellFormedRecords(result.records, { sourceId: "piperoll", mark: MARK });
    });

    it("begins every summary with the mark, and the first sentence names the host and the kind of list", async () => {
      const { result } = await run(fillers());
      for (const record of result.records) {
        expect(record.summary.startsWith(MARK)).toBe(true);
        expect(record.summary.startsWith(S1)).toBe(true);
        expect(record.summary).toContain(S2);
        expect(record.summary.endsWith(S8)).toBe(true);
      }
    });

    it("gives the newest day of the registry as the version of the list", async () => {
      const { result } = await run(fillers());
      expect(result.sourceVersion).toBe(dayAt((FILLERS - 1) * 3));
    });

    it("gives records of the type that the registry's list is read under, and no second source", async () => {
      const { result } = await run(fillers());
      expect(new Set(result.records.map((record) => record.recordType))).toEqual(
        new Set(["agent_incidents"]),
      );
      for (const record of result.records) {
        expect(record.sourceUpdatedAt).toBeNull();
        expect(record.title).toBe(
          `${MARK}: ${BRANDS.find((brand) => compactName(brand) === record.sourceRecordId)}`,
        );
      }
    });

    it("links the page of the newest entry of the name, built from its id", async () => {
      const { byId } = await run(fillers());
      // Brand 0 has the entries numbered 1, 9, 17, ... 49 (the newest has the highest day).
      expect(byId.get("zorbixai")?.url).toBe("https://piperoll.org/pir/2025-0049/");
      expect(byId.get("zorbixai")?.publishedAt).toBe(dayAt(48 * 3));
    });

    it("gives two entities that show different newest entries different addresses", async () => {
      const { result } = await run(fillers());
      const urls = result.records.map((record) => record.url);
      expect(new Set(urls).size).toBe(urls.length);
    });
  });

  describe("the record of one name, in full", () => {
    const ENTRIES = [
      entry({
        id: "PIR-2026-0101",
        title: "ZibbleCo agent deleted a customer table",
        sort_date: "2026-05-02",
        status: "corroborated (two sources)",
        cause_key: "policy-violation",
        severity_key: "loss",
      }),
      entry({
        id: "PIR-2026-0102",
        title: "ZibbleCo agent looped on a refund queue",
        sort_date: "2026-04-00",
        status: "corrected (the day was fixed)",
        cause_key: "plain-error",
        severity_key: "degraded",
      }),
      entry({
        id: "PIR-2026-0103",
        title: "ZibbleCo agent followed a planted instruction",
        sort_date: "2026-00-00",
        status: "disputed (the operator disagrees)",
        cause_key: "prompt-injection",
        severity_key: "near-miss",
      }),
      entry({
        id: "PIR-2026-0104",
        title: "ZibbleCo agent retried a payment twice",
        sort_date: "2025-11-20",
        cause_key: "tool-error",
        severity_key: "loss",
      }),
      entry({
        id: "PIR-2026-0105",
        title: "ZibbleCo agent ignored a rate limit",
        sort_date: "2025-10-03",
        cause_key: "operator-error",
        severity_key: "near-miss",
      }),
    ];

    it("is made as the template says: the id, the title, the keys and the address", async () => {
      const { byId } = await run([...fillers(), ...ENTRIES]);
      const record = byId.get("zibbleco");
      expect(record).toMatchObject({
        sourceRecordId: "zibbleco",
        recordType: "agent_incidents",
        title: "PipeRoll Agent Incident Registry: ZibbleCo",
        url: "https://piperoll.org/pir/2026-0101/",
        matchKeys: ["name:zibbleco"],
        publishedAt: "2026-05-02",
        sourceUpdatedAt: null,
        identifiers: {
          name: "ZibbleCo",
          entries: 5,
          ids: [
            "PIR-2026-0101",
            "PIR-2026-0102",
            "PIR-2026-0103",
            "PIR-2026-0104",
            "PIR-2026-0105",
          ],
        },
      });
    });

    it("has the text of the template, sentence by sentence", async () => {
      const { byId } = await run([...fillers(), ...ENTRIES]);
      const summary = byId.get("zibbleco")?.summary;
      expect(summary).toBe(
        [
          S1,
          S2,
          "Name in the entries: ZibbleCo.",
          "Entries that name it in the title or as the agent's operator: 5 (3 corroborated, 1 corrected, 1 marked disputed), dated 2025 to 2026.",
          "Severity as the registry rates it: loss 2, degraded 1, near-miss 2.",
          "Newest: PIR-2026-0101 (2026-05-02, policy-violation, loss): ZibbleCo agent deleted a customer table; " +
            "PIR-2026-0102 (2026-04, plain-error, degraded): ZibbleCo agent looped on a refund queue; " +
            "PIR-2026-0103 (2026, prompt-injection, near-miss, marked disputed): ZibbleCo agent followed a planted instruction.",
          "Other entries: PIR-2026-0104, PIR-2026-0105.",
          S8,
        ].join(" "),
      );
    });

    it("says only the year once when the entries share a year, and leaves out the parts that are zero", async () => {
      const { byId } = await run([
        ...fillers(),
        entry({
          id: "PIR-2026-0111",
          title: "ZibbleCo agent did a thing",
          sort_date: "2026-02-03",
        }),
      ]);
      const summary = byId.get("zibbleco")?.summary ?? "";
      expect(summary).toContain("dated 2026.");
      expect(summary).toContain("1 (1 corroborated), dated");
      expect(summary).not.toContain("corrected");
      expect(summary).not.toContain("Other entries");
      expect(summary).toContain("Severity as the registry rates it: near-miss 1.");
    });

    it("lists up to six of the other ids and says how many more there are", async () => {
      const many = Array.from({ length: 12 }, (_, at) =>
        entry({
          id: `PIR-2026-${pad(400 + at)}`,
          title: "ZibbleCo agent did a thing",
          sort_date: dayAt(at),
        }),
      );
      const { byId } = await run([...fillers(), ...many]);
      const summary = byId.get("zibbleco")?.summary ?? "";
      // The newest three are 411, 410 and 409; the six after them are 408 to 403; three more are left.
      expect(summary).toContain(
        "Other entries: PIR-2026-0408, PIR-2026-0407, PIR-2026-0406, PIR-2026-0405, PIR-2026-0404, PIR-2026-0403 and 3 more.",
      );
    });

    it("orders the newest entries by day, and entries of one day by id, the greatest first", async () => {
      const sameDay = ["PIR-2026-0501", "PIR-2026-0503", "PIR-2026-0502", "PIR-2026-0504"].map(
        (id) => entry({ id, title: "ZibbleCo agent did a thing", sort_date: "2026-03-03" }),
      );
      const { byId } = await run([...fillers(), ...sameDay]);
      const summary = byId.get("zibbleco")?.summary ?? "";
      expect(summary.indexOf("PIR-2026-0504 (")).toBeLessThan(summary.indexOf("PIR-2026-0503 ("));
      expect(summary.indexOf("PIR-2026-0503 (")).toBeLessThan(summary.indexOf("PIR-2026-0502 ("));
      expect(summary).toContain("Other entries: PIR-2026-0501.");
    });

    it("dates an entry that has only a year or a month by its first day", async () => {
      const { byId } = await run([
        ...fillers(),
        entry({
          id: "PIR-2026-0510",
          title: "ZibbleCo agent did a thing",
          sort_date: "2024-00-00",
        }),
        entry({
          id: "PIR-2026-0511",
          title: "ZibbleCo agent did a thing",
          sort_date: "2025-09-00",
        }),
      ]);
      // 2025-09-00 is 2025-09-01, which is after 2024-01-01.
      const summary = byId.get("zibbleco")?.summary ?? "";
      expect(summary.indexOf("PIR-2026-0511 (2025-09,")).toBeLessThan(
        summary.indexOf("PIR-2026-0510 (2024,"),
      );
      expect(byId.get("zibbleco")?.publishedAt).toBe("2025-09-01");
      expect(summary).toContain("dated 2024 to 2025.");
    });
  });

  describe("the date of an entry (sort_date)", () => {
    it.each([
      ["a day", "2026-05-02", "2026-05-02", "2026-05-02"],
      ["a day of a leap year", "2024-02-29", "2024-02-29", "2024-02-29"],
      ["a month with no day", "2026-04-00", "2026-04-01", "2026-04"],
      ["a year with no month and no day", "2026-00-00", "2026-01-01", "2026"],
    ])("reads %s", async (_name, written, day, shown) => {
      const { record } = await oneRecord({ sort_date: written });
      expect(record?.publishedAt).toBe(day);
      expect(record?.summary).toContain(`PIR-2026-0300 (${shown}, plain-error, near-miss)`);
    });

    it.each([
      ["a month above 12", "2026-13-01"],
      ["a day that does not exist", "2026-02-30"],
      ["a day of a year that is not a leap year", "2025-02-29"],
      ["a day written with no hyphens", "20260101"],
      ["a day of month 00 with a day", "2026-00-15"],
      ["a month of 00 beyond the first twelve", "2026-13-00"],
      ["year 0000", "0000-00-00"],
      ["a day with one digit", "2026-1-1"],
      ["a day and a time", "2026-05-02T00:00:00Z"],
      ["words", "not a date"],
      ["a day of the month that has 30", "2026-04-31"],
      ["nothing", ""],
    ])("refuses %s, and counts the entry as unreadable", async (_name, written) => {
      const { record, body } = await oneRecord({ sort_date: written });
      expect(record).toBeUndefined();
      expect(body.unreadable).toBe(1);
    });

    it("refuses an entry that has no date, or a date that is no text", async () => {
      const missing = await oneRecord({ omit: ["sort_date"] });
      expect(missing.record).toBeUndefined();
      expect(missing.body.unreadable).toBe(1);
      const { body } = await run([
        ...fillers(),
        {
          ...entry({ id: "PIR-2026-0300", title: "ZibbleCo agent did a thing" }),
          sort_date: 20260101,
        },
      ]);
      expect(body.unreadable).toBe(1);
    });
  });

  describe("the status of an entry", () => {
    it("counts an entry that is corroborated, corrected or disputed, and flags the disputed one", async () => {
      const { byId } = await run([
        ...fillers(),
        entry({ id: "PIR-2026-0601", title: "ZibbleCo agent a", status: "corroborated (x)" }),
        entry({ id: "PIR-2026-0602", title: "ZibbleCo agent b", status: "corrected (x)" }),
        entry({ id: "PIR-2026-0603", title: "ZibbleCo agent c", status: "disputed (x)" }),
      ]);
      const summary = byId.get("zibbleco")?.summary ?? "";
      expect(summary).toContain("3 (1 corroborated, 1 corrected, 1 marked disputed)");
      expect(summary.match(/marked disputed/g)).toHaveLength(2);
      expect(summary).toMatch(
        /PIR-2026-0603 \(2025-06-15, plain-error, near-miss, marked disputed\)/,
      );
    });

    it("counts an entry that is withdrawn nowhere: not in the record, not as unreadable", async () => {
      const { byId, body } = await run([
        ...fillers(),
        entry({ id: "PIR-2026-0610", title: "ZibbleCo agent a" }),
        entry({ id: "PIR-2026-0611", title: "ZibbleCo agent b", status: "withdrawn (retracted)" }),
      ]);
      expect(byId.get("zibbleco")?.summary).toContain("1 (1 corroborated)");
      expect(byId.get("zibbleco")?.identifiers).toMatchObject({
        entries: 1,
        ids: ["PIR-2026-0610"],
      });
      expect(body.unreadable).toBe(0);
    });

    it("gives no record for a name that only withdrawn entries show", async () => {
      const { byId } = await run([
        ...fillers(),
        entry({ id: "PIR-2026-0612", title: "ZibbleCo agent a", status: "withdrawn (retracted)" }),
      ]);
      expect(byId.has("zibbleco")).toBe(false);
    });

    it.each([
      ["a word that is not one of the four", "pending (review)"],
      ["a capital letter", "Corroborated (two sources)"],
      ["a word that goes on", "corroboratedish (two sources)"],
      ["nothing", ""],
    ])("refuses an entry whose status is %s", async (_name, status) => {
      const { byId, body } = await run([
        ...fillers(),
        entry({ id: "PIR-2026-0613", title: "ZibbleCo agent a", status }),
      ]);
      expect(byId.has("zibbleco")).toBe(false);
      expect(body.unreadable).toBe(1);
    });

    it("refuses an entry that has no status, or whose status is no text", async () => {
      const missing = await oneRecord({ omit: ["status"] });
      expect(missing.body.unreadable).toBe(1);
      const { body } = await run([
        ...fillers(),
        { ...entry({ id: "PIR-2026-0614", title: "ZibbleCo agent a" }), status: 4 },
      ]);
      expect(body.unreadable).toBe(1);
    });
  });

  describe("the address of an entry (url)", () => {
    it.each([
      ["the real form, with no slash in front", "pir/2026-0007/"],
      ["a slash in front", "/pir/2026-0007/"],
    ])("takes %s for the entry that it belongs to", async (_name, url) => {
      const { byId } = await run([
        ...fillers(),
        entry({ id: "PIR-2026-0007", title: "ZibbleCo agent a", url }),
      ]);
      expect(byId.get("zibbleco")?.url).toBe("https://piperoll.org/pir/2026-0007/");
    });

    it.each([
      ["the page of another entry", "pir/2026-0008/"],
      ["an address on another host", "https://evil.example/pir/2026-0007/"],
      ["an address on the registry's own host", "https://piperoll.org/pir/2026-0007/"],
      ["nothing", ""],
      ["two slashes in front", "//pir/2026-0007/"],
      ["no slash behind", "pir/2026-0007"],
      ["capitals", "PIR/2026-0007/"],
      ["a blank behind", "pir/2026-0007/ "],
    ])("refuses %s", async (_name, url) => {
      const { byId, body } = await run([
        ...fillers(),
        entry({ id: "PIR-2026-0007", title: "ZibbleCo agent a", url }),
      ]);
      expect(byId.has("zibbleco")).toBe(false);
      expect(body.unreadable).toBe(1);
    });

    it("refuses an entry with no address, or one that is no text", async () => {
      const missing = await run([
        ...fillers(),
        entry({ id: "PIR-2026-0007", title: "ZibbleCo agent a", url: null }),
      ]);
      expect(missing.body.unreadable).toBe(1);
      const { body } = await run([
        ...fillers(),
        { ...entry({ id: "PIR-2026-0007", title: "ZibbleCo agent a" }), url: 7 },
      ]);
      expect(body.unreadable).toBe(1);
    });

    it("never takes the address of the record from the cell: it is built from the id", async () => {
      const { byId, snapshot } = await run([
        ...fillers(),
        entry({ id: "PIR-2026-0007", title: "ZibbleCo agent a", url: "/pir/2026-0007/" }),
      ]);
      expect(byId.get("zibbleco")?.url).toBe("https://piperoll.org/pir/2026-0007/");
      // The body holds the id and not the address of the entry.
      expect(snapshot.bodies[0]).not.toContain("pir/2026");
    });
  });

  describe("the entry that is not one: id, title, cause and severity", () => {
    it.each([
      ["an id that is not a PIR id", { id: "INC-2026-0007", url: "pir/2026-0007/" }],
      ["an id of the wrong width", { id: "PIR-26-0007", url: "pir/26-0007/" }],
      ["an id with a blank behind", { id: "PIR-2026-0007 ", url: "pir/2026-0007 /" }],
      ["an empty title", { id: "PIR-2026-0007", title: "" }],
      ["a title that is only blanks and hidden characters", { id: "PIR-2026-0007", title: "   " }],
      ["an empty cause", { id: "PIR-2026-0007", cause_key: "" }],
      ["an empty severity", { id: "PIR-2026-0007", severity_key: "" }],
    ])("is unreadable for %s", async (_name, spec) => {
      const { body, byId } = await run([
        ...fillers(),
        entry({ title: "ZibbleCo agent a", ...spec }),
      ]);
      expect(byId.has("zibbleco")).toBe(false);
      expect(body.unreadable).toBe(1);
    });

    it("is unreadable when it is no object at all", async () => {
      const { body } = await run([...fillers(), null, 7, "text", [], true]);
      expect(body.unreadable).toBe(5);
    });

    it("is unreadable, whatever the file's order, for both entries that share one id", async () => {
      const one = entry({
        id: "PIR-2026-0007",
        title: "ZibbleCo agent a",
        sort_date: "2026-01-01",
      });
      const two = entry({
        id: "PIR-2026-0007",
        title: "ZibbleCo agent b",
        sort_date: "2026-02-02",
      });
      for (const order of [
        [one, two],
        [two, one],
      ]) {
        const { byId, body } = await run([...fillers(), ...order]);
        expect(byId.has("zibbleco")).toBe(false);
        expect(body.unreadable).toBe(2);
      }
    });

    it("keeps another severity word as the registry wrote it, and counts it with none of the four", async () => {
      const { byId } = await run([
        ...fillers(),
        entry({ id: "PIR-2026-0620", title: "ZibbleCo agent a", severity_key: "unheard-of" }),
        entry({ id: "PIR-2026-0621", title: "ZibbleCo agent b", severity_key: "loss" }),
      ]);
      const summary = byId.get("zibbleco")?.summary ?? "";
      expect(summary).toContain("PIR-2026-0620 (2025-06-15, plain-error, unheard-of)");
      expect(summary).toContain("Severity as the registry rates it: loss 1.");
    });

    it("leaves out the severity sentence when no entry has a severity of the four", async () => {
      const { byId } = await run([
        ...fillers(),
        entry({ id: "PIR-2026-0622", title: "ZibbleCo agent a", severity_key: "unheard-of" }),
      ]);
      expect(byId.get("zibbleco")?.summary).not.toContain("Severity as the registry rates it");
    });
  });

  describe("the name of the operator (rule P)", () => {
    const TITLE = "agent changed a setting without review";
    it.each([
      [
        "a head with -operated SaaS",
        "enterprise (Quillworks-operated SaaS, customer support)",
        ["quillworks"],
      ],
      [
        "a startup with as provider",
        "startup (Betaworks as provider, hosted agent)",
        ["betaworks"],
      ],
      [
        "-built and -distributed",
        "enterprise (Quillworks-built and -distributed, desktop app)",
        ["quillworks"],
      ],
      ["-built", "enterprise (Quillworks-built; internal tool)", ["quillworks"]],
      ["-operated", "enterprise (Quillworks-operated, a hosted agent)", ["quillworks"]],
      ["a head alone", "enterprise (Quillworks)", ["quillworks"]],
      [
        "two names with a slash",
        "enterprise (Quillworks/Betaworks, video platform)",
        ["betaworks", "quillworks"],
      ],
      ["a short name before a slash", "enterprise (Xyz/Quillworks, a thing)", ["quillworks"]],
      ["a parenthesis that is never closed", "enterprise (Quillworks", ["quillworks"]],
      ["a dot and an ampersand", "startup (Quill.works&Co, hosted)", ["quillworksco"]],
      [
        "more words after the first comma",
        "enterprise (Quillworks, internal (RL) training, x)",
        ["quillworks"],
      ],
    ])("gives the head of %s", async (_name, operator, keys) => {
      const { byId } = await run([
        ...fillers(),
        entry({ id: "PIR-2026-0700", title: TITLE, operator_type: operator }),
      ]);
      expect(extraKeys(byId)).toEqual(keys);
    });

    it.each([
      ["an individual", "individual (Jane Roe, a private person)"],
      ["an individual whose head looks like a company", "individual (Quillworks, one developer)"],
      ["three characters", "startup (xAI)"],
      ["a head with a space", "enterprise (Quillworks Labs, hosted)"],
      ["a head with no capital letter", "enterprise (quillworks, hosted)"],
      ["a capital E", "Enterprise (Quillworks, hosted)"],
      ["a category word that goes on", "enterprises (Quillworks, hosted)"],
      ["no parenthesis", "enterprise"],
      ["an empty parenthesis", "enterprise ()"],
      ["a description", "enterprise (no operator review, a single human directing the agent)"],
      ["a category that is neither", "unknown (Quillworks)"],
      ["a head that is not one token", "enterprise (Quillworks Inc, hosted)"],
    ])("gives no name for %s", async (_name, operator) => {
      const { byId, body } = await run([
        ...fillers(),
        entry({ id: "PIR-2026-0700", title: TITLE, operator_type: operator }),
      ]);
      expect(extraKeys(byId)).toEqual([]);
      // An entry that yields no name is no entity: neither a record nor unreadable.
      expect(body.unreadable).toBe(0);
    });

    const INVISIBLE = String.fromCodePoint(0x200b);
    it.each([
      [
        "full-width letters, which a fold makes ASCII",
        `enterprise (${fullWidth("Quillworks")}-operated SaaS, x)`,
      ],
      ["an invisible character before the category", `${INVISIBLE}enterprise (Quillworks, x)`],
      ["an invisible character inside the head", `enterprise (Quill${INVISIBLE}works, x)`],
      ["blanks and a tab around the cell", "  startup\t(Quillworks as provider, x)  "],
    ])("gives the head of a cell that the cleaning must fix first: %s", async (_name, operator) => {
      const { byId } = await run([
        ...fillers(),
        entry({ id: "PIR-2026-0703", title: TITLE, operator_type: operator }),
      ]);
      expect(extraKeys(byId)).toEqual(["quillworks"]);
    });

    it("never lets the cell reach the body or a record: an e-mail address and a nickname in it are dropped", async () => {
      const operator =
        "enterprise (Quillworks, exfil address bob.roe@attacker.example, npm author nickname bobby99)";
      const { snapshot, result, byId } = await run([
        ...fillers(),
        entry({ id: "PIR-2026-0701", title: TITLE, operator_type: operator }),
      ]);
      expect(extraKeys(byId)).toEqual(["quillworks"]);
      const everything = `${snapshot.bodies.join("")}${JSON.stringify(result.records)}`;
      expect(everything).not.toContain("attacker");
      expect(everything).not.toContain("bobby99");
      expect(everything).not.toContain("exfil");
    });

    it("counts an entry once for a name that its operator and its title both give", async () => {
      const { byId } = await run([
        ...fillers(),
        entry({
          id: "PIR-2026-0702",
          title: "QuillWorks agent leaked a note",
          operator_type: "enterprise (QuillWorks-operated SaaS, x)",
        }),
      ]);
      expect(byId.get("quillworks")?.identifiers).toMatchObject({ entries: 1 });
    });
  });

  describe("the brand-shaped words of a title (rule B)", () => {
    it.each([
      ["a possessive", "OpenAcme's agent deleted a table", ["openacme"]],
      ["a plain word", "The QuarkHub agent leaked a note", ["quarkhub"]],
      ["a hyphen: the part before it", "QuarkHub-driven agent leaked a note", ["quarkhub"]],
      ["two brands", "ZetaChat's agent and QuarkHub's plugin", ["quarkhub", "zetachat"]],
      [
        "a possessive with the other apostrophe",
        `ZetaChat${RIGHT_QUOTE}s agent leaked a note`,
        ["zetachat"],
      ],
      ["a word in parentheses", "agent leaked a note (QuarkHub)", ["quarkhub"]],
      [
        "full-width letters, which a fold makes ASCII",
        `${fullWidth("QuarkHub")} agent leaked a note`,
        ["quarkhub"],
      ],
      ["the party after v.", "Roe v. QuarkHub: agent leaked a note", ["quarkhub"]],
      [
        "a brand-shaped party before v., which is dropped",
        "BlipRoe v. QuarkHub: agent leaked a note",
        ["quarkhub"],
      ],
    ])("gives the name of %s", async (_name, title, keys) => {
      const { byId } = await run([...fillers(), entry({ id: "PIR-2026-0710", title })]);
      expect(extraKeys(byId)).toEqual(keys);
    });

    it.each([
      ["a single capital word", "Zorbix agent leaked a note"],
      ["an acronym", "HTTP agent leaked a note"],
      ["a model version", "GPT-5 agent leaked a note"],
      ["a CVE number", "agent leaked a note (CVE-2026-1)"],
      ["a common word", "Edge agent leaked a note"],
      ["a word with a digit", "Gpt5Turbo agent leaked a note"],
      ["three letters (a name key needs four)", "xAI agent leaked a note"],
      ["a lower-case word", "agent leaked a note of the quarkhub project"],
      ["a brand-shaped first party before v.", "BlipRoe v. agent leaked a note"],
    ])("gives no name for %s", async (_name, title) => {
      const { byId, body } = await run([...fillers(), entry({ id: "PIR-2026-0711", title })]);
      expect(extraKeys(byId)).toEqual([]);
      expect(body.unreadable).toBe(0);
    });

    it("drops everything before the first v. and keeps what follows it, a second v. included", async () => {
      const { byId } = await run([
        ...fillers(),
        entry({ id: "PIR-2026-0712", title: "BlipRoe v. QuarkHub v. ZetaChat: a case" }),
      ]);
      expect(extraKeys(byId)).toEqual(["quarkhub", "zetachat"]);
    });

    it.each(CAPTION_SEPARATORS)(
      "drops everything before the first separator, whatever its form: %j",
      async (separator) => {
        const { byId, body } = await run([
          ...fillers(),
          entry({
            id: "PIR-2026-0716",
            title: `BlipRoe${separator}QuarkHub: ZetaChat agent leaked a note`,
          }),
        ]);
        expect(extraKeys(byId)).toEqual(["quarkhub", "zetachat"]);
        expect(body.unreadable).toBe(0);
      },
    );

    it("takes the first of several separators of different forms, and keeps what follows it", async () => {
      const { byId } = await run([
        ...fillers(),
        entry({ id: "PIR-2026-0717", title: "BlipRoe vs. QuarkHub v ZetaChat: a case" }),
        entry({ id: "PIR-2026-0718", title: "BlipDoe V BlipRoe v. QuarkHub: a case" }),
      ]);
      expect(extraKeys(byId)).toEqual(["bliproe", "quarkhub", "zetachat"]);
    });

    it("keeps the names before a v or a vs that is no separator of a caption (no blank on one side, a hyphen, or another word)", async () => {
      const { byId } = await run([
        ...fillers(),
        entry({ id: "PIR-2026-0719", title: "BlipRoe v.QuarkHub: agent leaked a note" }),
        entry({ id: "PIR-2026-0724", title: "BlipDoe vs.ZetaChat: agent leaked a note" }),
        entry({ id: "PIR-2026-0725", title: "BlipMoe-v-FrobTrix: agent leaked a note" }),
        entry({ id: "PIR-2026-0726", title: "BlipPoe against ThimbleBox: agent leaked a note" }),
      ]);
      expect(extraKeys(byId)).toEqual([
        "blipdoe",
        "blipmoe",
        "blippoe",
        "bliproe",
        "quarkhub",
        "thimblebox",
        "zetachat",
      ]);
    });

    it("gives the name of a title that the cleaning of a cell must fold first", async () => {
      const zeroWidth = String.fromCodePoint(0x200b);
      const { byId } = await run([
        ...fillers(),
        entry({ id: "PIR-2026-0713", title: `Quark${zeroWidth}Hub agent leaked a note` }),
      ]);
      expect(extraKeys(byId)).toEqual(["quarkhub"]);
    });

    it("counts one entry for each name that it shows, and gives it to every record of those names", async () => {
      const { byId } = await run([
        ...fillers(),
        entry({ id: "PIR-2026-0714", title: "QuarkHub agent called ZetaChat and BlipDesk tools" }),
      ]);
      expect(extraKeys(byId)).toEqual(["blipdesk", "quarkhub", "zetachat"]);
      for (const key of ["blipdesk", "quarkhub", "zetachat"]) {
        expect(byId.get(key)?.identifiers).toMatchObject({ entries: 1, ids: ["PIR-2026-0714"] });
      }
    });

    it("gives a name of the operator and a name of the title to one entry, up to four names", async () => {
      const { byId } = await run([
        ...fillers(),
        entry({
          id: "PIR-2026-0715",
          title: "QuarkHub agent called ZetaChat and BlipDesk tools",
          operator_type: "startup (Quillworks as provider, x)",
        }),
      ]);
      expect(extraKeys(byId)).toEqual(["blipdesk", "quarkhub", "quillworks", "zetachat"]);
    });

    describe("a title that the reader cut to 300 units (no key is made of a cut text)", () => {
      /** The keys that a title gives, and whether its entry read. */
      async function keysOf(title: string): Promise<{ keys: string[]; unreadable: number }> {
        const { byId, body } = await run([...fillers(), entry({ id: "PIR-2026-0740", title })]);
        return { keys: extraKeys(byId), unreadable: body.unreadable };
      }

      it("gives no key to a name that the cut splits: VanQuorp cut after VanQ is no vanq", async () => {
        const title = `${fillerOf(284)}VanQuorp agent leaked a chat`;
        expect(title.length).toBeGreaterThan(300);
        // The reader keeps the first 288 units, which end after the Q.
        expect(title.slice(0, 288).endsWith(" VanQ")).toBe(true);
        expect(await keysOf(title)).toEqual({ keys: [], unreadable: 0 });
      });

      it("gives no key to a brand that the cut splits in the middle, and gives it when the title fits", async () => {
        const cut = `${fillerOf(282)}ZetaChat agent leaked a chat`;
        expect(cut.slice(0, 288).endsWith(" ZetaCh")).toBe(true);
        expect(await keysOf(cut)).toEqual({ keys: [], unreadable: 0 });
        const fits = `${fillerOf(100)}ZetaChat agent leaked a chat`;
        expect(fits.length).toBeLessThan(300);
        expect(await keysOf(fits)).toEqual({ keys: ["zetachat"], unreadable: 0 });
      });

      it("gives no key to the last whole word before a cut that falls after a blank: fail closed", async () => {
        const title = `${fillerOf(279)}QuarkHub more words follow after it`;
        // The first 288 units end with the brand and a blank, which the cut takes off.
        expect(title.slice(0, 288).endsWith(" QuarkHub ")).toBe(true);
        expect(await keysOf(title)).toEqual({ keys: [], unreadable: 0 });
      });

      it("takes only the last word: a name that an earlier word of the cut title gives stays", async () => {
        const title = `QuarkHub agent ${fillerOf(264)}ZetaChat more words follow after it`;
        expect(title.slice(0, 288).endsWith(" ZetaChat ")).toBe(true);
        expect(await keysOf(title)).toEqual({ keys: ["quarkhub"], unreadable: 0 });
        // The same brand, written twice: the last one is lost and the first one gives the key.
        const twice = `QuarkHub agent ${fillerOf(264)}QuarkHub more words follow after it`;
        expect(twice.slice(0, 288).endsWith(" QuarkHub ")).toBe(true);
        expect(await keysOf(twice)).toEqual({ keys: ["quarkhub"], unreadable: 0 });
      });

      it("drops only the last word of a cut title: the word before it is a key", async () => {
        const title = `${fillerOf(273)}QuarkHub ZetaChat more words follow after it`;
        expect(title.slice(0, 288).endsWith(" QuarkHub ZetaCh")).toBe(true);
        expect(await keysOf(title)).toEqual({ keys: ["quarkhub"], unreadable: 0 });
      });

      it("reads a title of exactly 300 units whole: it was not cut, and its last word is a key", async () => {
        const title = `${fillerOf(292)}QuarkHub`;
        expect(title).toHaveLength(300);
        expect(await keysOf(title)).toEqual({ keys: ["quarkhub"], unreadable: 0 });
        const shorter = `${fillerOf(291)}QuarkHub`;
        expect(shorter).toHaveLength(299);
        expect(await keysOf(shorter)).toEqual({ keys: ["quarkhub"], unreadable: 0 });
      });

      it("cuts a title of 301 units, and its last word before the cut is no key", async () => {
        // The brand ends at the 288th unit, where the reader's cut falls.
        const title = `${fillerOf(280)}QuarkHub and so on xx`;
        expect(title).toHaveLength(301);
        expect(await keysOf(title)).toEqual({ keys: [], unreadable: 0 });
        // One unit more of the same title changes nothing: what is cut does not give a key either.
        expect(await keysOf(`${title}x`)).toEqual({ keys: [], unreadable: 0 });
      });

      it("reads the part of a caption that follows the separator, and loses its last word", async () => {
        const title = `BlipRoe v. QuarkHub agent ${fillerOf(256)}ZetaChat and more words follow`;
        expect(title.slice(0, 288).endsWith(" ZetaCh")).toBe(true);
        expect(await keysOf(title)).toEqual({ keys: ["quarkhub"], unreadable: 0 });
      });

      it.each([
        ["a v", `QuarkHub agent ${fillerOf(272)}vulnerable and more words follow after it`, " v"],
        ["a vs", `QuarkHub agent ${fillerOf(271)}vsphere and more words follow after it`, " vs"],
        ["a v.", `QuarkHub agent ${fillerOf(271)}v. QuarkHub more words follow after it`, " v."],
      ])(
        "reads a title whose cut leaves %s as it would be read without that last word: the fragment is no separator of a caption",
        async (_name, title, end) => {
          // The real registry has a title cut after the first letter of a word that begins with v.
          expect(title.slice(0, 288).endsWith(end)).toBe(true);
          expect(await keysOf(title)).toEqual({ keys: ["quarkhub"], unreadable: 0 });
          const { stored } = await quotedEntry(title);
          expect(stored.startsWith("QuarkHub agent w")).toBe(true);
          expect(stored).not.toContain("A party");
        },
      );

      it("reads the first party of a caption whose separator the cut reached or went past, all but its last word (a residual: no rule can see the separator)", async () => {
        const reached = `BlipRoe ${fillerOf(278)}v. QuarkHub more words follow after it`;
        expect(reached.slice(0, 288).endsWith(" v.")).toBe(true);
        expect(await keysOf(reached)).toEqual({ keys: ["bliproe"], unreadable: 0 });
        const past = `BlipRoe ${fillerOf(300)}v. QuarkHub more words follow after it`;
        expect(await keysOf(past)).toEqual({ keys: ["bliproe"], unreadable: 0 });
      });

      it("treats a title that ends in the marker as cut, whoever cut it", async () => {
        expect(await keysOf("Agent of QuarkHub [shortened]")).toEqual({ keys: [], unreadable: 0 });
        expect(await keysOf("Agent of QuarkHub and ZetaChat [shortened]")).toEqual({
          keys: ["quarkhub"],
          unreadable: 0,
        });
        // A cut that left nothing of the text is the marker alone: no word, and the entry reads.
        expect(await keysOf("[shortened]")).toEqual({ keys: [], unreadable: 0 });
      });

      it("does not take the word of the marker for the last word: a title that merely holds a word like it is read whole", async () => {
        expect(await keysOf("Agent of QuarkHub shortened")).toEqual({
          keys: ["quarkhub"],
          unreadable: 0,
        });
        expect(await keysOf("QuarkHub [shortened] agent leaked a note")).toEqual({
          keys: ["quarkhub"],
          unreadable: 0,
        });
      });

      it("shows the quote of a cut title made of the whole title, with its own cut to 80 as a display", async () => {
        const title = `McQuarb agent ${fillerOf(270)}VanQuorp agent leaked a chat`;
        expect(title.length).toBeGreaterThan(300);
        const { stored, summary, everything } = await quotedEntry(title);
        expect(stored.startsWith("[name] agent wwww")).toBe(true);
        expect(stored.endsWith(" [shortened]")).toBe(true);
        expect(stored.length).toBeLessThanOrEqual(80);
        expect(summary).toContain(`near-miss): ${stored}.`);
        expect(everything).not.toContain("McQuarb");
      });
    });
  });

  describe("the person-shaped words of a title (rule B never takes one)", () => {
    /** Invented surnames, one for each prefix of the surname shape: a prefix, a capital, lower-case letters. */
    const SURNAMES = [
      "McQuarb",
      "MacFlorn",
      "DeVrax",
      "DiNarbo",
      "DaSilmo",
      "LaTonk",
      "LeBrunt",
      "VanQuorp",
      "VonTrebel",
      "DuPlinx",
      "DelFarro",
      "DerKlonk",
      "DenBlarg",
      "TerBlink",
      "TenFrond",
      // A prefix and more than one capitalised part, and the prefixes Dela, Fitz, San and St.
      "DeLaZorb",
      "VanDerZorb",
      "McZorbJr",
      "McQuarbZed",
      "FitzZorb",
      "SanZorb",
      "StZorb",
      "DelaZorb",
    ];
    /** Invented handles: three or more lower-case letters, then a capital. */
    const HANDLES = ["darkQuill", "stormFrob", "mogTrex", "flinkTrexIO"];
    /**
     * A single capital glued in front of a surname shape is an initial and a surname (JMcZorb),
     * and the digits at the ends of a person-shaped word do not make it another word.
     */
    const GLUED = ["JMcZorb", "JVanZorb", "KDeLaZorb", "AMacFlorn", "XFitzZorb", "PStZorb"];
    const DIGITS = [
      "McZorb2",
      "McZorb2024",
      "DeLaZorb7",
      "darkQuill7",
      "darkQuill2024",
      "JMcZorb3",
    ];

    /** The titles that one word is written into: a free word, a party after v., a possessive, a hyphen. */
    const titlesOf = (word: string): Array<[string, string]> => [
      ["a free word", `Agent of ${word} leaked a chat`],
      ["the party after v.", `Roe v. ${word}: agent deleted a table`],
      ["a possessive", `Agent emailed ${word}'s contacts`],
      ["a possessive with the other apostrophe", `Agent emailed ${word}${RIGHT_QUOTE}s contacts`],
      ["the part before a hyphen", `Agent of ${word}-owned shop leaked a chat`],
      ["a full-width word, which a fold makes ASCII", `Agent of ${fullWidth(word)} leaked a chat`],
    ];

    it.each([...SURNAMES, ...GLUED, ...DIGITS, ...HANDLES])(
      "gives no key and no name for %s, in any place of a title",
      async (word) => {
        // What each place of the title gives: the extra keys, whether the word reached the body or a
        // record, and how many entries did not read. An entry that yields no name is no entity: neither
        // a record nor unreadable, and its text is nowhere.
        const found: Record<string, unknown> = {};
        const expected: Record<string, unknown> = {};
        for (const [place, title] of titlesOf(word)) {
          const { byId, body, snapshot, result } = await run([
            ...fillers(),
            entry({ id: "PIR-2026-0720", title }),
          ]);
          const everything = `${snapshot.bodies.join("")}${JSON.stringify(result.records)}`;
          found[place] = {
            keys: extraKeys(byId),
            inText: everything.toLowerCase().includes(word.toLowerCase()),
            unreadable: body.unreadable,
          };
          expected[place] = { keys: [], inText: false, unreadable: 0 };
        }
        expect(found).toEqual(expected);
      },
    );

    it.each([
      ["a capital, a lower-case run and a capital run", "ZorbAI", "zorbai"],
      ["a capital and two humps", "ZorbHub", "zorbhub"],
      ["a prefix of the surname shape that goes on in lower case", "DeepZorb", "deepzorb"],
      ["another such prefix", "MacroZorb", "macrozorb"],
      ["a lower-case run that ends in a hump", "ZorbedIn", "zorbedin"],
      ["one lower-case letter first", "iZorb", "izorb"],
      ["one lower-case letter first and a capital run", "xQAI", "xqai"],
      ["two lower-case letters first", "ioZorb", "iozorb"],
      ["a surname prefix in lower case, which is no surname shape", "mcQuarb", "mcquarb"],
      [
        "a surname shape that goes on with a capital that no lower-case letter follows",
        "McQuarbZ",
        "mcquarbz",
      ],
      ["the same with a run of capitals", "McQuarbAI", "mcquarbai"],
      ["a prefix and capitals only, no lower case after the capital", "LaMDA", "lamda"],
      [
        "a prefix of the surname shape that goes on in lower case, as a product",
        "DeepSeek",
        "deepseek",
      ],
      ["a prefix and two capitals, no lower case after the first", "SanZQ", "sanzq"],
      ["a surname shape that does not begin the word", "ZorbMcQuarb", "zorbmcquarb"],
      ["a prefix and one capital with no lower-case letter after it", "VanQ", "vanq"],
      // The glued initial is ONE capital, in front of a prefix that a capital and lower case follow.
      ["a glued capital before a prefix that goes on in lower case", "IDeepZorb", "ideepzorb"],
      ["a glued capital before a prefix and capitals only", "JLaMDA", "jlamda"],
      [
        "two capitals glued in front of a surname shape: more than one initial (a residual)",
        "XYMcZorb",
        "xymczorb",
      ],
      ["a lower-case letter glued in front of a surname shape (a residual)", "jMcZorb", "jmczorb"],
      ["a brand of two humps that begins with a capital and no prefix", "GitHub", "github"],
      ["a brand of a capital and two humps", "LinkedIn", "linkedin"],
      [
        "a brand whose first hump begins like a prefix and goes on in lower case",
        "DeepMind",
        "deepmind",
      ],
      ["a brand of a capital, lower case and a hump", "OpenAcme", "openacme"],
    ])(
      "keeps the name of a word with %s, in a free word, after v. and as a possessive",
      async (_name, word, key) => {
        for (const title of [
          `Agent of ${word} leaked a chat`,
          `Roe v. ${word}: agent deleted a table`,
          `Agent emailed ${word}'s contacts`,
        ]) {
          const { byId } = await run([...fillers(), entry({ id: "PIR-2026-0721", title })]);
          expect(extraKeys(byId)).toEqual([key]);
        }
      },
    );

    it("keeps the other names of a title that holds a person-shaped word", async () => {
      const { byId } = await run([
        ...fillers(),
        entry({
          id: "PIR-2026-0722",
          title: "McQuarb's agent called ZetaChat and darkQuill's bot",
        }),
      ]);
      expect(extraKeys(byId)).toEqual(["zetachat"]);
      expect(byId.get("zetachat")?.identifiers).toMatchObject({ entries: 1 });
    });

    it("still gives the name that an operator cell names, whatever the shape of the word", async () => {
      const { byId } = await run([
        ...fillers(),
        entry({
          id: "PIR-2026-0730",
          title: "Agent of McQuarb leaked a chat",
          operator_type: "enterprise (McQuarb-operated SaaS, x)",
        }),
        // The title alone names nobody: this entry does not count for the name.
        entry({ id: "PIR-2026-0731", title: "McQuarb's agent deleted a table" }),
        entry({
          id: "PIR-2026-0732",
          title: "Agent of darkQuill leaked a chat",
          operator_type: "startup (darkQuill as provider, x)",
        }),
      ]);
      expect(extraKeys(byId)).toEqual(["darkquill", "mcquarb"]);
      expect(byId.get("mcquarb")?.identifiers).toMatchObject({
        entries: 1,
        ids: ["PIR-2026-0730"],
      });
      expect(byId.get("darkquill")?.identifiers).toMatchObject({
        entries: 1,
        ids: ["PIR-2026-0732"],
      });
    });

    /**
     * What the quote of a newest entry shows for each place of `titlesOf`: the word is one `[name]`,
     * and what follows its hyphen stays (the shapes are told of every part of a hyphenated word).
     */
    const QUOTES: Record<string, string> = {
      "a free word": "Agent of [name] leaked a chat",
      "the party after v.": "A party v. [name]: agent deleted a table",
      "a possessive": "Agent emailed [name] contacts",
      "a possessive with the other apostrophe": "Agent emailed [name] contacts",
      "the part before a hyphen": "Agent of [name]-owned shop leaked a chat",
      "a full-width word, which a fold makes ASCII": "Agent of [name] leaked a chat",
    };

    it.each([...SURNAMES, ...GLUED, ...DIGITS, ...HANDLES])(
      "quotes %s as one [name] in the newest entry of a record, in the text and in the stored row, in any place of a title",
      async (word) => {
        const found: Record<string, unknown> = {};
        const expected: Record<string, unknown> = {};
        for (const [place, title] of titlesOf(word)) {
          const { summary, stored, everything } = await quotedEntry(title);
          found[place] = {
            stored,
            inText: summary.includes(`near-miss): ${stored}.`),
            anywhere: everything.toLowerCase().includes(word.toLowerCase()),
          };
          expected[place] = { stored: QUOTES[place], inText: true, anywhere: false };
        }
        expect(found).toEqual(expected);
      },
    );
  });

  describe("two spellings of one name", () => {
    it("are one record, and the more frequent spelling is its display", async () => {
      const { byId, body } = await run([
        ...fillers(),
        entry({ id: "PIR-2026-0800", title: "ZetaChat agent a" }),
        entry({ id: "PIR-2026-0801", title: "ZetaChat agent b" }),
        entry({ id: "PIR-2026-0802", title: "agent c", operator_type: "enterprise (Zetachat, x)" }),
      ]);
      expect(extraKeys(byId)).toEqual(["zetachat"]);
      expect(byId.get("zetachat")?.title).toBe(`${MARK}: ZetaChat`);
      const row = body.rows.find((candidate) => candidate.id === "zetachat");
      expect(row?.names).toEqual(["ZetaChat", "Zetachat"]);
    });

    it("tie by the order of their characters, whatever the order of the file", async () => {
      const entries = [
        entry({ id: "PIR-2026-0810", title: "ZetaChat agent a" }),
        entry({ id: "PIR-2026-0811", title: "agent b", operator_type: "enterprise (Zetachat, x)" }),
      ];
      for (const order of [entries, [...entries].reverse()]) {
        const { byId } = await run([...fillers(), ...order]);
        // C (U+0043) sorts before c (U+0063).
        expect(byId.get("zetachat")?.title).toBe(`${MARK}: ZetaChat`);
      }
    });

    it("count once for each entry, even when one entry writes both", async () => {
      const { body } = await run([
        ...fillers(),
        entry({
          id: "PIR-2026-0812",
          title: "ZetaChat agent a",
          operator_type: "enterprise (Zetachat, x)",
        }),
        entry({ id: "PIR-2026-0813", title: "Zetachat is no brand but ZetaChat is" }),
      ]);
      const row = body.rows.find((candidate) => candidate.id === "zetachat");
      expect(row).toMatchObject({ entries: 2, names: ["ZetaChat", "Zetachat"] });
    });

    it("are at most five in the record, the most frequent first and the rest in order", async () => {
      const spellings = [
        "ZetaChat",
        "ZetaChaT",
        "ZEtaChat",
        "zEtaChat",
        "ZeTaChat",
        "ZetAChat",
        "ZetaCHat",
      ];
      // The first spelling is written three times, the second twice, each of the others once.
      const counts = [3, 2, 1, 1, 1, 1, 1];
      const records: Array<Record<string, string>> = [];
      let at = 0;
      spellings.forEach((spelling, index) => {
        for (let time = 0; time < counts[index]; time += 1) {
          records.push(
            entry({ id: `PIR-2026-${pad(900 + at)}`, title: `${spelling} agent ${at}` }),
          );
          at += 1;
        }
      });
      const { body, byId } = await run([...fillers(), ...records]);
      const row = body.rows.find((candidate) => candidate.id === "zetachat");
      const rest = spellings.slice(2).sort();
      expect(row?.names).toEqual(["ZetaChat", "ZetaChaT", ...rest.slice(0, 3)]);
      expect(byId.get("zetachat")?.title).toBe(`${MARK}: ZetaChat`);
      expect(row?.entries).toBe(10);
    });
  });

  describe("an entity of many entries", () => {
    it("lists at most 100 ids in the identifiers, says how many more in the text, and stays small", async () => {
      const many = Array.from({ length: 120 }, (_, at) =>
        entry({
          id: `PIR-2026-${pad(2000 + at)}`,
          title: "MegaBrandCo agent did a thing",
          sort_date: dayAt(400 + at),
        }),
      );
      const { byId, body } = await run([...fillers(), ...many]);
      const record = byId.get("megabrandco");
      const ids = (record?.identifiers as { ids: string[] }).ids;
      expect(ids).toHaveLength(100);
      // The stored row holds no more than the record can list: the three newest entries and 97 ids.
      const row = body.rows.find((candidate) => candidate.id === "megabrandco");
      const otherIds = row?.otherIds as string[];
      expect(otherIds).toHaveLength(97);
      expect(otherIds[0]).toBe("PIR-2026-2116");
      expect(otherIds[96]).toBe("PIR-2026-2020");
      expect(row?.newest).toHaveLength(3);
      // Newest first: entry 119 down to entry 20.
      expect(ids[0]).toBe("PIR-2026-2119");
      expect(ids[99]).toBe("PIR-2026-2020");
      expect(record?.summary).toContain(
        "Other entries: PIR-2026-2116, PIR-2026-2115, PIR-2026-2114, PIR-2026-2113, PIR-2026-2112, PIR-2026-2111 and 111 more.",
      );
      expect(JSON.stringify(record?.identifiers).length).toBeLessThan(2000);
      expect(record?.identifiers).toMatchObject({ entries: 120 });
    });
  });

  describe("the name in the identifiers is the whole name, never a cut one", () => {
    /** A brand-shaped name of exactly `units` units: a hump and no digit, and no shape of a person. */
    const nameOf = (units: number): string => `Zq${"a".repeat(units - 5)}Tek`;

    it.each([60, 61, 99, 100, 101, 131, 160])(
      "keeps a name of %i units whole in the identifiers and in the names, and cuts only what the title and the text show",
      async (units) => {
        const name = nameOf(units);
        expect(name).toHaveLength(units);
        const { byId, body } = await run([
          ...fillers(),
          entry({ id: "PIR-2026-1100", title: `${name} agent did a thing` }),
        ]);
        const record = byId.get(compactName(name));
        expect(record?.identifiers).toMatchObject({ name, entries: 1 });
        expect(record?.matchKeys).toEqual([`name:${compactName(name)}`]);
        // The title and the sentence of the text show the name cut to 60, with the mark of a cut.
        const shown = units <= 60 ? name : `${name.slice(0, 48)} [shortened]`;
        expect(record?.title).toBe(`${MARK}: ${shown}`);
        expect(record?.summary).toContain(`Name in the entries: ${shown}.`);
        const row = body.rows.find((candidate) => candidate.id === compactName(name));
        expect(row?.names).toEqual([name]);
        expect(row?.display).toBe(name);
      },
    );

    it("keeps the whole spelling of an operator whose dotted head is longer than any cut of the identifiers", async () => {
      // 249 units, 127 compact characters: the full stops are not part of the key, so the entry reads.
      const name = `Zq${"a.".repeat(122)}Tek`;
      expect(name).toHaveLength(249);
      expect(compactName(name)).toHaveLength(127);
      const { byId, body } = await run([
        ...fillers(),
        entry({
          id: "PIR-2026-1101",
          title: "agent did a thing",
          operator_type: `enterprise (${name}-operated SaaS, x)`,
        }),
      ]);
      expect(body.unreadable).toBe(0);
      const record = byId.get(compactName(name));
      expect(record?.identifiers).toMatchObject({ name, entries: 1 });
      expect(record?.matchKeys).toEqual([`name:${compactName(name)}`]);
      expect(JSON.stringify(record?.identifiers).length).toBeLessThan(2000);
      expect(record?.title).toBe(`${MARK}: ${name.slice(0, 48)} [shortened]`);
    });

    it("stays inside the budget of the identifiers with the longest spelling and 100 ids", async () => {
      const name = `Zq${"a.".repeat(122)}Tek`;
      const many = Array.from({ length: 120 }, (_, at) =>
        entry({
          id: `PIR-2026-${pad(2200 + at)}`,
          title: "agent did a thing",
          sort_date: dayAt(400 + at),
          operator_type: `enterprise (${name}-operated SaaS, x)`,
        }),
      );
      const { byId, body } = await run([...fillers(), ...many]);
      expect(body.unreadable).toBe(0);
      const record = byId.get(compactName(name));
      expect(record).toBeDefined();
      expect(record?.identifiers).toMatchObject({ name, entries: 120 });
      expect((record?.identifiers as { ids: string[] }).ids).toHaveLength(100);
      expect(JSON.stringify(record?.identifiers).length).toBeLessThan(2000);
    });

    it("keeps the first spelling whole when a name is written two ways: the identifiers name the one that the title shows", async () => {
      const long = nameOf(131);
      const other = long.replace(/Tek$/, "tek");
      expect(other).not.toBe(long);
      const { byId, body } = await run([
        ...fillers(),
        entry({ id: "PIR-2026-1102", title: `${long} agent a` }),
        entry({ id: "PIR-2026-1103", title: `${long} agent b` }),
        entry({
          id: "PIR-2026-1104",
          title: "agent c",
          operator_type: `enterprise (${other}, x)`,
        }),
      ]);
      const record = byId.get(compactName(long));
      expect(record?.identifiers).toMatchObject({ name: long, entries: 3 });
      const row = body.rows.find((candidate) => candidate.id === compactName(long));
      expect(row?.names).toEqual([long, other]);
    });
  });

  describe("the title of a newest entry", () => {
    it("is read to 300 characters and shown cut to 80, with the mark of a cut, in the text and in the body", async () => {
      const title = `ZibbleCo agent ${"word ".repeat(40)}end`;
      expect(title.length).toBeGreaterThan(200);
      const { byId, body } = await run([...fillers(), entry({ id: "PIR-2026-0950", title })]);
      const shown = `${title.slice(0, 68)} [shortened]`;
      expect(shown).toHaveLength(80);
      const summary = byId.get("zibbleco")?.summary ?? "";
      expect(summary).toContain(
        `Newest: PIR-2026-0950 (2025-06-15, plain-error, near-miss): ${shown}.`,
      );
      expect(summary).not.toContain(title.slice(0, 100));
      const row = body.rows.find((candidate) => candidate.id === "zibbleco");
      expect(row?.newest).toEqual([
        {
          id: "PIR-2026-0950",
          dateText: "2025-06-15",
          cause: "plain-error",
          severity: "near-miss",
          disputed: false,
          title: shown,
        },
      ]);
    });

    it("keeps a title of 80 characters whole, and drops the full stops and blanks at the end of what it shows", async () => {
      const title = `ZibbleCo agent ${"x".repeat(80 - 15 - 3)}...`;
      expect(title).toHaveLength(80);
      const { byId } = await run([...fillers(), entry({ id: "PIR-2026-0951", title })]);
      const summary = byId.get("zibbleco")?.summary ?? "";
      expect(summary).toContain(`near-miss): ZibbleCo agent ${"x".repeat(62)}.`);
      expect(summary).not.toContain("...");
    });
  });

  describe("the quote of a newest entry's title", () => {
    describe("the first party of a case caption", () => {
      const QUOTED = "A party v. QuarkHub: agent leaked a note";
      /** The title, what it quotes, and the words of it that must be nowhere in the text or the body. */
      const CAPTIONS: Array<[string, string, string, string[]]> = [
        ["a name", "Roe v. QuarkHub: agent leaked a note", QUOTED, ["Roe"]],
        ["a brand-shaped name", "BlipRoe v. QuarkHub: agent leaked a note", QUOTED, ["BlipRoe"]],
        ["a person-shaped name", "McQuarb v. QuarkHub: agent leaked a note", QUOTED, ["McQuarb"]],
        ["a handle", "darkQuill v. QuarkHub: agent leaked a note", QUOTED, ["darkQuill"]],
        [
          "a name of several words",
          "Jane Roe and John Doe v. QuarkHub: agent leaked a note",
          QUOTED,
          ["Jane", "Roe", "John", "Doe"],
        ],
        [
          "a name with a possessive and a hyphen",
          "Roe's heirs-at-law v. QuarkHub: agent leaked a note",
          QUOTED,
          ["Roe", "heirs"],
        ],
        [
          "a name with the other apostrophe",
          `Roe${RIGHT_QUOTE}s kin v. QuarkHub: agent leaked a note`,
          QUOTED,
          ["Roe", "kin"],
        ],
        ["a name with a digit", "Roe2 v. QuarkHub: agent leaked a note", QUOTED, ["Roe2"]],
        ["a single letter", "R v. QuarkHub: agent leaked a note", QUOTED, []],
        ["a name in brackets", "In re (Roe) v. QuarkHub: agent leaked a note", QUOTED, ["Roe"]],
        [
          "a caption whose blanks are no-break spaces, which the fold of a cell makes blanks",
          `Roe${cp(0xa0)}v.${cp(0xa0)}QuarkHub: agent leaked a note`,
          QUOTED,
          ["Roe"],
        ],
        [
          "a caption whose blanks are tabs and more than one blank",
          "Roe \t v. \t QuarkHub: agent leaked a note",
          QUOTED,
          ["Roe"],
        ],
      ];

      it.each(CAPTIONS)(
        "is not quoted when it is %s: the text and the stored row say A party",
        async (_name, title, expected, gone) => {
          await expectQuote(title, expected);
          const { everything } = await quotedEntry(title);
          for (const word of gone) expect(everything).not.toContain(word);
        },
      );

      it("keeps what follows the first v., a second v. included", async () => {
        await expectQuote(
          "Roe v. QuarkHub v. ZetaChat: a case",
          "A party v. QuarkHub v. ZetaChat: a case",
        );
      });

      describe("the separator of a caption: v, v., vs and vs., in any letter case", () => {
        it.each(CAPTION_SEPARATORS)(
          "takes the text before %j out as the first party, and keeps the separator as it is written",
          async (separator) => {
            const title = `Roe${separator}QuarkHub: agent leaked a note`;
            await expectQuote(title, `A party${separator}QuarkHub: agent leaked a note`);
            const { everything } = await quotedEntry(title);
            expect(everything).not.toContain("Roe");
          },
        );

        it.each([
          ["no-break spaces", cp(0xa0)],
          ["tabs", "\t"],
          ["several blanks", "   "],
          ["a mix of blanks", ` ${cp(0xa0)}\t`],
        ])(
          "reads a caption whose blanks are %s as one, and quotes it with single blanks",
          async (_name, blank) => {
            for (const word of ["v", "v.", "vs", "vs.", "VS.", "V"]) {
              await expectQuote(
                `Roe${blank}${word}${blank}QuarkHub: agent leaked a note`,
                `A party ${word} QuarkHub: agent leaked a note`,
              );
            }
          },
        );

        it("takes out the text before the first of several separators of different forms", async () => {
          await expectQuote(
            "Roe vs. Doe v. QuarkHub: a case",
            "A party vs. Doe v. QuarkHub: a case",
          );
          await expectQuote("Roe v. Doe vs QuarkHub: a case", "A party v. Doe vs QuarkHub: a case");
          await expectQuote("Roe V Doe VS. QuarkHub: a case", "A party V Doe VS. QuarkHub: a case");
        });

        it("takes out a first party of several words and a person-shaped one, whatever the separator", async () => {
          await expectQuote(
            "Jane Roe and McQuarb Doe vs QuarkHub: a case",
            "A party vs QuarkHub: a case",
          );
          await expectQuote("darkQuill VS. QuarkHub: a case", "A party VS. QuarkHub: a case");
        });

        it("reads an ordinary title that holds a vs as a caption: what stands before it is quoted as A party (fail closed)", async () => {
          await expectQuote(
            "ZetaChat vs QuarkHub: agent leaked a note",
            "A party vs QuarkHub: agent leaked a note",
          );
          const { byId } = await run([
            ...fillers(),
            entry({ id: "PIR-2026-0975", title: "ZetaChat vs QuarkHub: agent leaked a note" }),
          ]);
          expect(extraKeys(byId)).toEqual(["quarkhub"]);
        });

        it.each([
          ["a caption written with another word", "Roe against QuarkHub: agent leaked a note"],
          ["a caption written with an ampersand", "Roe & QuarkHub: agent leaked a note"],
          ["a caption written versus", "Roe versus QuarkHub: agent leaked a note"],
          ["a v. with no blank after it", "Roe v.QuarkHub: agent leaked a note"],
          ["a vs with no blank after it", "Roe vsQuarkHub: agent leaked a note"],
          ["a v with a hyphen on each side", "Roe-v-QuarkHub: agent leaked a note"],
          ["a v with two full stops after it", "Roe v.. QuarkHub: agent leaked a note"],
          ["a v. at the start of the title", "v. QuarkHub: agent leaked a note"],
          ["a v at the end of the title", "Agent leaked a note of Roe v"],
          ["a vs at the end of a word", "Gravs QuarkHub: agent leaked a note"],
          ["a vss", "Roe vss QuarkHub: agent leaked a note"],
        ])(
          "is no caption when it holds %s: the title is quoted as it is (a residual for a person named before it)",
          async (_name, title) => {
            await expectQuote(title, title);
          },
        );
      });

      it("takes the first party out of every one of the three newest entries of a record", async () => {
        const { byId, body } = await run([
          ...fillers(),
          entry({ id: "PIR-2026-0970", title: "Roe v. QuarkHub: a", sort_date: "2026-01-01" }),
          entry({ id: "PIR-2026-0971", title: "Doe v. QuarkHub: b", sort_date: "2026-01-02" }),
          entry({ id: "PIR-2026-0972", title: "Poe v. QuarkHub: c", sort_date: "2026-01-03" }),
          entry({ id: "PIR-2026-0973", title: "Zoe v. QuarkHub: d", sort_date: "2026-01-04" }),
        ]);
        const summary = byId.get("quarkhub")?.summary ?? "";
        expect(summary).toContain(
          "Newest: PIR-2026-0973 (2026-01-04, plain-error, near-miss): A party v. QuarkHub: d; " +
            "PIR-2026-0972 (2026-01-03, plain-error, near-miss): A party v. QuarkHub: c; " +
            "PIR-2026-0971 (2026-01-02, plain-error, near-miss): A party v. QuarkHub: b.",
        );
        const row = body.rows.find((candidate) => candidate.id === "quarkhub");
        expect((row?.newest as Array<{ title: string }>).map((shown) => shown.title)).toEqual([
          "A party v. QuarkHub: d",
          "A party v. QuarkHub: c",
          "A party v. QuarkHub: b",
        ]);
        // The fourth entry is an id only, and the first parties are in no text.
        expect(summary).toContain("Other entries: PIR-2026-0970.");
        for (const party of ["Roe", "Doe", "Poe", "Zoe"]) expect(summary).not.toContain(party);
        expect(JSON.stringify(body)).not.toMatch(/\b(Roe|Doe|Poe|Zoe)\b/);
      });

      it("leaves the second party of a caption as it is: no rule tells a person from a company there (a documented residual)", async () => {
        await expectQuote(
          "Roe v. Doe: agent deleted a table",
          "A party v. Doe: agent deleted a table",
        );
      });

      it("does not change what the entry names or counts: the first party was never a name", async () => {
        const plain = await quotedEntry("Roe v. QuarkHub: agent leaked a note");
        const quote = await quotedEntry("A party v. QuarkHub: agent leaked a note");
        expect(plain.byId.get("quarkhub")).toEqual(quote.byId.get("quarkhub"));
        expect([...plain.byId.keys()]).toEqual([...quote.byId.keys()]);
      });
    });

    describe("a title with no caption and no person-shaped word", () => {
      it.each([
        "QuarkHub agent leaked a note",
        "Agent called ZetaChat and BlipDesk tools",
        "ZetaChat's agent and QuarkHub's plugin",
        "agent leaked a note (QuarkHub)",
        "ZorbAI agent exposed a staging credential in run 12",
        "GPT-5 agent leaked a note",
        "agent leaked a note (CVE-2026-1)",
        "Edge agent leaked a note",
        "HTTP agent leaked a note",
        "xAI agent leaked a note",
        "iPhone agent leaked a note",
        "agent leaked a note of the quarkhub project",
        "Agent of LaMDA leaked a chat",
        "Agent of DeepSeek leaked a chat",
        "Agent of MacroZorb leaked a chat",
        "Agent of McQuarbZ leaked a chat",
        "Agent of VanQ leaked a chat",
        "Agent of mcQuarb leaked a chat",
        "Agent of ioZorb leaked a chat",
        "Agent of ZorbHub-owned shop leaked a chat",
        "Agent of St. Louis hospital leaked a note",
      ])("is quoted as it is: %s", async (title) => {
        await expectQuote(title, title);
      });

      it("is quoted as it is when it holds the words that begin like a surname prefix", async () => {
        await expectQuote(
          "Depot agent Lemon Vandal Mackerel Denver Stand Sandy Delta Danube",
          "Depot agent Lemon Vandal Mackerel Denver Stand Sandy Delta Danube",
        );
      });

      it.each([
        [
          "a given name of two humps",
          "Agent of JoAnn leaked a chat",
          "Agent of JoAnn leaked a chat",
        ],
        [
          "a short lower-case run before a capital",
          "Agent of joZorb leaked a chat",
          "Agent of joZorb leaked a chat",
        ],
        [
          "a capital between two lower-case letters",
          "Agent of xXzorbXx leaked a chat",
          "Agent of xXzorbXx leaked a chat",
        ],
        [
          "a person in the second position of a caption",
          "Roe v. Doe: agent deleted a table",
          "A party v. Doe: agent deleted a table",
        ],
      ])(
        "quotes a person who has neither shape, or stands second in a caption, as written: a residual that no rule closes (%s)",
        async (_name, title, expected) => {
          await expectQuote(title, expected);
        },
      );
    });

    describe("a person-shaped word", () => {
      it.each([
        ["a free word", "Agent of McQuarb leaked a chat", "Agent of [name] leaked a chat"],
        ["a possessive", "McQuarb's agent leaked a chat", "[name] agent leaked a chat"],
        [
          "a possessive with the other apostrophe",
          `McQuarb${RIGHT_QUOTE}s agent leaked a chat`,
          "[name] agent leaked a chat",
        ],
        [
          "a hyphen: the word before it, and what follows it stays",
          "Agent of McQuarb-owned shop leaked a chat",
          "Agent of [name]-owned shop leaked a chat",
        ],
        ["a handle", "Agent of darkQuill leaked a chat", "Agent of [name] leaked a chat"],
        ["a possessive handle", "darkQuill's agent leaked a chat", "[name] agent leaked a chat"],
        [
          "a handle before a hyphen",
          "Agent of darkQuill-bot leaked a chat",
          "Agent of [name]-bot leaked a chat",
        ],
        [
          "a product that is written like a handle (a residual: it is no person, and it is quoted so)",
          "Agent of macOS and openAI leaked a chat",
          "Agent of [name] and [name] leaked a chat",
        ],
        ["a word in brackets", "Agent leaked a chat (McQuarb)", "Agent leaked a chat ([name])"],
        ["a word before a colon", "McQuarb: agent leaked a chat", "[name]: agent leaked a chat"],
        [
          "several words",
          "McQuarb's agent called QuarkHub and darkQuill's bot",
          "[name] agent called QuarkHub and [name] bot",
        ],
        [
          "two words side by side",
          "McQuarb DeVrax agent leaked a chat",
          "[name] [name] agent leaked a chat",
        ],
        [
          "the party after v.",
          "Roe v. McQuarb: agent deleted a table",
          "A party v. [name]: agent deleted a table",
        ],
        [
          "a party after a second v.",
          "Roe v. QuarkHub v. McQuarb: a case",
          "A party v. QuarkHub v. [name]: a case",
        ],
        ["a title that is only that word", "McQuarb", "[name]"],
        ["a title that is only a possessive of it", "darkQuill's", "[name]"],
        ["a title that is two such words", "McQuarb darkQuill", "[name] [name]"],
        [
          "the shape of a surname after the Dutch and Spanish particles",
          "Agent of DeLaZorb and VanDerZorb and SanZorb",
          "Agent of [name] and [name] and [name]",
        ],
      ])("is quoted as [name] for %s", async (_name, title, expected) => {
        await expectQuote(title, expected);
      });

      it.each([
        "DeLaZorb",
        "VanDerZorb",
        "McZorbJr",
        "McQuarbZed",
        "FitzZorb",
        "SanZorb",
        "StZorb",
        "DelaZorb",
      ])("is quoted as [name] for %s, a shape that the rule was widened to", async (word) => {
        await expectQuote(`Agent of ${word} leaked a chat`, "Agent of [name] leaked a chat");
      });

      it("leaves the other words of the title as they are, and counts the entry as it did", async () => {
        const { byId } = await quotedEntry("McQuarb's agent called ZetaChat and darkQuill's bot");
        expect(extraKeys(byId)).toEqual(["quarkhub", "zetachat"]);
        expect(byId.get("zetachat")?.summary).toContain(
          "near-miss): [name] agent called ZetaChat and [name] bot.",
        );
        expect(byId.get("quarkhub")?.identifiers).toMatchObject({ entries: 1 });
      });
    });

    describe("a hyphenated word: the shapes are told of every part of it", () => {
      /** The title, what it quotes, and the person-shaped words of it that must be nowhere in the text or the body. */
      const HYPHENATED: Array<[string, string, string, string[]]> = [
        [
          "a person-shaped first part",
          "Agent of McZorb-owned shop leaked a chat",
          "Agent of [name]-owned shop leaked a chat",
          ["McZorb"],
        ],
        [
          "a person-shaped last part",
          "Agent of ex-McZorb leaked a chat",
          "Agent of ex-[name] leaked a chat",
          ["McZorb"],
        ],
        [
          "a brand and a person-shaped last part",
          "Agent of QuarkHub-McZorb leaked a chat",
          "Agent of QuarkHub-[name] leaked a chat",
          ["McZorb"],
        ],
        [
          "a handle as the last part",
          "Agent of ex-darkQuill leaked a chat",
          "Agent of ex-[name] leaked a chat",
          ["darkQuill"],
        ],
        [
          "a handle as the first part",
          "Agent of darkQuill-bot leaked a chat",
          "Agent of [name]-bot leaked a chat",
          ["darkQuill"],
        ],
        [
          "a person-shaped part in the middle",
          "Agent of ex-McZorb-owned shop leaked a chat",
          "Agent of ex-[name]-owned shop leaked a chat",
          ["McZorb"],
        ],
        [
          "two person-shaped parts, one after the other",
          "Agent of McZorb-DeVrax leaked a chat",
          "Agent of [name]-[name] leaked a chat",
          ["McZorb", "DeVrax"],
        ],
        [
          "a person-shaped first part and last part, and a plain word between them",
          "Agent of McZorb-and-darkQuill leaked a chat",
          "Agent of [name]-and-[name] leaked a chat",
          ["McZorb", "darkQuill"],
        ],
        [
          "a person-shaped last part with a possessive",
          "Agent of ex-McZorb's shop leaked a chat",
          "Agent of ex-[name] shop leaked a chat",
          ["McZorb"],
        ],
        [
          "a person-shaped last part with the other apostrophe",
          `Agent of ex-McZorb${RIGHT_QUOTE}s shop leaked a chat`,
          "Agent of ex-[name] shop leaked a chat",
          ["McZorb"],
        ],
        [
          "a person-shaped part with a possessive that a hyphen follows",
          "Agent of McZorb's-heirs leaked a chat",
          "Agent of [name]-heirs leaked a chat",
          ["McZorb"],
        ],
        [
          "a person-shaped part of a title that begins with it",
          "McZorb-owned agent leaked a chat",
          "[name]-owned agent leaked a chat",
          ["McZorb"],
        ],
        [
          "a person-shaped part of a title that ends with it",
          "Agent leaked a chat of ex-McZorb",
          "Agent leaked a chat of ex-[name]",
          ["McZorb"],
        ],
        [
          "a person-shaped part after a hyphen, in a caption",
          "Roe v. QuarkHub: agent of ex-McZorb leaked a note",
          "A party v. QuarkHub: agent of ex-[name] leaked a note",
          ["McZorb", "Roe"],
        ],
        [
          "a person-shaped part before a digit part",
          "Agent of McZorb-2 leaked a chat",
          "Agent of [name]-2 leaked a chat",
          ["McZorb"],
        ],
        [
          "a double-barrelled name of which one part only has a shape (a cost of the rule: the other part is shown)",
          "Agent of McZorb-Quillfern leaked a chat",
          "Agent of [name]-Quillfern leaked a chat",
          ["McZorb"],
        ],
        [
          "the same name with its shaped part last",
          "Agent of Quillfern-McZorb leaked a chat",
          "Agent of Quillfern-[name] leaked a chat",
          ["McZorb"],
        ],
      ];

      it.each(HYPHENATED)(
        "quotes only the person-shaped part of a word with %s: the hyphen and the other parts stay",
        async (_name, title, expected, gone) => {
          await expectQuote(title, expected);
          const { everything } = await quotedEntry(title);
          for (const word of gone) expect(everything).not.toContain(word);
        },
      );

      it.each([
        "Agent of ZorbHub-owned shop leaked a chat",
        "Agent of ex-ZorbHub leaked a chat",
        "Agent of ZorbHub-owned-by-ZetaChat leaked a chat",
        "Agent of non-DeepSeek leaked a chat",
        "Agent of pre-LaMDA leaked a chat",
        "Agent of GPT-5-based shop leaked a chat",
        "Agent of St-Louis shop leaked a chat",
        "Agent of man-in-the-middle shop leaked a chat",
        "Agent of ex-mcZorb leaked a chat",
        "Agent of ex-McZorbZ leaked a chat",
      ])(
        "quotes a hyphenated word as it is when none of its parts is person-shaped: %s",
        async (title) => {
          await expectQuote(title, title);
        },
      );

      it("tells the shapes of the parts of a word that a letter of another kind touches, as it does of a word with no hyphen", async () => {
        const O = cp(0xf6);
        const E = cp(0xe9);
        const ACUTE = cp(0x301);
        const KANJI = cp(0x65e5, 0x672c);
        const ASTRAL = cp(0x20000);
        // Each word, what it is quoted as, and the stem of the person that must be nowhere: the
        // person-shaped part is one [name], whole, with the letters that touch it; the hyphen and the
        // other parts stay. A plain word before the hyphen ends where the longer word of the stub
        // after it goes on (`ex` and `ex-` + an accented letter + `McZorb` begin at the same unit).
        const WORDS: Array<[string, string, string]> = [
          [`ex-${E}McZorb`, "ex-[name]", "McZorb"],
          [`QuarkHub-${KANJI}McZorb`, "QuarkHub-[name]", "McZorb"],
          [`ex-${O}bcZorb`, "ex-[name]", "bcZorb"],
          [`ex-${E}McZorb-owned`, "ex-[name]-owned", "McZorb"],
          [`ex-${E}darkQuill's`, "ex-[name]", "darkQuill"],
          // A plain word after an apostrophe that an accented letter precedes ends the longer word of
          // the stub before it: it is judged on its own, and a handle-shaped one is a name.
          [`${E}x${E}${RIGHT_QUOTE}smcZorb`, `${E}x${E}${RIGHT_QUOTE}[name]`, "smcZorb"],
          [`ex-MacZ${O}rb`, "ex-[name]", "MacZ"],
          [`MacZ${O}rb-owned`, "[name]-owned", "MacZ"],
          [`ZetaChat-MacZ${O}rb`, "ZetaChat-[name]", "MacZ"],
          [`ex-McZorb${KANJI}`, "ex-[name]", "McZorb"],
          [`${KANJI}McZorb-owned`, "[name]-owned", "McZorb"],
          [`McZorb${ACUTE}-owned`, "[name]-owned", "McZorb"],
          [`ex-McZorb${ASTRAL}-owned`, "ex-[name]-owned", "McZorb"],
          [`McZorb${ASTRAL}-owned`, "[name]-owned", "McZorb"],
          [`ex-darkQ${O}rb's`, "ex-[name]", "darkQ"],
          [`MacZ${O}rb's-heirs`, "[name]-heirs", "MacZ"],
        ];
        for (const [word, quoted, stem] of WORDS) {
          await expectQuote(`Agent of ${word} leaked a chat`, `Agent of ${quoted} leaked a chat`);
          const { everything } = await quotedEntry(`Agent of ${word} leaked a chat`);
          expect(everything).not.toContain(stem);
        }
      });

      it("reads the key of a word from the part before its first hyphen only, with the possessive of that part off", async () => {
        const found: Record<string, string[]> = {};
        for (const [place, title] of [
          ["a brand and a person-shaped part", "Agent of QuarkHub-McZorb leaked a chat"],
          ["a plain word and a person-shaped part", "Agent of ex-McZorb leaked a chat"],
          ["a person-shaped part and a brand", "Agent of McZorb-QuarkHub leaked a chat"],
          ["a plain word and a brand", "Agent of ex-QuarkHub leaked a chat"],
          ["a brand and a brand", "Agent of QuarkHub-ZetaChat leaked a chat"],
          [
            "a brand with a possessive and a part after it",
            "Agent of QuarkHub's-heirs leaked a chat",
          ],
          [
            "a person-shaped part with a possessive and a part after it",
            "Agent of McZorb's-heirs leaked a chat",
          ],
          [
            "a handle with a possessive and a part after it",
            "Agent of darkQuill's-heirs leaked a chat",
          ],
        ]) {
          const { byId } = await run([...fillers(), entry({ id: "PIR-2026-0723", title })]);
          found[place] = extraKeys(byId);
        }
        expect(found).toEqual({
          "a brand and a person-shaped part": ["quarkhub"],
          "a plain word and a person-shaped part": [],
          "a person-shaped part and a brand": [],
          "a plain word and a brand": [],
          "a brand and a brand": ["quarkhub"],
          "a brand with a possessive and a part after it": ["quarkhub"],
          "a person-shaped part with a possessive and a part after it": [],
          "a handle with a possessive and a part after it": [],
        });
      });
    });

    describe("an apostrophe joins the parts of a word like a hyphen, and the digits at the ends of a part are no part of a name", () => {
      /** The title, what it quotes, and the person-shaped words of it that must be nowhere in the text or the body. */
      const JOINED: Array<[string, string, string, string[]]> = [
        [
          "a surname after a one-letter part",
          "Agent of O'McZorb leaked a chat",
          "Agent of O'[name] leaked a chat",
          ["McZorb"],
        ],
        [
          "the same with D",
          "Agent of D'McZorb leaked a chat",
          "Agent of D'[name] leaked a chat",
          ["McZorb"],
        ],
        [
          "the other apostrophe",
          `Agent of O${RIGHT_QUOTE}McZorb leaked a chat`,
          `Agent of O${RIGHT_QUOTE}[name] leaked a chat`,
          ["McZorb"],
        ],
        [
          "a handle after an apostrophe",
          "Agent of O'darkQuill leaked a chat",
          "Agent of O'[name] leaked a chat",
          ["darkQuill"],
        ],
        [
          "a surname before an apostrophe",
          "Agent of McZorb'O leaked a chat",
          "Agent of [name]'O leaked a chat",
          ["McZorb"],
        ],
        [
          "a surname and a possessive after an apostrophe",
          "Agent of O'McZorb's shop leaked a chat",
          "Agent of O'[name] shop leaked a chat",
          ["McZorb"],
        ],
        [
          "an apostrophe and a capital S, which is no possessive",
          "Agent of McZorb'S leaked a chat",
          "Agent of [name]'S leaked a chat",
          ["McZorb"],
        ],
        [
          "a surname and the other possessive after the other apostrophe",
          `Agent of O${RIGHT_QUOTE}McZorb${RIGHT_QUOTE}s shop leaked a chat`,
          `Agent of O${RIGHT_QUOTE}[name] shop leaked a chat`,
          ["McZorb"],
        ],
        [
          "a brand and a surname",
          "Agent of QuarkHub'McZorb leaked a chat",
          "Agent of QuarkHub'[name] leaked a chat",
          ["McZorb"],
        ],
        [
          "two surnames",
          "Agent of McZorb'DeVrax leaked a chat",
          "Agent of [name]'[name] leaked a chat",
          ["McZorb", "DeVrax"],
        ],
        [
          "an apostrophe and a hyphen after it",
          "Agent of O'McZorb-owned shop leaked a chat",
          "Agent of O'[name]-owned shop leaked a chat",
          ["McZorb"],
        ],
        [
          "a hyphen and an apostrophe after it",
          "Agent of ex-O'McZorb leaked a chat",
          "Agent of ex-O'[name] leaked a chat",
          ["McZorb"],
        ],
        [
          "three parts, the middle one a surname",
          "Agent of a'McZorb'b leaked a chat",
          "Agent of a'[name]'b leaked a chat",
          ["McZorb"],
        ],
        [
          "the party after v.",
          "Roe v. O'McZorb: agent deleted a table",
          "A party v. O'[name]: agent deleted a table",
          ["McZorb", "Roe"],
        ],
        [
          "a glued initial after an apostrophe",
          "Agent of O'JMcZorb leaked a chat",
          "Agent of O'[name] leaked a chat",
          ["McZorb"],
        ],
      ];

      it.each(JOINED)(
        "judges each part of a word with %s: the person-shaped part is one [name] and the apostrophes stay",
        async (_name, title, expected, gone) => {
          await expectQuote(title, expected);
          const { everything } = await quotedEntry(title);
          for (const word of gone) expect(everything).not.toContain(word);
        },
      );

      it.each([
        ["a one-letter part and a surname", "O'McZorb", []],
        ["the same with D", "D'McZorb", []],
        ["the other apostrophe", `O${RIGHT_QUOTE}McZorb`, []],
        ["a handle after an apostrophe", "O'darkQuill", []],
        ["a surname before an apostrophe", "McZorb'O", []],
        ["a glued initial after an apostrophe", "O'JMcZorb", []],
        [
          "a brand and a surname: the part before the apostrophe is the name",
          "QuarkHub'McZorb",
          ["quarkhub"],
        ],
        [
          "a brand and a brand: the part before the apostrophe only",
          "QuarkHub'ZetaChat",
          ["quarkhub"],
        ],
        [
          "a part before an apostrophe that is no brand: nothing after it is a name either",
          "Zorb'QuarkHub",
          [],
        ],
        [
          "a surname with apostrophes in the middle of its parts, whose compact form is that of the surname (no key)",
          `Mc'Zo${RIGHT_QUOTE}rb`,
          [],
        ],
      ])(
        "gives the name that the part before the first apostrophe gives, as it does before a hyphen: %s",
        async (_name, word, keys) => {
          for (const title of [
            `Agent of ${word} leaked a chat`,
            `Roe v. ${word}: agent deleted a table`,
            `Agent emailed ${word}'s contacts`,
          ]) {
            const { byId, body } = await run([...fillers(), entry({ id: "PIR-2026-1110", title })]);
            expect(extraKeys(byId)).toEqual(keys);
            expect(body.unreadable).toBe(0);
          }
        },
      );

      it("quotes a surname that apostrophes cut in the middle of its own parts as it is written, and gives it no key (a documented residual)", async () => {
        const word = `Mc'Zo${RIGHT_QUOTE}rb`;
        await expectQuote(`Agent of ${word} leaked a chat`, `Agent of ${word} leaked a chat`);
        const { byId } = await run([
          ...fillers(),
          entry({ id: "PIR-2026-1111", title: `Agent of ${word} leaked a chat` }),
        ]);
        expect(extraKeys(byId)).toEqual([]);
        expect(byId.has("mczorb")).toBe(false);
      });

      /** The title, what it quotes, and the person-shaped words of it that must be nowhere in the text or the body. */
      const DIGIT_ENDS: Array<[string, string, string, string[]]> = [
        [
          "digits after a surname",
          "Agent of McZorb2 leaked a chat",
          "Agent of [name] leaked a chat",
          ["McZorb"],
        ],
        [
          "a year after a surname",
          "Agent of McZorb2024 leaked a chat",
          "Agent of [name] leaked a chat",
          ["McZorb"],
        ],
        [
          "digits after a handle",
          "Agent of darkQuill7 leaked a chat",
          "Agent of [name] leaked a chat",
          ["darkQuill"],
        ],
        [
          "a digit before a handle that a hyphen joins",
          "Agent of ex-2darkCoder leaked a chat",
          "Agent of ex-[name] leaked a chat",
          ["darkCoder"],
        ],
        [
          "a digit before a surname that a hyphen joins",
          "Agent of ex-2McZorb leaked a chat",
          "Agent of ex-[name] leaked a chat",
          ["McZorb"],
        ],
        [
          "several digits before a surname that a hyphen joins",
          "Agent of ex-2024McZorb leaked a chat",
          "Agent of ex-[name] leaked a chat",
          ["McZorb"],
        ],
        [
          "several digits before a handle that an apostrophe joins",
          "Agent of O'2024darkQuill leaked a chat",
          "Agent of O'[name] leaked a chat",
          ["darkQuill"],
        ],
        [
          "several digits at both ends of a surname that a hyphen joins",
          "Agent of ex-12McZorb34 leaked a chat",
          "Agent of ex-[name] leaked a chat",
          ["McZorb"],
        ],
        [
          "digits at both ends of a surname that a hyphen joins",
          "Agent of ex-1McZorb2 leaked a chat",
          "Agent of ex-[name] leaked a chat",
          ["McZorb"],
        ],
        [
          "digits before a surname that an apostrophe joins",
          "Agent of O'2McZorb leaked a chat",
          "Agent of O'[name] leaked a chat",
          ["McZorb"],
        ],
        [
          "digits and a possessive after a surname",
          "Agent of McZorb2's shop leaked a chat",
          "Agent of [name] shop leaked a chat",
          ["McZorb"],
        ],
        [
          "digits after a surname that a hyphen follows",
          "Agent of McZorb2024-owned shop leaked a chat",
          "Agent of [name]-owned shop leaked a chat",
          ["McZorb"],
        ],
        [
          "digits after a surname, in a caption",
          "Roe v. QuarkHub: agent of McZorb2 leaked a note",
          "A party v. QuarkHub: agent of [name] leaked a note",
          ["McZorb", "Roe"],
        ],
        [
          "a digit before a surname that nothing joins (the digit is no part of a name)",
          "Agent of 2McZorb leaked a chat",
          "Agent of 2[name] leaked a chat",
          ["McZorb"],
        ],
        [
          "a glued initial and digits",
          "Agent of JMcZorb3 leaked a chat",
          "Agent of [name] leaked a chat",
          ["McZorb"],
        ],
        [
          "a glued initial after a hyphen",
          "Agent of ex-JMcZorb leaked a chat",
          "Agent of ex-[name] leaked a chat",
          ["McZorb"],
        ],
        [
          "a glued initial before a hyphen",
          "Agent of JMcZorb-owned shop leaked a chat",
          "Agent of [name]-owned shop leaked a chat",
          ["McZorb"],
        ],
      ];

      it.each(DIGIT_ENDS)(
        "takes the digits at the ends of a part off before it tells the shapes: %s",
        async (_name, title, expected, gone) => {
          await expectQuote(title, expected);
          const { everything } = await quotedEntry(title);
          for (const word of gone) expect(everything).not.toContain(word);
        },
      );

      it.each([
        "Agent of GPT-5 and 3D and 007 leaked a chat",
        "Agent of GPT-4o and Claude-3 leaked a chat",
        "Agent of Gpt5Turbo leaked a chat",
        "Agent of ChatGPT4 and iPhone15 leaked a chat",
        "Agent of ZorbHub2 and ZorbHub-2 leaked a chat",
        "Agent of 2024-05-01 and v2 leaked a chat",
        "Agent of ex-2zorb leaked a chat",
        "Agent of 5-McZorbZ leaked a chat",
        "Agent of ZetaChat-7 leaked a chat",
      ])(
        "quotes a word with digits as it is when no part of it is person-shaped once its digits are off: %s",
        async (title) => {
          await expectQuote(title, title);
        },
      );

      it.each([
        ["an Arabic-Indic digit", cp(0x663)],
        ["a digit of the second plane: two UTF-16 units", cp(0x104a0)],
        ["two digits of another script", `${cp(0x663)}${cp(0x664)}`],
      ])(
        "takes the digits of another script off as well: the shape is told of the whole longer word (%s)",
        async (_name, digit) => {
          // A capital with an accent and an accented letter make stubs (McZ and rb), neither of which
          // is a shape; the longer word is, once its letters are written in ASCII and its last digit is
          // off, and a digit is one code point, whatever the units it takes.
          const word = `${cp(0xc9)}McZ${cp(0xf6)}rb${digit}`;
          await expectQuote(`Agent of ${word} leaked a chat`, "Agent of [name] leaked a chat");
          const { everything } = await quotedEntry(`Agent of ${word} leaked a chat`);
          expect(everything).not.toContain("McZ");
          // The same digits in front of the word, after a hyphen.
          const front = `ex-${digit}${cp(0xc9)}McZ${cp(0xf6)}rb`;
          await expectQuote(`Agent of ${front} leaked a chat`, "Agent of ex-[name] leaked a chat");
        },
      );

      it.each([
        ["digits inside a surname", "Agent of McZorb2Quark leaked a chat"],
        ["digits inside a handle", "Agent of dark4Quill leaked a chat"],
        ["a digit and a capital after a surname", "Agent of McZorb3D leaked a chat"],
      ])(
        "quotes %s as it is written: only the digits at the ends of a part are taken off (a documented residual)",
        async (_name, title) => {
          await expectQuote(title, title);
          const { byId } = await run([...fillers(), entry({ id: "PIR-2026-1112", title })]);
          expect(extraKeys(byId)).toEqual([]);
        },
      );
    });

    describe("a plain word and the longer word of a stub that begin at the same unit", () => {
      const O = cp(0xf6);
      const E = cp(0xe9);
      const KANJI = cp(0x65e5, 0x672c);
      // Each word, and what it is quoted as: the plain word before the separator is judged as itself,
      // and the stub after it in the longer word that the letter of another kind makes of it.
      it.each([
        ["a hyphen", `bot-${E}VanZorb`, "bot-[name]", "VanZorb"],
        ["an apostrophe", `bot'${E}VanZorb`, "bot'[name]", "VanZorb"],
        [
          "the other apostrophe",
          `bot${RIGHT_QUOTE}${E}VanZorb`,
          `bot${RIGHT_QUOTE}[name]`,
          "VanZorb",
        ],
        ["letters of another script", `ex-${KANJI}DeVrax`, "ex-[name]", "DeVrax"],
        ["a stub of a handle", `bot-${E}darkQuill`, "bot-[name]", "darkQuill"],
        ["a plain word that is a surname itself", `McZorb-${E}McZorb`, "[name]-[name]", "McZorb"],
        ["an accented letter inside the stub", `bot-MacZ${O}rb`, "bot-[name]", "MacZ"],
        ["a possessive after the stub", `bot-${E}McZorb's`, "bot-[name]", "McZorb"],
        [
          "two stubs in the longer word",
          `bot-${E}McZorb-${E}DeVrax`,
          "bot-[name]-[name]",
          "DeVrax",
        ],
      ])(
        "judges both words, each in its own span, when the plain word and the longer word begin together: %s",
        async (_name, word, quoted, stem) => {
          await expectQuote(`Agent of ${word} leaked a chat`, `Agent of ${quoted} leaked a chat`);
          const { everything } = await quotedEntry(`Agent of ${word} leaked a chat`);
          expect(everything).not.toContain(stem);
          // The same at the start of the title, where the two words begin at unit 0.
          await expectQuote(`${word} agent leaked a chat`, `${quoted} agent leaked a chat`);
        },
      );
    });

    describe("a plain word and the longer word of a stub that end at the same unit", () => {
      const E = cp(0xe9);
      const KANJI = cp(0x65e5, 0x672c);
      // The stub (`x` between two accented letters) makes the longer word; the plain word at its end is
      // preceded by a digit, so that the part of the longer word that holds it is no shape as a whole
      // (the digit comes between the accented letter and the name): the plain word must be judged
      // as a word of its own, and not as an end of the longer word.
      it.each([
        [
          "a handle after a hyphen",
          `${E}x${E}-${E}2darkCoder`,
          `${E}x${E}-${E}2[name]`,
          "darkCoder",
        ],
        ["a surname after a hyphen", `${E}x${E}-${E}2McZorb`, `${E}x${E}-${E}2[name]`, "McZorb"],
        [
          "a handle after an apostrophe",
          `${E}x${E}'${E}2darkCoder`,
          `${E}x${E}'${E}2[name]`,
          "darkCoder",
        ],
        [
          "a surname after the other apostrophe",
          `${E}x${E}${RIGHT_QUOTE}${E}2McZorb`,
          `${E}x${E}${RIGHT_QUOTE}${E}2[name]`,
          "McZorb",
        ],
        [
          "letters of another script before the digit",
          `${E}x${E}-${KANJI}2DeVrax`,
          `${E}x${E}-${KANJI}2[name]`,
          "DeVrax",
        ],

        [
          "a possessive after the plain word",
          `${E}x${E}-${E}2McZorb's`,
          `${E}x${E}-${E}2[name]`,
          "McZorb",
        ],
      ])(
        "judges the plain word in a span of its own, though the longer word ends where it ends: %s",
        async (_name, word, quoted, stem) => {
          await expectQuote(`Agent of ${word} leaked a chat`, `Agent of ${quoted} leaked a chat`);
          const { everything } = await quotedEntry(`Agent of ${word} leaked a chat`);
          expect(everything).not.toContain(stem);
          await expectQuote(`${word}`, `${quoted}`);
        },
      );
    });

    describe("the cut", () => {
      it("comes after the replacements, so that no part of a name is left at it", async () => {
        const title = `${"word ".repeat(12)}abcd McQuarb agent leaked a note and more words follow`;
        const replaced = `${"word ".repeat(12)}abcd [name] agent leaked a note and more words follow`;
        const { stored, summary, everything } = await quotedEntry(title);
        // McQuarb begins at 65 of the title, so a cut of the title at 68 would show McQ.
        expect(stored).toBe(`${replaced.slice(0, 68).trimEnd()} [shortened]`);
        expect(stored.length).toBeLessThanOrEqual(80);
        expect(summary).toContain(`near-miss): ${stored}.`);
        expect(everything).not.toContain("McQ");
      });

      it("shows A party where a long first party stood, and cuts what follows it", async () => {
        const title = `${"Roe ".repeat(40)}v. QuarkHub: ${"word ".repeat(30)}`;
        const { stored, everything } = await quotedEntry(title);
        // The text before the first separator is replaced as a whole, whatever its length.
        expect(stored.startsWith("A party v. QuarkHub: word word")).toBe(true);
        expect(stored.length).toBeLessThanOrEqual(80);
        expect(stored.endsWith("[shortened]")).toBe(true);
        expect(everything).not.toContain("Roe");
      });

      it("cuts the quote of a long title, whose own cut the entry had already marked", async () => {
        const title = `McQuarb agent ${"word ".repeat(80)}`;
        const { stored, summary } = await quotedEntry(title);
        expect(stored.startsWith("[name] agent word word")).toBe(true);
        expect(stored.endsWith(" [shortened]")).toBe(true);
        expect(stored.length).toBeLessThanOrEqual(80);
        expect(summary).toContain(`near-miss): ${stored}.`);
      });
    });

    describe("a title that the reader cut: the quote is the part that was read, and the mark", () => {
      it("ends before the last word of a cut title, where a replaced first party leaves room for the fragment of a name", async () => {
        // The first party takes 262 units (and its blank), the separator and the words after it 25 more:
        // the reader keeps 288 units, which end after the VanQ of a longer name.
        const title = `${fillerOf(263)}v. QuarkHub agent of VanQuorp agent leaked a chat`;
        expect(title.slice(0, 288).endsWith(" VanQ")).toBe(true);
        await expectQuote(title, "A party v. QuarkHub agent of [shortened]");
        const { everything } = await quotedEntry(title);
        expect(everything).not.toContain("VanQ");
      });

      it("drops the last whole word of a title whose cut fell after a blank, as it drops a fragment: the two cannot be told apart", async () => {
        const title = `${fillerOf(267)}v. QuarkHub agent of VanQuorp agent leaked a chat`;
        expect(title.slice(0, 288).endsWith(" of ")).toBe(true);
        await expectQuote(title, "A party v. QuarkHub agent [shortened]");
      });

      it("quotes a title of 300 units whole, and one of 301 units without its last word", async () => {
        // 271 units, then the 29 units of the separator and the words after it: 300, which is not cut.
        const whole = `${fillerOf(271)}v. QuarkHub agent of VanQuorp`;
        expect(whole).toHaveLength(300);
        await expectQuote(whole, "A party v. QuarkHub agent of [name]");
        // One unit more is cut at 288 units, which end after agen, a fragment of agent.
        const cut = `${fillerOf(272)}v. QuarkHub agent of VanQuorp`;
        expect(cut).toHaveLength(301);
        expect(cut.slice(0, 288).endsWith(" agen")).toBe(true);
        await expectQuote(cut, "A party v. QuarkHub [shortened]");
      });

      it("treats a title that ends in the mark as cut, whoever cut it: its last word is not quoted", async () => {
        await expectQuote("Agent of VanQuorp [shortened]", "Agent of [shortened]");
        await expectQuote("Agent of VanQ [shortened]", "Agent of [shortened]");
        await expectQuote(
          "Roe v. QuarkHub agent of ZetaCh [shortened]",
          "A party v. QuarkHub agent of [shortened]",
        );
        // The word before the last one is quoted as always: a surname is a [name].
        await expectQuote("McQuarb agent of VanQuorp [shortened]", "[name] agent of [shortened]");
        // A cut that left nothing of the text is the marker alone.
        await expectQuote("[shortened]", "[shortened]");
      });

      it("puts the mark after a blank, as the kit does, whatever stands before the word that is dropped", async () => {
        await expectQuote("Agent of (VanQuorp [shortened]", "Agent of ( [shortened]");
        await expectQuote('Agent of "VanQuorp [shortened]', 'Agent of " [shortened]');
      });

      it("does not take a title that merely holds the mark for a cut one", async () => {
        await expectQuote(
          "QuarkHub [shortened] agent leaked a note",
          "QuarkHub [shortened] agent leaked a note",
        );
        await expectQuote("Agent of McQuarb shortened", "Agent of [name] shortened");
      });

      it("shows no fragment of a person's name whatever unit the cut falls on", async () => {
        // A person-shaped name written at each place of the last units that the reader keeps: its cut
        // falls before the name, in it, or after it, and always after the separator of the caption
        // (the first party takes 263 to 284 units). Every fragment of a name begins with its first
        // letter, the only capital V of the quote, so none may be in it.
        for (let at = 0; at < 22; at += 1) {
          const title = `${fillerOf(263 + at)}v. QuarkHub VanQuorp agent leaked a chat`;
          expect(title.length).toBeGreaterThan(300);
          const { stored, everything } = await quotedEntry(title);
          expect(stored.startsWith("A party v.")).toBe(true);
          expect(stored.endsWith(" [shortened]")).toBe(true);
          expect(stored).not.toContain("V");
          expect(everything).not.toContain("VanQ");
        }
      });
    });

    describe("order and repetition", () => {
      const titles = [
        "Roe v. QuarkHub: McQuarb's agent leaked a note",
        "darkQuill v. QuarkHub: agent deleted a table",
        "Agent of DeLaZorb and QuarkHub exposed a key",
        "QuarkHub agent leaked a note",
        `Agent of MacZ${cp(0xf6)}rb leaked a chat of QuarkHub`,
        "Agent of O'McZorb leaked a chat of QuarkHub",
        "Agent of McZorb2024 and JMcZorb leaked a chat of QuarkHub",
      ];

      it("never changes the body or the records with the order of the entries (the kit's contract)", async () => {
        const records = [
          ...fillers(),
          ...titles.map((title, at) =>
            entry({
              id: `PIR-2026-098${at}`,
              title,
              sort_date: dayAt(400 + at),
              operator_type: "enterprise (QuarkHub-operated SaaS, x)",
            }),
          ),
        ];
        await expectDeterministic(piperollConnector, (reversed) =>
          fakeFetch(filesOf(registryText(reversed ? [...records].reverse() : records))),
        );
      });

      it.each(titles)("makes the quote of a quote itself: %s", async (title) => {
        const first = (await quotedEntry(title)).stored;
        expect((await quotedEntry(first)).stored).toBe(first);
      });
    });

    describe("a word that a letter of another kind touches", () => {
      const O = cp(0xf6); // o with a diaeresis
      const A = cp(0xe4); // a with a diaeresis
      const E = cp(0xe9); // e with an acute accent
      const U = cp(0xfc); // u with a diaeresis
      const CAPITAL_E = cp(0xc9); // capital e with an acute accent
      const ACUTE = cp(0x301); // a combining acute accent, which no precomposed Q has
      const KANJI = cp(0x65e5, 0x672c); // two letters of another script
      const ASTRAL = cp(0x20000); // a letter of the second plane: two UTF-16 units
      const KANJI3 = cp(0x65e5, 0x672c, 0x8a9e); // three letters of another script, which have no case

      /**
       * Words that a person-shaped word becomes when its letters are written in ASCII: the reader of
       * a title stops at the accent and sees a short word, `MacZ` of `MacZorb`.
       */
      const FOLDED_PERSONS: Array<[string, string]> = [
        ["an accent after the capital", `MacZ${O}rb`],
        ["an accent after the capital, with another prefix", `VanZ${E}ro`],
        ["an accent after the capital, with a longer tail", `DelZ${O}rbe`],
        ["an accent after the capital, with a third prefix", `TenZ${O}rb`],
        ["an accent after the capital of a short word", `McZ${O}rb`],
        ["an accent late in the word", `LeBl${A}nc`],
        ["an accented capital", `Mc${CAPITAL_E}mile`],
        ["an accent after a particle", `DeLa${O}rb`],
        ["a combining accent after the capital", `MacQ${ACUTE}orb`],
        ["an accent in a handle", `darkQ${O}rb`],
        ["an accent of two letters", `MacZ${O}${O}rb`],
      ];
      /** Person-shaped words that a letter touches without changing their shape. */
      const TOUCHED_PERSONS: Array<[string, string]> = [
        ["an accented letter before the word", `${E}McZorb`],
        ["an accented letter after the word", `McZorb${E}`],
        ["letters of another script after the word", `McZorb${KANJI}`],
        ["letters of another script before the word", `${KANJI}McZorb`],
        ["a combining accent after the word", `McZorb${ACUTE}`],
        ["a letter of two UTF-16 units after the word", `McZorb${ASTRAL}`],
        ["a letter of two UTF-16 units before the word", `${ASTRAL}McZorb`],
      ];
      /** Brand-shaped words that a letter touches: the stub of a longer word, no name. */
      const TOUCHED_BRANDS: Array<[string, string]> = [
        ["an accented letter after a brand", `ZetaChat${E}`],
        ["an accented letter before a brand", `${E}ZetaChat`],
        ["letters of another script after a brand", `ZetaChat${KANJI}`],
        ["letters of another script before a brand", `${KANJI}ZetaChat`],
        ["a combining accent after a brand", `ZetaChat${ACUTE}`],
        ["a letter of two UTF-16 units after a brand", `ZetaChat${ASTRAL}`],
        ["a letter of two UTF-16 units before a brand", `${ASTRAL}ZetaChat`],
      ];

      const placesOf = (word: string): Array<[string, string]> => [
        ["a free word", `Agent of ${word} leaked a chat`],
        ["a possessive", `${word}'s agent leaked a chat`],
        ["the party after v.", `Roe v. ${word}: agent deleted a table`],
        ["the part before a hyphen", `Agent of ${word}-owned shop leaked a chat`],
      ];

      it.each([...FOLDED_PERSONS, ...TOUCHED_PERSONS, ...TOUCHED_BRANDS])(
        "gives no key for %s, in any place of a title",
        async (_name, word) => {
          const found: Record<string, unknown> = {};
          const expected: Record<string, unknown> = {};
          for (const [place, title] of placesOf(word)) {
            const { byId, body } = await run([...fillers(), entry({ id: "PIR-2026-0990", title })]);
            found[place] = { keys: extraKeys(byId), unreadable: body.unreadable };
            expected[place] = { keys: [], unreadable: 0 };
          }
          expect(found).toEqual(expected);
        },
      );

      it.each([...FOLDED_PERSONS, ...TOUCHED_PERSONS])(
        "quotes %s as one [name], the letters that touch the word included",
        async (_name, word) => {
          await expectQuote(`Agent of ${word} leaked a chat`, "Agent of [name] leaked a chat");
          await expectQuote(`${word}'s agent leaked a chat`, "[name] agent leaked a chat");
          await expectQuote(
            `Roe v. ${word}: agent deleted a table`,
            "A party v. [name]: agent deleted a table",
          );
          await expectQuote(
            `Agent of ${word}-owned shop leaked a chat`,
            "Agent of [name]-owned shop leaked a chat",
          );
          const { everything } = await quotedEntry(`Agent of ${word} leaked a chat`);
          expect(everything).not.toContain(word);
        },
      );

      it.each([
        ["a word with an umlaut", `Agent of Z${U}rich leaked a chat`],
        ["a word with an accent at its end", `Caf${E} agent leaked a note`],
        [
          "a prefix that goes on in lower case, with an accent",
          `Agent of DeepZ${O}rb leaked a chat`,
        ],
        ["an accented capital before lower case", `Agent of ${CAPITAL_E}cole leaked a chat`],
        ["a brand with an accented letter", `Agent of ZetaChat${E} leaked a chat`],
        ["letters of another script by themselves", `Agent of ${KANJI} leaked a chat`],
        ["a capital with a combining mark", `Agent of McQ${ACUTE} leaked a chat`],
        [
          "three letters with no case before a capital, which are no run of lower-case letters",
          `Agent of ${KANJI3}AI leaked a chat`,
        ],
        ["three letters with no case before a brand", `Agent of ${KANJI3}ChatGPT leaked a chat`],
      ])("quotes a title with %s as it is", async (_name, title) => {
        await expectQuote(title, title);
      });

      it.each([
        [
          "a handle of accented small letters and a capital of another script",
          `${E}${E}${E}${cp(0x41c)}`,
        ],
        ["a surname wholly in Cyrillic letters", cp(0x41c, 0x43a, 0x417, 0x43e, 0x440, 0x431)],
        [
          "a handle wholly in Cyrillic letters",
          cp(0x438, 0x432, 0x430, 0x43d, 0x41f, 0x435, 0x442),
        ],
      ])(
        "quotes %s as it is written and gives it no key: no ASCII letter of it is read (a documented residual)",
        async (_name, word) => {
          await expectQuote(`Agent of ${word} leaked a chat`, `Agent of ${word} leaked a chat`);
          const { byId, body } = await run([
            ...fillers(),
            entry({ id: "PIR-2026-1113", title: `Agent of ${word} leaked a chat` }),
          ]);
          expect(extraKeys(byId)).toEqual([]);
          expect(body.unreadable).toBe(0);
        },
      );

      it("still gives the key of a brand that no letter touches, among words with accents", async () => {
        const { byId } = await run([
          ...fillers(),
          entry({
            id: "PIR-2026-0991",
            title: `${E}cole ZetaChat ${E}t${E} agent ${KANJI} and (BlipDesk) and QuarkHub/Quill${KANJI}`,
          }),
        ]);
        expect(extraKeys(byId)).toEqual(["blipdesk", "quarkhub", "zetachat"]);
      });
    });

    describe("a title that is long, or made to be slow", () => {
      const O = cp(0xf6);
      const MARKS = cp(0x301).repeat(16);
      it.each([
        ["a run of stubs", `MacZ${O}rb `.repeat(60)],
        ["a run of stubs with no blank between them", `MacZ${O}rb`.repeat(50)],
        ["one word of lower case and capitals", "aB".repeat(70)],
        ["one word of capitals with a lower-case letter each", "Aa".repeat(70)],
        ["a chain of hyphens", "Mc-Zorb-".repeat(40)],
        ["a chain of possessives", "McZorb's ".repeat(40)],
        ["a run of combining marks", `MacQ${MARKS}orb `.repeat(15)],
        ["a long title that begins with a person-shaped word", `McQuarb ${"x".repeat(400)}`],
        ["a caption with many v.", "Roe v. ".repeat(60)],
        ["a caption with many vs.", "Roe vs. ".repeat(50)],
        ["a run of single v words", "v ".repeat(150)],
        ["a run of single V. words", "V. ".repeat(100)],
        ["a chain of hyphens with person-shaped parts", "McZorb-".repeat(40)],
        ["a chain of possessives before hyphens", "McZorb's-".repeat(33)],
        ["a chain of stubs joined by hyphens", `MacZ${O}rb-`.repeat(40)],
        ["a hyphenated word of short stubs", `a${O}-`.repeat(100)],
        ["a chain of apostrophes", "O'McZorb ".repeat(33)],
        ["one word of parts that apostrophes join", "a'b".repeat(100)],
        ["a chain of apostrophes and hyphens", "Mc'Zorb-".repeat(40)],
        ["a chain of glued initials", "JMcZorb ".repeat(40)],
        ["digits at the ends of many words", "McZorb2024 ".repeat(28)],
        ["one long run of digits before a letter", `${"1".repeat(280)}x`],
        ["a hyphenated word of digits and letters", "1a-".repeat(100)],
        ["a word of short stubs that apostrophes join", `a${O}'`.repeat(100)],
        ["a cut title whose last word is long", `${"word ".repeat(55)}${"x".repeat(100)}`],
        [
          "a cut title with a caption and a long first party",
          `${"Roe ".repeat(70)}v. ${"w".repeat(60)}`,
        ],
      ])("is quoted in at most 80 units, and its entry reads: %s", async (_name, title) => {
        const { stored, body } = await quotedEntry(title);
        expect(stored.length).toBeLessThanOrEqual(80);
        expect(body.unreadable).toBe(0);
      });
    });
  });

  describe("the worst case", () => {
    it("is at most 1,300 characters, with the 'not a finding' sentence and the attribution whole", async () => {
      const worst = "zA".repeat(35);
      const title = `${worst} ${"word ".repeat(80)}`;
      const longCause = `cause-${"c".repeat(24)}`;
      const longSeverity = `sev-${"s".repeat(16)}`;
      const entries = Array.from({ length: 12 }, (_, at) =>
        entry({
          id: `PIR-2026-${pad(3000 + at)}`,
          title,
          sort_date: dayAt(500 + at),
          status: at >= 9 ? "disputed (x)" : at === 8 ? "corrected (x)" : "corroborated (x)",
          cause_key: longCause,
          severity_key: longSeverity,
        }),
      );
      const { byId, result } = await run([...fillers(), ...entries]);
      const record = byId.get(compactName(worst));
      expect(record).toBeDefined();
      const summary = record?.summary ?? "";
      expect(summary.length).toBeLessThanOrEqual(1300);
      expect(summary.length).toBeGreaterThan(1100);
      expect(summary.startsWith(`${S1} ${S2} `)).toBe(true);
      expect(summary.endsWith(S8)).toBe(true);
      expect(summary).toContain("Name in the entries: zAzA");
      expect(summary).toContain("[shortened]");
      expectWellFormedRecords(result.records, { sourceId: "piperoll", mark: MARK });
    });

    it("is cut before its attribution, never after it, when the parts are over their caps together", async () => {
      // Three newest entries with every cell at its cap, disputed: the longest text the caps allow.
      const longCause = `cause-${"c".repeat(24)}`;
      const longSeverity = `sev-${"s".repeat(14)}`;
      const entries = Array.from({ length: 4 }, (_, at) =>
        entry({
          id: `PIR-2026-${pad(3100 + at)}`,
          title: `ZibbleCo ${"w".repeat(300)}`,
          sort_date: dayAt(600 + at),
          status: "disputed (x)",
          cause_key: longCause,
          severity_key: longSeverity,
        }),
      );
      const { byId } = await run([...fillers(), ...entries]);
      const summary = byId.get("zibbleco")?.summary ?? "";
      expect(summary.length).toBeLessThanOrEqual(1300);
      expect(summary.endsWith(S8)).toBe(true);
      expect(summary).toContain(S2);
    });
  });

  describe("what the record never keeps", () => {
    const SENTINELS = [
      "ZZAIID",
      "ZZROOT",
      "ZZLOCUS",
      "ZZSEVERITY",
      "ZZEXPLOIT",
      "ZZLOSS",
      "ZZCONFIDENCE",
      "ZZTELEMETRY",
      "ZZBLAST",
      "ZZOCCURRED",
      "ZZDISCLOSED",
      "ZZSTATUSKEY",
      "ZZLOCUSKEY",
      "ZZYEARKEY",
      "ZZSTATUSTAIL",
      "ZZOPERATORTAIL",
    ];

    function leaky(): Record<string, string> {
      return {
        ...entry({
          id: "PIR-2026-0900",
          title: "ZibbleCo agent did a thing",
          aiid: "https://incidentdatabase.ai/cite/77 ZZAIID",
          status: "corroborated (ZZSTATUSTAIL, quoted: 'the agent did it')",
          operator_type: "enterprise (Zibblecorp, ZZOPERATORTAIL)",
        }),
        date_occurred: "2026-01-01 ZZOCCURRED",
        date_disclosed: "2026-01-02 ZZDISCLOSED",
        root_cause: "ZZROOT plain-error (primary)",
        failure_locus: "ZZLOCUS agent-reasoning",
        severity: "ZZSEVERITY loss (about the money)",
        exploitation_status: "ZZEXPLOIT in-wild",
        direct_loss_usd: "ZZLOSS unknown",
        confidence: "ZZCONFIDENCE high (quote)",
        telemetry_grade: "ZZTELEMETRY operator-logs",
        blast_radius: "ZZBLAST many",
        status_key: "ZZSTATUSKEY",
        locus_key: "ZZLOCUSKEY",
        year_key: "ZZYEARKEY",
      };
    }

    it("holds a sentinel in every field that is left out (a check of the fixture)", () => {
      const text = JSON.stringify(leaky());
      for (const sentinel of SENTINELS) expect(text).toContain(sentinel);
    });

    it("keeps none of them, in the body of the snapshot or in a record", async () => {
      const { snapshot, result, byId } = await run([...fillers(), leaky()]);
      expect(byId.has("zibbleco")).toBe(true);
      const everything = `${snapshot.bodies.join("")}${JSON.stringify(result.records)}`;
      for (const sentinel of SENTINELS) expect(everything).not.toContain(sentinel);
    });

    it("never reads the cross-reference to the AI Incident Database, not even its address", async () => {
      const { snapshot, result } = await run([
        ...fillers(),
        entry({
          id: "PIR-2026-0901",
          title: "ZibbleCo agent did a thing",
          aiid: "see https://incidentdatabase.ai/cite/77 and 123",
        }),
        entry({ id: "PIR-2026-0902", title: "ZibbleCo agent did two things" }),
      ]);
      const everything = `${snapshot.bodies.join("")}${JSON.stringify(result.records)}`;
      expect(everything).not.toContain("incidentdatabase");
      expect(everything).not.toContain("aiid");
    });

    it("keeps no title of an entry that gives no name", async () => {
      const { snapshot } = await run([
        ...fillers(),
        entry({ id: "PIR-2026-0903", title: "ZZNOKEYTITLE agent did a thing" }),
      ]);
      expect(snapshot.bodies[0]).not.toContain("ZZNOKEYTITLE");
    });

    it("works with the 21 keys of an entry and the 22 keys of one with a cross-reference", async () => {
      const without = entry({ id: "PIR-2026-0904", title: "ZibbleCo agent a" });
      const withIt = entry({ id: "PIR-2026-0905", title: "ZibbleCo agent b", aiid: "an id" });
      expect(Object.keys(without)).toHaveLength(21);
      expect(Object.keys(withIt)).toHaveLength(22);
      const { byId } = await run([...fillers(), without, withIt]);
      expect(byId.get("zibbleco")?.identifiers).toMatchObject({ entries: 2 });
    });
  });

  describe("cells that a third party wrote", () => {
    it("are cleaned: controls, bidirectional and zero-width characters, and a lone surrogate", async () => {
      const nul = String.fromCharCode(0);
      const bell = String.fromCharCode(7);
      const bidi = String.fromCodePoint(0x202e);
      const zero = String.fromCodePoint(0x200b);
      const lone = String.fromCharCode(0xd800);
      const { result, byId } = await run([
        ...fillers(),
        entry({
          id: "PIR-2026-1000",
          title: `ZibbleCo${nul} agent${bell} ${bidi}did${zero} a thing ${lone}`,
          cause_key: `plain${nul}-error`,
          severity_key: `${bidi}loss`,
        }),
      ]);
      // The lone surrogate is replaced by U+FFFD; every other character that nobody sees is gone.
      const replacement = String.fromCodePoint(0xfffd);
      expect(byId.get("zibbleco")?.summary).toContain(
        `PIR-2026-1000 (2025-06-15, plain-error, loss): ZibbleCo agent did a thing ${replacement}`,
      );
      expectWellFormedRecords(result.records, { sourceId: "piperoll", mark: MARK });
    });

    it("keep no angle bracket: a tag is written with the angle quotation marks", async () => {
      const { byId, result } = await run([
        ...fillers(),
        entry({
          id: "PIR-2026-1001",
          title:
            "ZibbleCo agent ran <script>alert(1)</script> and " +
            String.fromCodePoint(0xff1c) +
            "b" +
            String.fromCodePoint(0xff1e),
        }),
      ]);
      const summary = byId.get("zibbleco")?.summary ?? "";
      expect(summary).not.toMatch(/[<>]/);
      expect(summary).toContain("ZibbleCo agent ran");
      expectWellFormedRecords(result.records, { sourceId: "piperoll", mark: MARK });
    });

    it("are cut: a title of 100 KB is read to its brand and shown at 80 characters", async () => {
      const { byId, snapshot } = await run([
        ...fillers(),
        entry({ id: "PIR-2026-1002", title: `ZibbleCo ${"x".repeat(100_000)}` }),
      ]);
      const summary = byId.get("zibbleco")?.summary ?? "";
      // The title is cut at 300 units, and its last word, here the whole run of x, may be the
      // fragment of a longer one: the quote is what was read before it, and the mark.
      expect(summary).toContain("near-miss): ZibbleCo [shortened].");
      expect(summary).not.toContain("xxx");
      expect(summary.length).toBeLessThanOrEqual(1300);
      // The body holds the title cut to 80, nothing near the 100 KB.
      expect(snapshot.bodies[0].length).toBeLessThan(20_000);
    });

    it("are refused when a name that they give is more than 160 characters: the entry is unreadable", async () => {
      const longName = `aB${"a".repeat(200)}`;
      const { body, byId } = await run([
        ...fillers(),
        entry({ id: "PIR-2026-1003", title: `ZibbleCo agent met ${longName}` }),
      ]);
      expect(byId.has("zibbleco")).toBe(false);
      expect(body.unreadable).toBe(1);
    });

    it("are cut at 100 KB without a space too: the one word is the last word of a cut title, which gives no name, and the entry is no entity", async () => {
      const { body, byId } = await run([
        ...fillers(),
        entry({ id: "PIR-2026-1004", title: `aB${"a".repeat(100_000)}` }),
      ]);
      expect(extraKeys(byId)).toEqual([]);
      expect(body.unreadable).toBe(0);
    });

    it("are cut at 100 KB, and a name that is too long and not the last word of the cut title is still refused", async () => {
      const { body } = await run([
        ...fillers(),
        entry({ id: "PIR-2026-1005", title: `aB${"a".repeat(200)} ${"word ".repeat(20_000)}` }),
      ]);
      expect(body.unreadable).toBe(1);
    });

    it("are cut where the text shows them: a cause at 30 characters and a severity at 20, with the mark", async () => {
      const { byId } = await run([
        ...fillers(),
        entry({
          id: "PIR-2026-1006",
          title: "ZibbleCo agent a",
          cause_key: `c-${"c".repeat(60)}`,
          severity_key: `s-${"s".repeat(40)}`,
        }),
      ]);
      expect(byId.get("zibbleco")?.summary).toContain(
        `(2025-06-15, c-${"c".repeat(16)} [shortened], s-${"s".repeat(6)} [shortened])`,
      );
    });

    it("keep their sentence whole in the text when a title ends with a full stop", async () => {
      const { byId } = await run([
        ...fillers(),
        entry({ id: "PIR-2026-1005", title: "ZibbleCo agent did a thing." }),
      ]);
      const summary = byId.get("zibbleco")?.summary ?? "";
      expect(summary).toContain("did a thing.");
      expect(summary).not.toContain("..");
    });
  });

  describe("a file that is not the list", () => {
    const failsAsNotTheList = async (body: string): Promise<void> => {
      const fetch = fakeFetch(filesOf(body));
      expect(await failureOf(piperollConnector.download(fetch, {}))).toBeInstanceOf(
        NotTheListError,
      );
    };

    it.each([
      ["an HTML page", "<html><body>Not found</body></html>"],
      ["nothing", ""],
      ["text that is not JSON", "not json at all"],
      ["an array", "[]"],
      ["a list of entries with no root", JSON.stringify(fillers())],
      ["a text", '"records"'],
      ["null", "null"],
      ["a root without records", JSON.stringify({ registry: "x", generated_from: "y" })],
      ["records that are no array", JSON.stringify({ records: "none" })],
      ["records that are an object", JSON.stringify({ records: { a: 1 } })],
      ["an empty array of records", registryText([])],
      ["a registry that is cut in the middle", registryText(fillers()).slice(0, 2000)],
    ])("is refused for %s, as not the list", async (_name, body) => {
      await failsAsNotTheList(body);
    });

    it("is refused for fewer than 50 readable entries, and read at 50", async () => {
      await failsAsNotTheList(registryText(fillers(49)));
      const { result } = await run(fillers(50));
      expect(result.errors).toBe(0);
      expect(result.records.length).toBeGreaterThan(0);
    });

    it("does not count the entries that are not readable toward the 50", async () => {
      const bad = Array.from({ length: 6 }, (_, at) =>
        entry({ id: `PIR-2024-${pad(at)}`, sort_date: "garbage" }),
      );
      await failsAsNotTheList(registryText([...fillers(49), ...bad]));
    });

    it("counts an entry that is withdrawn, or gives no name, as readable", async () => {
      const mixed = [
        ...fillers(40),
        ...Array.from({ length: 5 }, (_, at) =>
          entry({ id: `PIR-2024-${pad(at)}`, status: "withdrawn (x)" }),
        ),
        ...Array.from({ length: 5 }, (_, at) =>
          entry({ id: `PIR-2023-${pad(at)}`, title: "no name here" }),
        ),
      ];
      const { result } = await run(mixed);
      expect(result.errors).toBe(0);
    });

    it("does not look at the registry's name or source in the root: the entries are what it checks", async () => {
      const fetch = fakeFetch(filesOf(JSON.stringify({ records: fillers() })));
      const snapshot = await piperollConnector.download(fetch, {});
      if (snapshot === "unchanged") throw new Error("unchanged");
      expect(piperollConnector.parse(snapshot).records).toHaveLength(8);
    });

    it("reads a file that begins with a byte order mark", async () => {
      const bom = String.fromCodePoint(0xfeff);
      const fetch = fakeFetch(filesOf(`${bom}${registryText(fillers())}`));
      const snapshot = await piperollConnector.download(fetch, {});
      expect(snapshot).not.toBe("unchanged");
    });

    it("fails, with a message that holds no address, as a download", async () => {
      const fetch = fakeFetch(filesOf("not json"));
      const error = (await failureOf(piperollConnector.download(fetch, {}))) as Error;
      expect(error).toBeInstanceOf(NotTheListError);
      expect(error.message).not.toMatch(/piperoll|https?:/i);
    });
  });

  describe("a registry over its limits", () => {
    it("is read at 5,000 entries", async () => {
      const entries = Array.from({ length: 5000 }, (_, at) => ({
        id: `PIR-${2000 + Math.floor(at / 1000)}-${pad(at % 1000)}`,
        title: `${BRANDS[at % BRANDS.length]} agent did a thing`,
        sort_date: dayAt(at % 700),
        status: "corroborated (x)",
        operator_type: "unknown (x)",
        url: `pir/${2000 + Math.floor(at / 1000)}-${pad(at % 1000)}/`,
        cause_key: "plain-error",
        severity_key: "loss",
      }));
      const { result, body, byId } = await run(entries);
      expect(result.errors).toBe(0);
      expect(body.total).toBe(5000);
      expect(byId.size).toBe(BRANDS.length);
      const ids = (byId.get("zorbixai")?.identifiers as { entries: number; ids: string[] }) ?? {
        entries: 0,
        ids: [],
      };
      expect(ids.entries).toBe(625);
      expect(ids.ids).toHaveLength(100);
    });

    it("fails the download as too large, and never gives a shorter list, at 5,001 entries", async () => {
      const entries = Array.from({ length: 5001 }, () => ({}));
      const fetch = fakeFetch(filesOf(registryText(entries)));
      expect(await failureOf(piperollConnector.download(fetch, {}))).toBeInstanceOf(
        BodyTooLargeError,
      );
    });

    it("fails the download as too large when the file is cut at its limit", async () => {
      const cut = fakeFetch(filesOf(registryText(fillers()), { truncated: true }));
      expect(await failureOf(piperollConnector.download(cut, {}))).toBeInstanceOf(
        BodyTooLargeError,
      );
      const long = `${registryText(fillers())}${" ".repeat(4_194_304)}`;
      const over = fakeFetch(filesOf(long));
      expect(await failureOf(piperollConnector.download(over, {}))).toBeInstanceOf(
        BodyTooLargeError,
      );
    });

    it("gives a total that is no less than the entities that the entries made", async () => {
      // 60 entries of 4 new names each make 240 entities, more than the 60 entries.
      const entries = Array.from({ length: 60 }, (_, at) =>
        entry({
          id: `PIR-2022-${pad(at)}`,
          title: [0, 1, 2, 3].map((slot) => brandOf(at * 4 + slot)).join(" "),
        }),
      );
      const { body, result } = await run(entries);
      expect(body.rows).toHaveLength(240);
      expect(body.total).toBeGreaterThanOrEqual(240);
      expect(result.errors).toBe(0);
      expect(result.records).toHaveLength(240);
    });
  });

  describe("entries that do not read, and the allowance for them", () => {
    /** 70 entries of one name each, so that 70 entities stand beside the entries that do not read. */
    const wellRead = (): Array<Record<string, string>> =>
      Array.from({ length: 70 }, (_, at) =>
        entry({ id: `PIR-2024-${pad(at)}`, title: `${brandOf(at)} agent did a thing` }),
      );
    const unreadable = (count: number): Array<Record<string, string>> =>
      Array.from({ length: count }, (_, at) =>
        entry({ id: `PIR-2023-${pad(at)}`, sort_date: "not a day" }),
      );

    it("are counted and left out, within the allowance of the kit", async () => {
      const { result, body } = await run([...wellRead(), ...unreadable(2)]);
      expect(body.unreadable).toBe(2);
      expect(result).toMatchObject({ errors: 0, skipped: 2 });
      expect(result.records).toHaveLength(70);
    });

    it("fail the list when there are more than the allowance: one more than a tenth of the entities", async () => {
      const allowed = unreadableAllowed(70 + 8);
      expect(allowed).toBe(8);
      const within = await run([...wellRead(), ...unreadable(8)]);
      expect(within.result).toMatchObject({ errors: 0, skipped: 8 });
      const over = await run([...wellRead(), ...unreadable(9)]);
      expect(unreadableAllowed(70 + 9)).toBe(8);
      expect(over.result.errors).toBe(9);
      expect(over.result.skipped).toBe(0);
      expect(over.result.records).toHaveLength(70);
    });
  });

  describe("the order of the file", () => {
    function tied(): Array<Record<string, string>> {
      return [
        ...fillers(),
        entry({ id: "PIR-2026-1100", title: "ZibbleCo agent a", sort_date: "2026-03-03" }),
        entry({ id: "PIR-2026-1101", title: "ZibbleCo agent b", sort_date: "2026-03-03" }),
        entry({ id: "PIR-2026-1102", title: "ZibbleCo agent c", sort_date: "2026-03-00" }),
        entry({ id: "PIR-2026-1103", title: "ZibbleCo agent d", sort_date: "2026-00-00" }),
        entry({ id: "PIR-2026-1104", title: "ZetaChat agent a", sort_date: "2026-03-03" }),
        entry({ id: "PIR-2026-1105", title: "agent b", operator_type: "enterprise (Zetachat, x)" }),
        entry({ id: "PIR-2026-1106", title: "ZibbleCo agent c", sort_date: "2026-03-03" }),
        entry({ id: "PIR-2026-1107", title: "QuarkHub and ZetaChat agents" }),
        entry({ id: "PIR-2026-1108", title: "agent z", status: "withdrawn (x)" }),
        entry({ id: "PIR-2026-1109", title: "agent y", sort_date: "garbage" }),
      ];
    }

    it("never changes the body or the records (the kit's contract)", async () => {
      const records = tied();
      await expectDeterministic(piperollConnector, (reversed) =>
        fakeFetch(filesOf(registryText(reversed ? [...records].reverse() : records))),
      );
    });

    it("gives the same body for every rotation of the entries", async () => {
      const records = tied();
      const bodies = new Set<string>();
      for (const shift of [0, 7, 19, 33, 61]) {
        const rotated = [...records.slice(shift), ...records.slice(0, shift)];
        const fetch = fakeFetch(filesOf(registryText(rotated)));
        const snapshot = await piperollConnector.download(fetch, {});
        if (snapshot === "unchanged") throw new Error("unchanged");
        bodies.add(snapshot.bodies[0]);
      }
      expect(bodies.size).toBe(1);
    });

    it("gives the same id to a name whatever the order of the entries that show it", async () => {
      const records = tied();
      const forward = await run(records);
      const backward = await run([...records].reverse());
      expect([...forward.byId.keys()]).toEqual([...backward.byId.keys()]);
      expect(forward.byId.get("zibbleco")?.sourceRecordId).toBe("zibbleco");
    });
  });

  describe("the answer of the server", () => {
    it("is 'unchanged' when the file is the one that the stored validators name, and nothing is read", async () => {
      const fetch = fakeFetch(filesOf(registryText(fillers())));
      const first = await piperollConnector.download(fetch, {});
      if (first === "unchanged") throw new Error("unchanged");
      const second = await piperollConnector.download(fetch, {
        etag: first.etag,
        lastModified: first.lastModified,
      });
      expect(second).toBe("unchanged");
      expect(fetch.calls).toHaveLength(2);
      // The stored etag is behind the prefix of the version; the server gets its own.
      expect(fetch.calls[1].validators).toEqual({ etag: ETAG, lastModified: LAST_MODIFIED });
    });

    it("is read again when the stored etag is that of another version of the reading", async () => {
      const fetch = fakeFetch(filesOf(registryText(fillers())));
      const answer = await piperollConnector.download(fetch, {
        etag: `k0:${ETAG}`,
        lastModified: LAST_MODIFIED,
      });
      expect(answer).not.toBe("unchanged");
      expect(fetch.calls[0].validators).toEqual({});
    });

    it("fails as not allowed when the answer came from another host", async () => {
      const fetch = fakeFetch(
        filesOf(registryText(fillers()), { url: "https://evil.example/registry.json" }),
      );
      const error = await failureOf(piperollConnector.download(fetch, {}));
      expect(error).toBeInstanceOf(FetchError);
      expect((error as FetchError).reason).toBe("not_allowed");
      expect((error as Error).message).not.toContain("evil");
    });

    it("fails as not allowed when a 304 came from another host", async () => {
      const fetch = fakeFetch(
        filesOf(registryText(fillers()), { url: "https://evil.example/registry.json" }),
      );
      const error = await failureOf(
        piperollConnector.download(fetch, { etag: `k1:${ETAG}`, lastModified: LAST_MODIFIED }),
      );
      expect(error).toBeInstanceOf(FetchError);
      expect((error as FetchError).reason).toBe("not_allowed");
    });

    it("fails as not allowed for the registry's host with another port, scheme or user name", async () => {
      for (const url of [
        "https://piperoll.org:8443/registry.json",
        "http://piperoll.org/registry.json",
        "https://user@piperoll.org/registry.json",
        "https://www.piperoll.org/registry.json",
        "https://piperoll.org.evil.example/registry.json",
      ]) {
        const fetch = fakeFetch(filesOf(registryText(fillers()), { url }));
        const error = await failureOf(piperollConnector.download(fetch, {}));
        expect(error).toBeInstanceOf(FetchError);
      }
    });

    it("takes an answer that comes from another path of the registry's host", async () => {
      const fetch = fakeFetch(
        filesOf(registryText(fillers()), { url: "https://piperoll.org/data/registry.json" }),
      );
      expect(await piperollConnector.download(fetch, {})).not.toBe("unchanged");
    });

    it("fails for a type that the limits do not list, as the page guard does", async () => {
      const fetch = fakeFetch(filesOf(registryText(fillers()), { contentType: "text/html" }));
      const error = await failureOf(piperollConnector.download(fetch, {}));
      expect(error).toBeInstanceOf(FetchError);
      expect((error as FetchError).reason).toBe("unsupported_type");
    });
  });

  describe("parse of a body that the download made", () => {
    it("is the same for the same body: the records do not depend on the clock", async () => {
      const { snapshot } = await run(fillers());
      expect(piperollConnector.parse(snapshot)).toEqual(piperollConnector.parse(snapshot));
    });

    it("is no list for a body that is not the one of the download", () => {
      const result = piperollConnector.parse({
        bodies: ["{}"],
        etag: null,
        lastModified: null,
        bytes: 2,
      });
      expect(result).toMatchObject({ records: [], root: null });
      expect(result.errors).toBeGreaterThan(0);
    });
  });
});
