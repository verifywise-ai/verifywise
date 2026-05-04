# Audit: ai-governance/watchtower
**Article path:** shared/user-guide-content/content/ai-governance/watchtower.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ❌ significant issues (1)

## Summary
The article describes a feature called "Event Tracker" that largely aligns with the codebase implementation. However, there is one significant discrepancy: the Events tab table columns described in the article do not match the actual table structure. The article claims the Events tab shows "Event type, User, Timestamp, Details" but the actual implementation includes ID, EVENT TYPE, DESCRIPTION, USER (ID), and TIMESTAMP columns—a material difference in what users will see.

## Findings
### Finding 1 — Events tab table columns do not match documented specification
- **Type:** UI
- **Status:** ❌ wrong
- **Doc says:** "Each row shows: **Event type**, **User**, **Timestamp**, **Details**" (block index 6)
- **Reality:** The EventsTable component (Clients/src/presentation/components/Table/EventsTable/index.tsx:42–48) defines five columns: ID, EVENT TYPE, DESCRIPTION, USER (ID), TIMESTAMP. The article lists four columns and omits ID and DESCRIPTION entirely.
- **Evidence:** `Clients/src/presentation/components/Table/EventsTable/index.tsx:42-48` defines TABLE_COLUMNS array with five items; "Details" is not a column label in the implementation. The actual column for additional context is labeled "DESCRIPTION", not "Details".
- **Suggested fix:** Update block 6 to list the actual columns: "Each row shows: **ID**, **Event type**, **Description**, **User**, **Timestamp**."
- **Confidence:** high

## Verified claims (sampled)
- Claim: "Navigate to **Event Tracker** from the main sidebar" (block 4) — verified at `Clients/src/presentation/components/Sidebar/SidebarFooter.tsx:73` (sidebar menu item labeled "Event Tracker")
- Claim: "The page is organized into two tabs: Events and Logs" (block 4) — verified at `Clients/src/presentation/pages/WatchTower/index.tsx:42-56` (TabBar with two tabs labeled "Events" and "Logs")
- Claim: "The table is paginated, so you can browse through your event history without performance issues" (block 8) — verified at `Clients/src/presentation/pages/WatchTower/Events/index.tsx:50` (EventsTable component instantiated with `paginated={true}`)
- Claim: "Click the refresh button to fetch the latest logs" (block 9, Logs tab) — verified at `Clients/src/presentation/pages/WatchTower/Loggings/index.tsx:96-108` (handleRefresh function and RefreshIcon imported)
- Claim: "Logs are sorted with the most recent entries at the top" (block 9, Logs tab) — verified at `Clients/src/presentation/pages/WatchTower/Loggings/index.tsx:39` (logs array reversed to descending order: `const sortedLogs = [...logsData.data].reverse()`)

## Skipped / non-verifiable
- "Event Tracker gives you a live window into VerifyWise…" (block 2) — reason: motivational/descriptive framing, not a verifiable claim
- "Use it to see who did what, spot patterns and keep things running smoothly" (block 2) — reason: use-case framing, not verifiable against code
- "Review who made changes and when for compliance purposes" (block 10, use case) — reason: describes user motivation, not a specific feature behavior
