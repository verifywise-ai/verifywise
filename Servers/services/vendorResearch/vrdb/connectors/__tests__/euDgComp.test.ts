/**
 * The European Commission's competition case data (DG COMP open data) as a mirrored list of the
 * vendor risk database: the antitrust and cartel file (AT) and the Digital Markets Act file (DMA),
 * two whole JSON objects keyed by case number, read into one record per undertaking. The files are
 * synthetic: they copy the shape of the portal's files (every metadata value an array, JSON text
 * inside strings, the spacing `"AT.nnnnn" :{`, decisions with a day and a type) with every name,
 * number and text invented. Every field the connector must leave out holds a token that starts with
 * `ZZ-`, so that a copy of it anywhere in a body or a record is found. The floors of the reader
 * (600 cases of the AT file, 40 of the DMA file) make the base files 640 and 45 cases long, built by
 * a function. Every character that is hard to type is written as an escape. The pause between the
 * two requests is injected: every test but one hands the connector a sleep that does not wait.
 */
import { FetchError } from "../../../../webResearch/guardedFetch";
import type { ParsedRecord } from "../../types";
import {
  EU_DG_COMP_RECORD_MARK,
  type EuUndertaking,
  createEuDgCompConnector,
  euDgCompConnector,
} from "../euDgComp";
import { LINE_INPUT_MAX, unreadableAllowed } from "../kit/clean";
import {
  BodyTooLargeError,
  type Connector,
  type ConnectorFetch,
  NotTheListError,
  type Snapshot,
} from "../types";
import {
  type FakeFile,
  expectDeterministic,
  expectWellFormedRecords,
  fakeFetch,
} from "./helpers/kitContract";

jest.setTimeout(30_000);

type Json = Record<string, unknown>;
type Entry = [key: string, value: Json];

const BUCKET = "https://compcases-open-data-portal-files-prod.s3.eu-west-1.amazonaws.com";
const AT_URL = `${BUCKET}/case-data-AT.json`;
const DMA_URL = `${BUCKET}/case-data-DMA.json`;
const MARK = EU_DG_COMP_RECORD_MARK;
const HOST_SENTENCE = `${MARK} (competition-policy.ec.europa.eu), an enforcement or case list.`;
const DOCUMENTATION_URL =
  "https://competition-policy.ec.europa.eu/about/news/dg-competitions-case-data-available-open-data-2025-03-18_en";
const CLOSING =
  "A case listing is not a finding of infringement against a listed party unless a decision " +
  "addressed to it says so; mergers are not in this list. Source: European Commission, DG " +
  "Competition case data, (c) European Union, CC BY 4.0; adapted by VerifyWise.";

const MIB = 1024 * 1024;

/** The tokens of the fields that the connector leaves out: each is in a field no record may hold. */
const LEFT_OUT = {
  attachment: "ZZ-ATTACHMENT-LINK",
  externalLink: "ZZ-EXTERNAL-LINK",
  press: "ZZ-PRESS-RELEASE-TEXT",
  timeline: "ZZ-TIMELINE-TEXT",
  sector: "ZZ-SECTOR",
  journal: "ZZ-JOURNAL",
  numberPart: "ZZ-NUMBER-PART",
  court: "ZZ-COURT",
  designation: "ZZ-DESIGNATION",
  platform: "ZZ-CORE-PLATFORM",
  obligation: "ZZ-OBLIGATION",
  decisionAttachment: "ZZ-DECISION-ATTACHMENT",
  decisionPress: "ZZ-DECISION-PRESS",
  decisionLink: "ZZ-DECISION-LINK",
  decisionNumber: "ZZ-DECISION-NUMBER",
  antitrustTitle: "ZZ-ANTITRUST-TITLE",
};

/** The text of the files and of what they make holds none of the tokens of what is left out. */
function expectNothingLeft(...texts: string[]): void {
  for (const text of texts) {
    for (const token of Object.values(LEFT_OUT)) expect(text).not.toContain(token);
  }
}

/** A name of letters only, of a fixed width: 0 is `aaa`, 1 is `aab`. */
function letters(n: number, width = 3): string {
  let text = "";
  let rest = n;
  for (let at = 0; at < width; at += 1) {
    text = String.fromCharCode(97 + (rest % 26)) + text;
    rest = Math.floor(rest / 26);
  }
  return text;
}

/** An invented company with a legal form: no person's name, no real company. */
const orgName = (n: number): string => `Vantora${letters(n)} Ltd`;
const gatekeeper = (n: number): string => `Gatewarden${letters(n, 2)} Inc.`;

interface DecisionSpec {
  /** The adoption day; null leaves the array empty. */
  day?: string | null;
  /** The label of the decision type; null leaves the array empty. */
  type?: string | null;
  /** The array of decisionTypes as it is, for a placeholder or a text that is not JSON. */
  typeRaw?: string[];
}

interface Spec {
  number: string;
  /** AT only: the value of caseCartel[0]; null leaves the key out; any other text is written as it is. */
  cartel?: string | null;
  /** The title; null leaves the array empty. */
  title?: string | null;
  companies?: string[];
  /** The initiation day; null leaves the array empty. */
  initiation?: string | null;
  /** The label of the legal basis; null leaves the array empty. */
  legal?: string | null;
  /** The array of caseLegalBasis as it is, for a placeholder or a text that is not JSON. */
  legalRaw?: string[];
  decisions?: DecisionSpec[];
}

const jsonText = (value: unknown): string => JSON.stringify(value);

function decisionOf(spec: Spec, decision: DecisionSpec, at: number): Json {
  return {
    metadata: {
      language: ["en"],
      metadataReference: [`${spec.number}-DEC{${at}}`],
      decisionExternalLinks: [jsonText({ items: [{ url: LEFT_OUT.decisionLink }] })],
      decisionOfficialJournalPublications: [jsonText({ items: [{}] })],
      decisionPressReleases: [jsonText({ items: [{ description: LEFT_OUT.decisionPress }] })],
      decisionPressReleasesPublicationDates: ["2011-01-01"],
      decisionAdoptionDate: decision.day === null ? [] : [decision.day ?? "2011-01-01"],
      decisionTypes:
        decision.typeRaw ??
        (decision.type === null
          ? []
          : [jsonText({ code: "DT-1", label: decision.type ?? "Prohibition Decision" })]),
      decisionNumber: [`{${LEFT_OUT.decisionNumber}}`],
      decisionOfficialJournalPublicationsPublishedDates: [],
      metadataType: ["DECISION_METADATA"],
    },
    decisionAttachments: [
      { metadata: { attachmentLink: [`https://sentinel.example/${LEFT_OUT.decisionAttachment}`] } },
    ],
  };
}

/** A case as the portal writes it: every metadata value an array, JSON text inside strings. */
function caseOf(spec: Spec, file: "AT" | "DMA"): Json {
  const cartel = spec.cartel === undefined ? "Antitrust" : spec.cartel;
  const isNonCartel = file === "AT" && cartel !== "Cartel";
  const title =
    spec.title === undefined
      ? isNonCartel
        ? `${LEFT_OUT.antitrustTitle} ${spec.number}`
        : `Synthetic title ${spec.number}`
      : spec.title;
  const legal = spec.legal === undefined ? "Art. 101 TFEU" : spec.legal;
  const metadata: Json = {
    caseLastDecisionDate: [],
    caseExternalLinks: [
      jsonText({ items: [{ url: `https://sentinel.example/${LEFT_OUT.externalLink}` }] }),
    ],
    caseLinks: [],
    caseInstrument: [file === "AT" ? "Antitrust & Cartels" : "Digital Markets Act"],
    language: ["en"],
    metadataReference: [spec.number],
    caseNumberPart: [LEFT_OUT.numberPart],
    caseType: [file === "AT" ? "AtStandardATCCase" : "DmaGateKeeperCaseType"],
    caseNumber: [spec.number],
    casePressReleases: [jsonText({ items: [{ description: LEFT_OUT.press }] })],
    caseTimelineEvents: [jsonText({ items: [{ description: LEFT_OUT.timeline }] })],
    caseInitiationDate: spec.initiation === null ? [] : [spec.initiation ?? "2010-03-12"],
    caseCourtCases: [LEFT_OUT.court],
    caseOfficialJournalPublications: [jsonText({ items: [{ title: LEFT_OUT.journal }] })],
    ...(file === "AT" && spec.cartel !== null ? { caseCartel: [cartel] } : {}),
    caseLegalBasis:
      spec.legalRaw ?? (legal === null ? [] : [jsonText({ code: "LB-1", label: legal })]),
    caseCompanies: spec.companies ?? [],
    caseTitle: title === null ? [] : [title],
    caseDg: ["Competition DG"],
    caseOfficialJournalPublicationsPublishedDates: [],
    caseTimelineEventsDates: [],
    casePressReleasesPublicationDates: [],
    caseSectors: [jsonText({ code: LEFT_OUT.sector, label: LEFT_OUT.sector })],
    metadataType: ["CASE_METADATA"],
    ...(file === "DMA"
      ? {
          caseDesignations: [LEFT_OUT.designation],
          caseCorePlatformServices: [LEFT_OUT.platform],
          caseConcernedObligations: [LEFT_OUT.obligation],
        }
      : {}),
  };
  return {
    metadata,
    caseAttachments: [
      { metadata: { attachmentLink: [`https://sentinel.example/${LEFT_OUT.attachment}`] } },
    ],
    decisions: (spec.decisions ?? []).map((decision, at) => decisionOf(spec, decision, at)),
  };
}

const atCase = (spec: Spec): Entry => [spec.number, caseOf(spec, "AT")];
const dmaCase = (spec: Spec): Entry => [spec.number, caseOf(spec, "DMA")];

/** The AT file: 640 cases, a third of them cartels, the first opened in 1977 (the floors want 600). */
function baseAt(count = 640): Entry[] {
  return Array.from({ length: count }, (_, i) =>
    atCase({
      number: `AT.${90000 + i}`,
      cartel: i % 3 === 0 ? "Cartel" : "Antitrust",
      companies: i % 5 === 0 ? [orgName(i), orgName(i + 2000)] : [orgName(i)],
      initiation: i === 0 ? "1977-05-04" : `${2000 + (i % 26)}-0${1 + (i % 9)}-1${i % 9}`,
      decisions:
        i % 2 === 0
          ? [{ day: `${2001 + (i % 25)}-07-1${i % 9}`, type: "Prohibition Decision" }]
          : [],
    }),
  );
}

/** The DMA file: 45 cases of five gatekeepers, the first opened in 2022 (the floors want 40). */
function baseDma(count = 45): Entry[] {
  return Array.from({ length: count }, (_, i) =>
    dmaCase({
      number: `DMA.${900000 + i}`,
      companies: [gatekeeper(i % 5)],
      initiation: i === 0 ? "2022-10-26" : `${2023 + (i % 4)}-0${1 + (i % 9)}-1${i % 9}`,
      legal: "Art. 3(4) DMA",
      decisions: [{ day: `${2023 + (i % 4)}-09-0${1 + (i % 9)}`, type: "Designation decision" }],
    }),
  );
}

/** A file as the portal writes it: pretty-printed, with a blank before the colon of each case. */
const fileText = (entries: ReadonlyArray<readonly [string, unknown]>): string =>
  `{\n${entries.map(([key, value]) => `"${key}" :${JSON.stringify(value, null, 2)}`).join(",\n")}\n}\n`;

interface FileOverrides {
  at?: Partial<FakeFile>;
  dma?: Partial<FakeFile>;
}

type RawEntry = readonly [key: string, value: unknown];

const filesOf = (
  at: ReadonlyArray<RawEntry> = baseAt(),
  dma: ReadonlyArray<RawEntry> = baseDma(),
  over: FileOverrides = {},
): Record<string, FakeFile> => ({
  [AT_URL]: { body: fileText(at), contentType: "application/octet-stream", ...over.at },
  [DMA_URL]: { body: fileText(dma), contentType: "application/octet-stream", ...over.dma },
});

/** The pause between the two requests: a sleep that does not wait, so that no test waits for real. */
const sleep = jest.fn(async (_ms: number): Promise<void> => undefined);
/** The connector of the tests: the factory's, with that sleep (the module's own waits a real second). */
const connector = createEuDgCompConnector({ sleep });

beforeEach(() => {
  sleep.mockClear();
});

async function downloadOf(files: Record<string, FakeFile>): Promise<Snapshot> {
  const snapshot = await connector.download(fakeFetch(files), {});
  if (snapshot === "unchanged") throw new Error("The fake fetch said that nothing changed.");
  return snapshot;
}

/** The failure of a promise, or undefined when it did not fail. */
const failureOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );

interface Body {
  v: number;
  rows: EuUndertaking[];
  total: number;
  unreadable: number;
}

const bodyOf = (snapshot: Snapshot): Body => JSON.parse(snapshot.bodies[0]) as Body;
const rowOf = (snapshot: Snapshot, id: string): EuUndertaking | undefined =>
  bodyOf(snapshot).rows.find((row) => row.id === id);
