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
import { e23GroupCounts } from "./e23Gap";
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
  | "period";

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
 * compliance opinion or OSFI's view). `negatable` patterns are skipped when a
 * negation precedes them closely ("does not express a compliance opinion").
 */
export const COMPLIANCE_CLAIM_PATTERNS: Array<{
  pattern: RegExp;
  label: string;
  negatable?: boolean;
}> = [
  { pattern: /\b(?:non-?)?complian(?:ce|t)\b/i, label: "compliance", negatable: true },
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
  },
  { pattern: /\bin line with\s+(?:OSFI|E-23|the guideline)\b/i, label: "in line with OSFI" },
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

const NEGATION = /\b(?:not|no|never|neither|nor|without|cannot)\b(?:\s+[\w'-]+){0,4}\s*$/i;

function complianceClaim(sentence: string): string | null {
  for (const { pattern, label, negatable } of COMPLIANCE_CLAIM_PATTERNS) {
    const m = pattern.exec(sentence);
    if (!m) continue;
    if (negatable && NEGATION.test(sentence.slice(0, m.index))) continue;
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
 * Numbers in prose. Skips digits attached to a word ("C10", "E-23", "tier1"),
 * ordinals ("1st") and a list marker ("(2)"). Captures a percent sign or word.
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

/** Activity terms, and the monitoring window they do not belong to. */
const ACTIVITY =
  /\bsign-?offs?\b|\bsigned off\b|\bfindings? (?:opened|closed)\b|\bbreach|\brevalidation events?\b/i;
const MONITORING_WINDOW = /\bmonitoring window\b|\blast \d+ days\b|\b\d+-day\b/i;

/** What the guard checks prose against: the analyzer's own prompt, read once. */
export interface GuardContext {
  numbers: Set<string>;
  /** The numbers on each input line, for "X of Y". */
  lines: Array<Set<string>>;
  dates: Set<string>;
  /** The report's position date (the cover's UTC day). */
  asAt: string | null;
  /** The group counts the input states: total, checked, self-assessment only. */
  groupCounts: Set<number>;
}

export function guardContext(input: string, rd: ReportData): GuardContext {
  const { dates, rest } = takeDates(input);
  const numbersOf = (text: string) => new Set((text.match(INPUT_NUMBER) ?? []).map(normNumber));
  const groups = e23GroupCounts(rd);
  return {
    numbers: numbersOf(rest),
    lines: rest.split("\n").map(numbersOf),
    dates: new Set(dates.map((d) => d.iso)),
    asAt: utcDay(rd.metadata?.generatedAt) ?? null,
    groupCounts: new Set([groups.total, groups.checked, groups.selfAssessmentOnly]),
  };
}

/** Sentences, keeping decimals ("37.5") and identifiers ("2.1.4") whole. */
export const sentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Every rule one sentence breaks; [] when it is clean. */
export function checkSentence(sentence: string, ctx: GuardContext): ProseViolation[] {
  const out: ProseViolation[] = [];
  const add = (reason: GuardReason, detail: string) => out.push({ reason, sentence, detail });

  const claim = complianceClaim(sentence);
  if (claim) add("compliance", `states or implies ${claim}`);
  const misread = misreading(sentence);
  if (misread) add("misreading", misread);

  const { dates, rest } = takeDates(sentence);
  for (const d of dates) {
    if (!ctx.dates.has(d.iso)) add("date", `the date ${d.iso} is not in the input`);
    else if (AS_AT.test(sentence.slice(0, d.at)) && ctx.asAt && d.iso !== ctx.asAt) {
      add("asAt", `the position is as at ${ctx.asAt}, not ${d.iso}`);
    }
  }
  if (MONITORING_WINDOW.test(sentence) && ACTIVITY.test(sentence)) {
    add("period", "activity counts belong to the reporting period, not to the monitoring window");
  }

  for (const m of rest.matchAll(GROUP_COUNT)) {
    if (!ctx.groupCounts.has(Number(m[1]))) {
      add("groupCount", `"${m[0]}" does not match the group counts the input states`);
    }
  }

  const paired = new Set<number>();
  for (const m of rest.matchAll(PAIR)) {
    const [x, y] = [normNumber(m[1]), normNumber(m[2])];
    paired.add(m.index!);
    if (!ctx.lines.some((line) => line.has(x) && line.has(y))) {
      add("pair", `"${m[0]}" is not stated in the input`);
    }
  }

  const values: number[] = [];
  const percents: Array<{ raw: string; value: number }> = [];
  for (const m of rest.matchAll(PROSE_NUMBER)) {
    const raw = `${m[1]}${m[2]}`;
    if (m[3]) percents.push({ raw: m[0].trim(), value: Number(normNumber(raw)) });
    else {
      values.push(Number(normNumber(raw)));
      if (!ctx.numbers.has(normNumber(raw))) add("number", `${raw} is not in the input`);
    }
  }
  for (const p of percents) {
    if (ctx.numbers.has(String(p.value))) continue;
    // The ratio of two figures the same sentence cites ("2 of 7, 29 percent").
    // Not any two numbers in the input: with dozens of small counts there,
    // nearly every percentage is some ratio (46 is 6/13), which would let the
    // error this rule exists for through.
    const derived = values.some((a) =>
      values.some((b) => b > 0 && a <= b && Math.abs((a / b) * 100 - p.value) <= 0.5),
    );
    if (!derived) {
      add(
        "percentage",
        `${p.raw} is neither in the input nor the ratio of two figures in the same sentence`,
      );
    }
  }
  return out;
}

/** Every violation in a prose field, sentence by sentence. */
export function checkProse(text: unknown, ctx: GuardContext): ProseViolation[] {
  if (typeof text !== "string" || !text.trim()) return [];
  return sentences(text).flatMap((s) => checkSentence(s, ctx));
}

// ---------------------------------------------------------------------------
// (c) Which fields, and what a violation costs
// ---------------------------------------------------------------------------

/**
 * The prose the guard reads per analyzer. A violation in a `whole` field
 * abstains the analyzer (the field is required); one in a `rows` field drops
 * that row. Identifiers (section, group, basis, severity) are not prose.
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
    const rows: any[] = Array.isArray(payload[spec.rows.list]) ? payload[spec.rows.list] : [];
    rows.forEach((row, index) =>
      spec.rows!.fields.forEach((f) =>
        checkProse(row?.[f], ctx).forEach((v) => out.push({ ...v, field: spec.rows!.list, index })),
      ),
    );
  }
  return out;
}

/**
 * The payload with the violating rows dropped, or null when the analysis
 * cannot stand: a required prose field still violates, or a list analyzer has
 * no row left.
 */
export function withoutViolations(
  key: AnalysisSectionKey,
  payload: any,
  violations: GuardViolation[],
): any | null {
  const spec = GUARDED[key];
  if (!spec || violations.length === 0) return payload;
  if (violations.some((v) => v.index === undefined)) return null;
  const list = spec.rows!.list;
  const bad = new Set(violations.map((v) => v.index));
  const kept = (payload[list] as any[]).filter((_, i) => !bad.has(i));
  if (kept.length === 0 && spec.whole.length === 0) return null;
  return { ...payload, [list]: kept };
}

/** Appended to the system prompt for the one re-issue the guard allows. */
export function guardDirective(violations: GuardViolation[]): string {
  const lines = violations.map((v) => `- "${v.sentence}": ${v.detail}.`);
  return `

## UNSUPPORTED STATEMENTS DETECTED
Your previous response broke the rules of this report in these sentences:
${[...new Set(lines)].join("\n")}
Answer again from scratch. This report is a self-assessment: never state or imply compliance, fulfilment, alignment with or satisfaction of E-23 or OSFI's expectations, or what OSFI's view is. Use only figures and dates that appear in the input, tied to what the input ties them to; a percentage must be in the input or computed from two figures you cite in the same sentence. If the data cannot support a statement, leave it out.`;
}
