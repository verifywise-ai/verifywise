# Retrospective — Controls Hub (April 2026)

**Branch:** `mo-335-april-16-controls-hub`
**Feature:** Unified cross-framework controls library
**Scope:** Full feature — data model, backend, frontend, docs
**Target commit cadence:** 35–50 meaningful commits
**Actual commit cadence:** 46 commits (within target)

## Goals Met

1. **Master control entity with multi-framework mappings.** `master_controls`, `master_control_framework_mappings`, and `master_control_change_history` tables shipped in three forward-and-backward-reversible migrations.
2. **One-way propagation.** A single transaction updates the master row and fans changes out to every mapped framework row. Partial failures roll back atomically.
3. **End-to-end CRUD surface.** REST API, React Query hooks, repository, domain model, and matrix UI all connected. The drawer's Details tab diffs against the loaded model and sends a sparse patch so propagation fan-out stays minimal.
4. **Ancillary features delivered in full.** Bulk edit, CSV export, recommended seed import, propagation preview modal, change-history timeline, framework-cell chip cluster.
5. **Accessibility polished.** Matrix sort headers expose `aria-sort` and respond to Enter/Space. Rows are focusable with keyboard. The drawer is labelled for screen readers. Feedback alerts use polite vs assertive roles appropriately.
6. **Documentation complete.** Domain doc + three `CLAUDE.md` updates (root, Servers, Clients).

## Tasks Shipped vs Planned

| Wave | Planned | Shipped | Notes |
|------|---------|---------|-------|
| 1 — Foundation | T-001 → T-010 | 10/10 | All migrations, models, seeds, mockups |
| 2 — Core APIs + Frontend Shell | T-011 → T-024 | 14/14 | Propagation, change history, Swagger included |
| 3 — Secondary features | T-025 → T-038 | 14/14 | Bulk, CSV, seed loader, drawer tabs, modals, component tests |
| 4 — Integration + Polish | T-039 → T-043 | 5/5 | E2E wire-up, accessibility, docs |
| 5 — Review / QA / Deploy | T-044, T-047 | 2/2 in-repo; T-045, T-046 external | Staging/prod deploy handed off to DevOps |

**Total:** 45/47 in-repo tasks shipped. T-045 and T-046 (deployment) are external to this branch.

## Metrics

- **Backend:** `masterControl` test suites — 4 suites, 152 tests, all green.
- **Frontend:** ControlsHub / MasterControl test suites — 5 suites, 39 tests, all green.
- **TypeScript:** Zero errors on full `tsc --noEmit`.
- **Build:** `cd Servers && npm run build` succeeds.

## Lessons Learned

1. **Pre-plotting the task board paid off.** Splitting into four waves with explicit dependencies gave every task a clear predecessor, so there was never ambiguity about "what can I pick up next?" This is worth replicating for any feature spanning more than ~20 tasks.
2. **Sparse patches reduce propagation blast radius.** Having the frontend diff form state against the loaded model before calling update, then sending only changed fields, kept the propagation service's UPDATE list short on every save. Without this, every save would have issued one UPDATE per mapping regardless of intent.
3. **Adapter tables for per-entity-type differences are cleaner than switch statements.** The propagation service uses an `ENTITY_ADAPTERS` record keyed by `FrameworkEntityType` to abstract over EU's `implementation_details` vs ISO/NIST's `implementation_description`. New frameworks can be added by extending the record only.
4. **Separate change-history controller for the drawer's History tab.** The client derives the endpoint path by replacing `_` with `-` in the EntityType, and having a dedicated route (`/api/master-control-change-history/:id`) keeps that convention unsurprising.
5. **`role="status"` vs `role="alert"` matters for UX.** Success and info alerts using the default `role="alert"` would interrupt screen readers for every save. Switching transient confirmations to `role="status"` made the experience calmer without losing accessibility for error states.

## Tech Debt Register — Deltas

**New items:**

- Orphan mapping detection: mappings persist by `(framework_entity_type, framework_entity_id)`; if the framework struct data is reseeded with new IDs, existing mappings become stale. Nightly reconciliation job is deferred.
- Bulk mapping UI: currently one-at-a-time in the Mappings tab. Multi-select across framework requirements would shorten onboarding from a long list.
- Two-way sync: edits made directly on a framework row (e.g. in the EU AI Act compliance tracker) are not reflected back to the master. Explicitly out of scope for v1.
- Status translation is lossy: `FRAMEWORK_STATUS_TRANSLATIONS` maps master→framework only. No reverse mapping exists for the hypothetical v2 two-way sync.

**Closed items:**

- Framework-siloed controls (the original Enzai gap) — closed by this feature.

## What We'd Do Differently

1. **Earlier axe-core pass.** Accessibility was tacked on at the end as T-040. Running axe during Wave 2 would have caught the drawer's missing `aria-labelledby` long before polish time.
2. **Mocks ahead of the drawer build.** The UX spec committed in Wave 1 (T-009) was consulted, but in a parallel universe, having the mocks committed before starting the drawer components would have reduced two rounds of iteration on the Details tab layout.
3. **Integration test coverage for failed propagation.** Current integration tests cover the happy path plus tenant isolation. Adding a deliberately-failing adapter test to prove the rollback works end-to-end would strengthen confidence before prod.

## Follow-ups Filed

- Orphan mapping detection job (tech-debt register)
- Multi-select mapping picker (UX backlog)
- Two-way sync design spike (roadmap)