const recordOfId = (records: readonly ParsedRecord[], id: string): ParsedRecord | undefined =>
  records.find((record) => record.sourceRecordId === id);

/** The records of a download of the files. */
async function recordsOf(files: Record<string, FakeFile>): Promise<ParsedRecord[]> {
  const snapshot = await downloadOf(files);
  const parsed = connector.parse(snapshot);
  expect(parsed.errors).toBe(0);
  return parsed.records;
}

/**
 * The files of one undertaking, "Synthetic Dynamics Ltd", that a cartel case, a case that is no
 * cartel and a DMA case name: the base files and three more cases.
 */
const dynamicsFiles = (): Record<string, FakeFile> =>
  filesOf(
    [
      ...baseAt(),
      atCase({
        number: "AT.99001",
        cartel: "Cartel",
        title: "Synthetic cartel title",
        companies: [
          "Synthetic Dynamics Ltd",
          "Partnerco A Ltd",
          "Partnerco B Ltd",
          "Partnerco C Ltd",
          "Partnerco D Ltd",
        ],
        initiation: "2004-03-10",
        legal: "Art. 101 TFEU",
        decisions: [
          { day: "2005-06-20", type: "Prohibition Decision" },
          { day: "2005-09-01", type: "Decision imposing fines" },
        ],
      }),
      atCase({
        number: "AT.99002",
        cartel: "Antitrust",
        companies: ["Synthetic Dynamics Ltd", "Otherco Ltd"],
        initiation: "2010-01-15",
        legal: "Art. 102 TFEU",
      }),
    ],
    [
      ...baseDma(),
      dmaCase({
        number: "DMA.900901",
        title: "Synthetic DMA title",
        companies: ["Synthetic Dynamics Ltd"],
        initiation: "2023-03-01",
        legal: "Art. 3(4) DMA",
        decisions: [{ day: "2023-09-05", type: "Designation decision" }],
      }),
    ],
  );

