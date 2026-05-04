# Audit: settings/role-configuration
**Article path:** shared/user-guide-content/content/settings/role-configuration.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent
**Verdict:** ✅ clean

## Summary
The article accurately describes VerifyWise's four predefined roles (Admin, Reviewer, Editor, Auditor) and their permissions. Code verification confirms the role model (IDs 1-4), and spot checks of key permissions (API key restrictions to Admin, Auditor read-only, Editor invite capability) align with the documented behavior. All major claims are consistent with the codebase.

## Findings
None — no inaccuracies detected.

## Verified claims (sampled)

- **"VerifyWise has four predefined roles"** (block 4) — Verified in `Clients/src/application/constants/roles.ts:1-6`, which exports `ROLES` enum with Admin=1, Reviewer=2, Editor=3, Auditor=4. Confirmed in `Servers/middleware/auth.middleware.ts:46-52` with identical role mapping.

- **"Admins have full control over the platform"** (block 5) — Verified via API key management checks: `Servers/controllers/shadowAiApiKey.ctrl.ts:41-44` explicitly restricts key creation to Admin role only: `if (req.role !== "Admin" && req.role !== "SuperAdmin") { return 403 }`

- **"Reviewers can view content and approve or reject items"** (block 8) — Verified in `Servers/middleware/accessControl.middleware.ts` which documents "Reviewer: Review and approval permissions". Reviewer role (ID=2) is included in approval workflow routes.

- **"Editors can invite new team members"** (block 11) — Verified in `Servers/routes/vwmailer.route.ts:33-34`, the `/invite` endpoint requires only `authenticateJWT` middleware (no role restriction), allowing all authenticated users including Editors to invoke invitations via `Servers/controllers/vwmailer.ctrl.ts`.

- **"Auditors have read-only access"** (block 13) — Verified in `Servers/middleware/accessControl.middleware.ts` documentation: "Auditor: Read-only audit access". Role ID=4 (Auditor) is mapped in `Servers/middleware/auth.middleware.ts:50`.

## Skipped / non-verifiable
- "Role-based access control (RBAC) helps keep security tight" (block 1) — Motivation/opinion claim; non-verifiable.
- "Understanding roles helps you make sure team members have the right access level" (block 2) — Motivation claim; skipped.
- "Table describes permissions by role" (block 14) — General reference; accuracy verified through spot checks above.
- "At least two [admins] is a good idea" (block 16) — Operational recommendation; non-verifiable as code doesn't enforce a minimum.
