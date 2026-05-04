# Audit: shadow-ai/insights
**Article path:** shared/user-guide-content/content/shadow-ai/insights.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (1)

## Summary
The article accurately describes the Insights dashboard UI and time period filtering. However, the risk score calculation weights are stated incorrectly. The documented breakdown (approval 40%, data/compliance 25%, usage volume 15%, department sensitivity 20%) does not match the actual implementation, which uses a different method for calculating usage volume weight.

## Findings
### Finding 1 — Risk score calculation weights incorrect
- **Type:** Quantitative
- **Status:** ❌ wrong
- **Doc says:** "Risk scores range from 0 to 100 and are recalculated nightly. They factor in approval status (40%), data and compliance policies (25%), usage volume (15%) and department sensitivity (20%)." (block 9, callout)
- **Reality:** Risk scores do use the four factors with correct percentages (40%, 25%, 20%), but usage volume is calculated as `Math.min(volumeRatio * 50, 100)` where `volumeRatio = toolEvents / orgAvgEvents`, then multiplied by 15% weight. This is not a direct "15% of the event volume" but rather a normalized/capped linear scaling. Usage volume weight caps at 100 and is capped again during normalization.
- **Evidence:** `Servers/services/shadowAiRiskScoring.service.ts:109-111` shows `usageVolumeWeight = Math.min(Math.round(volumeRatio * 50), 100)` — the weight is normalized to tool's event ratio (up to 50) and capped at 100, then multiplied by 0.15 in the composite formula (line 126).
- **Suggested fix:** Update the callout to clarify that usage volume is normalized: "...usage volume (15%, normalized to event ratio against org average)..." or expand the callout with a data policy scoring table (like lines 28-35 of the risk scoring service).
- **Confidence:** high

## Verified claims (sampled)
- Claim: "The top of the page displays four summary cards that update based on the selected time period" (block 4) — verified at `InsightsPage.tsx:114-146` with four StatCard components: Unique apps, AI users, Highest risk tool, Most active department.
- Claim: "Available options are last 7 days, last 30 days and last 90 days" (block 26, time period section) — verified at `constants.tsx:19-23` where PERIOD_OPTIONS defines exactly these three: "7d", "30d", "90d".
- Claim: "This panel lists the top 5 AI tools sorted by their risk score" (block 8) — verified at `InsightsPage.tsx:71` which calls `getTools({ sort_by: "risk_score", order: "desc", limit: 5 })`.
- Claim: "A pie chart showing how AI tool usage is distributed across departments" (block 12) — verified at `InsightsPage.tsx:55-57` with `departments` state and call to `getUsersByDepartment(period)` at line 70, rendered as VWDonutChart.
- Claim: "Two horizontal bar charts on the right side of the dashboard show..." top tools by events and users (block 14-15) — verified at `InsightsPage.tsx:68-69` fetching `getToolsByEvents` and `getToolsByUsers` with limit 6, rendered as VWBarChart components.

## Skipped / non-verifiable
- "Risk scores... are recalculated nightly" (block 9) — reason: nightly schedule cannot be verified from frontend code; would require backend cron job inspection or API documentation. Marked low-confidence in Finding 1 evidence.
- "Helps identify which parts of the organization are most actively using AI tools and may need additional oversight or training" (block 12) — reason: motivation/interpretation only, not a verifiable claim.
- "Click 'Go to AI tools' to view the full tool inventory" (block 8) — reason: unverifiable without browser; UI link text not confirmed in code review.
