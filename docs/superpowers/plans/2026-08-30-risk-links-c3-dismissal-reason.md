# C3: Risk Link Dismissal Reasons — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When someone dismisses a *suggested* risk link, let them say why in one click, store it, and report on it — so `risk-link-precision.sql` can tell "this signal is wrong" apart from "this signal is right but too weak".

**Architecture:** Two nullable columns on `risk_links`, one pure validator, one extra field on an existing PATCH body, one inline radio form under the row being dismissed. No new endpoint, no new table, no new page. The clearing rule — leaving `dismissed` must erase the reason — is not a branch: the validator returns `null`/`null` for every transition that cannot legally carry a reason, and the UPDATE always writes both columns, so a stale reason has nowhere to survive.

**Tech Stack:** Node 22, TypeScript, Express 4, Sequelize 6 raw SQL, PostgreSQL, Jest (backend), React 19 + React Query + MUI 7 (frontend), Vitest + Testing Library (frontend).

**Spec:** `docs/superpowers/specs/2026-08-30-risk-links-c3-dismissal-reason-design.md` (commit `d988fd888`)

## Global Constraints

- **Only `suggested -> dismissed` carries a reason.** `confirmed -> dismissed` is a human un-linking a pair they previously accepted — a content edit, not feedback about the engine. Mixing the two into one column corrupts every per-signal rate in the report, and the table stores no transition history to separate them afterwards. This is spec §3.1 and it is the single most likely thing to be "improved" by mistake. Do not.
- **The reason is OPTIONAL and must stay optional.** A required reason gets the first radio clicked, and bad data is indistinguishable from good data in a `GROUP BY`. There is no "please choose" validation anywhere.
- **Leaving `dismissed` clears both columns.** `dismissed -> confirmed` and `dismissed -> suggested` write `NULL` to `dismiss_reason` and `dismiss_note`. Task 4 is the regression test for exactly this and it is not optional.
- **The seven reason slugs are new.** `not_related`, `too_weak`, `duplicate`, `wrong_direction`, `wrong_parent`, `not_hierarchical`, `other`. They exist nowhere in the codebase before this plan, so there is no existing reference to grep against and nothing will catch a typo but you. Copy them from this document; do not retype them from memory.
- **No CHECK constraint on `dismiss_reason`.** `relation_type` and `status` have none on this table either; the vocabulary lives in `Servers/services/riskLinks/dismissReason.ts`. `dismiss_note VARCHAR(500)` does carry its width — that is a storage bound, not a vocabulary.
- **No swagger change and no `generate:swagger` run.** `Servers/scripts/checkApiDrift.ts` compares path, method, and `security.bearerAuth` only. This plan adds no route, so a regenerated swagger commit would be noise. Do not run the generators.
- **Unqualified table names in all application and test SQL.** `search_path` is `verifywise`. Never `verifywise.risk_links` in TypeScript. The migration is the exception — migrations qualify, matching `20260828090000-risk-links-single-parent.js`.
- **Tenant isolation from `req.organizationId` only** — the JWT. Never from the body, never from a query param.
- **UI labels are English and verbatim.** The table in spec §4 is the source. Do not paraphrase, do not "improve" the wording.
- **Commit format:** `type(scope): description`, e.g. `feat(risk-links): capture why a suggestion was dismissed`.
- **No `console.log`.** `logProcessing`/`logSuccess`/`logFailure` in controllers.

## Where this plan decides something the spec left open

| Decision | Why |
|---|---|
| `updateRiskLinkStatusQuery` takes the two new arguments as **required**, not defaulted | There is exactly one production caller. A required parameter is what stops a future second caller from silently skipping the clear. The cost is three existing test assertions gaining `, null, null` — Task 2 does that. |
| Validation runs **after** the transition guard and **before** the hierarchy check | After the guard so `confirmed -> confirmed` stays the 400 it already is instead of a confusing reason error; before the hierarchy check because it is pure and the hierarchy check is a database round trip. |
| The panel extracts a shared `onMutationError` | Three call sites would otherwise repeat the same six lines. Net smaller diff. |
| A row's action buttons are hidden while its reason form is open | Otherwise two buttons labelled `Dismiss` are live for one link at once — ambiguous on screen, and `getByRole("button", { name: "Dismiss" })` matches both and throws. The form owns the decision until submitted or cancelled. |
| The integration test drives `updateRiskLinkStatusQuery` directly, not HTTP | The rule under test is "the UPDATE always writes both columns". The controller path is already covered by Task 3's unit tests, and the direct call makes the round-trip assertion three lines instead of thirty. |

## File Structure

**Create**

| Path | Responsibility |
|---|---|
| `Servers/database/migrations/20260830120000-risk-links-dismiss-reason.js` | Two nullable columns |
| `Servers/services/riskLinks/dismissReason.ts` | The vocabulary map, the note cap, the pure validator. No DB, no request, no ORM — same reason `hierarchy.ts` is pure. |
| `Servers/services/riskLinks/tests/dismissReason.spec.ts` | Its tests |
| `Servers/tests/integration/riskLinks.dismissReason.test.ts` | The undo round-trip regression |
| `Clients/src/presentation/components/LinkedRisksPanel/DismissReasonForm.tsx` | The inline radio form and the label map |

**Modify**

| Path | Change |
|---|---|
| `Servers/services/riskLinks/types.ts` | `RiskLinkRow` gains the two columns |
| `Servers/utils/riskLink.utils.ts:35` | `toLinkRow` maps them |
| `Servers/utils/riskLink.utils.ts:652` | `updateRiskLinkStatusQuery` writes them, always |
| `Servers/controllers/riskLinks.ctrl.ts:60` | `toResponse` echoes them |
| `Servers/controllers/riskLinks.ctrl.ts:228` | Validate, map the rejection to a message, pass through |
| `Servers/controllers/__tests__/riskLinks.ctrl.test.ts` | Fixture gains two nulls; three assertions gain `, null, null`; new cases |
| `Clients/src/domain/interfaces/i.riskLink.ts` | `DismissReason` type; `RiskLink` gains the two fields |
| `Clients/src/application/repository/riskLink.repository.ts` | `updateRiskLinkStatus` forwards the dismissal |
| `Clients/src/application/hooks/useRiskLinks.ts` | Mutation variables grow |
| `Clients/src/presentation/components/LinkedRisksPanel/index.tsx` | `dismissing` state, the form, the reason chip |
| `docs/technical/domains/risk-link-precision.sql` | Query 6; a note on query 5 |
| `docs/technical/domains/risk-management.md` | Two sentences; `Last Updated` |

---

## Task 1: The vocabulary and the pure validator

Everything downstream reads the slugs from this file, so it lands first and alone.

**Files:**
- Create: `Servers/services/riskLinks/dismissReason.ts`
- Test: `Servers/services/riskLinks/tests/dismissReason.spec.ts`

**Interfaces:**
- Consumes: `RiskLinkRelationType`, `RiskLinkStatus` from `./types`
- Produces: `DismissReason`, `DismissReasonRejection`, `DismissReasonContext`, `DismissReasonResult`, `DISMISS_REASONS_BY_RELATION`, `DISMISS_NOTE_MAX_LENGTH`, and `validateDismissReason(rawReason: unknown, rawNote: unknown, ctx: DismissReasonContext): DismissReasonResult`

