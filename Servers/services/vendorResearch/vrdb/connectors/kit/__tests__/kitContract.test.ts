/**
 * The shared test helper of the list kit (connectors/__tests__/helpers/kitContract.ts), which every
 * new connector's test calls: it has to fail a bad record and pass a good one, and its fake fetch
 * has to answer as the page guard does, so that no connector test uses the network.
 */
import { FetchError } from "../../../../../webResearch/guardedFetch";
import type { ParsedRecord } from "../../../types";
import {
  expectDeterministic,
  expectWellFormedRecords,
  fakeFetch,
} from "../../__tests__/helpers/kitContract";
import type { Connector, ConnectorFetch, Snapshot } from "../../types";
import { type RecordDraft, recordOf } from "../record";

const cp = (...codes: number[]): string => String.fromCodePoint(...codes);

const MARK = "Example list (example.org)";
const OPTIONS = { sourceId: "kev", mark: MARK } as const;

/** A record that holds nothing wrong; a test changes what it is about. */
const good = (over: Partial<ParsedRecord> = {}): ParsedRecord => ({
  sourceRecordId: "ENT-1",
  recordType: "restricted_party",
  title: "Example list: Acme Robotics",
  summary: `${MARK}, operated by Example Agency. Entry: Acme Robotics.`,
  url: "https://example.org/entries/1",
  identifiers: { entry: 1, programs: ["A", "B"] },
  matchKeys: ["name:acmerobotics", "domain:example.com", "regno:1027700000000"],
  publishedAt: "2026-01-05",
  sourceUpdatedAt: "2026-01-06T07:08:09Z",
  ...over,
});

