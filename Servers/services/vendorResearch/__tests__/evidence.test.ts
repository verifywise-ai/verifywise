import {
  EvidenceSource,
  ResearchCategory,
} from "../../../domain.layer/interfaces/i.vendorResearch";
import {
  MAX_EVIDENCE_BYTES,
  MAX_PUBLISHED_AT_CHARS,
  MAX_SNIPPET_CHARS,
  MAX_TITLE_CHARS,
  MAX_URL_CHARS,
  buildEvidencePack,
} from "../evidence";
import { SearchHit } from "../searchProvider";

function hit(url: string, overrides: Partial<SearchHit> = {}): SearchHit {
  return {
    url,
    title: `Title of ${url}`,
    content: `Snippet of ${url}`,
    publishedAt: null,
    ...overrides,
  };
}

function results(category: ResearchCategory, ...hits: SearchHit[]) {
  return { category, hits };
}

const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

/** A JSON text that Postgres would refuse: a NUL escape or a surrogate escape. */
const POSTGRES_HOSTILE_JSON = /\\u(?:0000|d[89a-f][0-9a-f]{2})/i;

/** With the u flag a surrogate pair is one code point, so only an unpaired surrogate matches. */
const hasLoneSurrogate = (text: string) => /[\uD800-\uDFFF]/u.test(text);

describe("constants", () => {
  it("limits a snippet to 1,500 characters and the pack to 40,000 bytes", () => {
    expect(MAX_SNIPPET_CHARS).toBe(1500);
    expect(MAX_EVIDENCE_BYTES).toBe(40_000);
  });

  it("limits a title to 300 characters, a URL to 2,048 and a publication date to 64", () => {
    expect(MAX_TITLE_CHARS).toBe(300);
    expect(MAX_URL_CHARS).toBe(2048);
    expect(MAX_PUBLISHED_AT_CHARS).toBe(64);
  });
});

