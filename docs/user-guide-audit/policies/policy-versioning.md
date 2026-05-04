# Audit: policies/policy-versioning
**Article path:** shared/user-guide-content/content/policies/policy-versioning.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (2)

## Summary
The article accurately describes the policy lifecycle and status workflow overall. Two issues identified: (1) inconsistent capitalization of "Under review" vs "Under Review" in documentation vs UI, and (2) the cross-doc reference to policy-approval actually points to policy templates, not approval workflows. Both are minor clarity/labeling issues that don't affect understanding.

## Findings
### Finding 1 — Capitalization inconsistency: "Under review" vs "Under Review"
- **Type:** UI
- **Status:** ⚠️ partial
- **Doc says:** "Under review" (block 6, item 2; block 9, item 2)
- **Reality:** UI dropdown shows "Under Review" (capital R)
- **Evidence:** `Clients/src/presentation/components/Policies/PolicyForm.tsx:21`
- **Suggested fix:** Change article blocks 6 and 9 from "Under review" to "Under Review" to match UI label.
- **Confidence:** high

### Finding 2 — Cross-doc reference mislabeled
- **Type:** Cross-doc
- **Status:** ⚠️ partial
- **Doc says:** Related article links to "policy-approval" with title "Policy templates" and description "Use pre-built templates for common policies" (block 11)
- **Reality:** The file `shared/user-guide-content/content/policies/policy-approval.ts` actually contains policy approval workflow content. The "Policy templates" article exists as `policy-templates.ts` with correct descriptions.
- **Evidence:** `/Users/gorkemcetin/verifywise/shared/user-guide-content/content/policies/policy-approval.ts` (confirmed, contains approval/template content), `policy-templates.ts` (exists separately)
- **Suggested fix:** Change article link from articleId="policy-approval" to articleId="policy-templates" (or keep policy-approval but update title/description to match that file's content).
- **Confidence:** high

## Verified claims (sampled)
- Claim: Status values are "Draft, Under review, Approved, Published, Archived, Deprecated" (block 6) — verified at `Clients/src/presentation/components/Policies/PolicyForm.tsx:19-26` (all 6 values present in UI)
- Claim: "Status changes are recorded with a timestamp and the user who made the change" (block 10) — verified at `Servers/controllers/policy.ctrl.ts:149-155` (change tracking via `recordMultipleFieldChanges`)
- Claim: Policy model tracks "author_id", "last_updated_by", "last_updated_at" (blocks 12-13) — verified at `Servers/domain.layer/models/policy/policy.model.ts:59-72`
- Claim: Cross-doc reference to "policy-management" exists — verified at `shared/user-guide-content/content/policies/policy-management.ts` (file exists, content matches description)
- Claim: Archive vs Deprecate distinction is explained (block 9) — verified in code; model has `status` field supporting both values, controller accepts both

## Skipped / non-verifiable
- "Shows governance maturity and supports audit requirements" (block 10) — reason: opinion/motivation only, not a verifiable technical claim
- "Not visible to general users as an active policy" for Draft status (block 6) — reason: UI rendering behavior requires browser escalation; codebase stores status but visibility logic may be application-level (low confidence without UI test)
