# Readiness Scoring

> **Last Updated:** 2026-07-28

Readiness answers "how close is this use case to passing an audit for this
framework". It is computed in two layers.

## Layer 1 — control score

| Component | Weight | Source |
|---|---|---|
| `requirements_score` | 0.50 | share of the control's requirement rows that are complete |
| `evidence_quality_score` | 0.20 | `evidence_ai_analysis.overall_quality_grade` average |
| `evidence_count_score` | 0.15 | `normalizeEvidenceCount` over linked files |
| `evidence_recency_score` | 0.15 | `normalizeRecency` over the newest linked file |

Requirement completion matches each framework's own progress bar, so the two can
never disagree:

- **EU AI Act** — `subcontrols_eu.status = 'Done'` / total, for the `controls_eu`
  row matching this control and project framework.
- **ISO 42001** — `annexcategories_iso.status = 'Implemented'` → 100, else 0.

## Control set

Only controls the project is required to implement are scored:

- **EU AI Act** — categories returned by `getVisibleEuCategoryIdsForProject`,
  which filters by the project's risk tier and role.
- **ISO 42001** — annex categories with `is_applicable = TRUE` or
  `is_applicable IS NULL`. Only categories explicitly marked not applicable
  (`is_applicable = false`) are excluded. Untriaged is the default state on a
  real, non-demo project, so counting it as applicable means a fresh project
  scores as zero-done instead of returning no controls at all.
- **Organization-wide** — the union across every project framework of that type;
  a control's score is `SUM(done) / SUM(total)` across them.

## Layer 2 — framework score

- **EU AI Act:** `controls_avg × 0.70 + assessment_completion × 0.30`, where
  assessment completion is `answers_eu.status = 'Done'` / total.
- **ISO 42001, or any scope with no assessment questions:** `controls_avg`. The
  weight is renormalized, not scored as zero — otherwise such a framework could
  never exceed 70. `assessment_score` is stored as NULL in that case. Questions
  that exist but are unanswered are a real zero.

`framework_readiness_scores.avg_score` holds the blended layer-2 number;
`controls_avg_score` holds the layer-1 average. The heat map and weakest-controls
list show layer 1; the headline score, trend chart and history show layer 2.

## Levels

`ready ≥ 80`, `needs_work ≥ 60`, `at_risk ≥ 30`, otherwise `not_started`.

## Retired inputs

`task_completion_score` and `risk_mitigation_score` no longer feed the score.
Both were derived from an incidental relationship — a task or risk sharing a
file with the control — not a governance one. The upsert no longer names either
column, so a newly inserted row gets NULL; a row updated through `ON CONFLICT`
keeps whatever value it already held. Nothing reads them either way.

The advisor's `generateRecommendations` still selects these two columns, but
nothing in the function reads them — they appear in neither the actions, the
weakest-dimension map, nor the returned object, since a NULL column would make
that branch (or that "weakest" verdict) fire unconditionally. Live task/risk
state for a control is available on demand through the separate
`check_task_completion` / `analyze_risk_status` advisor tools, which compute
real values from the current tasks and risks rather than reading the retired
columns.

`requirements_score` is different: it carries half the control score, so the
advisor does branch on it. Below 100 it emits "Complete the remaining
requirements for this control", and it is the first entry of the
weakest-dimension map (ordered by scoring weight, so an exact tie resolves to
the dimension that moves the overall score most). A NULL `requirements_score`
— a row written before the column existed — defaults to 100 there, so an
unknown dimension can never win "weakest" or fire the recommendation
unconditionally.

## Pruning

The applicable control set is a moving target: changing a project's
`ai_risk_classification` or `type_of_high_risk_role` changes what
`getVisibleEuCategoryIdsForProject` returns, and marking an ISO annex category
`is_applicable = false` drops it. Each recalculation therefore ends with
`pruneControlScoresQuery`, which deletes the scope's `control_readiness_scores`
rows whose `control_id` is not in the set just recalculated. Without it those
orphans keep their stale score and, being lower than the live rows, monopolize
every `ORDER BY overall_score ASC` consumer — weakest controls, recommendations
and the heat map.

The delete is scoped by exactly the columns of the upsert's `ON CONFLICT` key
(`uq_ctrl_readiness_full`) minus `control_id` — `organization_id`,
`framework_type`, `COALESCE(project_id, 0)`, `COALESCE(created_by, 0)` — so it
can only ever remove rows that same recalculation would have overwritten. One
user's run cannot destroy another user's scores, and a project-scoped run
cannot destroy the organization-wide (`project_id IS NULL`) rows.

## Key files

| Purpose | Path |
|---|---|
| Formula and weights | `Servers/advisor/scoring/readinessCalculator.ts` |
| Calculation pipeline | `Servers/controllers/readiness.ctrl.ts` |
| Queries and persistence | `Servers/utils/readiness.utils.ts` |
| UI | `Clients/src/presentation/pages/ReadinessDashboard/` |
