# Verification spot-checks — ai-detection
**Date:** 2026-04-29
**Reports spot-checked:** 5
**Claims re-verified:** 10 (2 per report)
**Failed spot-checks:** 0

## Per-report results

### history.md
- ✅ "Use the filter button to narrow by status, repository, or who triggered the scan" (verified at `HistoryPage.tsx:58-67`) — confirmed: FILTER_COLUMNS array contains all three filter types ("status", "repository", "triggered_by")
- ✅ "Click column headers to sort" (verified at `HistoryPage.tsx:150-175`) — confirmed: SortableTableHead component with clickable headers and sort indicators implemented

### repositories.md
- ✅ "Daily, Weekly, Monthly" frequency options (verified at `AddRepositoryModal.tsx:34-36`) — confirmed: FREQUENCY_OPTIONS constant explicitly lists all three options
- ✅ "Play button" starts manual scan (verified at `RepositoriesPage.tsx:539`) — confirmed: Play icon with click handler `handleScanNow()` present at line

### risk-scoring.md
- ✅ "Letter grade from A (Excellent) to F (Critical)" (verified at `riskScoringTypes.ts:122-129`) — confirmed: getGradeLabel function maps A→"Excellent", F→"Critical"
- ✅ "Count of dimensions scoring below the 70-point threshold" (verified at `RiskScoreCard.tsx:100`) — confirmed: dimensionsAtRisk correctly filters dimensions where score < 70

### scanning.md
- ✅ "Click **Scan** to begin the analysis" (verified at `ScanPage.tsx:516`) — confirmed: Scan button label present in component
- ✅ "Governance status... Reviewed, Approved, Flagged" (verified at `ScanDetailsPage.tsx:207-209`) — confirmed: GOVERNANCE_STATUS_CONFIG contains exact three labels with correct icon mappings

### settings.md
- ✅ "The 5 dimensions: Data sovereignty, Transparency, Security, Autonomy, Supply chain" (verified at `riskScoringTypes.ts:176-182`) — confirmed: DIMENSION_LABELS export lists all five with exact names
- ✅ "10 OWASP LLM Top 10 types" (verified at `riskScoringTypes.ts:79-150`) — confirmed: VULNERABILITY_TYPES array contains LLM01–LLM10, all 10 entries present

## Summary

The audit subagent was highly reliable. All 10 spot-checked claims matched their cited source code exactly. The auditor demonstrated strong code navigation skills, accurate line number citations, and correct interpretation of both UI components and type definitions. No false positives or inaccuracies detected. The 5 reports (history.md, repositories.md, risk-scoring.md, scanning.md, settings.md) each carried ⚠️ minor issues verdicts, which reflects genuine minor UI/documentation discrepancies already noted in the findings sections, not audit errors. Recommend accepting these reports with confidence.