describe("expectWellFormedRecords", () => {
  describe("a record that holds nothing wrong", () => {
    it("passes, and so does no record", () => {
      expect(() => expectWellFormedRecords([good()], OPTIONS)).not.toThrow();
      expect(() => expectWellFormedRecords([], OPTIONS)).not.toThrow();
    });

    it("passes when its optional parts are null, and its keys are of every kind that keys.ts knows", () => {
      expect(() =>
        expectWellFormedRecords(
          [
            good({
              publishedAt: null,
              sourceUpdatedAt: null,
              identifiers: {},
              matchKeys: [],
            }),
            good({
              sourceRecordId: "ENT-2",
              sourceUpdatedAt: "2026-01-06",
              matchKeys: [
                "name:acme",
                "domain:example.com",
                "lei:TEST00ACMEANALYT0154",
                "regno:1027700000000",
                "cik:0000123456",
                "kev:acme",
                "cve:acme",
                "cpe:acme",
              ],
            }),
          ],
          OPTIONS,
        ),
      ).not.toThrow();
    });

    it("passes the limits themselves", () => {
      expect(() =>
        expectWellFormedRecords(
          [
            good({
              sourceRecordId: "i".repeat(200),
              recordType: "t".repeat(30) as ParsedRecord["recordType"],
              title: "T".repeat(200),
              summary: `${MARK}${"s".repeat(1300 - MARK.length)}`,
              url: `https://example.org/${"u".repeat(2048 - 20)}`,
              matchKeys: Array.from({ length: 200 }, (_, at) => `name:acme${at}`),
              identifiers: { a: "x".repeat(2000 - 8) },
            }),
          ],
          { sourceId: "x".repeat(40) as "kev", mark: MARK },
        ),
      ).not.toThrow();
    });

    it("passes a record that recordOf made", () => {
      const draft: RecordDraft = {
        id: "ENT-1",
        type: "restricted_party",
        title: "T <b> x",
        summary: `${MARK}. <script>alert(1)</script>${cp(0x1f600)}`,
        url: "https://example.org/entries/1",
        identifiers: { when: new Date(0), nothing: undefined },
        names: ["Acme Robotics Ltd"],
        domains: ["example.com"],
        publishedAt: "2026-01-05",
      };
      expect(() => expectWellFormedRecords([recordOf(draft)], OPTIONS)).not.toThrow();
    });
  });

  describe("a record that holds something wrong", () => {
    it.each([
      ["no id", { sourceRecordId: "" }, "the id is empty"],
      ["an id of blanks", { sourceRecordId: "  " }, "the id is empty"],
      ["an id that is too long", { sourceRecordId: "i".repeat(201) }, "the id is longer than 200"],
      ["an id with a NUL", { sourceRecordId: `a${cp(0)}b` }, "the id has a control character"],
      ["an id with a line break", { sourceRecordId: "a\nb" }, "the id has a control character"],
      ["an id with a tab", { sourceRecordId: "a\tb" }, "the id has a control character"],
      ["an id with DEL", { sourceRecordId: `a${cp(0x7f)}b` }, "the id has a control character"],
      ["no type", { recordType: "" as ParsedRecord["recordType"] }, "the type is empty"],
      [
        "a type that is too long",
        { recordType: "t".repeat(31) as ParsedRecord["recordType"] },
        "the type is longer than 30",
      ],
      ["no title", { title: "" }, "the title is empty"],
      ["a title of blanks", { title: "   " }, "the title is empty"],
      ["a title that is too long", { title: "T".repeat(201) }, "the title is longer than 200"],
      ["no summary", { summary: "" }, "the summary is empty"],
      [
        "a summary that is too long",
        { summary: `${MARK}${"s".repeat(1300)}` },
        "the summary is longer than 1300",
      ],
      [
        "a summary that does not begin with the mark",
        { summary: "Entry: Acme Robotics." },
        "the summary does not begin with the mark",
      ],
      [
        "a summary that holds the mark but not at its start",
        { summary: `Entry. ${MARK}` },
        "the summary does not begin with the mark",
      ],
      ["a summary with <", { summary: `${MARK}. a < b` }, "the summary has < or >"],
      ["a summary with >", { summary: `${MARK}. a > b` }, "the summary has < or >"],
      ["a summary with a tag", { summary: `${MARK}. <b>x</b>` }, "the summary has < or >"],
      [
        "a summary with a NUL",
        { summary: `${MARK}. a${cp(0)}b` },
        "the summary has a control character or a lone surrogate",
      ],
      [
        "a summary with a line break",
        { summary: `${MARK}.\nEntry.` },
        "the summary has a control character or a lone surrogate",
      ],
      [
        "a summary with a lone surrogate",
        { summary: `${MARK}. a${cp(0xd800)}b` },
        "the summary has a control character or a lone surrogate",
      ],
      ["an address that is not https", { url: "http://example.org/a" }, "the url is not https"],
      ["no address", { url: "" }, "the url is not https"],
      ["an address in capitals", { url: "HTTPS://EXAMPLE.ORG/" }, "the url is not https"],
      [
        "an address that is too long",
        { url: `https://example.org/${"u".repeat(2049)}` },
        "the url is longer than 2048",
      ],
      ["an address with a blank", { url: "https://example.org/a b" }, "the url has white space"],
      [
        "an address with a line break",
        { url: "https://example.org/a\nb" },
        "the url has white space",
      ],
      [
        "a key of a prefix that keys.ts does not know",
        { matchKeys: ["name:acme", "vendor:acme"] },
        "a key has a prefix that keys.ts does not know",
      ],
      [
        "a key with no prefix",
        { matchKeys: ["acme"] },
        "a key has a prefix that keys.ts does not know",
      ],
      [
        "a name key of three characters",
        { matchKeys: ["name:abc"] },
        "a name key has fewer than 4 characters after its prefix",
      ],
      [
        "a name key with nothing after its prefix",
        { matchKeys: ["name:"] },
        "a name key has fewer than 4 characters after its prefix",
      ],
      [
        "more than 200 keys",
        { matchKeys: Array.from({ length: 201 }, (_, at) => `name:acme${at}`) },
        "there are more than 200 keys",
      ],
      [
        "a key twice",
        { matchKeys: ["name:acme", "domain:example.com", "name:acme"] },
        "a key is not unique",
      ],
      [
        "identifiers that JSON does not keep",
        { identifiers: { when: new Date(0) } },
        "the identifiers are not JSON-safe",
      ],
      [
        "identifiers with an undefined",
        { identifiers: { gone: undefined } },
        "the identifiers are not JSON-safe",
      ],
      [
        "identifiers that are too long",
        { identifiers: { a: "x".repeat(2000 - 7) } },
        "the identifiers are longer than 2000",
      ],
      [
        "a day that does not exist",
        { publishedAt: "2026-02-30" },
        "publishedAt is not null or a real day",
      ],
      ["a day of one digit", { publishedAt: "2026-1-5" }, "publishedAt is not null or a real day"],
      [
        "a day with a time",
        { publishedAt: "2026-01-05T00:00:00Z" },
        "publishedAt is not null or a real day",
      ],
      [
        "a time that is not ISO 8601",
        { sourceUpdatedAt: "05/01/2026" },
        "sourceUpdatedAt is not null or ISO 8601",
      ],
      [
        "a time without a zone",
        { sourceUpdatedAt: "2026-01-05T00:00:00" },
        "sourceUpdatedAt is not null or ISO 8601",
      ],
    ])("fails %s", (_name, over, problem) => {
      expect(() => expectWellFormedRecords([good(over as Partial<ParsedRecord>)], OPTIONS)).toThrow(
        problem,
      );
    });

    describe("as strict as the record builder (review finding 9)", () => {
      const ADDRESS = "the url has a character that an address does not hold";
      const HIDDEN_IN_ADDRESS = "the url has a control or hidden character";
      const HIDDEN_IN_TITLE = "the title has a control or hidden character";

      it.each([
        ["a title with <", { title: "Acme <b>Robotics" }, "the title has < or >"],
        ["a title with >", { title: "Acme Robotics >" }, "the title has < or >"],
        ["a title with a line break", { title: "Acme\nRobotics" }, HIDDEN_IN_TITLE],
        ["a title with a tab", { title: "Acme\tRobotics" }, HIDDEN_IN_TITLE],
        ["a title with a NUL", { title: `Acme${cp(0)}Robotics` }, HIDDEN_IN_TITLE],
        ["a title with a C1 control", { title: `Acme${cp(0x85)}Robotics` }, HIDDEN_IN_TITLE],
        [
          "a title with a zero-width space",
          { title: `Acme${cp(0x200b)}Robotics` },
          HIDDEN_IN_TITLE,
        ],
        ["a title with a joiner", { title: `Acme${cp(0x200d)}Robotics` }, HIDDEN_IN_TITLE],
        [
          "a title with a right-to-left override",
          { title: `Acme${cp(0x202e)}stoboR` },
          HIDDEN_IN_TITLE,
        ],
        [
          "a title with a byte order mark",
          { title: `${cp(0xfeff)}Acme Robotics` },
          HIDDEN_IN_TITLE,
        ],
        ["a title with a soft hyphen", { title: `Acme${cp(0xad)}Robotics` }, HIDDEN_IN_TITLE],
        [
          "a title with a Hangul filler, which is invisible and not a format character",
          { title: `Acme${cp(0x3164)}Robotics` },
          HIDDEN_IN_TITLE,
        ],
        [
          "a title with a combining grapheme joiner",
          { title: `Acme${cp(0x34f)}Robotics` },
          HIDDEN_IN_TITLE,
        ],
        ["a title with a braille blank", { title: `Acme${cp(0x2800)}Robotics` }, HIDDEN_IN_TITLE],
        ["a title of a Hangul filler alone", { title: cp(0x3164) }, HIDDEN_IN_TITLE],
        ["an address with <", { url: "https://example.org/<evidence>" }, ADDRESS],
        ["an address with >", { url: "https://example.org/a>b" }, ADDRESS],
        ["an address with a double quote", { url: 'https://example.org/a"b' }, ADDRESS],
        ["an address with a backtick", { url: "https://example.org/a`b" }, ADDRESS],
        ["an address with a backslash", { url: "https://example.org/a\\b" }, ADDRESS],
        ["an address with a caret", { url: "https://example.org/a^b" }, ADDRESS],
        ["an address with {", { url: "https://example.org/a{b" }, ADDRESS],
        ["an address with }", { url: "https://example.org/a}b" }, ADDRESS],
        ["an address with a bar", { url: "https://example.org/a|b" }, ADDRESS],
        [
          "an address with a right-to-left override",
          { url: `https://example.org/${cp(0x202e)}gnp.exe` },
          HIDDEN_IN_ADDRESS,
        ],
        [
          "an address with a zero-width space",
          { url: `https://example.org/a${cp(0x200b)}b` },
          HIDDEN_IN_ADDRESS,
        ],
        ["an address with a NUL", { url: `https://example.org/a${cp(0)}b` }, HIDDEN_IN_ADDRESS],
        ["an address with DEL", { url: `https://example.org/a${cp(0x7f)}b` }, HIDDEN_IN_ADDRESS],
        ["an address that does not parse", { url: "https://" }, "the url does not parse"],
        [
          "an address with no host",
          { url: "https:///path" },
          "the url is not in the form that URL gives",
        ],
        [
          "an address that is not as URL writes it: no path",
          { url: "https://example.org" },
          "the url is not in the form that URL gives",
        ],
        [
          "an address that is not as URL writes it: a host in capitals",
          { url: "https://EXAMPLE.org/a" },
          "the url is not in the form that URL gives",
        ],
        [
          "an address that is not as URL writes it: a dot segment",
          { url: "https://example.org/a/../b" },
          "the url is not in the form that URL gives",
        ],
        [
          "an address that is not as URL writes it: the port that https has",
          { url: "https://example.org:443/a" },
          "the url is not in the form that URL gives",
        ],
        [
          "an id with a lone surrogate",
          { sourceRecordId: `a${cp(0xd800)}b` },
          "the id has a lone surrogate",
        ],
        [
          "an id with a lone low surrogate",
          { sourceRecordId: `a${cp(0xdc00)}b` },
          "the id has a lone surrogate",
        ],
        [
          "an id with a zero-width space",
          { sourceRecordId: `a${cp(0x200b)}b` },
          "the id has a hidden character",
        ],
        [
          "an id with a right-to-left override",
          { sourceRecordId: `${cp(0x202e)}abc` },
          "the id has a hidden character",
        ],
        [
          "a key of 301 characters",
          { matchKeys: [`regno:${"1".repeat(295)}`] },
          "a key is longer than 300 characters",
        ],
        [
          "a name key with a blank in it, which no vendor's compact name has",
          { matchKeys: ["name:acme corp"] },
          "a name key is not compact",
        ],
        [
          "a name key with a capital",
          { matchKeys: ["name:AcmeCorp"] },
          "a name key is not compact",
        ],
        [
          "a name key with a hyphen",
          { matchKeys: ["name:acme-corp"] },
          "a name key is not compact",
        ],
        [
          "a name key with an accent that is a mark of its own (decomposed)",
          { matchKeys: [`name:soci${cp(0x65, 0x301)}te`] },
          "a name key is not compact",
        ],
        [
          "a name key in full-width letters",
          { matchKeys: [`name:${cp(0xff4d, 0xff49, 0xff43, 0xff52, 0xff4f)}`] },
          "a name key is not compact",
        ],
        [
          "a domain key that is a host where many have pages",
          { matchKeys: ["domain:linkedin.com"] },
          "a domain key is a host where many have pages",
        ],
        [
          "a domain key under such a host",
          { matchKeys: ["domain:acme.github.io"] },
          "a domain key is a host where many have pages",
        ],
        [
          "a domain key that is an address of the network",
          { matchKeys: ["domain:1.2.3.4"] },
          "a domain key is an address of the network",
        ],
        [
          "a summary with a zero-width space",
          { summary: `${MARK}. a${cp(0x200b)}b` },
          "the summary has a hidden character",
        ],
        [
          "a summary with a right-to-left override",
          { summary: `${MARK}. a${cp(0x202e)}b` },
          "the summary has a hidden character",
        ],
        [
          "a summary with a Hangul filler",
          { summary: `${MARK}. a${cp(0x3164)}b` },
          "the summary has a hidden character",
        ],
      ])("fails %s", (_name, over, problem) => {
        expect(() =>
          expectWellFormedRecords([good(over as Partial<ParsedRecord>)], OPTIONS),
        ).toThrow(problem);
      });

      it("passes what is at the edge of each of these rules", () => {
        expect(() =>
          expectWellFormedRecords(
            [
              good({
                sourceRecordId: `ENT-${cp(0x1f600)}`,
                title: `Soci${cp(0xe9)}t${cp(0xe9)} ${cp(0x1f600)} Robotics`,
                url: "https://example.org/a%20b%3Cx?q=1&r=2#frag",
                matchKeys: [
                  `regno:${"1".repeat(294)}`,
                  "name:soci\u{e9}t\u{e9}g\u{e9}n\u{e9}rale",
                  "name:\u{4e2d}\u{6587}\u{540d}\u{79f0}",
                  "domain:example.com",
                  "domain:a1.example.co.uk",
                  "lei:TEST00ACMEANALYT0154",
                ],
              }),
            ],
            OPTIONS,
          ),
        ).not.toThrow();
      });

      it("names the problem of a record that fails several of them at once, and the id of the record", () => {
        let message = "";
        try {
          expectWellFormedRecords(
            [
              good({
                sourceRecordId: "BAD-1",
                title: "<b>",
                url: "https://example.org/<x>",
                matchKeys: ["name:Acme Corp", "domain:linkedin.com"],
              }),
            ],
            OPTIONS,
          );
        } catch (error) {
          message = (error as Error).message;
        }
        for (const part of [
          "BAD-1",
          "the title has < or >",
          ADDRESS,
          "a name key is not compact",
          "a domain key is a host where many have pages",
        ]) {
          expect(message).toContain(part);
        }
      });

      it("passes what recordOf made of a draft that is full of what these rules refuse", () => {
        const draft: RecordDraft = {
          id: "ENT-1",
          type: "restricted_party",
          title: `<b>Soci${cp(0x65, 0x301)}t${cp(0xe9)}</b>${cp(0x200b, 0x202e, 0x3164)} Acme`,
          summary: `${MARK}. <i>x</i>${cp(0x200b, 0x202e, 0x3164)} Lookup   note: y`,
          url: "https://EXAMPLE.org/a/../entries/1",
          identifiers: { a: 1 },
          names: [
            `Soci${cp(0x65, 0x301)}t${cp(0x65, 0x301)} G${cp(0x65, 0x301)}n${cp(0x65, 0x301)}rale`,
            cp(0xff2d, 0xff29, 0xff23, 0xff32, 0xff2f, 0xff33, 0xff2f, 0xff26, 0xff34),
            "Acme Corp",
          ],
          domains: ["linkedin.com", "acme.github.io", "1.2.3.4", "example.com"],
          publishedAt: null,
        };
        expect(() => expectWellFormedRecords([recordOf(draft)], OPTIONS)).not.toThrow();
      });
    });

    it("fails an id that two records share, and names it", () => {
      expect(() => expectWellFormedRecords([good(), good({ title: "Another" })], OPTIONS)).toThrow(
        /ENT-1[\s\S]*the id is not unique/,
      );
    });

    it("fails a source id that is longer than 40, which the column cannot hold", () => {
      expect(() =>
        expectWellFormedRecords([good()], { sourceId: "s".repeat(41) as "kev", mark: MARK }),
      ).toThrow("the source id is longer than 40");
    });

    it("fails a mark that the summary does not begin with, whatever it is", () => {
      expect(() =>
        expectWellFormedRecords([good()], { sourceId: "kev", mark: "Other list" }),
      ).toThrow("the summary does not begin with the mark");
    });

    it("reports every problem at once, each with the id of its record", () => {
      let message = "";
      try {
        expectWellFormedRecords(
          [
            good({ sourceRecordId: "BAD-1", title: "" }),
            good({ sourceRecordId: "BAD-2", url: "http://example.org/" }),
            good({ sourceRecordId: "GOOD-3" }),
          ],
          OPTIONS,
        );
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain("BAD-1");
      expect(message).toContain("the title is empty");
      expect(message).toContain("BAD-2");
      expect(message).toContain("the url is not https");
      expect(message).not.toContain("GOOD-3");
    });

    it("fails a field that is no text, without throwing a TypeError of its own", () => {
      expect(() =>
        expectWellFormedRecords([good({ title: 5 as unknown as string })], OPTIONS),
      ).toThrow("the title is empty");
      expect(() =>
        expectWellFormedRecords([good({ url: undefined as unknown as string })], OPTIONS),
      ).toThrow("the url is not https");
    });
  });
});

describe("expectDeterministic", () => {
  /**
   * A connector that downloads a file of lines and keeps them, sorted or in the order of the file.
   * Its bodies are what the sync hashes.
   */
  function connectorOf(sorted: boolean): Connector {
    return {
      id: "kev",
      version: 1,
      async download(fetch) {
        const response = await fetch(
          "https://example.org/list.txt",
          {},
          {
            maxBytes: 1024,
            allowedContentTypes: ["text/plain"],
            totalTimeoutMs: 1000,
          },
        );
        if (response.notModified) return "unchanged";
        const lines = response.body.toString("utf8").split("\n");
        return {
          bodies: [(sorted ? [...lines].sort() : lines).join("\n")],
          etag: null,
          lastModified: null,
          bytes: response.body.length,
        };
      },
      parse: (snapshot: Snapshot) => ({
        records: snapshot.bodies[0]
          .split("\n")
          .map((line) => good({ sourceRecordId: line, title: line })),
        errors: 0,
        sourceVersion: null,
        root: "list",
      }),
    };
  }

  const fixtureFor = (reversed: boolean): ConnectorFetch =>
    fakeFetch({
      "https://example.org/list.txt": {
        body: (reversed ? ["c", "b", "a"] : ["a", "b", "c"]).join("\n"),
        contentType: "text/plain",
      },
    });

  it("passes a connector whose bodies and records do not depend on the order of the rows", async () => {
    await expect(expectDeterministic(connectorOf(true), fixtureFor)).resolves.toBeUndefined();
  });

  it("fails a connector whose bodies depend on it", async () => {
    await expect(expectDeterministic(connectorOf(false), fixtureFor)).rejects.toThrow();
  });

  it("asks the fixture for the rows in two orders, the same fixture", async () => {
    const asked: boolean[] = [];
    await expectDeterministic(connectorOf(true), (reversed) => {
      asked.push(reversed);
      return fixtureFor(reversed);
    });
    expect([...asked].sort()).toEqual([false, true]);
  });

  it("fails when the records differ although the bodies do not", async () => {
    const unstable: Connector = {
      ...connectorOf(true),
      parse: (snapshot) => ({
        ...connectorOf(true).parse(snapshot),
        records: [good({ sourceRecordId: `${Math.random()}` })],
      }),
    };
    await expect(expectDeterministic(unstable, fixtureFor)).rejects.toThrow();
  });

  it("fails when the bodies differ although the records do not: the sync hashes the bodies", async () => {
    const inFileOrder = connectorOf(false);
    const sortingRecords: Connector = {
      ...inFileOrder,
      parse: (snapshot) => {
        const result = inFileOrder.parse(snapshot);
        const byId = (a: { sourceRecordId: string }, b: { sourceRecordId: string }) =>
          a.sourceRecordId < b.sourceRecordId ? -1 : 1;
        return { ...result, records: [...result.records].sort(byId) };
      },
    };
    await expect(expectDeterministic(sortingRecords, fixtureFor)).rejects.toThrow();
  });

  it("fails, and says why, when the fixture is answered as unchanged: it shows nothing", async () => {
    const unchanged = (): ConnectorFetch => async (url) => ({ notModified: true, url });
    await expect(expectDeterministic(connectorOf(true), unchanged)).rejects.toThrow("unchanged");
  });
});

describe("fakeFetch", () => {
  const LIMITS = { maxBytes: 100, allowedContentTypes: ["*/*"], totalTimeoutMs: 1000 };
  const URL_A = "https://example.org/a.csv";
  const URL_B = "https://example.org/b.csv";

  it("answers a known address with a 200 answer that the page guard could have given", async () => {
    const fetch = fakeFetch({
      [URL_A]: { body: "a,b\n1,2\n", contentType: "text/csv; charset=utf-8" },
    });

    const response = await fetch(URL_A, {}, LIMITS);

    expect(response).toEqual({
      notModified: false,
      url: URL_A,
      status: 200,
      contentType: "text/csv; charset=utf-8",
      body: Buffer.from("a,b\n1,2\n"),
      truncated: false,
      etag: null,
      lastModified: null,
    });
  });

  it("gives a string as UTF-8 bytes and a buffer as a copy of it", async () => {
    const bytes = Buffer.from([0xef, 0xbb, 0xbf, 0x61, 0x00, 0xff]);
    const fetch = fakeFetch({
      [URL_A]: { body: `a${cp(0xe9)}${cp(0x1f600)}`, contentType: "text/plain" },
      [URL_B]: { body: bytes, contentType: "application/octet-stream" },
    });

    const text = await fetch(URL_A, {}, LIMITS);
    const raw = await fetch(URL_B, {}, LIMITS);

    expect(text.notModified).toBe(false);
    expect(raw.notModified).toBe(false);
    if (text.notModified || raw.notModified) return;
    expect(text.body.toString("utf8")).toBe(`a${cp(0xe9)}${cp(0x1f600)}`);
    expect(raw.body).toEqual(bytes);
    expect(raw.body.equals(bytes)).toBe(true);
    expect(raw.body).not.toBe(bytes);
  });

  it("gives the validators of an entry, and the address that answered when it is not the one asked", async () => {
    const fetch = fakeFetch({
      [URL_A]: {
        body: "x",
        contentType: "text/csv",
        etag: '"v1"',
        lastModified: "Thu, 15 Oct 2026 12:30:03 GMT",
        url: "https://cdn.example.net/moved/a.csv",
      },
    });

    const response = await fetch(URL_A, {}, LIMITS);

    expect(response).toMatchObject({
      notModified: false,
      url: "https://cdn.example.net/moved/a.csv",
      etag: '"v1"',
      lastModified: "Thu, 15 Oct 2026 12:30:03 GMT",
    });
  });

  it("says that a body was cut when the entry says so", async () => {
    const fetch = fakeFetch({ [URL_A]: { body: "x", contentType: "text/csv", truncated: true } });
    expect(await fetch(URL_A, {}, LIMITS)).toMatchObject({ truncated: true });
  });

  it("fails an address that it does not know as an unreachable file, naming nothing", async () => {
    const fetch = fakeFetch({ [URL_A]: { body: "x", contentType: "text/csv" } });

    const failure = await fetch("https://example.org/secret-path.csv", {}, LIMITS).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(FetchError);
    expect((failure as FetchError).reason).toBe("unreachable");
    expect((failure as FetchError).message).not.toContain("secret-path");
    expect((failure as FetchError).message).not.toContain("example.org");
  });

  it("knows only the addresses that it was given, not the names an object has", async () => {
    const fetch = fakeFetch({});
    for (const name of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
      await expect(fetch(name, {}, LIMITS)).rejects.toBeInstanceOf(FetchError);
    }
  });

  describe("when the validators are those of the entry", () => {
    const FILES = {
      [URL_A]: { body: "x", contentType: "text/csv", etag: '"v1"' },
      [URL_B]: {
        body: "y",
        contentType: "text/csv",
        lastModified: "Thu, 15 Oct 2026 12:30:03 GMT",
      },
    };

    it("answers that nothing changed, at the address that answers", async () => {
      const fetch = fakeFetch(FILES);
      expect(await fetch(URL_A, { etag: '"v1"', lastModified: null }, LIMITS)).toEqual({
        notModified: true,
        url: URL_A,
      });
      expect(
        await fetch(URL_B, { etag: null, lastModified: "Thu, 15 Oct 2026 12:30:03 GMT" }, LIMITS),
      ).toEqual({ notModified: true, url: URL_B });
      const moved = fakeFetch({
        [URL_A]: { ...FILES[URL_A], url: "https://cdn.example.net/a.csv" },
      });
      expect(await moved(URL_A, { etag: '"v1"' }, LIMITS)).toEqual({
        notModified: true,
        url: "https://cdn.example.net/a.csv",
      });
    });

    it("answers in full when they are another, or none", async () => {
      const fetch = fakeFetch(FILES);
      for (const validators of [
        {},
        { etag: null, lastModified: null },
        { etag: '"v0"' },
        { lastModified: "Wed, 01 Jan 2025 00:00:00 GMT" },
      ]) {
        const response = await fetch(URL_A, validators, LIMITS);
        expect(response.notModified).toBe(false);
      }
      expect((await fetch(URL_B, { etag: '"v1"' }, LIMITS)).notModified).toBe(false);
    });

    it("goes by the ETag alone when the entry has one, as a server does", async () => {
      const fetch = fakeFetch({
        [URL_A]: {
          body: "x",
          contentType: "text/csv",
          etag: '"v1"',
          lastModified: "Thu, 15 Oct 2026 12:30:03 GMT",
        },
      });
      const sameDateOtherTag = { etag: '"v0"', lastModified: "Thu, 15 Oct 2026 12:30:03 GMT" };
      expect((await fetch(URL_A, sameDateOtherTag, LIMITS)).notModified).toBe(false);
    });
  });

  describe("as the page guard answers (review finding 9)", () => {
    const CSV_ONLY = { ...LIMITS, allowedContentTypes: ["text/csv"] };
    const fileOf = (over: { contentType?: string; body?: string | Buffer } = {}) =>
      fakeFetch({
        [URL_A]: { body: over.body ?? "a,b\n", contentType: over.contentType ?? "text/csv" },
      });
    const failureOf = (promise: Promise<unknown>): Promise<unknown> =>
      promise.then(
        () => undefined,
        (error: unknown) => error,
      );

    describe("the type of the file", () => {
      it("fails a type that the limits do not list, as unsupported_type, naming nothing", async () => {
        const failure = await failureOf(
          fileOf({ contentType: "application/octet-stream" })(URL_A, {}, CSV_ONLY),
        );
        expect(failure).toBeInstanceOf(FetchError);
        expect((failure as FetchError).reason).toBe("unsupported_type");
        expect((failure as FetchError).message).not.toContain("octet-stream");
        expect((failure as FetchError).message).not.toContain("example.org");
      });

      it.each([
        ["with a parameter", "text/csv; charset=utf-8"],
        ["in capitals", "TEXT/CSV"],
        ["with blanks around it", " text/csv ; charset=utf-8"],
        ["with a parameter, and in mixed case", "Text/Csv;Charset=UTF-8"],
        ["with a parameter that has a semicolon in a quote", 'text/csv; name="a;b"'],
      ])("takes a Content-Type of the listed media type %s", async (_name, contentType) => {
        const response = await fileOf({ contentType })(URL_A, {}, CSV_ONLY);
        expect(response).toMatchObject({ notModified: false, contentType });
      });

      it("lists the media types of the limits in any case, as the guard does", async () => {
        const limits = { ...LIMITS, allowedContentTypes: ["TEXT/CSV", "Application/JSON"] };
        expect((await fileOf({ contentType: "text/csv" })(URL_A, {}, limits)).notModified).toBe(
          false,
        );
        expect(
          (await fileOf({ contentType: "application/json" })(URL_A, {}, limits)).notModified,
        ).toBe(false);
      });

      it("takes any type, and none, when the limits list */*", async () => {
        for (const contentType of ["", "application/octet-stream", "weird", "constructor"]) {
          const response = await fileOf({ contentType })(URL_A, {}, LIMITS);
          expect(response.notModified).toBe(false);
        }
      });

      it.each([
        ["none", ""],
        ["a longer subtype", "text/csvx"],
        ["a shorter subtype", "text/cs"],
        ["another family", "application/csv"],
        ["a path of types", "application/text/csv"],
        ["the family alone", "text/"],
        ["the subtype alone", "csv"],
        ["a name that an object has", "constructor"],
        ["a name that an object has, with a parameter", "toString; q=1"],
      ])("fails %s as a Content-Type that is not listed", async (_name, contentType) => {
        const failure = await failureOf(fileOf({ contentType })(URL_A, {}, CSV_ONLY));
        expect(failure).toBeInstanceOf(FetchError);
        expect((failure as FetchError).reason).toBe("unsupported_type");
      });

      it("fails every type when the limits list none", async () => {
        const limits = { ...LIMITS, allowedContentTypes: [] as string[] };
        const failure = await failureOf(fileOf()(URL_A, {}, limits));
        expect((failure as FetchError).reason).toBe("unsupported_type");
      });

      it("answers that nothing changed before it looks at the type, as the guard does with a 304", async () => {
        const fetch = fakeFetch({
          [URL_A]: { body: "x", contentType: "application/octet-stream", etag: '"v1"' },
        });
        expect(await fetch(URL_A, { etag: '"v1"' }, CSV_ONLY)).toEqual({
          notModified: true,
          url: URL_A,
        });
        const failure = await failureOf(fetch(URL_A, { etag: '"v0"' }, CSV_ONLY));
        expect((failure as FetchError).reason).toBe("unsupported_type");
      });

      it("keeps the call of a fetch that failed on its type, for a test to read", async () => {
        const fetch = fileOf({ contentType: "text/html" });
        await failureOf(fetch(URL_A, {}, CSV_ONLY));
        expect(fetch.calls).toHaveLength(1);
      });
    });

    describe("the length of the body", () => {
      const bodyOf = async (body: string | Buffer, maxBytes: number) => {
        const response = await fileOf({ body })(URL_A, {}, { ...LIMITS, maxBytes });
        if (response.notModified) throw new Error("not expected");
        return response;
      };

      it("gives a body that is as long as the limit whole, and says that it was not cut", async () => {
        const response = await bodyOf("12345", 5);
        expect(response.body.toString()).toBe("12345");
        expect(response.truncated).toBe(false);
      });

      it("cuts a body that is a byte longer than the limit, and says so", async () => {
        const response = await bodyOf("123456", 5);
        expect(response.body.toString()).toBe("12345");
        expect(response.truncated).toBe(true);
      });

      it("cuts a long body to the limit, whatever it holds", async () => {
        const response = await bodyOf(Buffer.alloc(10_000, 0x61), 100);
        expect(response.body).toHaveLength(100);
        expect(response.truncated).toBe(true);
      });

      it("cuts by bytes, not by characters: a character may be cut in two, as the guard cuts it", async () => {
        const response = await bodyOf(`a${cp(0xe9)}b`, 2);
        expect(response.body).toEqual(Buffer.from([0x61, 0xc3]));
        expect(response.truncated).toBe(true);
      });

      it("takes a limit of nothing as no byte at all", async () => {
        const response = await bodyOf("abc", 0);
        expect(response.body).toHaveLength(0);
        expect(response.truncated).toBe(true);
        const empty = await bodyOf("", 0);
        expect(empty.truncated).toBe(false);
      });

      it("says that a body was cut when the entry says so, even when it is short", async () => {
        const fetch = fakeFetch({
          [URL_A]: { body: "x", contentType: "text/csv", truncated: true },
        });
        expect(await fetch(URL_A, {}, LIMITS)).toMatchObject({ truncated: true });
      });

      it.each([
        ["not a number", Number.NaN],
        ["infinite", Number.POSITIVE_INFINITY],
        ["negative", -1],
        ["fractional", 1.5],
        ["a text", "100" as unknown as number],
        ["missing", undefined as unknown as number],
      ])(
        "refuses a limit that is %s, as a mistake of the test and not a failure of the fetch",
        async (_name, maxBytes) => {
          const failure = await failureOf(fileOf()(URL_A, {}, { ...LIMITS, maxBytes }));
          expect(failure).toBeInstanceOf(Error);
          expect(failure).not.toBeInstanceOf(FetchError);
          expect((failure as Error).message).toContain("limit");
        },
      );

      it("fails an unknown address as unreachable before it looks at the limits", async () => {
        const failure = await failureOf(
          fakeFetch({})(URL_A, {}, { ...LIMITS, maxBytes: Number.NaN }),
        );
        expect((failure as FetchError).reason).toBe("unreachable");
      });
    });

    describe("the address that answers", () => {
      it("is the address as `new URL` writes it, as the guard gives it", async () => {
        const fetch = fakeFetch({
          [URL_A]: {
            body: "x",
            contentType: "text/csv",
            url: "HTTPS://CDN.Example.NET:443/x/../moved/./a.csv?b=1#top",
          },
          "https://example.org": { body: "y", contentType: "text/csv" },
        });
        expect(await fetch(URL_A, {}, LIMITS)).toMatchObject({
          url: "https://cdn.example.net/moved/a.csv?b=1#top",
        });
        expect(await fetch("https://example.org", {}, LIMITS)).toMatchObject({
          url: "https://example.org/",
        });
      });

      it("is written so for an answer that nothing changed, as well", async () => {
        const fetch = fakeFetch({
          [URL_A]: {
            body: "x",
            contentType: "text/csv",
            etag: '"v1"',
            url: "HTTPS://CDN.Example.NET/a/../a.csv",
          },
        });
        expect(await fetch(URL_A, { etag: '"v1"' }, LIMITS)).toEqual({
          notModified: true,
          url: "https://cdn.example.net/a.csv",
        });
      });

      it("fails with an error of its own, no failure of the fetch, when the entry's address is no address", async () => {
        const fetch = fakeFetch({
          [URL_A]: { body: "x", contentType: "text/csv", url: "not an address" },
        });
        const failure = await failureOf(fetch(URL_A, {}, LIMITS));
        expect(failure).toBeInstanceOf(Error);
        expect(failure).not.toBeInstanceOf(FetchError);
        expect((failure as Error).message).toContain("no address");
        const unchanged = fakeFetch({
          [URL_A]: { body: "x", contentType: "text/csv", etag: '"v1"', url: "https://" },
        });
        const second = await failureOf(unchanged(URL_A, { etag: '"v1"' }, LIMITS));
        expect(second).toBeInstanceOf(Error);
        expect(second).not.toBeInstanceOf(FetchError);
      });
    });

    describe("the body", () => {
      it("is a new buffer at each answer, so that what a reader does to it reaches nothing else", async () => {
        const original = Buffer.from("abcdef");
        const fetch = fakeFetch({ [URL_A]: { body: original, contentType: "text/csv" } });

        const first = await fetch(URL_A, {}, LIMITS);
        if (first.notModified) throw new Error("not expected");
        first.body.fill(0x7a);

        const second = await fetch(URL_A, {}, LIMITS);
        if (second.notModified) throw new Error("not expected");
        expect(second.body.toString()).toBe("abcdef");
        expect(original.toString()).toBe("abcdef");
        expect(second.body).not.toBe(first.body);
      });

      it("is a new buffer when the body is cut, too", async () => {
        const original = Buffer.from("abcdef");
        const fetch = fakeFetch({ [URL_A]: { body: original, contentType: "text/csv" } });
        const response = await fetch(URL_A, {}, { ...LIMITS, maxBytes: 3 });
        if (response.notModified) throw new Error("not expected");
        response.body.fill(0x7a);
        expect(original.toString()).toBe("abcdef");
      });
    });
  });

  it("keeps the calls that it was given, for a test to read", async () => {
    const fetch = fakeFetch({ [URL_A]: { body: "x", contentType: "text/csv" } });
    await fetch(URL_A, { etag: '"e"' }, LIMITS);
    await fetch(URL_B, {}, LIMITS).catch(() => undefined);

    expect(fetch.calls).toEqual([
      { url: URL_A, validators: { etag: '"e"' }, limits: LIMITS },
      { url: URL_B, validators: {}, limits: LIMITS },
    ]);
  });

  it("is a ConnectorFetch, as a connector is given it", () => {
    const fetch: ConnectorFetch = fakeFetch({});
    expect(typeof fetch).toBe("function");
  });
});
