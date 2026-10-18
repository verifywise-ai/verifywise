/**
 * The job description a run tested, as the run stores it.
 *
 * The customer's title is kept as typed, apart from Unicode normalisation
 * (NFC) and runs of whitespace, so the stance can print it as their words.
 * It must fit `bias_audit_runs.job_description_key` (VARCHAR(64)); a longer
 * title is refused, never cut. The trend compares titles ignoring case.
 * Pure: no I/O.
 */

/** `bias_audit_runs.job_description_key` is VARCHAR(64). */
export const JOB_DESCRIPTION_MAX = 64;

export type JobDescriptionResult =
  { ok: true; value: string | null } | { ok: false; reason: "too_long" | "no_letter_or_digit" };

/** The title to store; null for a blank one. */
export function normaliseJobDescription(raw: string): JobDescriptionResult {
  const value = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  if (value === "") return { ok: true, value: null };
  if (Array.from(value).length > JOB_DESCRIPTION_MAX) return { ok: false, reason: "too_long" };
  if (!/[\p{L}\p{N}]/u.test(value)) return { ok: false, reason: "no_letter_or_digit" };
  return { ok: true, value };
}

/** Whether two stored titles name the same job: equal ignoring case; null only matches null. */
export function sameJobDescription(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return a.toLocaleLowerCase("en") === b.toLocaleLowerCase("en");
}
