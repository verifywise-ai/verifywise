# Audit: ai-gateway/analytics

**Article path:** shared/user-guide-content/content/ai-gateway/analytics.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (1)

## Summary

The analytics article is mostly accurate. All summary card metrics match the UI implementation exactly. Metadata tags and compliance evidence claims are verifiable against code. One terminology mismatch: the article refers to the time period as "Today" while the UI labels it "Last 24 hours"—a minor discrepancy but one that could confuse users navigating the feature.

## Findings

### Finding 1 — Time period selector terminology mismatch

- **Type:** UI
- **Status:** ⚠️ partial
- **Doc says:** "Use the dropdown in the top right to switch between Today, 7 days, 30 days, and 90 days. Your selection is saved and persists across sessions. When "Today" is selected, the cost chart shows hourly bars instead of a daily trend line." (block ~5)
- **Reality:** The time period selector is labeled with `PERIOD_OPTIONS` in the React component. The first option is `{ _id: "1d", name: "Last 24 hours" }` not "Today". The persistence and chart behavior (hourly bars for 1d, daily trend for longer periods) are correct.
- **Evidence:** `/Users/gorkemcetin/verifywise/Clients/src/presentation/pages/AIGateway/SpendDashboard/index.tsx:45-50` shows the PERIOD_OPTIONS array; line 46 explicitly labels the first period as "Last 24 hours". Chart rendering at line 270 confirms behavior.
- **Suggested fix:** Replace "Today" with "Last 24 hours" in the time period selector description to match the actual UI label.
- **Confidence:** high

## Verified claims (sampled)

- Claim: "4 stat cards at the top show metrics for the selected time period: Total cost, Total requests, Total tokens, Avg latency" (block ~3) — verified at `SpendDashboard/index.tsx:226-231`. All four StatCard components render with exact titles and matching tooltips.
- Claim: "Every request through the AI Gateway is tracked with cost, token count, latency and model" (block ~1) — verified at `SpendDashboard/index.tsx:154-157` which extracts total_cost, total_requests, total_tokens, and avg_latency_ms from the API response.
- Claim: "Your selection is saved and persists across sessions" (block ~5) — verified at `SpendDashboard/index.tsx:55-57` using `localStorage.getItem("vw_ai_gateway_analytics_period")`.
- Claim: "When [period selected], the cost chart shows hourly bars instead of a daily trend line" (block ~5) — verified at line 270 which conditionally renders "Cost by hour" for 1d period and "Cost over time" for longer periods.
- Claim: "API callers can attach metadata to requests" and "metadata is stored in the spend log and visible in expanded request details" (block ~10) — verified at `SpendDashboard/index.tsx:98-107` which fetches spend data and maps metadata fields from the API response.

## Skipped / non-verifiable

- "Analytics data can be used as compliance evidence for EU AI Act Article 12 (record-keeping) and ISO 42001 Clause 9 (performance evaluation)" (block ~11) — reason: compliance mapping is aspirational/regulatory claim without explicit code linkage; marked per audit spec guidelines.
- "A 'Cost by tag' API endpoint is available for programmatic tag-based analytics" (block ~10) — reason: endpoint availability claim requires running backend or API discovery; not verified against codebase alone.
