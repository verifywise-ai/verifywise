# Agent Development Flow

Structured, review-gated development from GitHub issue to PR-ready branch. Four skills in `.claude/skills/`, chained by artifacts:

```
issue-intake  →  plan-issue  →  implement-plan  →  verify-pr
   brief           plan           commits           readiness
                  GATE            GATE per task     report, GATE
```

| Skill | What it does | Gate |
|-------|--------------|------|
| `issue-intake` | Fetches the GitHub issue via `gh`, restates scope/acceptance criteria, identifies affected areas and size | Developer confirms the brief |
| `plan-issue` | Explores the codebase (via `verifywise-explorer`), writes a plan to `docs/plans/` with waves of atomic tasks, exact files, verification commands | Developer approves the plan file; gate mode (interactive / auto-advance) recorded |
| `implement-plan` | Executes tasks sequentially, runs each task's scoped checks, commits per task, updates the plan file | Developer reviews after every task (interactive mode) |
| `verify-pr` | Runs the local CI-parity checks for the areas the branch touched, emits a readiness report mapped to the PR template | Developer opens the PR manually |

## Reference documents

- `docs/agent/repo-map.md` — steering map: services, layer flows, mandatory-reading triggers, conventions. Load first when unsure where something lives.
- `docs/agent/ci-local-parity.md` — the CI check matrix: every GitHub Actions check and its local command. Source of truth for `verify-pr`; update it in the same PR as any workflow change.
- `docs/agent/plan-template.md` — the plan file template used by `plan-issue`.

## Relationship to existing material

- Coding standards stay in `CodeRules/` — the skills point at checklists/templates there, never duplicate them.
- `agents/00-TEAM_WORKFLOW.md` describes the full 12-phase team workflow; these skills are the lightweight, single-developer slice of it (intake → plan → implement → verify).
- The `verifywise-explorer` subagent (`.claude/agents/`) is reused by `plan-issue` for codebase research.
- The pre-commit hook (`.husky/pre-commit`) already covers gitleaks, lint-staged, and API-docs regeneration; `verify-pr` covers everything else CI runs.
