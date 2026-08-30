import {
  DISMISS_NOTE_MAX_LENGTH,
  DISMISS_REASONS_BY_RELATION,
  validateDismissReason,
} from "../dismissReason";

const dismissingASuggestion = {
  nextStatus: "dismissed" as const,
  currentStatus: "suggested" as const,
  relationType: "related_to" as const,
};

describe("validateDismissReason", () => {
  it("accepts a dismissal that says nothing", () => {
    expect(validateDismissReason(undefined, undefined, dismissingASuggestion)).toEqual({
      ok: true,
      reason: null,
      note: null,
    });
  });

  it("returns nulls for every transition that leaves dismissed", () => {
    // This is the clearing rule (spec §3.5). It is not a branch anywhere: the
    // controller writes whatever comes back, and nothing else can come back.
    for (const nextStatus of ["confirmed", "suggested"] as const) {
      expect(
        validateDismissReason(undefined, undefined, {
          nextStatus,
          currentStatus: "dismissed",
          relationType: "related_to",
        }),
      ).toEqual({ ok: true, reason: null, note: null });
    }
  });

  it("rejects a note with no reason to attach it to", () => {
    expect(validateDismissReason(undefined, "some prose", dismissingASuggestion)).toEqual({
      ok: false,
      rejection: "note_without_reason",
    });
  });

  it("rejects a note that is not text rather than dropping it", () => {
    expect(validateDismissReason("other", 42, dismissingASuggestion)).toEqual({
      ok: false,
      rejection: "note_not_text",
    });
  });

  it("rejects a reason on anything but a dismissal", () => {
    expect(
      validateDismissReason("not_related", undefined, {
        ...dismissingASuggestion,
        nextStatus: "confirmed",
      }),
    ).toEqual({ ok: false, rejection: "not_a_dismissal" });
  });

  it("rejects a reason on a confirmed row (spec §3.1)", () => {
    // Un-linking a pair you previously accepted is a content edit, not
    // feedback about a suggestion. Letting it through would mix the two in
    // one column with no way to separate them later.
    expect(
      validateDismissReason("not_related", undefined, {
        ...dismissingASuggestion,
        currentStatus: "confirmed",
      }),
    ).toEqual({ ok: false, rejection: "not_a_suggestion" });
  });

  it("rejects an unknown reason", () => {
    expect(validateDismissReason("because_i_said_so", undefined, dismissingASuggestion)).toEqual({
      ok: false,
      rejection: "unknown_reason",
    });
  });

  it("rejects a non-string reason without throwing", () => {
    expect(validateDismissReason(42, undefined, dismissingASuggestion)).toEqual({
      ok: false,
      rejection: "unknown_reason",
    });
  });

  it("accepts a related_to reason on a related_to row", () => {
    expect(validateDismissReason("not_related", undefined, dismissingASuggestion)).toEqual({
      ok: true,
      reason: "not_related",
      note: null,
    });
  });

  it("rejects a related_to reason on an inherits_from row", () => {
    expect(
      validateDismissReason("not_related", undefined, {
        ...dismissingASuggestion,
        relationType: "inherits_from",
      }),
    ).toEqual({ ok: false, rejection: "wrong_relation_type" });
  });

  it("accepts an inherits_from reason on an inherits_from row", () => {
    expect(
      validateDismissReason("wrong_direction", undefined, {
        ...dismissingASuggestion,
        relationType: "inherits_from",
      }),
    ).toEqual({ ok: true, reason: "wrong_direction", note: null });
  });

  it("offers `other` on both relation types", () => {
    expect(DISMISS_REASONS_BY_RELATION.related_to).toContain("other");
    expect(DISMISS_REASONS_BY_RELATION.inherits_from).toContain("other");
  });

  it("requires a note for `other`", () => {
    expect(validateDismissReason("other", undefined, dismissingASuggestion)).toEqual({
      ok: false,
      rejection: "note_required",
    });
  });

  it("treats a whitespace-only note as no note at all", () => {
    expect(validateDismissReason("other", "   ", dismissingASuggestion)).toEqual({
      ok: false,
      rejection: "note_required",
    });
  });

  it("stores the note trimmed", () => {
    expect(validateDismissReason("other", "  it is a duplicate of R-14  ", dismissingASuggestion)).toEqual({
      ok: true,
      reason: "other",
      note: "it is a duplicate of R-14",
    });
  });

  it("allows a note alongside a non-other reason", () => {
    expect(validateDismissReason("too_weak", "only one shared control", dismissingASuggestion)).toEqual({
      ok: true,
      reason: "too_weak",
      note: "only one shared control",
    });
  });

  it("accepts a note exactly at the cap and rejects one character more", () => {
    const atCap = "x".repeat(DISMISS_NOTE_MAX_LENGTH);
    expect(validateDismissReason("other", atCap, dismissingASuggestion)).toEqual({
      ok: true,
      reason: "other",
      note: atCap,
    });
    expect(validateDismissReason("other", atCap + "x", dismissingASuggestion)).toEqual({
      ok: false,
      rejection: "note_too_long",
    });
  });

  it("applies the cap after trimming", () => {
    const padded = "   " + "x".repeat(DISMISS_NOTE_MAX_LENGTH) + "   ";
    expect(validateDismissReason("other", padded, dismissingASuggestion)).toMatchObject({
      ok: true,
      reason: "other",
    });
  });
});
