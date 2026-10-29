/**
 * The job description a run tested, as the run stores it.
 *
 * The customer's title is kept as typed, apart from Unicode normalisation
 * (NFC) and runs of whitespace, so the stance can print it as their words.
 * It must fit `bias_audit_runs.job_description_key` (VARCHAR(64)); a longer
 * title is refused, never cut. The trend compares titles with base-strength
 * collation (`sameJobDescription`).
 * Pure: no I/O.
 */

/** `bias_audit_runs.job_description_key` is VARCHAR(64). */
export const JOB_DESCRIPTION_MAX = 64;

/** Raw input past this length is refused as too long without being normalised. */
const RAW_MAX = 1000;

export type JobDescriptionResult =
  { ok: true; value: string | null } | { ok: false; reason: "too_long" | "no_letter_or_digit" };

/** The title to store; null for a blank one. */
export function normaliseJobDescription(raw: string): JobDescriptionResult {
  if (raw.length > RAW_MAX) return { ok: false, reason: "too_long" };
  const value = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  if (value === "") return { ok: true, value: null };
  if (Array.from(value).length > JOB_DESCRIPTION_MAX) return { ok: false, reason: "too_long" };
  if (!/[\p{L}\p{N}]/u.test(value)) return { ok: false, reason: "no_letter_or_digit" };
  return { ok: true, value };
}

const TITLE_COLLATOR = new Intl.Collator("en", { sensitivity: "base" });

/**
 * Whether two stored titles name the same job, by base-strength collation:
 * differences of case, accents and similar letter variants are ignored
 * ("İnşaat"/"inşaat", "Straße"/"STRASSE", "Résumé"/"resume", "Æ"/"AE"), as
 * are invisible ignorable characters; punctuation still counts, so "C++" and
 * "C#" differ. Not every pairing is folded: Turkish dotless "ı" and
 * capital "I" stay distinct. Null only matches null.
 */
export function sameJobDescription(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return TITLE_COLLATOR.compare(a, b) === 0;
}
