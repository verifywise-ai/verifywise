import { findJobDescription } from "../../structures/NYC-Local-Law-144/job-descriptions";
import type {
  ExpectedCriterion,
  JobDescription,
} from "../../structures/NYC-Local-Law-144/job-descriptions";

/**
 * Compares the criteria a customer's platform generated from the fixed job
 * description against the criteria the corpus was built against. Pure: no I/O,
 * deterministic, safe to run server-side at corpus creation.
 */
export interface CriteriaComparison {
  supplied: string[];
  matched: Array<{ expected: string; supplied: string; score: number }>;
  /** Keys of expected criteria no supplied item matched. */
  unmatchedExpected: string[];
  /** Supplied items that matched no expected criterion. */
  unmatchedSupplied: string[];
  verdict: "close" | "divergent" | "not_supplied";
}

const MATCH_THRESHOLD = 0.4;
const MAX_UNMATCHED_FOR_CLOSE = 1;

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "has",
  "have",
  "in",
  "is",
  "of",
  "on",
  "or",
  "rather",
  "than",
  "the",
  "this",
  "through",
  "to",
  "with",
  "only",
  "role",
  "runs",
  "handled",
  "typical",
  "evidence",
  "daily",
]);

/** Wordings shared by every job description. */
const COMMON_SYNONYMS: Record<string, string> = {
  duration: "length",
  own: "ownership",
  owner: "ownership",
};

/** Different wordings of the same idea, folded onto each job description's own terms. */
const SYNONYMS_BY_JOB: Record<string, Record<string, string>> = {
  "commercial-ae": {
    revenue: "quota",
    target: "quota",
    contract: "deal",
    value: "size",
    industry: "sector",
    comparable: "sector",
    pipeline: "outbound",
    prospect: "outbound",
    end: "full",
  },
  "operational-hourly": {
    warehouse: "warehouse",
    factory: "production",
    plant: "production",
    pick: "throughput",
    picking: "throughput",
    output: "throughput",
    productivity: "throughput",
    scanner: "scan",
    scann: "scan",
    handheld: "scan",
    forklift: "forklift",
    weekend: "shift",
    rotation: "shift",
    roster: "shift",
    punctuality: "attendance",
    absence: "attendance",
  },
};

/** Label terms too common to identify a criterion on their own. */
const GENERIC_TERMS = new Set([
  "experience",
  "record",
  "rate",
  "system",
  "availability",
  "certification",
  "use",
]);

function stem(word: string): string {
  for (const suffix of ["ing", "ed", "es", "s"]) {
    if (word.length > suffix.length + 3 && word.endsWith(suffix)) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

function tokens(text: string, synonyms: Record<string, string>): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!raw || STOPWORDS.has(raw)) continue;
    const s = stem(raw);
    out.add(synonyms[s] ?? synonyms[raw] ?? COMMON_SYNONYMS[s] ?? s);
  }
  return out;
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n += 1;
  return n;
}

const DESCRIPTION_CREDIT_CAP = 0.25;

/**
 * Share of the criterion's label terms found, plus a capped credit for its
 * description terms. An item must hit at least one label term that identifies
 * the criterion (not a generic one such as "rate"), so a vague word cannot
 * match on description credit alone.
 */
function score(
  item: Set<string>,
  criterion: { label: Set<string>; description: Set<string> },
): number {
  if (item.size === 0 || criterion.label.size === 0) return 0;
  const labelHitTerms = [...criterion.label].filter((t) => item.has(t));
  if (!labelHitTerms.some((t) => !GENERIC_TERMS.has(t))) return 0;
  const labelHits = labelHitTerms.length / criterion.label.size;
  const descHits =
    criterion.description.size === 0
      ? 0
      : overlap(item, criterion.description) / criterion.description.size;
  return Math.min(1, labelHits + Math.min(DESCRIPTION_CREDIT_CAP, 0.5 * descHits));
}

/**
 * One criterion per line. A single line is split on commas and semicolons
 * ("Quota attainment, Deal size"); a multi-line list is not, so a criterion
 * holding a comma ("Forklift, reach truck or order picker licence") stays whole.
 */
function parseSupplied(text: string): string[] {
  return text
    .split(/\r?\n/.test(text.trim()) ? /\r?\n+/ : /[,;]+/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter((line) => line.length > 0);
}

function jobDescriptionFor(key: string): JobDescription {
  const jd = findJobDescription(key);
  if (!jd) throw new Error(`Unknown job description "${key}".`);
  return jd;
}

export function compareCriteria(
  jobDescriptionKey: string,
  suppliedText: string | null,
): CriteriaComparison {
  const jd = jobDescriptionFor(jobDescriptionKey);
  const supplied = suppliedText ? parseSupplied(suppliedText) : [];
  if (supplied.length === 0) {
    return {
      supplied: [],
      matched: [],
      unmatchedExpected: [],
      unmatchedSupplied: [],
      verdict: "not_supplied",
    };
  }

  const synonyms = { ...COMMON_SYNONYMS, ...SYNONYMS_BY_JOB[jd.key] };
  const expected = jd.expectedCriteria.map((c: ExpectedCriterion) => ({
    key: c.key,
    label: tokens(c.label, synonyms),
    description: tokens(c.description, synonyms),
  }));
  const itemTokens = supplied.map((t) => tokens(t, synonyms));

  const pairs: Array<{ e: number; s: number; score: number }> = [];
  expected.forEach((c, e) =>
    itemTokens.forEach((t, s) => {
      const sc = score(t, c);
      if (sc >= MATCH_THRESHOLD) pairs.push({ e, s, score: sc });
    }),
  );
  // Greedy by best score; each side is used at most once.
  pairs.sort((a, b) => b.score - a.score || a.e - b.e || a.s - b.s);
  const usedE = new Set<number>();
  const usedS = new Set<number>();
  const matched: CriteriaComparison["matched"] = [];
  for (const p of pairs) {
    if (usedE.has(p.e) || usedS.has(p.s)) continue;
    usedE.add(p.e);
    usedS.add(p.s);
    matched.push({
      expected: expected[p.e].key,
      supplied: supplied[p.s],
      score: Math.round(p.score * 100) / 100,
    });
  }

  const unmatchedExpected = expected.filter((_, i) => !usedE.has(i)).map((c) => c.key);
  const unmatchedSupplied = supplied.filter((_, i) => !usedS.has(i));
  return {
    supplied,
    matched,
    unmatchedExpected,
    unmatchedSupplied,
    verdict: unmatchedExpected.length <= MAX_UNMATCHED_FOR_CLOSE ? "close" : "divergent",
  };
}