- [ ] **Step 1: Write the failing test**

Create `Servers/services/riskLinks/tests/dismissReason.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Servers && npx jest services/riskLinks/tests/dismissReason.spec.ts`
Expected: FAIL — `Cannot find module '../dismissReason'`.

- [ ] **Step 3: Write the implementation**

Create `Servers/services/riskLinks/dismissReason.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd Servers && npx jest services/riskLinks/tests/dismissReason.spec.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add Servers/services/riskLinks/dismissReason.ts Servers/services/riskLinks/tests/dismissReason.spec.ts
git commit -m "feat(risk-links): add the dismissal reason vocabulary and validator"
```

---

## Task 2: The columns, the row type, and the write

The validator has nowhere to write yet. This task gives it one and makes the clearing rule structural.

**Files:**
- Create: `Servers/database/migrations/20260830120000-risk-links-dismiss-reason.js`
- Modify: `Servers/services/riskLinks/types.ts`, `Servers/utils/riskLink.utils.ts:35`, `Servers/utils/riskLink.utils.ts:652`, `Servers/controllers/__tests__/riskLinks.ctrl.test.ts`

**Interfaces:**
- Consumes: `DismissReason` from `../services/riskLinks/dismissReason` (Task 1)
- Produces: `updateRiskLinkStatusQuery(id, organizationId, status, decidedByUserId, dismissReason, dismissNote)` — six required parameters; `RiskLinkRow.dismiss_reason` and `RiskLinkRow.dismiss_note`

- [ ] **Step 1: Write the migration**

Create `Servers/database/migrations/20260830120000-risk-links-dismiss-reason.js`:

