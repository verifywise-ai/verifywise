# Audit: policies/policy-templates
**Article path:** shared/user-guide-content/content/policies/policy-templates.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ❌ significant issues (3)

## Summary
The article is largely accurate but has three issues. (1) The article claims "five categories" but the enum defines six (Industry packs is missing from the count). (2) Category names in the article use shortened forms that don't exactly match the code's full enum values. (3) A claim about table columns being "four" is incomplete — the actual UI includes an Actions column making it five.

> Note: Finding 1 was caught by the verification spot-checker, not the original audit. The audit verified "five categories" against the enum but counted incorrectly.

## Findings

### Finding 1 — Article claims "five categories" but code has six
- **Type:** Quantitative
- **Status:** ❌ wrong
- **Doc says:** "Templates are organized into five categories" (block 74)
- **Reality:** `PolicyTemplateCategory` enum defines 6 values: Core_AI_Governance, Model_Lifecycle_Policies, Data_and_Security, Legal_and_Compliance, People_and_Organization, Industry_Packs.
- **Evidence:** `Clients/src/domain/enums/policy.enum.ts:1-8` (6 enum members)
- **Suggested fix:** Change "five categories" to "six categories" in block 74.
- **Confidence:** high

### Finding 2 — Category names abbreviated in article table
- **Type:** UI
- **Status:** ⚠️ partial
- **Doc says:** "Category" column shows values like "Core AI governance", "Model lifecycle", "Data and security", "Legal and compliance", "People and organization" (block 124–138)
- **Reality:** Code enum `PolicyTemplateCategory` defines full names: "Core AI governance policies", "Model lifecycle policies", "Data and security AI policies", plus two exact matches ("Legal and compliance", "People and organization")
- **Evidence:** `Clients/src/domain/enums/policy.enum.ts:1-7` shows full category names; `Clients/public/data/PolicyTemplates.json` confirms these are the actual stored values
- **Suggested fix:** Update article table rows to use full category names matching the enum: e.g., "Core AI governance policies" instead of "Core AI governance"
- **Confidence:** high

### Finding 3 — Table column count incomplete
- **Type:** UI
- **Status:** ⚠️ partial
- **Doc says:** "The templates tab shows a table with four columns: ID, title, tags and description." (block 64)
- **Reality:** The PolicyTemplates.tsx component defines five columns: ID, Title, Tags, Description, and Actions. The Actions column is marked `alwaysVisible: true`, making it a permanent part of the table UI.
- **Evidence:** `Clients/src/presentation/pages/PolicyDashboard/PolicyTemplates.tsx:31-38`
- **Suggested fix:** Update block 64 to say "five columns" and include Actions, or clarify that it shows "four data columns plus an Actions column"
- **Confidence:** high

## Verified claims (sampled)

- Claim: "library of 15 pre-built policy templates" (block 13) — verified at `Clients/public/data/PolicyTemplates.json`: 15 templates present ✅
- ~~Claim: "Templates are organized into five categories" (block 74) — verified at `Clients/src/domain/enums/policy.enum.ts`: 5 enum values~~ — **incorrect verification, see Finding 1**
- Claim: "policy editor opens. It's a rich text editor built on TipTap with a familiar toolbar." (block 235) — verified at `Clients/src/presentation/components/RichTextEditor/index.tsx:3`: imports `@tiptap/react` ✅
- Claim: All 15 specific template titles exist (e.g., "AI Ethical Use Charter", "AI Governance Policy", "Model Validation and Testing Policy") — verified at `Clients/public/data/PolicyTemplates.json`: all 15 names found ✅
- Claim: Template tags include "AI ethics, Fairness, Transparency, Explainability" (block 340) — verified at `Clients/src/domain/models/Common/policy/policyManager.model.ts:3-23`: `POLICY_TAGS` constant includes these tags ✅

## Skipped / non-verifiable

- "Writing AI governance policies from scratch requires deep knowledge..." (block 32) — reason: motivation/framing only, not a specific claim about product behavior
- "Templates give you professionally written content built on industry best practices..." (block 32) — reason: quality claim, not verifiable against code
- "Start with 3-4 core governance policies (AI Ethics, AI Risk Management, AI Governance)..." (block 325) — reason: recommendation/best practice, not a verifiable feature claim
- Policy status values "Draft, Under review, Approved, Published, Archived, Deprecated" (block 277) — reason: code model stores status as generic string field; enum definition not found to verify exhaustive list. Marked ❓ rather than skipped due to verifiability attempt, but insufficient code linkage for high confidence.
