/**
 * The C2PA Conforming Products List (connectors/c2paConforming.ts): one JSON array of the products
 * that the C2PA accepted as conformant, read into one record per APPLICANT that has at least one
 * conformant product. Every file here is invented: the names are made up, the products have the
 * shape of the real list (both key sets, optional keys now there and now absent), and no test
 * touches the network (a fake fetch serves the files).
 */
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { FetchError } from "../../../../webResearch/guardedFetch";
import { compactName } from "../../../records/match";
import { C2PA_CONFORMING_RECORD_MARK, c2paConformingConnector } from "../c2paConforming";
import { unreadableAllowed } from "../kit/clean";
import { BodyTooLargeError, NotTheListError } from "../types";
import {
  type FakeFile,
  expectDeterministic,
  expectWellFormedRecords,
  fakeFetch,
} from "./helpers/kitContract";

jest.setTimeout(30_000);

const MARK = C2PA_CONFORMING_RECORD_MARK;
const FILE_URL =
  "https://raw.githubusercontent.com/c2pa-org/conformance-public/main/conforming-products/conforming-products-list.json";
const PAGE_URL =
  "https://github.com/c2pa-org/conformance-public/blob/main/conforming-products/conforming-products-list.json?applicant=";
const ETAG = 'W/"9b3f1c-77ac"';
const LAST_MODIFIED = "Mon, 09 Nov 2026 07:12:30 GMT";

/** The first sentence, the "is not" sentence and the attribution: fixed text of every record. */
const S1 = "C2PA Conforming Products List (github.com/c2pa-org), a register or status list.";
const S2 =
  "A record says that the C2PA accepted conformance applications from this applicant for the products named; it says nothing about the applicant's other products, about the authenticity of any content, or about the applicant's conduct, and the C2PA can revoke a listing.";
const S6 =
  "Source: C2PA conformance-public repository, CC BY 4.0; adapted by VerifyWise. The C2PA name and marks are the C2PA's.";