```js
"use strict";

module.exports = {
  async up(queryInterface) {
    // Both nullable with no default. NULL means "dismissed without saying
    // why", which is a legitimate expected state, not missing data — the
    // reason is optional on purpose, because a required one just gets the
    // first radio clicked.
    //
    // No CHECK on dismiss_reason: relation_type and status have none on this
    // table either, and the vocabulary lives in
    // Servers/services/riskLinks/dismissReason.ts. dismiss_note carries its
    // width because a length is a storage bound, not a vocabulary.
    //
    // No index. The reporting query is a hand-run aggregate over thousands of
    // rows, not millions; a seq scan is the correct plan.
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.risk_links
        ADD COLUMN IF NOT EXISTS dismiss_reason VARCHAR(20),
        ADD COLUMN IF NOT EXISTS dismiss_note   VARCHAR(500);
    `);
  },

  async down(queryInterface) {
    // Unlike the C1 migration there is nothing to preserve: the columns did
    // not exist before, so nothing is lost that this migration did not add.
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.risk_links
        DROP COLUMN IF EXISTS dismiss_reason,
        DROP COLUMN IF EXISTS dismiss_note;
    `);
  },
};
```

- [ ] **Step 2: Run the migration**

This targets your **development** database — the one `Servers/.env` points at.
Do not run it by hand against the integration-test database: `Servers/tests/integration/globalSetup.js` runs migrations itself before the suite, so Task 4 needs no manual migration step.

Run: `cd Servers && npm run migrate-db`
Then verify (development database again): `psql -d verifywise -c "\d verifywise.risk_links"` shows both columns as `character varying(20)` and `character varying(500)`, both nullable.

- [ ] **Step 3: Write the failing test**

In `Servers/controllers/__tests__/riskLinks.ctrl.test.ts`, the `suggested` fixture (around line 116) gains the two new fields — `RiskLinkRow` is about to require them, so `mockResolvedValue` will not typecheck without them:

```ts
  const suggested = {
    id: 100, organization_id: 7, source_risk_id: 3, target_risk_id: 42,
    relation_type: "related_to" as const, status: "suggested" as const,
    source: "derived" as const, score: 5, reasons: [],
    decided_at: null, last_computed_at: null,
    dismiss_reason: null, dismiss_note: null,
  };
```

Then update the three assertions that name the query's arguments — lines 179, 228 and 238 today:

```ts
    expect(mockUtils.updateRiskLinkStatusQuery).toHaveBeenCalledWith(100, 7, "confirmed", 5, null, null);
```

```ts
    expect(mockUtils.updateRiskLinkStatusQuery).toHaveBeenCalledWith(100, 7, "suggested", null, null, null);
```

(The `"confirmed"` form appears twice — in "confirms an inheritance link when the grouping stays two levels deep" and in "confirms a suggestion and records who decided". Both change.)

- [ ] **Step 4: Run test to verify it fails**

Run: `cd Servers && npx jest controllers/__tests__/riskLinks.ctrl.test.ts`
Expected: FAIL — three assertions report the received call had 4 arguments, not 6.

- [ ] **Step 5: Widen the row type**

In `Servers/services/riskLinks/types.ts`, add the import and two fields to `RiskLinkRow`:

```ts
import { DismissReason } from "./dismissReason";
```

```ts
export interface RiskLinkRow {
  id: number;
  organization_id: number;
  source_risk_id: number;
  target_risk_id: number;
  relation_type: RiskLinkRelationType;
  status: RiskLinkStatus;
  source: RiskLinkSource;
  score: number;
  reasons: LinkSignal[];
  decided_at: string | null;
  last_computed_at: string | null;
  /** Why a SUGGESTED link was thrown away. Null on every other status — see C3 §3.5. */
  dismiss_reason: DismissReason | null;
  dismiss_note: string | null;
}
```

- [ ] **Step 6: Map and write the columns**

In `Servers/utils/riskLink.utils.ts`, `toLinkRow` (line 35) gains two lines:

```ts
const toLinkRow = (row: any): RiskLinkRow => ({
  id: row.id,
  organization_id: row.organization_id,
  source_risk_id: row.source_risk_id,
  target_risk_id: row.target_risk_id,
  relation_type: row.relation_type,
  status: row.status,
  source: row.source,
  score: toNumber(row.score),
  reasons: toJsonArray<LinkSignal>(row.reasons),
  decided_at: row.decided_at ?? null,
  last_computed_at: row.last_computed_at ?? null,
  dismiss_reason: row.dismiss_reason ?? null,
  dismiss_note: row.dismiss_note ?? null,
});
```

Both select queries use `SELECT *` / `SELECT l.*`, so no SQL there changes.

Then `updateRiskLinkStatusQuery` (line 652). Import `DismissReason` from `../services/riskLinks/dismissReason` alongside the existing type imports:

```ts
/**
 * Both dismissal columns are written on EVERY call, and both parameters are
 * required rather than defaulted. That is the clearing rule (C3 §3.5) made
 * structural: leaving `dismissed` passes nulls, so a stale reason cannot
 * survive onto a confirmed row, and a future second caller cannot forget.
 */
export async function updateRiskLinkStatusQuery(
  id: number,
  organizationId: number,
  status: RiskLinkStatus,
  decidedByUserId: number | null,
  dismissReason: DismissReason | null,
  dismissNote: string | null,
): Promise<void> {
  await sequelize.query(
    `UPDATE risk_links
     SET status = :status,
         decided_by_user_id = :decidedByUserId,
         decided_at = CASE WHEN :decidedByUserId IS NULL THEN NULL ELSE NOW() END,
         dismiss_reason = :dismissReason,
         dismiss_note = :dismissNote,
         updated_at = NOW()
     WHERE id = :id AND organization_id = :organizationId`,
    {
      replacements: {
        id,
        organizationId,
        status,
        decidedByUserId,
        dismissReason,
        dismissNote,
      },
      type: QueryTypes.UPDATE,
    },
  );
}
```

The single production caller in `riskLinks.ctrl.ts:280` now fails to compile. Pass `null, null` for the moment; Task 3 replaces both with the validator's result:

```ts
    await updateRiskLinkStatusQuery(id, req.organizationId!, next, decidedByUserId, null, null);
```

- [ ] **Step 7: Run the tests and the build**

Run: `cd Servers && npx jest controllers/__tests__/riskLinks.ctrl.test.ts && npm run build`
Expected: PASS, and a clean `tsc`.

- [ ] **Step 8: Commit**

```bash
git add Servers/database/migrations/20260830120000-risk-links-dismiss-reason.js Servers/services/riskLinks/types.ts Servers/utils/riskLink.utils.ts Servers/controllers/riskLinks.ctrl.ts Servers/controllers/__tests__/riskLinks.ctrl.test.ts
git commit -m "feat(risk-links): store a dismissal reason on risk_links"
```

---

## Task 3: The endpoint

**Files:**
- Modify: `Servers/controllers/riskLinks.ctrl.ts:60`, `Servers/controllers/riskLinks.ctrl.ts:228`
- Test: `Servers/controllers/__tests__/riskLinks.ctrl.test.ts`

**Interfaces:**
- Consumes: `validateDismissReason`, `DismissReasonRejection` (Task 1); the six-argument `updateRiskLinkStatusQuery` (Task 2)
- Produces: `PATCH /api/riskLinks/:id` accepting `{ status, dismissReason?, dismissNote? }`; `toResponse` emitting `dismissReason` / `dismissNote`

- [ ] **Step 1: Write the failing tests**

Add to the `describe("updateRiskLinkStatus")` block in `Servers/controllers/__tests__/riskLinks.ctrl.test.ts`:

```ts
  it("passes a dismissal reason through to the query", async () => {
    mockUtils.getRiskLinkByIdQuery.mockResolvedValue(suggestedInheritance);
    const r = res();
    await updateRiskLinkStatus(
      req({
        params: { id: "100" },
        body: { status: "dismissed", dismissReason: "wrong_direction" },
      }) as any,
      r as any,
    );
    expect(mockUtils.updateRiskLinkStatusQuery).toHaveBeenCalledWith(
      100, 7, "dismissed", 5, "wrong_direction", null,
    );
    expect(r.status).toHaveBeenCalledWith(200);
  });

  it("trims and stores the note for `other`", async () => {
    mockUtils.getRiskLinkByIdQuery.mockResolvedValue(suggested);
    await updateRiskLinkStatus(
      req({
        params: { id: "100" },
        body: { status: "dismissed", dismissReason: "other", dismissNote: "  see R-14  " },
      }) as any,
      res() as any,
    );
    expect(mockUtils.updateRiskLinkStatusQuery).toHaveBeenCalledWith(
      100, 7, "dismissed", 5, "other", "see R-14",
    );
  });

  it("400s on a reason offered for the wrong relation type", async () => {
    mockUtils.getRiskLinkByIdQuery.mockResolvedValue(suggested); // related_to
    const r = res();
    await updateRiskLinkStatus(
      req({
        params: { id: "100" },
        body: { status: "dismissed", dismissReason: "wrong_direction" },
      }) as any,
      r as any,
    );
    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: "That dismissal reason does not apply to this kind of link",
      }),
    );
    expect(mockUtils.updateRiskLinkStatusQuery).not.toHaveBeenCalled();
  });

  it("400s on a reason sent for a confirmed row, and writes nothing (§3.1)", async () => {
    // The panel does not offer the form here, but the panel is not a trust
    // boundary. Letting this through is the corruption C3 exists to avoid.
    mockUtils.getRiskLinkByIdQuery.mockResolvedValue({ ...suggested, status: "confirmed" as const });
    const r = res();
    await updateRiskLinkStatus(
      req({
        params: { id: "100" },
        body: { status: "dismissed", dismissReason: "not_related" },
      }) as any,
      r as any,
    );
    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: "A dismissal reason only applies to a suggested link" }),
    );
    expect(mockUtils.updateRiskLinkStatusQuery).not.toHaveBeenCalled();
  });

  it("dismisses a confirmed row with no reason at all", async () => {
    mockUtils.getRiskLinkByIdQuery.mockResolvedValue({ ...suggested, status: "confirmed" as const });
    await updateRiskLinkStatus(
      req({ params: { id: "100" }, body: { status: "dismissed" } }) as any,
      res() as any,
    );
    expect(mockUtils.updateRiskLinkStatusQuery).toHaveBeenCalledWith(100, 7, "dismissed", 5, null, null);
  });

  it("400s when `other` arrives without a note", async () => {
    mockUtils.getRiskLinkByIdQuery.mockResolvedValue(suggested);
    const r = res();
    await updateRiskLinkStatus(
      req({ params: { id: "100" }, body: { status: "dismissed", dismissReason: "other" } }) as any,
      r as any,
    );
    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: "A note is required when the dismissal reason is Other" }),
    );
  });

  it("keeps the transition guard ahead of the reason check", async () => {
    // confirmed -> suggested is already a 400 (R6). It must stay THAT 400,
    // not a confusing one about dismissal reasons.
    mockUtils.getRiskLinkByIdQuery.mockResolvedValue({ ...suggested, status: "confirmed" as const });
    const r = res();
    await updateRiskLinkStatus(
      req({
        params: { id: "100" },
        body: { status: "suggested", dismissReason: "not_related" },
      }) as any,
      r as any,
    );
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: "Cannot change status from confirmed to suggested" }),
    );
  });
```

And in the `describe("getRiskLinks")` block, assert the echo:

```ts
  it("echoes a stored dismissal reason", async () => {
    mockUtils.getRiskLinksForRiskQuery.mockResolvedValue([
      {
        id: 1, organization_id: 7, source_risk_id: 3, target_risk_id: 42,
        relation_type: "related_to" as const, status: "dismissed" as const,
        source: "derived" as const, score: 5, reasons: [],
        decided_at: null, last_computed_at: null,
        dismiss_reason: "not_related" as const, dismiss_note: null,
        related_id: 3, related_risk_name: "Model drift",
        related_risk_level: "High risk", related_risk_owner: 9,
      },
    ]);
    const r = res();
    await getRiskLinks(
      req({ params: { riskId: "42" }, query: { status: "dismissed" } }) as any,
      r as any,
    );
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ dismissReason: "not_related", dismissNote: null })],
      }),
    );
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd Servers && npx jest controllers/__tests__/riskLinks.ctrl.test.ts`
Expected: FAIL — the pass-through cases still see `null, null`, the 400 cases return 200, and the echo case reports the object has no `dismissReason`.

- [ ] **Step 3: Write the implementation**

In `Servers/controllers/riskLinks.ctrl.ts`, add the import:

```ts
import {
  DismissReasonRejection,
  validateDismissReason,
} from "../services/riskLinks/dismissReason";
```

Add the message map next to `HIERARCHY_MESSAGES` (after line 87). The service returns a code; the wording lives here:

```ts
const DISMISS_REASON_MESSAGES: Record<DismissReasonRejection, string> = {
  note_without_reason: "A note needs a dismissal reason",
  note_not_text: "The note must be text",
  not_a_dismissal: "A dismissal reason only applies when dismissing a link",
  not_a_suggestion: "A dismissal reason only applies to a suggested link",
  unknown_reason: "Invalid dismissal reason",
  wrong_relation_type: "That dismissal reason does not apply to this kind of link",
  note_required: "A note is required when the dismissal reason is Other",
  note_too_long: "The note must be 500 characters or fewer",
};
```

`toResponse` (line 60) gains two lines, after `lastComputedAt`:

```ts
  decidedAt: link.decided_at,
  lastComputedAt: link.last_computed_at,
  // Null on every row the default view returns. Rendering it in the dismissed
  // view is what keeps dismiss_reason from becoming a write-only column, and
  // makes a stale reason on a confirmed row visible instead of silent.
  dismissReason: link.dismiss_reason,
  dismissNote: link.dismiss_note,
```

In `updateRiskLinkStatus`, insert the validation immediately after the `ALLOWED_TRANSITIONS` guard and before the hierarchy check — after the guard so `confirmed -> confirmed` stays its own 400, before the hierarchy check because this is pure and that is a database round trip:

```ts
    // Pure, and ahead of the hierarchy round trip. `dismissal.reason` and
    // `dismissal.note` are both null for every transition that cannot legally
    // carry a reason, which is what clears the columns on the way out of
    // `dismissed` without a branch.
    const dismissal = validateDismissReason(req.body?.dismissReason, req.body?.dismissNote, {
      nextStatus: next,
      currentStatus: link.status,
      relationType: link.relation_type,
    });
    if (!dismissal.ok) {
      return res
        .status(400)
        .json(STATUS_CODE[400](DISMISS_REASON_MESSAGES[dismissal.rejection]));
    }
```

And the call from Task 2 Step 6 becomes:

```ts
    await updateRiskLinkStatusQuery(
      id,
      req.organizationId!,
      next,
      decidedByUserId,
      dismissal.reason,
      dismissal.note,
    );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd Servers && npx jest controllers/__tests__/riskLinks.ctrl.test.ts && npm run build`
Expected: PASS, clean build.

- [ ] **Step 5: Commit**

```bash
git add Servers/controllers/riskLinks.ctrl.ts Servers/controllers/__tests__/riskLinks.ctrl.test.ts
git commit -m "feat(risk-links): accept a dismissal reason on the status endpoint"
```

---

## Task 4: The undo round-trip, against a real database

A clearing bug that only fails on the *second* dismissal is exactly what a single-transition test misses. This is the regression that matters and it is not optional.

**Files:**
- Create: `Servers/tests/integration/riskLinks.dismissReason.test.ts`

**Interfaces:**
- Consumes: the six-argument `updateRiskLinkStatusQuery` (Task 2)
- Produces: nothing. This task adds no code, only proof.

- [ ] **Step 1: Write the failing test**

Create `Servers/tests/integration/riskLinks.dismissReason.test.ts`:

```ts
jest.setTimeout(60000);

import { cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import { createTestRisk } from "../factories";
import { updateRiskLinkStatusQuery } from "../../utils/riskLink.utils";

afterEach(async () => {
  await cleanupDatabase();
});

/** Unqualified: search_path is `verifywise`. */
const seedSuggestion = async (orgId: number, a: number, b: number): Promise<number> => {
  const [rows]: any = await sequelize.query(
    `INSERT INTO risk_links
       (organization_id, source_risk_id, target_risk_id, relation_type, status, source)
     VALUES (:orgId, :a, :b, 'related_to', 'suggested', 'derived')
     RETURNING id`,
    { replacements: { orgId, a: Math.min(a, b), b: Math.max(a, b) } },
  );
  return rows[0].id;
};

const readDismissal = async (id: number) => {
  const [rows]: any = await sequelize.query(
    `SELECT dismiss_reason, dismiss_note, status FROM risk_links WHERE id = :id`,
    { replacements: { id } },
  );
  return rows[0];
};

describe("dismissal reasons across the undo round-trip", () => {
  it("clears both columns when a dismissal is undone and re-made without a reason", async () => {
    const { owner } = await seedTwoTenantContexts();
    const a = await createTestRisk(owner.orgId, {});
    const b = await createTestRisk(owner.orgId, {});
    const id = await seedSuggestion(owner.orgId, a, b);

    await updateRiskLinkStatusQuery(
      id, owner.orgId, "dismissed", owner.userId, "not_related", "nothing in common",
    );
    expect(await readDismissal(id)).toMatchObject({
      status: "dismissed",
      dismiss_reason: "not_related",
      dismiss_note: "nothing in common",
    });

    // Undo.
    await updateRiskLinkStatusQuery(id, owner.orgId, "suggested", null, null, null);
    expect(await readDismissal(id)).toMatchObject({
      status: "suggested",
      dismiss_reason: null,
      dismiss_note: null,
    });

    // Dismiss again, this time saying nothing. The first reason must NOT
    // come back. This is the assertion the whole task exists for.
    await updateRiskLinkStatusQuery(id, owner.orgId, "dismissed", owner.userId, null, null);
    expect(await readDismissal(id)).toMatchObject({
      status: "dismissed",
      dismiss_reason: null,
      dismiss_note: null,
    });
  });

  it("clears the reason when a dismissed link is confirmed", async () => {
    // A confirmed row carrying "these aren't actually related" would poison
    // the exact report C3 exists to feed.
    const { owner } = await seedTwoTenantContexts();
    const a = await createTestRisk(owner.orgId, {});
    const b = await createTestRisk(owner.orgId, {});
    const id = await seedSuggestion(owner.orgId, a, b);

    await updateRiskLinkStatusQuery(id, owner.orgId, "dismissed", owner.userId, "too_weak", null);
    await updateRiskLinkStatusQuery(id, owner.orgId, "confirmed", owner.userId, null, null);

    expect(await readDismissal(id)).toMatchObject({
      status: "confirmed",
      dismiss_reason: null,
      dismiss_note: null,
    });
  });

  it("never overwrites another organization's dismissal reason", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const a = await createTestRisk(owner.orgId, {});
    const b = await createTestRisk(owner.orgId, {});
    const id = await seedSuggestion(owner.orgId, a, b);

    await updateRiskLinkStatusQuery(
      id, owner.orgId, "dismissed", owner.userId, "not_related", null,
    );

    // Written to be discriminating on purpose. Asserting against a *pristine*
    // suggested row would pass even if the organization_id clause were dropped,
    // because `attacker.userId` might not satisfy the decided_by_user_id foreign
    // key and the UPDATE would fail for the wrong reason. Here the attacker's
    // user is real and the transition is legal, so the only thing standing
    // between this call and a successful overwrite is the org guard.
    await updateRiskLinkStatusQuery(
      id, attacker.orgId, "confirmed", attacker.userId, null, null,
    );

    expect(await readDismissal(id)).toMatchObject({
      status: "dismissed",
      dismiss_reason: "not_related",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

`globalSetup.js` migrates the integration-test database for you, so Task 2's
columns are already there — you do **not** run `migrate-db` here. Expect a
failure about the *assertions*, not about a missing column.

Run: `cd Servers && npm run test:integration -- --testPathPatterns=riskLinks.dismissReason`
Expected: FAIL.

If instead you get `column "dismiss_reason" does not exist`, that is not this
task's red step — the migration file did not reach the test database. Confirm
`20260830120000-risk-links-dismiss-reason.js` is committed (globalSetup reads
the working tree, so an uncommitted-but-saved file is fine; a missing one is
not) and re-run before writing any code.

- [ ] **Step 3: Make it pass**

No production code changes. Task 2 already shipped the columns and the write;
this task only proves the round-trip against a real database.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd Servers && npm run test:integration -- --testPathPatterns=riskLinks.dismissReason`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add Servers/tests/integration/riskLinks.dismissReason.test.ts
git commit -m "test(risk-links): prove an undone dismissal drops its reason"
```

---

## Task 5: The frontend contract

Types, repository, hook. No UI yet — this is what makes Task 6 compile.

**Files:**
- Modify: `Clients/src/domain/interfaces/i.riskLink.ts`, `Clients/src/application/repository/riskLink.repository.ts`, `Clients/src/application/hooks/useRiskLinks.ts`
- Test: `Clients/src/application/hooks/__tests__/useRiskLinks.test.ts`

**Interfaces:**
- Produces: `DismissReason` and `RiskLink.dismissReason` / `RiskLink.dismissNote` from `i.riskLink`; `updateRiskLinkStatus(id, status, dismissal?)`; `useUpdateRiskLinkStatus(...).mutate({ id, status, dismissal? })` where `dismissal` is `{ dismissReason: DismissReason; dismissNote?: string }`

- [ ] **Step 1: Write the failing test**

Add to `Clients/src/application/hooks/__tests__/useRiskLinks.test.ts`, inside the
`useUpdateRiskLinkStatus` describe block (create one if the file has none):

```ts
  it("forwards a dismissal reason to the repository", async () => {
    mockUpdate.mockResolvedValue({ id: 1, status: "dismissed" });
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useUpdateRiskLinkStatus(42), { wrapper });

    result.current.mutate({
      id: 1,
      status: "dismissed",
      dismissal: { dismissReason: "wrong_direction" },
    });

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(1, "dismissed", {
        dismissReason: "wrong_direction",
      }),
    );
  });

  it("sends no dismissal when the user skipped the reason", async () => {
    mockUpdate.mockResolvedValue({ id: 1, status: "dismissed" });
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useUpdateRiskLinkStatus(42), { wrapper });

    result.current.mutate({ id: 1, status: "dismissed" });

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(1, "dismissed", undefined));
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd Clients && npx vitest run src/application/hooks/__tests__/useRiskLinks.test.ts`
Expected: FAIL — the mutation is called with two arguments, and `dismissal` is not in the variables type.

- [ ] **Step 3: Widen the domain type**

In `Clients/src/domain/interfaces/i.riskLink.ts`, add above `RiskLinkReason`:

```ts
/** Mirrors `DismissReason` in Servers/services/riskLinks/dismissReason.ts. */
export type DismissReason =
  | "not_related"
  | "too_weak"
  | "duplicate"
  | "wrong_direction"
  | "wrong_parent"
  | "not_hierarchical"
  | "other";
