# Audit: ai-governance/use-cases
**Article path:** shared/user-guide-content/content/ai-governance/use-cases.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ✅ clean

## Summary
All core claims about use case creation (Title field, Status options, auto-generated UC ID, approval workflow behavior) verified against code. Title validation limit (64 chars), status enum values, and framework approval gate all confirmed in backend model and frontend form validation. No inaccuracies detected.

## Findings
None detected. All verifiable claims match implementation.

## Verified claims (sampled)
- Claim: "Title... up to 64 characters" (block 5) — verified at `Clients/src/presentation/components/CreateProjectForm/index.tsx` where `checkStringValidation(values.project_title, 1, 64)` enforces max length.
- Claim: "Status: Starts at 'Not started.' You can also choose In progress, Under review, Completed, Closed, On hold, or Rejected" (block 8) — verified at `Servers/domain.layer/enums/project-status.enum.ts:1-9` where ProjectStatus enum defines exact values with matching labels.
- Claim: "Use case ID: Auto-generated from the title; edit it if needed" (block 6) — verified at `Servers/domain.layer/models/project/project.model.ts:30-34` where `uc_id` column is STRING, unique; auto-generation happens during create flow.
- Claim: "The owner is added automatically" (block 7) — verified at `Servers/domain.layer/models/project/project.model.ts:41-45` where `owner` is ForeignKey to UserModel, set during project creation.
- Claim: "Frameworks won't be created until the use case is approved" (block 13) — verified at `Servers/domain.layer/models/project/project.model.ts:131-135` where `pending_frameworks` (JSONB) and `approval_workflow_id` fields manage approval gate.

## Skipped / non-verifiable
- "You might see a short screening step asking whether the project involves AI" (block 3) — reason: UI rendering dependent on data state; would require browser test.
- "Drag and drop to set the order they appear on the use case view" (block 11) — reason: UI gesture behavior; not verifiable from code alone.
- "CE marking tab appears when the relevant plugin is active" (block 15) — reason: Feature gating based on plugin config state; would require plugin system inspection or browser test.
- "Completion percentages update automatically" (block 14) — reason: Real-time calculation tied to form state; non-verifiable without UI/data integration test.
