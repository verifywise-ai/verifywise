# Audit: ai-detection/history
**Article path:** shared/user-guide-content/content/ai-detection/history.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (1)

## Summary
The article is largely accurate: UI elements, table structure, and core behaviors are correctly documented. One claim about scan statuses is incomplete: the article lists four states (Completed, Failed, Cancelled, Scanning) but the code implements six states including Pending and Cloning, which users may encounter. Cross-document references to the scanning article are verified. The "indefinitely" retention claim is non-verifiable from code.

## Findings

### Finding 1 — Missing scan status states
- **Type:** UI claim
- **Status:** ⚠️ partial
- **Doc says:** "Current state: Completed, Failed, Cancelled or Scanning" (block 4, bullet-list item 2)
- **Reality:** The codebase implements six statuses: `pending`, `cloning`, `scanning`, `completed`, `failed`, `cancelled`. The STATUS_CONFIG constant at Clients/src/presentation/pages/AIDetection/HistoryPage.tsx includes Pending and Cloning, and these appear as filter options in FILTER_COLUMNS and are tracked as active statuses in ACTIVE_STATUSES constant.
- **Evidence:** `Clients/src/presentation/pages/AIDetection/HistoryPage.tsx:35-40` (STATUS_CONFIG), lines 58-67 (FILTER_COLUMNS with pending and cloning options)
- **Suggested fix:** Update block 4 to list all six status values: "Completed, Failed, Cancelled, Scanning, Pending, or Cloning" or restructure to note "additional internal states."
- **Confidence:** high

## Verified claims (sampled)
- Claim: "Click column headers to sort" (block 10) — verified at `Clients/src/presentation/pages/AIDetection/HistoryPage.tsx:150-175` (SortableTableHead component with clickable headers and sort indicators)
- Claim: "Use the filter button to narrow by status, repository, or who triggered the scan" (block 10) — verified at lines 58-67 FILTER_COLUMNS with "status", "repository", "triggered_by" text fields
- Claim: "Delete a scan record by clicking the trash icon" (block 12) — verified at line 21 (Trash2 icon imported from lucide-react) and delete handler in component
- Claim: Cross-doc reference to "Scanning repositories" article (block 5 article-links) — verified: `shared/user-guide-content/content/ai-detection/scanning.ts` exists with matching description "How to scan repositories for AI/ML usage"
- Claim: "Risk score, library findings, API calls, secrets and security issues" (block 6) — verified at pdf-templates/ai-detection.tsx: risk scores calculated across five dimensions (Data Sovereignty, Transparency, Security, Autonomy Level, Supply Chain); findings types align with code structure

## Skipped / non-verifiable
- "Scan records are kept indefinitely for audit purposes" (block 2) — reason: no data retention policy, TTL configuration, or deletion-prevention code found in codebase. This is a compliance/regulatory claim requiring product decision, not code verification.
- "if calculated" modifier on risk score (block 4) — reason: clarifies conditional behavior but not independently testable from UI/table structure alone; would require specific edge-case data state.
