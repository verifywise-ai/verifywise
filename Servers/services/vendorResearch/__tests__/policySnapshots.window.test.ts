/**
 * A property test of the window rule of `comparePages` for pages that the limits cut (RV6P-1,
 * RV6P-2): random pages compared with a reference made from the whole of both versions, in the
 * same line space. Seeded, so every run checks the same cases.
 *
 * The reference knows what the stored data cannot: the whole old page. It checks that
 * - an unchanged page is no change, in every stored state (I1);
 * - no line reported as added is a line of the old page, and no line reported as removed is a
 *   line of the new page (no fake change, whatever the edit);
 * - every line removed from the kept body is reported, and a line added before two kept lines
 *   that follow each other on both versions, and are each on both only once, is reported (I2);
 * - the cost is linear in the lines of the page (I3).
 *
 * Wave 10 (RV8P-1..4) makes the second check strict over more edits: blocks deleted across the
 * cut, the end of the page deleted, rows of a table deleted, several edits at once, on pages of
 * boilerplate and of table cells. No line reported as added is a line of the whole old page,
 * except in the three cases that the stored row and the new page cannot tell from new text: lines
 * moved (the truth test below allows it after `moveDown`, its only edit that can make it), two
 * neighbouring kept lines deleted whose copies stand past the cut, and an inserted copy of a line
 * past the cut (the last two are pinned under "copies past the cut of kept lines whose kept
 * copies are deleted"; the pages of the truth test have no line twice, so they cannot make them).
 * The first property test allows none of the three: its edits move no line and insert no old line,
 * and the deletions of its pages of boilerplate and table cells reach no deleted pair of kept lines
 * with copies past the cut on its fixed seeds (a seed that does would fail it).
 */
import { createHash } from "node:crypto";
import { cleanText, cutAtCodePoint } from "../text";
import {
  CONTINUED_MARK,
  MAX_LINE_CHARS,
  MAX_SNAPSHOT_CHARS,
  MAX_SNAPSHOT_LINES,
  MIN_CHANGED_CHARS,
  type PolicyPage,
  type StoredSnapshot,
  comparePages,
  hashOf,
  linesOf,
  snapshotsToKeep,
} from "../policySnapshots";

const NOW = new Date("2031-04-20T12:00:00Z");
/** The seeds of the property tests; a hunt for a counter-example runs many more (POLICY_SEEDS). */
const SEEDS = Number(process.env.POLICY_SEEDS ?? 4);
const KEY = "acme.com/terms";

/** A small seeded generator (mulberry32), so that the cases are the same on every run. */
function randomOf(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- The reference line space: written here from the rules, not taken from the module. ---

const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

function refPartsOf(line: string): string[] {
  if (line.length <= MAX_LINE_CHARS) return [line];
  const parts: string[] = [];
  let rest = line;
  let room = MAX_LINE_CHARS;
  while (rest !== "") {
    let part = cutAtCodePoint(rest, room);
    if (part.length < rest.length) {
      const blank = part.lastIndexOf(" ");
      if (blank > room / 2) part = part.slice(0, blank);
    }
    rest = rest.slice(part.length).trimStart();
    parts.push(parts.length === 0 ? part.trimEnd() : `${CONTINUED_MARK}${part.trimEnd()}`);
    room = MAX_LINE_CHARS - CONTINUED_MARK.length;
  }
  return parts;
}
const refCutAsBefore = (line: string): string[] => [cutAtCodePoint(line, MAX_LINE_CHARS).trimEnd()];

/** Every line of a text in a line space, unbounded, or bounded by the limits. */
function refLines(text: string, legacy: boolean, bounded: boolean): string[] {
  const split = legacy ? refCutAsBefore : refPartsOf;
  const lines: string[] = [];
  let chars = 0;
  for (const raw of cleanText(text).split("\n")) {
    for (const line of split(raw.replace(/\s+/g, " ").trim())) {
      if (!HAS_LETTER_OR_DIGIT.test(line)) continue;
      if (
        bounded &&
        (lines.length >= MAX_SNAPSHOT_LINES || chars + line.length + 1 > MAX_SNAPSHOT_CHARS)
      ) {
        return lines;
      }
      lines.push(line);
      chars += line.length + 1;
    }
  }
  return lines;
}

/** The lines as the code kept them before long lines were split (see policySnapshots.test.ts). */
function oldLinesOf(text: string, trimmed: boolean): string[] {
  const lines: string[] = [];
  let chars = 0;
  for (const raw of cleanText(text).split("\n")) {
    const cut = cutAtCodePoint(raw.replace(/\s+/g, " ").trim(), MAX_LINE_CHARS);
    const line = trimmed ? cut.trimEnd() : cut;
    if (!HAS_LETTER_OR_DIGIT.test(line)) continue;
    if (lines.length >= MAX_SNAPSHOT_LINES || chars + line.length + 1 > MAX_SNAPSHOT_CHARS) break;
    lines.push(line);
    chars += line.length + 1;
  }
  return lines;
}
const oldHashOf = (lines: readonly string[]): string =>
  createHash("sha256").update(lines.join("\n")).digest("hex");

type StoredState = "current" | "legacy" | "legacyTrimmed";

function storedOf(text: string, state: StoredState): StoredSnapshot {
  const lastSeenAt = new Date("2031-03-01T08:00:00Z");
  if (state === "current") {
    const [write] = comparePages({
      pages: [pageOf(text)],
      stored: new Map(),
      now: NOW,
    }).writes;
    return { hash: write.hash, body: write.body, lastSeenAt };
  }
  const old = oldLinesOf(text, state === "legacyTrimmed");
  return { hash: oldHashOf(old), body: old.join("\n"), lastSeenAt };
}

const pageOf = (text: string): PolicyPage => ({
  url: "https://acme.com/terms",
  key: KEY,
  kind: "terms",
  title: "Terms",
  text,
});

// --- Random pages ---

const COMMON = [
  "the",
  "customer",
  "data",
  "may",
  "use",
  "provider",
  "service",
  "process",
  "share",
  "partners",
  "consent",
  "written",
  "notice",
  "within",
  "days",
];
const BOILERPLATE = [
  "Learn more",
  "Contact us",
  "Back to top",
  "Cookie settings",
  "This section applies to every customer of the service in every country and region.",
];

function generatorOf(random: () => number) {
  let serial = 0;
  const pick = <T>(values: readonly T[]): T => values[Math.floor(random() * values.length)];
  const between = (low: number, high: number) => low + Math.floor(random() * (high - low + 1));
  /** A clause of about `length` characters, with blanks, unlike every other clause. */
  const clause = (length: number): string => {
    serial += 1;
    let text = `Clause ${serial}q${Math.floor(random() * 1e6)}.`;
    while (text.length < length) text += ` ${pick(COMMON)}`;
    return text.slice(0, length).trimEnd();
  };
  /** A clause with no blank: text that is cut at the limit, in the middle of a word. */
  const unbroken = (length: number): string => {
    serial += 1;
    return `条款${serial}${"データの利用".repeat(length)}`.slice(0, length);
  };
  const line = (short: boolean): string => {
    const roll = random();
    if (roll < 0.12) return pick(BOILERPLATE);
    if (short) return clause(between(12, 22));
    if (roll < 0.3) return clause(between(590, 610));
    if (roll < 0.34) return clause(between(3_000, 3_200));
    if (roll < 0.36) return unbroken(between(601, 700));
    return clause(between(60, 400));
  };
  /**
   * A page around the limit of characters, or (short) around the limit of lines. Most pages have
   * boilerplate near the top that comes again just past the cut of one of the line spaces, with
   * old text between (RV6P-1).
   */
  const page = (short: boolean): string[] => {
    const lines: string[] = [];
    if (short) {
      const count = between(MAX_SNAPSHOT_LINES - 60, MAX_SNAPSHOT_LINES + 300);
      while (lines.length < count) lines.push(line(true));
    } else {
      const target = between(MAX_SNAPSHOT_CHARS - 3_000, MAX_SNAPSHOT_CHARS + 25_000);
      let chars = 0;
      while (chars < target) {
        const next = line(false);
        lines.push(next);
        chars += next.length + 1;
      }
    }
    lines.splice(3, 0, "Learn more");
    lines.splice(8, 0, "Contact us");
    if (random() < 0.7) {
      const at = windowEndOf(lines, random() < 0.5) + between(0, 2);
      lines.splice(
        at,
        0,
        "Learn more",
        `Old sentence ${serial} that was always on the page past the cut, never added.`,
        clause(585),
        "Contact us",
      );
    }
    return lines;
  };
  /**
   * A list of subprocessors cut by the limit of characters, a cell to a line, as the page reader
   * gives a table (RV8P-3): the purposes and countries repeat on every few rows.
   */
  const table = (): string[] => {
    const purposes = ["Cloud hosting", "Customer support", "Email delivery", "Analytics"];
    const countries = ["United States", "Ireland", "Germany", "India", "Japan"];
    const lines = ["Subprocessors", "Name", "Purpose", "Location"];
    const target = between(MAX_SNAPSHOT_CHARS - 3_000, MAX_SNAPSHOT_CHARS + 25_000);
    let chars = 0;
    while (chars < target) {
      serial += 1;
      const row = [`Vendor${serial} Inc.`, pick(purposes), pick(countries)];
      if (random() < 0.12) row.push(clause(between(400, 610)));
      lines.push(...row);
      chars += row.reduce((sum, cell) => sum + cell.length + 1, 0);
    }
    return lines;
  };
  return { pick, between, clause, page, table, random };
}

const EDITS = [
  "none",
  "insert",
  "delete",
  "word",
  "append",
  "prepend",
  "deleteRepeated",
  "rewriteLong",
  "deleteAcrossCut",
  "deleteTail",
  "deleteRows",
  "several",
  "deleteKept",
] as const;
type Edit = (typeof EDITS)[number];

/** The raw index of the first page line that the limits leave out of the kept window. */
function windowEndOf(lines: readonly string[], legacy = false): number {
  let chars = 0;
  let count = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const squeezed = lines[index].replace(/\s+/g, " ").trim();
    const parts = (
      legacy ? [cutAtCodePoint(squeezed, MAX_LINE_CHARS)] : refPartsOf(squeezed)
    ).filter((part) => HAS_LETTER_OR_DIGIT.test(part));
    for (const part of parts) {
      if (count >= MAX_SNAPSHOT_LINES || chars + part.length + 1 > MAX_SNAPSHOT_CHARS) {
        return index;
      }
      count += 1;
      chars += part.length + 1;
    }
  }
  return lines.length;
}

