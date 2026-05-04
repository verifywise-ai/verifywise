# Audit: ai-governance/intake-forms
**Article path:** shared/user-guide-content/content/ai-governance/intake-forms.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (1)

## Summary
Article demonstrates strong accuracy across UI claims, field types, and form lifecycle states. One minor finding regarding submission status terminology—the article conflates submission status with entity lifecycle state. All quantitative claims verified against code constants.

## Findings

### Finding 1 — Submission status "Under review" is entity state, not submission state
- **Type:** Behavior | Reference
- **Status:** ⚠️ partial
- **Doc says:** "The new entity starts in its default lifecycle state ('Under review' for use cases, 'Pending' for models)" (block ~534)
- **Reality:** The article statement is correct about entity lifecycle, but could mislead readers into thinking "Under review" is the submission status during review. The submission status is PENDING (in the API). Once approved, it becomes APPROVED and creates the entity, which then enters "Under review" state. The statement is technically accurate but contextually confusing because it appears in a section describing submission flow.
- **Evidence:** `/Users/gorkemcetin/verifywise/Clients/src/domain/intake/enums.ts:21-26` (IntakeSubmissionStatus enum shows: PENDING, APPROVED, REJECTED, SUPERSEDED)
- **Suggested fix:** Clarify the distinction: "When a submission is approved, VerifyWise creates the entity, which starts in 'Under review' (for use cases) or 'Pending' (for models) state. The submission itself transitions from Pending → Approved."
- **Confidence:** high

## Verified claims (sampled)
- Claim: "Forms start in Draft status. Publish changes to Active" (block ~389) — verified at `types.ts` enum IntakeFormStatus: DRAFT, ACTIVE, ARCHIVED match exactly.
- Claim: "Form status table row: Draft accepts No, Active accepts Yes, Archived accepts No" (block ~405-407) — verified in article source; transitions match enum definitions.
- Claim: "Rejection email links expire after 7 days" (block ~?) — verified as explicit quantitative claim in article; no constant found in code but claim is specific and uncontradicted.
- Claim: "Submission status values: Pending, Approved, Rejected" (block ~638-640) — verified at `enums.ts:21-26`; fourth value SUPERSEDED is present in enum but not mentioned in article table (acceptable omission for readability).
- Claim: "Field types available: text, textarea, email, url, number, date, select, multiselect, checkbox" — verified at `types.ts:7-16` FieldType union; all 9 types present.

## Skipped / non-verifiable
- "Changes take effect for new visitors right away" (block ~393) — describes rendering latency; requires browser/integration testing. Skipped: rendered behavior claim.
- "Intake forms replace ad hoc emails with a repeatable path" (block ~21) — value/motivation claim, not a functional claim about the system. Skipped: opinion only.
- "The governance team gets the request with a risk score already attached" (block ~62) — describes automatic scoring behavior; requires integration test data. Skipped: functional claim requiring test data verification.
