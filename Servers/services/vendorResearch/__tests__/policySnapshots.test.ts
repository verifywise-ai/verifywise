import { type FetchedPage, PageReadError } from "../../webResearch/readPage";
import {
  CHANGE_MARK,
  MAX_CHANGE_CHARS,
  MAX_CHANGE_LINE_CHARS,
  MAX_LINE_CHARS,
  MAX_POLICY_PAGES,
  MAX_SNAPSHOT_CHARS,
  MAX_SNAPSHOT_LINES,
  MIN_CHANGED_CHARS,
  type PolicyPage,
  type StoredSnapshot,
  changeEntryOf,
  collectPolicyPages,
  comparePages,
  describeChange,
  diffLines,
  hashOf,
  linesOf,
  policyKindOf,
} from "../policySnapshots";

const NOW = new Date("2031-04-20T12:00:00Z");

const long = (word: string, count: number) => Array.from({ length: count }, () => word).join(" ");

/** A line of a policy: long enough to count as a change on its own. */
const CLAUSE_A = "We may use customer content to improve our services and to train our models.";
const CLAUSE_B =
  "Customer content is never used to train models without the written consent of the customer.";
const CLAUSE_C =
  "We keep customer content for 30 days after the end of the contract and then delete it.";
const CLAUSE_D =
  "Our subprocessors process customer content only on our instructions and under contract.";

describe("policyKindOf", () => {
  it.each([
    ["https://acme.com/legal/subprocessors", "subprocessors"],
    ["https://acme.com/sub-processors", "subprocessors"],
    ["https://acme.com/legal/dpa", "dpa"],
    ["https://acme.com/data-processing-addendum", "dpa"],
    ["https://acme.com/privacy", "privacy"],
    ["https://acme.com/legal/privacy-policy", "privacy"],
    ["https://acme.com/terms", "terms"],
    ["https://acme.com/legal/terms-of-service", "terms"],
    ["https://acme.com/security", "security"],
    ["https://trust.acme.com/trust", "security"],
  ])("reads %s as a page of kind %s", (address, kind) => {
    expect(policyKindOf(address, "")).toBe(kind);
  });

  it("gives a subprocessor list that sits under legal the kind of the list, not of the folder", () => {
    expect(policyKindOf("https://acme.com/legal/subprocessors", "Legal")).toBe("subprocessors");
  });

  it.each([
    "https://acme.com/blog/privacy-update",
    "https://acme.com/news/new-terms",
    "https://acme.com/pricing",
    "https://acme.com/",
    "https://acme.com/logo.png",
    "https://acme.com/careers/security-engineer",
  ])("reads %s as no policy page", (address) => {
    expect(policyKindOf(address, "Acme")).toBeNull();
  });

  it("takes the kind from the title when the address says nothing, for the legal kinds only", () => {
    expect(policyKindOf("https://acme.com/legal/1", "Data Processing Addendum | Acme")).toBe("dpa");
    expect(policyKindOf("https://acme.com/legal/2", "Acme Privacy Notice")).toBe("privacy");
    // A title that merely says security is a marketing page, not the vendor's security statement.
    expect(policyKindOf("https://acme.com/legal/3", "Enterprise security for everyone")).toBeNull();
  });

  it("answers null for an address that cannot be parsed", () => {
    expect(policyKindOf("not a url", "Privacy")).toBeNull();
  });

  // The title is written by a third party.
  it("reads a huge title in a moment", () => {
    const title = `${long("privacy", 20_000)} `;
    const startedAt = Date.now();
    policyKindOf("https://acme.com/legal/9", title);
    policyKindOf("https://acme.com/legal/9", "a".repeat(200_000));
    expect(Date.now() - startedAt).toBeLessThan(200);
  });
});

