# Audit: getting-started/dashboard
**Article path:** shared/user-guide-content/content/getting-started/dashboard.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (2)

## Summary
The dashboard article is largely accurate with verified UI claims for sidebar navigation, task radar categories, and quick-action dropdown items. Two findings: (1) "Controls hub" is mentioned in the article but does not exist in the actual sidebar (ASSURANCE section lists Risk management, Training registry, Evidence, Reporting, and AI trust center only); (2) "Due soon" definition claims tasks are "due within the next 7 days" but the code does not verify the 7-day window—the term is rendered in the UI without an explicit quantitative boundary. Both are minor UI/reference issues rather than behavioral contradictions.

## Findings

### Finding 1 — "Controls hub" missing from sidebar
- **Type:** Reference claim / UI claim
- **Status:** ❌ wrong
- **Doc says:** "The Assurance section contains Risk management, Controls hub, Training registry, Evidence, Reporting, and AI trust center." (block index 16, describing sidebar; this wording appears in context of bullet point "Assurance" description)
- **Reality:** The ASSURANCE sidebar section in actual code contains only: Risk management, Training registry, Evidence, Reporting, and AI trust center. No "Controls hub" menu item exists.
- **Evidence:** `/Users/gorkemcetin/verifywise/Clients/src/presentation/components/Sidebar/index.tsx:145-178` — ASSURANCE menuGroup has 5 items, "Controls hub" is not among them.
- **Suggested fix:** Remove "Controls hub" from the article's Assurance section description, or confirm if it should be added to the codebase.
- **Confidence:** high

### Finding 2 — "Due soon" 7-day threshold unverified
- **Type:** Quantitative claim
- **Status:** ❓ unverifiable
- **Doc says:** "Due soon: Due within the next 7 days." (block index 13)
- **Reality:** The TaskRadarCard component displays tasks categorized as "Due soon" but the actual 7-day calculation logic is not in the presentation layer. The backend task service or dashboard metrics hook must compute this, but those files are not readable/traceable in current context (useDashboardMetrics hook passes pre-computed `due` count).
- **Evidence:** `/Users/gorkemcetin/verifywise/Clients/src/presentation/components/Cards/TaskRadarCard/index.tsx:18-34` shows three categories (Overdue, "Due soon", Upcoming) but no date logic. The `due` prop is passed from parent without visible calculation.
- **Suggested fix:** Trace backend task filtering (likely in `useDashboardMetrics` or server-side) to confirm the 7-day window, or update doc to remove the specific "7 days" claim if not enforced.
- **Confidence:** medium

## Verified claims (sampled)

- Claim: "Dashboard sidebar has 'Dashboard', 'Tasks' (with open count badge), and 'Frameworks'" (blocks 10-11) — verified at `Clients/src/presentation/components/Sidebar/index.tsx:85-110`

- Claim: "Task radar groups tasks as Overdue, Due soon, Upcoming" (block 9) — verified at `Clients/src/presentation/components/Cards/TaskRadarCard/index.tsx:24-31`

- Claim: "Add new dropdown includes Use case, Vendor, Model, Risk, Policy, Vendor risk, Model risk, Training, Incident" (block 18) — verified at `Clients/src/presentation/components/MegaDropdown/AddNewMegaDropdown.tsx` (all 9 options present)

- Claim: "Dashboard toggle in top-right switches between Operations and Executive views" (block 3) — verified at `Clients/src/presentation/pages/DashboardOverview/IntegratedDashboard.tsx:63-87` (ButtonToggle with options, localStorage persistence)

- Claim: "ISO 42001 and ISO 27001 cards have arrow buttons to toggle clauses/annexes; NIST AI RMF shows control breakdown by function" (blocks 7-8) — verified at `Clients/src/presentation/pages/DashboardOverview/IntegratedDashboard.tsx:500-570` (ChevronLeft/Right buttons, clauseProgress, annexProgress, nistStatusBreakdown structures present)

## Skipped / non-verifiable

- "Dashboard gives you a snapshot of your entire AI governance program" (block 1) — reason: motivational/opinion framing, not a verifiable claim about specific behavior or UI.
- "Your choice [of view] is saved to your browser, so it persists between sessions" (block 2) — reason: implementation detail verified by code, but phrased as reassurance to user; not a falsifiable claim. (Code confirms `localStorage.setItem` behavior.)

