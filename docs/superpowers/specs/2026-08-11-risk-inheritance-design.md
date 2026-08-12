# Risk inheritance (risk → risk) — design spec

> **Status:** Approved design, ready for implementation plan
> **Date:** 2026-08-11
> **Scope:** Risk Management page only, phase 1

---

## 1. Summary

When a user adds or edits a project risk, VerifyWise shows a short summary of **other risks that may be affected by that change**, each with the reason it matched and a recommendation of what to look at.

The relation between two risks is **derived**, not stored: two risks are related when they overlap on category, lifecycle phase, mapped control, mapped assessment question, or project. Nothing is written to sibling risks — this is a read-only surfacing feature.

**Lean by design:** no migration, no new table, no new endpoint, no LLM. One pure function in the client plus one summary modal, both built on data the Risk Management page already holds in memory.

---

## 2. Scope

### In scope (phase 1)

- A pure scoring function that, given the saved risk and the org's risk list, returns the top 5 related risks with match reasons and a recommendation line.
- A post-save summary modal on the Risk Management page, shown after a successful create or update when the result is non-empty.
- Navigation from a summary row to that risk's existing edit modal.
- Unit tests for the scoring function.

### Out of scope (explicit — do NOT build now)

- **Propagation.** No automatic update of severity, likelihood, mitigation status, or any other field on the related risks. The feature only shows; the user decides.
- **User-authored links.** No junction table, no "linked risks" picker in the risk form.
- **LLM-generated recommendations.** Template sentences only.
- MIT / IBM risk database as a recommendation source.
- Vendor risks and model risks — project risks only.
- Notifications, emails, tasks, or approval workflow triggered by the summary.
- Surfacing related risks anywhere other than the Risk Management page (ProjectView risks tab, dashboards, reports).

---

## 3. Decisions and rationale

| Decision | Choice | Why |
|---|---|---|
| Relation source | **Derived**, computed on the fly | Works on day one against existing data. A user-authored link table would be empty until users do the work, so the feature would show nothing for weeks. |
| Where shown | **Post-save summary only** | Matches the request ("when a risk is changed or added, show the others"). A permanent panel in the risk form does not create the nudge; it just sits there. |
| Match rule | **Weighted score, top 5** | A plain category match returns everything in a busy category. A strict AND rule returns nothing most of the time. Top-5-by-score needs no threshold tuning and the signals have to be computed anyway to render the reason badges. |
| Cross-project | **Allowed, weak signal** | The Risk Management page is already org-wide. A shared project adds score but is not required, so cross-project dependencies that share a control still surface — ranked below same-project matches. |
| Recommendation text | **`mitigation_plan`, else template** | See §7. |
| Where the logic runs | **Client-side pure function** | See §4. |

---

## 4. Architecture

`GET /projectRisks` (`getAllRisksQuery`, `Servers/utils/risk.utils.ts:59`) already returns `r.*` plus aggregated `projects` and `frameworks`, scoped by `organization_id`, unpaginated. `Clients/src/presentation/pages/RiskManagement/index.tsx` already holds that full list in the `projectRisks` state.

Every signal the scoring needs is therefore already in the browser, in data the server has already tenant-filtered. Phase 1 runs the scoring there:

- **No migration, no new table.**
- **No new endpoint** — and therefore no new cross-tenant read path, no swagger regeneration, no `check:api-drift` churn.
- The scoring is a pure function in its own module, unit-testable without React or the network.

**Upgrade path (not phase 1):** when a second consumer appears (ProjectView risks tab, notifications, automations), move the same scoring into `GET /projectRisks/:id/related` backed by SQL in `risk.utils.ts`. Keeping the function in a standalone module with no React or repository imports is what makes that move mechanical. The query must then carry `organization_id` in `:replacements` like every other query in that file.

---

## 5. Scoring

Module: `Clients/src/application/tools/relatedRisks.ts`

```ts
findRelatedRisks(subject: RiskModel, all: RiskModel[]): RelatedRisk[]
```

Signals and weights:

| Signal | Condition | Points |
|---|---|---|
| Shared category | `risk_category` arrays intersect (at least one common value) | 3 |
| Same lifecycle phase | `ai_lifecycle_phase` equal | 2 |
| Shared control | `controls_mapping` equal, both non-empty after trim | 2 |
| Shared assessment | `assessment_mapping` equal, both non-empty after trim | 2 |
| Shared project | `projects` arrays intersect | 1 |

Rules:

1. Exclude the subject itself by `id`.
2. Drop candidates scoring 0.
3. Sort by score descending; break ties by `risk_level_autocalculated`, ordered `Very high risk > High risk > Medium risk > Low risk > Very low risk > No risk`; break remaining ties by `id` ascending so the output is deterministic.
4. Return at most 5.

Empty, `null`, or missing values never match — a risk with no `controls_mapping` does not match another risk with no `controls_mapping`. Category comparison ignores case and surrounding whitespace.

The string `"0"` counts as unset for `controls_mapping` and `assessment_mapping`. The risk form has no control or assessment picker: `useRiskForm.ts` hardcodes `0` and `RiskDatabaseModal` sends `DEFAULT_VALUES.*_MAPPING`, also `0`, so every risk created through the UI stores `"0"` in these text columns. Treating that as a real mapping awarded a bogus +4 to every pair of UI-created risks. Drop the guard once the form gains a real picker.

