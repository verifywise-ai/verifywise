---
name: plan-issue
description: Turn a confirmed issue brief into a written, reviewable implementation plan grounded in the actual codebase — waves of atomic tasks with exact file paths, verification commands, and applicable CI checks. Use after issue-intake. Second stage of the VerifyWise development flow; produces the input for the implement-plan skill.
---

# Plan Issue

Produce a plan the developer reviews **before any code is written**.

**Input:** a confirmed issue brief (from `issue-intake`) or an issue number (run the intake steps first).

## Steps

1. **Create the branch** if none exists: `feature/<slug>` or `fix/<slug>` off `develop`. Never plan or commit on `master`/`develop`.

2. **Explore the codebase before writing anything.** Delegate to the `verifywise-explorer` agent (`.claude/agents/verifywise-explorer.md`) for each affected area, asking for:
   - existing implementations of similar features (real file paths to mirror),
   - the conventions and gotchas from the relevant CLAUDE.md,
   - exact files that will need to be created or modified.
   Read the key files it surfaces yourself where the plan depends on their details. A plan that names wrong files is worse than no plan.

3. **Check the mandatory-reading triggers** in `docs/agent/repo-map.md` — e.g. touching an org-scoped table means `docs/technical/security/tenant-isolation.md` applies and the plan must include the tenant-isolation registry/test-matrix update; adding a route means swagger/endpoints regeneration is part of the work.

4. **Decide non-obvious choices as ADRs** (Medium+ tasks): 2–3 options where a real choice exists, precedent from the codebase, recommendation with rationale. For frontend↔backend work, write the API contract (endpoint, method, request/response, errors) — backend publishes, frontend confirms.

5. **Decompose into a task board** of waves:
   - each task atomic: one focused session, independently testable, exact file paths;
   - order by dependency; group into waves (e.g. backend foundation → frontend → quality);
   - every task carries its **verification command** (scoped: `npm run build`, `npm run typecheck`, a targeted jest/vitest/pytest path);
   - final wave always includes tests for the new behavior and a review pass against the acceptance criteria.

6. **Write the plan** to `docs/plans/PLAN-issue-<number>-<slug>.md` using `docs/agent/plan-template.md`. Fill the "CI Checks That Apply" section from `docs/agent/ci-local-parity.md` based on the areas touched. Scale depth to the size classification: Micro/Small plans are short; do not ceremony a typo fix.

7. **Present a summary** (size, waves, task count, key ADRs, risks) and **STOP**.

## Gate — developer approves the plan

Do NOT start implementation until the developer explicitly approves the plan file. If they request changes, revise the plan and re-present. Also confirm the **gate mode** for implementation at this point:

- **Interactive** (default): stop for review after every task.
- **Auto-advance**: only with an explicit standing order from the developer (e.g. "commit and continue after every task"), which must be recorded at the top of the plan file.

Once approved, hand off to the `implement-plan` skill.

## Rules

- The plan file is the review artifact — keep chat summaries short and point to the file.
- Every acceptance criterion from the brief must map to at least one task; note the mapping if it isn't obvious.
- No placeholder file paths ("some controller") — if exploration can't pin a file, the plan says what must be found first.
- Keep plans in `docs/plans/` (canonical). Do not create a second plan convention.
