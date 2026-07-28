# Readiness scoring from Requirements, Assessments and Evidence

**Date:** 2026-07-28
**Status:** Approved design, ready for implementation planning

## Problem

The readiness score does not reflect the work a team has actually done.

Today a control's score is `evidence_quality × 0.30 + evidence_count × 0.20 + evidence_recency × 0.15 + task_completion × 0.20 + risk_mitigation × 0.15`, computed in `calculateControlReadiness` (`Servers/controllers/readiness.ctrl.ts`). Two consequences:

1. **Requirements and assessment answers are never read.** The demo use case shows "20 of 39 requirements completed" and "24 of 70 assessments completed", yet every one of its 103 readiness controls scores 15/100 and reads `not_started`.
2. **Tasks and risks are attached by a proxy.** A task counts toward a control only when the two share a file in `file_entity_links`. That is an incidental relationship, not a governance one.

The scored control set is also wrong for a project: `getFrameworkControlsQuery` iterates every row of `controls_struct_eu` (103), while the project's Requirements tab shows only the 39 controls whose category applies to that project's risk tier and role.

## Goal

Readiness is computed from the three things the product already tracks and displays: **Requirements progress, Assessments progress, and Evidence quality.** A user who completes a requirement must see readiness move.

## Design

### Layer 1 — control score

Per control, per framework, per project:

| Component | Weight | Source |
|---|---|---|
| `requirements_score` | 0.50 | share of the control's requirement rows that are complete |
| `evidence_quality_score` | 0.20 | `evidence_ai_analysis.overall_quality_grade` average (unchanged) |
| `evidence_count_score` | 0.15 | `normalizeEvidenceCount` over linked files (unchanged) |
| `evidence_recency_score` | 0.15 | `normalizeRecency` over the newest linked file (unchanged) |

`task_completion` and `risk_mitigation` are removed from the formula.

`requirements_score` per framework, matching each framework's own progress definition so readiness and the progress bar can never disagree:

- **EU AI Act** — `subcontrols_eu.status = 'Done'` / total, for the `controls_eu` row whose `control_meta_id` is this control and whose `projects_frameworks_id` is this project's. Chain: `projects_frameworks(project_id, framework_id)` → `controls_eu(projects_frameworks_id, control_meta_id)` → `subcontrols_eu(control_id, status)`.
- **ISO 42001** — `annexcategories_iso.status = 'Implemented'` → 100, anything else → 0, for the `annexcategory_meta_id` matching this control. Mirrors `getAnnexCategoriesProgress` in `Servers/utils/iso42001.utils.ts`.

A control with no requirement rows for the project scores `requirements_score = 0` and is still scored on evidence.

### Control set (applicability)

Scoring must cover exactly the controls the project is required to implement:

- **EU AI Act, project-scoped** — only controls whose `controls_struct_eu.control_category_id` is in `getVisibleEuCategoryIdsForProject(projectFrameworkId, organizationId)`. This is the same filter `countSubControlsEUByProjectId` uses, so the readiness denominator matches the "N of M requirements" bar.
- **ISO 42001, project-scoped** — only `annexcategories_iso` rows with `is_applicable = true`. An excluded category leaves the average entirely; it must not drag the score down.
- **Organization-wide (`project_id` is null)** — the union of applicable controls across every `projects_frameworks` row of that framework type in the organization. A control's `requirements_score` is `SUM(done) / SUM(total)` across those project frameworks.

### Layer 2 — framework score

- **EU AI Act:** `avg(control scores) × 0.70 + assessment_completion × 0.30`
  `assessment_completion` = `answers_eu.status = 'Done'` / total, joined through `assessments.projects_frameworks_id`. Same query the Assessments progress bar uses (`countAnswersEUByProjectId`).
- **ISO 42001:** `avg(control scores)`. ISO has no assessments, so the weight is renormalized rather than treated as zero — otherwise ISO could never exceed 70.

The same renormalization applies whenever a framework has **no assessment questions at all** for the scope being calculated (an EU project framework whose assessment rows were never created, or an org-wide calculation over an organization with none): the score is the control average, and `assessment_score` is stored as NULL rather than 0. A framework with questions that are merely unanswered scores `assessment_completion = 0` — that is a real zero, not a missing input.

`readiness_level` classification (`ready ≥ 80`, `needs_work ≥ 60`, `at_risk ≥ 30`) is unchanged, as are the per-level counts and the weakest-controls list, which continue to describe layer 1.

The heat map and "weakest controls" show layer 1. The headline score, the trend chart and the history snapshots show layer 2.

### Recommendations

Generated per control, replacing the task and risk lines:

- `requirements_score < 100` → "Complete the remaining requirements for this control"
- `evidence_count_score < 30` → "Upload evidence documents for this control" (unchanged)
- `evidence_quality_score < 50` → "Improve quality of linked evidence" (unchanged)
- `evidence_recency_score < 40` → "Update outdated evidence with recent documents" (unchanged)

### Schema

Migration adds:

- `control_readiness_scores.requirements_score INTEGER`
- `framework_readiness_scores.assessment_score INTEGER`
- `framework_readiness_scores.controls_avg_score INTEGER` — the layer-1 average, kept alongside `avg_score` (now the blended layer-2 number) so the two layers stay inspectable.

`task_completion_score` and `risk_mitigation_score` are **kept and left NULL** going forward. They are not dropped because `generateRecommendations` in `Servers/advisor/functions/readinessFunctions.ts` selects them; that query gains `requirements_score`. The advisor's own `checkTaskCompletion` and `analyzeRiskStatus` tools are untouched — they remain useful context for the assistant even though they no longer feed the score.

### Files

| File | Change |
|---|---|
| `Servers/advisor/scoring/readinessCalculator.ts` | new weights, `requirements` input replaces `task_completion`/`risk_mitigation`; add framework-level blend helper |
| `Servers/controllers/readiness.ctrl.ts` | gather requirement completion instead of task/risk; apply the applicability filter; blend assessments at framework level |
| `Servers/utils/readiness.utils.ts` | `getFrameworkControlsQuery` becomes project-aware; new requirement/assessment completion queries; persist the new columns |
| `Servers/advisor/functions/readinessFunctions.ts` | `generateRecommendations` selects `requirements_score` |
| `Servers/database/migrations/<ts>-readiness-requirements-scoring.js` | new columns |
| `Clients/src/domain/interfaces/i.readiness.ts` | add `requirements_score`, `assessment_score`, `controls_avg_score` |
| `docs/technical/domains/*` | document the formula |

No frontend rendering changes: the UI shows `overall_score`, level counts and recommendations, never the individual component scores.

## Testing

- **Unit (`readinessCalculator`)** — weights sum to 1 and a known input produces a known score; a control with requirements complete and no evidence scores 50; the EU framework blend of a 60 control average and 40 assessments is 54; ISO with the same control average is 60 (renormalized, not 42).
- **Integration (controller)** — against seeded project data: readiness requirement completion equals the number the Requirements progress bar shows for the same project framework; a project-scoped EU calculation scores only the visible categories; an ISO category with `is_applicable = false` is absent from the average.
- **Regression** — the existing readiness endpoint tests keep passing; org-wide (`project_id` null) still returns a score.

## Out of scope

- **ISO 42001 clauses.** ISO requirements live in both `subclauses_iso` and `annexcategories_iso`; readiness scores only annex categories, as it does today. Covering clauses means adding a second control family to the readiness control set, whose ids collide with annex category ids. Worth doing, separately.
- The frontend readiness UI, the heat map, and the `?subtab=readiness` tab, all unchanged.
- The advisor's task and risk analysis tools.
