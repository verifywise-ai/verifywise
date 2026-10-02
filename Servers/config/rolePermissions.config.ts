/**
 * Permission catalog and built-in role matrix for custom organization roles
 * (issue #4588).
 *
 * Every `authorize(<permission>)` call site in Servers/routes (and
 * Servers/extensions) maps to exactly one key in this catalog. `legacyRoles`
 * records which hardcoded role-name allowlist the key replaced — a unit test
 * (`rolePermissions.config.test.ts`) asserts the built-in matrix reproduces
 * those legacy allowlists exactly, so the four/five built-in roles keep their
 * pre-matrix behavior with zero drift.
 *
 * Custom roles do NOT appear here: they are resolved per-organization from the
 * `role_permissions` table (see utils/rolePermissions.utils.ts). A custom role
 * with no rows is denied everything.
 */

export interface PermissionMeta {
  /** Module area, shown in the admin UI when granting permissions. */
  module: string;
  /** Human-readable description of what the permission allows. */
  description: string;
  /**
   * The exact role-name allowlist this permission replaces. Used only by the
   * parity test to prove the built-in matrix equals the old behavior.
   */
  legacyRoles: readonly string[];
}

const ADMIN = ["Admin"] as const;
const EDITOR = ["Admin", "Editor"] as const;
const CONTRIBUTOR = ["Admin", "Reviewer", "Editor"] as const;
const READER = ["Admin", "Editor", "Reviewer", "Auditor"] as const;
const SUPER = ["Admin", "SuperAdmin"] as const;

export const ROLE_PERMISSIONS = {
  // ── Admin tier (was authorize(["Admin"])) ────────────────────────────────
  "aiDetection.admin": {
    module: "AI detection",
    description: "Delete scans and configure risk scoring",
    legacyRoles: ADMIN,
  },
  "aiDetectionRepository.admin": {
    module: "AI detection",
    description: "Delete registered repositories",
    legacyRoles: ADMIN,
  },
  "agentDiscovery.admin": {
    module: "AI agent discovery",
    description: "Configure AI agent discovery runs and sources",
    legacyRoles: ADMIN,
  },
  "aiApp.admin": {
    module: "AI applications",
    description: "Delete AI applications",
    legacyRoles: ADMIN,
  },
  "aiApproval.admin": {
    module: "AI approvals",
    description: "Manage AI approval rules",
    legacyRoles: ADMIN,
  },
  "aiAudit.admin": {
    module: "AI audit",
    description: "Run and view AI audits",
    legacyRoles: ADMIN,
  },
  "aiConfirmation.admin": {
    module: "AI confirmations",
    description: "Manage AI confirmation rules",
    legacyRoles: ADMIN,
  },
  "approvalRequest.admin": {
    module: "Approval requests",
    description: "Manage approval requests",
    legacyRoles: ADMIN,
  },
  "approvalWorkflow.admin": {
    module: "Approval workflows",
    description: "Create and delete approval workflows",
    legacyRoles: ADMIN,
  },
  "auditLedger.admin": {
    module: "Audit ledger",
    description: "Verify the audit ledger",
    legacyRoles: ADMIN,
  },
  "autoDriver.admin": {
    module: "Automation driver",
    description: "Configure the automation driver",
    legacyRoles: ADMIN,
  },
  "customField.admin": {
    module: "Custom fields",
    description: "Define and delete custom fields",
    legacyRoles: ADMIN,
  },
  "extension.admin": {
    module: "Extensions",
    description: "Install, configure and remove extensions",
    legacyRoles: ADMIN,
  },
  "file.admin": {
    module: "Files",
    description: "Read raw file content",
    legacyRoles: ADMIN,
  },
  "githubIntegration.admin": {
    module: "GitHub integration",
    description: "Configure the GitHub integration",
    legacyRoles: ADMIN,
  },
  "governanceOs.admin": {
    module: "Governance OS",
    description: "Delete mappings/scenarios and edit preferences",
    legacyRoles: ADMIN,
  },
  "organization.admin": {
    module: "Organization",
    description: "Update organization settings",
    legacyRoles: ADMIN,
  },
  "reporting.admin": {
    module: "Reporting",
    description: "Configure reporting integrations",
    legacyRoles: ADMIN,
  },
  "roles.manage": {
    module: "Roles",
    description: "Create, update and delete custom organization roles",
    legacyRoles: ADMIN,
  },
  "ssoConfig.admin": {
    module: "SSO",
    description: "Configure SSO",
    legacyRoles: ADMIN,
  },

  // ── Editor tier (was authorize(["Admin", "Editor"])) ─────────────────────
  "aiDetection.edit": {
    module: "AI detection",
    description: "Start and cancel scans, manage finding governance and suppressions",
    legacyRoles: EDITOR,
  },
  "aiDetectionRepository.edit": {
    module: "AI detection",
    description: "Register and update repositories, trigger scans",
    legacyRoles: EDITOR,
  },
  "aiApp.edit": {
    module: "AI applications",
    description: "Create and update AI applications",
    legacyRoles: EDITOR,
  },
  "aiContent.edit": {
    module: "AI content",
    description: "Manage AI content",
    legacyRoles: EDITOR,
  },
  "ext.datasetBulkUpload.edit": {
    module: "Extensions",
    description: "Bulk-upload datasets",
    legacyRoles: EDITOR,
  },
  "ext.riskImport.edit": {
    module: "Extensions",
    description: "Import risks",
    legacyRoles: EDITOR,
  },
  "file.edit": {
    module: "Files",
    description: "Bulk-tag files",
    legacyRoles: EDITOR,
  },
  "intakeForm.edit": {
    module: "Intake forms",
    description: "Create and manage intake forms and submissions",
    legacyRoles: EDITOR,
  },
  "fria.edit": {
    module: "FRIA",
    description: "Create and update FRIA assessments",
    legacyRoles: EDITOR,
  },
  "governanceOs.edit": {
    module: "Governance OS",
    description: "Create and update mappings and scenarios",
    legacyRoles: EDITOR,
  },
  "policy.edit": {
    module: "Policies",
    description: "Create and update policies",
    legacyRoles: EDITOR,
  },
  "reportRun.edit": {
    module: "Reporting",
    description: "Run reports",
    legacyRoles: EDITOR,
  },
  "reportTemplate.edit": {
    module: "Reporting",
    description: "Create and update report templates",
    legacyRoles: EDITOR,
  },
  "risks.edit": {
    module: "Risks",
    description: "Create and update risks",
    legacyRoles: EDITOR,
  },
  "scheduledReport.edit": {
    module: "Reporting",
    description: "Schedule reports",
    legacyRoles: EDITOR,
  },
  "task.edit": {
    module: "Tasks",
    description: "Create and update tasks",
    legacyRoles: EDITOR,
  },

  // ── Contributor tier (was authorize(["Admin", "Reviewer", "Editor"])) ────
  "file.contribute": {
    module: "Files",
    description: "Upload files",
    legacyRoles: CONTRIBUTOR,
  },
  "fileManager.contribute": {
    module: "File manager",
    description: "Manage files and folders",
    legacyRoles: CONTRIBUTOR,
  },

  // ── Reader tier (was authorize(["Admin", "Editor", "Reviewer", "Auditor"])) ──
  "aiDetection.read": {
    module: "AI detection",
    description: "View AI detection scans, findings and statistics",
    legacyRoles: READER,
  },
  "aiDetectionRepository.read": {
    module: "AI detection",
    description: "View registered repositories and scan history",
    legacyRoles: READER,
  },

  // ── Super tier (was authorize(["Admin", "SuperAdmin"])) ──────────────────
  "auditLedger.super": {
    module: "Audit ledger",
    description: "Read the audit ledger",
    legacyRoles: SUPER,
  },
  "invitation.super": {
    module: "Invitations",
    description: "Invite and manage users",
    legacyRoles: SUPER,
  },
  "user.deleteSuper": {
    module: "Users",
    description: "Delete users",
    legacyRoles: SUPER,
  },
} satisfies Record<string, PermissionMeta>;