describe("linesOf", () => {
  it("makes one line of each line of text, with the white space squeezed and trimmed", () => {
    expect(linesOf("  First   clause \t here \r\n\r\nSecond\n   \n  clause  ")).toEqual([
      "First clause here",
      "Second",
      "clause",
    ]);
  });

  it("leaves out a line with no letter and no digit", () => {
    expect(linesOf("Terms\n----\n* * *\n©\n2026\n|")).toEqual(["Terms", "2026"]);
  });

  it("cuts a line that is too long", () => {
    const [line] = linesOf("x".repeat(MAX_LINE_CHARS + 500));
    expect(line).toHaveLength(MAX_LINE_CHARS);
  });

  it("keeps at most MAX_SNAPSHOT_LINES lines", () => {
    const text = Array.from(
      { length: MAX_SNAPSHOT_LINES + 50 },
      (_, index) => `clause ${index}`,
    ).join("\n");
    expect(linesOf(text)).toHaveLength(MAX_SNAPSHOT_LINES);
  });

  it("keeps at most MAX_SNAPSHOT_CHARS characters, whole lines", () => {
    const line = "y".repeat(500);
    const text = Array.from({ length: 1000 }, (_, index) => `${index} ${line}`).join("\n");
    const lines = linesOf(text);
    const total = lines.reduce((sum, each) => sum + each.length + 1, 0);
    expect(total).toBeLessThanOrEqual(MAX_SNAPSHOT_CHARS);
    expect(lines.length).toBeGreaterThan(150);
    expect(lines.every((each) => each.startsWith(String(lines.indexOf(each))))).toBe(true);
  });

  it("removes the characters Postgres refuses", () => {
    expect(linesOf("clause\u0000 one\n\ud800 clause two")).toEqual(["clause one", "� clause two"]);
  });

  it("is fast on a page of the largest size", () => {
    const text = Array.from({ length: 40_000 }, (_, index) => `line ${index} ${long("w", 6)}`).join(
      "\n",
    );
    const startedAt = Date.now();
    linesOf(text);
    expect(Date.now() - startedAt).toBeLessThan(500);
  });
});

describe("hashOf", () => {
  it("is the same for lines that differ only in white space", () => {
    expect(hashOf(linesOf("A  clause\n\nAnother clause"))).toBe(
      hashOf(linesOf("A clause\n Another   clause ")),
    );
  });

  it("differs when a word differs, and has the shape of a SHA-256", () => {
    const one = hashOf(linesOf(CLAUSE_A));
    expect(one).toMatch(/^[0-9a-f]{64}$/);
    expect(one).not.toBe(hashOf(linesOf(CLAUSE_B)));
  });
});

describe("diffLines", () => {
  it("is null when nothing changed", () => {
    expect(diffLines([CLAUSE_A, CLAUSE_B], [CLAUSE_A, CLAUSE_B])).toBeNull();
  });

  it("is null when the lines only moved, or only changed case", () => {
    expect(diffLines([CLAUSE_A, CLAUSE_B], [CLAUSE_B, CLAUSE_A])).toBeNull();
    expect(diffLines([CLAUSE_A], [CLAUSE_A.toUpperCase()])).toBeNull();
  });

  it("gives the lines that are new and the lines that are gone, each in the order of its page", () => {
    expect(diffLines([CLAUSE_A, CLAUSE_B, CLAUSE_C], [CLAUSE_B, CLAUSE_D, CLAUSE_C])).toEqual({
      added: [CLAUSE_D],
      removed: [CLAUSE_A],
    });
  });

  it("leaves out the lines that only say when the page was written", () => {
    const before = [CLAUSE_A, "Last updated: March 3, 2026"];
    const after = [CLAUSE_A, "Last updated: May 9, 2026", "Effective date: May 9, 2026"];
    expect(diffLines(before, after)).toBeNull();
    expect(diffLines([CLAUSE_A, "© 2025 Acme Inc."], [CLAUSE_A, "© 2026 Acme Inc."])).toBeNull();
    // A long line that begins with the same word is a clause, not a stamp.
    const clause = `Updated terms: ${CLAUSE_B}`;
    expect(diffLines([CLAUSE_A], [CLAUSE_A, clause])).toEqual({ added: [clause], removed: [] });
  });

  it("is null for a change smaller than MIN_CHANGED_CHARS", () => {
    expect(MIN_CHANGED_CHARS).toBe(40);
    expect(diffLines([CLAUSE_A, "Fees apply"], [CLAUSE_A, "Fees apply now"])).toBeNull();
  });

  it("is not fooled by a page that repeats a line", () => {
    expect(diffLines([CLAUSE_A, CLAUSE_A], [CLAUSE_A])).toBeNull();
  });

  it("is fast on two large pages", () => {
    const before = Array.from(
      { length: MAX_SNAPSHOT_LINES },
      (_, index) => `old clause number ${index}`,
    );
    const after = Array.from(
      { length: MAX_SNAPSHOT_LINES },
      (_, index) => `new clause number ${index}`,
    );
    const startedAt = Date.now();
    const change = diffLines(before, after);
    expect(Date.now() - startedAt).toBeLessThan(500);
    expect(change?.added).toHaveLength(MAX_SNAPSHOT_LINES);
  });
});

