---
name: implement-plan
description: Execute an approved implementation plan task by task, in wave order, with scoped verification and a commit per task — stopping for developer review per the plan's gate mode. Use after plan-issue has produced an approved plan. Third stage of the VerifyWise development flow; hands off to the verify-pr skill when all tasks are done.
---

# Implement Plan

Execute an approved plan from `docs/plans/` — sequentially, one task at a time.

**Input:** path to an approved plan file (e.g. `docs/plans/PLAN-issue-<n>-<slug>.md`). If missing, ask. If the plan is not yet approved by the developer, stop and route back to `plan-issue`.

## Ground rules

- **Follow the plan.** Work tasks in wave order. Do not improvise extra scope; do not skip tasks. If the plan proves wrong against the real code, stop, say why, and propose a plan amendment — the developer decides.
- **Conventions are binding.** Before writing code in an area, re-read the checklist that applies: `CodeRules/checklists/api-endpoint-checklist.md` for endpoints, `component-checklist.md` for React components, and the per-area CLAUDE.md rules (multi-tenancy, logging/STATUS_CODE pattern, design tokens, permission keys). Templates in `CodeRules/examples/` are the default shapes.
- **Gate mode comes from the plan file.** Interactive (default) = STOP for developer review after every task. Auto-advance only if the plan records an explicit standing order.

## Per-task loop

For each task on the board, in order:

1. **Restate the task** — ID, goal, files it will touch — in one or two lines.
2. **Implement it.** Match the patterns of the neighboring code (the plan's exploration section names the files to mirror). No new dependencies, no new patterns beyond what the plan's ADRs approved.
3. **Run the task's verification command** from the plan (scoped build/typecheck/lint/targeted test). If it fails, fix within the task's scope until green. Do not move on red.
4. **Commit** with the conventional format: `type(scope): description` (types: feat, fix, docs, style, refactor, test, chore). Reference the issue where natural. The pre-commit hook runs gitleaks + lint-staged and may regenerate API docs — let it; if it fails, fix and recommit.
5. **Update the plan file** — mark the task done (☒) and note any deviation discovered during implementation.
6. **Report and gate:**
   - Interactive mode: summarize what changed (files, verification result, commit hash) and **STOP**. Wait for the developer's explicit go-ahead before the next task. If they request changes, address them within this task, recommit, re-report.
   - Auto-advance mode: record the same summary in the plan's Review Record and continue.

## Blocking and escalation

If blocked (missing context, failing pre-existing tests, ambiguity the plan didn't cover):

1. Stop — do not route around it with a workaround.
2. Report: what's blocked, what you tried, what you need.
3. If the blocker reveals a plan defect, propose the plan amendment and wait for approval.

If a pre-existing failure unrelated to the plan blocks verification, say so plainly and ask whether to proceed — never silently absorb it.

## Completion

When every task is done:

1. Run the plan's final quality wave: acceptance-criteria review, one criterion at a time, with evidence (test output, manual check description).
2. Confirm all tasks are marked done in the plan file and the Review Record is complete.
3. Hand off to the `verify-pr` skill. Do NOT open a PR — `gh pr create` requires the developer's explicit instruction, per the root CLAUDE.md rule.
