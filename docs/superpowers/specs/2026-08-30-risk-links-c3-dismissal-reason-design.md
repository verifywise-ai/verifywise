# Risk links C3 — dismissal reasons

> **Status:** Approved design, ready for implementation plan
> **Date:** 2026-08-30
> **Scope:** Capture a structured reason when a suggested link is dismissed, and report on it. One migration, one pure validator, one PATCH body field, one inline form, one SQL query.
> **Builds on:** `2026-08-12-risk-links-a1-design.md` (link store), `2026-08-13-risk-links-b-design.md` (linked risks panel), `2026-08-27-risk-links-c1-two-level-grouping-design.md` (two-level rule), `2026-08-29-risk-links-c2-direction-agent-design.md` (direction agent)

---

## 1. Summary

Dismissing a suggestion records **who** (`decided_by_user_id`) and **when**
(`decided_at`). It never records **why**.

That gap is the ceiling on `docs/technical/domains/risk-link-precision.sql`.
Query 1 can tell you `shared_project` is confirmed 22% of the time. It cannot
tell you whether the signal is *wrong* (those risks are unrelated) or merely
*weak* (they are related, but not worth a link). Those two readings lead to
opposite fixes: delete the provider, or lower its weight. Today you guess.

C3 adds one optional structured reason at the moment of dismissal, chosen from
a short fixed list that depends on the relation type, plus an optional note.
Nothing else changes: the same button, the same endpoint, the same row.

**The one-sentence version:** a dismissal becomes a labelled data point instead
of a silent deletion.

---

## 2. Where this sits

```
A1  risk_links store + recompute        (shipped)
A2  structural graph provider           (shipped)
B   linked risks panel                  (shipped)
C1  two-level grouping rule             (shipped)
C2  direction agent                     (shipped)
C3  dismissal reasons                   <- this doc
C4  value-chain inheritance             (not started, separate spec)
```

The consumer is `docs/technical/domains/risk-link-precision.sql`, which gains
one query. There is no new endpoint, no new page, and no dashboard.

### Out of scope for C3 (explicit — do NOT build)

- **A reason on `confirmed -> dismissed`.** See §3.1. This is the decision most
  likely to be "improved" by a well-meaning implementer. Do not.
- **A reason on confirm.** Nobody explains a yes, and an optional field nobody
  fills is a column that lies.
- **Editing a reason after the fact.** Undo (`dismissed -> suggested`) and
  dismiss again. That is the edit path, and it already exists.
- **Free-text-only reasons.** The value of this feature is that it is
  aggregatable. `other` exists as the escape hatch and carries a note.
- **A reporting endpoint, dashboard widget, or admin screen.** The SQL file is
  the report. Build a UI when someone asks twice.
- **Per-organisation customisation of the reason list.** Seven values, hard
  coded.
- **Backfilling reasons for dismissals that already happened.** Not knowable.
- **A CHECK constraint on the new column.** See §3.4.

---

## 3. Decisions and rationale

### 3.1 Only `suggested -> dismissed` carries a reason

`ALLOWED_TRANSITIONS` in `Servers/controllers/riskLinks.ctrl.ts:43` permits
two different dismissals:

| Transition | What actually happened |
|---|---|
| `suggested -> dismissed` | A human looked at a machine's proposal and rejected it. **Feedback about the engine.** |
| `confirmed -> dismissed` | A human un-linked a pair they previously accepted, possibly months later, possibly because the risks themselves were edited. **A normal content edit.** |

If both wrote to the same column, the per-signal rates in query 1 would drift
downward for reasons that have nothing to do with signal quality — and the
table stores no transition history, so nothing could separate them afterwards.
The corruption would be silent and permanent.

So the reason is accepted **only when the row's current status is
`suggested`**. The panel simply does not offer the form on a confirmed row;
the server rejects a reason sent for one anyway, because the panel is not a
trust boundary.

### 3.2 Optional, never required

A required reason gets the first radio button clicked. Bad data is worse than
no data — it is indistinguishable from good data in a `GROUP BY`.