function edited(
  lines: readonly string[],
  edit: Edit,
  generator: ReturnType<typeof generatorOf>,
  short: boolean,
): string[] {
  const { between, clause, random } = generator;
  const result = [...lines];
  const end = windowEndOf(lines);
  // Half of the edits fall near the end of the kept window, where the rule has to judge.
  const near = () =>
    random() < 0.5
      ? Math.max(0, Math.min(result.length - 1, end + between(-6, 2)))
      : between(0, result.length - 1);
  const fresh = () => clause(short ? between(41, 60) : between(41, 700));
  switch (edit) {
    case "none":
      return result;
    case "insert":
      result.splice(near(), 0, fresh());
      return result;
    case "delete":
      result.splice(near(), 1);
      return result;
    case "word": {
      // A clause (not a boilerplate line) near the end of the window gets one word changed.
      for (let tries = 0; tries < 50; tries += 1) {
        const at = near();
        const words = result[at].split(" ");
        if (BOILERPLATE.includes(result[at]) || words.length < 3) continue;
        words[between(1, words.length - 1)] = `changed${between(0, 1e6)}`;
        result[at] = words.join(" ");
        return result;
      }
      return result;
    }
    case "append":
      result.push(fresh());
      return result;
    case "prepend":
      result.unshift(fresh());
      return result;
    case "rewriteLong": {
      // A clause of several parts inside the window is written anew: every part of it changes.
      const longOnes = result
        .map((line, index) => (line.length > 1_200 && index < end ? index : -1))
        .filter((index) => index >= 0);
      if (longOnes.length === 0) return result;
      result[longOnes[between(0, longOnes.length - 1)]] = clause(between(1_300, 3_200));
      return result;
    }
    case "deleteAcrossCut":
      // A block from inside the kept window to past the cut: the last kept lines go together with
      // the line the limits left out (RV8P-1).
      result.splice(Math.max(0, end - between(1, 12)), between(2, 16));
      return result;
    case "deleteTail":
      // Everything from inside the kept window to the end of the page, but a short footer.
      result.splice(Math.max(0, end - between(1, 40)), result.length - end - between(0, 4));
      return result;
    case "deleteRows": {
      // A few lines in a row, repeated cells or boilerplate among them, anywhere in the window
      // (RV8P-3, RV8P-4).
      result.splice(between(0, Math.max(0, end - 1)), between(2, 12));
      return result;
    }
    case "deleteKept":
      // Every line of the kept window and a few past the cut: the page holds no kept line. A few
      // lines stay, since a page with no text is passed over.
      result.splice(0, Math.min(end + between(0, 3), result.length - 3));
      return result;
    case "several":
      // Two lines inserted and a block deleted, at random places.
      result.splice(near(), 0, fresh());
      result.splice(near(), between(1, 6));
      result.splice(between(0, result.length), 0, fresh());
      return result;
    case "deleteRepeated": {
      // The kept line X just before the end of the window comes again past the cut: deleting the
      // kept X leaves one X on the page, far down (the residual case of the notes).
      const at = Math.max(0, end - 1);
      result.splice(Math.min(result.length, end + between(5, 40)), 0, result[at]);
      result.splice(at, 1);
      return result;
    }
  }
}

// --- Reading what comparePages reported ---

/** The lines of a change text under Added: and Removed:, as page lines. */
function reported(content: string): { added: string[]; removed: string[]; hidden: boolean } {
  const result = { added: [] as string[], removed: [] as string[], hidden: false };
  let into: string[] | null = null;
  for (const line of content.split("\n")) {
    if (line === "Added:") into = result.added;
    else if (line === "Removed:") into = result.removed;
    else if (into !== null && line.startsWith("- ")) into.push(line.slice(2));
    else if (into !== null && line.startsWith("  ")) into.push(`${CONTINUED_MARK}${line.slice(2)}`);
    else {
      into = null;
      if (/not shown\.$/.test(line)) result.hidden = true;
    }
  }
  return result;
}

/**
 * The stretches of text that a change text shows under Added: and Removed: (RV6P-3): a bullet
 * line, without a continued mark it begins with, and the lines that continue it, each after one
 * space. Each must be a stretch of one line of the page it comes from.
 */
function stretchesOf(content: string): { added: string[]; removed: string[] } {
  const result = { added: [] as string[], removed: [] as string[] };
  let into: string[] | null = null;
  for (const line of content.split("\n")) {
    if (line === "Added:") into = result.added;
    else if (line === "Removed:") into = result.removed;
    else if (into !== null && line.startsWith("- ")) {
      const text = line.slice(2);
      into.push(text.startsWith(CONTINUED_MARK) ? text.slice(CONTINUED_MARK.length) : text);
    } else if (into !== null && line.startsWith("  ") && into.length > 0) {
      into[into.length - 1] += ` ${line.slice(2)}`;
    } else into = null;
  }
  return result;
}

/** The text of a page with each of its lines squeezed, as the kept lines are made from it. */
const squeezed = (text: string) =>
  cleanText(text)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n");

const comparable = (line: string) => line.toLowerCase();
const isStamp = (line: string) =>
  line.length <= 80 &&
  (/^(?:last\s+)?(?:updated|revised|modified|effective|published)\b/i.test(line) ||
    /^(?:©|\(c\)|copyright\b)/i.test(line));

interface Outcome {
  failures: string[];
  /** How many cases checked an unchanged page, a line that must be added, one that must be removed. */
  reached: {
    unchanged: number;
    added: number;
    removed: number;
    nearCut: number;
    stretches: number;
    joints: number;
  };
}

/** What the checks of one old page in one stored state share. */
interface OldVersion {
  text: string;
  state: StoredState;
  stored: StoredSnapshot;
  /** Every line of the old page, in the line space of the state, as compared. */
  all: ReadonlySet<string>;
  squeezed: string;
}

function oldVersionOf(text: string, state: StoredState): OldVersion {
  return {
    text,
    state,
    stored: storedOf(text, state),
    all: new Set(refLines(text, state !== "current", false).map(comparable)),
    squeezed: squeezed(text),
  };
}

function check(
  old: OldVersion,
  newText: string,
  edit: Edit,
  label: string,
  outcome: Outcome,
): void {
  const { state, stored } = old;
  const legacy = state !== "current";
  const result = comparePages({
    pages: [pageOf(newText)],
    stored: new Map([[KEY, stored]]),
    now: NOW,
  });
  const fail = (what: string) => outcome.failures.push(`${label} ${state} ${edit}: ${what}`);
  if (edit === "none") {
    outcome.reached.unchanged += 1;
    if (result.entries.length > 0)
      fail(`unchanged page made a change: ${result.entries[0].content.slice(0, 300)}`);
    return;
  }
  const oldAll = old.all;
  const newAllLines = refLines(newText, legacy, false);
  const newAll = new Set(newAllLines.map(comparable));
  const before = refLines(stored.body, legacy, true);
  const shown =
    result.entries.length === 0
      ? { added: [], removed: [], hidden: false }
      : reported(result.entries[0].content);

  for (const line of shown.added) {
    if (oldAll.has(comparable(line))) fail(`fake Added (old text): ${line.slice(0, 120)}`);
    if (!newAll.has(comparable(line))) fail(`Added not on the new page: ${line.slice(0, 120)}`);
  }
  if (result.entries.length > 0) {
    const stretches = stretchesOf(result.entries[0].content);
    const [newPage, oldPage] = [squeezed(newText), old.squeezed];
    outcome.reached.stretches += stretches.added.length + stretches.removed.length;
    outcome.reached.joints += result.entries[0].content.split("\n  ").length - 1;
    for (const stretch of stretches.added) {
      if (!newPage.includes(stretch))
        fail(`Added stretch not on the page: ${stretch.slice(0, 120)}`);
    }
    for (const stretch of stretches.removed) {
      if (!oldPage.includes(stretch))
        fail(`Removed stretch not on the old page: ${stretch.slice(0, 120)}`);
    }
  }
  for (const line of shown.removed) {
    if (newAll.has(comparable(line))) fail(`fake Removed (still there): ${line.slice(0, 120)}`);
  }
  if (shown.hidden) return;

  // Every kept line that is gone from the page is reported.
  const removed = [
    ...new Set(
      before.filter((line) => !newAll.has(comparable(line)) && !isStamp(line)).map(comparable),
    ),
  ];
  // A new line before two kept lines that follow each other on both versions, each once on both
  // and each a line of its own (not a later part of the line before), is inside the kept window:
  // it is reported.
  const after = refLines(newText, legacy, true);
  const countOf = (lines: readonly string[]) => {
    const counts = new Map<string, number>();
    for (const line of lines) counts.set(comparable(line), (counts.get(comparable(line)) ?? 0) + 1);
    return counts;
  };
  const inBefore = countOf(before);
  const inPage = countOf(newAllLines);
  const keptIndex = new Map(before.map((line, index) => [comparable(line), index]));
  let lastPair = -1;
  for (let position = 0; position + 1 < newAllLines.length; position += 1) {
    const [a, b] = [comparable(newAllLines[position]), comparable(newAllLines[position + 1])];
    if (
      inBefore.get(a) === 1 &&
      inBefore.get(b) === 1 &&
      inPage.get(a) === 1 &&
      inPage.get(b) === 1 &&
      keptIndex.get(b) === (keptIndex.get(a) ?? -2) + 1 &&
      !newAllLines[position + 1].startsWith(CONTINUED_MARK)
    ) {
      lastPair = position;
    }
  }
  const mustAdd = [
    ...new Set(
      after
        .slice(0, Math.max(0, lastPair))
        .filter((line) => !oldAll.has(comparable(line)) && !isStamp(line))
        .map(comparable),
    ),
  ];
  const changed = [...mustAdd, ...removed].reduce((sum, line) => sum + line.length, 0);
  if (changed < MIN_CHANGED_CHARS) return;
  if (mustAdd.length > 0) outcome.reached.added += 1;
  if (removed.length > 0) outcome.reached.removed += 1;
  // A line that must be added and sits within about ten lines of the end of the kept window.
  const nearEnd = new Set(after.slice(Math.max(0, before.length - 12)).map(comparable));
  if (mustAdd.some((line) => nearEnd.has(line))) {
    outcome.reached.nearCut += 1;
  }
  const added = new Set(shown.added.map(comparable));
  const gone = new Set(shown.removed.map(comparable));
  for (const line of mustAdd) if (!added.has(line)) fail(`missed Added: ${line.slice(0, 120)}`);
  for (const line of removed) if (!gone.has(line)) fail(`missed Removed: ${line.slice(0, 120)}`);
}