```

and two fields to `RiskLink`, after `lastComputedAt`:

```ts
  /** Set only on a link dismissed from `suggested`, and only if the user said why. */
  dismissReason: DismissReason | null;
  dismissNote: string | null;
```

- [ ] **Step 4: Forward it from the repository and the hook**

`Clients/src/application/repository/riskLink.repository.ts` — add `DismissReason`
to the existing import from `i.riskLink`, then:

```ts
/** `dismissal` is only ever accepted on a link that is currently `suggested`. */
export async function updateRiskLinkStatus(
  id: number,
  status: RiskLinkStatus,
  dismissal?: { dismissReason: DismissReason; dismissNote?: string },
): Promise<{ id: number; status: RiskLinkStatus }> {
  try {
    const response = await apiServices.patch<{
      message: string;
      data: { id: number; status: RiskLinkStatus };
    }>(`/riskLinks/${id}`, { status, ...dismissal });
    return extractData<{ id: number; status: RiskLinkStatus }>(response);
  } catch (error: any) {
    throw toAPIError(error, "Failed to update the link");
  }
}
```

`Clients/src/application/hooks/useRiskLinks.ts` — add `DismissReason` to the
existing import from `i.riskLink`, then:

```ts
export function useUpdateRiskLinkStatus(riskId: number) {
  const invalidate = useInvalidateLinks(riskId);
  return useMutation({
    mutationFn: ({
      id,
      status,
      dismissal,
    }: {
      id: number;
      status: RiskLinkStatus;
      dismissal?: { dismissReason: DismissReason; dismissNote?: string };
    }) => updateRiskLinkStatus(id, status, dismissal),
    onSettled: invalidate,
  });
}
```

- [ ] **Step 5: Run the tests and the typechecker**

Run: `cd Clients && npx vitest run src/application/hooks/__tests__/useRiskLinks.test.ts && npm run typecheck`
Expected: PASS. `typecheck` will flag the panel test's `link()` factory as missing
the two new required fields — Task 6 fixes that. If you want a green typecheck at
this commit, add `dismissReason: null, dismissNote: null` to that factory now.

- [ ] **Step 6: Commit**

```bash
git add Clients/src/domain/interfaces/i.riskLink.ts Clients/src/application/repository/riskLink.repository.ts Clients/src/application/hooks/useRiskLinks.ts Clients/src/application/hooks/__tests__/useRiskLinks.test.ts Clients/src/presentation/components/LinkedRisksPanel/__tests__/LinkedRisksPanel.test.tsx
git commit -m "feat(risk-links): carry a dismissal reason through the client contract"
```

---

## Task 6: The form and the panel

**Files:**
- Create: `Clients/src/presentation/components/LinkedRisksPanel/DismissReasonForm.tsx`
- Modify: `Clients/src/presentation/components/LinkedRisksPanel/index.tsx`
- Test: `Clients/src/presentation/components/LinkedRisksPanel/__tests__/LinkedRisksPanel.test.tsx`

**Interfaces:**
- Consumes: `DismissReason`, `RiskLink` (Task 5); `useUpdateRiskLinkStatus` with the widened variables (Task 5)
- Produces: `DismissReasonForm` (default export) and `DISMISS_REASON_LABELS` (named)

- [ ] **Step 1: Write the failing tests**

First, the `link()` factory near the top of
`Clients/src/presentation/components/LinkedRisksPanel/__tests__/LinkedRisksPanel.test.tsx`
gains the two fields (if Task 5 Step 5 did not already add them):

```ts
  decidedAt: null,
  lastComputedAt: null,
  dismissReason: null,
  dismissNote: null,