Dismissing with nothing selected stays a one-decision action, and query 6
prints the coverage rate so a reader knows what fraction of dismissals the
breakdown speaks for.

### 3.3 Filtered by relation type

A `related_to` dismissal and an `inherits_from` dismissal fail in different
ways. "The direction is backwards" is meaningless for an undirected edge;
"another link already covers this" is a deduplication bug, not a hierarchy
bug. One column and one shared enum, but each relation type offers only its
own three values plus `other`.

### 3.4 No CHECK constraint on the new column

`relation_type VARCHAR(30) NOT NULL` and `status VARCHAR(20) NOT NULL` have no
CHECK constraints on this table; the enums live in
`Servers/services/riskLinks/types.ts` and are enforced in the controller.
`dismiss_reason` follows that convention. Consistency beats belt-and-braces,
and a CHECK would make adding a value a migration instead of a one-line edit.

`dismiss_note VARCHAR(500)` **does** carry its width, because a length is not
a vocabulary — it is a storage bound, and the app cap and column width are the
same number. The app validates first, so the column is a backstop that can
never fire: JavaScript `.length` counts UTF-16 code units and Postgres counts
characters, so a string of 500 JS units is at most 500 Postgres characters.

### 3.5 Leaving `dismissed` clears both columns

`dismissed -> confirmed` and `dismissed -> suggested` must set
`dismiss_reason = NULL` and `dismiss_note = NULL`.

A confirmed row carrying a stale "these aren't actually related" would poison
the exact report this feature exists to feed. §6.3 makes this fall out of the
design rather than requiring a special case.

### 3.6 The validator is a pure function in its own module

Same reason `hierarchy.ts` is: the rule is the part worth testing, and it
should be testable without a request, a database, or a mock. The module
returns a rejection *code*; the controller owns the user-facing wording, the
way `HierarchyViolation` and `HIERARCHY_MESSAGES` already split.

---

## 4. The vocabulary

Seven stored values. These strings appear nowhere in the codebase today —
there is no existing reference to match, so they are defined here and nowhere
else.

**`related_to` dismissals:**

| Stored value | UI label | What it tells us |
|---|---|---|
| `not_related` | These aren't actually related | The signal is wrong. Lower its weight or drop the provider. |
| `too_weak` | Related, but not worth a link | The signal is right, the bar is too low. Raise `LINK_SCORE_THRESHOLD`. |
| `duplicate` | Another link already covers this | Deduplication bug, not a scoring bug. |
| `other` | Other | Requires a note. |

**`inherits_from` dismissals:**

| Stored value | UI label | What it tells us |
|---|---|---|
| `wrong_direction` | The direction is backwards | The pair is right, the arrow is not. Fix the direction agent's prompt. |
| `wrong_parent` | Right that it's a child, wrong parent | The grouping step picked the wrong root. |
| `not_hierarchical` | Related, but not parent and child | The agent is over-eager: it should have left the pair `related_to`. |
| `other` | Other | Requires a note. |

`wrong_direction` is the one that pays for the feature on its own: query 5 in
`risk-link-precision.sql` currently *infers* a backwards arrow from a dismissal
followed by a confirmed mirror edge, which only finds the cases where someone
bothered to create the correct link afterwards. `wrong_direction` measures it
directly.

---

## 5. Data

One migration, `Servers/database/migrations/20260830120000-risk-links-dismiss-reason.js`,
adding two nullable columns to `verifywise.risk_links`:

```sql
ALTER TABLE verifywise.risk_links
  ADD COLUMN IF NOT EXISTS dismiss_reason VARCHAR(20),
  ADD COLUMN IF NOT EXISTS dismiss_note   VARCHAR(500);
```

Both nullable with no default: NULL means "dismissed without saying why", and
that is a legitimate, expected state (§3.2), not missing data.

`down` drops both columns. Unlike the C1 migration there is nothing to
preserve — the columns did not exist before, so nothing is lost that was not
gained by this migration.

No index. The reporting query is a hand-run aggregate over a table that holds
thousands of rows, not millions; a seq scan is the correct plan and an index
would be write cost for no read.

