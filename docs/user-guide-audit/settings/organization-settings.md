# Audit: settings/organization-settings
**Article path:** shared/user-guide-content/content/settings/organization-settings.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ❌ significant issues (2)

## Summary
The article contains two significant errors: (1) Organization name character limit is documented as 2–100 characters but code enforces 2–50 characters, a 100% exaggeration. (2) Editor role is listed as able to modify organization settings, but code restricts edit permission to Admin only. These are material inaccuracies that could mislead users about system capabilities and access control.

## Findings

### Finding 1 — Organization name character limit mismatch
- **Type:** Quantitative claim
- **Status:** ❌ wrong
- **Doc says:** "The organization name must be between 2 and 100 characters" (block 10, bullet-list item 1)
- **Reality:** Code enforces maximum of 50 characters: `if (this.name.trim().length > 50) { return { accepted: false, message: 'Organization name must be less than 50 characters' }; }`
- **Evidence:** `/Users/gorkemcetin/verifywise/Clients/src/domain/models/Common/organization/organization.model.ts:35`
- **Suggested fix:** Update claim to "The organization name must be between 2 and 50 characters"
- **Confidence:** high

### Finding 2 — Editor role listed as able to edit organization settings
- **Type:** Permission/capability claim
- **Status:** ❌ wrong
- **Doc says:** "Only users with Admin or Editor roles can modify organization settings. Reviewers and Auditors can see the settings but can't make changes." (block 5, callout)
- **Reality:** Code restricts organization edit permission to Admin only: `organizations: { view: ["Admin", "Editor", "Auditor"], create: ["Admin"], edit: ["Admin"], }`
- **Evidence:** `/Users/gorkemcetin/verifywise/Clients/src/application/constants/permissions.ts:27–31`
- **Suggested fix:** Update claim to "Only users with Admin role can modify organization settings. Editors, Reviewers, and Auditors can see the settings but can't make changes."
- **Confidence:** high

## Verified claims (sampled)

- Claim: "Organization settings let you configure your organization's identity and branding in VerifyWise" (block 1) — verified at domain model `/Users/gorkemcetin/verifywise/Clients/src/domain/models/Common/organization/organization.model.ts:1–5` (name and logo properties)
- Claim: "The organization name identifies your company or team across VerifyWise" (block 7) — verified at model definition `organization.model.ts:3` (name field persisted)
- Claim: "Generated reports show the organization name at the time of generation" (block 11, bullet 3) — model supports this (`name` property stored per organization instance) though report rendering not verified
- Claim: "The logo appears in various places across the platform" (block 13) — model supports logo field (`logo` property at `organization.model.ts:4`), specific UI placements unverified
- Claim: "Organization name must be at least 2 characters" (block 10, bullet 1, minimum) — verified at `organization.model.ts:32–34`: `if (this.name.trim().length < 2) { return { accepted: false, ... } }`

## Skipped / non-verifiable

- "To access organization settings: Click on Settings in the sidebar footer. Select the Organization tab" (blocks 4–5) — reason: UI navigation path requires browser escalation to verify button labels and tab existence in rendered interface
- "Click the Update button below the logo placeholder" (block 16, ordered-list item 1) — reason: button label is UI rendering verification; did not escalate to browser per spec scope
- "The logo uploads and displays automatically" (block 16, ordered-list item 3) — reason: multi-step behavior (upload, re-render) requires browser/state verification
