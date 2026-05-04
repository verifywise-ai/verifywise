# Audit: reporting/dashboard-analytics
**Article path:** shared/user-guide-content/content/reporting/dashboard-analytics.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ❌ significant issues (3)

## Summary
The dashboard-analytics article correctly documents the greeting functionality, widget navigation, and status chart displays. However, it contains three major inaccuracies regarding dashboard customization features. The article describes an edit mode with a lock icon, show/hide cards dropdown, drag-and-drop widget rearrangement, and widget resizing capabilities. These features do not exist in the codebase—the dashboard uses a fixed grid layout with only a view toggle (Operations/Executive) for layout switching.

## Findings

### Finding 1 — Missing edit mode lock icon and customization UI
- **Type:** Behavior
- **Status:** ❌ wrong
- **Doc says:** "Click the lock icon in the top right corner of the dashboard... The icon changes to an unlocked state, meaning edit mode is active... A 'Show/hide cards' selector appears next to the lock icon" (block 2)
- **Reality:** The IntegratedDashboard component does not contain any lock icon, edit mode toggle, or Show/hide cards dropdown. The dashboard header contains only a ButtonToggle for switching between Operations and Executive views. All customization logic described in blocks 3–6 is absent from the implementation.
- **Evidence:** `Clients/src/presentation/pages/DashboardOverview/IntegratedDashboard.tsx:317–338` (header renders ButtonToggle and AddNewMegaDropdown only, no lock icon)
- **Suggested fix:** Remove or rewrite the entire "Entering edit mode" subsection (blocks 3–6), or implement the documented lock icon and edit mode UI if it is planned for a future release.
- **Confidence:** high

### Finding 2 — Missing widget drag-and-drop rearrangement feature
- **Type:** Behavior
- **Status:** ❌ wrong
- **Doc says:** "Click and hold the widget header (a grip icon appears when in edit mode)... Drag the widget to your desired position... Other widgets rearrange automatically to make room" (block 8)
- **Reality:** The dashboard does not support dragging widgets. Widgets are rendered using CSS Grid with fixed gridTemplateColumns; they do not respond to drag events and cannot be reordered by the user. The only layout variation is the Operations vs. Executive view toggle.
- **Evidence:** `Clients/src/presentation/pages/DashboardOverview/IntegratedDashboard.tsx:390–460` (example: executive view uses `display: "grid"` with `gridTemplateColumns: "repeat(3, 1fr)"` but no drag handlers or GridLayout library)
- **Suggested fix:** Remove the "Rearranging widgets" section (block 8), or implement drag-and-drop using react-grid-layout or a similar library.
- **Confidence:** high

### Finding 3 — Missing widget resizing capability
- **Type:** Behavior
- **Status:** ❌ wrong
- **Doc says:** "Drag any edge or corner of a widget to resize it... Widgets snap to a grid for consistent alignment... Some widgets have fixed sizes and can't be resized" (block 9)
- **Reality:** The dashboard does not support widget resizing. All widgets are rendered in fixed CSS Grid cells with no resize handles, ResizeObserver hooks, or resize event listeners. The statement about widgets having fixed vs. variable sizes is moot because none can be resized.
- **Evidence:** `Clients/src/presentation/pages/DashboardOverview/IntegratedDashboard.tsx` (no resize handlers in DashboardCard or child components; grid cells are static)
- **Suggested fix:** Remove the "Resizing widgets" section (block 9), or implement resizing with a grid library.
- **Confidence:** high

## Verified claims (sampled)
- Claim: "The dashboard is the first screen you see after logging in" (block 0) — verified at `Clients/src/application/config/routes.tsx` (/overview is the default dashboard route)
- Claim: "The dashboard greets you based on the time of day. Morning, afternoon and evening greetings change automatically" (block 5) — verified at `Clients/src/application/utils/greetings.ts:105–113` (implements morning 05:00–11:59, afternoon 12:00–16:59, evening 17:00–21:59)
- Claim: "On special occasions like international observance days, you may see themed greetings" (block 5) — verified at `Clients/src/application/utils/greetings.ts:18–73` (includes Earth Day, Women's Day, New Year, etc.)
- Claim: "Each widget is clickable and takes you to the matching section of the platform" (block 17 intro) — verified at `Clients/src/presentation/components/Cards/DashboardCard/index.tsx:45` (onClick handler calls navigate when navigateTo prop is set)
- Claim: "Widgets that have status workflows show a donut chart" (block 3 intro) — verified at `Clients/src/presentation/pages/DashboardOverview/IntegratedDashboard.tsx:455` (RiskDonutWithLegend and status card components are rendered)

## Skipped / non-verifiable
- "Widget cards display at-a-glance metrics for different parts of your governance program" (block 2) — reason: opinion/motivation
- "You can quickly spot areas that need attention" (block 1) — reason: opinion/motivation
- "Your dashboard layout saves automatically and will be restored when you return" (block 10, callout) — reason: automatic behavior; localStorage is used but this is not a verifiable feature claim