`RiskLinkRow` in `Servers/services/riskLinks/types.ts` gains
`dismiss_reason: DismissReason | null` and `dismiss_note: string | null`.

---

## 6. API

### 6.1 Request

`PATCH /api/riskLinks/:id` body grows two optional fields:

```jsonc
{
  "status": "dismissed",
  "dismissReason": "wrong_direction",  // optional
  "dismissNote": "B is clearly the parent here"  // optional; required when reason is "other"
}
```

`{ "status": "dismissed" }` alone remains valid and is the common case.

Swagger needs no edit: `Servers/scripts/checkApiDrift.ts` compares path,
method, and `security.bearerAuth` only, and the `patch` entry for
`/riskLinks/{id}` (swagger.yaml:10123) documents no request body today.

### 6.2 Validation

At the trust boundary, in order. Every failure is
`res.status(400).json(STATUS_CODE[400](message))`, matching the existing
handler.

| # | Rejection code | Condition | Message |
|---|---|---|---|
| V1 | `note_without_reason` | `dismissNote` present, `dismissReason` absent | `A note needs a dismissal reason` |
| V2 | `not_a_dismissal` | reason present, `status !== "dismissed"` | `A dismissal reason only applies when dismissing a link` |
| V3 | `not_a_suggestion` | reason present, row's **current** status is not `suggested` | `A dismissal reason only applies to a suggested link` |
| V4 | `unknown_reason` | reason is not one of the seven values (or not a string) | `Invalid dismissal reason` |
| V5 | `wrong_relation_type` | reason is valid but not offered for this row's `relation_type` | `That dismissal reason does not apply to this kind of link` |
| V6 | `note_required` | reason is `other` and the note is absent, not a string, or empty after `trim()` | `A note is required when the dismissal reason is Other` |
| V7 | `note_too_long` | note is longer than 500 characters after `trim()` | `The note must be 500 characters or fewer` |

The order is part of the contract so the tests are deterministic. V1 runs
first because a note with no reason is a client bug worth naming precisely
rather than swallowing.

A note alongside a non-`other` reason is **allowed** — extra detail on
`wrong_parent` is welcome. It is stored trimmed.

Validation runs **after** the existing transition guard, so
`confirmed -> confirmed` is still the 400 it already is rather than a confusing
reason error.

### 6.3 The clearing rule falls out

The validator returns the pair to store:

```ts
type DismissReasonResult =
  | { ok: true; reason: DismissReason | null; note: string | null }
  | { ok: false; rejection: DismissReasonRejection };
```

When no reason was supplied — which V2 guarantees for every transition to
`confirmed` or `suggested` — it returns `{ ok: true, reason: null, note: null }`.
The controller passes that pair straight to the query, and the query always
writes both columns. So §3.5 needs no branch: leaving `dismissed` writes NULL
because there is nothing else it could write.

`updateRiskLinkStatusQuery` therefore takes both as **required** parameters,
not defaults. There is exactly one production caller, and a required parameter
is what stops a future second caller from silently skipping the clear.

### 6.4 Response

Unchanged: `200` with `{ id, status }`. The panel refetches, so echoing the
reason back would be dead weight.

The list endpoint's `toResponse` gains `dismissReason` and `dismissNote`, and
the "Show dismissed" view renders them (§7). This is not a spare field for
later: it is what stops `dismiss_reason` from becoming a write-only column
that only psql can see, and it makes §3.5 self-policing — a stale reason
surviving onto a confirmed row would appear in the UI instead of quietly
skewing a report nobody runs weekly.

`SELECT l.*` already returns the new columns, so only the `toLinkRow` mapper
(`Servers/utils/riskLink.utils.ts:35`) and `RiskLinkRow` need the two fields.

---

## 7. UI

`Clients/src/presentation/components/LinkedRisksPanel/DismissReasonForm.tsx`,
a sibling of `LinkRiskForm.tsx` and built the same way: an inline MUI
`RadioGroup`, not a modal. The panel has no modals and should not gain one for
this.