describe("the window rule of comparePages, against the whole of both versions", () => {
  it("makes its lines as the reference does", () => {
    const generator = generatorOf(randomOf(7));
    for (const short of [false, true]) {
      const text = generator.page(short).join("\n");
      expect(linesOf(text)).toEqual(refLines(text, false, true));
    }
  });

  it("never reports a fake change, and reports what the kept window shows changed", () => {
    const outcome: Outcome = {
      failures: [],
      reached: { unchanged: 0, added: 0, removed: 0, nearCut: 0, stretches: 0, joints: 0 },
    };
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      for (const kind of ["chars", "lines", "table"] as const) {
        const short = kind === "lines";
        const generator = generatorOf(
          randomOf(seed * 7919 + (short ? 1 : 0) + (kind === "table" ? 2 : 0)),
        );
        const lines = kind === "table" ? generator.table() : generator.page(short);
        const oldText = lines.join("\n");
        const versions = (["current", "legacy", "legacyTrimmed"] as const).map((state) =>
          oldVersionOf(oldText, state),
        );
        for (const edit of EDITS) {
          const newText = edited(lines, edit, generator, short).join("\n");
          for (const version of versions) {
            check(version, newText, edit, `seed ${seed} ${kind}`, outcome);
          }
        }
      }
    }
    expect(outcome.failures).toEqual([]);
    // The cases reach every kind of check, near the cut too.
    expect(outcome.reached.unchanged).toBe(SEEDS * 9);
    expect(outcome.reached.added).toBeGreaterThanOrEqual(60);
    expect(outcome.reached.removed).toBeGreaterThanOrEqual(30);
    expect(outcome.reached.nearCut).toBeGreaterThanOrEqual(10);
    expect(outcome.reached.stretches).toBeGreaterThanOrEqual(100);
    expect(outcome.reached.joints).toBeGreaterThanOrEqual(30);
  });

  // RV6P-1, the probe of the review: a legacy row whose kept body has short boilerplate lines that
  // the page repeats just past the old cut.
  it.each(["legacy", "legacyTrimmed", "current"] as const)(
    "takes an unchanged page with boilerplate repeated past the cut as no change (%s)",
    (state) => {
      const lines: string[] = [];
      const longClause = (index: number) =>
        `${`Clause ${index} `.padEnd(599, "x")} and the rest of clause ${index} goes on.`;
      for (let index = 0; index < 160; index += 1) {
        lines.push(index === 5 ? "Learn more" : index === 10 ? "Contact us" : longClause(index));
      }
      let chars = lines.reduce((sum, line) => sum + Math.min(line.length, 601) + 1, 0);
      let index = 160;
      while (chars < MAX_SNAPSHOT_CHARS + 2_000) {
        const next = `Short clause number ${index++} of the terms, padded `.padEnd(199, "y");
        lines.push(next);
        chars += next.length + 1;
      }
      lines.push(
        "Learn more",
        "This sentence was always on the page and is old text, never added.",
        "z".repeat(585),
        "Contact us",
      );
      const text = lines.join("\n");
      const result = comparePages({
        pages: [pageOf(text)],
        stored: new Map([[KEY, storedOf(text, state)]]),
        now: NOW,
      });
      expect(result.entries).toEqual([]);
    },
  );

  // RV6P-1, probes b_rvp3_unchanged.js and rvp3_unchanged.js of the review: the old cut falls
  // right before boilerplate that the kept body has near its top, then old text.
  describe("boilerplate of the kept body repeated right after the old cut", () => {
    const clauseOf = (index: number) => {
      const start = `clause${index} `;
      return `${start}${"a".repeat(599 - start.length)} ${"b".repeat(99)}`;
    };
    const OLD_SENTENCE = "This sentence was always on the page and is old text, never added.";
    function pageWithTail(tail: string[], trimmed: boolean): string[] {
      const head = Array.from({ length: 160 }, (_, index) => clauseOf(index));
      head.splice(5, 0, "Learn more");
      head.splice(10, 0, "Contact us");
      const all = [
        ...head,
        ...Array.from({ length: 2_001 }, (_, index) => `filler line number ${index} of the terms`),
      ];
      // A drop that leaves more lines than the old code keeps of them cannot put the tail right
      // after the cut, so the search starts at the first that can.
      const keptOfAll = oldLinesOf(all.join("\n"), trimmed).length;
      for (let drop = Math.max(0, all.length - keptOfAll); drop < 2_000; drop += 1) {
        const lines = [...all.slice(0, all.length - drop), ...tail];
        if (oldLinesOf(lines.join("\n"), trimmed).length === all.length - drop) return lines;
      }
      throw new Error("no cut before the tail");
    }
    it.each([
      [
        "legacy",
        false,
        [
          "Learn more",
          OLD_SENTENCE,
          `zz long unique paragraph ${"q".repeat(560)}`,
          "Contact us",
          "end of page",
        ],
      ],
      ["legacy", false, ["Learn more", OLD_SENTENCE, "Contact us"]],
    ] as const)("takes the unchanged page as no change (%s)", (state, trimmed, tail) => {
      const text = pageWithTail([...tail], trimmed).join("\n");
      expect(storedOf(text, state).body).not.toContain(OLD_SENTENCE);
      const result = comparePages({
        pages: [pageOf(text)],
        stored: new Map([[KEY, storedOf(text, state)]]),
        now: NOW,
      });
      expect(result.entries).toEqual([]);
    });

    // Probe rvp3_shift.js: a row of the current format that the limits cut; the vendor removes
    // one clause near the top. Only that clause is a change.
    it("reports only the clause removed near the top of a cut page", () => {
      const removedClause = `This clause is removed by the vendor in the new version of the page ${"r".repeat(400)}`;
      const head = ["Our terms", "Learn more", removedClause, "Contact us"];
      const filler = Array.from(
        { length: 1_300 },
        (_, index) => `clause ${index} of the terms that stays where it was on the page all along`,
      );
      const tail = [
        "Learn more",
        "This sentence was always on the page past the old cut, old text.",
        `zz long unique paragraph ${"q".repeat(560)}`,
        "Contact us",
        "the end",
      ];
      const base = [...head, ...filler];
      let room = MAX_SNAPSHOT_CHARS - (linesOf(base.join("\n")).join("\n").length + 1) - 5;
      const pads: string[] = [];
      for (let index = 0; room > 0; index += 1) {
        const length = Math.min(500, room - 1);
        pads.push(`pad${index} ${"p".repeat(600)}`.slice(0, length));
        room -= length + 1;
      }
      const oldPage = [...base, ...pads, ...tail];
      const kept = linesOf(oldPage.join("\n"));
      expect(kept.join("\n")).not.toContain("past the old cut");
      const stored: StoredSnapshot = {
        hash: hashOf(kept, true),
        body: kept.join("\n"),
        lastSeenAt: new Date("2031-03-01T08:00:00Z"),
      };
      const newPage = oldPage.filter((line) => line !== removedClause).join("\n");

      const result = comparePages({
        pages: [pageOf(newPage)],
        stored: new Map([[KEY, stored]]),
        now: NOW,
      });

      expect(result.entries).toHaveLength(1);
      const shown = reported(result.entries[0].content);
      expect(shown).toEqual({ added: [], removed: [removedClause], hidden: false });
    });
  });

  // RV6P-2: the window is found in time linear in the lines of the page, whatever the kept body
  // repeats. A kept body of 4,000 lines that repeat costs about what one of 40 does.
  it("finds the window in time that does not grow with the repeats of the kept body", () => {
    const timeOf = (repeats: number): number => {
      const keptLines = ["h", ...Array.from({ length: repeats }, () => "x"), "z", "w"];
      const stored: StoredSnapshot = {
        hash: hashOf(keptLines, true),
        body: keptLines.join("\n"),
        lastSeenAt: new Date("2031-03-01T08:00:00Z"),
      };
      const page = [
        "h",
        ...Array.from({ length: 3_990 }, (_, index) => `new line ${index} of the page`),
        "z",
        ...Array.from({ length: 300_000 }, () => "x"),
      ].join("\n");
      let best = Infinity;
      for (let run = 0; run < 3; run += 1) {
        const start = process.hrtime.bigint();
        comparePages({ pages: [pageOf(page)], stored: new Map([[KEY, stored]]), now: NOW });
        best = Math.min(best, Number(process.hrtime.bigint() - start) / 1e6);
      }
      return best;
    };
    const few = timeOf(40);
    const many = timeOf(MAX_SNAPSHOT_LINES - 3);
    expect(many).toBeLessThan(Math.max(5 * few, 50));
  });
});