describe("euDgCompConnector", () => {
  describe("the connector", () => {
    it("is the snapshot connector of the list, at version 1, whether it is made with a sleep or exported", () => {
      for (const own of [connector, euDgCompConnector]) {
        expect(own.id).toBe("eu_dg_comp");
        expect(own.version).toBe(1);
        expect(own.kind).toBeUndefined();
      }
    });

    it("exports the mark that the analysis prompt names the list by", () => {
      expect(EU_DG_COMP_RECORD_MARK).toBe("European Commission competition cases");
    });
  });

  describe("download of the two files", () => {
    it("asks the AT file and then the DMA file, with no validators and the limits of each", async () => {
      const fetch = fakeFetch(filesOf());

      await connector.download(fetch, {});

      expect(fetch.calls).toEqual([
        {
          url: AT_URL,
          validators: {},
          limits: {
            maxBytes: 8 * MIB,
            allowedContentTypes: ["application/octet-stream", "application/json"],
            totalTimeoutMs: 120_000,
          },
        },
        {
          url: DMA_URL,
          validators: {},
          limits: {
            maxBytes: 4 * MIB,
            allowedContentTypes: ["application/octet-stream", "application/json"],
            totalTimeoutMs: 120_000,
          },
        },
      ]);
    });

    it("sends no validators whatever was stored: two files are asked in full, never conditionally", async () => {
      const fetch = fakeFetch(filesOf(baseAt(), baseDma(), { at: { etag: '"at"' } }));

      await connector.download(fetch, {
        etag: 'k1:"at"',
        lastModified: "Mon, 09 Nov 2026 05:00:23 GMT",
      });

      expect(fetch.calls.map((call) => call.validators)).toEqual([{}, {}]);
    });

    it("gives one snapshot: the body, the prefix of the version alone, no date, the bytes of both files", async () => {
      const files = filesOf();
      const snapshot = await downloadOf(files);

      expect(snapshot.bodies).toHaveLength(1);
      expect(snapshot.etag).toBe("k1:");
      expect(snapshot.lastModified).toBeNull();
      expect(snapshot.bytes).toBe(
        Buffer.byteLength(files[AT_URL].body as string) +
          Buffer.byteLength(files[DMA_URL].body as string),
      );
    });

    it("reads the files as the portal writes them: a blank before the colon, octet-stream, no compression", async () => {
      const files = filesOf();
      expect(files[AT_URL].body as string).toContain('"AT.90000" :{');
      expect(files[AT_URL].contentType).toBe("application/octet-stream");

      const snapshot = await downloadOf(files);

      expect(bodyOf(snapshot).rows.length).toBeGreaterThan(600);
    });

    it.each([
      ["application/json", "application/json"],
      ["application/json with a charset", "application/json; charset=utf-8"],
      ["octet-stream with a charset", "application/octet-stream; charset=utf-8"],
    ])("accepts the type %s", async (_name, contentType) => {
      const snapshot = await downloadOf(
        filesOf(baseAt(), baseDma(), { at: { contentType }, dma: { contentType } }),
      );
      expect(bodyOf(snapshot).rows.length).toBeGreaterThan(600);
    });

    it("reads a file that begins with a byte order mark, as the kit's text of a file does", async () => {
      const at = `\u{feff}${fileText(baseAt())}`;
      const dma = `\u{feff}${fileText(baseDma())}`;
      const snapshot = await downloadOf({
        [AT_URL]: { body: at, contentType: "application/octet-stream" },
        [DMA_URL]: { body: dma, contentType: "application/octet-stream" },
      });
      expect(bodyOf(snapshot).rows.length).toBeGreaterThan(600);
    });

    it("lets the failures of the fetch through as they are", async () => {
      const unreachable = await failureOf(connector.download(fakeFetch({}), {}));
      expect(unreachable).toBeInstanceOf(FetchError);
      expect((unreachable as FetchError).reason).toBe("unreachable");

      const wrongType = await failureOf(
        connector.download(
          fakeFetch(filesOf(baseAt(), baseDma(), { at: { contentType: "text/html" } })),
          {},
        ),
      );
      expect((wrongType as FetchError).reason).toBe("unsupported_type");
    });

    it("asks no second file after the first failed", async () => {
      const fetch = fakeFetch({ [DMA_URL]: filesOf()[DMA_URL] });
      await failureOf(connector.download(fetch, {}));
      expect(fetch.calls.map((call) => call.url)).toEqual([AT_URL]);
    });

    it.each([
      ["the AT file", AT_URL],
      ["the DMA file", DMA_URL],
    ])("fails as too large when %s was cut at its limit", async (_name, url) => {
      const files = filesOf();
      files[url] = { ...files[url], truncated: true };
      expect(await failureOf(connector.download(fakeFetch(files), {}))).toBeInstanceOf(
        BodyTooLargeError,
      );
    });

    it("fails as too large a file that is longer than its limit: 8 MiB for AT, 4 MiB for DMA", async () => {
      const longAt = `${fileText(baseAt())}${" ".repeat(8 * MIB)}`;
      const longDma = `${fileText(baseDma())}${" ".repeat(4 * MIB)}`;
      expect(
        await failureOf(
          connector.download(
            fakeFetch({
              [AT_URL]: { body: longAt, contentType: "application/octet-stream" },
              [DMA_URL]: filesOf()[DMA_URL],
            }),
            {},
          ),
        ),
      ).toBeInstanceOf(BodyTooLargeError);
      expect(
        await failureOf(
          connector.download(
            fakeFetch({
              [AT_URL]: filesOf()[AT_URL],
              [DMA_URL]: { body: longDma, contentType: "application/octet-stream" },
            }),
            {},
          ),
        ),
      ).toBeInstanceOf(BodyTooLargeError);
    });
  });

  describe("the pause between the two requests", () => {
    /** A connector with a sleep of its own, and the requests and the pauses it made, in order. */
    function recordingConnector(files: Record<string, FakeFile>): {
      own: Connector;
      fetch: ConnectorFetch;
      events: string[];
    } {
      const events: string[] = [];
      const inner = fakeFetch(files);
      return {
        events,
        fetch: async (url, validators, limits) => {
          events.push(`get ${url}`);
          return inner(url, validators, limits);
        },
        own: createEuDgCompConnector({
          sleep: async (ms) => {
            events.push(`sleep ${ms}`);
          },
        }),
      };
    }

    it("waits a second, once, between the two requests", async () => {
      const { own, fetch, events } = recordingConnector(filesOf());

      await own.download(fetch, {});

      // Not before the first request, not after the second, and no more than once.
      expect(events).toEqual([`get ${AT_URL}`, "sleep 1000", `get ${DMA_URL}`]);
    });

    it("asks the sleep that it was given for one second, and for nothing else", async () => {
      await connector.download(fakeFetch(filesOf()), {});

      expect(sleep).toHaveBeenCalledTimes(1);
      expect(sleep).toHaveBeenCalledWith(1000);
    });

    const FIRST_FAILS: Array<[string, () => Record<string, FakeFile>]> = [
      ["the AT file is not there", () => ({ [DMA_URL]: filesOf()[DMA_URL] })],
      [
        "the AT file has a type that is not allowed",
        () => filesOf(baseAt(), baseDma(), { at: { contentType: "text/html" } }),
      ],
      [
        "the AT file was cut at its limit",
        () => filesOf(baseAt(), baseDma(), { at: { truncated: true } }),
      ],
      [
        "the AT request was answered by the other file of the list",
        () => filesOf(baseAt(), baseDma(), { at: { url: DMA_URL } }),
      ],
      [
        "the AT request was answered by another object of the bucket",
        () => filesOf(baseAt(), baseDma(), { at: { url: `${BUCKET}/case-data-M.json` } }),
      ],
      [
        "the AT request was answered from another host",
        () =>
          filesOf(baseAt(), baseDma(), {
            at: { url: "https://evil.example.net/case-data-AT.json" },
          }),
      ],
    ];

    it.each(FIRST_FAILS)(
      "waits for nothing and asks no second file when %s",
      async (_name, files) => {
        const { own, fetch, events } = recordingConnector(files());

        const failure = await failureOf(own.download(fetch, {}));

        expect(failure).toBeInstanceOf(Error);
        expect(events).toEqual([`get ${AT_URL}`]);
      },
    );

    it("waits for nothing when the first answer is one of unchanged", async () => {
      const events: string[] = [];
      const fetch: ConnectorFetch = async (url) => {
        events.push(`get ${url}`);
        return { notModified: true, url };
      };
      const own = createEuDgCompConnector({
        sleep: async (ms) => {
          events.push(`sleep ${ms}`);
        },
      });

      const failure = await failureOf(own.download(fetch, {}));

      expect((failure as FetchError).reason).toBe("unreachable");
      expect(events).toEqual([`get ${AT_URL}`]);
    });

    it("waits once when the second request fails, and lets its failure through", async () => {
      const { own, fetch, events } = recordingConnector({ [AT_URL]: filesOf()[AT_URL] });

      const failure = await failureOf(own.download(fetch, {}));

      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("unreachable");
      expect(events).toEqual([`get ${AT_URL}`, "sleep 1000", `get ${DMA_URL}`]);
    });

    it("waits once for a download whose files turn out not to be the list: both were asked", async () => {
      const { own, fetch, events } = recordingConnector(
        filesOf(baseAt(), baseDma(), { dma: { body: "{}" } }),
      );

      expect(await failureOf(own.download(fetch, {}))).toBeInstanceOf(NotTheListError);
      expect(events).toEqual([`get ${AT_URL}`, "sleep 1000", `get ${DMA_URL}`]);
    });

    it("waits a real second when no sleep is given: the exported connector sleeps through a timer", async () => {
      jest.useFakeTimers();
      try {
        const events: string[] = [];
        const inner = fakeFetch(filesOf());
        const fetch: ConnectorFetch = async (url, validators, limits) => {
          events.push(`get ${url}`);
          return inner(url, validators, limits);
        };

        const pending = euDgCompConnector.download(fetch, {});
        await jest.advanceTimersByTimeAsync(999);
        expect(events).toEqual([`get ${AT_URL}`]);
        await jest.advanceTimersByTimeAsync(1);
        expect(events).toEqual([`get ${AT_URL}`, `get ${DMA_URL}`]);

        expect(await pending).not.toBe("unchanged");
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("a file that is not the list", () => {
    const NOT_THE_LIST: Array<[string, string]> = [
      ["a JSON array", "[]"],
      ["an array of cases", `[${JSON.stringify(baseAt(3)[0][1])}]`],
      ["a JSON string", '"AT.90000"'],
      ["a number", "42"],
      ["null", "null"],
      ["an HTML page", "<html><body>Not found</body></html>"],
      ["an empty file", ""],
      ["an object without a case", "{}"],
      ["a file cut short", fileText(baseAt()).slice(0, 5000)],
      [
        "a file of mergers, whose keys are not case numbers of the list",
        fileText(
          Array.from({ length: 700 }, (_, i): Entry => {
            const number = `M.${1000 + i}`;
            return [
              number,
              { metadata: { caseNumber: [number], caseInitiationDate: ["1990-09-24"] } },
            ];
          }),
        ),
      ],
    ];

    it.each(NOT_THE_LIST)("fails %s in the place of the AT file", async (_name, body) => {
      const files = filesOf();
      files[AT_URL] = { body, contentType: "application/octet-stream" };
      const failure = await failureOf(connector.download(fakeFetch(files), {}));
      expect(failure).toBeInstanceOf(NotTheListError);
      expect((failure as Error).message).toBe("The file is not the list.");
    });

    it.each(NOT_THE_LIST)("fails %s in the place of the DMA file", async (_name, body) => {
      const files = filesOf();
      files[DMA_URL] = { body, contentType: "application/octet-stream" };
      expect(await failureOf(connector.download(fakeFetch(files), {}))).toBeInstanceOf(
        NotTheListError,
      );
    });

    it("fails the DMA file in the place of the AT file, and the AT file in the place of the DMA file", async () => {
      const dmaFirst = filesOf(baseDma(), baseAt());
      expect(await failureOf(connector.download(fakeFetch(dmaFirst), {}))).toBeInstanceOf(
        NotTheListError,
      );
    });
  });

  describe("where the answers come from", () => {
    const REFUSED: Array<[string, string]> = [
      ["another host", "https://evil.example.net/case-data-AT.json"],
      ["a host that only starts like the bucket", `${BUCKET}.attacker.net/case-data-AT.json`],
      [
        "plain http",
        "http://compcases-open-data-portal-files-prod.s3.eu-west-1.amazonaws.com/case-data-AT.json",
      ],
      ["another port", `${BUCKET}:8443/case-data-AT.json`],
      [
        "a user name",
        "https://user:secret@compcases-open-data-portal-files-prod.s3.eu-west-1.amazonaws.com/case-data-AT.json",
      ],
      ["the merger file of the same bucket", `${BUCKET}/case-data-M.json`],
      ["the state aid file of the same bucket", `${BUCKET}/case-data-SA.json`],
      ["a redirect to the other file of the list", DMA_URL],
      ["a directory of the bucket", `${BUCKET}/other/case-data-AT.json`],
      ["a path that climbs to the merger file", `${BUCKET}/x/../case-data-M.json`],
    ];

    it.each(REFUSED)(
      "refuses the answer to the AT request that came from %s, naming no address",
      async (_name, from) => {
        const files = filesOf();
        files[AT_URL] = { ...files[AT_URL], url: from };

        const failure = await failureOf(connector.download(fakeFetch(files), {}));

        expect(failure).toBeInstanceOf(FetchError);
        expect((failure as FetchError).reason).toBe("not_allowed");
        const message = (failure as FetchError).message;
        for (const part of ["evil", "attacker", "secret", "compcases", "https", "case-data"]) {
          expect(message).not.toContain(part);
        }
      },
    );

    it("refuses the answer to the DMA request when it came from the AT file or the merger file", async () => {
      for (const from of [
        AT_URL,
        `${BUCKET}/case-data-M.json`,
        "https://evil.example.net/x.json",
      ]) {
        const files = filesOf();
        files[DMA_URL] = { ...files[DMA_URL], url: from };
        const failure = await failureOf(connector.download(fakeFetch(files), {}));
        expect((failure as FetchError).reason).toBe("not_allowed");
      }
    });

    it("accepts an answer that came back from the same object after a redirect, with a query", async () => {
      const files = filesOf();
      files[AT_URL] = { ...files[AT_URL], url: `${AT_URL}?versionId=abc` };
      files[DMA_URL] = { ...files[DMA_URL], url: `${DMA_URL}?versionId=def` };
      expect(await connector.download(fakeFetch(files), {})).not.toBe("unchanged");
    });

    it("fails as unreachable an answer of unchanged: nothing was sent that could make one", async () => {
      for (const notModifiedUrl of [AT_URL, DMA_URL]) {
        const base = fakeFetch(filesOf());
        const fetch: ConnectorFetch = async (url, validators, limits) =>
          url === notModifiedUrl ? { notModified: true, url } : base(url, validators, limits);

        const failure = await failureOf(connector.download(fetch, {}));

        expect(failure).toBeInstanceOf(FetchError);
        expect((failure as FetchError).reason).toBe("unreachable");
      }
    });

    it("refuses an answer of unchanged from elsewhere as not allowed, before anything else", async () => {
      const fetch: ConnectorFetch = async () => ({
        notModified: true,
        url: "https://evil.example.net/case-data-AT.json",
      });
      const failure = await failureOf(connector.download(fetch, {}));
      expect((failure as FetchError).reason).toBe("not_allowed");
    });

    it("refuses an answer of unchanged from another object of the bucket as not allowed, not as unreachable", async () => {
      for (const other of [`${BUCKET}/case-data-M.json`, DMA_URL]) {
        const fetch: ConnectorFetch = async () => ({ notModified: true, url: other });
        const failure = await failureOf(connector.download(fetch, {}));
        expect(failure).toBeInstanceOf(FetchError);
        expect((failure as FetchError).reason).toBe("not_allowed");
      }
    });

    it("fails as too large an answer that was cut, whichever object of the bucket it came from", async () => {
      // The merger file is 42 MB: a redirect to it is cut at the limit of the file that was asked.
      const fetch: ConnectorFetch = async () => ({
        notModified: false,
        url: `${BUCKET}/case-data-M.json`,
        status: 200,
        contentType: "application/octet-stream",
        body: Buffer.from("{}"),
        truncated: true,
        etag: null,
        lastModified: null,
      });
      expect(await failureOf(connector.download(fetch, {}))).toBeInstanceOf(BodyTooLargeError);
    });

    it("refuses an answer whose address is no address, naming none", async () => {
      const fetch: ConnectorFetch = async () => ({
        notModified: false,
        url: "not an address",
        status: 200,
        contentType: "application/octet-stream",
        body: Buffer.from(fileText(baseAt())),
        truncated: false,
        etag: null,
        lastModified: null,
      });
      const failure = await failureOf(connector.download(fetch, {}));
      expect((failure as FetchError).reason).toBe("not_allowed");
      expect((failure as FetchError).message).not.toContain("not an address");
    });
  });

  describe("the number of cases of a file", () => {
    /** A case that holds the least that the reader needs: its number and the day it was opened. */
    const minimal = (number: string, day: string): Entry => [
      number,
      { metadata: { caseNumber: [number], caseInitiationDate: [day] } },
    ];
    const minimalAt = (count: number): Entry[] =>
      Array.from({ length: count }, (_, i) =>
        minimal(`AT.${100000 + i}`, i === 0 ? "1977-05-04" : "2015-05-05"),
      );
    const minimalDma = (count: number): Entry[] =>
      Array.from({ length: count }, (_, i) =>
        minimal(`DMA.${900000 + i}`, i === 0 ? "2022-10-26" : "2024-05-05"),
      );

    it("takes 5,000 cases in a file", async () => {
      expect(await downloadOf(filesOf(minimalAt(5000), baseDma()))).toBeDefined();
      expect(await downloadOf(filesOf(baseAt(), minimalDma(5000)))).toBeDefined();
    });

    it("fails a file of one case more as too large, and never gives a shorter list", async () => {
      expect(
        await failureOf(connector.download(fakeFetch(filesOf(minimalAt(5001))), {})),
      ).toBeInstanceOf(BodyTooLargeError);
      expect(
        await failureOf(connector.download(fakeFetch(filesOf(baseAt(), minimalDma(5001))), {})),
      ).toBeInstanceOf(BodyTooLargeError);
    });
  });

  describe("the floors that make a file the list", () => {
    /** The first case of the base AT file, opened on another day. */
    const atOpenedOn = (day: string): Entry[] => {
      const at = baseAt();
      at[0] = atCase({
        number: "AT.90000",
        cartel: "Cartel",
        companies: [orgName(0)],
        initiation: day,
      });
      return at;
    };
    const dmaOpenedOn = (day: string): Entry[] => {
      const dma = baseDma();
      dma[0] = dmaCase({ number: "DMA.900000", companies: [gatekeeper(0)], initiation: day });
      return dma;
    };

    it("takes an AT file of 600 readable cases and refuses one of 599", async () => {
      expect(await downloadOf(filesOf(baseAt(600)))).toBeDefined();
      expect(
        await failureOf(connector.download(fakeFetch(filesOf(baseAt(599))), {})),
      ).toBeInstanceOf(NotTheListError);
    });

    it("counts the cases that can be read only: 599 and five that cannot are not 600", async () => {
      const unreadable: Entry[] = Array.from({ length: 5 }, (_, i) => [
        `AT.9999${i}`,
        { metadata: { caseNumber: ["AT.00000"] } },
      ]);
      expect(
        await failureOf(
          connector.download(fakeFetch(filesOf([...baseAt(599), ...unreadable])), {}),
        ),
      ).toBeInstanceOf(NotTheListError);
    });

    it("takes a DMA file of 40 cases and refuses one of 39", async () => {
      expect(await downloadOf(filesOf(baseAt(), baseDma(40)))).toBeDefined();
      expect(
        await failureOf(connector.download(fakeFetch(filesOf(baseAt(), baseDma(39))), {})),
      ).toBeInstanceOf(NotTheListError);
    });

    it("takes an AT file whose first case was opened by 1980-12-31 and refuses 1981-01-01", async () => {
      expect(await downloadOf(filesOf(atOpenedOn("1980-12-31")))).toBeDefined();
      expect(
        await failureOf(connector.download(fakeFetch(filesOf(atOpenedOn("1981-01-01"))), {})),
      ).toBeInstanceOf(NotTheListError);
    });

    it("takes a DMA file whose first case was opened by 2022-12-31 and refuses 2023-01-01", async () => {
      expect(await downloadOf(filesOf(baseAt(), dmaOpenedOn("2022-12-31")))).toBeDefined();
      expect(
        await failureOf(
          connector.download(fakeFetch(filesOf(baseAt(), dmaOpenedOn("2023-01-01"))), {}),
        ),
      ).toBeInstanceOf(NotTheListError);
    });

    it("refuses a file in which no case says when it was opened", async () => {
      const at = baseAt().map(([key, value]): Entry => {
        const metadata = { ...(value.metadata as Json), caseInitiationDate: [] };
        return [key, { ...value, metadata }];
      });
      expect(await failureOf(connector.download(fakeFetch(filesOf(at)), {}))).toBeInstanceOf(
        NotTheListError,
      );
    });
  });

  describe("the shape of a case", () => {
    /** An AT file with one more entry. */
    const withEntry = (...entries: RawEntry[]): Record<string, FakeFile> =>
      filesOf([...baseAt(), ...entries]);
    /** A case whose key is its number, which says what the key is. */
    const keyed = (key: string): RawEntry => [
      key,
      caseOf({ number: key, companies: ["Leakco Ltd"] }, "AT"),
    ];

    const UNREADABLE: Array<[string, RawEntry]> = [
      [
        "a case whose key is not its case number",
        ["AT.99998", caseOf({ number: "AT.99999", companies: ["Leakco Ltd"] }, "AT")],
      ],
      ["a key of three digits", keyed("AT.123")],
      ["a key of seven digits", keyed("AT.1234567")],
      ["a key with a letter among its digits", keyed("AT.12a456")],
      ["a key that is not an AT number", keyed("X.123456")],
      ["a key in lower case", keyed("at.123456")],
      ["a key with a blank after it", keyed("AT.123456 ")],
      ["the key of a DMA case in the AT file", keyed("DMA.900500")],
      ["the key __proto__", keyed("__proto__")],
      ["the key constructor", keyed("constructor")],
      ["the key toString", keyed("toString")],
      ["a case that is a string", ["AT.99990", "a string"]],
      ["a case that is null", ["AT.99991", null]],
      ["a case that is an array", ["AT.99992", []]],
      ["a case that is a number", ["AT.99993", 5]],
      ["a case without metadata", ["AT.99994", { decisions: [] }]],
      ["a case whose metadata is a string", ["AT.99995", { metadata: "x" }]],
      ["a case whose metadata is an array", ["AT.99996", { metadata: [] }]],
      [
        "a case whose number is a string and not an array",
        ["AT.99997", { metadata: { caseNumber: "AT.99997" } }],
      ],
      ["a case whose number is an empty array", ["AT.99998", { metadata: { caseNumber: [] } }]],
      ["a case whose number is not text", ["AT.99999", { metadata: { caseNumber: [39999] } }]],
      [
        "a case whose companies are a string and not an array",
        ["AT.99989", { metadata: { caseNumber: ["AT.99989"], caseCompanies: "Leakco Ltd" } }],
      ],
      [
        "a case whose decisions are a string and not an array",
        [
          "AT.99988",
          {
            metadata: { caseNumber: ["AT.99988"], caseCompanies: ["Leakco Ltd"] },
            decisions: "x",
          },
        ],
      ],
      [
        "a case that names a company that is no text",
        ["AT.99987", { metadata: { caseNumber: ["AT.99987"], caseCompanies: ["Leakco Ltd", 5] } }],
      ],
      [
        "a case with a decision that is a string",
        [
          "AT.99986",
          {
            metadata: { caseNumber: ["AT.99986"], caseCompanies: ["Leakco Ltd"] },
            decisions: ["x"],
          },
        ],
      ],
      [
        "a case with a decision that has no metadata",
        [
          "AT.99985",
          {
            metadata: { caseNumber: ["AT.99985"], caseCompanies: ["Leakco Ltd"] },
            decisions: [{ decisionAttachments: [] }],
          },
        ],
      ],
      [
        "a case whose opening day is a string and not an array",
        [
          "AT.99984",
          {
            metadata: {
              caseNumber: ["AT.99984"],
              caseCompanies: ["Leakco Ltd"],
              caseInitiationDate: "2010-03-12",
            },
          },
        ],
      ],
      [
        "a case whose title is a string and not an array",
        [
          "AT.99983",
          {
            metadata: {
              caseNumber: ["AT.99983"],
              caseCompanies: ["Leakco Ltd"],
              caseTitle: "Leakco title",
            },
          },
        ],
      ],
    ];

    it.each(UNREADABLE)("counts %s as unreadable and reads nothing of it", async (_name, entry) => {
      const snapshot = await downloadOf(withEntry(entry));

      expect(bodyOf(snapshot).unreadable).toBe(1);
      expect(snapshot.bodies[0]).not.toContain("Leakco");
      // A key that names a property of every object sets nothing: no prototype was touched.
      expect(Object.prototype.hasOwnProperty.call(Object.prototype, "metadata")).toBe(false);
      expect(({} as Record<string, unknown>).metadata).toBeUndefined();
      const parsed = connector.parse(snapshot);
      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(1);
    });

    it("allows a few unreadable cases and fails the sync for more: ten, or a hundredth of the rows", async () => {
      const bad = (i: number): RawEntry => [
        `AT.${99000 + i}`,
        { metadata: { caseNumber: ["AT.00000"] } },
      ];
      const rows = bodyOf(await downloadOf(filesOf())).rows.length;
      // The allowance of this list: 773 undertakings and 11 cases that cannot be read allow ten.
      expect(unreadableAllowed(rows + 11)).toBe(10);

      for (const count of [0, 1, 10, 11, 30]) {
        const extra = Array.from({ length: count }, (_, i) => bad(i));
        const snapshot = await downloadOf(filesOf([...baseAt(), ...extra]));
        const parsed = connector.parse(snapshot);
        const refused = count > unreadableAllowed(rows + count);

        expect(bodyOf(snapshot).unreadable).toBe(count);
        expect(parsed.errors).toBe(refused ? count : 0);
        expect(parsed.skipped).toBe(refused ? 0 : count);
        // The readable cases give their records whatever happens to the others.
        expect(parsed.records).toHaveLength(rows);
        expect(parsed.root).toBe("case-data");
      }
    });

    it("takes a case of 60 companies and counts a case of 61 as unreadable", async () => {
      const crowd = (count: number): string[] =>
        Array.from({ length: count }, (_, i) => `Crowdco${letters(i)} Ltd`);

      const sixty = await downloadOf(
        withEntry(atCase({ number: "AT.99500", cartel: "Cartel", companies: crowd(60) })),
      );
      expect(bodyOf(sixty).unreadable).toBe(0);
      expect(rowOf(sixty, "crowdcoaaa")).toBeDefined();
      expect(rowOf(sixty, `crowdco${letters(59)}`)).toBeDefined();

      const sixtyOne = await downloadOf(
        withEntry(atCase({ number: "AT.99500", cartel: "Cartel", companies: crowd(61) })),
      );
      expect(bodyOf(sixtyOne).unreadable).toBe(1);
      expect(rowOf(sixtyOne, "crowdcoaaa")).toBeUndefined();
    });

    it("takes a case of 30 decisions and counts a case of 31 as unreadable", async () => {
      const decisions = (count: number): DecisionSpec[] =>
        Array.from({ length: count }, (_, i) => ({
          day: `2012-01-${String(1 + (i % 28)).padStart(2, "0")}`,
          type: `Type ${i}`,
        }));

      const thirty = await downloadOf(
        withEntry(
          atCase({
            number: "AT.99501",
            companies: ["Manydecisions Ltd"],
            decisions: decisions(30),
          }),
        ),
      );
      expect(bodyOf(thirty).unreadable).toBe(0);
      expect(rowOf(thirty, "manydecisions")?.newest[0].decisions).toBe(30);

      const thirtyOne = await downloadOf(
        withEntry(
          atCase({
            number: "AT.99501",
            companies: ["Manydecisions Ltd"],
            decisions: decisions(31),
          }),
        ),
      );
      expect(bodyOf(thirtyOne).unreadable).toBe(1);
      expect(rowOf(thirtyOne, "manydecisions")).toBeUndefined();
    });

    it.each([
      ["five digits", "DMA.10050"],
      ["seven digits", "DMA.1005000"],
      ["an AT number", "AT.100500"],
      ["a letter among the digits", "DMA.10a500"],
    ])("counts a key of the DMA file that has %s as unreadable", async (_name, key) => {
      const entry: RawEntry = [key, caseOf({ number: key, companies: ["Leakco Ltd"] }, "DMA")];

      const snapshot = await downloadOf(filesOf(baseAt(), [...baseDma(), entry]));

      expect(bodyOf(snapshot).unreadable).toBe(1);
      expect(snapshot.bodies[0]).not.toContain("Leakco");
    });

    it("reads a case that has the least: a number, no company, no day, no decision, no key of the others", async () => {
      const snapshot = await downloadOf(
        withEntry(["AT.99502", { metadata: { caseNumber: ["AT.99502"] } }]),
      );
      expect(bodyOf(snapshot).unreadable).toBe(0);
    });
  });

  describe("the values of a case", () => {
    it("reads the label of a JSON text, and no label from a placeholder or from text that is not a label", async () => {
      const PLACEHOLDERS: Array<[string, unknown[]]> = [
        ["the empty object", ["{}"]],
        ["the empty items", ['{"items":[{}]}']],
        ["text that is not JSON", ["not json at all"]],
        ["a label that is not text", ['{"code":"X","label":5}']],
        ["a JSON array", ["[1,2]"]],
        ["a JSON string", ['"just text"']],
        ["a value that is no text", [5]],
        ["an empty array", []],
      ];
      const cases = PLACEHOLDERS.map(([, raw], i) =>
        atCase({
          number: `AT.9910${i}`,
          cartel: "Cartel",
          companies: [`Placeholder${letters(i)} Ltd`],
          legalRaw: raw as string[],
          decisions: [{ day: "2011-02-03", typeRaw: raw as string[] }],
        }),
      );

      const snapshot = await downloadOf(filesOf([...baseAt(), ...cases]));

      expect(bodyOf(snapshot).unreadable).toBe(0);
      PLACEHOLDERS.forEach((_, i) => {
        const row = rowOf(snapshot, `placeholder${letters(i)}`);
        expect(row?.newest[0].legalBasis).toBe("");
        expect(row?.newest[0].latest).toEqual({ day: "2011-02-03", type: "" });
      });
    });

    it("takes the label of the first value, and what is cut at 60 characters says so", async () => {
      const long = "Art. 101 TFEU and a very long legal basis that goes on and on and on forever";
      const snapshot = await downloadOf(
        filesOf([
          ...baseAt(),
          atCase({
            number: "AT.99110",
            cartel: "Cartel",
            companies: ["Labelco Ltd"],
            legalRaw: [
              jsonText({ code: "A", label: "Art. 102 TFEU", other: 1 }),
              jsonText({ code: "B", label: "Second label" }),
            ],
            decisions: [{ day: "2011-02-03", type: long }],
          }),
        ]),
      );
      const row = rowOf(snapshot, "labelco");
      expect(row?.newest[0].legalBasis).toBe("Art. 102 TFEU");
      expect(row?.newest[0].latest?.type).toHaveLength(60);
      expect(row?.newest[0].latest?.type.endsWith(" [shortened]")).toBe(true);
    });

    it("reads a day from the first ten characters and no day from anything else", async () => {
      const DAYS: Array<[string, string | null]> = [
        ["2019-03-20", "2019-03-20"],
        ["2019-03-20T10:00:00", "2019-03-20"],
        ["2019-03-20 and more", "2019-03-20"],
        ["20/03/2019", null],
        ["2019-02-30", null],
        ["0000-01-01", null],
        [" 2019-03-20", null],
        ["March 2019", null],
        ["", null],
      ];
      const cases = DAYS.map(([raw], i) =>
        atCase({
          number: `AT.9912${i}`,
          cartel: "Cartel",
          companies: [`Zayqo${letters(i)} Ltd`],
          initiation: raw,
          decisions: [{ day: raw, type: "Prohibition Decision" }],
        }),
      );

      const snapshot = await downloadOf(filesOf([...baseAt(), ...cases]));

      DAYS.forEach(([, day], i) => {
        const facts = rowOf(snapshot, `zayqo${letters(i)}`)?.newest[0];
        expect(facts?.initiation).toBe(day);
        // A decision without a day is left out of what the case shows.
        expect(facts?.decisions).toBe(day === null ? 0 : 1);
        expect(facts?.latest).toEqual(day === null ? null : { day, type: "Prohibition Decision" });
      });
    });

    it("cuts a title at 120 characters, a legal basis and a decision type at 60, and says so", async () => {
      const snapshot = await downloadOf(
        filesOf([
          ...baseAt(),
          atCase({
            number: "AT.99140",
            cartel: "Cartel",
            companies: ["Qapzo Ltd"],
            title: "T".repeat(130),
            legal: "L".repeat(70),
            decisions: [{ day: "2011-02-03", type: "Y".repeat(70) }],
          }),
        ]),
      );

      const facts = rowOf(snapshot, "qapzo")?.newest[0];

      expect(facts?.title).toBe(`${"T".repeat(108)} [shortened]`);
      expect(facts?.legalBasis).toBe(`${"L".repeat(48)} [shortened]`);
      expect(facts?.latest?.type).toBe(`${"Y".repeat(48)} [shortened]`);
    });

    it("never gives a case a company it does not name: an empty name and a name of blanks are left out", async () => {
      const snapshot = await downloadOf(
        filesOf([
          ...baseAt(),
          atCase({
            number: "AT.99130",
            cartel: "Cartel",
            companies: ["", "   ", "\u{a0}\t", "Blankco Ltd"],
          }),
        ]),
      );
      expect(rowOf(snapshot, "blankco")?.newest[0].parties).toBe(1);
    });
  });

  describe("the title of a case", () => {
    it("is kept for a cartel and for a DMA case, and never copied for any other case", async () => {
      const files = filesOf(
        [
          ...baseAt(),
          atCase({
            number: "AT.99201",
            cartel: "Cartel",
            title: "Synthetic cartel market",
            companies: ["Titleco Ltd"],
          }),
          atCase({
            number: "AT.99202",
            cartel: "Antitrust",
            title: "Synthetic complainant against Titleco",
            companies: ["Titleco Ltd"],
          }),
        ],
        [
          ...baseDma(),
          dmaCase({
            number: "DMA.900901",
            title: "Synthetic gatekeeper service",
            companies: ["Titleco Ltd"],
          }),
        ],
      );

      const snapshot = await downloadOf(files);
      const parsed = connector.parse(snapshot);

      const titles = Object.fromEntries(
        (rowOf(snapshot, "titleco")?.newest ?? []).map((facts) => [facts.case, facts.title]),
      );
      expect(titles).toEqual({
        "AT.99201": "Synthetic cartel market",
        "AT.99202": "",
        "DMA.900901": "Synthetic gatekeeper service",
      });
      const everything = JSON.stringify([snapshot.bodies, parsed.records]);
      expect(everything).not.toContain("complainant");
      expect(everything).not.toContain(LEFT_OUT.antitrustTitle);
      expect(everything).toContain("Synthetic cartel market");
      expect(everything).toContain("Synthetic gatekeeper service");
    });

    it.each([
      ["missing", null],
      ["empty", ""],
      ["in lower case", "cartel"],
      ["another word", "Cartels"],
      ["Antitrust", "Antitrust"],
    ])(
      "takes a case whose caseCartel is %s for a case that is no cartel: no title, and the rule of persons applies",
      async (_name, cartel) => {
        const snapshot = await downloadOf(
          filesOf([
            ...baseAt(),
            atCase({
              number: "AT.99301",
              cartel,
              title: "Synthetic hidden title",
              companies: ["Alvin Zephyrwick", "Cartelco Ltd"],
            }),
          ]),
        );

        expect(rowOf(snapshot, "cartelco")?.newest[0]).toMatchObject({
          kind: "antitrust",
          title: "",
        });
        expect(rowOf(snapshot, "alvinzephyrwick")).toBeUndefined();
        expect(snapshot.bodies[0]).not.toContain("Zephyrwick");
        expect(snapshot.bodies[0]).not.toContain("Synthetic hidden title");
      },
    );

    it("takes a DMA case for a DMA case whatever its keys say: its kind comes from its file", async () => {
      const snapshot = await downloadOf(
        filesOf(baseAt(), [
          ...baseDma(),
          dmaCase({ number: "DMA.900902", companies: ["Dmaco Ltd"], title: "Synthetic DMA title" }),
        ]),
      );
      expect(rowOf(snapshot, "dmaco")?.newest[0]).toMatchObject({
        kind: "DMA",
        title: "Synthetic DMA title",
      });
    });
  });

  describe("the natural persons among the companies", () => {
    const PERSON = "Alvin Zephyrwick";

    it("drops a name that shows no organisation in a case that is no cartel, and keeps no trace of it", async () => {
      const files = filesOf([
        ...baseAt(),
        atCase({ number: "AT.99401", companies: [PERSON, "Personco Ltd", "Mira Quillfeather"] }),
      ]);

      const snapshot = await downloadOf(files);
      const parsed = connector.parse(snapshot);

      expect(rowOf(snapshot, "alvinzephyrwick")).toBeUndefined();
      expect(rowOf(snapshot, "miraquillfeather")).toBeUndefined();
      // The case shows the parties that were kept, and the persons are not even counted.
      expect(rowOf(snapshot, "personco")?.newest[0].parties).toBe(1);
      const everything = JSON.stringify([snapshot.bodies, parsed.records]);
      for (const word of ["Zephyrwick", "Quillfeather", "alvinzephyrwick", "miraquillfeather"]) {
        expect(everything).not.toContain(word);
      }
      // A name that the rule drops is not an unreadable case.
      expect(bodyOf(snapshot).unreadable).toBe(0);
      expect(parsed.errors).toBe(0);
    });

    it("keeps the same name in a cartel case", async () => {
      const snapshot = await downloadOf(
        filesOf([
          ...baseAt(),
          atCase({ number: "AT.99402", cartel: "Cartel", companies: [PERSON, "Personco Ltd"] }),
        ]),
      );
      expect(rowOf(snapshot, "alvinzephyrwick")?.cases).toBe(1);
      expect(rowOf(snapshot, "personco")?.newest[0].parties).toBe(2);
    });

    it("keeps a name that shows none when it occurs in two cases", async () => {
      const snapshot = await downloadOf(
        filesOf([
          ...baseAt(),
          atCase({ number: "AT.99403", companies: [PERSON] }),
          atCase({ number: "AT.99404", companies: [PERSON] }),
        ]),
      );
      expect(rowOf(snapshot, "alvinzephyrwick")?.cases).toBe(2);
    });

    it("counts the cases of a name before the rule: a cartel case and another case are two", async () => {
      const snapshot = await downloadOf(
        filesOf([
          ...baseAt(),
          atCase({ number: "AT.99405", cartel: "Cartel", companies: [PERSON] }),
          atCase({ number: "AT.99406", companies: [PERSON] }),
        ]),
      );
      expect(rowOf(snapshot, "alvinzephyrwick")).toMatchObject({
        cases: 2,
        cartel: 1,
        antitrust: 1,
      });
    });

    it("counts the cases of a name over both files", async () => {
      const snapshot = await downloadOf(
        filesOf(
          [...baseAt(), atCase({ number: "AT.99407", companies: [PERSON] })],
          [...baseDma(), dmaCase({ number: "DMA.900903", companies: [PERSON] })],
        ),
      );
      expect(rowOf(snapshot, "alvinzephyrwick")).toMatchObject({ cases: 2, antitrust: 1, dma: 1 });
    });

    it("counts one name written in another case or with other blanks as the same name, and one case once", async () => {
      const twice = await downloadOf(
        filesOf([
          ...baseAt(),
          atCase({ number: "AT.99408", companies: [PERSON] }),
          atCase({ number: "AT.99409", companies: ["alvin   zephyrwick "] }),
        ]),
      );
      expect(rowOf(twice, "alvinzephyrwick")?.cases).toBe(2);

      // The same name twice in one case is one case: it is dropped.
      const once = await downloadOf(
        filesOf([
          ...baseAt(),
          atCase({ number: "AT.99410", companies: [PERSON, "alvin zephyrwick"] }),
        ]),
      );
      expect(rowOf(once, "alvinzephyrwick")).toBeUndefined();
    });

    it.each([
      ["a legal form", "Example Holding GmbH", "exampleholding"],
      ["an acronym", "ACME", "acme"],
      ["a symbol", "Widget & Co", "widget"],
      ["a digit", "Mira Quillfeather 2", "miraquillfeather2"],
      ["an organisation word", "Quillfeather Brewery", "quillfeatherbrewery"],
    ])(
      "keeps a name that shows an organisation by %s, in a case that is no cartel",
      async (_name, company, id) => {
        const snapshot = await downloadOf(
          filesOf([...baseAt(), atCase({ number: "AT.99411", companies: [company] })]),
        );
        expect(rowOf(snapshot, id)?.cases).toBe(1);
      },
    );

    it("keeps every name of a DMA case, whatever it looks like", async () => {
      const snapshot = await downloadOf(
        filesOf(baseAt(), [...baseDma(), dmaCase({ number: "DMA.900904", companies: [PERSON] })]),
      );
      expect(rowOf(snapshot, "alvinzephyrwick")).toMatchObject({ cases: 1, dma: 1 });
    });
  });

  describe("one record for each undertaking", () => {
    it("merges the spellings of one undertaking: case, legal form, blanks and a full-width form make no other", async () => {
      const snapshot = await downloadOf(
        filesOf([
          ...baseAt(),
          atCase({ number: "AT.99601", cartel: "Cartel", companies: ["Examplecorp KGaA"] }),
          atCase({ number: "AT.99602", cartel: "Cartel", companies: ["Examplecorp KgaA"] }),
          atCase({
            number: "AT.99603",
            cartel: "Cartel",
            companies: [`Spacey  Name Corporation${" ".repeat(13)}`],
          }),
          atCase({ number: "AT.99604", cartel: "Cartel", companies: ["Spacey Name Corporation"] }),
          atCase({ number: "AT.99605", cartel: "Cartel", companies: ["Spacey Name Ltd"] }),
          atCase({
            number: "AT.99606",
            cartel: "Cartel",
            companies: ["\u{ff33}\u{ff50}\u{ff41}\u{ff43}\u{ff45}\u{ff59} Name"],
          }),
        ]),
      );

      expect(rowOf(snapshot, "examplecorpkgaa")).toMatchObject({
        cases: 2,
        names: ["Examplecorp KGaA", "Examplecorp KgaA"],
      });
      // The names are cleaned: the double blank and the 13 blanks at the end are one blank and none.
      expect(rowOf(snapshot, "spaceyname")).toMatchObject({
        cases: 4,
        display: "Spacey Name Corporation",
        names: ["Spacey Name Corporation", "Spacey Name", "Spacey Name Ltd"],
      });
      expect(snapshot.bodies[0]).not.toContain("  ");
    });

    it("shows the most frequent spelling, and among equals the first in the order of the texts", async () => {
      const files = (extra: Entry[]) =>
        filesOf([
          ...baseAt(),
          atCase({ number: "AT.99611", cartel: "Cartel", companies: ["Tiebreak Corp"] }),
          atCase({ number: "AT.99612", cartel: "Cartel", companies: ["TieBreak Corp"] }),
          ...extra,
        ]);

      // One each: "TieBreak Corp" is before "Tiebreak Corp" by UTF-16 unit, which no locale decides.
      expect(rowOf(await downloadOf(files([])), "tiebreak")?.display).toBe("TieBreak Corp");
      // Two against one: the more frequent wins.
      expect(
        rowOf(
          await downloadOf(
            files([atCase({ number: "AT.99613", cartel: "Cartel", companies: ["Tiebreak Corp"] })]),
          ),
          "tiebreak",
        )?.display,
      ).toBe("Tiebreak Corp");
    });

    it("keeps at most five spellings, the most frequent first", async () => {
      const spellings = [
        "Spellco",
        "SPELLCO",
        "Spellco Ltd",
        "Spellco Inc",
        "Spellco Limited",
        "spellco",
        "Spell-co",
      ];
      const cases = [
        ...spellings.map((name, i) =>
          atCase({ number: `AT.9962${i}`, cartel: "Cartel", companies: [name] }),
        ),
        atCase({ number: "AT.99630", cartel: "Cartel", companies: ["Spell-co"] }),
        atCase({ number: "AT.99631", cartel: "Cartel", companies: ["Spell-co"] }),
        atCase({ number: "AT.99632", cartel: "Cartel", companies: ["SPELLCO"] }),
      ];

      const row = rowOf(await downloadOf(filesOf([...baseAt(), ...cases])), "spellco");

      expect(row?.cases).toBe(10);
      expect(row?.names).toHaveLength(5);
      expect(row?.names.slice(0, 2)).toEqual(["Spell-co", "SPELLCO"]);
      expect(row?.display).toBe("Spell-co");
    });

    it("makes one record of an undertaking that both files name, with the cases of both", async () => {
      const snapshot = await downloadOf(
        filesOf(
          [
            ...baseAt(),
            atCase({ number: "AT.99701", cartel: "Cartel", companies: ["Bridgeworks Ltd"] }),
          ],
          [...baseDma(), dmaCase({ number: "DMA.900801", companies: ["Bridgeworks Ltd"] })],
        ),
      );

      const rows = bodyOf(snapshot).rows.filter((row) => row.id === "bridgeworks");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ cases: 2, cartel: 1, antitrust: 0, dma: 1 });
      expect(rows[0].caseNumbers).toHaveLength(2);
    });

    it("leaves a company whose name is longer than 120 characters out of its case: no id, no key, no record, and the other undertakings stay", async () => {
      const long = `Longname${"b".repeat(150)}`;
      const snapshot = await downloadOf(
        filesOf([
          ...baseAt(),
          atCase({
            number: "AT.99141",
            cartel: "Cartel",
            companies: ["Keepone Ltd", long, "Keeptwo Ltd"],
          }),
        ]),
      );

      const body = bodyOf(snapshot);
      expect(body.rows.some((entry) => entry.id.startsWith("longname"))).toBe(false);
      // Not unreadable either: the case is read, and the name is no undertaking (as a name that is too short).
      expect(body.unreadable).toBe(0);
      // Nothing of it is in the body, whole or cut: no spelling, no key, no id.
      expect(snapshot.bodies[0].toLowerCase()).not.toContain("longname");
      expect(snapshot.bodies[0]).not.toContain("shortened");
      // The other undertakings of the case stay, and the case names two parties, not three.
      for (const id of ["keepone", "keeptwo"]) {
        expect(rowOf(snapshot, id)?.newest[0]).toMatchObject({ case: "AT.99141", parties: 2 });
      }
      const parsed = connector.parse(snapshot);
      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(0);
      expect(JSON.stringify(parsed.records).toLowerCase()).not.toContain("longname");
    });

    it("gives no record, and no merged record, to two names of 160 characters that share a stem of 140", async () => {
      // Cut at 120, the two names were one id (the same 108 characters and `shortened`).
      const stem = `Stemcorp${"s".repeat(132)}`;
      const first = `${stem} North Group Limited`;
      const second = `${stem} South Plant Company`;
      expect([stem.length, first.length, second.length]).toEqual([140, 160, 160]);

      const snapshot = await downloadOf(
        filesOf([
          ...baseAt(),
          atCase({ number: "AT.99151", cartel: "Cartel", companies: [first] }),
          atCase({ number: "AT.99152", cartel: "Cartel", companies: [second, "Keepthree Ltd"] }),
        ]),
      );

      expect(bodyOf(snapshot).rows.filter((entry) => entry.id.startsWith("stemcorp"))).toEqual([]);
      expect(snapshot.bodies[0].toLowerCase()).not.toContain("stemcorp");
      expect(rowOf(snapshot, "keepthree")).toMatchObject({ cases: 1 });
      const records = connector.parse(snapshot).records;
      expect(records.filter((record) => record.sourceRecordId.startsWith("stemcorp"))).toEqual([]);
      expect(JSON.stringify(records).toLowerCase()).not.toContain("stemcorp");
    });

    /**
     * A name of `length` units with `middle` at the unit `at` (a blank, or the two units of a pair of
     * surrogates). A cut of a text of more than 121 units at 109 loses the blank, or backs off from the
     * half of a pair that it would split, and leaves the cut line at 120 units or fewer, ending in the
     * marker: a check that reads `lineOf(name, 121)` and compares the length with 120 takes it for a
     * name that fits.
     */
    const cutShape = (prefix: string, at: number, middle: string, length: number): string => {
      const head = `${prefix}${"x".repeat(at - prefix.length)}`;
      return `${head}${middle}${"y".repeat(length - head.length - middle.length)}`;
    };
    const PAIR = String.fromCodePoint(0x1f600);
    const AT_THE_CUT = [107, 108, 109, 110, 111, 112];

    it.each([
      ["a blank", " "],
      ["half of a pair of surrogates", PAIR],
    ])(
      "leaves out a name of 139 characters whatever falls where a cut would be: %s there must not bring it under the limit",
      async (_what, middle) => {
        const names = AT_THE_CUT.map((at) => cutShape("Cutname", at, middle, 139));
        expect(names.every((name) => name.length === 139)).toBe(true);

        const snapshot = await downloadOf(
          filesOf([
            ...baseAt(),
            ...names.map((name, i) =>
              atCase({
                number: `AT.${99170 + i}`,
                cartel: "Cartel",
                companies: [name, `Keepcut${letters(i)} Ltd`],
              }),
            ),
          ]),
        );

        expect(bodyOf(snapshot).rows.some((entry) => entry.id.startsWith("cutname"))).toBe(false);
        expect(snapshot.bodies[0].toLowerCase()).not.toContain("cutname");
        expect(snapshot.bodies[0]).not.toContain("shortened");
        for (const [i] of names.entries()) {
          expect(rowOf(snapshot, `keepcut${letters(i)}`)?.newest[0]).toMatchObject({ parties: 1 });
        }
        expect(connector.parse(snapshot).errors).toBe(0);
      },
    );

    it.each([
      ["a blank", " "],
      ["half of a pair of surrogates", PAIR],
    ])(
      "keeps a name of 120 characters whatever falls where a cut would be, and leaves out one of 121: %s",
      async (_what, middle) => {
        const fits = AT_THE_CUT.map((at) => cutShape("Fitname", at, middle, 120));
        const over = AT_THE_CUT.map((at) => cutShape("Overname", at, middle, 121));

        const snapshot = await downloadOf(
          filesOf([
            ...baseAt(),
            atCase({ number: "AT.99181", cartel: "Cartel", companies: [...fits, ...over] }),
          ]),
        );

        const rows = bodyOf(snapshot).rows;
        const fitRows = rows.filter((entry) => entry.id.startsWith("fitname"));
        expect(fitRows).toHaveLength(AT_THE_CUT.length);
        expect(snapshot.bodies[0]).not.toContain("Overname");
        // What is shown of a name over 100 characters is cut, by design; nothing else is: the spelling
        // of a name that fits is whole, and no id and no key of any record ends in the marker.
        for (const entry of fitRows) {
          expect(entry.names.map((name) => name.length)).toEqual([120]);
          expect(entry.names[0].startsWith("Fitname")).toBe(true);
        }
        expect(rows.some((entry) => entry.id.endsWith("shortened"))).toBe(false);
        const records = connector.parse(snapshot).records;
        expect(
          records.filter((record) => record.sourceRecordId.startsWith("fitname")),
        ).toHaveLength(AT_THE_CUT.length);
        for (const record of records) {
          expect(record.sourceRecordId.endsWith("shortened")).toBe(false);
          expect(record.matchKeys.some((key) => key.endsWith("shortened"))).toBe(false);
        }
      },
    );

    it.each([
      ["blanks", " "],
      ["characters that nobody sees", String.fromCharCode(0x200b)],
    ])(
      "leaves out a company whose cell is longer than the kit reads, however little of it shows: %s",
      async (_what, filler) => {
        // The kit reads a cell to LINE_INPUT_MAX units and marks the line as cut, even when what is left
        // of it is short: that text is a cut one, so it is no name and never an id.
        const huge = `Hugecell${filler.repeat(LINE_INPUT_MAX + 10)} Ltd`;
        const snapshot = await downloadOf(
          filesOf([
            ...baseAt(),
            atCase({ number: "AT.99191", cartel: "Cartel", companies: [huge, "Keepfour Ltd"] }),
          ]),
        );

        // Booleans, so that a failure never prints a body of megabytes.
        const body = snapshot.bodies[0];
        expect(bodyOf(snapshot).rows.some((entry) => entry.id.startsWith("hugecell"))).toBe(false);
        expect(body.toLowerCase().includes("hugecell")).toBe(false);
        expect(body.includes("shortened")).toBe(false);
        expect(rowOf(snapshot, "keepfour")?.newest[0]).toMatchObject({ parties: 1 });
        const parsed = connector.parse(snapshot);
        expect(parsed.errors).toBe(0);
        expect(parsed.skipped).toBe(0);
        expect(parsed.records.some((record) => record.sourceRecordId.endsWith("shortened"))).toBe(
          false,
        );
      },
    );

    it("measures a name once folded: 120 characters are an undertaking, 121 are not", async () => {
      const edge = (length: number): string => `Edgeco${"x".repeat(length - 6)}`;
      const snapshot = await downloadOf(
        filesOf([
          ...baseAt(),
          atCase({
            number: "AT.99161",
            cartel: "Cartel",
            companies: [
              edge(120),
              // 149 characters that fold to 120: the run of blanks is one.
              `Foldco${" ".repeat(30)}${"y".repeat(113)}`,
              edge(121).replace("Edgeco", "Overco"),
              `Foldover${" ".repeat(30)}${"z".repeat(113)}`,
            ],
          }),
        ]),
      );

      expect(rowOf(snapshot, edge(120).toLowerCase())).toBeDefined();
      expect(rowOf(snapshot, `foldco${"y".repeat(113)}`)).toBeDefined();
      expect(rowOf(snapshot, edge(121).replace("Edgeco", "Overco").toLowerCase())).toBeUndefined();
      expect(rowOf(snapshot, `foldover${"z".repeat(113)}`)).toBeUndefined();
      expect(snapshot.bodies[0].toLowerCase()).not.toContain("overco");
      expect(snapshot.bodies[0].toLowerCase()).not.toContain("foldover");
    });

    it("gives no record to an undertaking whose compact name has fewer than four characters", async () => {
      const snapshot = await downloadOf(
        filesOf([
          ...baseAt(),
          atCase({
            number: "AT.99801",
            cartel: "Cartel",
            companies: ["Qux Inc", "Ab Ltd", "!!! ???", "Zeta Inc", "X"],
          }),
        ]),
      );
      const parsed = connector.parse(snapshot);

      expect(rowOf(snapshot, "zeta")).toBeDefined();
      for (const id of ["qux", "ab", "x", ""]) expect(rowOf(snapshot, id)).toBeUndefined();
      // The short names are parties of the case, but they are neither unreadable nor undertakings;
      // a text that holds no letter and no digit names nobody.
      expect(rowOf(snapshot, "zeta")?.newest[0].parties).toBe(4);
      expect(bodyOf(snapshot).unreadable).toBe(0);
      expect(parsed.errors).toBe(0);
      expect(parsed.records.every((record) => record.matchKeys.length > 0)).toBe(true);
    });

    it("counts a case once for each undertaking it names, and once for an undertaking it names twice", async () => {
      const snapshot = await downloadOf(
        filesOf([
          ...baseAt(),
          atCase({
            number: "AT.99901",
            cartel: "Cartel",
            companies: ["Alphaworks Ltd", "Betaworks Ltd", "Alphaworks Limited", "Gammaworks Ltd"],
          }),
        ]),
      );

      expect(rowOf(snapshot, "alphaworks")).toMatchObject({ cases: 1, cartel: 1 });
      expect(rowOf(snapshot, "betaworks")).toMatchObject({ cases: 1 });
      // Three undertakings are the parties of the case.
      expect(rowOf(snapshot, "gammaworks")?.newest[0].parties).toBe(3);
    });

    it("shows the counts, the years, the newest three cases and the day of the newest activity", async () => {
      const files = dynamicsFiles();

      const row = rowOf(await downloadOf(files), "syntheticdynamics");

      expect(row).toEqual({
        id: "syntheticdynamics",
        display: "Synthetic Dynamics Ltd",
        names: ["Synthetic Dynamics Ltd"],
        cases: 3,
        cartel: 1,
        antitrust: 1,
        dma: 1,
        firstYear: 2004,
        lastYear: 2023,
        caseNumbers: ["DMA.900901", "AT.99002", "AT.99001"],
        newest: [
          {
            case: "DMA.900901",
            kind: "DMA",
            title: "Synthetic DMA title",
            legalBasis: "Art. 3(4) DMA",
            parties: 1,
            decisions: 1,
            latest: { day: "2023-09-05", type: "Designation decision" },
            initiation: "2023-03-01",
          },
          {
            case: "AT.99002",
            kind: "antitrust",
            title: "",
            legalBasis: "Art. 102 TFEU",
            parties: 2,
            decisions: 0,
            latest: null,
            initiation: "2010-01-15",
          },
          {
            case: "AT.99001",
            kind: "cartel",
            title: "Synthetic cartel title",
            legalBasis: "Art. 101 TFEU",
            parties: 5,
            decisions: 2,
            latest: { day: "2005-09-01", type: "Decision imposing fines" },
            initiation: "2004-03-10",
          },
        ],
        publishedAt: "2023-09-05",
      });
    });

    it("lists the newest three cases and the newest ten numbers of an undertaking of sixteen cases", async () => {
      const cases = Array.from({ length: 16 }, (_, i) =>
        atCase({
          number: `AT.${99400 + i}`,
          cartel: "Cartel",
          companies: ["Manycases Ltd"],
          initiation: `${2001 + i}-01-01`,
        }),
      );

      const row = rowOf(await downloadOf(filesOf([...baseAt(), ...cases])), "manycases");

      expect(row?.cases).toBe(16);
      expect(row?.firstYear).toBe(2001);
      expect(row?.lastYear).toBe(2016);
      expect(row?.publishedAt).toBe("2016-01-01");
      expect(row?.newest.map((facts) => facts.case)).toEqual(["AT.99415", "AT.99414", "AT.99413"]);
      expect(row?.caseNumbers).toEqual(Array.from({ length: 10 }, (_, i) => `AT.${99415 - i}`));
    });

    it("orders the cases of one day by case number, the greater first, and a case without a day last", async () => {
      const cases = [
        atCase({
          number: "AT.99501",
          cartel: "Cartel",
          companies: ["Sameday Ltd"],
          initiation: "2015-05-05",
        }),
        atCase({
          number: "AT.99502",
          cartel: "Cartel",
          companies: ["Sameday Ltd"],
          initiation: "2015-05-05",
        }),
        atCase({
          number: "AT.99503",
          cartel: "Cartel",
          companies: ["Sameday Ltd"],
          initiation: null,
        }),
        atCase({
          number: "AT.99499",
          cartel: "Cartel",
          companies: ["Sameday Ltd"],
          initiation: "2001-01-01",
        }),
      ];

      const row = rowOf(await downloadOf(filesOf([...baseAt(), ...cases])), "sameday");

      expect(row?.caseNumbers).toEqual(["AT.99502", "AT.99501", "AT.99499", "AT.99503"]);
    });

    it("dates a case by its latest decision, and by its opening when it has none; among decisions of one day the greater type counts", async () => {
      const cases = [
        atCase({
          number: "AT.99511",
          cartel: "Cartel",
          companies: ["Datedby Ltd"],
          initiation: "2002-02-02",
          decisions: [
            { day: "2008-08-08", type: "Beta decision" },
            { day: "2008-08-08", type: "Alpha decision" },
            { day: "2006-06-06", type: "Zeta decision" },
          ],
        }),
        atCase({
          number: "AT.99512",
          cartel: "Cartel",
          companies: ["Datedby Ltd"],
          initiation: "2007-07-07",
        }),
      ];

      const row = rowOf(await downloadOf(filesOf([...baseAt(), ...cases])), "datedby");

      // 2008-08-08 is later than 2007-07-07.
      expect(row?.caseNumbers).toEqual(["AT.99511", "AT.99512"]);
      expect(row?.newest[0].latest).toEqual({ day: "2008-08-08", type: "Beta decision" });
      expect(row?.newest[0].decisions).toBe(3);
      expect(row?.publishedAt).toBe("2008-08-08");
      // The years are those of the openings.
      expect(row?.firstYear).toBe(2002);
      expect(row?.lastYear).toBe(2007);
    });

    it("gives an undertaking none of the years when none of its cases says when it was opened", async () => {
      const row = rowOf(
        await downloadOf(
          filesOf([
            ...baseAt(),
            atCase({
              number: "AT.99521",
              cartel: "Cartel",
              companies: ["Undated Ltd"],
              initiation: null,
            }),
          ]),
        ),
        "undated",
      );
      expect(row).toMatchObject({ firstYear: null, lastYear: null, publishedAt: null });
    });
  });

  describe("what the body counts", () => {
    it("counts the undertakings when they outnumber the cases: the kit refuses a total below the rows and the cases it could not read", async () => {
      const body = bodyOf(await downloadOf(filesOf()));

      // 685 cases name 773 undertakings.
      expect(body.rows).toHaveLength(773);
      expect(body.unreadable).toBe(0);
      expect(body.total).toBe(773);
      expect(body.total).toBeGreaterThanOrEqual(body.rows.length + body.unreadable);
    });

    it("counts the cases when they outnumber the undertakings, those that could not be read included", async () => {
      const at = Array.from({ length: 640 }, (_, i) =>
        atCase({ number: `AT.${90000 + i}`, initiation: i === 0 ? "1977-05-04" : "2010-03-12" }),
      );
      const bad: RawEntry = ["AT.99990", "a string"];

      const body = bodyOf(await downloadOf(filesOf([...at, bad], baseDma())));

      // 640 cases without a company, one that cannot be read and 45 DMA cases of five gatekeepers.
      expect(body.rows).toHaveLength(5);
      expect(body.unreadable).toBe(1);
      expect(body.total).toBe(686);
    });
  });

  describe("the record of an undertaking", () => {
    it("is made with these exact values: type, title, summary, address, keys, identifiers and day", async () => {
      const records = await recordsOf(dynamicsFiles());

      const record = recordOfId(records, "syntheticdynamics");

      expect(record).toEqual({
        sourceRecordId: "syntheticdynamics",
        recordType: "eu_competition_cases",
        title: "European Commission competition cases: Synthetic Dynamics Ltd",
        summary:
          `${HOST_SENTENCE} Undertaking: Synthetic Dynamics Ltd. The European Commission's open ` +
          "case data for antitrust, cartel and Digital Markets Act cases names it as a party in " +
          "3 cases (1 cartel, 1 antitrust, 1 DMA), opened from 2004 to 2023. " +
          'Newest: DMA.900901 (DMA, "Synthetic DMA title"; Art. 3(4) DMA; 1 party; latest decision ' +
          '"Designation decision" adopted 2023-09-05); AT.99002 (antitrust; Art. 102 TFEU; ' +
          "2 parties; no decision recorded, opened 2010-01-15); AT.99001 (cartel, " +
          '"Synthetic cartel title"; Art. 101 TFEU; 5 parties; latest decision "Decision imposing ' +
          `fines" adopted 2005-09-01). ${CLOSING}`,
        url: `${DOCUMENTATION_URL}?undertaking=syntheticdynamics`,
        identifiers: {
          undertaking: "Synthetic Dynamics Ltd",
          cases: ["DMA.900901", "AT.99002", "AT.99001"],
        },
        matchKeys: ["name:syntheticdynamicsltd", "name:syntheticdynamics"],
        publishedAt: "2023-09-05",
        sourceUpdatedAt: null,
      });
    });

    it("gives one record for each undertaking, in the order of the body, and no other", async () => {
      const snapshot = await downloadOf(filesOf());

      const parsed = connector.parse(snapshot);

      expect(parsed.records.map((record) => record.sourceRecordId)).toEqual(
        bodyOf(snapshot).rows.map((row) => row.id),
      );
      expect(parsed.records).toHaveLength(773);
      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(0);
      expect(parsed.root).toBe("case-data");
      expect(parsed.sourceVersion).toBeNull();
    });

    it("is well formed for every undertaking of the files", async () => {
      expectWellFormedRecords(await recordsOf(dynamicsFiles()), {
        sourceId: "eu_dg_comp",
        mark: EU_DG_COMP_RECORD_MARK,
      });
    });

    it("begins every summary with the mark and the host, and ends it with the closing sentence", async () => {
      const records = await recordsOf(dynamicsFiles());

      expect(records.length).toBeGreaterThan(700);
      for (const record of records) {
        expect(record.summary.startsWith(HOST_SENTENCE)).toBe(true);
        expect(record.summary.startsWith(EU_DG_COMP_RECORD_MARK)).toBe(true);
        expect(record.summary.endsWith(CLOSING)).toBe(true);
        expect(record.summary.length).toBeLessThanOrEqual(1300);
      }
    });

    it("gives each undertaking an address of its own: the page of the list and the undertaking", async () => {
      const records = await recordsOf(dynamicsFiles());

      expect(new Set(records.map((record) => record.url)).size).toBe(records.length);
      for (const record of records) {
        expect(record.url).toBe(
          `${DOCUMENTATION_URL}?undertaking=${encodeURIComponent(record.sourceRecordId)}`,
        );
      }
    });

    it("keys an undertaking by its spellings only, five at the most, and by no domain, number or LEI", async () => {
      const spellings = [
        "Spellco",
        "SPELLCO",
        "Spellco Ltd",
        "Spellco Inc",
        "Spellco Limited",
        "Spell-co",
      ];
      const cases = spellings.map((name, i) =>
        atCase({ number: `AT.9970${i}`, cartel: "Cartel", companies: [name] }),
      );
      const records = await recordsOf(filesOf([...baseAt(), ...cases]));

      const keys = recordOfId(records, "spellco")?.matchKeys ?? [];

      expect(keys).toContain("name:spellco");
      expect(keys.every((key) => key.startsWith("name:"))).toBe(true);
      // Five spellings give ten keys at the most: each as written and without its legal form.
      expect(keys.length).toBeLessThanOrEqual(10);
    });

    it("keeps the id of an undertaking whatever the order of the cases of the file", async () => {
      const at = [
        ...baseAt(),
        atCase({ number: "AT.99701", cartel: "Cartel", companies: ["Stable Name Ltd"] }),
        atCase({ number: "AT.99702", cartel: "Cartel", companies: ["Stable  Name Limited"] }),
      ];

      const forward = await recordsOf(filesOf(at));
      const backward = await recordsOf(filesOf([...at].reverse()));

      expect(recordOfId(forward, "stablename")?.summary).toBe(
        recordOfId(backward, "stablename")?.summary,
      );
      expect(forward.map((record) => record.sourceRecordId)).toEqual(
        backward.map((record) => record.sourceRecordId),
      );
    });
  });

  describe("the summary of an undertaking", () => {
    /** The sentences of the summary of the undertaking of one case, without the closing sentence. */
    const summaryOfCase = async (
      spec: Spec,
      company = "Facts Ltd",
      id = "facts",
    ): Promise<string> => {
      const records = await recordsOf(
        filesOf([...baseAt(), atCase({ ...spec, companies: spec.companies ?? [company] })]),
      );
      return recordOfId(records, id)?.summary ?? "";
    };

    it("names one case and the year it was opened in the singular, and leaves out the counts that are zero", async () => {
      const summary = await summaryOfCase({
        number: "AT.99801",
        cartel: "Cartel",
        title: "Synthetic one",
        initiation: "2010-01-15",
      });

      expect(summary).toContain("names it as a party in 1 case (1 cartel), opened in 2010. ");
      expect(summary).toContain(
        'Newest: AT.99801 (cartel, "Synthetic one"; Art. 101 TFEU; 1 party; no decision recorded, opened 2010-01-15). ',
      );
    });

    it("counts the cases by kind, in the order cartel, antitrust, DMA, and the years from the first to the last", async () => {
      const records = await recordsOf(
        filesOf(
          [
            ...baseAt(),
            atCase({
              number: "AT.99811",
              cartel: "Cartel",
              companies: ["Kinds Ltd"],
              initiation: "2001-01-01",
            }),
            atCase({ number: "AT.99812", companies: ["Kinds Ltd"], initiation: "2012-01-01" }),
            atCase({ number: "AT.99813", companies: ["Kinds Ltd"], initiation: "2012-06-01" }),
          ],
          baseDma(),
        ),
      );

      expect(recordOfId(records, "kinds")?.summary).toContain(
        "names it as a party in 3 cases (1 cartel, 2 antitrust), opened from 2001 to 2012. ",
      );
    });

    it("says one year when the first and the last are the same", async () => {
      const records = await recordsOf(
        filesOf([
          ...baseAt(),
          atCase({
            number: "AT.99821",
            cartel: "Cartel",
            companies: ["Sameyear Ltd"],
            initiation: "2010-01-01",
          }),
          atCase({
            number: "AT.99822",
            cartel: "Cartel",
            companies: ["Sameyear Ltd"],
            initiation: "2010-12-31",
          }),
        ]),
      );

      expect(recordOfId(records, "sameyear")?.summary).toContain("(2 cartel), opened in 2010. ");
    });

    it("leaves out the opening when no case says when it was opened, and the legal basis when there is none", async () => {
      const summary = await summaryOfCase({
        number: "AT.99831",
        cartel: "Cartel",
        title: "Synthetic bare",
        initiation: null,
        legal: null,
      });

      expect(summary).toContain("names it as a party in 1 case (1 cartel). ");
      expect(summary).not.toContain("opened");
      expect(summary).toContain(
        'Newest: AT.99831 (cartel, "Synthetic bare"; 1 party; no decision recorded). ',
      );
    });

    it("writes the latest decision with its type and its day, and no type when the file names none", async () => {
      const typed = await summaryOfCase({
        number: "AT.99841",
        cartel: "Cartel",
        title: "Synthetic typed",
        initiation: "2005-05-05",
        decisions: [
          { day: "2006-06-06", type: "Decision imposing fines" },
          { day: "2007-07-07", type: "Closure decision" },
        ],
      });
      const untyped = await summaryOfCase(
        {
          number: "AT.99842",
          cartel: "Cartel",
          title: "Synthetic untyped",
          initiation: "2005-05-05",
          decisions: [{ day: "2006-06-06", typeRaw: ["{}"] }],
        },
        "Untyped Ltd",
        "untyped",
      );

      expect(typed).toContain('1 party; latest decision "Closure decision" adopted 2007-07-07). ');
      expect(untyped).toContain("1 party; latest decision adopted 2006-06-06). ");
      expect(untyped).not.toContain('""');
    });

    it("says parties in the plural for any number but one", async () => {
      const summary = await summaryOfCase(
        {
          number: "AT.99851",
          cartel: "Cartel",
          title: "Synthetic crowd",
          companies: ["Crowdfacts Ltd", "Otherfacts Ltd", "Thirdfacts Ltd"],
        },
        "",
        "crowdfacts",
      );

      expect(summary).toContain("; 3 parties; ");
    });

    it("shortens the title to 60 characters, the legal basis to 40 and the type of the decision to 50", async () => {
      const summary = await summaryOfCase({
        number: "AT.99861",
        cartel: "Cartel",
        title: "T".repeat(90),
        legal: "L".repeat(55),
        decisions: [{ day: "2006-06-06", type: "Y".repeat(58) }],
      });

      expect(summary).toContain(`"${"T".repeat(48)} [shortened]"`);
      expect(summary).not.toContain("T".repeat(49));
      expect(summary).toContain(`; ${"L".repeat(28)} [shortened]; `);
      expect(summary).not.toContain("L".repeat(29));
      expect(summary).toContain(`latest decision "${"Y".repeat(38)} [shortened]" adopted `);
      expect(summary).not.toContain("Y".repeat(39));
    });

    it("lists the newest cases, three at the most, and shows no title for a case that is no cartel", async () => {
      const records = await recordsOf(
        filesOf([
          ...baseAt(),
          ...Array.from({ length: 5 }, (_, i) =>
            atCase({
              number: `AT.9987${i}`,
              companies: ["Newestfacts Ltd"],
              initiation: `${2010 + i}-02-02`,
            }),
          ),
        ]),
      );

      const summary = recordOfId(records, "newestfacts")?.summary ?? "";

      const newest = / \((?:cartel|antitrust|DMA)[,;]/g;
      expect(summary.match(newest)).toHaveLength(3);
      expect(summary).toContain("Newest: AT.99874 (antitrust; ");
      expect(summary).toContain("; AT.99873 (antitrust; ");
      expect(summary).toContain("; AT.99872 (antitrust; ");
      expect(summary).not.toContain("AT.99871");
      expect(summary).not.toContain(LEFT_OUT.antitrustTitle);
    });

    it("keeps the closing sentence and fits 1,300 characters for the longest undertaking: it drops the oldest of the newest cases", async () => {
      const name = `Worst${"a".repeat(95)}`;
      expect(name).toHaveLength(100);
      const crowd = (i: number): string[] => [
        name,
        ...Array.from({ length: 11 }, (_, at) => `Crowd${letters(i * 20 + at)} Ltd`),
      ];
      const long = Array.from({ length: 16 }, (_, i) =>
        atCase({
          number: `AT.${399000 + i}`,
          cartel: "Cartel",
          title: "t".repeat(60),
          legal: "L".repeat(40),
          companies: crowd(i),
          initiation: `${2001 + i}-01-01`,
          decisions: [{ day: `${2001 + i}-02-02`, type: "y".repeat(50) }],
        }),
      );
      const snapshot = await downloadOf(filesOf([...baseAt(), ...long]));
      const row = rowOf(snapshot, name.toLowerCase());
      expect(row?.cases).toBe(16);
      expect(row?.newest).toHaveLength(3);

      const record = recordOfId(connector.parse(snapshot).records, name.toLowerCase());

      const summary = record?.summary ?? "";
      expect(summary.length).toBeLessThanOrEqual(1300);
      expect(summary.endsWith(CLOSING)).toBe(true);
      expect(summary.startsWith(HOST_SENTENCE)).toBe(true);
      expect(summary).toContain(`Undertaking: ${name}. `);
      expect(summary).toContain(
        "names it as a party in 16 cases (16 cartel), opened from 2001 to 2016. ",
      );
      // Three entries would be longer than the room that the closing sentence leaves: two are listed.
      const listed = summary.match(/ AT\.\d{6} \(cartel, /g) ?? [];
      expect(listed).toHaveLength(2);
      expect(summary).toContain("Newest: AT.399015 (cartel, ");
      expect(summary).toContain("; AT.399014 (cartel, ");
      expect(summary).not.toContain("AT.399013");
      expect(summary).not.toContain("[shortened]");
      expectWellFormedRecords([record as ParsedRecord], { sourceId: "eu_dg_comp", mark: MARK });
    });

    it("shows the name of the undertaking at 100 characters at the most, and a longer one shortened, while its id and its key are the whole name", async () => {
      const long = `Longname${"b".repeat(102)}`;
      expect(long).toHaveLength(110);
      const records = await recordsOf(
        filesOf([...baseAt(), atCase({ number: "AT.99881", cartel: "Cartel", companies: [long] })]),
      );

      const record = records.find((entry) => entry.sourceRecordId.startsWith("longname"));

      // Only what is shown is shortened: the id is the whole name folded, and so is its key.
      expect(record?.sourceRecordId).toBe(long.toLowerCase());
      expect(record?.matchKeys).toContain(`name:${long.toLowerCase()}`);
      expect(record?.summary).toContain(`Undertaking: Longname${"b".repeat(80)} [shortened]. `);
      expect(record?.title).toBe(
        `European Commission competition cases: Longname${"b".repeat(80)} [shortened]`,
      );
      expect(record?.summary.endsWith(CLOSING)).toBe(true);
    });

    it("keeps the whole name in the identifiers of a name that is shown shortened: a cut text is never an identifier", async () => {
      const long = `Longname${"b".repeat(102)}`;
      const records = await recordsOf(
        filesOf([...baseAt(), atCase({ number: "AT.99882", cartel: "Cartel", companies: [long] })]),
      );

      const record = records.find((entry) => entry.sourceRecordId.startsWith("longname"));

      expect(record?.identifiers.undertaking).toBe(long);
      expect(JSON.stringify(record?.identifiers)).not.toContain("shortened");
      expect(record?.title).toContain("[shortened]");
    });
  });

  describe("what the files hold that the records must not", () => {
    it("copies nothing of the fields that are left out into the body or into a record", async () => {
      const snapshot = await downloadOf(dynamicsFiles());
      const parsed = connector.parse(snapshot);

      const everything = `${snapshot.bodies[0]}\n${JSON.stringify(parsed.records)}`;

      expectNothingLeft(everything);
      expect(everything).not.toContain("ZZ-");
      expect(everything).not.toContain("sentinel.example");
      // What the connector keeps is there: it is no empty list.
      expect(everything).toContain("Synthetic Dynamics Ltd");
      expect(everything).toContain("Synthetic cartel title");
      expect(everything).toContain("Synthetic DMA title");
    });

    it("keeps none of the fields of the case that it does not name: no link, no press text, no sector", async () => {
      const snapshot = await downloadOf(dynamicsFiles());

      const keys = new Set<string>();
      const collect = (value: unknown): void => {
        if (Array.isArray(value)) value.forEach(collect);
        else if (typeof value === "object" && value !== null) {
          for (const [key, inner] of Object.entries(value)) {
            keys.add(key);
            collect(inner);
          }
        }
      };
      collect(bodyOf(snapshot).rows);

      expect([...keys].sort()).toEqual(
        [
          "antitrust",
          "case",
          "caseNumbers",
          "cartel",
          "cases",
          "day",
          "decisions",
          "display",
          "dma",
          "firstYear",
          "id",
          "initiation",
          "kind",
          "lastYear",
          "latest",
          "legalBasis",
          "names",
          "newest",
          "parties",
          "publishedAt",
          "title",
          "type",
        ].sort(),
      );
    });
  });

  describe("hostile text in the files", () => {
    const HOSTILE_COMPANIES = [
      "Evil\u0000Control\u0007Chars Ltd",
      "Bidi‮override⁦Isolate Ltd",
      "<script>alert(1)</script> Markupco Ltd",
      `Longcell${"a".repeat(100_000)} Ltd`,
      "Surrogate\uD800Lone Ltd",
      "Zero​width­soft﻿hidden Ltd",
      "Tab\tand\nbreak\r\nco Ltd",
    ];

    const hostileFiles = (): Record<string, FakeFile> =>
      filesOf([
        ...baseAt(),
        atCase({
          number: "AT.99901",
          cartel: "Cartel",
          title: "Title <b>bold</b>\u0000‮\uD800 end",
          legal: "Art. <101> \u0007TFEU",
          companies: HOSTILE_COMPANIES,
          initiation: "2010-01-15",
          decisions: [{ day: "2011-02-03", type: "Type <i>x</i>​\u0000" }],
        }),
      ]);

    it("writes records that are well formed whatever the cells hold", async () => {
      const records = await recordsOf(hostileFiles());

      expectWellFormedRecords(records, { sourceId: "eu_dg_comp", mark: MARK });
      const hostile = records.filter(
        (record) =>
          record.identifiers.cases instanceof Array &&
          (record.identifiers.cases as string[]).includes("AT.99901"),
      );
      // The cell of 100,000 characters is longer than a name may be: it names no undertaking.
      expect(hostile).toHaveLength(HOSTILE_COMPANIES.length - 1);
      for (const record of hostile) {
        expect(record.summary.endsWith(CLOSING)).toBe(true);
        expect(record.title).not.toMatch(/[<>]/);
      }
    });

    it("cleans every cell of the body: no control, hidden or lone surrogate character, and no cell of 100,000 characters", async () => {
      const snapshot = await downloadOf(hostileFiles());

      const strings: string[] = [];
      const collect = (value: unknown): void => {
        if (typeof value === "string") strings.push(value);
        else if (Array.isArray(value)) value.forEach(collect);
        else if (typeof value === "object" && value !== null) Object.values(value).forEach(collect);
      };
      collect(bodyOf(snapshot).rows);

      expect(strings.length).toBeGreaterThan(1000);
      for (const text of strings) {
        expect(text).not.toMatch(/[\p{Cc}\p{Cf}\u{D800}-\u{DFFF}]/u);
        expect(text.length).toBeLessThanOrEqual(200);
      }
      expect(snapshot.bodies[0]).not.toContain("a".repeat(200));
    });

    it("writes the angle brackets of a name or a title as the quotation marks that no markup is made of", async () => {
      const records = await recordsOf(hostileFiles());

      const record = records.find((entry) =>
        entry.sourceRecordId.startsWith("scriptalert1scriptmarkupco"),
      );

      expect(record).toBeDefined();
      expect(record?.title).toContain("‹script›alert(1)‹/script›");
      expect(record?.summary).not.toMatch(/[<>]/);
    });

    it("writes the angle brackets of a name in the identifiers as the quotation marks too", async () => {
      const records = await recordsOf(
        filesOf([
          ...baseAt(),
          atCase({ number: "AT.99913", cartel: "Cartel", companies: ["<b>Acme Widgets</b> Ltd"] }),
        ]),
      );

      const record = records.find(
        (entry) =>
          entry.identifiers.cases instanceof Array &&
          (entry.identifiers.cases as string[]).includes("AT.99913"),
      );

      expect(record).toBeDefined();
      expect(record?.identifiers.undertaking).toBe("‹b›Acme Widgets‹/b› Ltd");
      expect(JSON.stringify(record?.identifiers)).not.toMatch(/[<>]/);
      expect(record?.title).toBe("European Commission competition cases: ‹b›Acme Widgets‹/b› Ltd");
    });

    it("merges a name that holds a hidden character with the same name written without it", async () => {
      const records = await recordsOf(
        filesOf([
          ...baseAt(),
          atCase({ number: "AT.99911", cartel: "Cartel", companies: ["Zero​width Plain Ltd"] }),
          atCase({ number: "AT.99912", cartel: "Cartel", companies: ["Zerowidth Plain Ltd"] }),
        ]),
      );

      const record = recordOfId(records, "zerowidthplain");

      expect(record?.identifiers.cases).toEqual(["AT.99912", "AT.99911"]);
    });
  });

  describe("determinism", () => {
    const at = (): Entry[] => [
      ...baseAt(),
      atCase({
        number: "AT.99921",
        cartel: "Cartel",
        companies: ["Tiebreak Corp", "Spacey Name Ltd"],
        initiation: "2015-05-05",
      }),
      atCase({
        number: "AT.99922",
        cartel: "Cartel",
        companies: ["TieBreak Corp", "Spacey Name Corporation"],
        initiation: "2015-05-05",
      }),
      atCase({
        number: "AT.99923",
        companies: ["Alvin Zephyrwick", "Stable Name Ltd"],
        initiation: "2015-05-05",
      }),
      atCase({ number: "AT.99924", companies: ["Alvin Zephyrwick"], initiation: "2015-05-05" }),
      atCase({ number: "AT.99925", companies: ["Mira Quillfeather"], initiation: "2015-05-05" }),
    ];
    const dma = (): Entry[] => [
      ...baseDma(),
      dmaCase({
        number: "DMA.900921",
        companies: ["Alvin Zephyrwick", "Tiebreak Corp"],
        initiation: "2024-01-01",
      }),
    ];

    it("gives the same bodies and the same records whatever the order of the cases of the files", async () => {
      await expectDeterministic(connector, (reversed) =>
        fakeFetch(filesOf(reversed ? at().reverse() : at(), reversed ? dma().reverse() : dma())),
      );
    });

    it("gives the same body whatever the order of the keys inside a case", async () => {
      const shuffled = (entries: Entry[]): Entry[] =>
        entries.map(([key, value]) => [
          key,
          Object.fromEntries(Object.entries(value).reverse()) as Json,
        ]);

      const plain = await downloadOf(filesOf(at(), dma()));
      const turned = await downloadOf(filesOf(shuffled(at()), shuffled(dma())));

      expect(turned.bodies).toEqual(plain.bodies);
    });
  });

  describe("the parse of a body", () => {
    /** A body of the connector with rows added that cannot be records: ids that no record may have. */
    async function bodyWithBadRows(count: number, id: (i: number) => string): Promise<Snapshot> {
      const snapshot = await downloadOf(filesOf());
      const body = bodyOf(snapshot);
      const bad = Array.from({ length: count }, (_, i) => ({ ...body.rows[0], id: id(i) }));
      return {
        ...snapshot,
        bodies: [
          JSON.stringify({ ...body, rows: [...body.rows, ...bad], total: body.total + count }),
        ],
      };
    }

    it("counts a row whose id is no id as skipped, up to ten, and as an error beyond", async () => {
      for (const count of [1, 10, 11, 25]) {
        const parsed = connector.parse(await bodyWithBadRows(count, (i) => `\u0000bad${i}`));

        expect(parsed.records).toHaveLength(773);
        expect(parsed.errors).toBe(count > 10 ? count : 0);
        expect(parsed.skipped).toBe(count > 10 ? 0 : count);
      }
    });

    it("refuses an id of more than 200 characters, and an empty one", async () => {
      const parsed = connector.parse(
        await bodyWithBadRows(2, (i) => (i === 0 ? "" : "x".repeat(201))),
      );

      expect(parsed.skipped).toBe(2);
      expect(parsed.records).toHaveLength(773);
    });

    it("is no list when the body is not the body of this connector", () => {
      const parsed = connector.parse({
        bodies: ['{"v":2,"rows":[],"total":0,"unreadable":0}'],
        etag: "k1:",
        lastModified: null,
        bytes: 0,
      });

      expect(parsed).toEqual({ records: [], errors: 1, sourceVersion: null, root: null });
    });
  });

  describe("what a run says and keeps", () => {
    it("logs nothing, whatever the files hold", async () => {
      const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
        jest.spyOn(console, method).mockImplementation(() => undefined),
      );
      try {
        const snapshot = await downloadOf(dynamicsFiles());
        connector.parse(snapshot);
        await failureOf(connector.download(fakeFetch({}), {}));
        for (const spy of spies) expect(spy).not.toHaveBeenCalled();
      } finally {
        for (const spy of spies) spy.mockRestore();
      }
    });

    it("fails with errors that name no address, no file and no case", async () => {
      const failures = await Promise.all([
        failureOf(
          connector.download(fakeFetch(filesOf(baseAt(), baseDma(), { at: { body: "{" } })), {}),
        ),
        failureOf(
          connector.download(
            fakeFetch(
              filesOf([...baseAt(), ["AT.99999", "x"]], baseDma(), { at: { truncated: true } }),
            ),
            {},
          ),
        ),
      ]);

      for (const failure of failures) {
        expect(failure).toBeInstanceOf(Error);
        const message = (failure as Error).message;
        for (const part of ["AT.", "DMA.", "case-data", "https", "compcases"]) {
          expect(message).not.toContain(part);
        }
      }
    });
  });
});