**Flow:**

1. `Dismiss` on a **suggested** row opens the form directly beneath that row
   instead of dismissing immediately. The panel tracks one open form:
   `const [dismissing, setDismissing] = useState<RiskLink | null>(null)`.
2. `Dismiss` on a **confirmed** row dismisses immediately with no form (§3.1).
3. The form shows the four options for `dismissing.relationType`, from §4,
   **with no default selection** — so the skip path is "press Dismiss without
   choosing", which costs no extra control.
4. Choosing `Other` reveals a required multiline `TextField`, `inputProps={{
   maxLength: 500 }}`. While `Other` is selected and the field is blank, the
   submit button is disabled.
5. Buttons: `Dismiss` and `Cancel`. `Cancel` closes the form and changes
   nothing.
6. On success the form closes. On error the panel's existing `notice` Alert
   shows the message, matching `handleAction`.

Only one form is open at a time — opening a second replaces the first, the same
way `showForm` behaves for `LinkRiskForm`.

**Displaying a stored reason.** In the "Show dismissed" view, a row whose
`dismissReason` is set renders one extra `Chip` carrying the §4 label for that
value, placed after the existing signal chips. When `dismissNote` is set it
becomes the chip's `title`, so the note is available on hover without
stretching the row. A row with no reason renders no chip — silence is a
legitimate state, not an empty badge.

**Labels are English**, as everywhere else in this panel. The list in §4 is
verbatim; do not paraphrase.

**Accessibility:** the `RadioGroup` gets an `aria-label` naming the risk being
dismissed, because three radio groups may be visible at once in a long list
and "Other" alone is not a distinguishable label. The revealed note field is
a labelled `TextField`, not a bare input.

---

## 8. Reporting

`docs/technical/domains/risk-link-precision.sql` gains **query 6**, plus a
sentence on query 5 noting that `wrong_direction` now measures directly what
query 5 infers.

```sql
-- 6. Why people throw suggestions away.
--
-- Reasons are OPTIONAL, so read `coverage` first: a breakdown over 12% of
-- dismissals is an anecdote. `source <> 'user'` is belt-and-braces — a
-- hand-made link lands `confirmed`, so it can only ever be dismissed from
-- `confirmed`, which carries no reason by design.
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

The `(none given)` bucket is deliberately inside the same result rather than a
separate coverage query: a reader who sees the breakdown sees, in the same
table, how much of it is silence.

`docs/technical/domains/risk-management.md` gains two sentences under the
existing precision-SQL paragraph.

---

## 9. Known and accepted

- **Dismissing a suggestion now takes two clicks.** Dismiss, then Dismiss. That
  is the cost of making the reason discoverable, and it is bounded: confirmed
  rows are unaffected, and the second click needs no selection.
- **Nothing measures how often people skip the reason until it ships.** If
  coverage turns out to be under ~20%, the honest response is to delete the
  feature, not to make the field required (§3.2).
- **A user who dismisses, undoes, and re-dismisses overwrites their first
  reason.** Correct — the row holds one current decision, not a log.
- **`confirmed -> dismissed` stays unlabelled**, so the report cannot
  distinguish "we un-linked this" from "we never linked it". Accepted: that
  distinction is `status` plus `decided_at`, and mixing it into
  `dismiss_reason` is the failure §3.1 exists to prevent.
- **Seven values will be wrong for somebody.** `other` plus a note is the
  release valve, and reading the `other` notes is how the list gets its next
  revision.

---

## 10. Testing

**Unit — `Servers/services/riskLinks/tests/dismissReason.spec.ts`** (pure, no
mocks). One case per rejection code V1–V7, plus:

- no reason, no note, any transition -> `{ ok: true, reason: null, note: null }`
- `not_related` on a `related_to` row -> accepted
- `not_related` on an `inherits_from` row -> `wrong_relation_type`
- `other` with `"   "` -> `note_required` (blank-after-trim, not just empty)
- `other` with a note -> accepted, note stored **trimmed**
- a note exactly 500 characters -> accepted; 501 -> `note_too_long`
- a 500-character note padded with spaces to 520 -> accepted (cap applies after
  trim)
- `dismissReason: 42` -> `unknown_reason` (non-string, not a crash)

**Controller — `Servers/controllers/__tests__/riskLinks.ctrl.test.ts`**
(extend). The existing three
`expect(mockUtils.updateRiskLinkStatusQuery).toHaveBeenCalledWith(...)`
assertions gain `, null, null`. New cases:

- dismissing a suggested `inherits_from` row with `wrong_direction` passes
  `("wrong_direction", null)` through to the query
- dismissing a **confirmed** row with a reason -> 400, query not called
- confirming a dismissed row -> query called with `(..., "confirmed", 5, null, null)`

**The regression test that matters** — a clearing bug that only fails on the
second dismissal is exactly what a single-transition test misses. Integration,
in `Servers/tests/integration/riskLinks.hierarchy.test.ts` or a sibling:

> dismiss with `not_related` -> undo to `suggested` -> dismiss again with **no**
> reason -> assert `dismiss_reason IS NULL`.

**Frontend — `Clients/src/presentation/components/LinkedRisksPanel/__tests__/`**:

- Dismiss on a suggested row renders the radio group and does *not* call the
  mutation yet
- Dismiss on a confirmed row calls the mutation immediately, no radio group
- an `inherits_from` row shows the hierarchy labels, a `related_to` row the
  relation labels
- submitting with nothing selected sends `status` only
- selecting `Other` disables submit until the note is non-blank
- a dismissed row carrying `dismissReason: "not_related"` renders the chip
  `These aren't actually related`; a dismissed row with a null reason renders
  no such chip

