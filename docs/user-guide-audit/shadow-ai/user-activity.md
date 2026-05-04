# Audit: shadow-ai/user-activity
**Article path:** shared/user-guide-content/content/shadow-ai/user-activity.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ✅ clean

## Summary
All verifiable claims in the user-activity article match the implementation in UserActivityPage.tsx and constants. Column labels, period filter options (7/30/90 days), tab structure, and behavior descriptions are accurate. No discrepancies found.

## Findings
(None — all claims verified as accurate)

## Verified claims (sampled)
- Claim: "The table includes: User... Department... Total prompts... Risk score" (block 5) — verified at `Clients/src/presentation/pages/ShadowAI/UserActivityPage.tsx:92-97` (USERS_COLUMNS definition)
- Claim: "Use the period selector to filter by time window (last 7 days, last 30 days or last 90 days)" (block 6) — verified at `Clients/src/presentation/pages/ShadowAI/constants.tsx:19-23` (PERIOD_OPTIONS: "7d", "30d", "90d")
- Claim: "The table includes: Department... Users... Total prompts... Top tool... Risk score" (block 11) — verified at `Clients/src/presentation/pages/ShadowAI/UserActivityPage.tsx:98-104` (DEPT_COLUMNS definition)
- Claim: "The user's email address (click to open the detail view)" (block 5) — verified at `Clients/src/presentation/pages/ShadowAI/UserActivityPage.tsx:217-228` (handleUserClick fetches and opens detail view)
- Claim: "Both the Users and Departments tabs respect the time period filter" (block 14) — verified at `Clients/src/presentation/pages/ShadowAI/UserActivityPage.tsx:183-215` (fetchData re-runs when viewMode or period changes, both tabs use period state)

## Skipped / non-verifiable
- "Monitor which individuals and departments are using AI tools across your organization" (block 2) — reason: motivation/outcome framing only, not a verifiable UI or behavior claim
- "This helps you identify high-risk users..." (block tip) — reason: opinion, benefit statement only
- "Best practice: Target training to teams..." (block 13) — reason: recommendation/strategy, not a verifiable product fact