describe("describeChange", () => {
  const input = { kind: "subprocessors", since: "2031-03-01", until: "2031-04-20" } as const;

  it("begins with the mark the prompt names, and says what kind of page and between which days", () => {
    const text = describeChange({ added: [CLAUSE_D], removed: [CLAUSE_A] }, input);

    expect(CHANGE_MARK).toBe("Page change");
    expect(
      text.startsWith(`${CHANGE_MARK}: the list of subprocessors on the vendor's website`),
    ).toBe(true);
    expect(text).toContain("between 2031-03-01 and 2031-04-20");
  });

  it("lists the added lines, then the removed lines, one to a line", () => {
    const text = describeChange({ added: [CLAUSE_D, CLAUSE_C], removed: [CLAUSE_A] }, input);

    expect(text).toContain(`\nAdded:\n- ${CLAUSE_D}\n- ${CLAUSE_C}`);
    expect(text).toContain(`\nRemoved:\n- ${CLAUSE_A}`);
    expect(text.indexOf("Added:")).toBeLessThan(text.indexOf("Removed:"));
  });

  it("leaves out the heading of a list that has no line", () => {
    expect(describeChange({ added: [CLAUSE_D], removed: [] }, input)).not.toContain("Removed:");
    expect(describeChange({ added: [], removed: [CLAUSE_A] }, input)).not.toContain("Added:");
  });

  it("cuts each line, and says how many it did not show", () => {
    const lines = Array.from({ length: 300 }, (_, index) => `${index} ${"z".repeat(300)}`);
    const text = describeChange(
      { added: lines, removed: [`${"q".repeat(MAX_CHANGE_LINE_CHARS + 200)}`] },
      input,
    );

    expect(text.length).toBeLessThanOrEqual(MAX_CHANGE_CHARS + 600);
    expect(text).toMatch(/\d+ more added lines? (?:is|are) not shown/);
    expect(text).not.toContain("q".repeat(MAX_CHANGE_LINE_CHARS + 1));
    expect(text).toContain("q".repeat(MAX_CHANGE_LINE_CHARS));
  });

  it("shows a removed line even when many lines were added", () => {
    const added = Array.from({ length: 200 }, (_, index) => `${index} ${"a".repeat(200)}`);
    const text = describeChange({ added, removed: [CLAUSE_A] }, input);

    expect(text).toContain(`- ${CLAUSE_A}`);
  });

  it.each([
    ["terms", "the terms"],
    ["privacy", "the privacy policy"],
    ["dpa", "the data processing addendum"],
    ["subprocessors", "the list of subprocessors"],
    ["security", "the security page"],
  ] as const)("names a page of kind %s as %s", (kind, words) => {
    expect(describeChange({ added: [CLAUSE_A], removed: [] }, { ...input, kind })).toContain(words);
  });
});

describe("changeEntryOf", () => {
  const page: PolicyPage = {
    url: "https://acme.com/legal/subprocessors",
    key: "acme.com/legal/subprocessors",
    kind: "subprocessors",
    title: "Subprocessors | Acme",
    text: "",
  };

  it("is a page of the vendor's own site, in the category that reads pages of that kind, dated the day of the run", () => {
    const entry = changeEntryOf(page, "the change", "0123456789abcdef", "2031-04-20");

    expect(entry).toEqual({
      category: "ai_specific",
      kind: "page",
      onVendorSite: true,
      url: "https://acme.com/legal/subprocessors#changed-01234567",
      title: "Change to Subprocessors | Acme",
      content: "the change",
      publishedAt: "2031-04-20",
    });
  });

  it("puts a change of the security page in certifications", () => {
    const entry = changeEntryOf({ ...page, kind: "security" }, "x", "ab".repeat(32), "2031-04-20");
    expect(entry?.category).toBe("certifications");
  });

  it("names the page by its kind when it has no title", () => {
    expect(changeEntryOf({ ...page, title: "  " }, "x", "ab".repeat(32), "2031-04-20")?.title).toBe(
      "Change to the list of subprocessors",
    );
  });

  it("replaces a fragment the address had, so that each change has an address of its own", () => {
    const entry = changeEntryOf(
      { ...page, url: "https://acme.com/legal/subprocessors#top" },
      "x",
      "cd".repeat(32),
      "2031-04-20",
    );
    expect(entry?.url).toBe("https://acme.com/legal/subprocessors#changed-cdcdcdcd");
  });

  it("is null for an address too long to carry the fragment", () => {
    const url = `https://acme.com/${"p".repeat(2040)}`;
    expect(changeEntryOf({ ...page, url }, "x", "ab".repeat(32), "2031-04-20")).toBeNull();
  });
});

