---
name: issue-intake
description: Fetch a GitHub issue and turn it into a confirmed work brief — scope, acceptance criteria, affected areas, size. Use when starting work on a GitHub issue. First stage of the VerifyWise development flow; produces the input for the plan-issue skill.
---

# Issue Intake

Turn a GitHub issue into a brief the developer confirms before any planning happens.

**Input:** an issue number or URL (`$ARGUMENTS`). If missing, ask for it.

## Steps

1. **Fetch the issue** with the `gh` CLI:

   ```bash
   gh issue view <number> --repo verifywise-ai/verifywise \
     --json number,title,body,labels,assignees,milestone,comments
   ```

   - If the issue lives in a different repo (e.g. working from a fork), adjust `--repo` — when unsure, run `git remote -v` and ask the developer which repo tracks issues.
   - If `gh` is missing or unauthenticated (`gh auth status`), stop and tell the developer to fix that first.

2. **Read the whole issue** — body, acceptance criteria, and every comment. Comments often contain scope changes, clarifications, or linked context that override the original body. Note linked issues/PRs and fetch them too if they affect scope.

3. **Identify affected service areas** by matching the issue content against the repo map (`docs/agent/repo-map.md`): `Servers/`, `Clients/`, `AIGateway/`, `EvalServer/`, `EvaluationModule/`, `GRSModule/`, `sdks/python/`, `kubernetes/`, `observability/`. An issue can span several.

4. **Load the steering docs for those areas** (the per-area `CLAUDE.md` listed in the repo map) and skim them now — the brief must reflect house rules, not just the issue text.

5. **Classify the size**:
   - **Micro** — hotfix, typo, config change; no plan phases beyond a task list
   - **Small** — single component/endpoint/layer
   - **Medium** — multiple components, possibly cross-boundary (API contract needed)
   - **Large** — cross-cutting feature, multiple waves
   State the classification and the evidence for it (labels, scope breadth, files likely touched).

6. **Present the brief** in this format and **STOP**:

   ```
   ## Issue Brief — #<number>: <title>

   - Size: <Micro|Small|Medium|Large> — <one-line evidence>
   - Problem: <what needs solving, in the issue author's terms>
   - Scope: <what this work includes>
   - Out of scope: <explicit exclusions, incl. anything the issue defers>
   - Acceptance criteria:
     1. <verifiable criterion>   (mark which are verbatim from the issue)
   - Affected areas: <paths> — <why>
   - Rules that will apply: <tenant isolation, API-docs regen, permission keys,
     design tokens, etc. — only those genuinely relevant>
   - Open questions: <anything ambiguous that changes the plan if answered differently>
   ```

## Gate — developer confirms the brief

Do NOT proceed to planning until the developer explicitly confirms the brief or corrects it. If there are open questions, present them as choices where possible. Once confirmed, hand off to the `plan-issue` skill with the confirmed brief.

## Rules

- Never invent requirements: if the issue is ambiguous, it becomes an open question, not an assumption.
- If the issue is a duplicate, already closed, or already has a merged PR, say so and stop.
- Keep the brief under one screen; depth belongs in the plan, not the brief.
