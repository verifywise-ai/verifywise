# Eval → Model Inventory Linking

> **Date:** 2026-04-12
> **Branch:** `feat/eval-model-inventory-link`
> **Status:** Design

## Problem

LLM evaluations (experiments and bias audits) run in EvalServer but have no connection to the Model Inventory in the governance system. A user runs an eval against GPT-4, gets results, then separately manages GPT-4 in the model inventory — with no link between the two. Eval results that surface risks (bias flags, toxicity failures, low relevancy scores) don't flow into the governance view of the model.

## Solution

Add an optional "Which model in your inventory are you testing?" dropdown to both experiment and bias audit creation forms. When linked, the model's detail page shows evaluation history. If an eval flags a risk, the user is nudged to add it to the risk register — but the system never auto-creates risks.

## Design decisions

1. **Optional linking only.** The dropdown is never required. Users who just want to run a quick eval skip it with zero friction.
2. **User-driven risk creation.** When eval results flag something (bias threshold exceeded, metric failed), the UI surfaces a nudge: "This evaluation flagged a potential risk. Add to risk register?" The user decides. No auto-writes to `model_risks`.
3. **Both entity types.** Experiments and bias audits both get the dropdown. Bias audits already have `systemName`/`systemVersion` free-text fields — the dropdown supplements (does not replace) those.
4. **No cross-service writes.** EvalServer stores the `model_inventory_id` FK. Servers reads `llm_evals_*` tables (same Postgres instance) to display eval history on the model detail page. Neither service writes to the other's tables.

## Scope

### In scope

- Alembic migration: add nullable `model_inventory_id` (INTEGER) to `llm_evals_experiments` and `llm_evals_bias_audits`
- Frontend: optional model inventory dropdown on `NewExperimentModal.tsx` and `NewBiasAuditModal.tsx`
- Frontend: "Evaluations" tab on model inventory detail page showing linked experiments and bias audits
- Frontend: risk nudge banner when a linked eval has flagged/failed results
- Frontend: "Unlinked" badge on evals list for experiments/audits not linked to a model
- Backend: update EvalServer CRUD to accept and store `model_inventory_id`
- Backend: Servers endpoint to fetch evals by `model_inventory_id` (read from `llm_evals_*` tables)

### Out of scope

- Auto-creating risks from eval results
- Auto-creating use cases from evals (evals link to models; models already link to use cases)
- Match-score suggestions or fuzzy matching (v1 is a manual dropdown)
- Backfill existing evals to models (future: surface "you have N past evals that match this model's provider")

## Architecture

### Data flow

```
[Eval Creation Form] — user picks model from inventory dropdown (optional)
        |
        v
[EvalServer] — stores model_inventory_id on experiment/bias_audit row
        |
        v
[Servers] — reads llm_evals_experiments + llm_evals_bias_audits
            WHERE model_inventory_id = :id (direct DB read, same Postgres)
        |
        v
[Model Detail Page] — "Evaluations" tab shows linked results
        |
        v
[Risk Nudge] — if any eval has failed metrics, show banner:
               "This evaluation flagged a potential risk. Add to risk register?"
               → opens existing Add Risk form, pre-filled with eval context
```

### Database changes

**EvalServer — Alembic migration:**

```sql
ALTER TABLE verifywise.llm_evals_experiments
  ADD COLUMN model_inventory_id INTEGER NULL;

ALTER TABLE verifywise.llm_evals_bias_audits
  ADD COLUMN model_inventory_id INTEGER NULL;
```

No foreign key constraint (cross-schema reference to `verifywise.model_inventories`). Application-level validation only — if the model is deleted, the eval retains the stale ID but the UI shows "Model removed" gracefully.

### API changes

**EvalServer (Python/FastAPI):**

- `POST /evaluate` — accept optional `model_inventory_id` in payload
- `POST /deepeval/bias-audits/run` — accept optional `model_inventory_id` in form data
- `GET /deepeval/experiments?model_inventory_id=X` — filter experiments by model (new query param)
- `GET /deepeval/bias-audits?model_inventory_id=X` — filter bias audits by model (new query param)

**Servers (Node/Express):**

- `GET /api/modelInventories/:id/evaluations` — new endpoint that reads from `llm_evals_experiments` and `llm_evals_bias_audits` WHERE `model_inventory_id = :id`, returns combined list sorted by `completed_at DESC`

### Frontend changes

**NewExperimentModal.tsx:**

- Add optional `Select` dropdown labeled "Link to model inventory (optional)"
- Populated via `GET /api/modelInventories` (already available through CustomAxios)
- Each option shows: `{provider} — {model} (v{version})` with status chip (Approved/Pending/Restricted)
- Default: empty (no model selected)
- Selected value stored as `model_inventory_id` in the experiment config payload

**NewBiasAuditModal.tsx:**

- Same dropdown pattern as experiments
- Placed near existing `systemName`/`systemVersion` fields
- Does not replace those fields — supplements them

**Model Inventory Detail Page (new "Evaluations" tab):**

- Tab added alongside existing tabs on the model detail page
- Table columns: Date | Type (Experiment/Bias Audit) | Name | Status | Key Result | Actions
- "Key Result" shows: primary metric score for experiments, overall pass/fail + flagged count for bias audits
- If any eval has failed metrics or flagged bias categories: amber banner at top of tab
  - "1 evaluation flagged a potential risk. Add to risk register?"
  - Click opens existing AddNewRiskForm pre-filled with:
    - `risk_category`: "Performance" (for experiment failures) or "Bias" (for bias audit flags)
    - `description`: auto-generated from eval results (e.g., "Answer relevancy scored 0.62, below threshold 0.80")
    - `model_inventory_id`: current model
  - User reviews, edits, and submits — standard risk creation flow

**Evals List Pages (ExperimentsList / BiasAuditsList):**

- New column or badge: "Linked model" showing model name, or "Unlinked" in muted text
- Optional filter: "Show unlinked only" toggle

## Risk nudge logic

An eval is considered "flagged" when:

- **Experiment:** any metric in `results` has `score < threshold` (thresholds stored in `config.metric_thresholds`)
- **Bias audit:** any category in `results` has `flagged: true`

The nudge banner appears on the model detail "Evaluations" tab only. It does not appear on the evals list page (that would be too noisy). The nudge is dismissible per-eval (stored in component state, not persisted — it reappears on page reload, which is fine since it's informational).

## Testing considerations

- Verify eval creation works with and without model selection (optional field)
- Verify model detail "Evaluations" tab shows correct linked evals
- Verify risk nudge appears only when eval results contain failures/flags
- Verify "Add to risk register" pre-fills the risk form correctly
- Verify unlinked badge displays on evals list
- Verify graceful handling when a linked model is deleted (show "Model removed")
- Verify dropdown filters by organization (multi-tenancy)