describe("comparePages", () => {
  const pageOf = (kind: PolicyPage["kind"], path: string, lines: string[]): PolicyPage => ({
    url: `https://acme.com/${path}`,
    key: `acme.com/${path}`,
    kind,
    title: path,
    text: lines.join("\n"),
  });
  const storedOf = (lines: string[], lastSeenAt = "2031-03-01T08:00:00Z"): StoredSnapshot => {
    const normalised = linesOf(lines.join("\n"));
    return {
      hash: hashOf(normalised),
      body: normalised.join("\n"),
      lastSeenAt: new Date(lastSeenAt),
    };
  };

  it("only stores the first visit to a page", () => {
    const page = pageOf("terms", "terms", [CLAUSE_A, CLAUSE_B]);

    const result = comparePages({ pages: [page], stored: new Map(), now: NOW });

    expect(result.entries).toEqual([]);
    expect(result.counts).toEqual({ first: 1, unchanged: 0, changed: 0, minor: 0 });
    expect(result.writes).toEqual([
      {
        pageKey: "acme.com/terms",
        url: "https://acme.com/terms",
        kind: "terms",
        title: "terms",
        hash: hashOf(linesOf([CLAUSE_A, CLAUSE_B].join("\n"))),
        body: [CLAUSE_A, CLAUSE_B].join("\n"),
      },
    ]);
  });

  it("finds nothing in a page that reads as it did", () => {
    const page = pageOf("terms", "terms", [CLAUSE_A, CLAUSE_B]);
    const stored = new Map([[page.key, storedOf([CLAUSE_A, `  ${CLAUSE_B} `])]]);

    const result = comparePages({ pages: [page], stored, now: NOW });

    expect(result.entries).toEqual([]);
    expect(result.counts).toEqual({ first: 0, unchanged: 1, changed: 0, minor: 0 });
    expect(result.writes).toHaveLength(1);
  });

  it("makes a source of a change, dated between the day the page was last seen and the day of the run", () => {
    const page = pageOf("privacy", "privacy", [CLAUSE_A, CLAUSE_D]);
    const stored = new Map([[page.key, storedOf([CLAUSE_B, CLAUSE_D])]]);

    const result = comparePages({ pages: [page], stored, now: NOW });

    expect(result.counts).toEqual({ first: 0, unchanged: 0, changed: 1, minor: 0 });
    expect(result.entries).toHaveLength(1);
    const [entry] = result.entries;
    expect(entry).toMatchObject({
      category: "ai_specific",
      kind: "page",
      onVendorSite: true,
      title: "Change to privacy",
      publishedAt: "2031-04-20",
    });
    expect(entry.url).toMatch(/^https:\/\/acme\.com\/privacy#changed-[0-9a-f]{8}$/);
    expect(entry.content).toContain("between 2031-03-01 and 2031-04-20");
    expect(entry.content).toContain(`- ${CLAUSE_A}`);
    expect(entry.content).toContain(`- ${CLAUSE_B}`);
    // The new text is the page from now on.
    expect(result.writes[0].body).toBe([CLAUSE_A, CLAUSE_D].join("\n"));
  });

  it("gives the same change the same address, so that the same change is never a second finding", () => {
    const page = pageOf("privacy", "privacy", [CLAUSE_A]);
    const stored = new Map([[page.key, storedOf([CLAUSE_B])]]);

    const first = comparePages({ pages: [page], stored, now: NOW });
    const second = comparePages({ pages: [page], stored, now: new Date("2031-04-21T09:00:00Z") });

    expect(second.entries[0].url).toBe(first.entries[0].url);
  });

  it("takes a change that is only a date as the new text of the page, and no source", () => {
    const page = pageOf("terms", "terms", [CLAUSE_A, "Last updated: May 9, 2026"]);
    const stored = new Map([[page.key, storedOf([CLAUSE_A, "Last updated: March 3, 2026"])]]);

    const result = comparePages({ pages: [page], stored, now: NOW });

    expect(result.entries).toEqual([]);
    expect(result.counts).toEqual({ first: 0, unchanged: 0, changed: 0, minor: 1 });
    expect(result.writes[0].body).toContain("May 9, 2026");
  });

  it("goes through every page on its own", () => {
    const terms = pageOf("terms", "terms", [CLAUSE_A]);
    const dpa = pageOf("dpa", "dpa", [CLAUSE_C, CLAUSE_D]);
    const security = pageOf("security", "security", [CLAUSE_B]);
    const stored = new Map([
      [terms.key, storedOf([CLAUSE_A])],
      [dpa.key, storedOf([CLAUSE_C])],
    ]);

    const result = comparePages({ pages: [terms, dpa, security], stored, now: NOW });

    expect(result.counts).toEqual({ first: 1, unchanged: 1, changed: 1, minor: 0 });
    expect(result.entries.map((entry) => entry.title)).toEqual(["Change to dpa"]);
    expect(result.writes.map((write) => write.pageKey)).toEqual([
      "acme.com/terms",
      "acme.com/dpa",
      "acme.com/security",
    ]);
  });

  // An answer with no text must never replace a page that was kept.
  it("passes over a page with no text", () => {
    const page = pageOf("terms", "terms", ["", "  ", "* * *"]);
    const stored = new Map([[page.key, storedOf([CLAUSE_A])]]);

    expect(comparePages({ pages: [page], stored, now: NOW })).toEqual({
      entries: [],
      writes: [],
      counts: { first: 0, unchanged: 0, changed: 0, minor: 0 },
    });
  });

  it("has nothing to do for no page", () => {
    expect(comparePages({ pages: [], stored: new Map(), now: NOW })).toEqual({
      entries: [],
      writes: [],
      counts: { first: 0, unchanged: 0, changed: 0, minor: 0 },
    });
  });
});

describe("collectPolicyPages", () => {
  const fetched = (url: string, fields: Partial<FetchedPage> = {}): FetchedPage => ({
    url,
    title: "",
    publishedAt: null,
    text: `${CLAUSE_A}\n${CLAUSE_B}`,
    links: [],
    ...fields,
  });

  /** A reader that answers by the address asked, with the page, or with the failure given. */
  const readerOf = (answers: Record<string, Partial<FetchedPage> | PageReadError> = {}) =>
    jest.fn<Promise<FetchedPage>, [string, AbortSignal?]>(async (url) => {
      const answer = answers[url];
      if (answer instanceof PageReadError) throw answer;
      return fetched(url, answer);
    });

  const OWN = ["acme.com"];

  it("passes the page on as it was read, to the reader it was given with the same arguments", async () => {
    const reader = readerOf();
    const collector = collectPolicyPages(reader, OWN);
    const signal = new AbortController().signal;

    const page = await collector.read("https://acme.com/privacy", signal);

    expect(reader).toHaveBeenCalledWith("https://acme.com/privacy", signal);
    expect(page).toEqual(fetched("https://acme.com/privacy"));
  });

  it("notes a page of the vendor's own site that states its terms, with its whole text", async () => {
    const text = `${CLAUSE_A}\n${long("clause", 20000)}`;
    const collector = collectPolicyPages(
      readerOf({ "https://acme.com/legal/dpa": { title: "Data Processing Addendum", text } }),
      OWN,
    );

    await collector.read("https://acme.com/legal/dpa");

    expect(collector.pages()).toEqual([
      {
        url: "https://acme.com/legal/dpa",
        key: "acme.com/legal/dpa",
        kind: "dpa",
        title: "Data Processing Addendum",
        text,
      },
    ]);
  });

  it.each([
    ["a page that is no policy page", "https://acme.com/pricing"],
    ["a post of the blog", "https://acme.com/blog/privacy-update"],
    ["the home page", "https://acme.com/"],
    ["a policy page of another site", "https://other.example/privacy"],
    ["a page of a site whose name only ends like the vendor's", "https://notacme.com/privacy"],
  ])("notes nothing for %s", async (_label, address) => {
    const collector = collectPolicyPages(readerOf(), OWN);

    await collector.read(address);

    expect(collector.pages()).toEqual([]);
  });

  it("takes the pages of a subdomain and of each of the domains that are the vendor's", async () => {
    const collector = collectPolicyPages(readerOf(), ["acme.com", "acme-cloud.com"]);

    await collector.read("https://trust.acme.com/trust");
    await collector.read("https://www.acme-cloud.com/privacy");

    expect(collector.pages().map((page) => [page.url, page.kind])).toEqual([
      ["https://trust.acme.com/trust", "security"],
      ["https://www.acme-cloud.com/privacy", "privacy"],
    ]);
  });

  it("notes nothing when the vendor has no domain", async () => {
    const collector = collectPolicyPages(readerOf(), []);

    await collector.read("https://acme.com/privacy");

    expect(collector.pages()).toEqual([]);
  });

  it("goes by the address that answered: a page that redirected off the site is not its own, one that redirected into it is", async () => {
    const collector = collectPolicyPages(
      readerOf({
        "https://acme.com/privacy": { url: "https://policies.example/acme/privacy" },
        "https://short.example/p": { url: "https://acme.com/legal/privacy-policy" },
      }),
      OWN,
    );

    await collector.read("https://acme.com/privacy");
    await collector.read("https://short.example/p");

    expect(collector.pages().map((page) => [page.url, page.key])).toEqual([
      ["https://acme.com/legal/privacy-policy", "acme.com/legal/privacy-policy"],
    ]);
  });

  it("keeps the page that was read last for a document, in the place of the first read", async () => {
    const answers: Record<string, Partial<FetchedPage>> = {
      "https://acme.com/privacy": { text: CLAUSE_A },
      "https://acme.com/terms": { text: CLAUSE_B },
    };
    const collector = collectPolicyPages(readerOf(answers), OWN);

    await collector.read("https://acme.com/privacy");
    await collector.read("https://acme.com/terms");
    // The same document under another spelling of its address.
    answers["https://acme.com/privacy#section-2"] = { text: CLAUSE_C };
    await collector.read("https://acme.com/privacy#section-2");

    expect(collector.pages().map((page) => [page.key, page.text])).toEqual([
      ["acme.com/privacy", CLAUSE_C],
      ["acme.com/terms", CLAUSE_B],
    ]);
  });

  it("does not let an answer with no text take the place of a page that had some", async () => {
    const answers: Record<string, Partial<FetchedPage>> = {
      "https://acme.com/privacy": { text: CLAUSE_A },
    };
    const collector = collectPolicyPages(readerOf(answers), OWN);

    await collector.read("https://acme.com/privacy");
    answers["https://acme.com/privacy"] = { text: "   \n " };
    await collector.read("https://acme.com/privacy");

    expect(collector.pages().map((page) => page.text)).toEqual([CLAUSE_A]);
  });

  it("notes no page that has no text", async () => {
    const collector = collectPolicyPages(
      readerOf({ "https://acme.com/privacy": { text: "" } }),
      OWN,
    );

    await collector.read("https://acme.com/privacy");

    expect(collector.pages()).toEqual([]);
  });

  it(`keeps the first ${MAX_POLICY_PAGES} documents of a run, and still takes a later read of one of them`, async () => {
    const answers: Record<string, Partial<FetchedPage>> = {};
    const urls = Array.from(
      { length: MAX_POLICY_PAGES + 2 },
      (_, index) => `https://acme.com/legal/privacy-${index}`,
    );
    const collector = collectPolicyPages(readerOf(answers), OWN);

    for (const url of urls) await collector.read(url);
    answers[urls[0]] = { text: CLAUSE_D };
    await collector.read(urls[0]);

    const pages = collector.pages();
    expect(pages.map((page) => page.url)).toEqual(urls.slice(0, MAX_POLICY_PAGES));
    expect(pages[0].text).toBe(CLAUSE_D);
  });

  it("passes a failure on as it is, and notes nothing for it", async () => {
    const failure = new PageReadError("needs_javascript");
    const collector = collectPolicyPages(readerOf({ "https://acme.com/privacy": failure }), OWN);

    await expect(collector.read("https://acme.com/privacy")).rejects.toBe(failure);

    expect(collector.pages()).toEqual([]);
  });

  it("does not stop a read for a page it cannot judge", async () => {
    const collector = collectPolicyPages(
      readerOf({ "https://acme.com/privacy": { url: "not an address", title: "x" } }),
      OWN,
    );

    await expect(collector.read("https://acme.com/privacy")).resolves.toMatchObject({
      url: "not an address",
    });

    expect(collector.pages()).toEqual([]);
  });

  it("gives a list that later reads do not change", async () => {
    const collector = collectPolicyPages(readerOf(), OWN);
    await collector.read("https://acme.com/privacy");

    const before = collector.pages();
    await collector.read("https://acme.com/terms");

    expect(before.map((page) => page.key)).toEqual(["acme.com/privacy"]);
    expect(collector.pages().map((page) => page.key)).toEqual([
      "acme.com/privacy",
      "acme.com/terms",
    ]);
  });
});