/** The recordId of the product with this number: the shape of the real ones (a UUID, version 7). */
const uuid = (n: number): string => `0197a3c0-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;

/** A real day `offset` days after 2025-01-01. */
const dayAt = (offset: number): string =>
  new Date(Date.UTC(2025, 0, 1 + offset)).toISOString().slice(0, 10);

/** `n` as letters only, so that a name made of it holds no digit. */
const lettersOf = (n: number): string =>
  [...n.toString(26)].map((digit) => String.fromCharCode(97 + parseInt(digit, 26))).join("");

/** The characters that are hard to type, built at run time from their code points. */
const cp = (...codes: number[]): string => String.fromCodePoint(...codes);

/** A zero-width space: a character that nobody sees, which the cleaning of a cell takes out. */
const ZERO = String.fromCodePoint(0x200b);

/** `text` in full-width letters and ideographic blanks: the form that NFKC folds back to the plain one. */
const fullWidth = (text: string): string =>
  [...text]
    .map((char) =>
      char === " "
        ? String.fromCodePoint(0x3000)
        : String.fromCharCode(char.charCodeAt(0) + 0xfee0),
    )
    .join("");

/** The sentinel of every field that the record never keeps: each is found in the file, in no result. */
const SENTINELS = [
  "ZZOU",
  "ZZMINVER",
  "ZZATTEST",
  "ZZSIGNAL",
  "ZZSPEC",
  "ZZPROGRAM",
  "ZZCONTAINER",
  "ZZLIVE",
  "zzinfo",
  "2019-03-03",
  "2018-02-02",
];

interface Spec {
  /** Makes the recordId of the product, and is the product's identity in a test. */
  n: number;
  recordId?: unknown;
  applicant?: unknown;
  status?: unknown;
  type?: unknown;
  cn?: unknown;
  org?: unknown;
  conformance?: unknown;
  modified?: unknown;
  /** The second key set of the real list: the product has a `liveVideo`. */
  live?: boolean;
  /** The product has an `infoURL`. */
  info?: boolean;
  /** Keys to leave out, by their own name (`recordId`, `applicant`, `dates`, `conformance`, `CN`, ...). */
  omit?: readonly string[];
}

/** The value a test gave, null included, or the default when it gave none. */
const given = (value: unknown, fallback: unknown): unknown =>
  value === undefined ? fallback : value;

/** The entries of `values` whose value is not undefined and whose key is not left out. */
const pairs = (
  values: Record<string, unknown>,
  omitted: ReadonlySet<string>,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(values).filter(([key, value]) => value !== undefined && !omitted.has(key)),
  );

/** A product as the list writes it, with a sentinel in every field that no record keeps. */
function product(spec: Spec): Record<string, unknown> {
  const omitted = new Set(spec.omit ?? []);
  const applicant = given(spec.applicant, `Applicant ${lettersOf(spec.n)}`);
  const dn = pairs(
    {
      CN: given(spec.cn, `Product ${lettersOf(spec.n)}`),
      O: given(spec.org, applicant),
      OU: "ZZOU",
      C: "ZZ",
    },
    omitted,
  );
  const inner = pairs(
    {
      productType: given(spec.type, "generatorProduct"),
      DN: dn,
      minVersion: "ZZMINVER",
      infoURL: spec.info === true ? "https://zzinfo.example/zz/path" : undefined,
      assurance: { maxAssuranceLevel: 2, attestationMethods: ["ZZATTEST"] },
      disallowedSignals: { inception: ["ZZSIGNAL"], transformation: [] },
    },
    omitted,
  );
  const dates = pairs(
    {
      creation: "2019-03-03",
      conformance: given(spec.conformance, "2025-06-30"),
      earliestPublicDisclosure: "2018-02-02",
      lastModification: given(spec.modified, "2025-07-01"),
    },
    omitted,
  );
  return pairs(
    {
      recordId: given(spec.recordId, uuid(spec.n)),
      applicant,
      supportsCompressedManifests: true,
      status: given(spec.status, "conformant"),
      product: inner,
      specVersion: ["ZZSPEC"],
      conformanceProgramVersion: "ZZPROGRAM",
      containers: { generate: { image: ["ZZCONTAINER"] }, validate: { image: ["ZZCONTAINER"] } },
      liveVideo:
        spec.live === true
          ? {
              supported: true,
              encapsulations: [
                { type: "ZZLIVE", generation: true, validation: true, methods: ["ZZLIVE"] },
              ],
            }
          : undefined,
      dates,
    },
    omitted,
  );
}

const nameOf = (a: number): string => `Filler${lettersOf(a)} Imaging`;
const FILLER_KEYS = new Set(Array.from({ length: 200 }, (_, a) => `filler${lettersOf(a)}imaging`));

/** Products that fill the list up to its floors: two for each of 100 invented applicants. */
function fillers(applicants = 100, perApplicant = 2): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (let a = 0; a < applicants; a += 1) {
    for (let p = 0; p < perApplicant; p += 1) {
      const n = a * perApplicant + p;
      out.push(
        product({
          n,
          applicant: nameOf(a),
          cn: `Cam ${lettersOf(n)}`,
          conformance: dayAt(n % 200),
          modified: dayAt((n % 200) + 1),
        }),
      );
    }
  }
  return out;
}

/** `count` more conformant products, one for each of the first `count` applicants of the fillers. */
const moreFor = (count: number): Array<Record<string, unknown>> =>
  Array.from({ length: count }, (_, a) =>
    product({ n: 5000 + a, applicant: nameOf(a), cn: `Extra ${lettersOf(a)}` }),
  );

const listText = (items: readonly unknown[]): string => JSON.stringify(items, null, 2);

const filesOf = (body: string, over: Partial<FakeFile> = {}): Record<string, FakeFile> => ({
  [FILE_URL]: {
    body,
    contentType: "text/plain; charset=utf-8",
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

/** The list of these items, downloaded and parsed. */
async function run(items: readonly unknown[], over: Partial<FakeFile> = {}) {
  const fetch = fakeFetch(filesOf(listText(items), over));
  const snapshot = await c2paConformingConnector.download(fetch, {});
  if (snapshot === "unchanged") throw new Error("The fake fetch answered unchanged.");
  const result = c2paConformingConnector.parse(snapshot);
  const body = JSON.parse(snapshot.bodies[0]) as Body;
  const byId = new Map(result.records.map((record) => [record.sourceRecordId, record]));
  return { fetch, snapshot, result, body, byId };
}

/** The keys of the records that the fillers do not make. */
const extraKeys = (byId: ReadonlyMap<string, unknown>): string[] =>
  [...byId.keys()].filter((key) => !FILLER_KEYS.has(key)).sort();

const rowOf = (body: Body, id: string): Record<string, unknown> | undefined =>
  body.rows.find((row) => row.id === id);

/** The failure of a promise, or undefined when it did not fail. */
const failureOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );

const everythingOf = (done: { snapshot: { bodies: string[] }; result: { records: unknown[] } }) =>
  `${done.snapshot.bodies.join("")}${JSON.stringify(done.result.records)}`;

/** What a table of products overrides in one of them: anything of a product but its number. */
type Over = Partial<Omit<Spec, "n">>;

/** The one applicant of most tests: three conformant products and one that was revoked. */
const zibble = (): Array<Record<string, unknown>> => [
  product({
    n: 10001,
    applicant: "Zibblecorp Imaging Inc",
    type: "generatorProduct",
    cn: "Zibble Camera One",
    conformance: "2025-08-01",
    modified: "2025-09-10",
  }),
  product({
    n: 10002,
    applicant: "Zibblecorp Imaging Inc",
    type: "generatorProduct",
    cn: "Zibble Studio",
    conformance: "2025-10-05",
    modified: "2025-10-06",
    live: true,
    info: true,
  }),
  product({
    n: 10003,
    applicant: "Zibblecorp Imaging Inc",
    type: "validatorProduct",
    cn: "Zibble Checker",
    conformance: "2025-09-01",
    modified: "2025-09-02",
  }),
  product({
    n: 10004,
    applicant: "Zibblecorp Imaging Inc",
    status: "revoked",
    type: "generatorProduct",
    cn: "Zibble Old",
    conformance: "2025-07-01",
    modified: "2025-11-01",
  }),
];

describe("c2paConformingConnector", () => {
  describe("the connector", () => {
    it("is the snapshot connector of the list, at its first version", () => {
      expect(c2paConformingConnector.id).toBe("c2pa_conforming");
      expect(c2paConformingConnector.version).toBe(1);
      expect(c2paConformingConnector.kind).toBeUndefined();
      expect(MARK).toBe("C2PA Conforming Products List");
    });

    it("asks the list file once, with the limits of the list and the stored validators", async () => {
      const fetch = fakeFetch(filesOf(listText(fillers())));
      const first = await c2paConformingConnector.download(fetch, {});
      expect(first).not.toBe("unchanged");
      expect(fetch.calls).toHaveLength(1);
      expect(fetch.calls[0].url).toBe(FILE_URL);
      expect(fetch.calls[0].validators).toEqual({});
      expect(fetch.calls[0].limits).toEqual({
        maxBytes: 8_388_608,
        allowedContentTypes: ["text/plain", "application/json"],
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
        await run([...fillers(), product({ n: 1, conformance: "garbage" })]);
      } finally {
        for (const spy of spies) {
          expect(spy).not.toHaveBeenCalled();
          spy.mockRestore();
        }
      }
      const source = readFileSync(join(__dirname, "..", "c2paConforming.ts"), "utf8");
      expect(source).not.toMatch(/console\.|logger/);
    });
  });

  describe("a list of invented applicants", () => {
    it("gives one record for each applicant, whose id is the compact name", async () => {
      const { result, body } = await run(fillers());
      expect(result.records).toHaveLength(100);
      expect(new Set(result.records.map((record) => record.sourceRecordId))).toEqual(
        new Set(Array.from({ length: 100 }, (_, a) => `filler${lettersOf(a)}imaging`)),
      );
      expect(result).toMatchObject({
        errors: 0,
        skipped: 0,
        root: "conforming-products-list.json",
      });
      expect(body.rows).toHaveLength(100);
      expect(body.total).toBe(200);
      expect(body.unreadable).toBe(0);
    });

    it("gives records that the database and the prompt can take", async () => {
      const { result } = await run([...fillers(), ...zibble()]);
      expectWellFormedRecords(result.records, { sourceId: "c2pa_conforming", mark: MARK });
    });

    it("begins every summary with the mark, and the first sentence names the host and the kind of list", async () => {
      const { result } = await run(fillers());
      for (const record of result.records) {
        expect(record.summary.startsWith(MARK)).toBe(true);
        expect(record.summary.startsWith(`${S1} ${S2} `)).toBe(true);
        expect(record.summary.endsWith(S6)).toBe(true);
      }
    });

    it("gives records of the state type of the list, and no second source", async () => {
      const { result } = await run(fillers());
      expect(new Set(result.records.map((record) => record.recordType))).toEqual(
        new Set(["c2pa_conformance"]),
      );
    });

    it("gives the newest change of the products that have a record as the version of the list", async () => {
      const { result } = await run([...fillers(), ...zibble()]);
      // The revoked product of the applicant that has a record is the newest change of the file.
      expect(result.sourceVersion).toBe("2025-11-01");
    });

    it("gives no version when no product says when it changed", async () => {
      const bare = Array.from({ length: 200 }, (_, at) =>
        product({ n: at, applicant: nameOf(Math.floor(at / 2)), omit: ["lastModification"] }),
      );
      const { result } = await run(bare);
      expect(result.sourceVersion).toBeNull();
    });

    it("gives records of different applicants different addresses, built from the id", async () => {
      const { result } = await run(fillers());
      const urls = result.records.map((record) => record.url);
      expect(new Set(urls).size).toBe(100);
      for (const record of result.records) {
        expect(record.url).toBe(`${PAGE_URL}${record.sourceRecordId}`);
      }
    });

    it("encodes an id that is not ASCII in its address", async () => {
      const name = `Zibbl${String.fromCodePoint(0xe9)}corp`;
      const { byId } = await run([...fillers(), product({ n: 10100, applicant: name })]);
      const id = compactName(name);
      expect(byId.get(id)?.url).toBe(`${PAGE_URL}${encodeURIComponent(id)}`);
      expect(byId.get(id)?.url).toContain("%C3%A9");
    });
  });

  describe("the record of one applicant, in full", () => {
    async function oneRecord() {
      const done = await run([...fillers(), ...zibble()]);
      return { ...done, record: done.byId.get("zibblecorpimaginginc") };
    }

    it("is made as the template says: the id, the title, the keys, the address and the dates", async () => {
      const { record } = await oneRecord();
      expect(record).toEqual({
        sourceRecordId: "zibblecorpimaginginc",
        recordType: "c2pa_conformance",
        title: `${MARK}: Zibblecorp Imaging Inc`,
        summary: expect.any(String),
        url: `${PAGE_URL}zibblecorpimaginginc`,
        identifiers: {
          applicant: "Zibblecorp Imaging Inc",
          conformant: 3,
          newestConformance: "2025-10-05",
          recordIds: [uuid(10002), uuid(10003), uuid(10001)],
        },
        matchKeys: ["name:zibblecorpimaginginc", "name:zibblecorpimaging"],
        publishedAt: "2025-10-05",
        sourceUpdatedAt: null,
      });
    });

    it("has the text of the template, sentence by sentence", async () => {
      const { record } = await oneRecord();
      expect(record?.summary).toBe(
        [
          S1,
          S2,
          "Applicant as written: Zibblecorp Imaging Inc.",
          "Conformant products: 3 (2 generator, 1 validator), the newest conformed on 2025-10-05; 1 other listed product has another status.",
          "Products: Zibble Studio, Zibble Checker, Zibble Camera One.",
          S6,
        ].join(" "),
      );
    });

    it("keeps no sentinel of a field that is left out, in the body or in a record", async () => {
      const done = await oneRecord();
      const everything = everythingOf(done);
      for (const sentinel of SENTINELS) expect(everything).not.toContain(sentinel);
    });

    it("lists no product that was not conformant, and says how many there were", async () => {
      const { record } = await oneRecord();
      expect(record?.summary).not.toContain("Zibble Old");
      expect(JSON.stringify(record?.identifiers)).not.toContain(uuid(10004));
    });

    it("reads both key sets of the real list, with and without liveVideo, and its optional keys absent", async () => {
      const done = await run([
        ...fillers(),
        product({ n: 10200, applicant: "Quillworks Optical", live: true, info: true }),
        product({
          n: 10201,
          applicant: "Quillworks Optical",
          omit: ["DN", "minVersion", "assurance", "disallowedSignals"],
        }),
        product({ n: 10202, applicant: "Quillworks Optical", omit: ["OU", "C", "O"] }),
      ]);
      expect(done.body.unreadable).toBe(0);
      expect(done.byId.get("quillworksoptical")?.identifiers).toMatchObject({ conformant: 3 });
    });

    it("keeps the sentinels of the fixture in the file (a check of the fixture)", () => {
      const text = JSON.stringify(zibble());
      for (const sentinel of SENTINELS) expect(text).toContain(sentinel);
    });
  });

  describe("the status of a product", () => {
    it("counts a revoked product as another status, and never as conformant", async () => {
      const { byId } = await run([
        ...fillers(),
        product({ n: 10300, applicant: "Quillworks Optical" }),
        product({ n: 10301, applicant: "Quillworks Optical", status: "revoked" }),
        product({ n: 10302, applicant: "Quillworks Optical", status: "revoked" }),
      ]);
      const record = byId.get("quillworksoptical");
      expect(record?.summary).toContain(
        "Conformant products: 1 (1 generator, 0 validator), the newest conformed on 2025-06-30; 2 other listed products have another status.",
      );
      expect(record?.identifiers).toMatchObject({ conformant: 1 });
    });

    it("gives no record to an applicant that has only products of another status, and counts none unreadable", async () => {
      const { byId, body } = await run([
        ...fillers(),
        product({ n: 10310, applicant: "Quillworks Optical", status: "revoked" }),
        product({ n: 10311, applicant: "Quillworks Optical", status: "pending" }),
      ]);
      expect(byId.has("quillworksoptical")).toBe(false);
      expect(rowOf(body, "quillworksoptical")).toBeUndefined();
      expect(body.unreadable).toBe(0);
      expect(body.rows).toHaveLength(100);
    });

    it("takes only the exact word for conformant: a case, a blank or a hidden character makes another status", async () => {
      const zero = String.fromCodePoint(0x200b);
      const statuses = [
        "Conformant",
        "CONFORMANT",
        "conformant ",
        " conformant",
        `conformant${zero}`,
        "non-conformant",
        "conformant (suspended)",
      ];
      const { byId } = await run([
        ...fillers(),
        product({ n: 10320, applicant: "Quillworks Optical" }),
        ...statuses.map((status, at) =>
          product({ n: 10321 + at, applicant: "Quillworks Optical", status }),
        ),
      ]);
      const record = byId.get("quillworksoptical");
      expect(record?.identifiers).toMatchObject({ conformant: 1 });
      expect(record?.summary).toContain("; 7 other listed products have another status.");
    });

    it("says 'product' and 'has' for one other product, and 'products' and 'have' for more", async () => {
      const one = await run([
        ...fillers(),
        product({ n: 10330, applicant: "Quillworks Optical" }),
        product({ n: 10331, applicant: "Quillworks Optical", status: "revoked" }),
      ]);
      expect(one.byId.get("quillworksoptical")?.summary).toContain(
        "; 1 other listed product has another status.",
      );
      const none = await run([
        ...fillers(),
        product({ n: 10332, applicant: "Quillworks Optical" }),
      ]);
      expect(none.byId.get("quillworksoptical")?.summary).not.toContain("other listed");
    });

    it("does not let a product of another status date the record or name a product", async () => {
      const { byId } = await run([
        ...fillers(),
        product({
          n: 10340,
          applicant: "Quillworks Optical",
          cn: "Quill Lens",
          conformance: "2025-08-01",
        }),
        product({
          n: 10341,
          applicant: "Quillworks Optical",
          cn: "Quill Gone",
          status: "revoked",
          conformance: "2025-12-31",
        }),
      ]);
      const record = byId.get("quillworksoptical");
      expect(record?.publishedAt).toBe("2025-08-01");
      expect(record?.summary).toContain("the newest conformed on 2025-08-01;");
      expect(record?.summary).toContain("Products: Quill Lens.");
      expect(record?.summary).not.toContain("Quill Gone");
    });

    it.each<[string, Over]>([
      ["no status", { omit: ["status"] }],
      ["a status that is no text", { status: 7 }],
      ["a status that is null", { status: null }],
      ["an empty status", { status: "" }],
      ["a status of blanks", { status: "   " }],
      ["a status of hidden characters", { status: String.fromCodePoint(0x200b) }],
    ])("is unreadable for %s", async (_name, over) => {
      const { byId, body } = await run([
        ...fillers(),
        product({ n: 10350, applicant: "Quillworks Optical", ...over }),
      ]);
      expect(body.unreadable).toBe(1);
      expect(byId.has("quillworksoptical")).toBe(false);
    });

    it("reads a status of 100 KB as another status, cut where it is read", async () => {
      const { byId, body } = await run([
        ...fillers(),
        product({ n: 10351, applicant: "Quillworks Optical" }),
        product({ n: 10352, applicant: "Quillworks Optical", status: "s".repeat(100_000) }),
      ]);
      expect(body.unreadable).toBe(0);
      expect(byId.get("quillworksoptical")?.identifiers).toMatchObject({ conformant: 1 });
      expect(JSON.stringify(body)).not.toContain("s".repeat(200));
    });
  });

  describe("the kind of product", () => {
    it("counts the conformant products by kind, and a product of another kind in neither", async () => {
      const { byId } = await run([
        ...fillers(),
        product({ n: 10400, applicant: "Quillworks Optical", type: "generatorProduct" }),
        product({ n: 10401, applicant: "Quillworks Optical", type: "generatorProduct" }),
        product({ n: 10402, applicant: "Quillworks Optical", type: "validatorProduct" }),
        product({ n: 10403, applicant: "Quillworks Optical", type: "monitorProduct" }),
        product({ n: 10404, applicant: "Quillworks Optical", type: 7 }),
        product({ n: 10405, applicant: "Quillworks Optical", omit: ["productType"] }),
        product({ n: 10406, applicant: "Quillworks Optical", omit: ["product"] }),
      ]);
      const record = byId.get("quillworksoptical");
      expect(record?.identifiers).toMatchObject({ conformant: 7 });
      expect(record?.summary).toContain("Conformant products: 7 (2 generator, 1 validator),");
    });

    it("counts a product of another status by no kind", async () => {
      const { byId } = await run([
        ...fillers(),
        product({ n: 10410, applicant: "Quillworks Optical", type: "validatorProduct" }),
        product({
          n: 10411,
          applicant: "Quillworks Optical",
          type: "validatorProduct",
          status: "revoked",
        }),
      ]);
      expect(byId.get("quillworksoptical")?.summary).toContain(
        "Conformant products: 1 (0 generator, 1 validator),",
      );
    });
  });

  describe("the applicant, and what makes two products one applicant", () => {
    it("makes one record of 'Quillworks Inc ' and 'Quillworks Inc', the blank at the end read away", async () => {
      const { byId, body } = await run([
        ...fillers(),
        product({ n: 10500, applicant: "Quillworks Inc " }),
        product({ n: 10501, applicant: "Quillworks Inc" }),
      ]);
      expect(extraKeys(byId)).toEqual(["quillworksinc"]);
      expect(byId.get("quillworksinc")?.identifiers).toMatchObject({
        applicant: "Quillworks Inc",
        conformant: 2,
      });
      expect(rowOf(body, "quillworksinc")?.names).toEqual(["Quillworks Inc"]);
    });

    it("makes one record of the spellings that differ in case and punctuation only", async () => {
      const { byId } = await run([
        ...fillers(),
        product({ n: 10510, applicant: "Quillworks Inc" }),
        product({ n: 10511, applicant: "QUILLWORKS, INC." }),
        product({ n: 10512, applicant: "quillworks-inc" }),
      ]);
      expect(extraKeys(byId)).toEqual(["quillworksinc"]);
      expect(byId.get("quillworksinc")?.identifiers).toMatchObject({ conformant: 3 });
    });

    it("keeps a name with a legal form and the name without it apart: two records", async () => {
      const { byId } = await run([
        ...fillers(),
        product({ n: 10520, applicant: "Gleamwright" }),
        product({ n: 10521, applicant: "Gleamwright LLC" }),
      ]);
      expect(extraKeys(byId)).toEqual(["gleamwright", "gleamwrightllc"]);
    });

    it("shows the most frequent spelling, and of equal ones the first in the order of the characters", async () => {
      const spellings = [
        ["Quillworks Inc", 3],
        ["QUILLWORKS INC", 1],
        ["Quillworks, Inc.", 1],
      ] as const;
      let n = 10530;
      const items = spellings.flatMap(([applicant, times]) =>
        Array.from({ length: times }, () => product({ n: (n += 1), applicant })),
      );
      for (const order of [items, [...items].reverse()]) {
        const { byId } = await run([...fillers(), ...order]);
        expect(byId.get("quillworksinc")?.title).toBe(`${MARK}: Quillworks Inc`);
      }
      const tie = [
        product({ n: 10540, applicant: "Quillworks, Inc." }),
        product({ n: 10541, applicant: "Quillworks Inc" }),
      ];
      for (const order of [tie, [...tie].reverse()]) {
        const { byId } = await run([...fillers(), ...order]);
        // A blank (U+0020) sorts before a comma (U+002C).
        expect(byId.get("quillworksinc")?.title).toBe(`${MARK}: Quillworks Inc`);
      }
    });

    it("takes the spelling to show, and the spellings of the names, from the conformant products only", async () => {
      const items = [
        product({ n: 10595, applicant: "Quillworks Inc" }),
        product({ n: 10596, applicant: "QUILLWORKS INC", status: "revoked" }),
        product({ n: 10597, applicant: "QUILLWORKS INC", status: "revoked" }),
        product({ n: 10598, applicant: "Quillworks, Inc.", status: "revoked" }),
      ];
      for (const order of [items, [...items].reverse()]) {
        const done = await run([...fillers(), ...order]);
        const record = done.byId.get("quillworksinc");
        expect(record?.title).toBe(`${MARK}: Quillworks Inc`);
        expect(record?.identifiers).toMatchObject({ applicant: "Quillworks Inc" });
        expect(rowOf(done.body, "quillworksinc")?.names).toEqual(["Quillworks Inc"]);
        expect(everythingOf(done)).not.toMatch(/QUILLWORKS|Quillworks, Inc/);
      }
    });

    it("gives at most three spellings of the applicant, the most frequent first and the rest in order", async () => {
      const spellings: Array<[string, number]> = [
        ["Quillworks Inc", 3],
        ["Quillworks, Inc.", 2],
        ["QUILLWORKS INC", 1],
        ["quillworks inc", 1],
        ["Quillworks Inc.", 1],
      ];
      let n = 10550;
      const items = spellings.flatMap(([applicant, times]) =>
        Array.from({ length: times }, () => product({ n: (n += 1), applicant })),
      );
      const { body } = await run([...fillers(), ...items]);
      expect(rowOf(body, "quillworksinc")?.names).toEqual([
        "Quillworks Inc",
        "Quillworks, Inc.",
        "QUILLWORKS INC",
      ]);
    });

    it("shows the applicant as the title and the second sentence, cut at 80 characters", async () => {
      const long = `Quillworks ${"Optical ".repeat(9)}Inc`;
      expect(long.length).toBeGreaterThan(80);
      expect(long.length).toBeLessThanOrEqual(100);
      const { byId } = await run([...fillers(), product({ n: 10560, applicant: long })]);
      const record = byId.get(compactName(long));
      const shown = `${long.slice(0, 68)} [shortened]`;
      expect(record?.title).toBe(`${MARK}: ${shown}`);
      expect(record?.summary).toContain(`Applicant as written: ${shown}.`);
      expect(record?.identifiers).toMatchObject({ applicant: long });
    });

    it("keeps an applicant of 100 characters whole, and makes one of 101 unreadable", async () => {
      const hundred = `Q${"u".repeat(99)}`;
      const over = `Q${"u".repeat(100)}`;
      const ok = await run([...fillers(), product({ n: 10570, applicant: hundred })]);
      expect(ok.body.unreadable).toBe(0);
      expect(ok.byId.has(compactName(hundred))).toBe(true);
      const bad = await run([...fillers(), product({ n: 10571, applicant: over })]);
      expect(bad.body.unreadable).toBe(1);
      expect(bad.byId.has(compactName(over))).toBe(false);
    });

    it("ends the sentence of the applicant with one full stop, whatever its own end", async () => {
      const { byId } = await run([
        ...fillers(),
        product({ n: 10580, applicant: "Quillworks Inc." }),
      ]);
      const summary = byId.get("quillworksinc")?.summary ?? "";
      expect(summary).toContain("Applicant as written: Quillworks Inc. Conformant products");
      expect(summary).not.toContain("..");
    });

    it("makes the keys of the name as written and of the name without its legal form", async () => {
      const { byId } = await run([
        ...fillers(),
        product({ n: 10590, applicant: "Quillworks GmbH" }),
      ]);
      expect(byId.get("quillworksgmbh")?.matchKeys).toEqual([
        "name:quillworksgmbh",
        "name:quillworks",
      ]);
    });

    it("keeps a record whose applicant is too short to be a name key, with no key of it", async () => {
      const { byId } = await run([...fillers(), product({ n: 10591, applicant: "Qux" })]);
      expect(byId.get("qux")?.matchKeys).toEqual([]);
    });
  });

  describe("the person rule (rule A)", () => {
    it.each([
      ["sole proprietorship", "Jane Roe Sole Proprietorship"],
      ["capitals", "JANE ROE SOLE PROPRIETORSHIP"],
      ["a blank run inside the phrase", "Jane Roe Sole   Proprietorship"],
      ["Einzelunternehmen", "Max Quillmann Einzelunternehmen"],
      ["Einzelunternehmen in capitals", "EINZELUNTERNEHMEN Quillmann"],
      ["freelance", "Freelance Zibblesmith"],
      ["freelance in the middle of a word", "Zibblesmith Freelancer Studio"],
      ["self-employed", "Zibblesmith (self-employed)"],
      ["Self-Employed", "Zibblesmith Self-Employed Consulting"],
      ["sole proprietor, without the ship", "Zibblesmith Sole Proprietor"],
      ["sole proprietor in capitals", "ZIBBLESMITH SOLE PROPRIETOR"],
      ["sole trader", "Zibblesmith Sole Trader"],
      ["sole trader in capitals", "ZIBBLESMITH SOLE TRADER"],
      [
        "Einzelunternehmer, which does not hold Einzelunternehmen",
        "Max Quillmann Einzelunternehmer",
      ],
      ["Einzelunternehmerin", "Maxine Quillmann Einzelunternehmerin"],
      ["Einzelkaufmann", "Max Quillmann Einzelkaufmann"],
      ["Einzelkaufmann in capitals", "MAX QUILLMANN EINZELKAUFMANN"],
      ["freelancing", "Zibblesmith Freelancing"],
      ["self employed with a blank", "Zibblesmith self employed"],
      ["self employed in capitals", "ZIBBLESMITH SELF EMPLOYED"],
      ["selfemployed with nothing between", "Zibblesmith selfemployed"],
      ["e.K. at the end", "Zibblesmith e.K."],
      ["e. K. with a blank", "Zibblesmith e. K."],
      ["e.Kfm.", "Zibblesmith e.Kfm."],
      ["e.Kfr.", "Zibblesmith e.Kfr."],
      ["E.K. in capitals", "ZIBBLESMITH E.K."],
      ["e.K. after a comma", "Zibblesmith, e.K."],
    ])(
      "drops the product of an applicant with %s: no record, and nothing counted",
      async (_name, applicant) => {
        const done = await run([...fillers(), product({ n: 10600, applicant })]);
        expect(extraKeys(done.byId)).toEqual([]);
        expect(done.body.unreadable).toBe(0);
        expect(done.body.rows).toHaveLength(100);
        // The text of the applicant reaches neither the body nor a record.
        expect(everythingOf(done)).not.toMatch(/zibblesmith|quillmann|jane roe/i);
      },
    );

    it.each([
      ["a word in full-width letters", `Zibblesmith ${fullWidth("Freelance")}`],
      ["a phrase in full-width letters and blanks", fullWidth("Zibblesmith Sole Proprietorship")],
      ["a hidden character inside the word", `Zibblesmith Free${ZERO}lance`],
      ["a hidden character inside the hyphenated word", `Zibblesmith Self-${ZERO}Employed`],
      [
        "a tab and a no-break blank inside the phrase",
        `Zibblesmith Sole${String.fromCharCode(9)}${String.fromCharCode(0xa0)}Proprietorship`,
      ],
      ["a hidden character inside sole trader", `Zibblesmith Sole${ZERO} Trader`],
      ["a hidden character inside e.K.", `Zibblesmith e.${ZERO}K.`],
      ["e.K. in full-width letters", `Zibblesmith ${fullWidth("e.K.")}`],
      ["a blank run before e.K.", `Zibblesmith${String.fromCharCode(9)}  e.K.`],
    ])(
      "reads the applicant as the cleaning of its cell leaves it: drops the product with %s",
      async (_name, applicant) => {
        const done = await run([...fillers(), product({ n: 10606, applicant })]);
        expect(extraKeys(done.byId)).toEqual([]);
        expect(done.body.unreadable).toBe(0);
        expect(everythingOf(done)).not.toMatch(/zibblesmith/i);
      },
    );

    it.each([
      ["in full-width letters", fullWidth("Quill Freelance Holdings Ltd")],
      ["with a hidden character inside the word", `Quill Free${ZERO}lance Holdings Ltd`],
    ])(
      "reads the organisation as the cleaning of its cell leaves it: keeps a name with such a term %s out of the names",
      async (_name, org) => {
        const { byId, body } = await run([
          ...fillers(),
          product({ n: 10607, applicant: "Quillworks Optical", org }),
        ]);
        expect(byId.has("quillworksoptical")).toBe(true);
        expect(rowOf(body, "quillworksoptical")?.names).toEqual(["Quillworks Optical"]);
        expect(byId.get("quillworksoptical")?.matchKeys).toEqual(["name:quillworksoptical"]);
        expect(JSON.stringify(body)).not.toMatch(/holdings/i);
      },
    );

    it.each([
      "Quill Sole Proprietor Holdings Ltd",
      "Quill Sole Trader Holdings Ltd",
      "Quill Einzelunternehmer Holdings",
      "Quill Einzelkaufmann Holdings",
      "Quill Self Employed Holdings Ltd",
      "Quill Holdings e.K.",
      "Quill Holdings e. K.",
      "Quill Holdings e.Kfm.",
      "Quill Holdings e.Kfr.",
    ])("keeps the organisation %s out of the names, and the product stays", async (org) => {
      const { byId, body } = await run([
        ...fillers(),
        product({ n: 10609, applicant: "Quillworks Optical", org }),
      ]);
      expect(body.unreadable).toBe(0);
      expect(rowOf(body, "quillworksoptical")?.names).toEqual(["Quillworks Optical"]);
      expect(byId.get("quillworksoptical")?.matchKeys).toEqual(["name:quillworksoptical"]);
      expect(JSON.stringify(body)).not.toMatch(/holdings/i);
    });

    it.each([
      "Pike Ltd",
      "Beker GmbH",
      "Acme GmbH & Co. KG",
      "Proprietary Limited",
      "Freeland Optics",
      "Sole Source Imaging",
      "Einzelhandel GmbH",
      "Quillbright Employment Ltd",
      "Pike.K. Ltd",
      "Pike.K.",
      "Pike2e.K.",
    ])(
      "keeps the applicant %s, whose name merely holds some letters of a term: one record, nothing counted",
      async (applicant) => {
        const { byId, body } = await run([...fillers(), product({ n: 10611, applicant })]);
        expect(extraKeys(byId)).toEqual([compactName(applicant)]);
        expect(body.unreadable).toBe(0);
      },
    );

    describe("the variants of the terms", () => {
      /**
       * Dashes of the Pd category, each built from its code point: the hyphen-minus, the hyphen, the
       * non-breaking hyphen, the figure dash, the en dash, the em dash, the horizontal bar, the
       * two-em dash, the wave dash, the small em dash and the full-width hyphen-minus (a fold turns
       * the last two into other dashes) and the Armenian hyphen.
       */
      const DASHES: Array<[string, string]> = [
        ["a hyphen-minus", cp(0x2d)],
        ["a hyphen (U+2010)", cp(0x2010)],
        ["a non-breaking hyphen (U+2011)", cp(0x2011)],
        ["a figure dash (U+2012)", cp(0x2012)],
        ["an en dash (U+2013)", cp(0x2013)],
        ["an em dash (U+2014)", cp(0x2014)],
        ["a horizontal bar (U+2015)", cp(0x2015)],
        ["a two-em dash (U+2E3A)", cp(0x2e3a)],
        ["a wave dash (U+301C)", cp(0x301c)],
        ["a small em dash (U+FE58)", cp(0xfe58)],
        ["a full-width hyphen-minus (U+FF0D)", cp(0xff0d)],
        ["an Armenian hyphen (U+058A)", cp(0x58a)],
      ];
      /** The four terms that are two words: what stands before and after the separator. */
      const SPLIT_TERMS: Array<[string, string, string]> = [
        ["sole proprietor", "Sole", "Proprietor"],
        ["sole trader", "Sole", "Trader"],
        ["self employed", "Self", "Employed"],
        ["freelance", "Free", "Lance"],
      ];
      const E_ACUTE = cp(0xe9);
      const EN_DASH = cp(0x2013);

      it.each(
        DASHES.flatMap(([dashName, dash]) =>
          SPLIT_TERMS.map(([term, first, second]): [string, string] => [
            `${term} with ${dashName} between the words`,
            `Zibblesmith ${first}${dash}${second}`,
          ]),
        ),
      )(
        "drops the product of an applicant with %s: no record, and nothing counted",
        async (_name, applicant) => {
          const done = await run([...fillers(), product({ n: 10620, applicant })]);
          expect(extraKeys(done.byId)).toEqual([]);
          expect(done.body.unreadable).toBe(0);
          expect(done.body.rows).toHaveLength(100);
          expect(everythingOf(done)).not.toMatch(/zibblesmith/i);
        },
      );

      /** What may stand between the words of a term: up to three characters, each a blank or a dash, in any mix. */
      const MIXED_SEPARATORS: Array<[string, string]> = [
        ["a blank, a hyphen and a blank", " - "],
        ["a blank and a hyphen", " -"],
        ["a hyphen and a blank", "- "],
        ["two hyphens and a blank", "-- "],
        ["a blank and two hyphens", " --"],
        ["three hyphens", "---"],
        ["a blank, an en dash and a blank", ` ${EN_DASH} `],
        ["an em dash, a hyphen and an en dash", `${cp(0x2014)}-${EN_DASH}`],
        ["a hyphen and two blanks that a fold makes one", "-  "],
      ];
      /** What may not: more than three characters, and characters that are neither a blank nor a dash. */
      const OUT_OF_REACH_SEPARATORS: Array<[string, string]> = [
        ["a blank, two hyphens and a blank", " -- "],
        ["four hyphens", "----"],
        ["a blank, three dashes and a blank", ` ${EN_DASH}${EN_DASH}${EN_DASH} `],
        ["a minus sign (U+2212, which is no dash)", cp(0x2212)],
        ["a blank, a minus sign and a blank", ` ${cp(0x2212)} `],
        ["a hyphen, a letter and a hyphen", "-x-"],
      ];

      it.each(
        MIXED_SEPARATORS.flatMap(([mixName, separator]) =>
          SPLIT_TERMS.map(([term, first, second]): [string, string] => [
            `${term} with ${mixName} between the words`,
            `Zibblesmith ${first}${separator}${second}`,
          ]),
        ),
      )(
        "drops the product of an applicant with %s: no record, and nothing counted",
        async (_name, applicant) => {
          const done = await run([...fillers(), product({ n: 10630, applicant })]);
          expect(extraKeys(done.byId)).toEqual([]);
          expect(done.body.unreadable).toBe(0);
          expect(done.body.rows).toHaveLength(100);
          expect(everythingOf(done)).not.toMatch(/zibblesmith/i);
        },
      );

      it.each(OUT_OF_REACH_SEPARATORS)(
        "keeps the applicant whose words of a term are parted by %s: the residual of the bound",
        async (_name, separator) => {
          const applicants = SPLIT_TERMS.map(
            ([, first, second]) => `Zibblesmith ${first}${separator}${second}`,
          );
          const { byId, body } = await run([
            ...fillers(),
            ...applicants.map((applicant, at) => product({ n: 10640 + at, applicant })),
          ]);
          expect(extraKeys(byId)).toEqual(applicants.map(compactName).sort());
          expect(body.unreadable).toBe(0);
        },
      );

      it.each([
        ["sole proprietor with nothing between the words", "Zibblesmith Soleproprietor"],
        ["sole proprietorship with nothing between the words", "Zibblesmith Soleproprietorship"],
        ["sole proprietorship with a hyphen", "Zibblesmith Sole-Proprietorship"],
        ["sole trader with nothing between the words", "Zibblesmith Soletrader"],
        ["sole trader with a hyphen", "Zibblesmith sole-trader"],
        ["sole trader, hyphenated, in capitals", "ZIBBLESMITH SOLE-TRADER"],
        ["free lance with a blank", "Zibblesmith Free lance"],
        ["free-lance with a hyphen", "Zibblesmith Free-lance"],
        ["free-lancer with a hyphen", "Zibblesmith free-lancer"],
        ["self employed with an en dash", `Zibblesmith self${EN_DASH}employed`],
        [
          "a hidden character beside the dash of a term",
          `Zibblesmith Sole${ZERO}-${ZERO}Proprietor`,
        ],
        ["Einzelkauffrau, the female form", "Maxine Quillmann Einzelkauffrau"],
        ["Einzelkauffrau in capitals", "MAXINE QUILLMANN EINZELKAUFFRAU"],
        ["e.K. followed by a comma", "Zibblesmith e.K.,"],
        ["e.K. in brackets", "Zibblesmith (e.K.)"],
        ["e.K. followed by a blank and more words", "Zibblesmith e.K. Holding"],
        ["e. K. followed by a blank and more words", "Zibblesmith e. K. Holding"],
        ["e.Kfm. followed by a semicolon", "Zibblesmith e.Kfm.; Holding"],
        ["e.Kfr. followed by a hyphen", "Zibblesmith e.Kfr.-Holding"],
        ["e.K. in the middle of the name, after a blank", "Quillworks e.K. Holding Ltd"],
        ["e.K. at the start of the name", "e.K. Zibblesmith"],
        ["e.K. in capitals followed by a full stop", "ZIBBLESMITH E.K.."],
      ])(
        "drops the product of an applicant with %s: no record, and nothing counted",
        async (_name, applicant) => {
          const done = await run([...fillers(), product({ n: 10621, applicant })]);
          expect(extraKeys(done.byId)).toEqual([]);
          expect(done.body.unreadable).toBe(0);
          expect(done.body.rows).toHaveLength(100);
          expect(everythingOf(done)).not.toMatch(/zibblesmith|quillmann|quillworks/i);
        },
      );

      it("takes only a blank or a dash between the words, no other character: the reach of the rule is the same", async () => {
        const applicants = [
          "Zibblesmith Sole_Proprietor",
          "Zibblesmith Sole/Trader",
          "Zibblesmith Self.Employed",
        ];
        const { byId } = await run([
          ...fillers(),
          ...applicants.map((applicant, at) => product({ n: 10623 + at, applicant })),
        ]);
        expect(extraKeys(byId)).toEqual(applicants.map(compactName).sort());
      });

      it.each([
        "Zibblesmith e.K.Holding",
        "Zibblesmith e.K.2",
        "Zibblesmith e. K.Holding",
        "Zibblesmith e.Kfm.Holding",
        "Zibblesmith e.Kfr.2",
        `Zibblesmith e.K.${E_ACUTE}`,
      ])(
        "keeps the applicant %s: a letter or a digit after the e.K. makes it no word of its own",
        async (applicant) => {
          const { byId, body } = await run([...fillers(), product({ n: 10626, applicant })]);
          expect(extraKeys(byId)).toEqual([compactName(applicant)]);
          expect(body.unreadable).toBe(0);
        },
      );

      it.each([
        "Soleil Traders Ltd",
        "Freelandia Labs",
        "Einzelkaufhaus GmbH",
        "Self Employment Ltd",
        "Console Provider Ltd",
      ])("keeps the applicant %s, whose words are only like a term", async (applicant) => {
        const { byId, body } = await run([...fillers(), product({ n: 10627, applicant })]);
        expect(extraKeys(byId)).toEqual([compactName(applicant)]);
        expect(body.unreadable).toBe(0);
      });

      it.each([
        ["a hyphen in sole proprietor", "Quill Sole-Proprietor Holdings Ltd"],
        ["no blank in sole trader", "Quill Soletrader Holdings Ltd"],
        ["a hyphen in free lance", "Quill Free-lance Holdings Ltd"],
        ["a blank in free lance", "Quill Free lance Holdings Ltd"],
        ["an en dash in self employed", `Quill Self${EN_DASH}employed Holdings Ltd`],
        ["Einzelkauffrau", "Quill Einzelkauffrau Holdings"],
        ["an e.K. followed by a comma", "Quill Holdings e.K.,"],
        ["an e.K. in brackets", "Quill (e.K.) Holdings"],
        ["an e.K. in the middle", "Quill e.K. Holdings"],
      ])(
        "keeps the organisation of a product out of the names when it holds %s, and the product stays",
        async (_what, org) => {
          const { byId, body } = await run([
            ...fillers(),
            product({ n: 10628, applicant: "Quillworks Optical", org }),
          ]);
          expect(body.unreadable).toBe(0);
          expect(rowOf(body, "quillworksoptical")?.names).toEqual(["Quillworks Optical"]);
          expect(byId.get("quillworksoptical")?.matchKeys).toEqual(["name:quillworksoptical"]);
          expect(JSON.stringify(body)).not.toMatch(/holdings/i);
        },
      );
    });

    it("uses an organisation name that merely holds some letters of a term as a name", async () => {
      const { body } = await run([
        ...fillers(),
        product({ n: 10612, applicant: "Quillworks Optical", org: "Beker GmbH" }),
      ]);
      expect(rowOf(body, "quillworksoptical")?.names).toEqual(["Quillworks Optical", "Beker GmbH"]);
    });

    it("drops the product whatever else is wrong with it", async () => {
      const done = await run([
        ...fillers(),
        product({ n: 10601, applicant: "Zibblesmith Freelance", conformance: "not a day" }),
        product({ n: 10602, applicant: "Zibblesmith Freelance", status: 7 }),
      ]);
      expect(done.body.unreadable).toBe(0);
    });

    it("drops the product whatever the matter with its id: none, no UUID, or one that two products carry", async () => {
      const done = await run([
        ...fillers(),
        product({ n: 10608, applicant: "Zibblesmith Freelance", recordId: "not a uuid" }),
        product({ n: 10609, applicant: "Zibblesmith Freelance", omit: ["recordId"] }),
        product({ n: 10610, applicant: "Zibblesmith Freelance", recordId: uuid(10611) }),
        product({ n: 10611, applicant: "Zibblesmith Freelance" }),
      ]);
      expect(done.body.unreadable).toBe(0);
      expect(extraKeys(done.byId)).toEqual([]);
    });

    it("keeps the other products of an applicant whose name has no such term", async () => {
      const { byId, body } = await run([
        ...fillers(),
        product({ n: 10603, applicant: "Zibblesmith Freelance" }),
        product({ n: 10604, applicant: "Quillworks Optical" }),
      ]);
      expect(extraKeys(byId)).toEqual(["quillworksoptical"]);
      expect(body.unreadable).toBe(0);
    });

    it("keeps an organisation name that has such a term out of the names, and the product stays", async () => {
      const { byId, body } = await run([
        ...fillers(),
        product({ n: 10605, applicant: "Quillworks Optical", org: "Quill Freelance Holdings Ltd" }),
      ]);
      expect(byId.has("quillworksoptical")).toBe(true);
      expect(rowOf(body, "quillworksoptical")?.names).toEqual(["Quillworks Optical"]);
      expect(JSON.stringify(body)).not.toContain("Freelance");
      expect(byId.get("quillworksoptical")?.matchKeys.join(" ")).not.toContain("freelance");
    });

    describe("the terms of other languages, the abbreviations and the optional full stop", () => {
      const O_ACUTE = cp(0xf3);
      /** Every term of this group, as an applicant that holds it: the product is dropped whole. */
      const DROPPED: Array<[string, string]> = [
        ["e.U.", "Zibblesmith e.U."],
        ["e. U. with a blank", "Zibblesmith e. U."],
        ["e.U. in capitals", "ZIBBLESMITH E.U."],
        ["e.U. at the start", "e.U. Zibblesmith"],
        ["e.U. before a comma", "Zibblesmith e.U., Voorbeeldstadt"],
        ["e.U. in brackets", "Zibblesmith (e.U.)"],
        ["Einzelfirma", "Zibblesmith Einzelfirma"],
        ["Einzelfirma in capitals", "ZIBBLESMITH EINZELFIRMA"],
        ["Einzelfirma at the start", "Einzelfirma Zibblesmith"],
        ["eenmanszaak", "Zibblesmith eenmanszaak"],
        ["eenmanszaak in capitals", "ZIBBLESMITH EENMANSZAAK"],
        ["entreprise individuelle", "Zibblesmith Entreprise individuelle"],
        ["entreprise individuelle with a hyphen", "Zibblesmith Entreprise-individuelle"],
        ["entreprise individuelle in capitals", "ZIBBLESMITH ENTREPRISE INDIVIDUELLE"],
        ["EIRL", "Zibblesmith EIRL"],
        ["EIRL before a comma", "Zibblesmith EIRL, Voorbeeldstadt"],
        ["eirl in lower case", "Zibblesmith eirl"],
        ["auto-entrepreneur", "Zibblesmith Auto-entrepreneur"],
        ["auto entrepreneur with a blank", "Zibblesmith auto entrepreneur"],
        ["autoentrepreneur with nothing between", "Zibblesmith Autoentrepreneur"],
        ["auto-entrepreneur in capitals", "ZIBBLESMITH AUTO-ENTREPRENEUR"],
        ["micro-entrepreneur", "Zibblesmith Micro-entrepreneur"],
        ["micro entrepreneur with a blank", "Zibblesmith micro entrepreneur"],
        ["micro-entrepreneur in capitals", "ZIBBLESMITH MICRO-ENTREPRENEUR"],
        ["empresario individual", "Zibblesmith Empresario individual"],
        ["empresario individual in capitals", "ZIBBLESMITH EMPRESARIO INDIVIDUAL"],
        ["autonomo", "Zibblesmith Autonomo"],
        ["autonomo in capitals", "ZIBBLESMITH AUTONOMO"],
        ["autonomo with an acute accent", `Zibblesmith Aut${O_ACUTE}nomo`],
        ["autonomo with an acute accent in capitals", `ZIBBLESMITH AUT${cp(0xd3)}NOMO`],
        [
          "autonomo with a combining accent, which the fold composes",
          `Zibblesmith Auto${cp(0x301)}nomo`,
        ],
        ["ditta individuale", "Zibblesmith Ditta individuale"],
        ["ditta individuale in capitals", "ZIBBLESMITH DITTA INDIVIDUALE"],
        ["enskild firma", "Zibblesmith Enskild firma"],
        ["enskild firma in capitals", "ZIBBLESMITH ENSKILD FIRMA"],
        ["enkeltpersonforetak", "Zibblesmith Enkeltpersonforetak"],
        ["enkeltpersonforetak in capitals", "ZIBBLESMITH ENKELTPERSONFORETAK"],
        ["Sole Prop.", "Zibblesmith Sole Prop."],
        ["Sole Prop. in capitals", "ZIBBLESMITH SOLE PROP."],
        ["Sole-Prop. with a hyphen", "Zibblesmith Sole-Prop."],
        ["Sole Prop. before a comma", "Zibblesmith Sole Prop., Voorbeeldstadt"],
        ["Inh.", "Zibblesmith Inh. Quillmann"],
        ["Inh. in capitals", "ZIBBLESMITH INH. QUILLMANN"],
        ["Inh. at the end", "Zibblesmith Inh."],
        ["Inh. glued to the name that follows", "Zibblesmith Inh.Quillmann"],
        ["Inh. after a legal form", "Zibblesmith GmbH Inh. Quillmann"],
        ["e.K without its final full stop", "Zibblesmith e.K"],
        ["e.Kfm without its final full stop", "Zibblesmith e.Kfm"],
        ["e.Kfr without its final full stop", "Zibblesmith e.Kfr"],
        ["e. K with a blank, without its final full stop", "Zibblesmith e. K"],
        ["E.K in capitals, without its final full stop", "ZIBBLESMITH E.K"],
        ["e.K without its final full stop at the start", "e.K Zibblesmith"],
        ["e.K without its final full stop before a comma", "Zibblesmith e.K, Holding"],
        ["e.K without its final full stop before a hyphen", "Zibblesmith e.K-Holding"],
        ["e.K without its final full stop in brackets", "Zibblesmith (e.K)"],
        ["e.K without its final full stop before more words", "Zibblesmith e.K Holding"],
        ["e.Kfm without its final full stop before a semicolon", "Zibblesmith e.Kfm; Holding"],
      ];

      it.each(DROPPED)(
        "drops the product of an applicant with %s: no record, and nothing counted",
        async (_name, applicant) => {
          const done = await run([...fillers(), product({ n: 12200, applicant })]);
          expect(extraKeys(done.byId)).toEqual([]);
          expect(done.body.unreadable).toBe(0);
          expect(done.body.rows).toHaveLength(100);
          expect(everythingOf(done)).not.toMatch(/zibblesmith/i);
        },
      );

      it.each(
        DROPPED.map(([name, applicant]): [string, string] => [
          name,
          applicant.replace("Zibblesmith", "Quill Holdings"),
        ]),
      )(
        "keeps the organisation of a certificate with %s out of the names, and the product stays",
        async (_name, org) => {
          const { byId, body } = await run([
            ...fillers(),
            product({ n: 12201, applicant: "Quillworks Optical", org }),
          ]);
          expect(body.unreadable).toBe(0);
          expect(rowOf(body, "quillworksoptical")?.names).toEqual(["Quillworks Optical"]);
          expect(byId.get("quillworksoptical")?.matchKeys).toEqual(["name:quillworksoptical"]);
          expect(JSON.stringify(body)).not.toMatch(/holdings/i);
        },
      );

      /** The terms that are whole words: letters and digits may not touch them on either side. */
      const WHOLE_WORD_TERMS = [
        "Einzelfirma",
        "eenmanszaak",
        "Entreprise individuelle",
        "EIRL",
        "Auto-entrepreneur",
        "Micro-entrepreneur",
        "Empresario individual",
        "Autonomo",
        `Aut${O_ACUTE}nomo`,
        "Ditta individuale",
        "Enskild firma",
        "Enkeltpersonforetak",
      ];

      it.each(
        WHOLE_WORD_TERMS.flatMap((term): string[] => [
          `Zibblesmith Q${term} Optics`,
          `Zibblesmith ${term}Q Optics`,
          `Zibblesmith 7${term} Optics`,
          `Zibblesmith ${term}7 Optics`,
        ]),
      )(
        "keeps the applicant %s: a letter or a digit that touches the term makes it no word of its own",
        async (applicant) => {
          const { byId, body } = await run([...fillers(), product({ n: 12202, applicant })]);
          expect(extraKeys(byId)).toEqual([compactName(applicant)]);
          expect(body.unreadable).toBe(0);
        },
      );

      it.each([
        "Zibblesmith QInh. Optics",
        "Zibblesmith 7Inh. Optics",
        "Zibblesmith Inh Optics",
        "Zibblesmith QSole Prop. Optics",
        "Zibblesmith 7Sole Prop. Optics",
        "Zibblesmith Sole Prop Optics",
        "Zibblesmith Soleprop Optics",
        "Zibblesmith Qe.U. Optics",
        "Zibblesmith 7e.U. Optics",
        "Pike.U. Optics",
        "Zibblesmith e.U.Holding",
        "Zibblesmith e.U.2",
        `Zibblesmith e.U.${cp(0xe9)}`,
        "Zibblesmith e.Ux",
        "Zibblesmith e.K2",
        "Zibblesmith e.Kx",
        "Zibblesmith e.Kfmx",
        "Zibblesmith e.Kfm2",
        "Zibblesmith e.Kfrx",
        "Pike.K Optics",
        "Pike2e.K Optics",
      ])(
        "keeps the applicant %s: an abbreviation that is no word of its own",
        async (applicant) => {
          const { byId, body } = await run([...fillers(), product({ n: 12203, applicant })]);
          expect(extraKeys(byId)).toEqual([compactName(applicant)]);
          expect(body.unreadable).toBe(0);
        },
      );

      it.each([
        "Zibblesmith e.U",
        "Zibblesmith e.U Optics",
        "Zibblesmith e. U",
        "ZIBBLESMITH E.U",
        "e.U Zibblesmith",
        "Zibblesmith (e.U)",
      ])(
        "keeps the applicant %s: e.U is a term with its final full stop only, which is optional for e.K and not for it",
        async (applicant) => {
          const { byId, body } = await run([...fillers(), product({ n: 12203, applicant })]);
          expect(extraKeys(byId)).toEqual([compactName(applicant)]);
          expect(body.unreadable).toBe(0);
        },
      );

      it.each([
        "Autonomous Systems Ltd",
        "Zibblesmith Autonomous Vehicles",
        "Eirleen Optics",
        "Zibblesmith EIRLs Optics",
        "Einzelfirmaxis Labs",
        "Zibblesmith Eenmanszaakx",
        "Zibblesmith Ditta individualexx",
        "Zibblesmith Enskilda firmax",
        "Zibblesmith Inhaber Optics",
        "Zibblesmith Sole Property Optics",
        "Zibblesmith Entreprises individuelles",
        "Zibblesmith Autoentreprise",
      ])("keeps the applicant %s, whose name is only like a term", async (applicant) => {
        const { byId, body } = await run([...fillers(), product({ n: 12204, applicant })]);
        expect(extraKeys(byId)).toEqual([compactName(applicant)]);
        expect(body.unreadable).toBe(0);
      });

      it("takes only a blank or a dash between the words of a term of two words, as it does for the others", async () => {
        const applicants = [
          "Zibblesmith Entreprise_individuelle",
          "Zibblesmith Ditta/individuale",
          "Zibblesmith Enskild.firma",
          "Zibblesmith Auto----entrepreneur",
          "Zibblesmith Sole----Prop.",
        ];
        const { byId } = await run([
          ...fillers(),
          ...applicants.map((applicant, at) => product({ n: 12205 + at, applicant })),
        ]);
        expect(extraKeys(byId)).toEqual(applicants.map(compactName).sort());
      });

      it("drops the applicant that holds one of the new terms in a part of its name, wherever it stands", async () => {
        const applicants = [
          "Quillworks Optical Einzelfirma",
          "Einzelfirma Quillworks Optical",
          "Quillworks (EIRL) Optical",
          "Quillworks Optical - Inh. Zibblesmith",
          "Quillworks Optical, Autonomo",
        ];
        const done = await run([
          ...fillers(),
          ...applicants.map((applicant, at) => product({ n: 12210 + at, applicant })),
        ]);
        expect(extraKeys(done.byId)).toEqual([]);
        expect(done.body.unreadable).toBe(0);
        expect(everythingOf(done)).not.toMatch(/quillworks|zibblesmith/i);
      });
    });
  });

  describe("a person who trades under a business name", () => {
    const PERSON = "Casey Zibblesmith";
    const BUSINESS = "Zorbwerk Optical";
    const ID = "zorbwerkoptical";
    /** What names the person: not a letter of it may be in a body or a record. */
    const PERSON_TEXT = /casey|zibblesmith/i;

    const MARKS = ["dba", "d/b/a", "doing business as", "t/a", "trading as"];

    it.each(
      MARKS.flatMap((mark): Array<[string, string]> => [
        [`${mark} after a comma`, `${PERSON}, ${mark} ${BUSINESS}`],
        [`${mark} after a blank`, `${PERSON} ${mark} ${BUSINESS}`],
      ]),
    )(
      "makes the business the applicant for the shape %s: the person is in no id, key, name, title, text or row",
      async (_name, applicant) => {
        const done = await run([...fillers(), product({ n: 12300, applicant })]);
        expect(extraKeys(done.byId)).toEqual([ID]);
        const record = done.byId.get(ID);
        expect(record?.title).toBe(`${MARK}: ${BUSINESS}`);
        expect(record?.matchKeys).toEqual([`name:${ID}`]);
        expect(record?.identifiers).toMatchObject({ applicant: BUSINESS, conformant: 1 });
        expect(record?.summary).toContain(
          `Applicant as written: ${BUSINESS}. Conformant products: 1`,
        );
        expect(rowOf(done.body, ID)?.names).toEqual([BUSINESS]);
        expect(done.body.unreadable).toBe(0);
        expect(done.body.rows).toHaveLength(101);
        expect(everythingOf(done)).not.toMatch(PERSON_TEXT);
      },
    );

    it.each([
      ["capitals", `${PERSON}, DBA ${BUSINESS}`],
      ["d/b/a in capitals", `${PERSON}, D/B/A ${BUSINESS}`],
      ["doing business as in capitals", `${PERSON} DOING BUSINESS AS ${BUSINESS}`],
      ["doing business as in mixed case", `${PERSON} Doing Business As ${BUSINESS}`],
      ["t/a in capitals", `${PERSON} T/A ${BUSINESS}`],
      ["trading as in capitals", `${PERSON}, TRADING AS ${BUSINESS}`],
      ["no blank after the comma", `${PERSON},dba ${BUSINESS}`],
      ["no blank after the comma, d/b/a", `${PERSON},d/b/a ${BUSINESS}`],
      ["no blank after the comma, t/a", `${PERSON},t/a ${BUSINESS}`],
      ["no blank after the comma, trading as", `${PERSON},trading as ${BUSINESS}`],
      ["no blank after the comma, doing business as", `${PERSON},doing business as ${BUSINESS}`],
      ["a blank run inside the phrase", `${PERSON} doing   business   as ${BUSINESS}`],
      ["a blank run inside trading as", `${PERSON} trading    as ${BUSINESS}`],
      [
        "a tab and a no-break blank inside the phrase",
        `${PERSON}${String.fromCharCode(9)}trading${String.fromCharCode(0xa0)}as ${BUSINESS}`,
      ],
      ["full-width letters and blanks", fullWidth(`${PERSON}, dba ${BUSINESS}`)],
      ["a hidden character inside the mark", `${PERSON}, d${ZERO}ba ${BUSINESS}`],
      [
        "a hidden character inside doing business as",
        `${PERSON} doing${ZERO} business as ${BUSINESS}`,
      ],
      ["blanks around the business", `${PERSON}, dba    ${BUSINESS}   `],
    ])("reads the mark as the cleaning of its cell leaves it: %s", async (_name, applicant) => {
      const done = await run([...fillers(), product({ n: 12301, applicant })]);
      expect(extraKeys(done.byId)).toEqual([ID]);
      expect(done.byId.get(ID)?.title).toBe(`${MARK}: ${BUSINESS}`);
      expect(everythingOf(done)).not.toMatch(PERSON_TEXT);
    });

    it("gives the record in full, as the one real applicant of this shape reads: the applicant, the certificate and the keys", async () => {
      const done = await run([
        ...fillers(),
        product({
          n: 12302,
          applicant: `${PERSON}, dba ${BUSINESS}`,
          org: `${PERSON} dba ${BUSINESS}`,
          cn: "Zorb Lens",
          conformance: "2025-08-01",
          modified: "2025-09-10",
        }),
      ]);
      expect(done.byId.get(ID)).toEqual({
        sourceRecordId: ID,
        recordType: "c2pa_conformance",
        title: `${MARK}: ${BUSINESS}`,
        summary: [
          S1,
          S2,
          `Applicant as written: ${BUSINESS}.`,
          "Conformant products: 1 (1 generator, 0 validator), the newest conformed on 2025-08-01.",
          "Products: Zorb Lens.",
          S6,
        ].join(" "),
        url: `${PAGE_URL}${ID}`,
        identifiers: {
          applicant: BUSINESS,
          conformant: 1,
          newestConformance: "2025-08-01",
          recordIds: [uuid(12302)],
        },
        matchKeys: [`name:${ID}`],
        publishedAt: "2025-08-01",
        sourceUpdatedAt: null,
      });
      expect(rowOf(done.body, ID)).toMatchObject({ display: BUSINESS, names: [BUSINESS] });
      expect(everythingOf(done)).not.toMatch(PERSON_TEXT);
    });

    it.each([
      ["a legal form with a comma", "Zibblesmith Inc., dba Zorbwerk Optical"],
      ["a legal form without a dot", "Casey Zibblesmith LLC dba Zorbwerk Optical"],
      ["a dotted legal form", "Zibblesmith S.p.A. d/b/a Zorbwerk Optical"],
      ["a legal form of another country", "Zibblesmith GmbH t/a Zorbwerk Optical"],
      ["a legal form in capitals", "ZIBBLESMITH LTD TRADING AS Zorbwerk Optical"],
      ["a legal form in brackets", "Zibblesmith (Ltd) doing business as Zorbwerk Optical"],
      [
        "a legal form with dots that the list holds only without them, L.L.P.",
        "Zibblesmith L.L.P. dba Zorbwerk Optical",
      ],
      [
        "a legal form with dots that the list holds only without them, P.L.C.",
        "Zibblesmith P.L.C., dba Zorbwerk Optical",
      ],
      [
        "a legal form with dots that the list holds only without them, A.G.",
        "Zibblesmith A.G. trading as Zorbwerk Optical",
      ],
      ["an organisation word", "Zibblesmith Labs, dba Zorbwerk Optical"],
      ["an organisation word in brackets", "Zibblesmith (Software), dba Zorbwerk Optical"],
      ["an organisation word in capitals", "ZIBBLESMITH STUDIOS DBA Zorbwerk Optical"],
      ["a legal form after the first word only", "Casey Zibblesmith Holdings dba Zorbwerk Optical"],
    ])(
      "reads the applicant with %s before the mark as it is read without a rule of marks: whole",
      async (_name, applicant) => {
        const done = await run([...fillers(), product({ n: 12310, applicant })]);
        expect(extraKeys(done.byId)).toEqual([compactName(applicant)]);
        expect(rowOf(done.body, compactName(applicant))?.names).toEqual([applicant]);
        expect(done.byId.get(compactName(applicant))?.identifiers).toMatchObject({ applicant });
        expect(done.body.unreadable).toBe(0);
        expect(done.byId.has(ID)).toBe(false);
      },
    );

    it.each([
      ["a particle", "Casey de Zibblesmith, dba Zorbwerk Optical"],
      [
        "a Spanish article, a word of the kit's list of organisation words",
        "Casey la Zibblesmith dba Zorbwerk Optical",
      ],
      ["the word and", "Casey and Zibblesmith dba Zorbwerk Optical"],
      ["an ampersand", "Casey & Zibblesmith, dba Zorbwerk Optical"],
      ["the word of", "Casey Zibblesmith of Quillmann t/a Zorbwerk Optical"],
      ["the word the", "The Casey Zibblesmith trading as Zorbwerk Optical"],
    ])(
      "cuts the person before the mark when the part holds %s: it joins names, and names no organisation",
      async (_name, applicant) => {
        const done = await run([...fillers(), product({ n: 12311, applicant })]);
        expect(extraKeys(done.byId)).toEqual([ID]);
        expect(everythingOf(done)).not.toMatch(PERSON_TEXT);
      },
    );

    it("keeps the legal form and the organisation words of the business that follows the mark", async () => {
      const done = await run([
        ...fillers(),
        product({ n: 12320, applicant: `${PERSON}, dba Zorbwerk Studios Inc.` }),
      ]);
      expect(extraKeys(done.byId)).toEqual(["zorbwerkstudiosinc"]);
      expect(done.byId.get("zorbwerkstudiosinc")?.matchKeys).toEqual([
        "name:zorbwerkstudiosinc",
        "name:zorbwerkstudios",
      ]);
      expect(done.byId.get("zorbwerkstudiosinc")?.identifiers).toMatchObject({
        applicant: "Zorbwerk Studios Inc.",
      });
      expect(everythingOf(done)).not.toMatch(PERSON_TEXT);
    });

    it.each([
      ["nothing", `${PERSON}, dba`],
      ["nothing, d/b/a", `${PERSON} d/b/a`],
      ["nothing, doing business as", `${PERSON} doing business as`],
      ["nothing, t/a", `${PERSON} t/a`],
      ["nothing, trading as", `${PERSON}, trading as`],
      ["blanks", `${PERSON}, dba    `],
      ["punctuation", `${PERSON} d/b/a !!! ...`],
      ["hidden characters", `${PERSON} t/a ${ZERO}${ZERO}`],
    ])(
      "drops the product of an applicant that has %s after the mark: the business of a person, counted nowhere",
      async (_name, applicant) => {
        const done = await run([...fillers(), product({ n: 12330, applicant })]);
        expect(extraKeys(done.byId)).toEqual([]);
        expect(done.body.unreadable).toBe(0);
        expect(done.body.rows).toHaveLength(100);
        expect(everythingOf(done)).not.toMatch(PERSON_TEXT);
      },
    );

    it("drops the product that has nothing after the mark whatever else is wrong with it, as the other persons' businesses", async () => {
      const done = await run([
        ...fillers(),
        product({ n: 12331, applicant: `${PERSON}, dba`, conformance: "not a day" }),
        product({ n: 12332, applicant: `${PERSON}, dba`, status: 7 }),
        product({ n: 12333, applicant: `${PERSON}, dba`, recordId: "not a uuid" }),
      ]);
      expect(done.body.unreadable).toBe(0);
      expect(extraKeys(done.byId)).toEqual([]);
    });

    it.each([
      ["a mark that begins the name", "DBA Zorbwerk Optical"],
      ["t/a at the start of the name", "T/A Zorbwerk Optical"],
      ["a mark inside a word", "Zibblesmith Quodba Optical"],
      ["a word that begins like a mark", "Zibblesmith dbas Optical"],
      ["a word that ends like a mark", "Zibblesmith Adba Optical"],
      ["trading assets", "Zibblesmith trading assets Optical"],
      ["doing business assets", "Zibblesmith doing business assets Optical"],
      ["a t/a inside a word", "Zibblesmith Art/a Optical"],
      ["a t/a followed by a letter", "Zibblesmith t/ab Optical"],
      ["the words doing and business apart", "Zibblesmith doing good business as Optical"],
    ])("keeps the applicant with %s whole: there is no mark in it", async (_name, applicant) => {
      const done = await run([...fillers(), product({ n: 12340, applicant })]);
      expect(extraKeys(done.byId)).toEqual([compactName(applicant)]);
      expect(done.body.unreadable).toBe(0);
    });

    it.each([
      ["a comma", ", dba Zorbwerk Optical"],
      ["a dash", "- t/a Zorbwerk Optical"],
      ["full stops", "... trading as Zorbwerk Optical"],
      ["brackets and a mark of punctuation", "(!) d/b/a Zorbwerk Optical"],
      ["a slash", "/ doing business as Zorbwerk Optical"],
      ["a hidden character", `${ZERO} dba Zorbwerk Optical`],
    ])(
      "keeps the applicant with only %s before the mark whole: there is no part before the mark to cut, and no person in it",
      async (_name, applicant) => {
        const done = await run([...fillers(), product({ n: 12342, applicant })]);
        expect(extraKeys(done.byId)).toEqual([compactName(applicant)]);
        expect(done.byId.has(ID)).toBe(false);
        expect(done.body.unreadable).toBe(0);
      },
    );

    it.each([
      ["digits", "2024 dba Zorbwerk Optical"],
      ["a digit and a mark of punctuation", "7, trading as Zorbwerk Optical"],
      ["a number with a letter", "24b t/a Zorbwerk Optical"],
    ])(
      "cuts the part before the mark that holds %s: it holds something that can be read, and no organisation",
      async (_name, applicant) => {
        const done = await run([...fillers(), product({ n: 12343, applicant })]);
        expect(extraKeys(done.byId)).toEqual([ID]);
        expect(done.body.unreadable).toBe(0);
      },
    );

    it.each([
      ["dba with a colon", "Casey Zibblesmith, dba: Zorbwerk Optical"],
      ["dba with a full stop", "Casey Zibblesmith dba. Zorbwerk Optical"],
      ["dba with a comma", "Casey Zibblesmith dba, Zorbwerk Optical"],
      ["trading as with a colon", "Casey Zibblesmith trading as: Zorbwerk Optical"],
      ["d.b.a. with dots", "Casey Zibblesmith d.b.a. Zorbwerk Optical"],
      ["a mark inside brackets", "Casey Zibblesmith (dba Zorbwerk Optical)"],
    ])(
      "keeps the applicant with %s whole: the shapes that the rule does not name stay as they were, and the person with them",
      async (_name, applicant) => {
        const done = await run([...fillers(), product({ n: 12341, applicant })]);
        expect(extraKeys(done.byId)).toEqual([compactName(applicant)]);
        expect(done.byId.has(ID)).toBe(false);
      },
    );

    it.each([
      ["dba, then trading as", `${PERSON} dba Voorbeeld Quillmann trading as ${BUSINESS}`],
      ["t/a, then d/b/a", `${PERSON} t/a Voorbeeld Quillmann d/b/a ${BUSINESS}`],
      [
        "three marks, with commas",
        `${PERSON}, dba Voorbeeld Quill, doing business as Quill Voor, t/a ${BUSINESS}`,
      ],
    ])(
      "cuts every person that the marks of a chain set apart, and keeps the last business: %s",
      async (_name, applicant) => {
        const done = await run([...fillers(), product({ n: 12350, applicant })]);
        expect(extraKeys(done.byId)).toEqual([ID]);
        expect(everythingOf(done)).not.toMatch(/casey|zibblesmith|voorbeeld|quill|voor/i);
      },
    );

    it.each([
      [
        "an organisation word before the second mark",
        `${PERSON} dba Quark Labs t/a ${BUSINESS}`,
        `Quark Labs t/a ${BUSINESS}`,
      ],
      [
        "a legal form before the second mark",
        `${PERSON} dba Voorbeeld Quillmann Ltd t/a ${BUSINESS}`,
        `Voorbeeld Quillmann Ltd t/a ${BUSINESS}`,
      ],
    ])(
      "keeps the first part that holds an organisation, and the marks that follow it: %s",
      async (_name, applicant, kept) => {
        const done = await run([...fillers(), product({ n: 12351, applicant })]);
        expect(extraKeys(done.byId)).toEqual([compactName(kept)]);
        expect(rowOf(done.body, compactName(kept))?.names).toEqual([kept]);
        expect(everythingOf(done)).not.toMatch(PERSON_TEXT);
      },
    );

    it.each([
      ["a mark that ends the name", `${PERSON} dba Voorbeeld Quillmann t/a`],
      ["two marks and nothing else", `${PERSON} dba Voorbeeld Quillmann, trading as !!!`],
    ])(
      "drops the applicant whose last mark of a chain has nothing readable after it: %s",
      async (_name, applicant) => {
        const done = await run([...fillers(), product({ n: 12352, applicant })]);
        expect(extraKeys(done.byId)).toEqual([]);
        expect(done.body.unreadable).toBe(0);
      },
    );

    it.each([
      ["sole proprietor", `${PERSON} Sole Proprietor, dba ${BUSINESS}`],
      ["e.K. with its full stop", `${PERSON} e.K., dba ${BUSINESS}`],
      ["e.K without its full stop", `${PERSON} e.K d/b/a ${BUSINESS}`],
      ["Einzelfirma", `${PERSON} Einzelfirma t/a ${BUSINESS}`],
      ["a freelancer in brackets", `${PERSON} (freelancer) trading as ${BUSINESS}`],
      ["a term in the part of a person of a chain", `${PERSON} dba Voorbeeld e.U. t/a ${BUSINESS}`],
    ])(
      "drops the applicant that holds %s in the part before the mark, whole: rule A reads the cell before a mark cuts anything",
      async (_name, applicant) => {
        const done = await run([...fillers(), product({ n: 12360, applicant })]);
        expect(extraKeys(done.byId)).toEqual([]);
        expect(done.body.unreadable).toBe(0);
        expect(everythingOf(done)).not.toMatch(/casey|zibblesmith|zorbwerk/i);
      },
    );

    it.each([
      ["freelance", `${PERSON}, dba Zorbwerk Freelance Optical`],
      ["e.K. with its full stop", `${PERSON}, dba ${BUSINESS} e.K.`],
      ["Einzelfirma", `${PERSON}, dba ${BUSINESS} Einzelfirma`],
    ])(
      "drops the applicant that holds %s in the business after the mark: it is not renamed",
      async (_name, applicant) => {
        const done = await run([...fillers(), product({ n: 12361, applicant })]);
        expect(extraKeys(done.byId)).toEqual([]);
        expect(done.body.unreadable).toBe(0);
        expect(everythingOf(done)).not.toMatch(/casey|zibblesmith|zorbwerk/i);
      },
    );

    it("does not rename a product that is wrong in another way, and does not count it as a person's business", async () => {
      const { byId, body } = await run([
        ...fillers(),
        product({ n: 12365, applicant: `${PERSON}, dba ${BUSINESS}`, conformance: "not a day" }),
        product({ n: 12366, applicant: `${PERSON}, dba ${BUSINESS}`, status: "revoked" }),
      ]);
      expect(body.unreadable).toBe(1);
      expect(byId.has(ID)).toBe(false);
      expect(rowOf(body, ID)).toBeUndefined();
    });

    it("makes one record of the business that two spellings of the applicant name, whatever the order of the file", async () => {
      const items = [
        product({ n: 12370, applicant: `${PERSON}, dba ${BUSINESS}`, cn: "Zorb One" }),
        product({ n: 12371, applicant: BUSINESS, cn: "Zorb Two" }),
        product({ n: 12372, applicant: BUSINESS.toUpperCase(), cn: "Zorb Three" }),
        product({ n: 12373, applicant: `${PERSON} t/a ${BUSINESS}`, cn: "Zorb Four" }),
      ];
      for (const order of [items, [...items].reverse()]) {
        const done = await run([...fillers(), ...order]);
        expect(extraKeys(done.byId)).toEqual([ID]);
        expect(done.byId.get(ID)?.identifiers).toMatchObject({
          conformant: 4,
          applicant: BUSINESS,
        });
        expect(rowOf(done.body, ID)?.names).toEqual([BUSINESS, BUSINESS.toUpperCase()]);
        expect(everythingOf(done)).not.toMatch(PERSON_TEXT);
      }
    });

    it("makes one record of two persons who trade under one business name, and a record apart of each business", async () => {
      const done = await run([
        ...fillers(),
        product({ n: 12380, applicant: `${PERSON}, dba ${BUSINESS}` }),
        product({ n: 12381, applicant: "Voorbeeld Quillmann, dba Zorbwerk Optical" }),
        product({ n: 12382, applicant: "Voorbeeld Quillmann, dba Quarkwerk Optical" }),
      ]);
      expect(extraKeys(done.byId)).toEqual(["quarkwerkoptical", ID]);
      expect(done.byId.get(ID)?.identifiers).toMatchObject({ conformant: 2 });
      expect(everythingOf(done)).not.toMatch(/casey|zibblesmith|voorbeeld|quillmann/i);
    });

    it("checks the length of the whole cell, not of the business: 100 characters are read, and 101 are unreadable", async () => {
      const filler = (length: number): string => `Q${"u".repeat(length - 1)}`;
      const business = "Zorbwerk Optical";
      const written = (length: number): string =>
        `${filler(length - business.length - 6)}, dba ${business}`;
      expect(written(100)).toHaveLength(100);
      expect(written(101)).toHaveLength(101);
      const ok = await run([...fillers(), product({ n: 12390, applicant: written(100) })]);
      expect(ok.body.unreadable).toBe(0);
      expect(extraKeys(ok.byId)).toEqual([ID]);
      const over = await run([...fillers(), product({ n: 12391, applicant: written(101) })]);
      expect(over.body.unreadable).toBe(1);
      expect(extraKeys(over.byId)).toEqual([]);
    });

    it("keeps a record whose business is too short to be a name key, with no key of it", async () => {
      const done = await run([
        ...fillers(),
        product({ n: 12395, applicant: `${PERSON}, dba Qux` }),
      ]);
      expect(done.byId.get("qux")?.matchKeys).toEqual([]);
      expect(everythingOf(done)).not.toMatch(PERSON_TEXT);
    });

    describe("the organisation of the certificate (DN.O)", () => {
      const record = async (org: unknown) =>
        run([...fillers(), product({ n: 12400, applicant: BUSINESS, org })]);

      it("takes the business of a certificate that is the applicant's own text, with the comma or without it, as no second name", async () => {
        for (const org of [
          `${PERSON}, dba ${BUSINESS}`,
          `${PERSON} dba ${BUSINESS}`,
          `${PERSON} t/a ${BUSINESS}`,
        ]) {
          const done = await record(org);
          expect(rowOf(done.body, ID)?.names).toEqual([BUSINESS]);
          expect(done.byId.get(ID)?.matchKeys).toEqual([`name:${ID}`]);
          expect(everythingOf(done)).not.toMatch(PERSON_TEXT);
        }
      });

      it("takes the business of a certificate as a second name when it is another business, and never its person", async () => {
        const done = await record(`${PERSON}, dba Quarkwerk Holdings`);
        expect(rowOf(done.body, ID)?.names).toEqual([BUSINESS, "Quarkwerk Holdings"]);
        expect([...(done.byId.get(ID)?.matchKeys ?? [])].sort()).toEqual([
          "name:quarkwerkholdings",
          `name:${ID}`,
        ]);
        expect(everythingOf(done)).not.toMatch(PERSON_TEXT);
      });

      it.each([
        ["a mark that ends the text", `${PERSON}, dba`],
        ["punctuation after the mark", `${PERSON} t/a !!!`],
        ["trading as and nothing else", `${PERSON} trading as`],
        ["a chain that ends in a mark", `${PERSON} dba Voorbeeld Quillmann d/b/a`],
      ])(
        "takes no second name from a certificate that has nothing after the mark: %s",
        async (_name, org) => {
          const done = await record(org);
          expect(rowOf(done.body, ID)?.names).toEqual([BUSINESS]);
          expect(done.byId.get(ID)?.matchKeys).toEqual([`name:${ID}`]);
          expect(everythingOf(done)).not.toMatch(/casey|zibblesmith|voorbeeld|quillmann/i);
        },
      );

      it("takes a certificate that holds a legal form before the mark as it is, whole", async () => {
        const done = await record("Zibblesmith Inc., dba Quarkwerk Holdings");
        expect(rowOf(done.body, ID)?.names).toEqual([
          BUSINESS,
          "Zibblesmith Inc., dba Quarkwerk Holdings",
        ]);
      });

      it("cuts the person out of a certificate whose applicant is a person's business too, so that the two are one name", async () => {
        const done = await run([
          ...fillers(),
          product({
            n: 12401,
            applicant: `${PERSON}, dba ${BUSINESS}`,
            org: `Voorbeeld Quillmann, dba ${BUSINESS}`,
          }),
        ]);
        expect(rowOf(done.body, ID)?.names).toEqual([BUSINESS]);
        expect(everythingOf(done)).not.toMatch(/casey|zibblesmith|voorbeeld|quillmann/i);
      });

      it("keeps the certificate of an applicant whose name holds a term of rule A out of the names, as before", async () => {
        const done = await record(`${PERSON}, dba Quarkwerk Freelance`);
        expect(rowOf(done.body, ID)?.names).toEqual([BUSINESS]);
        expect(everythingOf(done)).not.toMatch(/casey|zibblesmith|quarkwerk/i);
      });
    });
  });

  describe("the organisation of the certificate (DN.O)", () => {
    it("adds a second name key when it differs from the applicant, and never shows it in the text", async () => {
      const { byId, body } = await run([
        ...fillers(),
        product({ n: 10700, applicant: "Quillworks Optical", org: "Quill Holdings Limited" }),
      ]);
      const record = byId.get("quillworksoptical");
      expect([...(record?.matchKeys ?? [])].sort()).toEqual([
        "name:quillholdings",
        "name:quillholdingslimited",
        "name:quillworksoptical",
      ]);
      expect(rowOf(body, "quillworksoptical")?.names).toEqual([
        "Quillworks Optical",
        "Quill Holdings Limited",
      ]);
      const text = `${record?.title} ${record?.summary} ${JSON.stringify(record?.identifiers)}`;
      expect(text).not.toContain("Quill Holdings");
    });

    it("adds nothing when it is the applicant in another spelling", async () => {
      const { byId, body } = await run([
        ...fillers(),
        product({ n: 10710, applicant: "Quillworks Optical", org: "QUILLWORKS OPTICAL" }),
        product({ n: 10711, applicant: "Quillworks Optical", org: "Quillworks-Optical" }),
      ]);
      expect(byId.get("quillworksoptical")?.matchKeys).toEqual(["name:quillworksoptical"]);
      expect(rowOf(body, "quillworksoptical")?.names).toEqual(["Quillworks Optical"]);
    });

    it.each<[string, Over]>([
      ["absent", { omit: ["O"] }],
      ["no text", { org: 7 }],
      ["empty", { org: "" }],
      ["blank", { org: "   " }],
      ["too short to be a key", { org: "Qux" }],
    ])("adds nothing when it is %s, and the product is still read", async (_name, over) => {
      const { byId, body } = await run([
        ...fillers(),
        product({ n: 10720, applicant: "Quillworks Optical", ...over }),
      ]);
      expect(body.unreadable).toBe(0);
      expect(rowOf(body, "quillworksoptical")?.names).toEqual(["Quillworks Optical"]);
      expect(byId.get("quillworksoptical")?.matchKeys).toEqual(["name:quillworksoptical"]);
    });

    it("is not used when it is longer than 100 characters, and the product stays", async () => {
      const { byId, body } = await run([
        ...fillers(),
        product({
          n: 10730,
          applicant: "Quillworks Optical",
          org: `Quill ${"Holdings ".repeat(20)}`,
        }),
      ]);
      expect(body.unreadable).toBe(0);
      expect(byId.get("quillworksoptical")?.matchKeys).toEqual(["name:quillworksoptical"]);
      expect(JSON.stringify(body)).not.toContain("Holdings");
    });

    it("is a name of four letters and digits, however it is punctuated, and not one of three", async () => {
      const four = await run([
        ...fillers(),
        product({ n: 10770, applicant: "Quillworks Optical", org: "Q.u.i.l" }),
      ]);
      expect(rowOf(four.body, "quillworksoptical")?.names).toEqual([
        "Quillworks Optical",
        "Q.u.i.l",
      ]);
      expect([...(four.byId.get("quillworksoptical")?.matchKeys ?? [])].sort()).toEqual([
        "name:quil",
        "name:quillworksoptical",
      ]);
      const three = await run([
        ...fillers(),
        product({ n: 10771, applicant: "Quillworks Optical", org: "Q.u.x" }),
      ]);
      expect(rowOf(three.body, "quillworksoptical")?.names).toEqual(["Quillworks Optical"]);
      expect(three.byId.get("quillworksoptical")?.matchKeys).toEqual(["name:quillworksoptical"]);
    });

    it("is used at 100 characters, and at 101 it is left out while the product stays", async () => {
      const hundred = `Q${"u".repeat(99)}`;
      const over = `Q${"u".repeat(100)}`;
      const ok = await run([
        ...fillers(),
        product({ n: 10780, applicant: "Quillworks Optical", org: hundred }),
      ]);
      expect(ok.body.unreadable).toBe(0);
      expect(rowOf(ok.body, "quillworksoptical")?.names).toEqual(["Quillworks Optical", hundred]);
      expect(ok.byId.get("quillworksoptical")?.matchKeys).toContain(`name:${compactName(hundred)}`);
      const bad = await run([
        ...fillers(),
        product({ n: 10781, applicant: "Quillworks Optical", org: over }),
      ]);
      expect(bad.body.unreadable).toBe(0);
      expect(bad.byId.has("quillworksoptical")).toBe(true);
      expect(rowOf(bad.body, "quillworksoptical")?.names).toEqual(["Quillworks Optical"]);
      expect(JSON.stringify(bad.body)).not.toContain("uuuuu");
    });

    it("is read from a product that is conformant, and from no other", async () => {
      const { byId } = await run([
        ...fillers(),
        product({ n: 10740, applicant: "Quillworks Optical" }),
        product({
          n: 10741,
          applicant: "Quillworks Optical",
          status: "revoked",
          org: "Quill Holdings Limited",
        }),
      ]);
      expect(byId.get("quillworksoptical")?.matchKeys).toEqual(["name:quillworksoptical"]);
    });

    it("gives at most two, the most frequent first, one for each key", async () => {
      const orgs: Array<[string, number]> = [
        ["Quill Org One Ltd", 3],
        ["Quill Org Two Ltd", 2],
        ["Quill Org Three Ltd", 1],
        ["QUILL ORG TWO LTD", 1],
      ];
      let n = 10750;
      const items = orgs.flatMap(([org, times]) =>
        Array.from({ length: times }, () =>
          product({ n: (n += 1), applicant: "Quillworks Optical", org }),
        ),
      );
      for (const order of [items, [...items].reverse()]) {
        const { body } = await run([...fillers(), ...order]);
        expect(rowOf(body, "quillworksoptical")?.names).toEqual([
          "Quillworks Optical",
          "Quill Org One Ltd",
          "Quill Org Two Ltd",
        ]);
      }
    });

    it("gives with the spellings of the applicant five names at most", async () => {
      const spellings = ["Quillworks Inc", "QUILLWORKS INC", "quillworks inc", "Quillworks, Inc."];
      const orgs = ["Quill Org A Ltd", "Quill Org B Ltd", "Quill Org C Ltd"];
      let n = 10760;
      const items = spellings.flatMap((applicant) =>
        orgs.map((org) => product({ n: (n += 1), applicant, org })),
      );
      const { body } = await run([...fillers(), ...items]);
      const names = rowOf(body, "quillworksinc")?.names as string[];
      expect(names).toHaveLength(5);
      expect(names.slice(0, 3)).toEqual(["QUILLWORKS INC", "Quillworks Inc", "Quillworks, Inc."]);
    });
  });

  describe("the address of the product's own page (infoURL)", () => {
    it("is never stored, never a key, and gives no domain", async () => {
      const done = await run([...fillers(), ...zibble()]);
      const everything = everythingOf(done);
      expect(everything).not.toContain("zzinfo");
      expect(everything).not.toContain("infoURL");
      for (const record of done.result.records) {
        expect(record.matchKeys.some((key) => key.startsWith("domain:"))).toBe(false);
      }
    });
  });

  describe("the day of a product", () => {
    it.each([
      ["a day that exists", "2025-08-01", "2025-08-01"],
      ["a day with blanks around it", " 2025-08-01 ", "2025-08-01"],
      ["the last day of a leap year", "2024-12-31", "2024-12-31"],
      ["the day that a leap year adds", "2024-02-29", "2024-02-29"],
    ])("reads %s as the day of the conformance", async (_name, written, day) => {
      const { byId, body } = await run([
        ...fillers(),
        product({ n: 10800, applicant: "Quillworks Optical", conformance: written }),
      ]);
      expect(body.unreadable).toBe(0);
      expect(byId.get("quillworksoptical")?.publishedAt).toBe(day);
    });

    it.each<[string, Over]>([
      ["a month above 12", { conformance: "2025-13-01" }],
      ["a day that no month has", { conformance: "2025-02-30" }],
      ["the day a common year does not have", { conformance: "2025-02-29" }],
      ["a month and a day of one digit", { conformance: "2025-1-1" }],
      ["a year of two digits", { conformance: "25-01-01" }],
      ["a year 0000", { conformance: "0000-01-01" }],
      ["a day written as dd/mm/yyyy", { conformance: "01/02/2025" }],
      ["a day with a time", { conformance: "2025-08-01T10:00:00Z" }],
      ["words", { conformance: "not a day" }],
      ["an empty text", { conformance: "" }],
      ["a number", { conformance: 20250801 }],
      ["null", { conformance: null }],
      ["an object", { conformance: {} }],
      ["no conformance", { omit: ["conformance"] }],
      ["no dates", { omit: ["dates"] }],
    ])("makes a product unreadable for %s", async (_name, over) => {
      const { byId, body } = await run([
        ...fillers(),
        product({ n: 10810, applicant: "Quillworks Optical", ...over }),
      ]);
      expect(body.unreadable).toBe(1);
      expect(byId.has("quillworksoptical")).toBe(false);
    });

    it("dates the record by the newest conformance among its conformant products", async () => {
      const items = [
        product({ n: 10820, applicant: "Quillworks Optical", conformance: "2025-03-03" }),
        product({ n: 10821, applicant: "Quillworks Optical", conformance: "2025-09-09" }),
        product({ n: 10822, applicant: "Quillworks Optical", conformance: "2025-06-06" }),
      ];
      for (const order of [items, [...items].reverse()]) {
        const { byId } = await run([...fillers(), ...order]);
        expect(byId.get("quillworksoptical")?.publishedAt).toBe("2025-09-09");
        expect(byId.get("quillworksoptical")?.identifiers).toMatchObject({
          newestConformance: "2025-09-09",
        });
      }
    });

    it.each<[string, Over]>([
      ["absent", { omit: ["lastModification"] }],
      ["no text", { modified: 7 }],
      ["a day that does not exist", { modified: "2025-13-45" }],
      ["words", { modified: "yesterday" }],
    ])("lets a product that has no last change that is %s stay readable", async (_name, over) => {
      const done = await run([
        ...fillers(),
        product({ n: 10830, applicant: "Quillworks Optical", ...over }),
      ]);
      expect(done.body.unreadable).toBe(0);
      expect(done.byId.has("quillworksoptical")).toBe(true);
      expect(done.result.sourceVersion).toBe("2025-07-20");
    });
  });

  describe("the id of a product (recordId)", () => {
    it.each<[string, Over]>([
      ["absent", { omit: ["recordId"] }],
      ["no text", { recordId: 7 }],
      ["null", { recordId: null }],
      ["empty", { recordId: "" }],
      ["not a UUID", { recordId: "not-a-uuid" }],
      ["a UUID with a letter that is no hex digit", { recordId: uuid(1).replace("0197", "g197") }],
      ["a UUID one group short", { recordId: uuid(1).slice(0, -13) }],
      ["a UUID with a blank in it", { recordId: ` ${uuid(1)}` }],
      ["a UUID of 37 characters", { recordId: `${uuid(1)}0` }],
    ])("makes a product unreadable when it is %s", async (_name, over) => {
      const { byId, body } = await run([
        ...fillers(),
        product({ n: 10900, applicant: "Quillworks Optical", ...over }),
      ]);
      expect(body.unreadable).toBe(1);
      expect(byId.has("quillworksoptical")).toBe(false);
    });

    it("takes a UUID in capitals, and stores it in lower case", async () => {
      const { byId, body } = await run([
        ...fillers(),
        product({
          n: 10901,
          applicant: "Quillworks Optical",
          recordId: uuid(255).toUpperCase(),
        }),
      ]);
      expect(body.unreadable).toBe(0);
      expect(byId.get("quillworksoptical")?.identifiers).toMatchObject({
        recordIds: [uuid(255)],
      });
    });

    it("makes unreadable, whatever the order of the file, both products that share one id", async () => {
      const pair = [
        product({ n: 10910, applicant: "Quillworks Optical", recordId: uuid(10910) }),
        product({ n: 10911, applicant: "Quillworks Optical", recordId: uuid(10910) }),
        product({ n: 10912, applicant: "Quillworks Optical" }),
      ];
      for (const order of [pair, [...pair].reverse()]) {
        const { byId, body } = await run([...fillers(), ...order]);
        expect(body.unreadable).toBe(2);
        expect(byId.get("quillworksoptical")?.identifiers).toMatchObject({ conformant: 1 });
      }
    });

    it("sees one id in two cases as one id", async () => {
      const { body } = await run([
        ...fillers(),
        product({ n: 10920, applicant: "Quillworks Optical", recordId: uuid(10920) }),
        product({
          n: 10921,
          applicant: "Quillworks Optical",
          recordId: uuid(10920).toUpperCase(),
        }),
      ]);
      expect(body.unreadable).toBe(2);
    });
  });

  describe("the applicant that is not one", () => {
    it.each<[string, Over]>([
      ["absent", { omit: ["applicant"] }],
      ["no text", { applicant: 7 }],
      ["null", { applicant: null }],
      ["empty", { applicant: "" }],
      ["blank", { applicant: "     " }],
      ["hidden characters only", { applicant: String.fromCodePoint(0x200b, 0x202e) }],
      ["punctuation only", { applicant: "!!! ??? ..." }],
    ])("makes a product unreadable when it is %s", async (_name, over) => {
      const { byId, body } = await run([...fillers(), product({ n: 11000, ...over })]);
      expect(body.unreadable).toBe(1);
      expect(extraKeys(byId)).toEqual([]);
    });

    it.each([
      ["null", null],
      ["a number", 7],
      ["a text", "text"],
      ["an array", []],
      ["true", true],
    ])("makes an item that is %s unreadable", async (_name, item) => {
      const { body } = await run([...fillers(), item]);
      expect(body.unreadable).toBe(1);
    });

    it("counts each item that does not read once, and gives a total of every item", async () => {
      const { body } = await run([...fillers(), null, 7, "text", [], true]);
      expect(body.unreadable).toBe(5);
      expect(body.total).toBe(205);
    });
  });

  describe("the floors of the list", () => {
    const failsAsNotTheList = async (text: string): Promise<void> => {
      const fetch = fakeFetch(filesOf(text));
      expect(await failureOf(c2paConformingConnector.download(fetch, {}))).toBeInstanceOf(
        NotTheListError,
      );
    };

    it("is read at 150 conformant products and refused at 149", async () => {
      const { result } = await run([...fillers(100, 1), ...moreFor(50)]);
      expect(result.errors).toBe(0);
      expect(result.records).toHaveLength(100);
      await failsAsNotTheList(listText([...fillers(100, 1), ...moreFor(49)]));
    });

    it("is read at 100 applicants and refused at 99", async () => {
      const { result } = await run(fillers(100, 2));
      expect(result.records).toHaveLength(100);
      await failsAsNotTheList(listText(fillers(99, 2)));
      await failsAsNotTheList(listText(fillers(99, 3)));
    });

    it("does not count a product of another status toward the 150", async () => {
      const revoked = Array.from({ length: 20 }, (_, a) =>
        product({ n: 6000 + a, applicant: nameOf(a), status: "revoked" }),
      );
      await failsAsNotTheList(listText([...fillers(100, 1), ...moreFor(49), ...revoked]));
    });

    it("does not count an applicant that has only products of another status toward the 100", async () => {
      const revoked = Array.from({ length: 5 }, (_, a) =>
        product({ n: 6100 + a, applicant: `Gone${lettersOf(a)} Optical`, status: "revoked" }),
      );
      await failsAsNotTheList(listText([...fillers(99, 2), ...revoked]));
    });

    it("does not count a product of a person's business, or one that does not read, toward the floors", async () => {
      const person = product({ n: 6200, applicant: "Zibblesmith Freelance" });
      const broken = product({ n: 6201, applicant: nameOf(0), conformance: "not a day" });
      await failsAsNotTheList(listText([...fillers(100, 1), ...moreFor(48), person, broken]));
      // Two more conformant products make 150 that count, and the list is read.
      const enough = [
        product({ n: 6300, applicant: nameOf(60) }),
        product({ n: 6301, applicant: nameOf(61) }),
      ];
      const { result } = await run([...fillers(100, 1), ...moreFor(48), person, broken, ...enough]);
      expect(result.errors).toBe(0);
    });

    it.each([
      ["an HTML page", "<html><body>Not found</body></html>"],
      ["nothing", ""],
      ["text that is not JSON", "not json at all"],
      ["an object", JSON.stringify({ products: fillers() })],
      ["an empty object", "{}"],
      ["an empty array", "[]"],
      ["an array of things that are no products", "[1, 2, 3]"],
      ["a text", '"products"'],
      ["null", "null"],
      ["a list that is cut in the middle", listText(fillers()).slice(0, 2000)],
      ["a list with text after it", `${listText(fillers())} trailing`],
      ["a list that a brace closes", `${listText(fillers()).slice(0, -1)}}`],
    ])("is refused for %s, as not the list", async (_name, text) => {
      await failsAsNotTheList(text);
    });

    it("reads a file that begins with a byte order mark", async () => {
      const bom = String.fromCodePoint(0xfeff);
      const fetch = fakeFetch(filesOf(`${bom}${listText(fillers())}`));
      expect(await c2paConformingConnector.download(fetch, {})).not.toBe("unchanged");
    });

    it("fails, with a message that holds no address, as a download", async () => {
      const fetch = fakeFetch(filesOf("not json"));
      const error = (await failureOf(c2paConformingConnector.download(fetch, {}))) as Error;
      expect(error).toBeInstanceOf(NotTheListError);
      expect(error.message).not.toMatch(/githubusercontent|c2pa|https?:/i);
    });
  });

  describe("a list over its limits", () => {
    it("is read at 10,000 products, and says how many it saw", async () => {
      const junk = Array.from({ length: 10_000 - 200 }, () => null);
      const { body, result } = await run([...fillers(), ...junk]);
      expect(body.total).toBe(10_000);
      expect(body.unreadable).toBe(9_800);
      expect(result.records).toHaveLength(100);
    });

    it("fails the download as too large, and never gives a shorter list, at 10,001 products", async () => {
      const junk = Array.from({ length: 10_001 - 200 }, () => null);
      const fetch = fakeFetch(filesOf(listText([...fillers(), ...junk])));
      expect(await failureOf(c2paConformingConnector.download(fetch, {}))).toBeInstanceOf(
        BodyTooLargeError,
      );
    });

    it("fails as too large, and not as 'not the list', when there are more items than the maximum and none reads", async () => {
      // The part that was read would fail the floors: that must not hide that the list is too large.
      const fetch = fakeFetch(filesOf(listText(Array.from({ length: 10_001 }, () => null))));
      expect(await failureOf(c2paConformingConnector.download(fetch, {}))).toBeInstanceOf(
        BodyTooLargeError,
      );
    });

    it("fails the download as too large when the file is cut at its limit", async () => {
      const cut = fakeFetch(filesOf(listText(fillers()), { truncated: true }));
      expect(await failureOf(c2paConformingConnector.download(cut, {}))).toBeInstanceOf(
        BodyTooLargeError,
      );
      const long = `${listText(fillers())}${" ".repeat(8_388_608)}`;
      const over = fakeFetch(filesOf(long));
      expect(await failureOf(c2paConformingConnector.download(over, {}))).toBeInstanceOf(
        BodyTooLargeError,
      );
    });
  });

  describe("products that do not read, and the allowance for them", () => {
    const unreadable = (count: number): Array<Record<string, unknown>> =>
      Array.from({ length: count }, (_, at) =>
        product({ n: 7000 + at, applicant: "Quillworks Optical", conformance: "not a day" }),
      );

    it("are counted and left out, within the allowance of the kit", async () => {
      const { result, body } = await run([...fillers(), ...unreadable(2)]);
      expect(body.unreadable).toBe(2);
      expect(result).toMatchObject({ errors: 0, skipped: 2 });
      expect(result.records).toHaveLength(100);
    });

    it("fail the list when there are more than the allowance: one more than ten of a hundred", async () => {
      expect(unreadableAllowed(100 + 10)).toBe(10);
      const within = await run([...fillers(), ...unreadable(10)]);
      expect(within.result).toMatchObject({ errors: 0, skipped: 10 });
      const over = await run([...fillers(), ...unreadable(11)]);
      expect(unreadableAllowed(100 + 11)).toBe(10);
      expect(over.result.errors).toBe(11);
      expect(over.result.skipped).toBe(0);
      expect(over.result.records).toHaveLength(100);
    });
  });

  describe("the products of one applicant, in the text and in the identifiers", () => {
    /** `count` conformant products of one applicant, the day of each one later than the one before. */
    const many = (count: number, over: Partial<Spec> = {}): Array<Record<string, unknown>> =>
      Array.from({ length: count }, (_, at) =>
        product({
          n: 8000 + at,
          applicant: "Quillworks Optical",
          cn: `Quill Product ${lettersOf(at)}`,
          conformance: dayAt(220 + at),
          ...over,
        }),
      );

    it("names the five newest in the text and says how many more there are", async () => {
      const { byId } = await run([...fillers(), ...many(30)]);
      const summary = byId.get("quillworksoptical")?.summary ?? "";
      const newest = [29, 28, 27, 26, 25].map((at) => `Quill Product ${lettersOf(at)}`);
      expect(summary).toContain(`Products: ${newest.join(", ")} and 25 more.`);
    });

    it("keeps at most 20 product names and 20 ids, the newest first", async () => {
      const { byId, body } = await run([...fillers(), ...many(30)]);
      const row = rowOf(body, "quillworksoptical");
      const names = row?.productNames as string[];
      const ids = row?.recordIds as string[];
      expect(names).toHaveLength(20);
      expect(ids).toHaveLength(20);
      expect(names[0]).toBe(`Quill Product ${lettersOf(29)}`);
      expect(names[19]).toBe(`Quill Product ${lettersOf(10)}`);
      expect(ids[0]).toBe(uuid(8029));
      expect(ids[19]).toBe(uuid(8010));
      expect(byId.get("quillworksoptical")?.identifiers).toMatchObject({
        conformant: 30,
        recordIds: ids,
      });
    });

    it("names a product once however many products carry the name", async () => {
      const { byId, body } = await run([
        ...fillers(),
        ...many(3, { cn: "Quill Same" }),
        product({
          n: 8100,
          applicant: "Quillworks Optical",
          cn: "Quill Other",
          conformance: dayAt(100),
        }),
      ]);
      expect(rowOf(body, "quillworksoptical")?.productNames).toEqual(["Quill Same", "Quill Other"]);
      expect(byId.get("quillworksoptical")?.summary).toContain(
        "Products: Quill Same, Quill Other and 2 more.",
      );
    });

    it("says 'and k more' for the products that are not named, even when two carry a name", async () => {
      const { byId } = await run([...fillers(), ...many(3, { cn: "Quill Same" })]);
      expect(byId.get("quillworksoptical")?.summary).toContain("Products: Quill Same and 2 more.");
    });

    it("leaves a product that has no name out of the names, and still counts it", async () => {
      const { byId } = await run([
        ...fillers(),
        product({ n: 8200, applicant: "Quillworks Optical", omit: ["CN"] }),
        product({ n: 8201, applicant: "Quillworks Optical", cn: "   " }),
        product({ n: 8202, applicant: "Quillworks Optical", cn: 7 }),
        product({ n: 8203, applicant: "Quillworks Optical", omit: ["DN"] }),
        product({ n: 8204, applicant: "Quillworks Optical", cn: "Quill Named" }),
      ]);
      const record = byId.get("quillworksoptical");
      expect(record?.identifiers).toMatchObject({ conformant: 5 });
      expect(record?.summary).toContain("Products: Quill Named and 4 more.");
    });

    it("says nothing of products when no conformant product has a name", async () => {
      const { byId } = await run([
        ...fillers(),
        product({ n: 8210, applicant: "Quillworks Optical", omit: ["CN"] }),
      ]);
      const summary = byId.get("quillworksoptical")?.summary ?? "";
      expect(summary).not.toContain("Products:");
      expect(summary.endsWith(S6)).toBe(true);
    });

    it("cuts a name of a product at 60 characters, with the mark of a cut", async () => {
      const long = `Quill ${"Product ".repeat(20)}`;
      const { byId, body } = await run([
        ...fillers(),
        product({ n: 8220, applicant: "Quillworks Optical", cn: long }),
      ]);
      const shown = `${long.slice(0, 48).trimEnd()} [shortened]`;
      expect(rowOf(body, "quillworksoptical")?.productNames).toEqual([shown]);
      expect(byId.get("quillworksoptical")?.summary).toContain(`Products: ${shown}.`);
    });

    it("orders products of one day by their id, the greater first, whatever the order of the file", async () => {
      const items = Array.from({ length: 4 }, (_, at) =>
        product({
          n: 8300 + at,
          applicant: "Quillworks Optical",
          cn: `Quill Tied ${lettersOf(at)}`,
          conformance: "2025-09-09",
        }),
      );
      for (const order of [items, [...items].reverse()]) {
        const { body } = await run([...fillers(), ...order]);
        const row = rowOf(body, "quillworksoptical");
        expect(row?.recordIds).toEqual([uuid(8303), uuid(8302), uuid(8301), uuid(8300)]);
        expect(row?.productNames).toEqual([
          `Quill Tied ${lettersOf(3)}`,
          `Quill Tied ${lettersOf(2)}`,
          `Quill Tied ${lettersOf(1)}`,
          `Quill Tied ${lettersOf(0)}`,
        ]);
      }
    });

    it("keeps the identifiers of a record far below their limit", async () => {
      const long = `Q${"u".repeat(99)}`;
      const { byId } = await run([...fillers(), ...many(30, { applicant: long })]);
      expect(JSON.stringify(byId.get(compactName(long))?.identifiers).length).toBeLessThan(1500);
    });
  });

  describe("the worst case", () => {
    it("is at most 1,300 characters, with the 'is not' sentence and the attribution whole", async () => {
      const applicant = `Q${"u".repeat(99)}`;
      const items = Array.from({ length: 60 }, (_, at) =>
        product({
          n: 9000 + at,
          applicant,
          cn: `${lettersOf(at).padStart(3, "a")}${"P".repeat(70)}`,
          type: at % 2 === 0 ? "generatorProduct" : "validatorProduct",
          conformance: dayAt(230 + at),
        }),
      );
      const others = Array.from({ length: 12 }, (_, at) =>
        product({ n: 9100 + at, applicant, status: "revoked" }),
      );
      const { byId, result } = await run([...fillers(), ...items, ...others]);
      const record = byId.get(compactName(applicant));
      expect(record).toBeDefined();
      const summary = record?.summary ?? "";
      expect(summary.length).toBeLessThanOrEqual(1300);
      expect(summary.length).toBeGreaterThan(1000);
      expect(summary.startsWith(`${S1} ${S2} `)).toBe(true);
      expect(summary.endsWith(S6)).toBe(true);
      expect(summary).toContain("12 other listed products have another status");
      expect(summary).toContain("and 55 more.");
      expectWellFormedRecords(result.records, { sourceId: "c2pa_conforming", mark: MARK });
    });
  });

  describe("cells that a third party wrote", () => {
    it("are cleaned: controls, bidirectional and zero-width characters, and a lone surrogate", async () => {
      const nul = String.fromCharCode(0);
      const bell = String.fromCharCode(7);
      const bidi = String.fromCodePoint(0x202e);
      const zero = String.fromCodePoint(0x200b);
      const lone = String.fromCharCode(0xd800);
      const { byId, result } = await run([
        ...fillers(),
        product({
          n: 11100,
          applicant: `Quill${nul}works${zero} ${bidi}Optical${bell}`,
          cn: `Quill${nul} Lens${zero} ${lone}`,
        }),
      ]);
      const record = byId.get("quillworksoptical");
      const replacement = String.fromCodePoint(0xfffd);
      expect(record?.title).toBe(`${MARK}: Quillworks Optical`);
      expect(record?.summary).toContain(`Products: Quill Lens ${replacement}.`);
      expectWellFormedRecords(result.records, { sourceId: "c2pa_conforming", mark: MARK });
    });

    it("keep no angle bracket: a tag is written with the angle quotation marks", async () => {
      const { byId, result } = await run([
        ...fillers(),
        product({
          n: 11101,
          applicant: "Quillworks <b>Optical</b>",
          cn: `<script>alert(1)</script>${String.fromCodePoint(0xff1c)}i${String.fromCodePoint(0xff1e)}`,
        }),
      ]);
      const record = [...byId.values()].find((candidate) => candidate.title.includes("Quillworks"));
      expect(record?.title).not.toMatch(/[<>]/);
      expect(record?.summary).not.toMatch(/[<>]/);
      expect(record?.summary).toContain("script");
      expectWellFormedRecords(result.records, { sourceId: "c2pa_conforming", mark: MARK });
    });

    it("are cut: a product name of 100 KB is shown at 60 characters, and an applicant of 100 KB is no name", async () => {
      const huge = "x".repeat(100_000);
      const done = await run([
        ...fillers(),
        product({ n: 11102, applicant: "Quillworks Optical", cn: huge, org: huge }),
        product({ n: 11103, applicant: huge }),
      ]);
      expect(done.body.unreadable).toBe(1);
      expect(done.snapshot.bodies[0].length).toBeLessThan(300_000);
      const record = done.byId.get("quillworksoptical");
      expect(record?.summary.length).toBeLessThanOrEqual(1300);
      expect(record?.summary).toContain(`Products: ${"x".repeat(48)} [shortened].`);
      expect(record?.matchKeys).toEqual(["name:quillworksoptical"]);
    });

    it("take the hostile megabytes of an applicant and of a certificate for what they are, and cost no more than their length", async () => {
      const MIB = 1 << 20;
      const repeated = (unit: string): string =>
        unit.repeat(Math.ceil(MIB / unit.length)).slice(0, MIB);
      // Shapes that a pattern of the person rule or of a mark could be slow on, each of a megabyte.
      const shapes = [
        `sole${"-".repeat(MIB - 4)}`,
        repeated("e.K "),
        repeated("einzelfirma "),
        repeated(" dba"),
        repeated(" doing business"),
      ];
      const started = Date.now();
      const done = await run([
        ...fillers(),
        ...shapes.map((applicant, at) =>
          product({ n: 11110 + at, applicant, org: "Voorbeeld Optical" }),
        ),
        product({ n: 11120, applicant: "Quillworks Optical", org: repeated(" trading as") }),
      ]);
      // An applicant of a megabyte is no name: it is unreadable at once, and a certificate of a
      // megabyte gives no second name.
      expect(done.body.unreadable).toBe(shapes.length);
      expect(done.byId.get("quillworksoptical")?.matchKeys).toEqual(["name:quillworksoptical"]);
      expect(rowOf(done.body, "quillworksoptical")?.names).toEqual(["Quillworks Optical"]);
      expect(Date.now() - started).toBeLessThan(20_000);
    });

    it("do not pollute what they name: a key called __proto__ is a key of its own", async () => {
      // JSON.parse makes the key an own property of the product, and sets no prototype with it.
      const item: unknown = JSON.parse(
        JSON.stringify(product({ n: 11104, applicant: "Proto Optical" })).replace(
          "{",
          '{"__proto__":{"applicant":"polluted"},',
        ),
      );
      const done = await run([...fillers(), item]);
      expect(done.byId.has("protooptical")).toBe(true);
      expect(everythingOf(done)).not.toContain("polluted");
      expect(({} as Record<string, unknown>).applicant).toBeUndefined();
    });
  });

  describe("the order of the file", () => {
    function mixed(): unknown[] {
      return [
        ...fillers(),
        ...zibble(),
        product({ n: 12000, applicant: "Quillworks Inc ", org: "Quill Holdings Limited" }),
        product({ n: 12001, applicant: "Quillworks, Inc.", conformance: "2025-08-08" }),
        product({ n: 12002, applicant: "QUILLWORKS INC", status: "revoked" }),
        product({ n: 12003, applicant: "Zibblesmith Freelance" }),
        product({ n: 12004, applicant: "Gone Optical", status: "revoked" }),
        product({ n: 12005, applicant: "Quillworks Optical", recordId: uuid(12005) }),
        product({ n: 12006, applicant: "Quillworks Optical", recordId: uuid(12005) }),
        product({ n: 12007, applicant: "Quillworks Optical", conformance: "2025-08-08" }),
        product({ n: 12008, applicant: "Quillworks Optical", conformance: "2025-08-08" }),
        product({ n: 12009, applicant: "Quillworks Optical", conformance: "garbage" }),
        null,
        7,
      ];
    }

    it("never changes the body or the records (the kit's contract)", async () => {
      const items = mixed();
      await expectDeterministic(c2paConformingConnector, (reversed) =>
        fakeFetch(filesOf(listText(reversed ? [...items].reverse() : items))),
      );
    });

    it("gives the same body for every rotation of the products, which is the same hash", async () => {
      const items = mixed();
      const hashes = new Set<string>();
      for (const shift of [0, 7, 19, 33, 61, 150, 230]) {
        const rotated = [...items.slice(shift), ...items.slice(0, shift)];
        const fetch = fakeFetch(filesOf(listText(rotated)));
        const snapshot = await c2paConformingConnector.download(fetch, {});
        if (snapshot === "unchanged") throw new Error("unchanged");
        hashes.add(createHash("sha256").update(snapshot.bodies[0]).digest("hex"));
      }
      expect(hashes.size).toBe(1);
    });

    it("gives the same id to an applicant whatever the order of the products that show it", async () => {
      const items = mixed();
      const forward = await run(items);
      const backward = await run([...items].reverse());
      expect([...forward.byId.keys()]).toEqual([...backward.byId.keys()]);
      expect(forward.byId.get("quillworksinc")?.sourceRecordId).toBe("quillworksinc");
    });
  });

  describe("the answer of the server", () => {
    it("is 'unchanged' when the file is the one that the stored validators name, and nothing is read", async () => {
      const fetch = fakeFetch(filesOf(listText(fillers())));
      const first = await c2paConformingConnector.download(fetch, {});
      if (first === "unchanged") throw new Error("unchanged");
      const second = await c2paConformingConnector.download(fetch, {
        etag: first.etag,
        lastModified: first.lastModified,
      });
      expect(second).toBe("unchanged");
      expect(fetch.calls).toHaveLength(2);
      // The stored etag is behind the prefix of the version; the server gets its own.
      expect(fetch.calls[1].validators).toEqual({ etag: ETAG, lastModified: LAST_MODIFIED });
    });

    it("is read again when the stored etag is that of another version of the reading", async () => {
      const fetch = fakeFetch(filesOf(listText(fillers())));
      const answer = await c2paConformingConnector.download(fetch, {
        etag: `k0:${ETAG}`,
        lastModified: LAST_MODIFIED,
      });
      expect(answer).not.toBe("unchanged");
      expect(fetch.calls[0].validators).toEqual({});
    });

    it("fails as not allowed when the answer came from another host", async () => {
      const fetch = fakeFetch(
        filesOf(listText(fillers()), { url: "https://evil.example/conforming-products-list.json" }),
      );
      const error = await failureOf(c2paConformingConnector.download(fetch, {}));
      expect(error).toBeInstanceOf(FetchError);
      expect((error as FetchError).reason).toBe("not_allowed");
      expect((error as Error).message).not.toContain("evil");
    });

    it("fails as not allowed when a 304 came from another host", async () => {
      const fetch = fakeFetch(
        filesOf(listText(fillers()), { url: "https://evil.example/conforming-products-list.json" }),
      );
      const error = await failureOf(
        c2paConformingConnector.download(fetch, {
          etag: `k1:${ETAG}`,
          lastModified: LAST_MODIFIED,
        }),
      );
      expect(error).toBeInstanceOf(FetchError);
      expect((error as FetchError).reason).toBe("not_allowed");
    });

    it("fails as not allowed for the host with another port, scheme or user name, or for a lookalike host", async () => {
      const path =
        "/c2pa-org/conformance-public/main/conforming-products/conforming-products-list.json";
      for (const url of [
        `https://raw.githubusercontent.com:8443${path}`,
        `http://raw.githubusercontent.com${path}`,
        `https://user@raw.githubusercontent.com${path}`,
        `https://www.raw.githubusercontent.com${path}`,
        `https://raw.githubusercontent.com.evil.example${path}`,
        `https://github.com${path}`,
      ]) {
        const fetch = fakeFetch(filesOf(listText(fillers()), { url }));
        const error = await failureOf(c2paConformingConnector.download(fetch, {}));
        expect(error).toBeInstanceOf(FetchError);
      }
    });

    it("fails as not allowed for another path of the host: another owner, another repository, a longer name", async () => {
      for (const path of [
        "/other-org/conformance-public/main/conforming-products/conforming-products-list.json",
        "/c2pa-org/conformance-public-evil/main/conforming-products/conforming-products-list.json",
        "/c2pa-org/conformance/main/conforming-products/conforming-products-list.json",
        "/c2pa-org/main.json",
        "/C2PA-ORG/conformance-public/main/conforming-products/conforming-products-list.json",
        "/c2pa-org/conformance-public/../../other-org/x/main/list.json",
      ]) {
        const fetch = fakeFetch(
          filesOf(listText(fillers()), { url: `https://raw.githubusercontent.com${path}` }),
        );
        const error = await failureOf(c2paConformingConnector.download(fetch, {}));
        expect(error).toBeInstanceOf(FetchError);
        expect((error as FetchError).reason).toBe("not_allowed");
      }
    });

    it("takes an answer from another path under the repository's directory", async () => {
      const fetch = fakeFetch(
        filesOf(listText(fillers()), {
          url: "https://raw.githubusercontent.com/c2pa-org/conformance-public/refs/heads/main/conforming-products/conforming-products-list.json",
        }),
      );
      expect(await c2paConformingConnector.download(fetch, {})).not.toBe("unchanged");
    });

    it("takes the types that the real server answers with, and fails for another", async () => {
      for (const contentType of ["text/plain; charset=utf-8", "application/json", "text/plain"]) {
        const fetch = fakeFetch(filesOf(listText(fillers()), { contentType }));
        expect(await c2paConformingConnector.download(fetch, {})).not.toBe("unchanged");
      }
      const fetch = fakeFetch(filesOf(listText(fillers()), { contentType: "text/html" }));
      const error = await failureOf(c2paConformingConnector.download(fetch, {}));
      expect(error).toBeInstanceOf(FetchError);
      expect((error as FetchError).reason).toBe("unsupported_type");
    });
  });

  describe("parse of a body that the download made", () => {
    it("is the same for the same body: the records do not depend on the clock", async () => {
      const { snapshot } = await run(fillers());
      expect(c2paConformingConnector.parse(snapshot)).toEqual(
        c2paConformingConnector.parse(snapshot),
      );
    });

    it("leaves out, as unreadable, a row whose id cannot be written in an address", async () => {
      const { snapshot } = await run(fillers());
      const body = JSON.parse(snapshot.bodies[0]) as Body;
      body.rows[0].id = `abc${String.fromCharCode(0xd800)}`;
      const parsed = c2paConformingConnector.parse({
        ...snapshot,
        bodies: [JSON.stringify(body)],
      });
      expect(parsed.records).toHaveLength(99);
      expect(parsed).toMatchObject({ errors: 0, skipped: 1 });
    });

    it("writes the id of a row into the address encoded, as the one value of the query", async () => {
      const { snapshot } = await run(fillers());
      const body = JSON.parse(snapshot.bodies[0]) as Body;
      const id = "a#b&c=d e/f?g%h";
      body.rows[0].id = id;
      const parsed = c2paConformingConnector.parse({
        ...snapshot,
        bodies: [JSON.stringify(body)],
      });
      const record = parsed.records.find((candidate) => candidate.sourceRecordId === id);
      expect(record?.url).toBe(`${PAGE_URL}a%23b%26c%3Dd%20e%2Ff%3Fg%25h`);
      expect(new URL(record?.url ?? "").searchParams.get("applicant")).toBe(id);
    });

    it("is no list for a body that is not the one of the download", () => {
      const result = c2paConformingConnector.parse({
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