// RV7P-1, the probes of the review of wave 8: a change in the last kept clause of a cut page, or
// right before the last kept line. Wave 9 showed it with what it replaced. Since wave 10 the window
// ends at the last anchor pair, so a change after that pair shows only what was removed (in a row
// kept now, and never old text as added), and a change before it is shown whole.
describe("a change at the end of the kept window of a cut page (RV7P-1)", () => {
  const compareWith = (oldText: string, newText: string, state: StoredState = "current") =>
    comparePages({
      pages: [pageOf(newText)],
      stored: new Map([[KEY, storedOf(oldText, state)]]),
      now: NOW,
    });

  // Probe pol_lastclause2.js: sections of a heading and a clause of four parts; the limit of
  // characters cuts inside one of them.
  describe("a word changed in the first part of a long clause", () => {
    const clause = (section: number, verb: string) =>
      `Section ${section}. The provider ${verb} customer data ${Array.from(
        { length: 330 },
        (_, index) => `s${section}w${index}`,
      ).join(" ")}.`;
    const build = (changeAt: number, verb: string) =>
      Array.from(
        { length: 60 },
        (_, section) =>
          `Heading ${section}\n${clause(section, section === changeAt ? verb : "protects")}`,
      ).join("\n");
    const kept = linesOf(build(-1, ""));
    const lastSection = Number(
      /Section (\d+)/.exec(kept.filter((line) => line.startsWith("Section ")).pop() ?? "")?.[1],
    );

    it("is a page whose cut falls inside the clause of the last kept section", () => {
      expect(kept[kept.length - 1].startsWith(CONTINUED_MARK)).toBe(true);
      expect(kept.join("\n")).not.toContain(`Heading ${lastSection + 1}`);
    });

    // Wave 10 (RV8P-1..4): in the line space of the rows kept now, the clause is in parts, and the
    // kept parts after the changed one are parts of the same line: no two lines that each start a
    // line of the page follow the change, so the new wording is after the window and only the old
    // one is shown (a missed Added, never a fake one). The old code cut the clause to one line,
    // and the next heading and clause make a pair after it.
    it("shows the old wording of the last kept clause, not the new one (current)", () => {
      const result = compareWith(build(-1, ""), build(lastSection, "SELLSXXX"));
      expect(result.entries).toHaveLength(1);
      const shown = reported(result.entries[0].content);
      expect(shown.added.join("\n")).not.toContain("SELLSXXX");
      expect(shown.removed.some((line) => line.includes("The provider protects customer"))).toBe(
        true,
      );
    });

    it.each(["legacy", "legacyTrimmed"] as const)(
      "shows the new wording of the last kept clause and the old one (%s)",
      (state) => {
        const result = compareWith(build(-1, ""), build(lastSection, "SELLSXXX"), state);
        expect(result.entries).toHaveLength(1);
        const shown = reported(result.entries[0].content);
        expect(shown.added.some((line) => line.includes("The provider SELLSXXX customer"))).toBe(
          true,
        );
        expect(shown.removed.some((line) => line.includes("The provider protects customer"))).toBe(
          true,
        );
      },
    );

    // The nearest neighbour: the section before it, which was already shown.
    it("shows the new wording of the clause of the section before it", () => {
      const result = compareWith(build(-1, ""), build(lastSection - 1, "SELLSXXX"));
      expect(reported(result.entries[0].content).added.join("\n")).toContain("SELLSXXX");
    });

    // Probe pol_keep.js: the page is kept once its change was shown. Wave 10: the change shown is
    // the old wording removed, not the new one, so the new wording becomes the baseline without
    // having been shown (the price of never showing old text as added; see keptWindowLength).
    it("keeps the page once its change was shown, though the new wording was not", () => {
      const first = compareWith(build(-1, ""), build(lastSection, "SELLSXXX"));
      expect(first.entries[0].content).not.toContain("SELLSXXX");
      expect(first.entries[0].content).toContain("Removed:");
      const keep = snapshotsToKeep(
        first,
        first.entries.map((entry) => ({ url: entry.url, content: entry.content })),
      );
      expect(keep.withheld).toBe(0);
      const second = comparePages({
        pages: [pageOf(build(lastSection, "SELLSXXX"))],
        stored: new Map([[KEY, { ...keep.writes[0], lastSeenAt: NOW }]]),
        now: NOW,
      });
      expect(second.counts.unchanged).toBe(1);
    });
  });

  // Probe pol_tail.js: 4,100 short lines, of which the limit of lines keeps 4,000.
  describe("a page cut by the limit of lines", () => {
    const lines = Array.from({ length: 4_100 }, (_, index) => `C${index} rec.`);
    const NEW =
      "INSERTED: The provider may use customer content to train its artificial intelligence models.";

    // Wave 10 (RV8P-1..4): one kept line after the new one is no pair, so the new line is after
    // the window; what it replaced is ten characters, under MIN_CHANGED_CHARS, so no change.
    it("does not show a line that replaced the kept line before the last one", () => {
      const now = [...lines];
      now[3_998] = NEW;
      expect(compareWith(lines.join("\n"), now.join("\n")).entries).toEqual([]);
    });

    it("shows a line inserted before the last two kept lines", () => {
      const now = [...lines];
      now.splice(3_998, 0, NEW);
      const result = compareWith(lines.join("\n"), now.join("\n"));
      expect(reported(result.entries[0].content)).toEqual({
        added: [NEW],
        removed: [],
        hidden: false,
      });
    });

    // Not told apart, by the stored row and the new page alone: a line inserted right before the
    // last kept line, and the last kept line moved one line down, past an old line that the limit
    // left out. Both pages and the stored row are the same; the old line must not be shown as new.
    it("cannot tell a line inserted before the last kept line from the last kept line moved down", () => {
      const inserted = [...lines];
      inserted.splice(3_999, 0, NEW);
      const oldWithLine = [...lines.slice(0, 4_000), NEW, ...lines.slice(4_000)];
      const moved = [...oldWithLine];
      moved.splice(3_999, 1);
      moved.splice(4_000, 0, lines[3_999]);
      expect(moved).toEqual(inserted);
      expect(storedOf(oldWithLine.join("\n"), "current")).toEqual(
        storedOf(lines.join("\n"), "current"),
      );
      expect(compareWith(lines.join("\n"), inserted.join("\n")).entries).toEqual([]);
    });

    it("is a page cut by the limit of lines, not of characters", () => {
      expect(lines.slice(0, 4_000).join("\n").length).toBeLessThan(MAX_SNAPSHOT_CHARS);
      expect(linesOf(lines.join("\n"))).toEqual(lines.slice(0, 4_000));
    });

    // The last kept line replaced, and the last kept line deleted, give the same stored row and
    // the same page: the line after the kept ones may be old text past the cut, so it is not
    // shown. The same for the kept line before it (no pair follows the new line). What was
    // removed is ten characters, under MIN_CHANGED_CHARS, so no entry is made at all.
    // (RV10PC-2: this test once used lines too long for the limit of lines to be the one that
    // cut, so the replaced line was past the cut and the test could not fail.)
    it("cannot tell the last kept line replaced from it deleted, on a page cut by the limit of lines", () => {
      const replaced = [...lines];
      replaced[3_999] = NEW;
      const oldWithLine = [...lines.slice(0, 4_000), NEW, ...lines.slice(4_000)];
      const deleted = oldWithLine.filter((_, index) => index !== 3_999);
      expect(deleted).toEqual(replaced);
      for (const state of ["current", "legacy", "legacyTrimmed"] as const) {
        expect(storedOf(oldWithLine.join("\n"), state)).toEqual(storedOf(lines.join("\n"), state));
        for (const at of [3_999, 3_998]) {
          const now = [...lines];
          now[at] = NEW;
          const result = compareWith(lines.join("\n"), now.join("\n"), state);
          expect({ state, at, entries: result.entries, counts: result.counts }).toEqual({
            state,
            at,
            entries: [],
            counts: { first: 0, unchanged: 0, changed: 0, minor: 1 },
          });
        }
      }
    });

    // The nearest neighbour: a last kept line long enough that what was removed makes an entry.
    // The entry shows the old line, and not the line that replaced it.
    it.each(["current", "legacy", "legacyTrimmed"] as const)(
      "shows what a long last kept line was, not the line that replaced it (%s)",
      (state) => {
        const old = [...lines];
        old[3_999] = "C3999. The provider keeps customer records for audits by the customer.";
        expect(linesOf(old.join("\n"))).toEqual(old.slice(0, 4_000));
        const now = [...old];
        now[3_999] = NEW;
        const result = compareWith(old.join("\n"), now.join("\n"), state);
        expect(result.entries).toHaveLength(1);
        expect(reported(result.entries[0].content)).toEqual({
          added: [],
          removed: [old[3_999]],
          hidden: false,
        });
      },
    );
  });

  // The same on a page cut by the limit of characters, though a line as short as the last kept one
  // would still have fitted behind the kept lines (the line the limits left out did not).
  describe("a page cut by the limit of characters, where a short line would still have fitted", () => {
    // 999 lines of 99 characters leave room for a line of 99; the next line, of 590, did not fit.
    const lines = [
      ...Array.from({ length: 999 }, (_, index) => `Clause ${index} of the terms `.padEnd(99, "t")),
      `The clause past the cut ${"o".repeat(566)}`,
      ...Array.from({ length: 50 }, (_, index) => `Later clause ${index} of the terms`),
    ];
    const NEW = "The provider may use customer content to train its models.";

    it("keeps the lines up to the long one", () => {
      expect(linesOf(lines.join("\n"))).toEqual(lines.slice(0, 999));
    });

    // Wave 10 (RV8P-1): that a line fits behind the kept lines proves only that it is not the line
    // the limits left out, not that it is new (a block deleted across the cut brings old lines that
    // fit right after the kept ones), so the window does not look at it: the new line is after the
    // last anchor pair, and only what it replaced is shown.
    it("shows what the last kept line was, not the line that replaced it", () => {
      const now = [...lines];
      now[998] = NEW;
      const shown = reported(compareWith(lines.join("\n"), now.join("\n")).entries[0].content);
      expect(shown).toEqual({ added: [], removed: [lines[998]], hidden: false });
    });

    it("does not show the line past the cut when the last kept line is deleted", () => {
      const now = lines.filter((_, index) => index !== 998);
      const shown = reported(compareWith(lines.join("\n"), now.join("\n")).entries[0].content);
      expect(shown).toEqual({ added: [], removed: [lines[998]], hidden: false });
    });

    it.each(["legacy", "legacyTrimmed"] as const)(
      "shows what the last kept line of a row kept by the old code was, not its replacement (%s)",
      (state) => {
        const now = [...lines];
        now[998] = NEW;
        const shown = reported(
          compareWith(lines.join("\n"), now.join("\n"), state).entries[0].content,
        );
        expect(shown).toEqual({ added: [], removed: [lines[998]], hidden: false });
      },
    );
  });

  // A nearest neighbour: a clause the cut falls in, deleted with the part of it that the limits
  // left out, lets the next old line fit behind the kept lines. It is old text, and is not shown.
  it("does not show the old line after a deleted clause that the cut falls in", () => {
    const head = Array.from({ length: 300 }, (_, index) =>
      `Clause ${index} of the terms `.padEnd(299, "t"),
    );
    const used = head.reduce((sum, line) => sum + line.length + 1, 0);
    // A clause whose first two parts fit and whose third does not.
    const words = Array.from({ length: 400 }, (_, index) => `c${index}w`).join(" ");
    const cutClause = `The clause the cut falls in ${words}`;
    const room = MAX_SNAPSHOT_CHARS - used;
    const filler = Array.from({ length: Math.floor((room - 1_300) / 100) }, (_, index) =>
      `Filler ${index} `.padEnd(99, "f"),
    );
    const OLD = "An old short line.";
    const oldPage = [...head, ...filler, cutClause, OLD, "Another old line of the terms."];
    const kept = linesOf(oldPage.join("\n"));
    expect(kept[kept.length - 1].startsWith(CONTINUED_MARK)).toBe(true);
    expect(kept.join("\n")).not.toContain(OLD);
    const now = oldPage.filter((line) => line !== cutClause);
    const result = compareWith(oldPage.join("\n"), now.join("\n"));
    expect(reported(result.entries[0].content).added).toEqual([]);
  });

  // A line that the kept body and the page repeat cannot stand for the kept line it reads as: a
  // section deleted at the end of the kept window, whose last line repeats past the cut.
  it("does not show the old section past the cut when the last kept section is deleted", () => {
    const lines = ["Our terms"];
    for (let section = 0; lines.length < 4_200; section += 1) {
      lines.push(
        `Section ${section}`,
        `The text of section ${section} of the terms.`,
        "Back to top",
      );
    }
    const kept = linesOf(lines.join("\n"));
    expect(kept[kept.length - 1]).toBe("Back to top");
    const now = lines.filter((_, index) => index < kept.length - 3 || index >= kept.length);
    const result = compareWith(lines.join("\n"), now.join("\n"));
    expect(reported(result.entries[0].content).added).toEqual([]);
  });

  // Not told apart either: the kept line before a repeated last kept line replaced, and the last
  // two kept lines deleted with old lines past the cut, the new line and a copy of the repeated
  // one, coming after them. The new line is not shown.
  it("cannot tell the line before a repeated last kept line replaced from the last two deleted", () => {
    const lines = ["Our terms"];
    for (let section = 0; lines.length < 4_200; section += 1) {
      lines.push(
        `Section ${section}`,
        `The text of section ${section} of the terms.`,
        "Back to top",
      );
    }
    const k = linesOf(lines.join("\n")).length;
    const NEW = "The provider may use customer content to train its models.";
    const replaced = [...lines];
    replaced[k - 2] = NEW;
    const oldWithLines = [...lines.slice(0, k), NEW, "Back to top", ...lines.slice(k)];
    const deleted = oldWithLines.filter((_, index) => index !== k - 2 && index !== k - 1);
    expect(deleted).toEqual(replaced);
    expect(storedOf(oldWithLines.join("\n"), "current")).toEqual(
      storedOf(lines.join("\n"), "current"),
    );
    const result = compareWith(lines.join("\n"), replaced.join("\n"));
    expect(reported(result.entries[0]?.content ?? "").added).toEqual([]);
  });

  // Probe pol_giant.js: a page that is one paragraph of 200,000 characters.
  describe("a page of one long paragraph", () => {
    const words = Array.from({ length: 40_000 }, (_, index) => `w${index}x`);
    const oldText = `Terms of service\n${words.join(" ")}`;
    it.each([
      ["a word of the same length", "SELLSx".slice(0, words[3_000].length)],
      ["a longer word", "SELLS-customer-data"],
    ])("shows the old wording when %s changed in the kept part", (_, word) => {
      // Wave 10 (RV8P-1..4): the page is one line, so no two lines that each start a line of the
      // page make a pair: nothing is shown as added, and the kept part that changed is removed.
      const now = words.map((each, index) => (index === 3_000 ? word : each));
      const result = compareWith(oldText, `Terms of service\n${now.join(" ")}`);
      expect(result.entries).toHaveLength(1);
      const shown = reported(result.entries[0].content);
      expect(shown.added).toEqual([]);
      expect(shown.removed.join("\n")).toContain(` ${words[3_000]} `);
    });

    it("takes the unchanged page as no change", () => {
      expect(compareWith(oldText, oldText).entries).toEqual([]);
    });
  });

  // The masked deletion (advisor): a kept boilerplate line removed near the top while the page
  // has it again past the old cut must not make the old text before that copy new.
  it("does not show old text past the cut when a removed kept line comes again after it", () => {
    const head = [
      "Our terms",
      "Learn more",
      "This clause is removed by the vendor ".padEnd(400, "r"),
    ];
    const filler = Array.from(
      { length: 1_300 },
      (_, index) => `clause ${index} of the terms that stays where it was on the page all along`,
    );
    const base = [...head, ...filler];
    let room = MAX_SNAPSHOT_CHARS - (linesOf(base.join("\n")).join("\n").length + 1) - 5;
    const pads: string[] = [];
    for (let index = 0; room > 0; index += 1) {
      const length = Math.min(500, room - 1);
      pads.push(`pad${index} ${"p".repeat(600)}`.slice(0, length));
      room -= length + 1;
    }
    const OLD = "This sentence was always on the page past the old cut, old text.";
    const oldPage = [
      ...base,
      ...pads,
      `zz long unique paragraph ${"q".repeat(560)}`,
      OLD,
      "Learn more",
      "the end",
    ];
    expect(linesOf(oldPage.join("\n")).join("\n")).not.toContain(OLD);
    const now = [oldPage[0], ...oldPage.slice(3)];
    const shown = reported(compareWith(oldPage.join("\n"), now.join("\n")).entries[0].content);
    expect(shown).toEqual({ added: [], removed: [head[2]], hidden: false });
  });
});

