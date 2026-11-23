/**
 * Deterministic guard on the OSFI E-23 report's AI prose (spec §3, G1).
 *
 * The prompts already forbid compliance claims and ask for grounded figures,
 * but a real end-to-end run still wrote "exceptional compliance", "17
 * requirement groups" (there are 16), "46 percent" (37.5) and dated a position
 * by the period's end. So after parsing, on an E-23 run only, runAnalyzers
 * checks the prose fields of the formal analyzers (and of recommendedActions,
 * which prints in the fix-it file) against the exact prompt the analyzer was
 * given, without asking the model anything. A violation buys one re-issue
 * with feedback; what still fails is dropped (one finding, one action, one
 * principle) or, for a required prose field, the analyzer abstains.
 *
 * Every rule is listed here, in one place, and each is deliberately narrow:
 * a false positive costs a re-issue and possibly the analysis.
 */
import type { ReportData } from "../../../domain.layer/interfaces/i.reportGeneration";
import { utcDay } from "../dateUtils";
import { e23GroupCounts, e23RequirementTotal } from "./e23Gap";
import type { AnalysisSectionKey } from "./registry";

export type GuardReason =
  | "compliance"
  | "misreading"
  | "number"
  | "percentage"
  | "pair"
  | "groupCount"
  | "date"
  | "asAt"
  | "period"
  | "identifier";

/** One rule broken by one sentence. */
export interface ProseViolation {
  reason: GuardReason;
  sentence: string;
  /** What exactly is wrong, for the feedback and the audit record. */
  detail: string;
}

/** A violation located in the payload: `index` is set for a row of a list. */
export interface GuardViolation extends ProseViolation {
  field: string;
  index?: number;
  /** The row's prose field, for a violation in a list row. */
  prop?: string;
}

/** What the guard rejected, as recorded in audit_metadata.guard_rejections. */
export interface GuardRejection extends GuardViolation {
  /** "retried": found in the first answer, fed back in the re-issue.
   *  "removed": still present after it, so the row or the analysis was dropped. */
  stage: "retried" | "removed";
}

// ---------------------------------------------------------------------------
// (a) Compliance and regulator-view claims
// ---------------------------------------------------------------------------

/**
 * Claims the report must never make (spec §3: a self-assessment, never a
 * compliance opinion or OSFI's view). A `negatable` pattern is allowed when a
 * negation governs it: a "not", "no", "never", "nor", "without", "cannot",
 * "nothing", "none" or "n't" earlier in the same clause ("This report does not state that any
 * requirement is fulfilled"). A clause ends at ; : or a dash, and at a comma
 * followed by a connective (and, but, so, while, which, therefore ...), so
 * "No rule fired, so the institution complies" is still caught, while "it says
 * nothing about how OSFI would view the institution" is not.
 */
