/**
 * Built-in roles that hold each permission key the UI gates on (issue #5314).
 *
 * The UI decides what to show from the caller's real permission keys
 * (GET /roles/my-permissions), the same keys the server authorizes on, so a
 * custom role gets the controls its permissions allow. This table is only the
 * stand-in while that list loads or if it fails: a built-in role answers from
 * here, a custom role is denied. It is a copy of the server's built-in matrix
 * (`legacyRoles` in Servers/config/rolePermissions.config.ts) for these keys,
 * and permissions.test.ts fails if the two drift.
 *
 * It replaced the old role-name `allowedRoles` table and the per-screen role
 * checks; every one maps to a key here with exactly the same built-in roles.
 */
type BuiltinRoleName = "Admin" | "Editor" | "Reviewer" | "Auditor" | "SuperAdmin";

const ADMIN: readonly BuiltinRoleName[] = ["Admin"];
const EDITOR: readonly BuiltinRoleName[] = ["Admin", "Editor"];
const AUDIT: readonly BuiltinRoleName[] = ["Admin", "Editor", "Auditor"];
const CONTRIBUTOR: readonly BuiltinRoleName[] = ["Admin", "Editor", "Reviewer"];
/** A pure super admin (no organization) holds these too. */
const SUPER: readonly BuiltinRoleName[] = ["Admin", "SuperAdmin"];

export const BUILTIN_UI_PERMISSIONS = {
  "useCase.edit": EDITOR,
  "useCase.classify": EDITOR,
  "useCase.members": ADMIN,
  "risks.edit": EDITOR,
  "vendor.edit": EDITOR,
  "model.edit": EDITOR,
  "policy.edit": EDITOR,
  "training.edit": EDITOR,
  "training.admin": ADMIN,
  "organization.admin": ADMIN,
  "llmKeys.admin": ADMIN,
  "apiKeys.admin": ADMIN,
  "framework.edit": EDITOR,
  "framework.audit": AUDIT,
  "postMarketMonitoring.edit": EDITOR,
  "evals.edit": EDITOR,
  "riskLinks.admin": SUPER,
  "aiApp.edit": EDITOR,
  "aiApp.admin": ADMIN,
  "task.edit": EDITOR,
  "incident.create": EDITOR,
  "ext.datasetBulkUpload.edit": EDITOR,
  "ext.frameworkImport.edit": EDITOR,
  "fileManager.contribute": CONTRIBUTOR,
  "file.edit": EDITOR,
  "policyTemplate.edit": EDITOR,
  "intakeForm.edit": EDITOR,
  "agentDiscovery.admin": ADMIN,
  "aiTrustIndex.admin": ADMIN,
  "groups.manage": ADMIN,
  "roles.manage": ADMIN,
  "logs.admin": ADMIN,
  "auditLedger.admin": ADMIN,
  "customField.admin": ADMIN,
  "extension.admin": ADMIN,
  "governanceOs.admin": ADMIN,
  "approvalWorkflow.admin": ADMIN,
  "reporting.admin": ADMIN,
  "aiDetection.edit": EDITOR,
} as const satisfies Record<string, readonly BuiltinRoleName[]>;

export type UiPermissionKey = keyof typeof BUILTIN_UI_PERMISSIONS;

const BUILTIN_ROLE_NAMES: ReadonlySet<string> = new Set<BuiltinRoleName>([
  "Admin",
  "Editor",
  "Reviewer",
  "Auditor",
  "SuperAdmin",
]);

/** True for a built-in role name (custom roles cannot take one). */
export function isBuiltinRoleName(roleName: string | null | undefined): boolean {
  return !!roleName && BUILTIN_ROLE_NAMES.has(roleName);
}

/** Whether a built-in role holds `key`. False for any other role name. */
export function builtinRoleHasPermission(roleName: string, key: UiPermissionKey): boolean {
  return (BUILTIN_UI_PERMISSIONS[key] as readonly string[]).includes(roleName);
}

/** True for a key in BUILTIN_UI_PERMISSIONS (e.g. a command palette scope). */
export function isUiPermissionKey(key: string): key is UiPermissionKey {
  return Object.prototype.hasOwnProperty.call(BUILTIN_UI_PERMISSIONS, key);
}

/**
 * Whether the caller holds `key`, given their loaded permission list (or
 * undefined while it loads or after it failed) and their role name.
 *
 * Loaded: the list decides, for built-in and custom roles alike. Not loaded:
 * a built-in role answers from its static matrix (BUILTIN_UI_PERMISSIONS,
 * identical to the server's), so it never sees a control flicker; any other
 * role is denied until its list arrives. Custom roles cannot take a built-in
 * name (the server refuses it), so the role-name stand-in is never theirs.
 */
export function canWithPermissions(
  key: UiPermissionKey,
  permissions: readonly string[] | undefined,
  roleName: string | null | undefined,
): boolean {
  if (permissions) return permissions.includes(key);
  return !!roleName && builtinRoleHasPermission(roleName, key);
}
