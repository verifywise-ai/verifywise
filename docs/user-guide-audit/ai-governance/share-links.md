# Audit: ai-governance/share-links
**Article path:** shared/user-guide-content/content/ai-governance/share-links.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (2)

## Summary
The share-links article is substantially accurate, with default settings correctly documented and UI flow mostly aligned with implementation. However, there are two verifiable inaccuracies: the article omits a fourth setting (`displayToolbar`), and it incorrectly assigns role-based revocation permissions when the actual implementation uses creator ownership.

## Findings
### Finding 1 — Missing default setting in article
- **Type:** Quantitative
- **Status:** ❌ wrong
- **Doc says:** "Choose what fields to include in the shared view. Set an expiration date (how long the link stays active). Optionally allow data export from the shared view." (block index 3)
- **Reality:** Four default settings are configured: `shareAllFields: false`, `allowDataExport: true`, `allowViewersToOpenRecords: false`, `displayToolbar: true`
- **Evidence:** `Servers/domain.layer/models/shareLink/shareLink.model.ts:54-59` (model defaults), `Servers/controllers/shareLink.ctrl.ts:50-54` (controller defaults)
- **Suggested fix:** Add "Display toolbar in shared view" or similar as a fifth configurable option in the creation step.
- **Confidence:** high

### Finding 2 — Role requirement for revoke is wrong
- **Type:** Compliance
- **Status:** ❌ wrong
- **Doc says:** "Revoke share links" requires "Admin" role (block index 10, table row 3)
- **Reality:** Any user can revoke a share link they created, regardless of role. The controller checks `shareLink.created_by !== req.userId` (line 438 in shareLink.ctrl.ts), not role. An Editor can revoke their own link; an Admin cannot revoke another user's link without being its creator.
- **Evidence:** `Servers/controllers/shareLink.ctrl.ts:437-442`
- **Suggested fix:** Change "Admin" to "Creator (any role)" or clarify as "Anyone (for links they created)"
- **Confidence:** high

## Verified claims (sampled)
- Claim: "Share links let you give external stakeholders read-only access" (block 1) — verified via controller, no write endpoints for public token access at `Servers/controllers/shareLink.ctrl.ts:195-258`
- Claim: "Each link is a unique URL with a token that expires after a set period" (block 1) — verified: token generated `crypto.randomBytes(32).toString("hex")` at line 47, expiration checked at line 227-232
- Claim: "When someone opens a share link, they see a read-only view of the resource with only the fields you selected" (block 5) — verified: field filtering logic at lines 602-705 implements `shareAllFields` boolean control
- Claim: "Expired links automatically stop working" (block 8) — verified: expiration validation at `getSharedDataByToken` line 509 returns 403 if expired
- Claim: "Click the **Share** button" (block 3) — verified UI component exists at `Clients/src/presentation/components/ShareViewDropdown/ShareButton.tsx`

## Skipped / non-verifiable
- "They don't need a VerifyWise account" (block 5) — opinion/marketing claim, not a verifiable system property
- "The shared view shows VerifyWise branding and a note that the link was shared by your organization" (block 5) — requires browser/UI test to verify rendering
- "Anyone with the link can view the shared data until it expires" (block 7, callout) — security posture opinion; technically true but not a factual claim to audit
