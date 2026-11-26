# Implementation Plan Template

> Copy this template when running the `plan-issue` skill. Save plans to `docs/plans/PLAN-issue-<number>-<slug>.md`.
> Scale the sections to the task size: a Micro/Small task may collapse Sections 1–2 into a few lines; Medium+ tasks use the full template. Every task in the task board must be atomic (one focused session), independently testable, and list exact file paths.

---

# PLAN — Issue #<number>: <title>

> Branch: `<branch-name>`
> Issue: <issue URL>
> Size: Micro | Small | Medium | Large
> Gate mode: Interactive (review after every task) | Auto-advance (standing order: <state the order explicitly>)

## 1. Problem & Scope

- **Problem:** <what is broken / missing, in the user's terms>
- **Scope:** <what this change includes>
- **Out of scope:** <explicit exclusions>
- **Acceptance criteria:** <verbatim from the issue where possible; each criterion must be verifiable>

## 2. Affected Areas & Rules That Apply

| Area | Paths | Rules to follow |
|------|-------|-----------------|
| <Servers / Clients / AIGateway / EvalServer / GRSModule / sdks> | <dirs/files> | <relevant CLAUDE.md sections, CodeRules files, domain docs> |

<For Medium+: include ADRs for any non-obvious decision — options considered, precedent in the codebase, and the choice with rationale. For cross-boundary work (frontend↔backend), include the API contract: endpoint, method, request/response schema, errors. Backend publishes first; frontend confirms; neither changes it without updating the plan.>

### ADR-1: <decision title>
- Precedent: <existing code that informs this>
- Decision: <what was chosen and why>

### API Contract (if applicable)
- `<METHOD> /<path>` — body: …, response: …, errors: …

## 3. Task Board

### Wave 1 — <e.g. Backend foundation>
| ID | Task | Files | Verification | Status |
|----|------|-------|--------------|--------|
| T1 | <task> | `<exact/path>` | <command, e.g. `cd Servers && npm run build`> | ☐ |

### Wave 2 — <e.g. Frontend>
| ID | Task | Files | Verification | Status |
|----|------|-------|--------------|--------|
| T4 | <task> | `<exact/path>` | <command> | ☐ |

### Wave 3 — Quality
| ID | Task | Files | Verification | Status |
|----|------|-------|--------------|--------|
| Q1 | Tests for new behavior | <paths> | <targeted test command> | ☐ |
| Q2 | Review vs acceptance criteria | — | each criterion checked | ☐ |

## 4. CI Checks That Apply

<Derived from the affected areas — see `docs/agent/ci-local-parity.md`. List the [must] checks for the areas this plan touches; these run in the verify-pr gate before the PR.>

## 5. Risk & Blocker Log

| Risk / Blocker | Impact | Mitigation | Status |
|----------------|--------|------------|--------|
| <e.g. needs new org-scoped table → tenant-isolation registry update> | <impact> | <mitigation> | open |

## 6. Review Record

| Gate | Reviewer | Outcome | Date |
|------|----------|---------|------|
| Plan approval | <developer> | approved / changes requested | |
| Task T1 | | | |
| Pre-PR verification | | | |