export type PermissionKey = keyof typeof ROLE_PERMISSIONS;

export const ALL_PERMISSION_KEYS = Object.keys(ROLE_PERMISSIONS) as PermissionKey[];

/** Permissions granted to each built-in role — mirrors the legacy allowlists. */
function buildBuiltinMatrix(): Record<string, ReadonlySet<PermissionKey>> {
  // Parity rule: a built-in role is granted exactly the permissions whose
  // legacy allowlist names it — `legacyRoles.includes(role)` is precisely what
  // the old `allowedRoles.includes(req.role)` check did. This is what keeps
  // the five built-in roles' behavior identical to the literal allowlists
  // (e.g. Editor keeps its contributor-tier access, SuperAdmin stays limited
  // to the three super-tier routes).
  const forRole = (role: string): ReadonlySet<PermissionKey> =>
    new Set(
      ALL_PERMISSION_KEYS.filter((key) =>
        (ROLE_PERMISSIONS[key].legacyRoles as readonly string[]).includes(role),
      ),
    );

  return {
    Admin: forRole("Admin"),
    Editor: forRole("Editor"),
    Reviewer: forRole("Reviewer"),
    Auditor: forRole("Auditor"),
    SuperAdmin: forRole("SuperAdmin"),
  };
}

export const BUILTIN_ROLE_PERMISSIONS: Record<
  string,
  ReadonlySet<PermissionKey>
> = buildBuiltinMatrix();

/** Built-in roles are global (organization_id IS NULL) and immutable. */
export const BUILTIN_ROLE_NAMES: ReadonlySet<string> = new Set(
  Object.keys(BUILTIN_ROLE_PERMISSIONS),
);
