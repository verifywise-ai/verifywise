/**
 * The job description a run tested, as the key the run stores.
 *
 * The customer types a job title. It is stored as a key (lower case, words
 * joined by hyphens, at most `JOB_DESCRIPTION_KEY_MAX` characters, the
 * column's width) so that "Senior Engineer" and "senior  engineer" are one
 * job and do not break the trend. The key is printed with spaces for hyphens.
 * Pure: no I/O.
 */

/** `bias_audit_runs.job_description_key` is VARCHAR(64). */
export const JOB_DESCRIPTION_KEY_MAX = 64;

/** The longest title accepted, before it is reduced to a key. */
export const JOB_DESCRIPTION_INPUT_MAX = 200;

/** The key for a title, or null when it has no letter or digit. */
export function jobDescriptionKey(title: string): string | null {
  const key = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  const capped = Array.from(key).slice(0, JOB_DESCRIPTION_KEY_MAX).join("").replace(/-+$/, "");
  return capped === "" ? null : capped;
}

/** A stored key as words. */
export function jobDescriptionText(key: string): string {
  return key.replace(/-/g, " ");
}