// --- The truth (RV7P-1): pages of unique lines, edited inside the kept window, against the window
// that the edit really made of the kept lines. ---

/** The lines of one raw line of a page in a line space, as the kept lines are made. */
function rawLinesOf(raw: string, legacy: boolean): string[] {
  const squeezedLine = cleanText(raw).replace(/\s+/g, " ").trim();
  return (legacy ? refCutAsBefore : refPartsOf)(squeezedLine).filter((line) =>
    HAS_LETTER_OR_DIGIT.test(line),
  );
}

/**
 * The reference of the window end (wave 10, RV8P-1..4), written here from the rule: the start of
 * the page up to the second line of the last anchor pair. A pair is two lines of the page, one
 * right after the other, each once in the kept lines and once on the page, the second right after
 * the first in the kept lines too and not a later part of a line; the first comes later in the
 * kept lines than every line before it on the page that is once in both. 0 with no pair.
 */
function refWindowEnd(kept: readonly string[], page: readonly string[]): number {
  const countOf = (lines: readonly string[]) => {
    const counts = new Map<string, number>();
    for (const line of lines) counts.set(comparable(line), (counts.get(comparable(line)) ?? 0) + 1);
    return counts;
  };
  const [inKept, inPage] = [countOf(kept), countOf(page)];
  const placeOf = new Map<string, number>();
  kept.forEach((line, index) => placeOf.set(comparable(line), index));
  const isAnchor = (line: string) =>
    inKept.get(comparable(line)) === 1 && inPage.get(comparable(line)) === 1;
  let end = 0;
  let highest = -1;
  for (let position = 0; position < page.length; position += 1) {
    const line = page[position];
    if (!isAnchor(line)) continue;
    const place = placeOf.get(comparable(line)) ?? -1;
    const next = page[position + 1];
    if (
      place > highest &&
      next !== undefined &&
      isAnchor(next) &&
      placeOf.get(comparable(next)) === place + 1 &&
      !next.startsWith(CONTINUED_MARK)
    ) {
      end = position + 2;
    }
    highest = Math.max(highest, place);
  }
  return end;
}

const TRUTH_EDITS = [
  "none",
  "insert",
  "delete",
  "replace",
  "word",
  "appendInLastClause",
  "lastKeptLine",
  "firstPartOfCutClause",
  "deleteAcrossCut",
  "deleteTail",
  "several",
  "moveDown",
  "deleteKept",
] as const;
type TruthEdit = (typeof TRUTH_EDITS)[number];

