import {
  EvidenceSource,
  ResearchCategory,
} from "../../../domain.layer/interfaces/i.vendorResearch";
import { MAX_EXCERPT_CHARS, MAX_PAGE_CONTENT_CHARS } from "../../webResearch/pageText";
import { LedgerEntry } from "../../webResearch/webSession";
import {
  MAX_EVIDENCE_BYTES,
  MAX_PUBLISHED_AT_CHARS,
  MAX_SNIPPET_CHARS,
  MAX_TITLE_CHARS,
  MAX_URL_CHARS,
  buildEvidencePack,
  isBlockedEntry,
  provenanceOf,
} from "../evidence";

type Entry = LedgerEntry<ResearchCategory>;

/** The snippet of a search result, as the ledger keeps it: of security_incidents, off the vendor's site. */
function entry(url: string, overrides: Partial<Entry> = {}): Entry {
  return {
    category: "security_incidents",
    kind: "result",
    onVendorSite: false,
    url,
    title: `Title of ${url}`,
    content: `Snippet of ${url}`,
    publishedAt: null,
    ...overrides,
  };
}

/** The excerpt of a page that was read. */
const pageEntry = (url: string, overrides: Partial<Entry> = {}): Entry =>
  entry(url, { kind: "page", content: `Excerpt of ${url}`, ...overrides });

/** The entries, tagged with `category`. */
const under = (category: ResearchCategory, ...entries: Entry[]): Entry[] =>
  entries.map((item) => ({ ...item, category }));

const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

/** A JSON text that Postgres would refuse: a NUL escape or a surrogate escape. */
const POSTGRES_HOSTILE_JSON = /\\u(?:0000|d[89a-f][0-9a-f]{2})/i;

/** With the u flag a surrogate pair is one code point, so only an unpaired surrogate matches. */
const hasLoneSurrogate = (text: string) => /[\uD800-\uDFFF]/u.test(text);

describe("constants", () => {
  it("limits a snippet to 1,500 characters, an excerpt to 8,000 and the pack to 100,000 bytes", () => {
    expect(MAX_SNIPPET_CHARS).toBe(1500);
    expect(MAX_EXCERPT_CHARS).toBe(8000);
    expect(MAX_EVIDENCE_BYTES).toBe(100_000);
  });

  // A page source holds the first excerpt and up to two more parts, each behind a gap marker, so
  // that the pack keeps what the model was shown.
  it("limits the content of a page to its first excerpt and two parts, with their gap markers", () => {
    expect(MAX_PAGE_CONTENT_CHARS).toBe(8000 * 3 + 5 * 2);
  });

  it("limits a title to 300 characters, a URL to 2,048 and a publication date to 64", () => {
    expect(MAX_TITLE_CHARS).toBe(300);
    expect(MAX_URL_CHARS).toBe(2048);
    expect(MAX_PUBLISHED_AT_CHARS).toBe(64);
  });
});

