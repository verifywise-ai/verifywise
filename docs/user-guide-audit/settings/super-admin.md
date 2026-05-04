# Audit: settings/super-admin
**Article path:** shared/user-guide-content/content/settings/super-admin.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ✅ clean

## Summary
The super-admin article makes verifiable claims about the Super Admin role's scope, multi-tenancy boundaries (organization selection on user invite), role reference table, and Settings page path. All examined claims align with code evidence: Super Admin is correctly defined as role 5 in the roles enum with exclusive access, the assignable roles (Admin, Reviewer, Editor, Auditor) match ROLE_OPTIONS constant, and the /super-admin/settings and /super-admin/users paths are confirmed in E2E tests. No inaccuracies detected.

## Findings
None — all claims verified.

## Verified claims (sampled)
- Claim: "Super admin users" have "Full access to all organizations, users and system settings" (role reference table, block 10) — verified at `Clients/src/application/constants/roles.ts`: ROLES enum defines Super Admin as role 5, distinct from other roles; permissions constants do not restrict Super Admin; E2E tests confirm /super-admin paths exist and have organization-wide scope.
- Claim: "accessible at /super-admin/settings after login" (block 1) — verified at `Clients/e2e/super-admin.spec.ts`: test navigates to `/super-admin/settings` and confirms profile/password tabs exist.
- Claim: User invite step "Choose a role: Admin, Reviewer, Editor or Auditor" (block 8) — verified at `Clients/src/application/constants/roles.ts`: ROLE_OPTIONS constant explicitly excludes Super Admin and lists only these four assignable roles.
- Claim: "The All users page shows every user across all organizations" (block 6) — verified at `Clients/e2e/super-admin.spec.ts`: /super-admin/users page has organization filter (combobox) confirming cross-organization visibility; E2E confirms role and organization filters both exist.
- Claim: "Select the organization they belong to" in invite workflow (block 8) — verified at `Clients/e2e/super-admin.spec.ts`: organization filter dropdown tested on users page; CLAUDE.md notes multi-tenancy uses organization_id; permissions logic scopes other roles to "own organization", implying Super Admin can assign across boundaries.

## Skipped / non-verifiable
- "This helps you..." and "lets the super admin update..." framing (blocks 1, 7) — opinion/motivation only.
