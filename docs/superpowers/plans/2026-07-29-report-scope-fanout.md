# Report scope fan-out — plan

Fixes: a report run collects almost none of the organization's data.

## Root cause (measured, not inferred)

`ConfigureReportWizard.submit()` sends `{templateVersionId, name, scope, projectId,
sectionsConfig, aiBlocksConfig, format}`. It has no framework picker, so
`frameworkId` and `projectFrameworkId` are never in the body. `runTemplateNow`
(reportTemplate.ctrl.ts:316-317) and `createScheduledReportQuery` both read them
from that body, so both store NULL, and `resolveReportRequest` coerces NULL to
`0` (reportTemplateResolver.ts:25-27).

Inside `collectAllData` every framework section is gated on the numeric id —
`this.frameworkId === 1` for compliance/assessment, `=== 2 || === 3` for
clausesAndAnnexes, `=== 4` for nistSubcategories. With `frameworkId = 0` all four
gates are closed. And with `projectId = 0` there is no `projects` row, so
`metadata.isOrganizational` is false and the remaining sections filter on
`project_id = 0`.

Measured against the dev database (read-only, `collectAllData` only SELECTs),
asking for the three sections the user's template requested:

| collector args (org/proj/fw/pfw/user) | sections returned |
|---|---|
| `1/0/0/0/1` — what the user's run actually did | **none** |
| `1/1/1/1/1` — correct ids | compliance (24 controls), assessment (14 topics) |

The second, separate reason that run looked bare: all six `report_run_analyses`
rows say `no LLM key is configured for this organization`. That is correct
behaviour, not a bug, and this plan does not change it.

## Design

Do not add a framework picker to the wizard. `projects_frameworks` is
many-per-project, so a single `frameworkId` field would pin a report to one
framework and silently drop the project's others — the same class of bug.

Derive the targets server-side, and both scopes become one mechanism:

```
project scope      -> projects_frameworks WHERE project_id = :projectId
organization scope -> projects_frameworks (whole org, no project predicate)
```

Fan the framework-gated sections out over that set and merge. Collect the
org-wide sections exactly once — `trainingRegistry` and `policyManager` are
unconditionally org-scoped, and vendors/models/vendorRisks/modelRisks/
incidentManagement already have a no-project-filter branch that organization
scope reuses.

`metadata.isOrganizational` keeps its current meaning ("this project has
`is_organizational = true`") because `docxGenerator` renders off it and the EU
AI Act gate depends on it. Report scope gets its own field.

## Tasks

1. `reportScope.ts` — `resolveFrameworkTargets(scope, projectId, organizationId)`.
   Failing test first.
2. `mergeSections.ts` — merge N per-target section payloads into one, recomputing
   totals. Every section type is `{totals, items[]}`, so merge is concatenate +
   recompute. Failing test first.
3. Collector: accept `scope` + `targets`, loop the framework sections, collect
   org-wide sections once. Keep `createDataCollector(org, proj, fw, pfw, user)`
   as the single-target factory so the legacy manual path and its 17 tests are
   untouched.
4. Org-wide `projectRisks`: `getProjectRisksReportQuery` filters
   `pr.project_id`; add a DISTINCT org-wide variant.
5. Analyzer inputs: `collectReadinessInput` and `collectEvidenceGapsInput` are
   fed the same zeroed ids and return empty. Feed them from the resolved targets.
6. Wire `resolveReportRequest` -> `generateReport` -> collector, carrying scope.
7. Verify: re-run the measurement, then a real run through the API, and confirm
   the produced PDF carries the rows the database holds.

## Constraints

- Dev DB is SELECT/EXPLAIN only. Never `npm run test:integration`.
- Commit explicit paths only; never `git add -A`.
