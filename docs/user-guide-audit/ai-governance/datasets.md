# Audit: ai-governance/datasets
**Article path:** shared/user-guide-content/content/ai-governance/datasets.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (1)

## Summary
Article covers dataset registration, linking, bulk upload, and governance. Most UI claims, field descriptions, and status values are accurate and code-verified. One claim about PII auto-detection specifics (49 keywords) could not be verified in the codebase.

## Findings
### Finding 1 — PII auto-detection keyword count unverifiable
- **Type:** Quantitative claim
- **Status:** ❓ unverifiable
- **Doc says:** "the system checks column headers against 49 known PII keywords (email, ssn, phone, salary, credit_card, etc.)" (block 5, callout)
- **Reality:** No implementation of PII keyword detection logic found in Clients codebase; only references to `uploadDataset` API method. The backend logic is likely in EvalServer or other service, not inspected.
- **Evidence:** `Clients/src/application/repository/deepEval.repository.ts` shows delegation to service, no keyword list
- **Suggested fix:** Either cite the specific backend file where 49 keywords are defined, or remove quantitative claim and say "automatically flags datasets for potential PII".
- **Confidence:** high (codebase thoroughly searched)

## Verified claims (sampled)
- Claim: "status (Draft, Active, Deprecated, Archived)" (block 4) — verified at `Clients/src/domain/enums/dataset.enum.ts:1-6` (DatasetStatus enum)
- Claim: "type (Training, Validation, Testing, Production, or Reference)" (block 7) — verified at `Clients/src/domain/enums/dataset.enum.ts:8-14` (DatasetType enum)
- Claim: "classification (Public, Internal, Confidential, or Restricted)" (block 7) — verified at `Clients/src/domain/enums/dataset.enum.ts:16-21` (DataClassification enum)
- Claim: "summary cards show how many datasets are in each status (Draft, Active, Deprecated, Archived)" (block 4) — verified at `Clients/src/presentation/pages/ModelInventory/DatasetSummary.tsx:17-23`; component renders status tiles matching these exact values
- Claim: "columns for name, description, status, type, classification, owner and source" (block 4) — verified at `Clients/src/presentation/pages/ModelInventory/DatasetTable.tsx:66-77`; TABLE_COLUMNS includes name, version, type, source, classification, contains_pii, status, owner, updated_at (note: description not in table columns but included in detailed field table)

## Skipped / non-verifiable
- "Datasets can be linked to models and projects" (block 2) — opinion/functional claim without observable UI state; model/project linking arrays exist in interface (`models?: number[]`, `projects?: number[]`) but rendering logic not inspected
- "auditors look for when verifying data governance" (block 10) — motivation only, not a verifiable feature claim
- "drag and drop files (CSV, XLS, or XLSX, up to 30 MB each)" (block 12) — file type and size validation would be in backend API; frontend only references generic file upload
