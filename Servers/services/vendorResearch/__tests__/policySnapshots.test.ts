import { createHash } from "node:crypto";
import { type FetchedPage, PageReadError } from "../../webResearch/readPage";
import { cleanText, cutAtCodePoint } from "../text";
import {
  CHANGE_MARK,
  CONTINUED_MARK,
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
  snapshotsToKeep,
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

/** The hash the code kept before long lines were split: the plain SHA-256 of the body. */
const oldHashOf = (lines: readonly string[]): string =>
  createHash("sha256").update(lines.join("\n")).digest("hex");

/**
 * The lines as the code kept them before long lines were split: a long line cut at MAX_LINE_CHARS,
 * the rest of it dropped, and, before the second trim (`trimmed` false), the cut ending in a space.
 */
function oldLinesOf(text: string, trimmed: boolean): string[] {
  const lines: string[] = [];
  let chars = 0;
  for (const raw of cleanText(text).split("\n")) {
    const cut = cutAtCodePoint(raw.replace(/\s+/g, " ").trim(), MAX_LINE_CHARS);
    const line = trimmed ? cut.trimEnd() : cut;
    if (!/[\p{L}\p{N}]/u.test(line)) continue;
    if (lines.length >= MAX_SNAPSHOT_LINES || chars + line.length + 1 > MAX_SNAPSHOT_CHARS) break;
    lines.push(line);
    chars += line.length + 1;
  }
  return lines;
}

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

  // A line cut where a space is must not end in that space: the kept body is read with linesOf
  // again by the next run, which would trim it, and the same paragraph would then be a change.
  it("never ends a part of a long line in a space, so that the lines of a kept body are the lines again", () => {
    const paragraph = `${"x".repeat(MAX_LINE_CHARS - 1)} and the rest of a long clause`;

    const lines = linesOf(paragraph);

    expect(lines).toEqual([
      "x".repeat(MAX_LINE_CHARS - 1),
      `${CONTINUED_MARK}and the rest of a long clause`,
    ]);
    expect(linesOf(lines.join("\n"))).toEqual(lines);
  });

  // The whole of a long clause is compared: a change after its first MAX_LINE_CHARS characters is
  // a change of one of its parts.
  it("keeps a long line whole, as parts no longer than MAX_LINE_CHARS, split at a blank", () => {
    const clause = long("clause", 400);

    const lines = linesOf(clause);

    expect(lines.length).toBeGreaterThan(3);
    expect(lines.every((line) => line.length <= MAX_LINE_CHARS)).toBe(true);
    expect(lines.slice(1).every((line) => line.startsWith(CONTINUED_MARK))).toBe(true);
    expect(lines.map((line) => line.replace(CONTINUED_MARK, "")).join(" ")).toBe(clause);
    expect(linesOf(lines.join("\n"))).toEqual(lines);
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

describe("comparePages on the largest page", () => {
  // The page text is a third party's, up to the two megabytes of HTML the reader takes, and the
  // whole of it is read once more for the lines that are still on the page.
  it("compares a page of one line of two megabytes in a moment", () => {
    const text = long("clause", 300_000);
    const page: PolicyPage = {
      url: "https://acme.com/terms",
      key: "acme.com/terms",
      kind: "terms",
      title: "Terms",
      text,
    };
    const [write] = comparePages({ pages: [page], stored: new Map(), now: NOW }).writes;
    const changed = { ...page, text: `New clause. ${text}` };
    const startedAt = Date.now();

    const result = comparePages({
      pages: [changed],
      stored: new Map([[page.key, { hash: write.hash, body: write.body, lastSeenAt: NOW }]]),
      now: NOW,
    });

    expect(Date.now() - startedAt).toBeLessThan(2000);
    expect(write.body.length).toBeLessThanOrEqual(MAX_SNAPSHOT_CHARS);
    expect(result.counts.changed + result.counts.minor).toBe(1);
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

// RV6P-3, RV6D-3: which parts of a long clause a change shows as one stretch of the page.
describe("the joints of the parts of a long clause in a change", () => {
  const input = { kind: "terms", since: "2031-03-01", until: "2031-04-20" } as const;
  const words = (tag: string, count: number, edits: Record<number, string> = {}) =>
    Array.from({ length: count }, (_, index) => edits[index] ?? `${tag}${index}x`).join(" ");

  it("joins the parts of a clause that changed all through, and shows them as the page has them", () => {
    const before = linesOf(words("w", 260, { 10: "a", 130: "b", 230: "c" }));
    const after = linesOf(words("w", 260, { 10: "d", 130: "e", 230: "f" }));
    expect(after).toHaveLength(3);

    const change = diffLines(before, after);

    expect(change).toEqual({
      added: after,
      removed: before,
      addedJoined: [1, 2],
      removedJoined: [1, 2],
    });
    const text = describeChange(change!, input);
    expect(text).toContain(
      `Added:\n- ${after[0]}\n  ${after[1].slice(CONTINUED_MARK.length)}\n  ${after[2].slice(CONTINUED_MARK.length)}`,
    );
    expect(text.replace(/\s+/g, " ")).toContain(words("w", 260, { 10: "d", 130: "e", 230: "f" }));
  });

  it("does not join a part to a line it was not next to on the page", () => {
    const before = linesOf(words("w", 260, { 10: "a", 230: "c" }));
    const after = linesOf(words("w", 260, { 10: "d", 230: "f" }));

    const change = diffLines(before, after);

    expect(change).toEqual({ added: [after[0], after[2]], removed: [before[0], before[2]] });
    expect(describeChange(change!, input)).toContain(`Added:\n- ${after[0]}\n- ${after[2]}`);
  });

  it("does not join a part to the part before it when that one was cut where no blank was", () => {
    const clause = (tail: string) => `${"\u30c7".repeat(650)} ${tail}`;
    const after = linesOf(clause("the provider sells customer data"));
    expect(after[0]).toHaveLength(MAX_LINE_CHARS);
    const before = linesOf(clause("the provider keeps customer data"));
    const change = diffLines([before[0].replace("\u30c7", "\u30c6"), before[1]], after);

    expect(change?.addedJoined).toBeUndefined();
    expect(describeChange(change!, input)).toContain(`\n- ${after[1]}`);
  });

  it("joins a part one short of the limit that has a blank in its second half", () => {
    const first = `${"a".repeat(400)} ${"b".repeat(MAX_LINE_CHARS - 402)}`;
    expect(first).toHaveLength(MAX_LINE_CHARS - 1);
    const after = linesOf(`${first} tail of the clause that the vendor changed`);
    expect(after[0]).toBe(first);

    expect(diffLines([], after)?.addedJoined).toEqual([1]);
  });

  it("shows a continued part whole, and counts it as a line in the room of the change", () => {
    const clauses = Array.from({ length: 30 }, (_, index) =>
      linesOf(words(`c${index}q`, 200)),
    ).flat();
    const change = diffLines([], clauses)!;
    expect(change.addedJoined?.length).toBeGreaterThan(20);

    const text = describeChange(change, input);

    expect(text.length).toBeLessThanOrEqual(MAX_CHANGE_CHARS + 300);
    const shown = text.split("\n").filter((line) => line.startsWith("- ") || line.startsWith("  "));
    const hidden = Number(/(\d+) more added lines? (?:is|are) not shown/.exec(text)?.[1]);
    expect(shown.length + hidden).toBe(clauses.length);
    for (const line of shown) expect(line.length).toBeLessThanOrEqual(MAX_CHANGE_LINE_CHARS + 2);
  });

  // The kept lines do not say that a page line which itself begins with the continued mark is not
  // a part: one right after a line as long as a part is shown as continuing it (the limit).
  it("takes a page line that begins with the continued mark after a long line as a part of it", () => {
    const long = `${words("w", 80)} end`;
    expect(long.length).toBeGreaterThan(MAX_LINE_CHARS / 2);
    const lines = [long, `${CONTINUED_MARK}and more of the terms, a line of its own`];

    expect(diffLines([], lines)?.addedJoined).toEqual([1]);
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

  describe("a long paragraph cut where a space is", () => {
    // Character MAX_LINE_CHARS of the paragraph is a space.
    const PARAGRAPH = `${"We process personal data to provide the services. ".repeat(12).slice(0, MAX_LINE_CHARS - 1)} ${CLAUSE_A}`;
    /** The body and the hash as the code before the fix kept them: the cut line ends in a space. */
    const keptByOldCode = (lines: string[]): StoredSnapshot => ({
      hash: oldHashOf(lines),
      body: lines.join("\n"),
      lastSeenAt: new Date("2031-03-01T08:00:00Z"),
    });
    const OLD_CUT = cutOld(PARAGRAPH);

    function cutOld(paragraph: string): string {
      return paragraph.replace(/\s+/g, " ").trim().slice(0, MAX_LINE_CHARS);
    }

    it("is a case where the old cut ended in a space", () => {
      expect(OLD_CUT.endsWith(" ")).toBe(true);
    });

    it("makes no change of a page that changed only in a date", () => {
      const before = [PARAGRAPH, CLAUSE_B, "Last updated: March 3, 2026"];
      const after = [PARAGRAPH, CLAUSE_B, "Last updated: May 9, 2026"];
      const page = pageOf("privacy", "privacy", after);
      const stored = new Map([[page.key, storedOf(before)]]);

      const result = comparePages({ pages: [page], stored, now: NOW });

      expect(result.entries).toEqual([]);
      expect(result.counts).toEqual({ first: 0, unchanged: 0, changed: 0, minor: 1 });
    });

    it("makes no change of a page kept by the old code, whose cut line ends in a space", () => {
      const page = pageOf("privacy", "privacy", [PARAGRAPH, CLAUSE_B, "Last updated: May 9, 2026"]);
      const stored = new Map([
        [page.key, keptByOldCode([OLD_CUT, CLAUSE_B, "Last updated: March 3, 2026"])],
      ]);

      const result = comparePages({ pages: [page], stored, now: NOW });

      expect(result.entries).toEqual([]);
      expect(result.counts).toEqual({ first: 0, unchanged: 0, changed: 0, minor: 1 });
    });

    it("takes the same page kept by the old code as no change, and keeps it without the space", () => {
      const page = pageOf("privacy", "privacy", [PARAGRAPH, CLAUSE_B]);
      const stored = new Map([[page.key, keptByOldCode([OLD_CUT, CLAUSE_B])]]);

      const result = comparePages({ pages: [page], stored, now: NOW });

      expect(result.entries).toEqual([]);
      // The hash of the old body held the space, so the page is written again, as a minor change.
      expect(result.counts).toEqual({ first: 0, unchanged: 0, changed: 0, minor: 1 });
      // It is kept as the code keeps it now: the long paragraph whole, in parts.
      const now = linesOf([PARAGRAPH, CLAUSE_B].join("\n"));
      expect(now[0]).toBe(OLD_CUT.trimEnd().slice(0, now[0].length));
      expect(result.writes[0].body).toBe(now.join("\n"));
      expect(result.writes[0].hash).toBe(hashOf(now));
    });
  });

  describe("a clause longer than MAX_LINE_CHARS", () => {
    const OPENING = long("The provider processes customer data only to provide the services", 10);
    const NEVER =
      "The provider will never use customer data to train artificial intelligence models.";
    const MAY =
      "The provider may use customer data to train artificial intelligence models unless the customer opts out.";

    it("is longer than one kept line before its last sentence", () => {
      expect(OPENING.length).toBeGreaterThan(MAX_LINE_CHARS);
    });

    // R4-PL-2: the lines were cut before they were hashed, so this change was invisible.
    it("makes a change of a sentence after its first MAX_LINE_CHARS characters", () => {
      const page = pageOf("dpa", "dpa", [`${OPENING} ${MAY}`, CLAUSE_C]);
      const stored = new Map([[page.key, storedOf([`${OPENING} ${NEVER}`, CLAUSE_C])]]);

      const result = comparePages({ pages: [page], stored, now: NOW });

      expect(result.counts).toEqual({ first: 0, unchanged: 0, changed: 1, minor: 0 });
      const [entry] = result.entries;
      expect(entry.content).toContain("may use customer data to train artificial intelligence");
      expect(entry.content).toContain("will never use customer data to train");
    });

    it("finds nothing in the same page against the text it kept itself", () => {
      const page = pageOf("dpa", "dpa", [`${OPENING} ${NEVER}`, CLAUSE_C]);
      const first = comparePages({ pages: [page], stored: new Map(), now: NOW });
      const [write] = first.writes;
      const stored = new Map([
        [page.key, { hash: write.hash, body: write.body, lastSeenAt: new Date(NOW) }],
      ]);

      const result = comparePages({ pages: [page], stored, now: NOW });

      expect(result.counts).toEqual({ first: 0, unchanged: 1, changed: 0, minor: 0 });
    });

    // The first run after long lines were split must not take their tails, which the old body
    // never held, for added lines; both ways the old code cut a line are read.
    it.each([
      ["with the second trim", true],
      ["before the second trim", false],
    ])("takes the same page kept by the old code %s as no change", (_, trimmed) => {
      const page = pageOf("dpa", "dpa", [`${OPENING} ${NEVER}`, CLAUSE_C]);
      const old = oldLinesOf(page.text, trimmed);
      const stored = new Map([
        [
          page.key,
          {
            hash: oldHashOf(old),
            body: old.join("\n"),
            lastSeenAt: new Date("2031-03-01T08:00:00Z"),
          },
        ],
      ]);

      const result = comparePages({ pages: [page], stored, now: NOW });

      expect(result.entries).toEqual([]);
      expect(result.counts).toEqual({ first: 0, unchanged: 0, changed: 0, minor: 1 });
      expect(result.writes[0].body).toBe(linesOf(page.text).join("\n"));
    });

    it("still makes a change of a page kept by the old code in what the old code kept", () => {
      const page = pageOf("dpa", "dpa", [`${OPENING} ${NEVER}`, CLAUSE_A]);
      const old = oldLinesOf([`${OPENING} ${NEVER}`, CLAUSE_B].join("\n"), true);
      const stored = new Map([
        [page.key, { hash: oldHashOf(old), body: old.join("\n"), lastSeenAt: new Date(NOW) }],
      ]);

      const result = comparePages({ pages: [page], stored, now: NOW });

      expect(result.counts.changed).toBe(1);
      expect(result.entries[0].content).toContain(`Added:\n- ${CLAUSE_A}`);
      expect(result.entries[0].content).toContain(`Removed:\n- ${CLAUSE_B}`);
      expect(result.entries[0].content).not.toContain(CONTINUED_MARK);
    });
  });

  describe("a page longer than the limits", () => {
    const clause = (index: number) =>
      `Section ${index}. ${long(`The customer keeps every right in customer data number ${index}`, 4)}`;
    const CLAUSES = Array.from({ length: 600 }, (_, index) => clause(index + 1));
    // Longer than the room the limits leave after the last kept clause, so that one falls out.
    const INSERTED = `Section 0. ${long("The provider may use customer data to train its models", 8)}`;
    /** The page as comparePages keeps it on a first visit: the hash says the limits cut it. */
    const keptBy = (lines: string[]): StoredSnapshot => {
      const [write] = comparePages({
        pages: [pageOf("terms", "terms", lines)],
        stored: new Map(),
        now: NOW,
      }).writes;
      return { hash: write.hash, body: write.body, lastSeenAt: new Date(NOW) };
    };

    it("is longer than the limits, and the clause added at the top pushes a kept one out", () => {
      expect(CLAUSES.join("\n").length).toBeGreaterThan(MAX_SNAPSHOT_CHARS);
      const kept = linesOf(CLAUSES.join("\n"));
      expect(linesOf([INSERTED, ...CLAUSES].join("\n"))).not.toContain(kept[kept.length - 1]);
    });

    // R4-PL-5: the clause that the insertion pushed past the limits is still on the page.
    it("reports a clause added at the top, and no clause pushed past the limits as removed", () => {
      const page = pageOf("terms", "terms", [INSERTED, ...CLAUSES]);
      const stored = new Map([[page.key, keptBy(CLAUSES)]]);

      const result = comparePages({ pages: [page], stored, now: NOW });

      expect(result.counts.changed).toBe(1);
      const { content } = result.entries[0];
      expect(content).toContain(`Added:\n- ${INSERTED}`);
      expect(content).not.toContain("Removed:");
    });

    it("reports a clause removed at the top, and no clause that comes in at the end as added", () => {
      const page = pageOf("terms", "terms", CLAUSES.slice(1));
      const stored = new Map([[page.key, keptBy(CLAUSES)]]);

      const result = comparePages({ pages: [page], stored, now: NOW });

      expect(result.counts.changed).toBe(1);
      const { content } = result.entries[0];
      expect(content).toContain(`Removed:\n- ${CLAUSES[0]}`);
      expect(content).not.toContain("Added:");
    });

    // A page that the limits did not cut, though it comes close to them, is whole: a clause added
    // at its end is a change.
    it("reports a clause added at the end of a page that comes close to the limits but was not cut", () => {
      const whole: string[] = [];
      let chars = 0;
      for (const each of CLAUSES) {
        if (chars + each.length + 1 > MAX_SNAPSHOT_CHARS - 2 * MAX_LINE_CHARS) break;
        whole.push(each);
        chars += each.length + 1;
      }
      // A last clause that brings the page to 300 characters under the limit.
      const last = `Final section. ${"z".repeat(MAX_SNAPSHOT_CHARS - 300 - chars - 1 - 15)}`;
      whole.push(last);
      chars += last.length + 1;
      const appended = "The provider may share customer data with its advertising partners.";
      expect(chars + MAX_LINE_CHARS + 1).toBeGreaterThan(MAX_SNAPSHOT_CHARS);
      expect(chars + appended.length + 1).toBeLessThanOrEqual(MAX_SNAPSHOT_CHARS);
      const page = pageOf("terms", "terms", [...whole, appended]);
      const stored = new Map([[page.key, keptBy(whole)]]);

      const result = comparePages({ pages: [page], stored, now: NOW });

      expect(result.counts.changed).toBe(1);
      expect(result.entries[0].content).toContain(`Added:\n- ${appended}`);
    });

    // RVP-3: a clause inserted near the end of the kept window pushes the kept lines after it past
    // the limits. Those lines are still on the page after it, and two of them make an anchor pair
    // (see keptWindowLength), so it is inside the kept window.
    describe("a clause inserted near the end of the kept window", () => {
      // Longer than two kept clauses, and no longer than one kept line.
      const NEW = `${long("The provider may use customer data to train its artificial intelligence models", 7)}.`;
      const keptLines = () => keptBy(CLAUSES).body.split("\n");
      const inserted = (at: number, line = NEW) => {
        const lines = [...CLAUSES];
        lines.splice(at, 0, line);
        return lines;
      };
      const compare = (lines: string[]) =>
        comparePages({
          pages: [pageOf("terms", "terms", lines)],
          stored: new Map([["acme.com/terms", keptBy(CLAUSES)]]),
          now: NOW,
        });

      it("is a page cut by the limits, whose last kept clauses the insertion pushes out", () => {
        expect(NEW.length).toBeGreaterThan(2 * (CLAUSES[0].length + 1));
        expect(NEW.length).toBeLessThanOrEqual(MAX_LINE_CHARS);
        const kept = keptLines();
        expect(kept.length).toBeLessThan(CLAUSES.length);
        const after = linesOf(inserted(kept.length - 2).join("\n"));
        expect(after).not.toContain(kept[kept.length - 1]);
      });

      it.each([2, 3])(
        "reports the clause inserted %i lines before the end of the kept window",
        (back) => {
          const lines = inserted(keptLines().length - back);
          // The clause is inside what the limits keep of the new page.
          expect(linesOf(lines.join("\n"))).toContain(NEW);

          const result = compare(lines);

          expect(result.counts.changed).toBe(1);
          expect(result.entries[0].content).toContain(`Added:\n- ${NEW}`);
          expect(result.entries[0].content).not.toContain("Removed:");
        },
      );

      // A line after the last kept one may have been on the page past the old limit.
      it("does not report a clause inserted right after the kept window", () => {
        const result = compare(inserted(keptLines().length));

        expect(result.entries).toEqual([]);
      });

      // A kept line that the page repeats past the cut does not make the lines before the repeat
      // part of the kept window. Wave 10: the window ends at the last two kept lines that are each
      // once in the kept body and once on the page, next to each other in both (RV8P-1..4). After
      // the clause inserted here come one such line and the repeated one, so the clause is after
      // the window: nothing old is shown as added, and the clause is not shown either.
      const repeatedAtTheEnd = (insertAt: number) => {
        const kept = keptLines();
        // As long as the clause it stands for, so that it is the last kept line.
        const boilerplate = "Back to the top of the terms of service of the provider ".padEnd(
          CLAUSES[kept.length - 1].length,
          "-",
        );
        const withHeading = [...CLAUSES];
        withHeading[kept.length - 1] = boilerplate;
        withHeading[kept.length + 20] = boilerplate;
        const keptWithHeading = keptBy(withHeading);
        expect(keptWithHeading.body.split("\n").slice(-1)[0]).toBe(boilerplate);
        const now = [...withHeading];
        now.splice(kept.length - insertAt, 0, NEW);
        return comparePages({
          pages: [pageOf("terms", "terms", now)],
          stored: new Map([["acme.com/terms", keptWithHeading]]),
          now: NOW,
        });
      };

      it("does not report a clause inserted before one unique kept line and a repeated one", () => {
        expect(repeatedAtTheEnd(2).entries).toEqual([]);
      });

      // The nearest neighbour: one line earlier, two unique kept lines follow the clause.
      it("reports only the inserted clause when two unique kept lines follow it", () => {
        const result = repeatedAtTheEnd(3);
        expect(result.counts.changed).toBe(1);
        expect(result.entries[0].content).toBe(
          describeChange(
            { added: [NEW], removed: [] },
            { kind: "terms", since: "2031-04-20", until: "2031-04-20" },
          ),
        );
      });
    });

    // FD-1: the old code kept fewer characters of each long line, so a line more can fit now.
    it("takes a long page kept by the old code as no change, though a line more fits now", () => {
      const paragraph = (index: number) =>
        `${`Clause ${index} `.padEnd(599, "x")} ${"y".repeat(100)}`;
      const tail = "The vendor may use customer content to train its models ".padEnd(300, "z");
      const text = [...Array.from({ length: 166 }, (_, index) => paragraph(index)), tail].join(
        "\n",
      );
      const old = oldLinesOf(text, false);
      expect(old.join("\n")).not.toContain("train its models");
      const page: PolicyPage = { ...pageOf("terms", "terms", []), text };
      const stored = new Map([
        [page.key, { hash: oldHashOf(old), body: old.join("\n"), lastSeenAt: new Date(NOW) }],
      ]);

      const result = comparePages({ pages: [page], stored, now: NOW });

      expect(result.entries).toEqual([]);
      expect(result.counts).toEqual({ first: 0, unchanged: 0, changed: 0, minor: 1 });
    });

    // RVP-1: the old code counted each long line cut where a space is as 601 characters; read back
    // and trimmed, it is 600. With many of them the read-back count is far under what the old code
    // counted, so the cut must be judged by the kept body itself.
    describe("kept by the old code with many long clauses cut at a space", () => {
      /** 599 characters of a clause, a space at character MAX_LINE_CHARS, then its rest. */
      const longClause = (index: number) =>
        `${`Clause ${index} `.padEnd(599, "x")} and the rest of clause ${index} goes on past the cut.`;
      const TAIL = `THE TAIL CLAUSE: we may share customer content with our partners for advertising. ${"w".repeat(500)}`;
      /** A page whose lines up to the tail the old code counted as `storedCount` characters. */
      function pageCounted(storedCount: number, tail = TAIL): string {
        const lines = Array.from({ length: 100 }, (_, index) => longClause(index));
        let chars = 100 * (MAX_LINE_CHARS + 1);
        let index = 0;
        while (chars < storedCount - 200) {
          lines.push(
            `Short clause number ${index++} of the privacy policy, padded `.padEnd(199, "y"),
          );
          chars += 200;
        }
        lines.push("z".repeat(storedCount - chars - 1));
        lines.push(tail);
        return lines.join("\n");
      }
      const keptByOldCode = (text: string, trimmed: boolean): StoredSnapshot => {
        const old = oldLinesOf(text, trimmed);
        return { hash: oldHashOf(old), body: old.join("\n"), lastSeenAt: new Date(NOW) };
      };
      const page = (text: string): PolicyPage => ({ ...pageOf("privacy", "privacy", []), text });

      it("takes the unchanged page as no change, stored count 99,450", () => {
        const text = pageCounted(99_450);
        const kept = keptByOldCode(text, false);
        expect(kept.body.length + 1).toBe(99_450);
        expect(kept.body).not.toContain("THE TAIL CLAUSE");

        const result = comparePages({
          pages: [page(text)],
          stored: new Map([["acme.com/privacy", kept]]),
          now: NOW,
        });

        expect(result.entries).toEqual([]);
        expect(result.counts).toEqual({ first: 0, unchanged: 0, changed: 0, minor: 1 });
      });

      it.each([false, true])(
        "takes the unchanged page as no change for every stored count from 99,000 to 100,000 (trimmed %s)",
        (trimmed) => {
          const counts: number[] = [];
          for (let count = 99_000; count <= 100_000; count += 37) counts.push(count);
          counts.push(99_398, 99_399, 99_400, 99_401, 99_409, 99_410, 99_999);
          for (const count of counts) {
            const text = pageCounted(count);
            const result = comparePages({
              pages: [page(text)],
              stored: new Map([["acme.com/privacy", keptByOldCode(text, trimmed)]]),
              now: NOW,
            });
            expect({ count, entries: result.entries }).toEqual({ count, entries: [] });
          }
        },
      );

      // The nearest neighbour: a body that ends far enough under the limit that the old code would
      // have kept one more line of any kind is whole, so a line appended to the page is a change.
      it("reports a clause appended to a page kept whole by the old code", () => {
        const text = pageCounted(98_000, "The last clause of the policy as it was, kept whole.");
        const kept = keptByOldCode(text, false);
        expect(kept.body).toContain("kept whole");
        const appended =
          "We may share customer content with our partners for advertising purposes.";

        const result = comparePages({
          pages: [page(`${text}\n${appended}`)],
          stored: new Map([["acme.com/privacy", kept]]),
          now: NOW,
        });

        expect(result.counts.changed).toBe(1);
        expect(result.entries[0].content).toContain(`Added:\n- ${appended}`);
      });
    });
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

  it("notes no page of a host where many have pages, though the vendor's website is on it", async () => {
    // The vendor's website is github.com/acme-widgets: a stranger's page on the host that calls
    // itself a privacy policy is not the vendor's terms page.
    const collector = collectPolicyPages(readerOf(), ["github.com", "www.notion.site"]);

    await collector.read(
      "https://github.com/mallory/acme-widgets-legal/blob/main/privacy-policy.md",
    );
    await collector.read("https://gist.github.com/mallory/privacy");
    await collector.read("https://notion.site/privacy");

    expect(collector.pages()).toEqual([]);
  });

  it("keeps a vendor's site under a host where many have pages, and a domain beside a shared alias", async () => {
    const collector = collectPolicyPages(readerOf(), ["acme.github.io", "github.com"]);

    await collector.read("https://acme.github.io/privacy");
    await collector.read("https://mallory.github.io/privacy");

    expect(collector.pages().map((page) => [page.url, page.kind])).toEqual([
      ["https://acme.github.io/privacy", "privacy"],
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

describe("snapshotsToKeep", () => {
  const pageOf = (path: string, lines: string[]): PolicyPage => ({
    url: `https://acme.com/${path}`,
    key: `acme.com/${path}`,
    kind: "terms",
    title: path,
    text: lines.join("\n"),
  });
  const storedOf = (lines: string[]): StoredSnapshot => {
    const normalised = linesOf(lines.join("\n"));
    return {
      hash: hashOf(normalised),
      body: normalised.join("\n"),
      lastSeenAt: new Date("2031-03-01T08:00:00Z"),
    };
  };
  // Two pages that changed, one that did not, one seen for the first time.
  const changedA = pageOf("terms", [CLAUSE_A]);
  const changedB = pageOf("dpa", [CLAUSE_C]);
  const same = pageOf("privacy", [CLAUSE_D]);
  const first = pageOf("subprocessors", [CLAUSE_B]);
  const comparison = comparePages({
    pages: [changedA, changedB, same, first],
    stored: new Map([
      [changedA.key, storedOf([CLAUSE_B])],
      [changedB.key, storedOf([CLAUSE_D])],
      [same.key, storedOf([CLAUSE_D])],
    ]),
    now: NOW,
  });
  const [changeA, changeB] = comparison.entries;
  const keys = (writes: { pageKey: string }[]) => writes.map((write) => write.pageKey);

  it("keeps every page when every change was shown", () => {
    const kept = snapshotsToKeep(comparison, [changeA, changeB]);

    expect(kept.withheld).toBe(0);
    expect(kept.writes).toEqual(comparison.writes);
  });

  it("does not keep a page whose change was not shown, and keeps the pages that made no change", () => {
    const kept = snapshotsToKeep(comparison, [changeB]);

    expect(kept.withheld).toBe(1);
    expect(keys(kept.writes)).toEqual([changedB.key, same.key, first.key]);
  });

  it("does not keep a page whose change was shown with its text cut", () => {
    const kept = snapshotsToKeep(comparison, [
      { url: changeA.url, content: changeA.content.slice(0, 50) },
      changeB,
    ]);

    expect(kept.withheld).toBe(1);
    expect(keys(kept.writes)).toEqual([changedB.key, same.key, first.key]);
  });

  it("keeps the pages that made no change when nothing was shown", () => {
    expect(keys(snapshotsToKeep(comparison, []).writes)).toEqual([same.key, first.key]);
  });
});