describe("buildEvidencePack", () => {
  it("returns an empty pack for an empty ledger and for a ledger with nothing usable", () => {
    expect(buildEvidencePack([])).toEqual([]);
    expect(buildEvidencePack([entry("not a url")])).toEqual([]);
  });

  it("numbers the sources S1..Sn through the categories in category order", () => {
    const pack = buildEvidencePack([
      ...under("security_incidents", entry("https://a.test/1"), entry("https://a.test/2")),
      ...under("legal_regulatory", entry("https://b.test/1")),
      ...under("ai_specific", entry("https://c.test/1"), pageEntry("https://c.test/2")),
    ]);

    expect(pack.map((source) => [source.id, source.category, source.url])).toEqual([
      ["S1", "security_incidents", "https://a.test/1"],
      ["S2", "security_incidents", "https://a.test/2"],
      ["S3", "legal_regulatory", "https://b.test/1"],
      ["S4", "ai_specific", "https://c.test/1"],
      ["S5", "ai_specific", "https://c.test/2"],
    ]);
  });

  it("orders by category, then by the order the loop got the entries, whatever order they come in", () => {
    const input = [
      ...under("ai_specific", entry("https://c.test/1"), pageEntry("https://c.test/page")),
      ...under("security_incidents", pageEntry("https://a.test/page")),
      ...under("legal_regulatory", entry("https://b.test/1")),
      ...under("security_incidents", entry("https://a.test/1")),
      ...under("ai_specific", entry("https://c.test/2")),
    ];
    const urlsGiven = input.map((item) => item.url);

    const pack = buildEvidencePack(input);

    expect(pack.map((source) => [source.id, source.category, source.url])).toEqual([
      ["S1", "security_incidents", "https://a.test/page"],
      ["S2", "security_incidents", "https://a.test/1"],
      ["S3", "legal_regulatory", "https://b.test/1"],
      ["S4", "ai_specific", "https://c.test/1"],
      ["S5", "ai_specific", "https://c.test/page"],
      ["S6", "ai_specific", "https://c.test/2"],
    ]);
    // The caller's array is not reordered.
    expect(input.map((item) => item.url)).toEqual(urlsGiven);
  });

  it("carries the kind, the vendor's mark, the title, the content and the date of each entry", () => {
    const pack = buildEvidencePack([
      entry("https://news.example.com/acme-breach", {
        title: "Acme breach",
        content: "Acme confirmed an incident.",
        publishedAt: "2026-01-02",
      }),
      pageEntry("https://trust.acme.com/", {
        category: "certifications",
        onVendorSite: true,
        title: "Acme trust centre",
        content: "Our SOC 2 Type II audit is in progress.\n[…]\nContact us.",
      }),
    ]);

    expect(pack).toEqual<EvidenceSource[]>([
      {
        id: "S1",
        category: "security_incidents",
        kind: "result",
        onVendorSite: false,
        url: "https://news.example.com/acme-breach",
        title: "Acme breach",
        content: "Acme confirmed an incident.",
        publishedAt: "2026-01-02",
      },
      {
        id: "S2",
        category: "certifications",
        kind: "page",
        onVendorSite: true,
        url: "https://trust.acme.com/",
        title: "Acme trust centre",
        content: "Our SOC 2 Type II audit is in progress.\n[…]\nContact us.",
        publishedAt: null,
      },
    ]);
  });

  it("takes the vendor's mark from the entry alone, never from the host of its URL", () => {
    const pack = buildEvidencePack([
      // A result on the vendor's own site, as the session marks it.
      entry("https://acme.com/privacy", { onVendorSite: true }),
      // A page asked for on the vendor's site that answered from another one after a redirect.
      pageEntry("https://acme.com/blog", { onVendorSite: false }),
      // The session's word holds for any host.
      pageEntry("https://status.example.net/acme", { onVendorSite: true }),
    ]);

    expect(pack.map((source) => [source.url, source.onVendorSite])).toEqual([
      ["https://acme.com/privacy", true],
      ["https://acme.com/blog", false],
      ["https://status.example.net/acme", true],
    ]);
  });

  it("keeps the first entry of a URL seen twice, in a category and across categories", () => {
    const pack = buildEvidencePack([
      ...under(
        "security_incidents",
        entry("https://a.test/1", { title: "first" }),
        pageEntry("https://a.test/1", { title: "second, same category" }),
        entry("https://a.test/2"),
      ),
      ...under(
        "legal_regulatory",
        entry("https://a.test/2", { title: "third, other category" }),
        entry("https://a.test/3"),
      ),
    ]);

    expect(
      pack.map((source) => [source.id, source.category, source.kind, source.url, source.title]),
    ).toEqual([
      ["S1", "security_incidents", "result", "https://a.test/1", "first"],
      ["S2", "security_incidents", "result", "https://a.test/2", "Title of https://a.test/2"],
      ["S3", "legal_regulatory", "result", "https://a.test/3", "Title of https://a.test/3"],
    ]);
  });

  it("treats URLs that differ in any character as different pages", () => {
    const pack = buildEvidencePack([
      ...under("security_incidents", entry("https://a.test/x"), entry("https://a.test/x/")),
      ...under("legal_regulatory", entry("https://A.test/x"), entry("https://a.test/x?utm=1")),
    ]);

    expect(pack).toHaveLength(4);
  });

  it("does not change the entries it is given", () => {
    const original = pageEntry("https://a.test/1", { content: "a\u0000b".repeat(5000) });
    const snapshot = JSON.parse(JSON.stringify(original));
    const input = [original];

    buildEvidencePack(input);

    expect(original).toEqual(snapshot);
    expect(input).toHaveLength(1);
  });

  describe("the length of the content", () => {
    it("cuts the snippet of a result to 1,500 characters and leaves a shorter one alone", () => {
      const pack = buildEvidencePack([
        entry("https://a.test/long", { content: "a".repeat(2000) }),
        entry("https://a.test/exact", { content: "b".repeat(1500) }),
        entry("https://a.test/short", { content: "c".repeat(1499) }),
      ]);

      expect(pack.map((source) => source.content.length)).toEqual([1500, 1500, 1499]);
      expect(pack[0].content).toBe("a".repeat(1500));
    });

    it("keeps the content of a page up to the limit of a page source and cuts a longer one there", () => {
      const pack = buildEvidencePack([
        pageEntry("https://a.test/medium", { content: "m".repeat(5000) }),
        // An excerpt and the parts that were read after it.
        pageEntry("https://a.test/exact", { content: "e".repeat(MAX_PAGE_CONTENT_CHARS) }),
        pageEntry("https://a.test/long", { content: "l".repeat(MAX_PAGE_CONTENT_CHARS + 1000) }),
        // The same text as a result is cut at the length of a snippet.
        entry("https://a.test/as-result", { content: "r".repeat(5000) }),
      ]);

      expect(pack.map((source) => source.content.length)).toEqual([
        5000,
        MAX_PAGE_CONTENT_CHARS,
        MAX_PAGE_CONTENT_CHARS,
        MAX_SNIPPET_CHARS,
      ]);
      expect(pack[2].content).toBe("l".repeat(MAX_PAGE_CONTENT_CHARS));
    });

    it("never splits a surrogate pair at the cut", () => {
      const pack = buildEvidencePack([
        // The emoji would start at index 1499 and end at 1500: the cut falls between its halves.
        entry("https://a.test/split", { content: `${"a".repeat(1499)}😀tail` }),
        // The emoji ends exactly at 1500, so it fits.
        entry("https://a.test/fits", { content: `${"a".repeat(1498)}😀tail` }),
        // The same at the end of a page source.
        pageEntry("https://a.test/page", {
          content: `${"p".repeat(MAX_PAGE_CONTENT_CHARS - 1)}😀tail`,
        }),
      ]);

      expect(pack[0].content).toBe("a".repeat(1499));
      expect(pack[1].content).toBe(`${"a".repeat(1498)}😀`);
      expect(pack[1].content.length).toBe(1500);
      expect(pack[2].content).toBe("p".repeat(MAX_PAGE_CONTENT_CHARS - 1));
      for (const source of pack) expect(hasLoneSurrogate(source.content)).toBe(false);
    });

    it("cuts after the control characters are gone, so that they do not use up the limit", () => {
      const pack = buildEvidencePack([
        entry("https://a.test/1", { content: `${"\u0000".repeat(200)}${"a".repeat(1500)}` }),
        pageEntry("https://a.test/2", {
          content: `${"\u0000".repeat(200)}${"b".repeat(MAX_PAGE_CONTENT_CHARS)}`,
        }),
      ]);

      expect(pack[0].content).toBe("a".repeat(1500));
      expect(pack[1].content).toBe("b".repeat(MAX_PAGE_CONTENT_CHARS));
    });
  });

  // Review Focus 5: however much the loop collected, the pack stays within its size.
  describe("the size limit", () => {
    it("keeps all twelve pages that a run can read, each with a full excerpt", () => {
      const pages = Array.from({ length: 12 }, (_, index) =>
        pageEntry(`https://a.test/${index}`, { content: "a".repeat(MAX_EXCERPT_CHARS) }),
      );

      const pack = buildEvidencePack(pages);

      expect(pack).toHaveLength(12);
      expect(bytes(pack)).toBeLessThanOrEqual(MAX_EVIDENCE_BYTES);
    });

    it("drops sources from the end until the serialized pack fits, and keeps as many as fit", () => {
      // Three bytes per character: counting characters instead of bytes would keep too many.
      const pages = Array.from({ length: 6 }, (_, index) =>
        pageEntry(`https://a.test/${index}`, { content: "€".repeat(MAX_EXCERPT_CHARS) }),
      );
      const everything: EvidenceSource[] = pages.map((item, index) => ({
        id: `S${index + 1}`,
        category: "security_incidents",
        kind: "page",
        onVendorSite: false,
        url: item.url,
        title: item.title,
        content: item.content,
        publishedAt: null,
      }));
      let fitting = everything.length;
      while (bytes(everything.slice(0, fitting)) > MAX_EVIDENCE_BYTES) fitting -= 1;
      // The test only means something if the limit really bites.
      expect(fitting).toBeGreaterThan(0);
      expect(fitting).toBeLessThan(everything.length);

      const pack = buildEvidencePack(pages);

      expect(pack).toEqual(everything.slice(0, fitting));
      expect(bytes(pack)).toBeLessThanOrEqual(MAX_EVIDENCE_BYTES);
      expect(bytes(everything.slice(0, fitting + 1))).toBeGreaterThan(MAX_EVIDENCE_BYTES);
      expect(pack.map((source) => source.id)).toEqual(
        Array.from({ length: fitting }, (_, index) => `S${index + 1}`),
      );
    });

    describe("a pack over the limit is trimmed from the category that holds the most bytes", () => {
      const fullPage = (url: string) => pageEntry(url, { content: "a".repeat(MAX_EXCERPT_CHARS) });
      const pagesOn = (host: string, count: number) =>
        Array.from({ length: count }, (_, index) => fullPage(`https://${host}.test/${index}`));
      /** What the pack must be when nothing is cut: entries already in category order, S1..Sn. */
      const asSources = (entries: Entry[]): EvidenceSource[] =>
        entries.map((item, index) => ({ id: `S${index + 1}`, ...item }));
      const summary = (pack: EvidenceSource[]) =>
        pack.map((source) => [source.id, source.category, source.url]);
      // The name of the category is part of the serialized source. A page of security_incidents with
      // an excerpt shorter by the difference of the two names weighs the same as a page of
      // certifications with a full one.
      const NAME_DIFFERENCE = "security_incidents".length - "certifications".length;
      const equalWeightPages = (count: number) =>
        under(
          "security_incidents",
          ...Array.from({ length: count }, (_, index) =>
            pageEntry(`https://a.test/${index}`, {
              content: "a".repeat(MAX_EXCERPT_CHARS - NAME_DIFFERENCE),
            }),
          ),
        );

      it("keeps a source of every category when the first one alone is over the limit", () => {
        const first = under("security_incidents", ...pagesOn("a", 14));
        const rest = [
          ...under("certifications", ...pagesOn("b", 2)),
          ...under("legal_regulatory", ...pagesOn("c", 1)),
          // The last category, with a single page: the old rule removed it first.
          ...under("ai_specific", ...pagesOn("d", 1)),
        ];
        expect(bytes(asSources(first))).toBeGreaterThan(MAX_EVIDENCE_BYTES);
        // How many pages of the first category fit next to the others.
        let room = first.length;
        while (bytes(asSources([...first.slice(0, room), ...rest])) > MAX_EVIDENCE_BYTES) room -= 1;
        expect(room).toBeGreaterThan(1);
        expect(room).toBeLessThan(first.length);

        const pack = buildEvidencePack([...first, ...rest]);

        expect(bytes(pack)).toBeLessThanOrEqual(MAX_EVIDENCE_BYTES);
        expect(new Set(pack.map((source) => source.category))).toEqual(
          new Set(["security_incidents", "certifications", "legal_regulatory", "ai_specific"]),
        );
        // Only the last pages of the largest category are gone: the earlier ones and the other
        // categories are as they were, and the ids follow without a gap.
        for (const removed of first.slice(room)) {
          expect(pack.map((source) => source.url)).not.toContain(removed.url);
        }
        expect(summary(pack)).toEqual(summary(asSources([...first.slice(0, room), ...rest])));
      });

      it("never empties a category with one source while a larger category is there", () => {
        // The largest category is in the middle, with one page of another category on each side of
        // it in the category order, and the first category has nothing.
        const big = under("legal_regulatory", ...pagesOn("c", 14));
        const before = under("certifications", ...pagesOn("b", 1));
        const after = under("ai_specific", ...pagesOn("d", 1));

        const pack = buildEvidencePack([...after, ...big, ...before]);

        expect(bytes(pack)).toBeLessThanOrEqual(MAX_EVIDENCE_BYTES);
        const perCategory = new Map<string, number>();
        for (const source of pack) {
          perCategory.set(source.category, (perCategory.get(source.category) ?? 0) + 1);
        }
        expect(perCategory.get("certifications")).toBe(1);
        expect(perCategory.get("ai_specific")).toBe(1);
        expect(perCategory.has("security_incidents")).toBe(false);
        expect(perCategory.get("legal_regulatory")).toBeGreaterThan(1);
        expect(perCategory.get("legal_regulatory")).toBeLessThan(big.length);
        // The entries came in any order. The pack is by category and numbered without a gap, and the
        // pages that stay are the first ones of the largest category, in the order they came.
        expect(pack.map((source) => source.id)).toEqual(pack.map((_, index) => `S${index + 1}`));
        const legalKept = perCategory.get("legal_regulatory") ?? 0;
        expect(pack.map((source) => source.category)).toEqual([
          "certifications",
          ...Array(legalKept).fill("legal_regulatory"),
          "ai_specific",
        ]);
        expect(
          pack
            .filter((source) => source.category === "legal_regulatory")
            .map((source) => source.url),
        ).toEqual(big.slice(0, legalKept).map((item) => item.url));
      });

      it("removes from the later of two categories that hold the same number of bytes", () => {
        const earlier = equalWeightPages(6);
        const later = under("certifications", ...pagesOn("b", 6));
        // A small third category tips the pack just over the limit, so one removal is enough.
        const small = under(
          "ai_specific",
          pageEntry("https://c.test/0", { content: "c".repeat(3000) }),
        );
        const sizeOf = (item: Entry) => bytes(buildEvidencePack([item]));
        expect(sizeOf(earlier[0])).toBe(sizeOf(later[0]));
        expect(bytes(asSources([...earlier, ...later, ...small]))).toBeGreaterThan(
          MAX_EVIDENCE_BYTES,
        );
        expect(bytes(asSources([...earlier, ...later.slice(0, 5), ...small]))).toBeLessThanOrEqual(
          MAX_EVIDENCE_BYTES,
        );

        const pack = buildEvidencePack([...earlier, ...later, ...small]);

        expect(summary(pack)).toEqual(
          summary(asSources([...earlier, ...later.slice(0, 5), ...small])),
        );
      });

      it("takes the next removal from the category that is then the largest", () => {
        // Two categories of 8 pages each: the removals alternate, later category first, so the
        // pack ends with 6 and 6 pages and not with 8 and 4.
        const earlier = equalWeightPages(8);
        const later = under("certifications", ...pagesOn("b", 8));

        const pack = buildEvidencePack([...earlier, ...later]);

        expect(bytes(pack)).toBeLessThanOrEqual(MAX_EVIDENCE_BYTES);
        expect(summary(pack)).toEqual(
          summary(asSources([...earlier.slice(0, 6), ...later.slice(0, 6)])),
        );
      });

      it("returns a pack that is within the limit as it is, with the same ids in the same order", () => {
        const entries = [
          ...under("security_incidents", ...pagesOn("a", 4)),
          ...under("certifications", ...pagesOn("b", 3)),
          ...under("legal_regulatory", ...pagesOn("c", 3)),
          ...under("ai_specific", ...pagesOn("d", 2)),
        ];
        expect(bytes(asSources(entries))).toBeLessThanOrEqual(MAX_EVIDENCE_BYTES);
        // Close to the limit, so that a trimming that started too early would show.
        expect(bytes(asSources(entries))).toBeGreaterThan(MAX_EVIDENCE_BYTES - 2 * 8200);

        const pack = buildEvidencePack(entries);

        expect(pack).toEqual(asSources(entries));
      });

      // A page in a script of three bytes a character (CJK, Hangul, Devanagari, Thai) with a full
      // title and a full excerpt takes about 25 KB, a quarter of the pack. One page can be the
      // largest category, so "the category that holds the most bytes" may hold a single source.
      describe("a category with a single source, in a script of three bytes a character", () => {
        const euro = (count: number) => "€".repeat(count);
        const euroPage = (url: string, overrides: Partial<Entry> = {}) =>
          pageEntry(url, {
            title: euro(MAX_TITLE_CHARS),
            content: euro(MAX_EXCERPT_CHARS),
            ...overrides,
          });
        const onePerCategory = (
          overrides: Partial<Entry> = {},
          urlOf = (index: number) => `https://x${index}.test/0`,
        ) => [
          ...under("security_incidents", euroPage(urlOf(0), overrides)),
          ...under("certifications", euroPage(urlOf(1), overrides)),
          ...under("legal_regulatory", euroPage(urlOf(2), overrides)),
          ...under("ai_specific", euroPage(urlOf(3), overrides)),
        ];
        const CATEGORIES = [
          "security_incidents",
          "certifications",
          "legal_regulatory",
          "ai_specific",
        ];

        it("keeps all four categories when each holds one page and the pack is just over the limit", () => {
          const entries = onePerCategory();
          expect(bytes(asSources(entries))).toBeGreaterThan(MAX_EVIDENCE_BYTES);

          const pack = buildEvidencePack(entries);

          expect(pack.map((source) => source.category)).toEqual(CATEGORIES);
          expect(bytes(pack)).toBeLessThanOrEqual(MAX_EVIDENCE_BYTES);
          // The excerpt of the largest source (the longest category name) is cut, as a prefix and no
          // deeper than one character of three bytes needs. Nothing else changes.
          expect(bytes(pack)).toBeGreaterThan(MAX_EVIDENCE_BYTES - 3);
          const [cut, ...rest] = pack;
          expect(cut.content.length).toBeLessThan(MAX_EXCERPT_CHARS);
          expect(entries[0].content.startsWith(cut.content)).toBe(true);
          expect({ ...cut, content: "" }).toEqual({ ...asSources(entries)[0], content: "" });
          expect(rest).toEqual(asSources(entries).slice(1));
        });

        it("takes a source from a category that has two, not the only one of the largest category", () => {
          // certifications holds one page with a long URL, the largest category; the other three
          // hold two pages each, a little less. The old rule emptied certifications.
          const single = under("certifications", euroPage(`https://b.test/${euro(2000)}`));
          const twoPages = (category: ResearchCategory, host: string) =>
            under(
              category,
              euroPage(`https://${host}.test/0`, { content: euro(4800) }),
              euroPage(`https://${host}.test/1`, { content: euro(4800) }),
            );
          const security = twoPages("security_incidents", "a");
          const legal = twoPages("legal_regulatory", "c");
          const ai = twoPages("ai_specific", "d");
          const entries = [...security, ...single, ...legal, ...ai];
          expect(bytes(asSources(single))).toBeGreaterThan(bytes(asSources(security)));
          expect(bytes(asSources(entries))).toBeGreaterThan(MAX_EVIDENCE_BYTES + 15_000);

          const pack = buildEvidencePack(entries);

          // Two removals are needed: the last page of the largest category with two pages, then of
          // the largest one after that. certifications keeps its page, whole.
          expect(summary(pack)).toEqual(
            summary(asSources([security[0], single[0], legal[0], ...ai])),
          );
          expect(pack[1].content).toBe(euro(MAX_EXCERPT_CHARS));
          expect(bytes(pack)).toBeLessThanOrEqual(MAX_EVIDENCE_BYTES);
        });

        it("cuts the next largest source when the excerpt of the largest is not enough", () => {
          // Every field at its limit: four sources of 31 KB, 24 KB of them the excerpt. The pack is
          // over by more than one excerpt.
          const prefix = "https://a.test/";
          const entries = onePerCategory(
            {},
            (index) => `${prefix}${euro(MAX_URL_CHARS - prefix.length - 1)}${index}`,
          ).map((item) => ({ ...item, publishedAt: euro(MAX_PUBLISHED_AT_CHARS) }));
          expect(bytes(asSources(entries)) - MAX_EVIDENCE_BYTES).toBeGreaterThan(
            bytes(euro(MAX_EXCERPT_CHARS)),
          );

          const pack = buildEvidencePack(entries);

          expect(pack.map((source) => source.category)).toEqual(CATEGORIES);
          expect(bytes(pack)).toBeLessThanOrEqual(MAX_EVIDENCE_BYTES);
          expect(pack.filter((source) => source.content.length < MAX_EXCERPT_CHARS)).toHaveLength(
            2,
          );
          pack.forEach((source, index) => {
            expect(entries[index].content.startsWith(source.content)).toBe(true);
            expect(source.url).toBe(entries[index].url);
            expect(source.title).toBe(entries[index].title);
          });
        });

        it("does not leave half of a surrogate pair where the excerpt is cut", () => {
          // The excerpt ends in 100 emoji of four bytes (two UTF-16 units each): the cut, of a few
          // hundred bytes, falls among them.
          const content = `${euro(7800)}${"\u{1F600}".repeat(100)}`;
          const entries = onePerCategory(
            { content },
            (index) => `https://x${index}.test/${euro(80)}`,
          );
          const over = bytes(asSources(entries)) - MAX_EVIDENCE_BYTES;
          expect(over).toBeGreaterThan(0);
          expect(over).toBeLessThan(400);

          const pack = buildEvidencePack(entries);

          expect(pack).toHaveLength(4);
          expect(bytes(pack)).toBeLessThanOrEqual(MAX_EVIDENCE_BYTES);
          expect(pack[0].content.length).toBeGreaterThan(7800);
          expect(pack[0].content.length).toBeLessThan(content.length);
          expect(content.startsWith(pack[0].content)).toBe(true);
          expect(hasLoneSurrogate(pack[0].content)).toBe(false);
          expect(JSON.stringify(pack)).not.toMatch(POSTGRES_HOSTILE_JSON);
        });
      });
    });

    it("measures the serialized form, in which an escaped character takes more than one byte", () => {
      // Each newline is two bytes in JSON ("\n"), and a quote is two ("\""): 64,000 characters in
      // all, but 128,000 bytes.
      const content = '"\n'.repeat(MAX_EXCERPT_CHARS / 2);
      const pages = Array.from({ length: 8 }, (_, index) =>
        pageEntry(`https://a.test/${index}`, { content }),
      );

      const pack = buildEvidencePack(pages);

      expect(pack.length).toBeLessThan(8);
      expect(bytes(pack)).toBeLessThanOrEqual(MAX_EVIDENCE_BYTES);
    });

    it("keeps a pack of exactly 100,000 bytes and drops the last source when it is a single byte over", () => {
      // Four excerpts in three-byte characters, then one whose size is tuned byte by byte through
      // its ASCII excerpt.
      const fillers = Array.from({ length: 4 }, (_, index) =>
        pageEntry(`https://a.test/${index}`, { content: "€".repeat(MAX_EXCERPT_CHARS) }),
      );
      const packWithLastExcerpt = (length: number) =>
        buildEvidencePack([
          ...fillers,
          pageEntry("https://a.test/last", { content: "x".repeat(length) }),
        ]);
      const exactLength = MAX_EVIDENCE_BYTES - bytes(packWithLastExcerpt(0));
      // The tuning has to be possible, or this test would check nothing.
      expect(packWithLastExcerpt(0)).toHaveLength(5);
      expect(exactLength).toBeGreaterThan(0);
      expect(exactLength).toBeLessThan(MAX_EXCERPT_CHARS);

      expect(packWithLastExcerpt(exactLength)).toHaveLength(5);
      expect(bytes(packWithLastExcerpt(exactLength))).toBe(MAX_EVIDENCE_BYTES);
      const oneByteOver = packWithLastExcerpt(exactLength + 1);
      expect(oneByteOver.map((source) => source.id)).toEqual(["S1", "S2", "S3", "S4"]);
      expect(bytes(oneByteOver)).toBeLessThanOrEqual(MAX_EVIDENCE_BYTES);
    });

    it("counts the ids of ten and more sources, which are longer than those of the first nine", () => {
      // Twelve full pages and a last one that is tuned byte by byte: its id is S13, three characters
      // against the two of S1..S9, and the sources are the ones the pack is built from.
      const fillers = Array.from({ length: 12 }, (_, index) =>
        pageEntry(`https://a.test/${index}`, { content: "a".repeat(MAX_EXCERPT_CHARS) }),
      );
      const withLast = (length: number): Entry[] => [
        ...fillers,
        pageEntry("https://a.test/last", { content: "x".repeat(length) }),
      ];
      const sourcesOf = (entries: Entry[]): EvidenceSource[] =>
        entries.map((item, index) => ({ id: `S${index + 1}`, ...item }));
      const exactLength = MAX_EVIDENCE_BYTES - bytes(sourcesOf(withLast(0)));
      expect(exactLength).toBeGreaterThan(0);
      expect(exactLength).toBeLessThan(MAX_EXCERPT_CHARS);
      expect(bytes(sourcesOf(withLast(exactLength)))).toBe(MAX_EVIDENCE_BYTES);

      expect(buildEvidencePack(withLast(exactLength))).toEqual(sourcesOf(withLast(exactLength)));
      // One byte more is over the limit however short the ids are counted.
      const oneByteOver = buildEvidencePack(withLast(exactLength + 1));
      expect(oneByteOver.map((source) => source.id)).toEqual(
        Array.from({ length: 12 }, (_, index) => `S${index + 1}`),
      );
      expect(bytes(oneByteOver)).toBeLessThanOrEqual(MAX_EVIDENCE_BYTES);
    });

    it("does not let one oversized entry empty the pack", () => {
      const pack = buildEvidencePack([
        pageEntry("https://a.test/1", {
          title: "t".repeat(50_000),
          content: "c".repeat(150_000),
          publishedAt: "d".repeat(50_000),
        }),
        entry(`https://a.test/${"u".repeat(150_000)}`),
        entry("https://a.test/3"),
        entry("https://a.test/4"),
      ]);

      // The first entry stays with every field cut, the entry with the huge URL is dropped, and the
      // ids of the others follow without a gap.
      expect(pack.map((source) => [source.id, source.url])).toEqual([
        ["S1", "https://a.test/1"],
        ["S2", "https://a.test/3"],
        ["S3", "https://a.test/4"],
      ]);
      expect(pack[0].title).toBe("t".repeat(MAX_TITLE_CHARS));
      expect(pack[0].content).toBe("c".repeat(MAX_PAGE_CONTENT_CHARS));
      expect(pack[0].publishedAt).toBeNull();
    });

    it("keeps even the largest source that one entry can make, which still leaves room in the pack", () => {
      // Every field at its limit, in three-byte characters: the most that one source can take.
      const url = `https://a.test/${"€".repeat(MAX_URL_CHARS - "https://a.test/".length)}`;
      const pack = buildEvidencePack([
        pageEntry(url, {
          title: "€".repeat(MAX_TITLE_CHARS),
          content: "€".repeat(MAX_PAGE_CONTENT_CHARS),
          publishedAt: "€".repeat(MAX_PUBLISHED_AT_CHARS),
        }),
      ]);

      expect(pack).toHaveLength(1);
      expect(pack[0].url).toHaveLength(MAX_URL_CHARS);
      // A page source with its extra parts, in three-byte characters, takes most of the room but
      // never all of it.
      expect(bytes(pack)).toBeLessThan(MAX_EVIDENCE_BYTES);
    });
  });

  describe("limits on the title, the URL and the publication date", () => {
    it("cuts a title to 300 characters without splitting a surrogate pair", () => {
      const pack = buildEvidencePack([
        entry("https://a.test/long", { title: "t".repeat(1000) }),
        // The emoji would take indexes 299 and 300: the cut falls between its halves.
        entry("https://a.test/split", { title: `${"a".repeat(299)}😀tail` }),
        // The emoji ends exactly at 300, so it fits.
        entry("https://a.test/fits", { title: `${"a".repeat(298)}😀tail` }),
        entry("https://a.test/short", { title: "s".repeat(299) }),
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
        entry("https://a.test/1", { title: `${"\u0000".repeat(500)}${"t".repeat(300)}` }),
      ]);

      expect(pack[0].title).toBe("t".repeat(300));
    });

    it("drops an entry whose URL is longer than 2,048 characters and keeps one of exactly 2,048", () => {
      const urlOfLength = (length: number) =>
        `https://a.test/${"p".repeat(length - "https://a.test/".length)}`;

      const pack = buildEvidencePack([
        entry(urlOfLength(MAX_URL_CHARS + 1)),
        entry(urlOfLength(MAX_URL_CHARS)),
        entry("https://a.test/short"),
      ]);

      expect(pack.map((source) => [source.id, source.url.length])).toEqual([
        ["S1", 2048],
        ["S2", "https://a.test/short".length],
      ]);
    });

    it("turns a publication date of more than 64 characters into none and keeps one of exactly 64", () => {
      const pack = buildEvidencePack([
        entry("https://a.test/1", { publishedAt: "d".repeat(65) }),
        entry("https://a.test/2", { publishedAt: "d".repeat(64) }),
        // The limit is on the cleaned date: control characters do not count.
        entry("https://a.test/3", { publishedAt: `${"d".repeat(64)}\u0000\u0001` }),
        entry("https://a.test/4", { publishedAt: `${"d".repeat(65)}\u0000` }),
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
    it("removes a NUL from a snippet, an excerpt and a title", () => {
      const pack = buildEvidencePack([
        entry("https://a.test/1", { title: "Ac\u0000me", content: "before\u0000after\u0000" }),
        pageEntry("https://a.test/2", { content: "page\u0000text" }),
      ]);

      expect(pack[0].content).toBe("beforeafter");
      expect(pack[0].title).toBe("Acme");
      expect(pack[1].content).toBe("pagetext");
    });

    it("removes every other C0 control character but keeps tab, line feed and carriage return", () => {
      const controls = Array.from({ length: 32 }, (_, code) => String.fromCharCode(code)).join("");
      const pack = buildEvidencePack([
        entry("https://a.test/1", { title: controls, content: controls }),
      ]);

      expect(pack[0].content).toBe("\t\n\r");
      expect(pack[0].title).toBe("\t\n\r");
    });

    it("keeps ordinary text, tabs, line breaks and the characters outside the C0 range", () => {
      const content = "Line one\r\n\tLine two\nLine three \u007F\u0085 ünïcödé 日本語";
      const pack = buildEvidencePack([entry("https://a.test/1", { content })]);

      expect(pack[0].content).toBe(content);
    });

    it("replaces a lone surrogate with U+FFFD, in a title, a snippet and an excerpt", () => {
      const pack = buildEvidencePack([
        entry("https://a.test/1", {
          title: "high\uD800alone and low\uDC00alone",
          content: "end\uD83D",
        }),
        entry("https://a.test/2", { title: "reversed \uDE00\uD83D pair", content: "\uDC00start" }),
        pageEntry("https://a.test/3", { content: "page \uD800 text" }),
      ]);

      expect(pack[0].title).toBe("high\uFFFDalone and low\uFFFDalone");
      expect(pack[0].content).toBe("end\uFFFD");
      expect(pack[1].title).toBe("reversed \uFFFD\uFFFD pair");
      expect(pack[1].content).toBe("\uFFFDstart");
      expect(pack[2].content).toBe("page \uFFFD text");
    });

    it("keeps a valid surrogate pair untouched", () => {
      const title = "Acme 😀 breach \u{1D49C} \uD83D\uDE00";
      const content = "Emoji 😀 and a math letter \u{1D49C} at the end 🔒";
      const pack = buildEvidencePack([entry("https://a.test/1", { title, content })]);

      expect(pack[0].title).toBe(title);
      expect(pack[0].content).toBe(content);
    });

    it("cleans the publication date the same way and treats a date with nothing left as none", () => {
      const pack = buildEvidencePack([
        entry("https://a.test/1", { publishedAt: "2026-01-02\u0000" }),
        entry("https://a.test/2", { publishedAt: "\u0000" }),
        entry("https://a.test/3", { publishedAt: "2026\uD800" }),
      ]);

      expect(pack.map((source) => source.publishedAt)).toEqual(["2026-01-02", null, "2026\uFFFD"]);
    });

    it("produces a pack whose JSON holds no NUL and no surrogate escape", () => {
      const hostile = "x\u0000y\uD800z\uDC00w\u0001";
      const pack = buildEvidencePack([
        entry("https://a.test/1", { title: hostile, content: hostile, publishedAt: hostile }),
        pageEntry("https://a.test/2", { title: hostile, content: hostile, publishedAt: hostile }),
      ]);

      expect(JSON.stringify(pack)).not.toMatch(POSTGRES_HOSTILE_JSON);
      // The check itself works: the raw entry is exactly what it exists to catch.
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
    ])("drops the whole entry when its URL contains %s", (_label, url) => {
      const pack = buildEvidencePack([pageEntry(url), entry("https://a.test/good")]);

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
    ])("drops the whole entry when its URL is %s", (_label, url) => {
      const pack = buildEvidencePack([entry(url), entry("https://a.test/good")]);

      expect(pack.map((source) => source.url)).toEqual(["https://a.test/good"]);
    });

    it.each([
      ["undefined", undefined],
      ["null", null],
      ["a number", 42],
      ["an object", { href: "https://a.test/object" }],
    ])("drops the entry instead of throwing when its URL is %s", (_label, url) => {
      const malformed = { ...entry("https://a.test/ignored"), url } as unknown as Entry;

      const pack = buildEvidencePack([malformed, entry("https://a.test/good")]);

      expect(pack.map((source) => [source.id, source.url])).toEqual([
        ["S1", "https://a.test/good"],
      ]);
    });

    it("keeps an http or https URL exactly as it was received", () => {
      const urls = ["http://a.test/x", "HTTPS://A.test/Path?q=1#top", "https://a.test/%20encoded"];

      const pack = buildEvidencePack(urls.map((url) => entry(url)));

      expect(pack.map((source) => source.url)).toEqual(urls);
    });

    it("gives no id to a dropped entry and does not let it block the real page", () => {
      const pack = buildEvidencePack([
        entry("https://a.test/1"),
        entry("https://a.test/2\n"),
        entry("https://a.test/2"),
        entry("javascript:alert(1)"),
        entry("https://a.test/3"),
      ]);

      expect(pack.map((source) => [source.id, source.url])).toEqual([
        ["S1", "https://a.test/1"],
        ["S2", "https://a.test/2"],
        ["S3", "https://a.test/3"],
      ]);
    });
  });

  // Spec D3.2: a source of a blocked host never enters the pack under the credibility rules.
  describe("a source of a host the registry blocks", () => {
    const PASTE = entry("https://pastebin.com/raw/abc");
    const REDIRECTED = pageEntry("https://short.example/x", {
      answeredUrl: "https://pastebin.com/xyz",
    });
    const NEWS = entry("https://news.example/acme");

    it("is dropped when asked, by the address that answered, and the ids have no gap", () => {
      const pack = buildEvidencePack([PASTE, NEWS, REDIRECTED], { dropBlocked: true });

      expect(pack.map((source) => [source.id, source.url])).toEqual([
        ["S1", "https://news.example/acme"],
      ]);
    });

    it("stays when not asked, as under the confidence rules", () => {
      expect(buildEvidencePack([PASTE, NEWS]).map((source) => source.url)).toEqual([
        "https://pastebin.com/raw/abc",
        "https://news.example/acme",
      ]);
    });

    it("is never a record or a page of the vendor's own site", () => {
      expect(isBlockedEntry(PASTE)).toBe(true);
      expect(isBlockedEntry(REDIRECTED)).toBe(true);
      expect(isBlockedEntry(NEWS)).toBe(false);
      expect(isBlockedEntry({ ...PASTE, record: "hibp" })).toBe(false);
      expect(isBlockedEntry({ ...PASTE, onVendorSite: true })).toBe(false);
    });
  });
});

describe("provenanceOf", () => {
  it("maps a record's address to its database and a page's to the canonical address it claims", () => {
    const provenance = provenanceOf([
      pageEntry("https://db.example/kev/1", { record: "kev" }),
      pageEntry("https://portal.example/copy", { canonicalUrl: "https://wire.example/original" }),
    ]);

    expect([...provenance]).toEqual([
      ["https://db.example/kev/1", { record: "kev" }],
      ["https://portal.example/copy", { canonicalUrl: "https://wire.example/original" }],
    ]);
  });

  it("copies the VRDB meta and the answered address", () => {
    const meta = {
      recordId: 1,
      sourceId: "kev",
      sourceRecordId: "CVE-2026-1",
      strength: "strong",
      method: "kev_vendor",
      matchedKey: "kev:acme",
      status: "active",
      asOf: "2026-10-30",
      stale: false,
    } as const;
    const provenance = provenanceOf([
      pageEntry("https://nvd.nist.gov/vuln/detail/CVE-2026-1", { record: "kev", vrdb: meta }),
      pageEntry("https://t.co/abc", { answeredUrl: "https://www.reuters.com/world/x" }),
    ]);

    expect([...provenance]).toEqual([
      ["https://nvd.nist.gov/vuln/detail/CVE-2026-1", { record: "kev", vrdb: meta }],
      ["https://t.co/abc", { answeredUrl: "https://www.reuters.com/world/x" }],
    ]);
  });

  it("ignores entries with neither, and a record id that is not a database's", () => {
    const provenance = provenanceOf([
      entry("https://news.example/a"),
      pageEntry("https://db.example/other", { record: "gossip" }),
    ]);

    expect(provenance.size).toBe(0);
  });

  it("keeps the first entry of an address", () => {
    const provenance = provenanceOf([
      pageEntry("https://db.example/kev/1", { record: "kev" }),
      pageEntry("https://db.example/kev/1", { record: "nvd" }),
    ]);

    expect(provenance.get("https://db.example/kev/1")).toEqual({ record: "kev" });
  });

  it("gives an address none when its first entry has none, as the pack keeps that entry", () => {
    const provenance = provenanceOf([
      entry("https://db.example/kev/1"),
      pageEntry("https://db.example/kev/1", { record: "kev" }),
    ]);

    expect(provenance.has("https://db.example/kev/1")).toBe(false);
  });

  it("leaves the evidence pack as it was", () => {
    const plain = [
      pageEntry("https://db.example/kev/1"),
      pageEntry("https://portal.example/copy"),
      entry("https://news.example/a"),
    ];
    const withProvenance = [
      { ...plain[0], record: "kev" },
      { ...plain[1], canonicalUrl: "https://wire.example/original" },
      plain[2],
    ];

    expect(buildEvidencePack(withProvenance)).toEqual(buildEvidencePack(plain));
  });
});