```

Then add a new describe block at the end of the file:

```tsx
describe("LinkedRisksPanel dismissal reasons", () => {
  it("asks why before dismissing a suggestion", async () => {
    mockUseRiskLinks.mockReturnValue(queryResult([link({ status: "suggested" })]));
    render(
      <ThemeProvider theme={light}>
        <QueryClientProvider client={new QueryClient()}>
          <LinkedRisksPanel riskId={42} />
        </QueryClientProvider>
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    // The exact set, not just a sample. This file is the only thing standing
    // between a frontend typo and a radio button the server answers with 400 —
    // the two REASONS_BY_RELATION maps live in different packages and cannot
    // import each other, so a count plus the absent hierarchy labels is the
    // cheapest available drift guard.
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(screen.getByLabelText("These aren't actually related")).toBeInTheDocument();
    expect(screen.getByLabelText("Related, but not worth a link")).toBeInTheDocument();
    expect(screen.getByLabelText("Another link already covers this")).toBeInTheDocument();
    expect(screen.getByLabelText("Other")).toBeInTheDocument();
    expect(screen.queryByLabelText("The direction is backwards")).not.toBeInTheDocument();
    // Opening the form decides nothing.
    expect(mockMutateStatus).not.toHaveBeenCalled();
  });

  it("offers the hierarchy vocabulary on an inherits_from row", async () => {
    mockUseRiskLinks.mockReturnValue(
      queryResult([link({ status: "suggested", relationType: "inherits_from", direction: "outgoing" })]),
    );
    render(
      <ThemeProvider theme={light}>
        <QueryClientProvider client={new QueryClient()}>
          <LinkedRisksPanel riskId={42} />
        </QueryClientProvider>
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(screen.getByLabelText("The direction is backwards")).toBeInTheDocument();
    expect(screen.getByLabelText("Right that it's a child, wrong parent")).toBeInTheDocument();
    expect(screen.getByLabelText("Related, but not parent and child")).toBeInTheDocument();
    expect(screen.getByLabelText("Other")).toBeInTheDocument();
    expect(screen.queryByLabelText("These aren't actually related")).not.toBeInTheDocument();
  });

  it("sends the chosen reason", async () => {
    mockUseRiskLinks.mockReturnValue(queryResult([link({ id: 7, status: "suggested" })]));
    render(
      <ThemeProvider theme={light}>
        <QueryClientProvider client={new QueryClient()}>
          <LinkedRisksPanel riskId={42} />
        </QueryClientProvider>
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await userEvent.click(screen.getByLabelText("Related, but not worth a link"));
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(mockMutateStatus).toHaveBeenCalledWith(
      { id: 7, status: "dismissed", dismissal: { dismissReason: "too_weak" } },
      expect.anything(),
    );
  });

  it("lets the user skip the reason entirely", async () => {
    // The reason is optional by design: a required one just gets the first
    // radio clicked, and bad data is worse than no data.
    mockUseRiskLinks.mockReturnValue(queryResult([link({ id: 7, status: "suggested" })]));
    render(
      <ThemeProvider theme={light}>
        <QueryClientProvider client={new QueryClient()}>
          <LinkedRisksPanel riskId={42} />
        </QueryClientProvider>
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(mockMutateStatus).toHaveBeenCalledWith(
      { id: 7, status: "dismissed", dismissal: undefined },
      expect.anything(),
    );
  });

  it("requires a note before submitting `Other`", async () => {
    mockUseRiskLinks.mockReturnValue(queryResult([link({ id: 7, status: "suggested" })]));
    render(
      <ThemeProvider theme={light}>
        <QueryClientProvider client={new QueryClient()}>
          <LinkedRisksPanel riskId={42} />
        </QueryClientProvider>
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await userEvent.click(screen.getByLabelText("Other"));

    const submit = screen.getByRole("button", { name: "Dismiss" });
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText("What happened?"), "  covered by R-14  ");
    expect(submit).toBeEnabled();
    await userEvent.click(submit);

    expect(mockMutateStatus).toHaveBeenCalledWith(
      { id: 7, status: "dismissed", dismissal: { dismissReason: "other", dismissNote: "covered by R-14" } },
      expect.anything(),
    );
  });

  it("dismisses a confirmed link immediately, with no form (§3.1)", async () => {
    // Un-linking a pair you previously accepted is a content edit, not
    // feedback about a suggestion.
    mockUseRiskLinks.mockReturnValue(queryResult([link({ id: 7, status: "confirmed" })]));
    render(
      <ThemeProvider theme={light}>
        <QueryClientProvider client={new QueryClient()}>
          <LinkedRisksPanel riskId={42} />
        </QueryClientProvider>
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByLabelText("These aren't actually related")).not.toBeInTheDocument();
    expect(mockMutateStatus).toHaveBeenCalledWith(
      { id: 7, status: "dismissed" },
      expect.anything(),
    );
  });

  it("shows a stored reason in the dismissed view, and nothing when there is none", () => {
    mockUseRiskLinks.mockReturnValue(
      queryResult([
        link({ id: 1, status: "dismissed", dismissReason: "not_related",
               relatedRisk: { id: 9, name: "Model drift", riskLevel: null, ownerId: null } }),
        link({ id: 2, status: "dismissed", dismissReason: null,
               relatedRisk: { id: 10, name: "Data leak", riskLevel: null, ownerId: null } }),
      ]),
    );
    render(
      <ThemeProvider theme={light}>
        <QueryClientProvider client={new QueryClient()}>
          <LinkedRisksPanel riskId={42} />
        </QueryClientProvider>
      </ThemeProvider>,
    );

    expect(screen.getByText("These aren't actually related")).toBeInTheDocument();
    expect(screen.getAllByText("These aren't actually related")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd Clients && npx vitest run src/presentation/components/LinkedRisksPanel`
Expected: FAIL — clicking Dismiss calls the mutation straight away and no radio group appears.

- [ ] **Step 3: Write the form**

Create `Clients/src/presentation/components/LinkedRisksPanel/DismissReasonForm.tsx`:

```tsx
import { useState } from "react";
import { Button, FormControlLabel, Radio, RadioGroup, Stack, TextField } from "@mui/material";
import { DismissReason, RiskLink } from "../../../domain/interfaces/i.riskLink";

/**
 * The wording is fixed by the C3 spec (§4) and is also what the "Show
 * dismissed" view renders, so it lives in one exported map rather than inline
 * in the radio list.
 */
export const DISMISS_REASON_LABELS: Record<DismissReason, string> = {
  not_related: "These aren't actually related",
  too_weak: "Related, but not worth a link",
  duplicate: "Another link already covers this",
  wrong_direction: "The direction is backwards",
  wrong_parent: "Right that it's a child, wrong parent",
  not_hierarchical: "Related, but not parent and child",
  other: "Other",
};

/**
 * Mirrors DISMISS_REASONS_BY_RELATION in
 * Servers/services/riskLinks/dismissReason.ts. The server 400s on a reason
 * offered for the wrong relation type, so these two lists must not drift.
 */
const REASONS_BY_RELATION: Record<RiskLink["relationType"], DismissReason[]> = {
  related_to: ["not_related", "too_weak", "duplicate", "other"],
  inherits_from: ["wrong_direction", "wrong_parent", "not_hierarchical", "other"],
};

const NOTE_MAX_LENGTH = 500;

interface DismissReasonFormProps {
  link: RiskLink;
  pending: boolean;
  /** `dismissal` is undefined when the user chose to say nothing. */
  onSubmit: (dismissal?: { dismissReason: DismissReason; dismissNote?: string }) => void;
  onCancel: () => void;
}

export default function DismissReasonForm({
  link,
  pending,
  onSubmit,
  onCancel,
}: DismissReasonFormProps) {
  // No default selection. That is what makes the reason optional without
  // spending a control on "prefer not to say": pressing Dismiss with nothing
  // chosen IS the skip path, and no reason is ever recorded by accident.
  const [reason, setReason] = useState<DismissReason | "">("");
  const [note, setNote] = useState("");

  const noteMissing = reason === "other" && note.trim() === "";

  const handleSubmit = () => {
    if (reason === "") return onSubmit();
    const trimmed = note.trim();
    onSubmit({ dismissReason: reason, ...(trimmed ? { dismissNote: trimmed } : {}) });
  };

  return (
    <Stack spacing={1} sx={{ pl: 2, py: 1 }}>
      {/*
        Named after the risk: several of these can be on screen at once in a
        long list, and "Other" alone is not a distinguishable label.
      */}
      <RadioGroup
        aria-label={`Why are you dismissing ${link.relatedRisk.name ?? `risk ${link.relatedRisk.id}`}?`}
        value={reason}
        onChange={(event) => setReason(event.target.value as DismissReason)}
      >
        {REASONS_BY_RELATION[link.relationType].map((value) => (
          <FormControlLabel
            key={value}
            value={value}
            control={<Radio size="small" />}
            label={DISMISS_REASON_LABELS[value]}
          />
        ))}
      </RadioGroup>

      {reason === "other" && (
        <TextField
          label="What happened?"
          size="small"
          multiline
          minRows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          inputProps={{ maxLength: NOTE_MAX_LENGTH }}
        />
      )}

      <Stack direction="row" spacing={1}>
        <Button
          size="small"
          variant="contained"
          disabled={pending || noteMissing}
          onClick={handleSubmit}
        >
          Dismiss
        </Button>
        <Button size="small" onClick={onCancel}>
          Cancel
        </Button>
      </Stack>
    </Stack>
  );
}
```

- [ ] **Step 4: Wire the panel**

In `Clients/src/presentation/components/LinkedRisksPanel/index.tsx`:

Add to the imports:

```tsx
import { DismissReason, RiskLink, RiskLinkStatus } from "../../../domain/interfaces/i.riskLink";
import LinkRiskForm from "./LinkRiskForm";
import DismissReasonForm, { DISMISS_REASON_LABELS } from "./DismissReasonForm";
```

Add the state beside `showForm`:

```tsx
  const [dismissing, setDismissing] = useState<RiskLink | null>(null);
```

Replace `handleAction` (lines 72-85) with the three pieces below. The shared
error handler is extracted because there are now two call sites:

```tsx
  const onMutationError = (error: any) =>
    setNotice(
      error?.status === 404
        ? "One of these risks no longer exists"
        : error?.message || "Failed to update the link",
    );

  const handleAction = (link: RiskLink, next: RiskLinkStatus) => {
    setNotice(null);
    // Dismissing a SUGGESTION is feedback about the engine, so ask why first.
    // Dismissing a CONFIRMED link is a human un-linking a pair they already
    // accepted — a content edit, no reason, no form. See C3 §3.1.
    if (next === "dismissed" && link.status === "suggested") {
      setDismissing(link);
      return;
    }
    setDismissing(null);
    updateStatus.mutate({ id: link.id, status: next }, { onError: onMutationError });
  };

  const submitDismissal = (
    link: RiskLink,
    dismissal?: { dismissReason: DismissReason; dismissNote?: string },
  ) => {
    setNotice(null);
    setDismissing(null);
    updateStatus.mutate(
      { id: link.id, status: "dismissed", dismissal },
      { onError: onMutationError },
    );
  };
```

In the row renderer, the row must be able to carry a form beneath it, so the
`key` moves from the row `Stack` to a wrapping `Box`. Replace the body of
`group.map((link) => ...)` with:

```tsx
              {group.map((link) => (
                <Box key={link.id}>
                  <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                    <Typography variant="body2" sx={{ flexGrow: 1 }}>
                      {link.relatedRisk.name ?? `Risk ${link.relatedRisk.id}`}
                    </Typography>
                    {link.relatedRisk.riskLevel && (
                      <Chip size="small" label={link.relatedRisk.riskLevel} />
                    )}
                    {link.reasons.map((reason, index) => (
                      <Chip key={index} size="small" variant="outlined" label={reasonLabel(reason)} />
                    ))}
                    {/*
                      Only in the dismissed view, since it is null everywhere
                      else. The note rides along as the tooltip rather than
                      stretching the row.
                    */}
                    {link.dismissReason && (
                      <Chip
                        size="small"
                        variant="outlined"
                        label={DISMISS_REASON_LABELS[link.dismissReason]}
                        title={link.dismissNote ?? undefined}
                      />
                    )}
                    {/*
                      score is 0 by column default on a user link and on an agent
                      link, and means nothing on either. Only the scoring engine
                      produces a number worth showing.
                    */}
                    {link.source === "derived" && (
                      <Typography variant="caption">{link.score}</Typography>
                    )}
                    {/*
                      Hidden while this row's reason form is open. Two live
                      "Dismiss" buttons for one link is ambiguous on screen and
                      ambiguous to a test — the form owns the decision until
                      it is submitted or cancelled.
                    */}
                    {dismissing?.id !== link.id &&
                      actionsFor(link).map(({ label, next }) => (
                        <Button
                          key={label}
                          size="small"
                          disabled={updateStatus.isPending}
                          onClick={() => handleAction(link, next)}
                        >
                          {label}
                        </Button>
                      ))}
                  </Stack>

                  {dismissing?.id === link.id && (
                    <DismissReasonForm
                      link={link}
                      pending={updateStatus.isPending}
                      onSubmit={(dismissal) => submitDismissal(link, dismissal)}
                      onCancel={() => setDismissing(null)}
                    />
                  )}
                </Box>
              ))}
```

- [ ] **Step 5: Run the tests and the typechecker**

Run: `cd Clients && npx vitest run src/presentation/components/LinkedRisksPanel && npm run typecheck`
Expected: PASS, clean typecheck.

- [ ] **Step 6: Commit**

```bash
git add Clients/src/presentation/components/LinkedRisksPanel
git commit -m "feat(risk-links): ask why when a suggested link is dismissed"
```

---

## Task 7: The report

The feature is pointless until someone can read the answer.

**Files:**
- Modify: `docs/technical/domains/risk-link-precision.sql`, `docs/technical/domains/risk-management.md`

- [ ] **Step 1: Add query 6**

Append to `docs/technical/domains/risk-link-precision.sql`:

```sql
-- 6. Why people throw suggestions away.
--
-- Reasons are OPTIONAL, so read the `(none given)` row FIRST: a breakdown
-- sitting under 20% coverage is an anecdote, not a measurement. It is in the
-- same result set for exactly that reason — a reader who sees the breakdown
-- sees how much of it is silence.
--
-- Only a dismissal FROM `suggested` carries a reason. Un-linking a pair
-- somebody previously confirmed is a content edit, not feedback about the
-- engine, and deliberately records nothing. `source <> 'user'` is
-- belt-and-braces: a hand-made link lands `confirmed`, so it can only ever be
-- dismissed from `confirmed`.
SELECT
  l.relation_type,
  coalesce(l.dismiss_reason, '(none given)')                       AS dismiss_reason,
  count(*)                                                         AS dismissals,
  round(100.0 * count(*)
        / sum(count(*)) OVER (PARTITION BY l.relation_type), 1)    AS pct_of_type
FROM risk_links l
WHERE l.status = 'dismissed'
  AND l.source <> 'user'
GROUP BY l.relation_type, l.dismiss_reason
ORDER BY l.relation_type, dismissals DESC;
```

- [ ] **Step 2: Cross-reference it from query 5**

Add to the comment block above query 5 in the same file:

```sql
-- Query 6's `wrong_direction` now measures this directly. Keep both: this one
-- finds backwards arrows the user silently fixed by hand without labelling the
-- dismissal, which is every dismissal made before C3 shipped and every one
-- since where the reason was skipped.
```

- [ ] **Step 3: Update the domain doc**

In `docs/technical/domains/risk-management.md`, bump `**Last Updated:**` to
`2026-08-30` and extend the existing precision-SQL paragraph:

```markdown
Dismissing a *suggested* link also captures an optional structured reason
(`dismiss_reason`, plus a note for `other`), which query 6 breaks down by
relation type. Dismissing a *confirmed* link records nothing on purpose: that
is a human un-linking a pair they already accepted, not feedback about a
suggestion, and mixing the two would skew every rate in the file.
```

- [ ] **Step 4: Run the file against a database**

Run: `psql -d verifywise -f docs/technical/domains/risk-link-precision.sql`
Expected: six result sets, no errors. Zero rows is fine on an empty instance.

- [ ] **Step 5: Prove query 6 actually computes the right percentages**

Step 4 only proves the SQL parses. Query 6 is the one with real logic — a window
function partitioned inside a `GROUP BY` — and on an empty instance a wrong
`PARTITION BY` returns zero rows just as happily as a right one. Run it against
a fixture instead. A `TEMP` table named `risk_links` shadows the real one for
the duration of the transaction, so this touches no data:

```sql
BEGIN;
CREATE TEMP TABLE risk_links (
  relation_type  text,
  status         text,
  source         text,
  dismiss_reason text
) ON COMMIT DROP;

INSERT INTO risk_links (relation_type, status, source, dismiss_reason) VALUES
  ('related_to',    'dismissed', 'derived', 'not_related'),
  ('related_to',    'dismissed', 'derived', 'not_related'),
  ('related_to',    'dismissed', 'derived', 'too_weak'),
  ('related_to',    'dismissed', 'derived', NULL),
  ('related_to',    'confirmed', 'derived', NULL),          -- not a dismissal
  ('related_to',    'dismissed', 'user',    'not_related'), -- hand-made, excluded
  ('inherits_from', 'dismissed', 'agent',   'wrong_direction'),
  ('inherits_from', 'dismissed', 'agent',   NULL);

-- paste query 6 here, verbatim
COMMIT;
```

Expected, exactly:

```
 relation_type | dismiss_reason  | dismissals | pct_of_type
---------------+-----------------+------------+-------------
 inherits_from | wrong_direction |          1 |        50.0
 inherits_from | (none given)    |          1 |        50.0
 related_to    | not_related     |          2 |        50.0
 related_to    | too_weak        |          1 |        25.0
 related_to    | (none given)    |          1 |        25.0
```

Three things this pins, each of which a plausible mistake breaks: `pct_of_type`
sums to 100 *within* each relation type (a missing `PARTITION BY` gives 20/20/40/20/20
across the whole result), `(none given)` appears as its own bucket rather than
vanishing, and the `confirmed` row and the `source = 'user'` row are both absent.

- [ ] **Step 6: Commit**

```bash
git add docs/technical/domains/risk-link-precision.sql docs/technical/domains/risk-management.md
git commit -m "docs(risk-links): report dismissals by reason"
```

---

## Final verification

- [ ] `cd Servers && npm run build` — clean
- [ ] `cd Servers && npm run test` — green
- [ ] `cd Servers && npm run test:integration` — green
- [ ] `cd Clients && npm run typecheck` — clean (`npm run build` does NOT run `tsc`, so this is not optional)
- [ ] `cd Clients && npx vitest run` — green
- [ ] `cd Servers && npm run check:api-drift` — unchanged from before this branch. **Do not** run `generate:swagger`; this plan adds no route.
- [ ] `git log --oneline` shows seven commits, one per task
- [ ] Manual: open a risk with a suggested link, press Dismiss, see the three
      reasons plus Other; press Dismiss again without choosing and confirm it
      dismisses; then "Show dismissed" and confirm no reason chip appears on it
- [ ] **Do not push, do not open a pull request, do not merge, do not rebase or reset.** The branch stays local.

## Self-review

Checked against `docs/superpowers/specs/2026-08-30-risk-links-c3-dismissal-reason-design.md`:

| Spec section | Task |
|---|---|
| §3.1 only `suggested -> dismissed` | Task 1 (`not_a_suggestion`), Task 3 (400 case), Task 6 (no form on confirmed) |
| §3.2 optional | Task 1 (nulls accepted), Task 6 (no default selection, skip test) |
| §3.3 filtered by relation type | Task 1 (`DISMISS_REASONS_BY_RELATION`), Task 6 (`REASONS_BY_RELATION`) |
| §3.4 no CHECK | Task 2 migration |
| §3.5 clearing rule | Task 1 (nulls), Task 2 (always written, required params), Task 4 (round-trip proof) |
| §3.6 pure validator | Task 1 |
| §4 vocabulary | Task 1 (slugs), Task 6 (`DISMISS_REASON_LABELS`) |
| §5 data | Task 2 |
| §6.1 request | Task 3, Task 5 |
| §6.2 V1–V8 | Task 1, one test each |
| §6.3 clearing falls out | Task 1 return shape, Task 2 required params |
| §6.4 echo | Task 3 (`toResponse`), Task 5 (types), Task 6 (chip) |
| §7 UI | Task 6 |
| §8 reporting | Task 7 |
| §10 testing | Tasks 1, 3, 4, 5, 6 |

Type consistency: `DismissReason` is defined once on each side (`Servers/services/riskLinks/dismissReason.ts`, `Clients/src/domain/interfaces/i.riskLink.ts`) and imported everywhere else. `validateDismissReason` keeps the same three-argument signature in Task 1 and Task 3. `updateRiskLinkStatusQuery` takes six arguments from Task 2 onward, and Task 2 Step 6's temporary `null, null` is replaced in Task 3 Step 3 — the only intentionally short-lived line in the plan.