Run: `cd Servers && npm run test` and `npm run test:integration` (the unit run
excludes `tests/integration/`); `cd Clients && npx vitest run` and
`npm run typecheck` (the frontend `build` does not run `tsc`).

---

## 11. Files

**Create**

| Path | Responsibility |
|---|---|
| `Servers/database/migrations/20260830120000-risk-links-dismiss-reason.js` | Two nullable columns |
| `Servers/services/riskLinks/dismissReason.ts` | The vocabulary map, the note cap, and the pure validator |
| `Servers/services/riskLinks/tests/dismissReason.spec.ts` | Its tests |
| `Clients/src/presentation/components/LinkedRisksPanel/DismissReasonForm.tsx` | The inline radio form |

**Modify**

| Path | Change |
|---|---|
| `Servers/services/riskLinks/types.ts` | `RiskLinkRow` gains the two columns |
| `Servers/utils/riskLink.utils.ts:35` | `toLinkRow` maps the two new columns |
| `Servers/utils/riskLink.utils.ts:652` | `updateRiskLinkStatusQuery` takes and writes both, required |
| `Servers/controllers/riskLinks.ctrl.ts:60` | `toResponse` echoes `dismissReason` / `dismissNote` |
| `Servers/controllers/riskLinks.ctrl.ts:228` | Validate, map rejection to message, pass through |
| `Servers/controllers/__tests__/riskLinks.ctrl.test.ts` | Three assertions gain `, null, null`; new cases |
| `Clients/src/domain/interfaces/i.riskLink.ts` | `DismissReason` type; `RiskLink` gains the two fields |
| `Clients/src/application/repository/riskLink.repository.ts` | `updateRiskLinkStatus` forwards them |
| `Clients/src/application/hooks/useRiskLinks.ts` | `useUpdateRiskLinkStatus` mutation variables grow |
| `Clients/src/presentation/components/LinkedRisksPanel/index.tsx` | `dismissing` state; Dismiss opens the form on suggested rows only |
| `docs/technical/domains/risk-link-precision.sql` | Query 6; a note on query 5 |
| `docs/technical/domains/risk-management.md` | Two sentences; `Last Updated` |

**Untouched:** `Servers/swagger.yaml` (§6.1), `Servers/routes/riskLinks.route.ts`
(no new route), `recompute.ts` and the direction agent (they write links, they
never dismiss them).
