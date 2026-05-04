# Audit: llm-evals/leaderboard
**Article path:** shared/user-guide-content/content/llm-evals/leaderboard.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (1)

## Summary
The article accurately describes the leaderboard as a planned future feature not yet available, and the warning callout correctly states it is "listed in the sidebar but not yet available." Arena comparisons are implemented in the backend (5 endpoints verified). However, one discrepancy exists: the sidebar config shows the leaderboard menu item is commented out, not actually listed/visible to users.

## Findings
### Finding 1 — Leaderboard sidebar visibility claim
- **Type:** UI
- **Status:** ⚠️ partial
- **Doc says:** "The leaderboard is listed in the sidebar but not yet available." (block index 0)
- **Reality:** The leaderboard menu item is commented out in the sidebar config; it is not currently listed/displayed to users.
- **Evidence:** `Clients/src/presentation/pages/EvalsDashboard/EvalsSidebar.tsx:137-139` — lines show `//   id: "leaderboard",` etc. commented out, while Arena (line 129-135) is active.
- **Suggested fix:** Either uncomment the leaderboard item in the sidebar to make it visible (matching the "listed in the sidebar" claim), or revise the warning to say "The leaderboard feature is planned but not yet available" without claiming it is listed in the sidebar.
- **Confidence:** high

## Verified claims (sampled)
- Claim: "The leaderboard will rank models based on their performance in arena comparisons" (block 2) — Arena comparisons backend implemented with 5 endpoints: `/arena/compare`, `/arena/comparisons`, `/arena/comparisons/{id}`, `/arena/comparisons/{id}/results`, `/arena/comparisons/{id}/delete`. Verified at `EvalServer/src/routers/deepeval_arena.py`.
- Claim: "Every time you run a head-to-head battle in the Arena, results will feed into a ranking table" (block 2) — Arena router includes `list_arena_comparisons` endpoint to retrieve results, consistent with the described data pipeline.
- Claim: "Organization-wide rankings from all arena comparisons" (block 4, item 1) — Describes scope of leaderboard feature; backend arena endpoints are org-scoped. Consistent with implementation.

## Skipped / non-verifiable
- "A model that handles coding well might not rank the same on creative tasks" (block 5) — Opinion/motivation; describes user experience and best practice.
- "Win rate, total comparisons and average scores per model" (block 4, item 2) — Describes specific metrics planned; feature not yet implemented, cannot verify exact metric set.
- "Performance tracking as you add more arena battles over time" (block 4, item 3) — Describes expected behavior of unimplemented feature; backend readiness confirmed but UI/tracking not yet built.
