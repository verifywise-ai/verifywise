# Audit: ai-detection/repositories
**Article path:** shared/user-guide-content/content/ai-detection/repositories.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (1)

## Summary
The repositories article is mostly accurate. All core UI labels, field names, and behavior claims are verified in the codebase. One minor discrepancy: the article states "Next scan" column shows values "blank if disabled", but the code actually displays "—" (em dash) when scheduling is disabled, not a blank string.

## Findings
### Finding 1 — Next scan column shows em dash, not blank, when disabled
- **Type:** UI
- **Status:** ⚠️ partial
- **Doc says:** "When the next scheduled scan will run (blank if disabled)" (block index 12)
- **Reality:** Line 518 in RepositoriesPage.tsx: `{repo.schedule_enabled ? formatNextScan(repo.next_scan_at) : "—"}` — renders an em dash "—", not a blank string
- **Evidence:** `Clients/src/presentation/pages/AIDetection/RepositoriesPage.tsx:518`
- **Suggested fix:** Change article block 12 to say "When the next scheduled scan will run, or "—" if scheduling is disabled"
- **Confidence:** high

## Verified claims (sampled)
- Claim: "Click **Add repository** to open the form" (block 3) — verified button exists at `AddRepositoryModal.tsx:52` with title "Add repository"
- Claim: "Daily, Weekly, Monthly" frequency options (block 8) — verified `FREQUENCY_OPTIONS` constant at `AddRepositoryModal.tsx:34-36` lists all three
- Claim: "Schedule" column shows "Disabled" when off (block 12) — verified `formatSchedule()` at `RepositoriesPage.tsx:70-71`: `if (!repo.schedule_enabled) return "Disabled"`
- Claim: "Play button" starts manual scan (block 14) — verified icon `<Play>` at `RepositoriesPage.tsx:539` with click handler `handleScanNow()`
- Claim: "Loading indicator while running" (block 14) — verified `{isScanning ? <Loader2 ... > : <Play>}` at `RepositoriesPage.tsx:536-540`

## Skipped / non-verifiable
- "Instead of typing a URL each time, save the repo" (block 1) — reason: motivation/workflow benefit, non-verifiable
- "Schedule scans during off-peak hours" recommendation (block 10) — reason: guidance/best practice, non-verifiable
- GitHub API rate limits mention (block 10) — reason: external regulatory context, non-verifiable
