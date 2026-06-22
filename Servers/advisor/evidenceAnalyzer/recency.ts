/**
 * Evidence Analyzer — Deterministic recency scoring.
 *
 * Recency is a function of (upload_date, expiry_date, now).
 * Pure code, no LLM — guarantees the same result every run.
 *
 * Anchors (file age = days since upload_date):
 *   ≤ 30 days   → 100  (fresh)
 *   ≤ 90 days   →  92
 *   ≤ 180 days  →  82
 *   ≤ 365 days  →  72
 *   ≤ 2 years   →  55
 *   ≤ 5 years   →  35
 *     > 5 years →  15
 *   no date     →  40  (assumes legacy/unknown)
 *
 * Expiry penalty: if expiry_date is in the past, the score is multiplied by 0.4.
 * Expiry near (≤ 30 days): score multiplied by 0.85.
 *
 * The result is clamped to [0, 100].
 */

export interface RecencyInput {
  uploadDate: Date | string | null;
  expiryDate: Date | string | null;
  /** Override the reference time (used in tests). Defaults to now. */
  now?: Date;
}

export interface RecencyResult {
  score: number;
  ageDays: number | null;
  daysToExpiry: number | null;
  rationale: string;
}

const DAY_MS = 1000 * 60 * 60 * 24;

function toDate(value: Date | string | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function baseRecencyByAge(ageDays: number): number {
  if (ageDays <= 30) return 100;
  if (ageDays <= 90) return 92;
  if (ageDays <= 180) return 82;
  if (ageDays <= 365) return 72;
  if (ageDays <= 730) return 55; // ≤ 2 years
  if (ageDays <= 1825) return 35; // ≤ 5 years
  return 15;
}

function ageBucketLabel(ageDays: number): string {
  if (ageDays <= 30) return "≤30 days (fresh)";
  if (ageDays <= 90) return "≤90 days";
  if (ageDays <= 180) return "≤180 days";
  if (ageDays <= 365) return "≤1 year";
  if (ageDays <= 730) return "≤2 years";
  if (ageDays <= 1825) return "≤5 years";
  return ">5 years";
}

export function computeRecency(input: RecencyInput): RecencyResult {
  const now = input.now ?? new Date();
  const uploadDate = toDate(input.uploadDate);
  const expiryDate = toDate(input.expiryDate);

  let ageDays: number | null = null;
  let daysToExpiry: number | null = null;
  let score: number;
  const rationaleParts: string[] = [];

  if (uploadDate) {
    ageDays = Math.max(0, Math.floor((now.getTime() - uploadDate.getTime()) / DAY_MS));
    score = baseRecencyByAge(ageDays);
    rationaleParts.push(`age ${ageDays}d (${ageBucketLabel(ageDays)})`);
  } else {
    score = 40;
    rationaleParts.push("no upload_date — defaulted to 40");
  }

  if (expiryDate) {
    daysToExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / DAY_MS);
    if (daysToExpiry < 0) {
      score = Math.round(score * 0.4);
      rationaleParts.push(`expired ${Math.abs(daysToExpiry)}d ago — penalty ×0.4`);
    } else if (daysToExpiry <= 30) {
      score = Math.round(score * 0.85);
      rationaleParts.push(`expires in ${daysToExpiry}d — penalty ×0.85`);
    } else {
      rationaleParts.push(`expires in ${daysToExpiry}d`);
    }
  }

  return {
    score: Math.min(100, Math.max(0, score)),
    ageDays,
    daysToExpiry,
    rationale: rationaleParts.join(" · "),
  };
}
