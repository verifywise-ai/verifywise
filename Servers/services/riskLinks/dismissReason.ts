import { RiskLinkRelationType, RiskLinkStatus } from "./types";

/**
 * Why someone threw a suggestion away (C3).
 *
 * Pure by design — no database, no request, no ORM — for the same reason
 * `hierarchy.ts` is: the rule is the part worth testing, and it should be
 * testable without a mock.
 *
 * This module returns a rejection CODE, never a sentence. The controller owns
 * the wording, matching how `HierarchyViolation` and `HIERARCHY_MESSAGES`
 * already split.
 */
export type DismissReason =
  | "not_related"
  | "too_weak"
  | "duplicate"
  | "wrong_direction"
  | "wrong_parent"
  | "not_hierarchical"
  | "other";

/**
 * A `related_to` dismissal and an `inherits_from` dismissal fail in different
 * ways: "the direction is backwards" is meaningless for an undirected edge.
 * One column and one enum, but each relation type sees only its own three
 * values plus `other`.
 *
 * The radio buttons in
 * `Clients/src/presentation/components/LinkedRisksPanel/DismissReasonForm.tsx`
 * mirror this map. The server rejects a reason offered for the wrong relation
 * type, so the two must not drift.
 */
export const DISMISS_REASONS_BY_RELATION: Record<RiskLinkRelationType, DismissReason[]> = {
  related_to: ["not_related", "too_weak", "duplicate", "other"],
  inherits_from: ["wrong_direction", "wrong_parent", "not_hierarchical", "other"],
};

/**
 * Matches the `dismiss_note VARCHAR(500)` column width. The app validates
 * first, so the column is a backstop that can never fire: JavaScript `.length`
 * counts UTF-16 code units and Postgres counts characters, so 500 JS units is
 * at most 500 Postgres characters.
 */
export const DISMISS_NOTE_MAX_LENGTH = 500;

export type DismissReasonRejection =
  | "note_without_reason"
  | "note_not_text"
  | "not_a_dismissal"
  | "not_a_suggestion"
  | "unknown_reason"
  | "wrong_relation_type"
  | "note_required"
  | "note_too_long";

export interface DismissReasonContext {
  /** The status this request moves the row TO. */
  nextStatus: RiskLinkStatus;
  /** The status the row is in NOW. */
  currentStatus: RiskLinkStatus;
  relationType: RiskLinkRelationType;
}

export type DismissReasonResult =
  | { ok: true; reason: DismissReason | null; note: string | null }
  | { ok: false; rejection: DismissReasonRejection };

const ALL_REASONS = new Set<string>([
  ...DISMISS_REASONS_BY_RELATION.related_to,
  ...DISMISS_REASONS_BY_RELATION.inherits_from,
]);

/**
 * @param rawReason `req.body.dismissReason`, straight off the wire
 * @param rawNote `req.body.dismissNote`, same
 * @returns on success, exactly what to write to both columns.
 *
 * The pair of nulls is the whole clearing rule. A transition to `confirmed` or
 * `suggested` cannot carry a reason (`not_a_dismissal`), so the only result it
 * can produce is `null`/`null` — and since the UPDATE always writes both
 * columns, a stale reason has nowhere to survive. No branch required.
 */
export function validateDismissReason(
  rawReason: unknown,
  rawNote: unknown,
  ctx: DismissReasonContext,
): DismissReasonResult {
  const hasReason = rawReason !== undefined && rawReason !== null;
  const hasNote = rawNote !== undefined && rawNote !== null;

  // V1/V2 first: a malformed note is a client bug worth naming, and dropping
  // one because it arrived as a number would be silent data loss.
  if (hasNote && typeof rawNote !== "string") {
    return { ok: false, rejection: hasReason ? "note_not_text" : "note_without_reason" };
  }
  if (!hasReason) {
    if (hasNote) return { ok: false, rejection: "note_without_reason" };
    return { ok: true, reason: null, note: null };
  }

  if (ctx.nextStatus !== "dismissed") return { ok: false, rejection: "not_a_dismissal" };
  // Spec §3.1. `confirmed -> dismissed` is a human un-linking a pair they
  // previously accepted, not feedback about a suggestion.
  if (ctx.currentStatus !== "suggested") return { ok: false, rejection: "not_a_suggestion" };

  if (typeof rawReason !== "string" || !ALL_REASONS.has(rawReason)) {
    return { ok: false, rejection: "unknown_reason" };
  }
  const reason = rawReason as DismissReason;

  if (!DISMISS_REASONS_BY_RELATION[ctx.relationType].includes(reason)) {
    return { ok: false, rejection: "wrong_relation_type" };
  }

  const note = typeof rawNote === "string" ? rawNote.trim() : "";
  if (reason === "other" && note === "") return { ok: false, rejection: "note_required" };
  if (note.length > DISMISS_NOTE_MAX_LENGTH) return { ok: false, rejection: "note_too_long" };

  return { ok: true, reason, note: note === "" ? null : note };
}