Return shape:

```ts
interface RelatedRisk {
  risk: RiskModel;
  score: number;
  reasons: string[];       // rendered as badges
  recommendation: string;  // never empty
}
```

---

## 6. Match reasons

One badge per matched signal, naming the value that matched so the user can judge it without opening the risk:

- `Shared category: Bias & Fairness` (list every shared category, comma-separated)
- `Same lifecycle phase: Model development & training`
- `Shared control: AC-1`
- `Shared assessment: Q1.2`
- `Same project`

---

## 7. Recommendation text

**Note on `recommendations`:** the field exists in `Servers/domain.layer/interfaces/I.risk.ts` and in the `MitigationSection` form, but there is **no such column** on `verifywise.risks`, no `@Column` on the server `RiskModel`, and it is absent from the `INSERT INTO risks` column list (`risk.utils.ts:660`). It was never persisted — `buildBackendData` in `useMitigationSection.ts` did not even include it in the request body, so the value never left the browser. The dead field was removed in a separate commit on this branch; `mitigation_plan` is the persisted field this feature uses.

Resolution order for each row:

1. The related risk's `mitigation_plan` if non-empty after trim — a real, persisted field that answers "what are we doing about this risk".
2. Otherwise a template sentence chosen by the highest-weight matched signal, ties broken in the order category → control → assessment → phase → project:

| Signal | Template |
|---|---|
| Category | `Same category ({categories}) — re-check this risk's likelihood and severity for consistency.` |
| Control | `Shared control {control} — if that control changed, re-assess this risk.` |
| Assessment | `Shared assessment {question} — confirm the answer still holds.` |
| Phase | `Same lifecycle phase ({phase}) — verify the mitigation plans do not conflict.` |
| Project | `Same project — review the project's risk profile as a whole.` |

The recommendation is never empty, so the column never renders blank.

---

## 8. UI

Component: `Clients/src/presentation/components/RelatedRisksSummary/index.tsx`, rendered by the Risk Management page.

- Triggered after a **successful** create or update, once the risk list refresh has completed.
- If `findRelatedRisks` returns an empty array, **nothing is shown** — no empty modal, no toast.
- Otherwise a `StandardModal` opens:
  - Title: `Risks that may be affected`
  - Description: `"{risk_name}" was saved. These risks share signals with it — review whether they need an update.`
  - One row per related risk: risk name, risk level chip, reason badges, recommendation line, and an **Open** action.
  - **Open** closes the summary and opens that risk in the existing risk edit modal (the page already opens a risk by row — reuse that path).
  - Footer: a single close button. No submit button (`onSubmit` omitted).
- The modal is informational: closing it changes nothing.
- All UI strings in English, matching the rest of the app.

---

## 9. Data

No schema change. Fields read, all already returned by `GET /projectRisks`:

`id`, `risk_name`, `risk_category`, `ai_lifecycle_phase`, `controls_mapping`, `assessment_mapping`, `projects`, `mitigation_plan`, `risk_level_autocalculated`.

`Clients/src/domain/models/Common/risks/risk.model.ts` declares all of these **except `projects`**, which the API returns (aggregated from `projects_risks`) but the client model never declared. Add `projects?: number[]` to that class as an optional property. The Risk Management page assigns the raw API response to `RiskModel[]` state rather than constructing instances, so no constructor change is needed.

---

## 10. Edge cases

| Case | Behaviour |
|---|---|
| Newly created risk | Scored against the list as it was before the create; the new risk is not in it, so no self-match. Exclusion by `id` also covers the case where the list has already refreshed. |
| No related risks | Nothing is shown. |
| Subject has empty `risk_category` | Only the other signals can match; a risk with no signals at all yields an empty result. |
| Deleted risks | `getAllProjectRisks` defaults to `filter=active`; soft-deleted risks are already absent and must not be scored. |
| More than 5 matches | Capped at 5. No "show all" link in phase 1. |
| Very large risk lists | Scoring is O(n) over a list the page already renders and filters client-side. No new performance ceiling. |

---

## 11. Testing

`Clients/src/application/tools/__tests__/relatedRisks.test.ts` (Vitest, matching the existing convention in that folder):

- Ranks a higher-scoring match above a lower-scoring one.
- Breaks a score tie by risk level, then by id.
- Excludes the subject by `id`.
- Returns an empty array when nothing matches.
- Caps the result at 5.
- Empty/whitespace `controls_mapping` on both sides does not count as a match.
- Uses `mitigation_plan` when present; falls back to the template sentence keyed to the highest-weight signal when it is empty.
- Reason badges name the matched values.

---

## 12. Files

| File | Change |
|---|---|
| `Clients/src/application/tools/relatedRisks.ts` | New — pure scoring function, no React or repository imports. |
| `Clients/src/application/tools/__tests__/relatedRisks.test.ts` | New — unit tests per §11. |
| `Clients/src/presentation/components/RelatedRisksSummary/index.tsx` | New — summary modal. |
| `Clients/src/presentation/pages/RiskManagement/index.tsx` | Wire the post-save trigger and the modal state. |
| `Clients/src/domain/models/Common/risks/risk.model.ts` | Add `projects?: number[]` (§9). |

No backend files change in phase 1.