export const COMPLIANCE_CLAIM_PATTERNS: Array<{
  pattern: RegExp;
  label: string;
  negatable?: boolean;
}> = [
  { pattern: /\b(?:non-?)?complian(?:ce|t)\b/i, label: "compliance", negatable: true },
  { pattern: /\bcompl(?:y|ies|ied|ying)\s+with\b/i, label: "complies with", negatable: true },
  { pattern: /\bfulfil{1,2}(?:s|ed|ing|ment)?\b/i, label: "fulfilment", negatable: true },
  {
    pattern: /\bsatisf(?:y|ies|ied|ying)\s+(?:the|all|every|E-23|OSFI)\b/i,
    label: "satisfies the guideline",
    negatable: true,
  },
  {
    pattern:
      /\b(?:meets?|met|meeting)\s+(?:all\s+|the\s+)?(?:OSFI|E-23|regulatory|supervisory)(?:'s)?\s+(?:[\w-]+\s+){0,3}(?:expectations|requirements)\b/i,
    label: "meets the expectations",
    negatable: true,
  },
  {
    pattern:
      /\b(?:aligned|alignment|aligns?|conform(?:s|ity|ance)?)\s+(?:with|to)\s+(?:all\s+|the\s+)?(?:OSFI|E-23|the guideline|regulatory expectations)/i,
    label: "aligned with OSFI or E-23",
    negatable: true,
  },
  {
    pattern: /\bOSFI(?:'s)?\s+(?:expects|considers|would|will|views?|deems|regards|requires)\b/i,
    label: "OSFI's view",
    negatable: true,
  },
  {
    pattern: /\bin line with\s+(?:OSFI|E-23|the guideline)\b/i,
    label: "in line with OSFI",
    negatable: true,
  },
  { pattern: /\bcertif(?:y|ies|ied|ication)\b/i, label: "certification", negatable: true },
];

/**
 * Readings a real run got wrong that a pattern can catch: the report lists
 * every rule, and self-assessment-only groups are outside the rules by design,
 * never an institution's gap.
 */
const MISREADING_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  {
    pattern:
      /\brules?\b[^.]{0,60}\b(?:not disclosed|undisclosed|not (?:published|documented|listed|provided))/i,
    label: "the report lists every rule it applies",
  },
  {
    pattern:
      /\bself-assessment[- ]only\b[^.]*\b(?:gaps?|weakness(?:es)?|shortfalls?|deficienc(?:y|ies)|should (?:be )?clos\w*|remediat\w*)\b/i,
    label: "self-assessment-only groups are outside the rules by design, not a gap",
  },
];

const CLAUSE_BOUNDARY =
  /[;:—–]|,\s+(?:and|but|so|while|whereas|although|though|yet|which|therefore|hence|thus)\b/gi;
const NEGATION = /\b(?:not|no|never|neither|nor|without|cannot|nothing|none)\b|n't\b/i;

/** True when a negation earlier in the same clause governs the match at `at`. */
function negated(sentence: string, at: number): boolean {
  let start = 0;
  for (const b of sentence.slice(0, at).matchAll(CLAUSE_BOUNDARY)) {
    start = b.index! + b[0].length;
  }
  return NEGATION.test(sentence.slice(start, at));
}

function complianceClaim(sentence: string): string | null {
  for (const { pattern, label, negatable } of COMPLIANCE_CLAIM_PATTERNS) {
    const m = pattern.exec(sentence);
    if (!m) continue;
    if (negatable && negated(sentence, m.index)) continue;
    return `${label} ("${m[0]}")`;
  }
  return null;
}

function misreading(sentence: string): string | null {
  for (const { pattern, label } of MISREADING_PATTERNS) {
    const m = pattern.exec(sentence);
    if (!m) continue;
    // "... are not a gap" states the rule, it does not break it.
    if (/\b(?:not|never|no)\s+(?:a\s+)?(?:gap|weakness|shortfall)/i.test(m[0])) continue;
    return label;
  }
  return null;
}

/**
 * An internal field name in prose ("validatedNothingOpen", "rulesFired=0"). A
 * live run printed these in the formal report; the facts now carry words, and
 * this catches any that still get through.
 */
const IDENTIFIER = /\b[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*\b|\b[a-z]\w*=\d/;

// ---------------------------------------------------------------------------
// (b) Figures and dates
// ---------------------------------------------------------------------------

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const MONTH = MONTHS.join("|");
const pad = (n: number | string) => String(n).padStart(2, "0");
const iso = (y: string, m: number, d: string) => `${y}-${pad(m)}-${pad(d)}`;
const DAY_MS = 24 * 60 * 60 * 1000;
const dayNumber = (isoDay: string): number => Date.parse(`${isoDay}T00:00:00Z`) / DAY_MS;

/** Every date in a text as ISO, and the text with the dates blanked out. */
function takeDates(text: string): { dates: Array<{ iso: string; at: number }>; rest: string } {
  const dates: Array<{ iso: string; at: number }> = [];
  const patterns: Array<[RegExp, (m: RegExpExecArray) => string]> = [
    [/\b(\d{4})-(\d{2})-(\d{2})(?:T[\d:.]+Z?)?\b/g, (m) => `${m[1]}-${m[2]}-${m[3]}`],
    [
      new RegExp(`\\b(${MONTH})\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, "gi"),
      (m) => iso(m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, m[2]),
    ],
    [
      new RegExp(`\\b(\\d{1,2})\\s+(${MONTH}),?\\s+(\\d{4})\\b`, "gi"),
      (m) => iso(m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, m[1]),
    ],
  ];
  let rest = text;
  for (const [re, toIso] of patterns) {
    rest = rest.replace(re, (...args) => {
      const m = args.slice(0, -2) as unknown as RegExpExecArray;
      dates.push({ iso: toIso(m), at: args[args.length - 2] as number });
      return " ".repeat(m[0].length);
    });
  }
  return { dates, rest };
}

/** "1,234" -> "1234", "37.50" -> "37.5"; dotted identifiers ("2.1.4") as written. */
const normNumber = (raw: string): string => {
  const s = raw.replace(/,(?=\d{3}\b)/g, "");
  return /^\d+(\.\d+)?$/.test(s) ? String(Number(s)) : s;
};

/** Numbers in input text: everything that looks like one, so grounding errs lenient. */
const INPUT_NUMBER = /\d[\d,]*(?:\.\d+)*/g;

/**
 * Numbers in prose. Skips digits attached to a word ("C10", "E-23", "tier1",
 * "D.2"), ordinals ("1st") and a list marker ("(2)"). Captures a percent sign
 * or word.
 */
const PROSE_NUMBER =
  /(?<![A-Za-z0-9_.]|[A-Za-z]-)(\d{1,3}(?:,\d{3})+|\d+)((?:\.\d+)*)(?!\d|st\b|nd\b|rd\b|th\b|\))(\s*(?:%|percent\b|per cent\b))?/g;

/** "X of Y", "X of the Y", "X out of Y", "X/Y". */
const PAIR =
  /(?<![A-Za-z0-9_.]|[A-Za-z]-)(\d+)\s*(?:of\s+(?:the\s+)?|out\s+of\s+|\/\s*)(\d+)(?![\d.])/gi;

/** A count of groups: "16 requirement groups", "17 framework components". */
const GROUP_COUNT =
  /(?<![A-Za-z0-9_.]|[A-Za-z]-)(\d+)\s+(?:E-23\s+)?(?:requirement\s+)?(?:groups|framework\s+components)\b/gi;

/** "as of <date>" / "as at <date>": a position date. */
const AS_AT = /\bas\s+(?:of|at)\s*$/i;

/**
 * Period figures (activity counts) and the monitoring window they do not
 * belong to. A sentence that names both is fine when it also ties the figure
 * to the period, by the word ("... in the last 90 days, and 0 breaches in the
 * period") or by the period's own start or end date ("... between 2026-07-01
 * and 2026-09-30"); only one that puts a period figure in the window with no
 * period in sight is an error. Any other date does not name the period.
 */
const ACTIVITY =
  /\bsign-?offs?\b|\bsigned off\b|\bfindings? (?:opened|closed)\b|\bbreach|\brevalidation events?\b/i;
const MONITORING_WINDOW = /\bmonitoring window\b|\blast \d+ days\b|\b\d+-day\b/i;
const PERIOD = /\bperiod\b/i;

/**
 * What a figure counts, read off the words after it ("13 models", "4 of the
 * 13 validations", "the other 9 validated models"). Used only to keep a
 * percentage to a ratio of like with like: 6 groups over 13 models is no
 * percentage of anything. The report totals carry their kind too.
 */
const KIND_WORDS: Array<[RegExp, string]> = [
  [/^models?$/, "models"],
  [/^(?:groups?|principles?)$/, "groups"],
  [/^requirements?$/, "requirements"],
  [/^rules?$/, "rules"],
  [/^findings?$/, "findings"],
  [/^(?:validations?|sign-?offs?|signoffs?)$/, "validations"],
  [/^days?$/, "days"],
  [/^breach(?:es)?$/, "breaches"],
  [/^events?$/, "events"],
  [/^items?$/, "items"],
];
const SKIP_WORDS = new Set(["of", "the", "out", "a", "an", "all", "other"]);

function kindAfter(text: string, from: number): string | null {
  const tail = text.slice(from, from + 80).split(/[.,;:()%]/)[0];
  const words = tail
    .split(/[\s-]+/)
    .map((w) => w.toLowerCase().replace(/[^a-z0-9-]/g, ""))
    .filter(Boolean);
  // Two words at most: "13 models", "the other 9 validated models". Further
  // on, a verb phrase ("2 have not started validation") would set the kind.
  let looked = 0;
  for (let i = 0; i < words.length && looked < 2; i += 1) {
    const w = words[i];
    if (SKIP_WORDS.has(w) || /^\d+$/.test(w)) continue;
    looked += 1;
    // "16 requirement groups" counts groups, not requirements.
    if (/^requirements?$/.test(w) && /^groups?$/.test(words[i + 1] ?? "")) return "groups";
    const hit = KIND_WORDS.find(([re]) => re.test(w));
    if (hit) return hit[1];
  }
  return null;
}

/** A figure an item cites, and whether the input holds it as written. */
interface Figure {
  value: number;
  kind: string | null;
  grounded: boolean;
}

/** What the guard checks prose against: the analyzer's own prompt, read once. */
export interface GuardContext {
  numbers: Set<string>;
  /** The numbers on each input line, for "X of Y". */
  lines: Array<Set<string>>;
  dates: Set<string>;
  /** Percentages the input states as percentages ("5%", "37.5 percent"). */
  percents: Set<string>;
  /** Day counts between any two input dates ("54 days"). */
  dayGaps: Set<number>;
  /** The report's position date (the cover's UTC day). */
  asAt: string | null;
  /** Group counts the input states: the totals, and every "N groups" it prints. */
  groupCounts: Set<number>;
  /**
   * The report's totals, each with its kind (requirements, models in scope,
   * groups): a percentage may be a cited figure over one of them.
   */
  totals: Array<{ value: number; kind: string }>;
  /** The reporting period's start and end dates (ISO), when set. */
  periodDates: Set<string>;
}

export function guardContext(input: string, rd: ReportData): GuardContext {
  const { dates, rest } = takeDates(input);
  const numbersOf = (text: string) => new Set((text.match(INPUT_NUMBER) ?? []).map(normNumber));
  const groups = e23GroupCounts(rd);
  const days = [...new Set(dates.map((d) => d.iso))].map(dayNumber);
  const dayGaps = new Set<number>();
  days.forEach((a) => days.forEach((b) => a > b && dayGaps.add(Math.round(a - b))));
  const stated = [...rest.matchAll(/(\d+)\s+groups?\b/g)].map((m) => Number(m[1]));
  const params = rd.metadata?.reportParameters;
  const totals = [
    { value: e23RequirementTotal(rd), kind: "requirements" },
    { value: Number(rd.sections?.mrmFleet?.totals?.models) || 0, kind: "models" },
    { value: groups.total, kind: "groups" },
  ].filter((t) => t.value > 0);
  return {
    numbers: numbersOf(rest),
    percents: new Set(
      [...rest.matchAll(/(\d+(?:\.\d+)?)\s*(?:%|percent\b|per cent\b)/g)].map((m) =>
        normNumber(m[1]),
      ),
    ),
    lines: rest.split("\n").map(numbersOf),
    dates: new Set(dates.map((d) => d.iso)),
    dayGaps,
    asAt: utcDay(rd.metadata?.generatedAt) ?? null,
    groupCounts: new Set([groups.total, groups.checked, groups.selfAssessmentOnly, ...stated]),
    totals,
    periodDates: new Set(
      [params?.periodStart, params?.periodEnd].filter((d): d is string => Boolean(d)),
    ),
  };
}

/** Sentences, keeping decimals ("37.5") and identifiers ("2.1.4") whole. */
export const sentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Paragraphs of a prose field. */
const paragraphs = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

/** The plain figures (not percentages, not dates) an item cites. */
function figuresOf(texts: string[], ctx: GuardContext): Figure[] {
  return texts.flatMap((text) => {
    const { rest } = takeDates(text);
    return [...rest.matchAll(PROSE_NUMBER)]
      .filter((m) => !m[3])
      .map((m) => {
        const raw = normNumber(`${m[1]}${m[2]}`);
        return {
          value: Number(raw),
          kind: kindAfter(rest, m.index! + m[0].length),
          grounded: ctx.numbers.has(raw),
        };
      });
  });
}

const sameKind = (a: Figure, b: Figure): boolean => !a.kind || !b.kind || a.kind === b.kind;

/**
 * A figure the input does not hold may still be read off it in one step from
 * two grounded figures the same item cites: a difference ("13 models, 4
 * signed off in the period, so the other 9"), a sum, or, for a figure written
 * with a decimal point, a quotient at the written precision ("3 findings
 * across 5 models, or 0.6 per model"; 1/3 as "0.33"). Operands come from the
 * item, never from the whole input, or almost any number would pass.
 */
function derivable(raw: string, written: string, item: Figure[]): boolean {
  const n = Number(raw);
  // Places as written ("0.60" has two), so the quotient rounds as the prose did.
  const places = /^\.\d+$/.test(written) ? written.length - 1 : null;
  const scale = 10 ** (places ?? 0);
  const g = item.filter((f) => f.grounded);
  return g.some((a, i) =>
    g.some(
      (b, j) =>
        i !== j &&
        (a.value - b.value === n ||
          (i < j && a.value + b.value === n) ||
          (places !== null &&
            b.value > 0 &&
            Math.round((a.value / b.value) * scale) === Math.round(n * scale))),
    ),
  );
}

/**
 * Every rule one sentence breaks; [] when it is clean. `item` is every figure
 * the sentence's paragraph or finding cites; it defaults to the sentence's own.
 */
export function checkSentence(
  sentence: string,
  ctx: GuardContext,
  item: Figure[] = figuresOf([sentence], ctx),
): ProseViolation[] {
  const out: ProseViolation[] = [];
  const add = (reason: GuardReason, detail: string) => out.push({ reason, sentence, detail });

  const claim = complianceClaim(sentence);
  if (claim) add("compliance", `states or implies ${claim}`);
  const misread = misreading(sentence);
  if (misread) add("misreading", misread);
  const identifier = IDENTIFIER.exec(sentence);
  if (identifier) add("identifier", `"${identifier[0]}" is an internal field name, not prose`);

  const { dates, rest } = takeDates(sentence);
  for (const d of dates) {
    const nextToInput = [...ctx.dates].some((x) => Math.abs(dayNumber(x) - dayNumber(d.iso)) === 1);
    if (!ctx.dates.has(d.iso) && !nextToInput) {
      add("date", `the date ${d.iso} is not in the input`);
    } else if (AS_AT.test(sentence.slice(0, d.at)) && ctx.asAt && d.iso !== ctx.asAt) {
      add("asAt", `the position is as at ${ctx.asAt}, not ${d.iso}`);
    }
  }
  const namesPeriod = PERIOD.test(sentence) || dates.some((d) => ctx.periodDates.has(d.iso));
  if (MONITORING_WINDOW.test(sentence) && ACTIVITY.test(sentence) && !namesPeriod) {
    add("period", "activity counts belong to the reporting period, not to the monitoring window");
  }

  // 0 groups ("has 0 groups checked") cannot be an invented total.
  for (const m of rest.matchAll(GROUP_COUNT)) {
    const n = Number(m[1]);
    if (n !== 0 && !ctx.groupCounts.has(n)) {
      add("groupCount", `"${m[0]}" does not match the group counts the input states`);
    }
  }

  for (const m of rest.matchAll(PAIR)) {
    const [x, y] = [normNumber(m[1]), normNumber(m[2])];
    if (!ctx.lines.some((line) => line.has(x) && line.has(y))) {
      add("pair", `"${m[0]}" is not stated in the input`);
    }
  }

  for (const m of rest.matchAll(PROSE_NUMBER)) {
    const raw = normNumber(`${m[1]}${m[2]}`);
    const value = Number(raw);
    if (m[3]) {
      // Grounded by the input only where it states a percentage: a count of
      // 46 requirements is no evidence for "46 percent".
      if (ctx.percents.has(raw)) continue;
      // The ratio of two grounded figures of the same kind the item cites
      // ("3 opened and 2 closed ... 67%"; "26 of the 42 requirements ... 31% of
      // all 83 requirements"), or of one of them over a report total of the
      // same kind, both kinds known ("46 requirements or 55.4 percent", of the
      // 83). Not any two numbers in the input: with dozens of small counts
      // there, nearly every percentage is some ratio (46 is 6/13, groups over
      // models), which would let a wrong figure through.
      const g = item.filter((f) => f.grounded);
      const near = (a: number, b: number) =>
        b > 0 && a <= b && Math.abs((a / b) * 100 - value) <= 0.5;
      const ratio =
        g.some((a, i) => g.some((b, j) => i !== j && sameKind(a, b) && near(a.value, b.value))) ||
        g.some((a) => ctx.totals.some((t) => a.kind === t.kind && near(a.value, t.value)));
      if (!ratio) {
        add(
          "percentage",
          `${m[0].trim()} is neither in the input nor the ratio of two like figures this item cites, or of one over a report total of its kind`,
        );
      }
      continue;
    }
    if (ctx.numbers.has(raw)) continue;
    if (kindAfter(rest, m.index! + m[0].length) === "days" && ctx.dayGaps.has(value)) continue;
    if (derivable(raw, m[2], item)) continue;
    add("number", `${raw} is not in the input and does not follow in one step from it`);
  }
  return out;
}

/** Every violation in prose: one item per paragraph, checked sentence by sentence. */
export function checkProse(text: unknown, ctx: GuardContext): ProseViolation[] {
  if (typeof text !== "string" || !text.trim()) return [];
  return paragraphs(text).flatMap((p) => {
    const item = figuresOf([p], ctx);
    return sentences(p).flatMap((s) => checkSentence(s, ctx, item));
  });
}

// ---------------------------------------------------------------------------
// (c) Which fields, and what a violation costs
// ---------------------------------------------------------------------------

/**
 * The prose the guard reads per analyzer. `whole` fields are required prose
 * (one item per paragraph); a `rows` entry's prose fields are one item
 * together. Identifiers (section, group, basis, severity) are not prose.
 */
const GUARDED: Partial<
  Record<AnalysisSectionKey, { whole: string[]; rows?: { list: string; fields: string[] } }>
> = {
  executiveSummary: { whole: ["summary"] },
  keyFindings: { whole: [], rows: { list: "findings", fields: ["text", "what_would_close_this"] } },
  recommendedActions: { whole: [], rows: { list: "actions", fields: ["action", "rationale"] } },
  e23Gap: {
    whole: ["narrative"],
    rows: { list: "principles", fields: ["explanation", "what_would_close_this"] },
  },
};

/**
 * The schema minimum of each guarded prose field (schemas.ts), and whether it
 * may be null. A field cut below its minimum cannot stand: a nullable one
 * becomes null, a required row field drops its row, a required whole field
 * abstains the analyzer.
 */
const FIELD_MINIMUM: Record<string, { min: number; nullable?: boolean }> = {
  summary: { min: 40 },
  narrative: { min: 40 },
  text: { min: 15 },
  explanation: { min: 10 },
  action: { min: 15 },
  rationale: { min: 10 },
  what_would_close_this: { min: 10, nullable: true },
};

export const isGuarded = (key: AnalysisSectionKey): boolean => key in GUARDED;

export function findViolations(
  key: AnalysisSectionKey,
  payload: any,
  ctx: GuardContext,
): GuardViolation[] {
  const spec = GUARDED[key];
  if (!spec || !payload) return [];
  const out: GuardViolation[] = [];
  for (const field of spec.whole) {
    checkProse(payload[field], ctx).forEach((v) => out.push({ ...v, field }));
  }
  if (spec.rows) {
    const { list, fields } = spec.rows;
    const rows: any[] = Array.isArray(payload[list]) ? payload[list] : [];
    rows.forEach((row, index) => {
      const texts = fields.map((f) => row?.[f]).filter((t): t is string => typeof t === "string");
      const item = figuresOf(texts, ctx);
      fields.forEach((f) => {
        const text = row?.[f];
        if (typeof text !== "string") return;
        paragraphs(text).forEach((p) =>
          sentences(p).forEach((s) =>
            checkSentence(s, ctx, item).forEach((v) =>
              out.push({ ...v, field: list, index, prop: f }),
            ),
          ),
        );
      });
    });
  }
  return out;
}

/** The text without the given sentences, paragraph breaks kept. */
function withoutSentences(text: string, bad: Set<string>): string {
  return paragraphs(text)
    .map((p) =>
      sentences(p)
        .filter((s) => !bad.has(s))
        .join(" "),
    )
    .filter(Boolean)
    .join("\n\n");
}

/**
 * The payload with the offending sentences removed, smallest cut first: a
 * sentence, then a row whose required field is left under its minimum. Null
 * when the analysis cannot stand: a required whole field is left under its
 * minimum, or a list analyzer has no row left.
 */
export function withoutViolations(
  key: AnalysisSectionKey,
  payload: any,
  violations: GuardViolation[],
): any | null {
  const spec = GUARDED[key];
  if (!spec || violations.length === 0) return payload;
  const next = { ...payload };
  const cut = (text: string, found: GuardViolation[]) =>
    withoutSentences(text, new Set(found.map((v) => v.sentence)));

  for (const field of spec.whole) {
    const found = violations.filter((v) => v.field === field && v.index === undefined);
    if (found.length === 0) continue;
    next[field] = cut(String(payload[field] ?? ""), found);
    if (next[field].length < FIELD_MINIMUM[field].min) return null;
  }
  if (spec.rows) {
    const { list, fields } = spec.rows;
    const rows: any[] = Array.isArray(payload[list]) ? payload[list] : [];
    const kept = rows.flatMap((row, index) => {
      const found = violations.filter((v) => v.field === list && v.index === index);
      if (found.length === 0) return [row];
      const out = { ...row };
      for (const f of fields) {
        const mine = found.filter((v) => v.prop === f);
        if (mine.length === 0 || typeof row?.[f] !== "string") continue;
        const text = cut(row[f], mine);
        const { min, nullable } = FIELD_MINIMUM[f];
        if (text.length >= min) out[f] = text;
        else if (nullable) out[f] = null;
        else return [];
      }
      return [out];
    });
    if (kept.length === 0 && spec.whole.length === 0) return null;
    next[list] = kept;
  }
  return next;
}

/** Appended to the system prompt for the one re-issue the guard allows. */
export function guardDirective(violations: GuardViolation[]): string {
  const lines = violations.map((v) => `- "${v.sentence}": ${v.detail}.`);
  return `

## UNSUPPORTED STATEMENTS DETECTED
Your previous response broke the rules of this report in these sentences:
${[...new Set(lines)].join("\n")}
Answer again from scratch. This report is a self-assessment: never state or imply compliance, fulfilment, alignment with or satisfaction of E-23 or OSFI's expectations, or what OSFI's view is. Use only figures and dates that appear in the input, or follow from two of them in one step; a percentage must be in the input, or the ratio of two like figures you cite in the same paragraph or finding, or of one of them over the report's total of the same kind (requirements, models in scope, groups). Write field names as words, never as identifiers. If the data cannot support a statement, leave it out.`;
}