/**
 * An edit of the raw lines of a page inside the kept window of `state`, and where the raw line of
 * the cut is after it: `shift` is what the edit adds to the index of that raw line. Null when the
 * page has no place for it. The edits of wave 10 (RV8P-1) reach past the cut, so there is no one
 * window of the edit to compare with: their `shift` is null. `moved` is the raw line that a pure
 * move put past the cut: of the three cases in which old text reads as added, the move is the only
 * one that these edits can make, since the pages here hold no line twice and no edit inserts a
 * copy of an old line (the other two are pinned under "copies past the cut of kept lines whose
 * kept copies are deleted").
 */
function truthEdited(
  lines: readonly string[],
  edit: TruthEdit,
  legacy: boolean,
  generator: ReturnType<typeof generatorOf>,
  short: boolean,
): { lines: string[]; shift: number | null; moved?: string } | null {
  const { between, clause, random } = generator;
  const end = windowEndOf(lines, legacy);
  const result = [...lines];
  const near = (low: number, high: number) =>
    Math.max(low, Math.min(high, random() < 0.6 ? end - between(1, 6) : between(low, high)));
  const fresh = () => clause(short ? between(41, 60) : between(41, 1_500));
  const changeWord = (index: number, at: (count: number) => number): boolean => {
    const words = result[index].split(" ");
    if (words.length < 4) return false;
    words[Math.max(1, Math.min(words.length - 1, at(words.length)))] =
      `changed${between(0, 1e6)}${random() < 0.5 ? "" : "-and-more-words"}`;
    result[index] = words.join(" ");
    return true;
  };
  switch (edit) {
    case "none":
      return { lines: result, shift: 0 };
    case "insert": {
      // Before two whole kept lines at least: an insertion right before the last kept unit cannot
      // be told from that unit moved down (see the witness test).
      if (end < 3) return null;
      result.splice(near(0, end - 2), 0, fresh());
      return { lines: result, shift: 1 };
    }
    case "delete":
      if (end < 2) return null;
      result.splice(near(0, end - 1), 1);
      return { lines: result, shift: -1 };
    case "replace":
      if (end < 2) return null;
      result[near(0, end - 1)] = fresh();
      return { lines: result, shift: 0 };
    case "word":
      if (end < 2) return null;
      return changeWord(near(0, end - 1), (count) => between(1, count - 1))
        ? { lines: result, shift: 0 }
        : null;
    case "appendInLastClause": {
      // Words added at the end of the last whole kept line, or inside the kept start of the line
      // the cut falls in.
      const cutClauseKept = end < lines.length && !legacy && windowHasPartOf(lines, end);
      const index = cutClauseKept ? end : end - 1;
      if (index < 0) return null;
      const words = result[index].split(" ");
      const at = cutClauseKept ? between(2, 40) : words.length;
      if (at > words.length) return null;
      words.splice(at, 0, "and", "the", "provider", `appended${between(0, 1e6)}`, "terms");
      result[index] = words.join(" ");
      return { lines: result, shift: 0 };
    }
    case "lastKeptLine":
      // The last whole kept line gets a word changed (a multi-part one may split anew).
      if (end < 1) return null;
      return changeWord(end - 1, (count) => between(1, count - 1))
        ? { lines: result, shift: 0 }
        : null;
    case "firstPartOfCutClause":
      if (legacy || end >= lines.length || !windowHasPartOf(lines, end)) return null;
      return changeWord(end, () => between(1, 3)) ? { lines: result, shift: 0 } : null;
    case "deleteAcrossCut":
      // The last kept lines and the line the limits left out, with some after it (RV8P-1).
      if (end < 2) return null;
      result.splice(end - between(1, Math.min(8, end)), between(2, 12));
      return { lines: result, shift: null };
    case "deleteTail":
      // From inside the window to the end of the page, but a few short old lines.
      if (end < 2) return null;
      result.splice(end - between(1, Math.min(30, end)), result.length - end - between(0, 4));
      return { lines: result, shift: null };
    case "several":
      // A line inserted and one deleted inside the window, and a block deleted across the cut.
      if (end < 8) return null;
      result.splice(end - between(1, 3), between(2, 6));
      result.splice(near(0, end - 6), 1);
      result.splice(near(0, end - 8), 0, fresh());
      return { lines: result, shift: null };
    case "deleteKept":
      // Every raw line of the kept window and a few past the cut, but a few lines.
      result.splice(0, Math.min(end + between(0, 3), result.length - 3));
      return { lines: result, shift: null };
    case "moveDown": {
      // The first case in which old text reads as added (see `truthEdited`): two kept lines moved
      // past the cut together. The old lines then before them may read as added (the stored row
      // and the page are those of the two lines left in place, deleted, and the old lines added
      // before them).
      if (end < 3) return null;
      const block = result.splice(end - 2, 2);
      const to = Math.min(result.length, end - 2 + between(2, 8));
      result.splice(to, 0, ...block);
      return { lines: result, shift: null, moved: block[0] };
    }
  }
}

/** The kept lines hold a part of the raw line at `index`, the line the cut falls in. */
const partKept = new WeakMap<readonly string[], boolean>();
function windowHasPartOf(lines: readonly string[], index: number): boolean {
  const known = partKept.get(lines);
  if (known !== undefined) return known;
  const kept = refLines(lines.join("\n"), false, true);
  const before = refLines(lines.slice(0, index).join("\n"), false, false).length;
  partKept.set(lines, kept.length > before);
  return kept.length > before;
}

const oldSets = new Map<string, ReadonlySet<string>>();
/** Every line of the old page, in a line space, made once per page and space. */
function oldLinesSetOf(
  lines: readonly string[],
  text: string,
  legacy: boolean,
): ReadonlySet<string> {
  const key = `${legacy}:${lines.length}:${lines[0]}:${text.length}`;
  let set = oldSets.get(key);
  if (set === undefined) {
    set = new Set(refLines(text, legacy, false).map(comparable));
    oldSets.set(key, set);
  }
  return set;
}

interface TruthOutcome {
  failures: string[];
  reached: {
    exact: number;
    nearCut: number;
    trailing: number;
    unchanged: number;
    moveFakes: number;
  };
}

function checkTruth(
  oldLines: readonly string[],
  stored: StoredSnapshot,
  state: StoredState,
  edit: TruthEdit,
  edited: { lines: string[]; shift: number | null; moved?: string },
  label: string,
  outcome: TruthOutcome,
): void {
  const legacy = state !== "current";
  const oldText = oldLines.join("\n");
  const newText = edited.lines.join("\n");
  const result = comparePages({
    pages: [pageOf(newText)],
    stored: new Map([[KEY, stored]]),
    now: NOW,
  });
  const fail = (what: string) => outcome.failures.push(`${label} ${state} ${edit}: ${what}`);
  if (edit === "none") {
    outcome.reached.unchanged += 1;
    if (result.entries.length > 0) fail("unchanged page made a change");
    return;
  }
  const kept = refLines(stored.body, legacy, true);
  const oldAll = oldLinesSetOf(oldLines, oldText, legacy);
  const newAll = refLines(newText, legacy, false);
  const newSet = new Set(newAll.map(comparable));
  const after = refLines(newText, legacy, true);
  const truthRemoved = [
    ...new Set(kept.filter((line) => !newSet.has(comparable(line))).map(comparable)),
  ];
  // I2-weak: the new lines before the end of the window of the rule are reported, and only they.
  // The window applies to a kept body that the limits cut, or may have (the old code did not say),
  // even when the page holds none of its lines; otherwise the whole page is compared.
  const mayBeCut = legacy
    ? stored.body.split("\n").length >= MAX_SNAPSHOT_LINES ||
      stored.body.length + 1 + MAX_LINE_CHARS + 1 > MAX_SNAPSHOT_CHARS
    : stored.hash === hashOf(kept, true);
  const windowEnd = mayBeCut ? refWindowEnd(kept, newAll) : newAll.length;
  const inWindow = new Set(after.slice(0, windowEnd).map(comparable));
  const mustAdd = [
    ...new Set(
      after
        .slice(0, windowEnd)
        .filter((line) => !oldAll.has(comparable(line)) && !isStamp(line))
        .map(comparable),
    ),
  ];

  const shown =
    result.entries.length === 0
      ? { added: [] as string[], removed: [] as string[], hidden: false }
      : reported(result.entries[0].content);
  const added = new Set(shown.added.map(comparable));
  for (const line of added) {
    if (!newSet.has(line)) fail(`Added not on the page: ${line.slice(0, 100)}`);
    if (!inWindow.has(line)) fail(`Added out of the window: ${line.slice(0, 100)}`);
    // I3-strict: no line of the whole old page is reported as added, but after a pure move.
    if (oldAll.has(line)) {
      if (edited.moved === undefined) fail(`fake Added (old text): ${line.slice(0, 100)}`);
      else {
        // The move case, exactly: old text past the cut that the move put before the moved lines.
        const at = newAll.findIndex((each) => comparable(each) === line);
        const movedAt = newAll.findIndex((each) => each === rawLinesOf(edited.moved!, legacy)[0]);
        const keptAll = new Set(kept.map(comparable));
        if (keptAll.has(line) || at < 0 || at > movedAt) fail(`fake Added past the move: ${line}`);
        outcome.reached.moveFakes += 1;
      }
    }
  }
  if (edited.shift !== null) {
    // The truth of an edit inside the window: the raw lines of the old page that the kept lines
    // hold whole, and the parts of the raw line the cut falls in, became these lines of the page.
    // A line reported as added is one of them, new.
    const end = windowEndOf(oldLines, legacy);
    const wholeOld = oldLines.slice(0, end).flatMap((line) => rawLinesOf(line, legacy)).length;
    const cutParts = kept.length - wholeOld;
    const newEnd = end + edited.shift;
    const truthWindow = [
      ...edited.lines.slice(0, newEnd).flatMap((line) => rawLinesOf(line, legacy)),
      ...(cutParts > 0 && newEnd < edited.lines.length
        ? rawLinesOf(edited.lines[newEnd], legacy).slice(0, cutParts)
        : []),
    ].slice(0, after.length);
    const truthAdded = new Set(
      truthWindow.filter((line) => !oldAll.has(comparable(line))).map(comparable),
    );
    for (const line of added) {
      if (!truthAdded.has(line)) fail(`Added out of the window or old: ${line.slice(0, 100)}`);
    }
    // The new lines of the truth window that the rule leaves out: after the last pair.
    if ([...truthAdded].some((line) => !inWindow.has(line) && !isStamp(line))) {
      outcome.reached.trailing += 1;
    }
    if (mustAdd.some((line) => truthWindow.slice(-8).map(comparable).includes(line))) {
      outcome.reached.nearCut += 1;
    }
  }
  if (shown.hidden) return;
  const expectedChars = [...mustAdd, ...truthRemoved]
    .map((line) => line.length)
    .reduce((sum, length) => sum + length, 0);
  if (result.entries.length === 0) {
    if (expectedChars >= MIN_CHANGED_CHARS) fail("missed the whole change");
    return;
  }
  for (const line of mustAdd) if (!added.has(line)) fail(`missed Added: ${line.slice(0, 100)}`);
  const removed = new Set(shown.removed.map(comparable));
  for (const line of truthRemoved)
    if (!removed.has(line)) fail(`missed Removed: ${line.slice(0, 100)}`);
  for (const line of removed) {
    if (!truthRemoved.includes(line)) fail(`Removed not gone: ${line.slice(0, 100)}`);
  }
  if (mustAdd.length > 0) outcome.reached.exact += 1;
}

