# Audit: training/training-tracking
**Article path:** shared/user-guide-content/content/training/training-tracking.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (2)

## Summary
The article is largely accurate with consistent terminology for table columns and status values. However, two minor UI label mismatches were found: the button is labeled "New training" not "Add training", and the article describes the status as "In progress" when the actual enum value is "In Progress" with a capital P. These are minor discrepancies that do not affect functionality but should be corrected for documentation accuracy.

## Findings

### Finding 1 — Button label mismatch: "Add training" vs "New training"
- **Type:** UI
- **Status:** ❌ wrong
- **Doc says:** "Click \"Add training\" in the toolbar" (block index 113)
- **Reality:** The button in `/Clients/src/presentation/pages/TrainingRegistar/index.tsx:617` is labeled `text="New training"`, not "Add training"
- **Evidence:** `/Clients/src/presentation/pages/TrainingRegistar/index.tsx:617`
- **Suggested fix:** Change block 113 to read: "Click \"New training\" in the toolbar"
- **Confidence:** high

### Finding 2 — Status enum value capitalization: "In progress" vs "In Progress"
- **Type:** Quantitative
- **Status:** ⚠️ partial
- **Doc says:** "In progress" (blocks 60, 118, 146)
- **Reality:** The TrainingStatus enum defines the value as `InProgress = "In Progress"` with a capital P. The UI filter dropdown at `/Clients/src/presentation/pages/TrainingRegistar/index.tsx:400` shows the user-facing label as "In progress" (lowercase p) but the underlying value is "In Progress" (capital P).
- **Evidence:** `/Clients/src/domain/enums/status.enum.ts:9` and `/Clients/src/presentation/pages/TrainingRegistar/index.tsx:400`
- **Suggested fix:** Clarify whether the doc should reference the enum value ("In Progress") or the displayed label. The displayed label matches the doc ("In progress"), so this is a minor inconsistency at the enum level rather than a doc error. Consider no fix needed for the user guide, as the user-facing text is correct.
- **Confidence:** medium

## Verified claims (sampled)
- Claim: "The table has these columns: Training name, Duration, Provider, Department, Status, People" (blocks 54-62) — verified at `/Clients/src/presentation/pages/TrainingRegistar/index.tsx:99-107` (TRAINING_COLUMNS array matches exactly: training_name, duration, provider, department, status, numberOfPeople)
- Claim: "Status: Current state of the training (Planned, In progress, Completed)" (block 60) — verified at `/Clients/src/domain/enums/status.enum.ts:7-11` (TrainingStatus enum contains Planned, In Progress, Completed)
- Claim: "Only users with Admin or Editor roles can add new training programs" (block 127) — verified at `/Clients/src/presentation/pages/TrainingRegistar/index.tsx:126-127` (permission check: `["Admin", "Editor"].includes(userRoleName)`)
- Claim: "Filter by training name, status, provider, department or duration" (block 164) — verified at `/Clients/src/presentation/pages/TrainingRegistar/index.tsx:387-421` (trainingFilterColumns includes all five filter options)
- Claim: "Group programs by status, provider or department" (block 165) — verified at `/Clients/src/presentation/pages/TrainingRegistar/index.tsx:577-581` (GroupBy options: status, provider, department)

## Skipped / non-verifiable
- "Keeping a record of training activities shows that your team has the knowledge and skills to develop, deploy and govern AI systems responsibly" (block 13) — reason: opinion/motivation framing
- "Training records matter for compliance with AI regulations" (block 17) — reason: regulatory compliance reference external to codebase
- "Anyone involved in developing, deploying, using or governing AI systems should get appropriate training" (block 265) — reason: organizational guidance, not product feature claim
- "Annual refreshers for core topics is a good baseline" (block 255) — reason: best practice recommendation, not verifiable product behavior