describe("buildEvidencePack", () => {
  it("returns an empty pack for no results, for categories without hits and for nothing usable", () => {
    expect(buildEvidencePack([])).toEqual([]);
    expect(buildEvidencePack([results("security_incidents"), results("certifications")])).toEqual(
      [],
    );
    expect(buildEvidencePack([results("security_incidents", hit("not a url"))])).toEqual([]);
  });

  it("numbers the sources S1..Sn through the categories in category order", () => {
    const pack = buildEvidencePack([
      results("security_incidents", hit("https://a.test/1"), hit("https://a.test/2")),
      results("certifications"),
      results("legal_regulatory", hit("https://b.test/1")),
      results("ai_specific", hit("https://c.test/1"), hit("https://c.test/2")),
    ]);

    expect(pack.map((source) => [source.id, source.category, source.url])).toEqual([
      ["S1", "security_incidents", "https://a.test/1"],
      ["S2", "security_incidents", "https://a.test/2"],
      ["S3", "legal_regulatory", "https://b.test/1"],
      ["S4", "ai_specific", "https://c.test/1"],
      ["S5", "ai_specific", "https://c.test/2"],
    ]);
  });

  it("numbers the sources in category order, whatever order the results come in", () => {
    const input = [
      results(
        "ai_specific",
        hit("https://c.test/1"),
        hit("https://shared.test/x", { title: "ai" }),
      ),
      results("legal_regulatory", hit("https://b.test/1")),
      results(
        "security_incidents",
        hit("https://a.test/1"),
        hit("https://shared.test/x", { title: "security" }),
      ),
      results("ai_specific", hit("https://c.test/2")),
    ];
    const categoriesGiven = input.map((entry) => entry.category);

    const pack = buildEvidencePack(input);

    // Entries of one category keep their order, and the earlier category keeps a shared URL.
    expect(pack.map((source) => [source.id, source.category, source.url, source.title])).toEqual([
      ["S1", "security_incidents", "https://a.test/1", "Title of https://a.test/1"],
      ["S2", "security_incidents", "https://shared.test/x", "security"],
      ["S3", "legal_regulatory", "https://b.test/1", "Title of https://b.test/1"],
      ["S4", "ai_specific", "https://c.test/1", "Title of https://c.test/1"],
      ["S5", "ai_specific", "https://c.test/2", "Title of https://c.test/2"],
    ]);
    // The caller's array is not reordered.
    expect(input.map((entry) => entry.category)).toEqual(categoriesGiven);
  });

  it("carries the title, the snippet and the publication date of each hit", () => {
    const pack = buildEvidencePack([
      results(
        "security_incidents",
        hit("https://a.test/1", {
          title: "Acme breach",
          content: "Acme confirmed an incident.",
          publishedAt: "2026-01-02",
        }),
        hit("https://a.test/2", { publishedAt: null }),
      ),
    ]);

    expect(pack[0]).toEqual<EvidenceSource>({
      id: "S1",
      category: "security_incidents",
      url: "https://a.test/1",
      title: "Acme breach",
      content: "Acme confirmed an incident.",
      publishedAt: "2026-01-02",
    });
    expect(pack[1].publishedAt).toBeNull();
  });

  it("keeps the first occurrence of a URL seen twice, in a category and across categories", () => {
    const pack = buildEvidencePack([
      results(
        "security_incidents",
        hit("https://a.test/1", { title: "first" }),
        hit("https://a.test/1", { title: "second, same category" }),
        hit("https://a.test/2"),
      ),
      results(
        "legal_regulatory",
        hit("https://a.test/2", { title: "third, other category" }),
        hit("https://a.test/3"),
      ),
    ]);

    expect(pack.map((source) => [source.id, source.category, source.url, source.title])).toEqual([
      ["S1", "security_incidents", "https://a.test/1", "first"],
      ["S2", "security_incidents", "https://a.test/2", "Title of https://a.test/2"],
      ["S3", "legal_regulatory", "https://a.test/3", "Title of https://a.test/3"],
    ]);
  });

  it("treats URLs that differ in any character as different pages", () => {
    const pack = buildEvidencePack([
      results("security_incidents", hit("https://a.test/x"), hit("https://a.test/x/")),
      results("legal_regulatory", hit("https://A.test/x"), hit("https://a.test/x?utm=1")),
    ]);

    expect(pack).toHaveLength(4);
  });

  it("does not change the hits it is given", () => {
    const original = hit("https://a.test/1", { content: "a\u0000b".repeat(1000) });
    const snapshot = JSON.parse(JSON.stringify(original));
    const input = [results("security_incidents", original)];

    buildEvidencePack(input);

    expect(original).toEqual(snapshot);
    expect(input[0].hits).toHaveLength(1);
  });

  describe("the snippet limit", () => {
    it("cuts a snippet to 1,500 characters and leaves a shorter one alone", () => {
      const pack = buildEvidencePack([
        results(
          "security_incidents",
          hit("https://a.test/long", { content: "a".repeat(2000) }),
          hit("https://a.test/exact", { content: "b".repeat(1500) }),
          hit("https://a.test/short", { content: "c".repeat(1499) }),
        ),
      ]);

      expect(pack.map((source) => source.content.length)).toEqual([1500, 1500, 1499]);
      expect(pack[0].content).toBe("a".repeat(1500));
    });

    it("never splits a surrogate pair at the cut", () => {
      const pack = buildEvidencePack([
        results(
          "security_incidents",
          // The emoji would start at index 1499 and end at 1500: the cut falls between its halves.
          hit("https://a.test/split", { content: `${"a".repeat(1499)}😀tail` }),
          // The emoji ends exactly at 1500, so it fits.
          hit("https://a.test/fits", { content: `${"a".repeat(1498)}😀tail` }),
        ),
      ]);

      expect(pack[0].content).toBe("a".repeat(1499));
      expect(pack[1].content).toBe(`${"a".repeat(1498)}😀`);
      expect(pack[1].content.length).toBe(1500);
      for (const source of pack) expect(hasLoneSurrogate(source.content)).toBe(false);
    });

    it("cuts after the control characters are gone, so that they do not use up the limit", () => {
      const pack = buildEvidencePack([
        results(
          "security_incidents",
          hit("https://a.test/1", { content: `${"\u0000".repeat(200)}${"a".repeat(1500)}` }),
        ),
      ]);

      expect(pack[0].content).toBe("a".repeat(1500));
    });
  });

  describe("the size limit", () => {
    it("keeps all twenty sources of a full search, whose snippets use up most of the room", () => {
      const hits = Array.from({ length: 20 }, (_, index) =>
        hit(`https://a.test/${index}`, { content: "a".repeat(1500) }),
      );

      const pack = buildEvidencePack([results("security_incidents", ...hits)]);

      expect(pack).toHaveLength(20);
      expect(bytes(pack)).toBeLessThanOrEqual(MAX_EVIDENCE_BYTES);
    });

    it("drops sources from the end until the serialized pack fits, and keeps as many as fit", () => {
      // Three bytes per character: counting characters instead of bytes would keep too many.
      const hits = Array.from({ length: 12 }, (_, index) =>
        hit(`https://a.test/${index}`, { content: "€".repeat(1500) }),
      );
      const everything: EvidenceSource[] = hits.map((entry, index) => ({
        id: `S${index + 1}`,
        category: "security_incidents",
        url: entry.url,
        title: entry.title,
        content: entry.content,
        publishedAt: null,
      }));
      let fitting = everything.length;
      while (bytes(everything.slice(0, fitting)) > MAX_EVIDENCE_BYTES) fitting -= 1;
      // The test only means something if the limit really bites.
      expect(fitting).toBeGreaterThan(0);
      expect(fitting).toBeLessThan(everything.length);

      const pack = buildEvidencePack([results("security_incidents", ...hits)]);

      expect(pack).toEqual(everything.slice(0, fitting));
      expect(bytes(pack)).toBeLessThanOrEqual(MAX_EVIDENCE_BYTES);
      expect(bytes(everything.slice(0, fitting + 1))).toBeGreaterThan(MAX_EVIDENCE_BYTES);
      expect(pack.map((source) => source.id)).toEqual(
        Array.from({ length: fitting }, (_, index) => `S${index + 1}`),
      );
    });

    it("measures the serialized form, in which an escaped character takes more than one byte", () => {
      // Each newline is two bytes in JSON ("\n"), and a quote is two ("\"").
      const content = '"\n'.repeat(750);
      const hits = Array.from({ length: 14 }, (_, index) =>
        hit(`https://a.test/${index}`, { content }),
      );

      const pack = buildEvidencePack([results("security_incidents", ...hits)]);

      expect(pack.length).toBeLessThan(14);
      expect(bytes(pack)).toBeLessThanOrEqual(MAX_EVIDENCE_BYTES);
    });

    it("keeps a pack of exactly 40,000 bytes and drops the last source when it is a single byte over", () => {
      // Seven sources in three-byte characters, then one whose size is tuned byte by byte through
      // its ASCII snippet.
      const fillers = Array.from({ length: 7 }, (_, index) =>
        hit(`https://a.test/${index}`, {
          title: "€".repeat(MAX_TITLE_CHARS),
          content: "€".repeat(MAX_SNIPPET_CHARS),
        }),
      );
      const packWithLastSnippet = (length: number) =>
        buildEvidencePack([
          results(
            "security_incidents",
            ...fillers,
            hit("https://a.test/last", { content: "x".repeat(length) }),
          ),
        ]);
      const exactLength = MAX_EVIDENCE_BYTES - bytes(packWithLastSnippet(0));
      // The tuning has to be possible, or this test would check nothing.
      expect(packWithLastSnippet(0)).toHaveLength(8);
      expect(exactLength).toBeGreaterThan(0);
      expect(exactLength).toBeLessThan(MAX_SNIPPET_CHARS);

      expect(packWithLastSnippet(exactLength)).toHaveLength(8);
      expect(bytes(packWithLastSnippet(exactLength))).toBe(MAX_EVIDENCE_BYTES);
      const oneByteOver = packWithLastSnippet(exactLength + 1);
      expect(oneByteOver.map((source) => source.id)).toEqual([
        "S1",
        "S2",
        "S3",
        "S4",
        "S5",
        "S6",
        "S7",
      ]);
      expect(bytes(oneByteOver)).toBeLessThanOrEqual(MAX_EVIDENCE_BYTES);
    });

    it("does not let one oversized hit empty the pack", () => {
      const pack = buildEvidencePack([
        results(
          "security_incidents",
          hit("https://a.test/1", {
            title: "t".repeat(50_000),
            content: "c".repeat(50_000),
            publishedAt: "d".repeat(50_000),
          }),
          hit(`https://a.test/${"u".repeat(50_000)}`),
          hit("https://a.test/3"),
          hit("https://a.test/4"),
        ),
      ]);

      // The first hit stays with every field cut, the hit with the huge URL is dropped, and the
      // ids of the others follow without a gap.
      expect(pack.map((source) => [source.id, source.url])).toEqual([
        ["S1", "https://a.test/1"],
        ["S2", "https://a.test/3"],
        ["S3", "https://a.test/4"],
      ]);
      expect(pack[0].title).toBe("t".repeat(MAX_TITLE_CHARS));
      expect(pack[0].content).toBe("c".repeat(MAX_SNIPPET_CHARS));
      expect(pack[0].publishedAt).toBeNull();
    });

    it("keeps even the largest source that one hit can make, which takes a fraction of the room", () => {
      // Every field at its limit, in three-byte characters: the most that one source can take.
      const url = `https://a.test/${"€".repeat(MAX_URL_CHARS - "https://a.test/".length)}`;
      const pack = buildEvidencePack([
        results(
          "security_incidents",
          hit(url, {
            title: "€".repeat(MAX_TITLE_CHARS),
            content: "€".repeat(MAX_SNIPPET_CHARS),
            publishedAt: "€".repeat(MAX_PUBLISHED_AT_CHARS),
          }),
        ),
      ]);

      expect(pack).toHaveLength(1);
      expect(pack[0].url).toHaveLength(MAX_URL_CHARS);
      expect(bytes(pack)).toBeLessThan(MAX_EVIDENCE_BYTES / 2);
    });
  });

  describe("limits on the title, the URL and the publication date", () => {
    it("cuts a title to 300 characters without splitting a surrogate pair", () => {
      const pack = buildEvidencePack([
        results(
          "security_incidents",
          hit("https://a.test/long", { title: "t".repeat(1000) }),
          // The emoji would take indexes 299 and 300: the cut falls between its halves.
          hit("https://a.test/split", { title: `${"a".repeat(299)}😀tail` }),
          // The emoji ends exactly at 300, so it fits.
          hit("https://a.test/fits", { title: `${"a".repeat(298)}😀tail` }),
          hit("https://a.test/short", { title: "s".repeat(299) }),
        ),
      ]);

      expect(pack.map((source) => source.title)).toEqual([
        "t".repeat(300),
        "a".repeat(299),
        `${"a".repeat(298)}😀`,
        "s".repeat(299),
      ]);
      for (const source of pack) expect(hasLoneSurrogate(source.title)).toBe(false);
    });

    it("cuts a title after the control characters are gone, so that they do not use up the limit", () => {
      const pack = buildEvidencePack([
        results(
          "security_incidents",
          hit("https://a.test/1", {
            title: `${"\u0000".repeat(500)}${"t".repeat(300)}`,
          }),
        ),
      ]);

      expect(pack[0].title).toBe("t".repeat(300));
    });

    it("drops a hit whose URL is longer than 2,048 characters and keeps one of exactly 2,048", () => {
      const urlOfLength = (length: number) =>
        `https://a.test/${"p".repeat(length - "https://a.test/".length)}`;

      const pack = buildEvidencePack([
        results(
          "security_incidents",
          hit(urlOfLength(MAX_URL_CHARS + 1)),
          hit(urlOfLength(MAX_URL_CHARS)),
          hit("https://a.test/short"),
        ),
      ]);

      expect(pack.map((source) => [source.id, source.url.length])).toEqual([
        ["S1", 2048],
        ["S2", "https://a.test/short".length],
      ]);
    });

    it("turns a publication date of more than 64 characters into none and keeps one of exactly 64", () => {
      const pack = buildEvidencePack([
        results(
          "security_incidents",
          hit("https://a.test/1", { publishedAt: "d".repeat(65) }),
          hit("https://a.test/2", { publishedAt: "d".repeat(64) }),
          // The limit is on the cleaned date: control characters do not count.
          hit("https://a.test/3", { publishedAt: `${"d".repeat(64)}\u0000\u0001` }),
          hit("https://a.test/4", { publishedAt: `${"d".repeat(65)}\u0000` }),
        ),
      ]);

      expect(pack.map((source) => source.publishedAt)).toEqual([
        null,
        "d".repeat(64),
        "d".repeat(64),
        null,
      ]);
    });
  });

  describe("third-party text that Postgres would refuse in the stored pack", () => {
    it("removes a NUL from a snippet and from a title", () => {
      const pack = buildEvidencePack([
        results(
          "security_incidents",
          hit("https://a.test/1", { title: "Ac\u0000me", content: "before\u0000after\u0000" }),
        ),
      ]);

      expect(pack[0].content).toBe("beforeafter");
      expect(pack[0].title).toBe("Acme");
    });

    it("removes every other C0 control character but keeps tab, line feed and carriage return", () => {
      const controls = Array.from({ length: 32 }, (_, code) => String.fromCharCode(code)).join("");
      const pack = buildEvidencePack([
        results(
          "security_incidents",
          hit("https://a.test/1", { title: controls, content: controls }),
        ),
      ]);

      expect(pack[0].content).toBe("\t\n\r");
      expect(pack[0].title).toBe("\t\n\r");
    });

    it("keeps ordinary text, tabs, line breaks and the characters outside the C0 range", () => {
      const content = "Line one\r\n\tLine two\nLine three \u007F\u0085 ünïcödé 日本語";
      const pack = buildEvidencePack([
        results("security_incidents", hit("https://a.test/1", { content })),
      ]);

      expect(pack[0].content).toBe(content);
    });

    it("replaces a lone surrogate with U+FFFD, in a title and in a snippet", () => {
      const pack = buildEvidencePack([
        results(
          "security_incidents",
          hit("https://a.test/1", {
            title: "high\uD800alone and low\uDC00alone",
            content: "end\uD83D",
          }),
          hit("https://a.test/2", { title: "reversed \uDE00\uD83D pair", content: "\uDC00start" }),
        ),
      ]);

      expect(pack[0].title).toBe("high\uFFFDalone and low\uFFFDalone");
      expect(pack[0].content).toBe("end\uFFFD");
      expect(pack[1].title).toBe("reversed \uFFFD\uFFFD pair");
      expect(pack[1].content).toBe("\uFFFDstart");
    });

    it("keeps a valid surrogate pair untouched", () => {
      const title = "Acme 😀 breach \u{1D49C} \uD83D\uDE00";
      const content = "Emoji 😀 and a math letter \u{1D49C} at the end 🔒";
      const pack = buildEvidencePack([
        results("security_incidents", hit("https://a.test/1", { title, content })),
      ]);

      expect(pack[0].title).toBe(title);
      expect(pack[0].content).toBe(content);
    });

    it("cleans the publication date the same way and treats a date with nothing left as none", () => {
      const pack = buildEvidencePack([
        results(
          "security_incidents",
          hit("https://a.test/1", { publishedAt: "2026-01-02\u0000" }),
          hit("https://a.test/2", { publishedAt: "\u0000" }),
          hit("https://a.test/3", { publishedAt: "2026\uD800" }),
        ),
      ]);

      expect(pack.map((source) => source.publishedAt)).toEqual(["2026-01-02", null, "2026\uFFFD"]);
    });

    it("produces a pack whose JSON holds no NUL and no surrogate escape", () => {
      const hostile = "x\u0000y\uD800z\uDC00w\u0001";
      const pack = buildEvidencePack([
        results(
          "security_incidents",
          hit("https://a.test/1", { title: hostile, content: hostile, publishedAt: hostile }),
        ),
      ]);

      expect(JSON.stringify(pack)).not.toMatch(POSTGRES_HOSTILE_JSON);
      // The check itself works: the raw hit is exactly what it exists to catch.
      expect(JSON.stringify({ content: hostile })).toMatch(POSTGRES_HOSTILE_JSON);
    });
  });

  describe("URLs", () => {
    it.each([
      ["a newline", "https://a.test/pa\nth"],
      ["a carriage return", "https://a.test/pa\rth"],
      ["a space", "https://a.test/pa th"],
      ["a tab", "https://a.test/pa\tth"],
      ["a NUL", "https://a.test/pa\u0000th"],
      ["another control character", "https://a.test/pa\u001Fth"],
      ["a DEL", "https://a.test/pa\u007Fth"],
      ["a C1 control character", "https://a.test/pa\u0085th"],
      ["a no-break space", "https://a.test/pa\u00A0th"],
      ["a line separator", "https://a.test/pa\u2028th"],
      ["a lone high surrogate", "https://a.test/pa\uD800th"],
      ["a lone low surrogate", "https://a.test/pa\uDC00th"],
      ["a space at the start", " https://a.test/path"],
      ["a newline at the end", "https://a.test/path\n"],
    ])("drops the whole hit when its URL contains %s", (_label, url) => {
      const pack = buildEvidencePack([
        results("security_incidents", hit(url), hit("https://a.test/good")),
      ]);

      expect(pack.map((source) => [source.id, source.url])).toEqual([
        ["S1", "https://a.test/good"],
      ]);
    });

    it.each([
      ["text that is not a URL", "not a url"],
      ["an empty string", ""],
      ["a relative path", "/security/incident"],
      ["a host without a scheme", "a.test/path"],
      ["ftp", "ftp://a.test/file"],
      ["javascript", "javascript:alert(1)"],
      ["data", "data:text/plain,hello"],
      ["file", "file:///etc/passwd"],
      ["a scheme with no host", "https://"],
    ])("drops the whole hit when its URL is %s", (_label, url) => {
      const pack = buildEvidencePack([
        results("security_incidents", hit(url), hit("https://a.test/good")),
      ]);

      expect(pack.map((source) => source.url)).toEqual(["https://a.test/good"]);
    });

    it("keeps an http or https URL exactly as it was received", () => {
      const urls = ["http://a.test/x", "HTTPS://A.test/Path?q=1#top", "https://a.test/%20encoded"];

      const pack = buildEvidencePack([
        results("security_incidents", ...urls.map((url) => hit(url))),
      ]);

      expect(pack.map((source) => source.url)).toEqual(urls);
    });

    it("gives no id to a dropped hit and does not let it block the real page", () => {
      const pack = buildEvidencePack([
        results(
          "security_incidents",
          hit("https://a.test/1"),
          hit("https://a.test/2\n"),
          hit("https://a.test/2"),
          hit("javascript:alert(1)"),
          hit("https://a.test/3"),
        ),
      ]);

      expect(pack.map((source) => [source.id, source.url])).toEqual([
        ["S1", "https://a.test/1"],
        ["S2", "https://a.test/2"],
        ["S3", "https://a.test/3"],
      ]);
    });
  });
});
