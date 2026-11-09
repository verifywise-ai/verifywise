import type { AuditRecord } from "./types";

/**
 * The group a record belongs to for one protected category, or null when the
 * value is blank. The engine tables and the data gates both use this, so
 * "blank" means one thing across the module.
 *
 * Blank is null, undefined, or a string that is empty after trimming. The
 * Python skips only falsy names, so it treats " " as a group of its own; that
 * would put a whitespace group in a published table, and lets a mostly-blank
 * column look populated. Non-blank values are stringified unchanged.
 */
/** Null, undefined, or a string that is empty after trimming. */
export function isBlankValue(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

export function groupValue(record: AuditRecord, key: string): string | null {
  const v = record[key];
  return isBlankValue(v) ? null : String(v);
}