describe("the window rule of comparePages, against the truth of the edit (RV7P-1)", () => {
  it("reports exactly the new lines of the kept window and the kept lines gone", () => {
    const outcome: TruthOutcome = {
      failures: [],
      reached: { exact: 0, nearCut: 0, trailing: 0, unchanged: 0, moveFakes: 0 },
    };
    const seeds = Math.max(3, SEEDS - 1);
    for (let seed = 1; seed <= seeds; seed += 1) {
      for (const short of [false, true]) {
        const generator = generatorOf(randomOf(seed * 104_729 + (short ? 1 : 0)));
        // Unique lines: no boilerplate, no repeat past the cut.
        const lines: string[] = [];
        let chars = 0;
        const target = short ? MAX_SNAPSHOT_LINES + 200 : MAX_SNAPSHOT_CHARS + 20_000;
        while ((short ? lines.length : chars) < target) {
          const roll = generator.random();
          const next = short
            ? generator.clause(generator.between(14, 30))
            : roll < 0.25
              ? generator.clause(generator.between(1_300, 3_200))
              : roll < 0.3
                ? generator.clause(generator.between(10, 30))
                : generator.clause(generator.between(60, 610));
          lines.push(next);
          chars += next.length + 1;
        }
        for (const state of ["current", "legacy", "legacyTrimmed"] as const) {
          const stored = storedOf(lines.join("\n"), state);
          for (const edit of TRUTH_EDITS) {
            for (let round = 0; round < (edit === "none" ? 1 : 3); round += 1) {
              const edited = truthEdited(lines, edit, state !== "current", generator, short);
              if (edited === null) continue;
              checkTruth(
                lines,
                stored,
                state,
                edit,
                edited,
                `seed ${seed} short ${short}`,
                outcome,
              );
            }
          }
        }
      }
    }
    expect(outcome.failures).toEqual([]);
    expect(outcome.reached.unchanged).toBe(seeds * 6);
    expect(outcome.reached.exact).toBeGreaterThanOrEqual(120);
    expect(outcome.reached.nearCut).toBeGreaterThanOrEqual(60);
    // New lines of the edit that the rule leaves out (after the last pair), and old lines shown as
    // added after a pure move (the move case), both happen in these cases.
    expect(outcome.reached.trailing).toBeGreaterThanOrEqual(1);
    expect(outcome.reached.moveFakes).toBeGreaterThanOrEqual(1);
  });

  // I4: the window costs time linear in the lines of the page, for pages of about 2 MB, and for
  // the inputs that a rule of runs and copies could make slow: every line the same, two lines in
  // turn, and kept lines each followed by a new line.
  it.each([
    ["4,000 lines of 500 characters", 4_000, (index: number) => `Line ${index} ${"t".repeat(490)}`],
    ["every line the same", 1_000_000, () => "x"],
    ["two lines in turn", 1_000_000, (index: number) => (index % 2 === 0 ? "a" : "b")],
    [
      "kept lines each followed by a new line",
      200_000,
      (index: number) => (index % 2 === 0 ? `k${index}` : `n${index}`),
    ],
  ] as const)("finds the window in linear time: %s", (_, count, lineOf) => {
    const timeOf = (pageLines: number): number => {
      const oldLines = Array.from({ length: pageLines }, (__, index) => lineOf(index));
      const stored = storedOf(oldLines.join("\n"), "current");
      // A kept line changed near the top, so that the page is compared.
      oldLines[1] = "A line changed near the top of the page, long enough to be a change.";
      const page = oldLines.join("\n");
      let best = Infinity;
      for (let run = 0; run < 3; run += 1) {
        const start = process.hrtime.bigint();
        const result = comparePages({
          pages: [pageOf(page)],
          stored: new Map([[KEY, stored]]),
          now: NOW,
        });
        best = Math.min(best, Number(process.hrtime.bigint() - start) / 1e6);
        expect(result.counts.unchanged).toBe(0);
      }
      return best;
    };
    const small = timeOf(count / 4);
    const large = timeOf(count);
    expect(large).toBeLessThan(Math.max(8 * small, 100));
  });
});

// --- RV8P-1..4: the probes of the review of wave 9. Old text past the cut is never shown as added,
// whatever the edit: a block deleted across the cut, table rows deleted near the top, sections
// deleted in the middle, a line past the cut that begins with the continued mark. ---

