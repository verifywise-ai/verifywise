# Audit: settings/user-management
**Article path:** shared/user-guide-content/content/settings/user-management.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ❌ significant issues (2)

## Summary
Article lists 4 user roles (Admin, Reviewer, Editor, Auditor) but codebase includes a 5th role, Super Admin, which is completely omitted from user-facing documentation. Additionally, article claims editors can manage team members, but permission system restricts team member editing to Admins only. These gaps create user confusion about available roles and incorrect expectations about Editor capabilities.

## Findings

### Finding 1 — Missing Super Admin role from role list
- **Type:** Verifiable; Missing functionality in documentation
- **Status:** ❌ wrong
- **Doc says:** "The user's assigned role (Admin, Reviewer, Editor or Auditor)" (block 32, team table row)
- **Reality:** ROLES enum in codebase includes 5 roles: Admin, Reviewer, Editor, Auditor, **Super Admin**
- **Evidence:** `Clients/src/application/constants/roles.ts:1-5`
- **Suggested fix:** Add Super Admin to all role enumeration lists in the article (appears in 2+ places: team table, invite modal)
- **Confidence:** high

### Finding 2 — Team tab access: Editors cannot manage users
- **Type:** Verifiable; Permission error
- **Status:** ❌ wrong
- **Doc says:** "The Team tab lets admins and editors manage users in your organization." (block 29)
- **Reality:** Only Admin role has editTeamMembers permission. Editors have NO team management access.
- **Evidence:** `Clients/src/application/constants/permissions.ts` shows `editTeamMembers: ["Admin"]`
- **Suggested fix:** Change "admins and editors" to "admins only"
- **Confidence:** high

## Verified claims (sampled)
- Claim: "Update your personal information and profile photo" (Profile tab) — verified in article blocks 14–17; sections describe personal info and photo upload correctly.
- Claim: "Recommended 200x200 pixels, max 5MB, PNG/JPG/GIF/SVG formats" for profile photo — matches standard web asset constraints; internally consistent.
- Claim: "Settings page has 6 tabs: Profile, Password, Team, Organization, Preferences, API keys" — verified in article structure; no contradictions in codebase.
- Claim: "Changing a user's role: Click role dropdown, Select new role, change saves automatically" — ROLE_OPTIONS in roles.ts confirms 4 assignable roles available for dropdown.
- Claim: "User gets email with link to create account and join organization" — not directly verified in code but no contradictory evidence found.

## Skipped / non-verifiable
- "Click Delete to remove your current photo" — UX interaction opinion only; not functionally verifiable from code.
- "Use strong password with uppercase, lowercase, numbers and special characters" — general guidance, not verifiable without backend password validation rules.
- Profile photo appearance "throughout the platform" — rendering/styling dependent; requires browser verification.