describe("old text past the cut is never shown as added (RV8P-1..4)", () => {
  const STATES = ["current", "legacy", "legacyTrimmed"] as const;
  /** The lines reported as added, and those of them that the old page held anywhere. */
  function addedOf(oldLines: readonly string[], newLines: readonly string[], state: StoredState) {
    const oldText = oldLines.join("\n");
    const result = comparePages({
      pages: [pageOf(newLines.join("\n"))],
      stored: new Map([[KEY, storedOf(oldText, state)]]),
      now: NOW,
    });
    const shown =
      result.entries.length === 0
        ? { added: [] as string[], removed: [] as string[], hidden: false }
        : reported(result.entries[0].content);
    const old = new Set(refLines(oldText, state !== "current", false).map(comparable));
    return { ...shown, fake: shown.added.filter((line) => old.has(comparable(line))) };
  }

  // Probe p_min.js: the fixture of "a page cut by the limit of characters, where a short line would
  // still have fitted" above. 999 lines of 99 characters, the line that
  // did not fit (L*, 590), then short old lines.
  describe("a block deleted across the cut of the limit of characters (RV8P-1, p_min.js)", () => {
    const lines = [
      ...Array.from({ length: 999 }, (_, index) => `Clause ${index} of the terms `.padEnd(99, "t")),
      `The clause past the cut ${"o".repeat(566)}`,
      ...Array.from({ length: 50 }, (_, index) => `Later clause ${index} of the terms`),
    ];
    it.each(
      STATES.flatMap((state) => [
        [state, "the last kept line and the line past the cut", [998, 999]],
        [
          state,
          "the last ten kept lines and the line past the cut",
          Array.from({ length: 10 }, (_, i) => 990 + i),
        ],
        [state, "the last kept line", [998]],
        // The whole kept body and the line past the cut: the page holds no kept line, and is not
        // new as a whole for that (wave 10, the advisor's probe).
        [
          state,
          "every kept line and the line past the cut",
          Array.from({ length: 1_000 }, (_, i) => i),
        ],
      ]),
    )("shows nothing old as added (%s, %s)", (state, _, drop) => {
      const now = lines.filter((__, index) => !(drop as number[]).includes(index));
      const shown = addedOf(lines, now, state as StoredState);
      expect(shown.fake).toEqual([]);
      expect(shown.added).toEqual([]);
      // Every kept line gone is shown, but those that do not fit in the text of the change, which
      // it counts.
      const gone = (drop as number[]).filter((index) => index < 999).map((index) => lines[index]);
      expect(shown.removed).toEqual(gone.slice(0, shown.removed.length));
      expect(shown.hidden).toBe(shown.removed.length < gone.length);
    });
  });

  // Probe p_span.js: unique clauses of 150 characters up to the cut, a long L*, short old lines.
  it.each(STATES)(
    "shows nothing old as added when the last kept clauses and the line past the cut go (RV8P-1, p_span.js, %s)",
    (state) => {
      const clause = (index: number) =>
        `Clause ${index}. The provider handles customer records under section ${index} with care, keeping logs for audits and reviews by the customer team ${index}.`.padEnd(
          150,
          " x",
        );
      const lines = Array.from({ length: 640 }, (_, index) => clause(index));
      for (let index = 640; linesOf(lines.join("\n")).length === lines.length; index += 1) {
        lines.push(clause(index));
      }
      const base = lines.slice(0, linesOf(lines.join("\n")).length);
      const lStar = `Section 99. The provider keeps the right to ${"share aggregated statistics with partners ".repeat(11)}`;
      const tail = [
        "Section 100. Sale of personal data to brokers is permitted.",
        "Section 101. Customer content may train our models.",
        "Section 102. Liability is unlimited for the customer.",
        "Contact us at legal for questions about these terms.",
      ];
      const shown = addedOf([...base, lStar, ...tail], [...base.slice(0, -3), ...tail], state);
      expect(shown.fake).toEqual([]);
      expect(shown.removed.length).toBeGreaterThan(0);
    },
  );

  // Probe p_span3.js: sections of a heading and two clauses, then a footer; the vendor removes the
  // last sections, from above the cut to the end of the sections.
  it.each(STATES.flatMap((state) => [1, 5, 50].map((count) => [state, count] as const)))(
    "shows no footer line as added when the sections from above the cut go (RV8P-1, p_span3.js, %s, %d)",
    (state, count) => {
      const clause = (id: string, length: number) =>
        `${id}.1 The provider processes customer personal data for item ${id} only on documented instructions and keeps records.`
          .padEnd(length, " and more")
          .slice(0, length);
      const sections = Array.from({ length: 400 }, (_, s) => [
        `Section ${s}. Topic ${s}`,
        clause(`${s}a`, 180 + (s % 7) * 40),
        clause(`${s}b`, 260 + (s % 5) * 50),
      ]).flat();
      const footer = [
        "Contact our privacy team",
        "Do not sell or share my personal information",
        "Cookie settings",
        "Your privacy choices",
        "Accessibility statement",
        "Sitemap",
      ];
      const old = [...sections, ...footer];
      const kept = storedOf(old.join("\n"), state).body.split("\n").length;
      const shown = addedOf(old, [...sections.slice(0, kept - count), ...footer], state);
      expect(shown.fake).toEqual([]);
    },
  );

  // Probe p_subp.js: a list of subprocessors, a cell to a line, cut by the limit of characters. The
  // vendor removes the rows of two subprocessors near the top; nothing at the cut changes.
  it.each(STATES)(
    "shows no subprocessor past the cut as added when rows near the top go (RV8P-3, p_subp.js, %s)",
    (state) => {
      const countries = ["United States", "Ireland", "Germany", "India", "Japan"];
      const purposes = [
        "Cloud hosting",
        "Customer support",
        "Email delivery",
        "Analytics",
        "Payment processing",
      ];
      const listOf = (pad: number) => {
        const out = [`Subprocessors ${"s".repeat(pad)}`, "Name", "Purpose", "Location"];
        for (let index = 0; index < 1_100; index += 1) {
          out.push(`Vendor${index} Inc.`, purposes[index % 5], countries[(index * 3) % 5]);
          if (index % 9 === 0) {
            out.push(
              `Vendor${index} Inc. processes ${"personal data of the customer and its end users, ".repeat(12)}`.slice(
                0,
                590,
              ),
            );
          }
        }
        return out;
      };
      let checked = 0;
      for (let pad = 0; pad < 600 && checked < 3; pad += 11) {
        const old = listOf(pad);
        const kept = linesOf(old.join("\n"));
        const room = MAX_SNAPSHOT_CHARS - kept.reduce((sum, line) => sum + line.length + 1, 0) - 1;
        if (kept.length >= old.length || old[kept.length].length < 500 || room < 60) continue;
        const [from, to] = [old.indexOf("Vendor20 Inc."), old.indexOf("Vendor22 Inc.")];
        const now = old.filter((_, index) => index < from || index >= to);
        const shown = addedOf(old, now, state);
        expect(shown.fake).toEqual([]);
        checked += 1;
      }
      expect(checked).toBe(3);
    },
  );

  // Probe p_mid2.js: sections of a heading, a clause and "Back to top", a long clause every sixth;
  // the vendor deletes six sections far from the cut.
  it.each(STATES)(
    "shows no old section as added when sections in the middle go (RV8P-4, p_mid2.js, %s)",
    (state) => {
      const clause = (id: string | number, length: number) =>
        `${id}. The provider processes customer data for purpose ${id} and keeps the records`
          .padEnd(length, " of it")
          .slice(0, length);
      let checked = 0;
      for (let pad = 10; pad < 600 && checked === 0; pad += 37) {
        const old = [`Intro ${"i".repeat(pad)}`];
        for (let s = 0; s < 2_000; s += 1) {
          old.push(`Section ${s}`, clause(s, 80), "Back to top");
          if (s % 6 === 5) old.push(clause(`${s}L`, 590));
        }
        const kept = linesOf(old.join("\n"));
        const room = MAX_SNAPSHOT_CHARS - kept.reduce((sum, line) => sum + line.length + 1, 0) - 1;
        if (old[kept.length].length < 500 || room < 150) continue;
        const [from, to] = [old.indexOf("Section 30"), old.indexOf("Section 36")];
        const shown = addedOf(
          old,
          old.filter((_, index) => index < from || index >= to),
          state,
        );
        expect(shown.fake).toEqual([]);
        expect(shown.added).toEqual([]);
        checked += 1;
      }
      expect(checked).toBe(1);
    },
  );

  // The rule, and the two cases of old text read as added that need lines held twice, on a page cut
  // by the limit of lines: the window ends at the last two lines that the kept body and the page
  // each hold once, next to each other in both.
  describe("copies past the cut of kept lines whose kept copies are deleted", () => {
    // 4,100 short lines: the limit of lines keeps 4,000.
    const lines = Array.from({ length: 4_100 }, (_, index) => `Clause ${index} terms.`);
    const compare = (oldLines: readonly string[], newLines: readonly string[]) =>
      addedOf(oldLines, newLines, "current");
    const withCopies = (indexes: number[]) => [
      ...lines.slice(0, 4_050),
      ...indexes.map((index) => lines[index]),
      ...lines.slice(4_050),
    ];
    const without = (old: readonly string[], indexes: number[]) =>
      old.filter((_, index) => !indexes.includes(index));

    it("is a page cut by the limit of lines", () => {
      expect(linesOf(lines.join("\n"))).toEqual(lines.slice(0, 4_000));
    });

    // One line that the kept body and the page hold once is not enough to end the window: the
    // last kept line deleted, with a copy past the cut, shows nothing old.
    it("shows nothing old as added for one kept line with a copy past the cut", () => {
      // The three kept lines before it go too, so that four old lines past the cut would fit.
      const old = withCopies([3_999]);
      expect(compare(old, without(old, [3_996, 3_997, 3_998, 3_999])).added).toEqual([]);
    });

    // Two such lines next to each other, whose copies past the cut come earlier in the kept body
    // than lines before them on the page: out of order, so not the end of the window.
    // The two old lines past the cut that the deletion brings into the kept lines are long enough
    // to make a change, so that a window past them would show them (RV10PC-2: with the short
    // lines of the fixture, they made less than MIN_CHANGED_CHARS, and the test could not fail).
    it("shows nothing old as added for two kept lines whose copies are out of order", () => {
      const old = withCopies([10, 11]);
      old[4_000] = "Clause 4000. The provider keeps customer records.";
      old[4_001] = "Clause 4001. The provider deletes customer records.";
      expect(linesOf(old.join("\n"))).toEqual(old.slice(0, 4_000));
      const now = without(old, [10, 11]);
      expect(linesOf(now.join("\n"))).toContain(old[4_001]);
      expect(compare(old, now)).toEqual({ added: [], removed: [], hidden: false, fake: [] });
    });

    // Not told apart, by the stored row and the page: the old page held the last kept lines again
    // past the cut and the vendor deleted the kept ones, or the vendor moved those lines down. The
    // stored rows and the pages are the same, so is what is shown: the old lines before them read
    // as added. This is the second of the three cases in which old text reads as added; the first
    // is a move (this one read the other way), the third an inserted copy of a line past the cut
    // (below).
    it("cannot tell kept lines deleted, with copies past the cut, from the lines moved down", () => {
      const block = [3_996, 3_997, 3_998, 3_999];
      const copied = withCopies(block);
      const deleted = without(copied, block);
      const moved = [...lines];
      // Taken out first, so the place after them is four lines nearer.
      moved.splice(4_046, 0, ...moved.splice(3_996, 4));
      expect(moved).toEqual(deleted);
      expect(storedOf(copied.join("\n"), "current")).toEqual(storedOf(lines.join("\n"), "current"));
      const shown = compare(lines, moved);
      expect(shown.added).toEqual(lines.slice(4_000, 4_004));
      expect(compare(copied, deleted)).toEqual(shown);
    });

    // The third case: a line inserted before the last anchor pair is the edit's own, but when its
    // text also stood past the cut on the old page, that old text reads as added. The kept lines
    // do not know what stood past the cut, so it cannot be told from new text.
    it("shows as added a copy of a line past the cut that is inserted before the last pair", () => {
      const old = [...lines];
      old[4_050] = "Clause 4050. The provider may share customer content with its partners.";
      const now = [...old];
      now.splice(100, 0, old[4_050]);
      for (const state of STATES) {
        expect({ state, shown: addedOf(old, now, state) }).toEqual({
          state,
          shown: { added: [old[4_050]], removed: [], hidden: false, fake: [old[4_050]] },
        });
      }
    });

    // The nearest neighbour: the same line, new to the page, is new text, and reads as added.
    it("shows as added a new line inserted before the last pair", () => {
      const NEW = "Clause 4050. The provider may share customer content with its partners.";
      const now = [...lines];
      now.splice(100, 0, NEW);
      expect(addedOf(lines, now, "current")).toEqual({
        added: [NEW],
        removed: [],
        hidden: false,
        fake: [],
      });
    });
  });

  // Probe p_ell2.js: the line past the cut begins with the continued mark; the last kept line is
  // deleted.
  it.each(STATES)(
    "shows no line past the cut that begins with the continued mark as added (RV8P-2, p_ell2.js, %s)",
    (state) => {
      const lines = [
        ...Array.from({ length: 996 }, (_, index) =>
          `Clause ${index} of the terms `.padEnd(99, "t"),
        ),
        `The last kept clause of the terms ${"k".repeat(255)}`,
        `${CONTINUED_MARK}continued from the previous page: the provider may share customer content with its partners ${"o".repeat(250)}`,
        ...Array.from({ length: 5 }, (_, index) => `Later clause ${index} of the terms`),
      ];
      const shown = addedOf(
        lines,
        lines.filter((_, index) => index !== 996),
        state,
      );
      expect(shown.fake).toEqual([]);
      expect(shown.added).toEqual([]);
    },
  );
});
