import {
  BUILTIN_UI_PERMISSIONS,
  canWithPermissions,
  isUiPermissionKey,
  type UiPermissionKey,
} from "../permissions";
// The server's catalog is plain data with no imports, so the client test reads
// it directly: the UI's stand-in table must never drift from what the server
// grants the built-in roles.
import {
  BUILTIN_ROLE_PERMISSIONS,
  ROLE_PERMISSIONS,
} from "../../../../../Servers/config/rolePermissions.config";

const BUILTIN_ROLES = ["Admin", "Editor", "Reviewer", "Auditor", "SuperAdmin"] as const;
const UI_KEYS = Object.keys(BUILTIN_UI_PERMISSIONS) as UiPermissionKey[];
const sorted = (roles: readonly string[]) => [...roles].sort();

/**
 * The role-name table the UI gated on before issue #5314, verbatim (only the
 * entries that were in use), with the permission key each entry moved to.
 * `key: null` marks the gates that stay on the role name, and why.
 */
const LEGACY_ALLOWED_ROLES: Array<{
  gate: string;
  roles: string[];
  key: UiPermissionKey | null;
}> = [
  { gate: "projects.create", roles: ["Admin", "Editor"], key: "useCase.edit" },
  { gate: "projects.edit", roles: ["Admin", "Editor"], key: "useCase.edit" },
  { gate: "projects.delete", roles: ["Admin", "Editor"], key: "useCase.edit" },
  // Project form members field: moved to a key. Settings > Team and the
  // "Manage team" command used the same entry but stay Admin by role name:
  // the server's user edits check the role name too.
  { gate: "projects.editTeamMembers", roles: ["Admin"], key: "useCase.members" },
  { gate: "projects.classify", roles: ["Admin", "Editor"], key: "useCase.classify" },
  { gate: "projectRisks.create", roles: ["Admin", "Editor"], key: "risks.edit" },
  { gate: "projectRisks.edit", roles: ["Admin", "Editor"], key: "risks.edit" },
  { gate: "projectRisks.delete", roles: ["Admin", "Editor"], key: "risks.edit" },
  { gate: "vendors.create", roles: ["Admin", "Editor"], key: "vendor.edit" },
  { gate: "vendors.edit", roles: ["Admin", "Editor"], key: "vendor.edit" },
  { gate: "vendors.delete", roles: ["Admin", "Editor"], key: "vendor.edit" },
  { gate: "frameworks.edit", roles: ["Admin", "Editor"], key: "framework.edit" },
  { gate: "frameworks.manage", roles: ["Admin", "Editor"], key: "framework.edit" },
  { gate: "frameworks.audit", roles: ["Admin", "Editor", "Auditor"], key: "framework.audit" },
  { gate: "organizations.create", roles: ["Admin"], key: "organization.admin" },
  { gate: "organizations.edit", roles: ["Admin"], key: "organization.admin" },
  { gate: "training.create", roles: ["Admin", "Editor"], key: "training.edit" },
  { gate: "training.edit", roles: ["Admin", "Editor"], key: "training.edit" },
  { gate: "training.delete", roles: ["Admin"], key: "training.admin" },
  { gate: "policies.create", roles: ["Admin", "Editor"], key: "policy.edit" },
  { gate: "policies.edit", roles: ["Admin", "Editor"], key: "policy.edit" },
  { gate: "policies.delete", roles: ["Admin", "Editor"], key: "policy.edit" },
  { gate: "modelInventory.create", roles: ["Admin", "Editor"], key: "model.edit" },
  { gate: "modelInventory.edit", roles: ["Admin", "Editor"], key: "model.edit" },
  { gate: "modelInventory.delete", roles: ["Admin", "Editor"], key: "model.edit" },
  // Server: featureSettings.ctrl checks the role name, so no key.
  { gate: "features.manage", roles: ["Admin"], key: null },
  { gate: "apiKeys.view", roles: ["Admin"], key: "apiKeys.admin" },
  { gate: "apiKeys.manage", roles: ["Admin"], key: "apiKeys.admin" },
  { gate: "llmKeys.manage", roles: ["Admin"], key: "llmKeys.admin" },
  { gate: "evals.createProject", roles: ["Admin", "Editor"], key: "evals.edit" },
  { gate: "evals.editProject", roles: ["Admin", "Editor"], key: "evals.edit" },
  { gate: "evals.deleteProject", roles: ["Admin", "Editor"], key: "evals.edit" },
  { gate: "evals.createExperiment", roles: ["Admin", "Editor"], key: "evals.edit" },
  { gate: "evals.deleteExperiment", roles: ["Admin", "Editor"], key: "evals.edit" },
  { gate: "evals.createScorer", roles: ["Admin", "Editor"], key: "evals.edit" },
  { gate: "evals.editScorer", roles: ["Admin", "Editor"], key: "evals.edit" },
  { gate: "evals.deleteScorer", roles: ["Admin", "Editor"], key: "evals.edit" },
  { gate: "evals.uploadDataset", roles: ["Admin", "Editor"], key: "evals.edit" },
  { gate: "evals.deleteDataset", roles: ["Admin", "Editor"], key: "evals.edit" },
  // AI Gateway keys: the gateway checks the role name (require_admin).
  { gate: "evals.manageApiKeys", roles: ["Admin"], key: null },
  {
    gate: "postMarketMonitoring.edit",
    roles: ["Admin", "Editor"],
    key: "postMarketMonitoring.edit",
  },
];

describe("BUILTIN_UI_PERMISSIONS", () => {
  it.each(UI_KEYS)("%s is in the server catalog with the same built-in roles", (key) => {
    const meta = (ROLE_PERMISSIONS as Record<string, { legacyRoles: readonly string[] }>)[key];
    expect(meta).toBeDefined();
    expect(sorted(BUILTIN_UI_PERMISSIONS[key])).toEqual(sorted(meta.legacyRoles));
    // And the server's built-in matrix agrees, SuperAdmin included.
    const holders = BUILTIN_ROLES.filter((role) =>
      (BUILTIN_ROLE_PERMISSIONS[role] as ReadonlySet<string>).has(key),
    );
    expect(sorted(holders)).toEqual(sorted(BUILTIN_UI_PERMISSIONS[key]));
  });

  it.each(LEGACY_ALLOWED_ROLES.filter((e) => e.key !== null))(
    "old gate $gate -> $key keeps exactly $roles",
    ({ roles, key }) => {
      expect(sorted(BUILTIN_UI_PERMISSIONS[key as UiPermissionKey])).toEqual(sorted(roles));
    },
  );

  it("uses every key at least once", () => {
    const used = new Set(LEGACY_ALLOWED_ROLES.map((e) => e.key));
    expect(UI_KEYS.filter((key) => !used.has(key))).toEqual([]);
  });

  it("recognises its own keys only", () => {
    expect(isUiPermissionKey("useCase.edit")).toBe(true);
    expect(isUiPermissionKey("projects.edit")).toBe(false);
    expect(isUiPermissionKey("toString")).toBe(false);
  });
});

describe("canWithPermissions", () => {
  it("answers from the loaded list, for built-in and custom roles alike", () => {
    expect(canWithPermissions("vendor.edit", ["vendor.edit"], "Risk team")).toBe(true);
    expect(canWithPermissions("vendor.edit", [], "Risk team")).toBe(false);
    // The loaded list wins over the role name.
    expect(canWithPermissions("vendor.edit", [], "Admin")).toBe(false);
  });

  it("falls back to the built-in matrix while the list is not loaded", () => {
    expect(canWithPermissions("vendor.edit", undefined, "Editor")).toBe(true);
    expect(canWithPermissions("vendor.edit", undefined, "Auditor")).toBe(false);
    expect(canWithPermissions("framework.audit", undefined, "Auditor")).toBe(true);
  });

  it("denies a custom role (or no role) until its list has loaded", () => {
    expect(canWithPermissions("vendor.edit", undefined, "Risk team")).toBe(false);
    expect(canWithPermissions("vendor.edit", undefined, "")).toBe(false);
    expect(canWithPermissions("vendor.edit", undefined, null)).toBe(false);
  });

  it.each(["Admin", "Editor", "Reviewer", "Auditor"])(
    "gives %s the same answer before and after its list loads",
    (role) => {
      const loaded = [...BUILTIN_ROLE_PERMISSIONS[role]];
      for (const key of UI_KEYS) {
        expect(canWithPermissions(key, undefined, role)).toBe(
          canWithPermissions(key, loaded, role),
        );
      }
    },
  );

  it("gives a custom role with Editor's permissions exactly Editor's gates", () => {
    const editorKeys = [...BUILTIN_ROLE_PERMISSIONS.Editor];
    for (const key of UI_KEYS) {
      const asEditor = canWithPermissions(key, undefined, "Editor");
      expect({ key, allowed: canWithPermissions(key, editorKeys, "Risk analyst") }).toEqual({
        key,
        allowed: asEditor,
      });
    }
    // Spot-check the areas the issue names.
    expect(canWithPermissions("useCase.edit", editorKeys, "Risk analyst")).toBe(true);
    expect(canWithPermissions("risks.edit", editorKeys, "Risk analyst")).toBe(true);
    expect(canWithPermissions("framework.edit", editorKeys, "Risk analyst")).toBe(true);
    expect(canWithPermissions("training.admin", editorKeys, "Risk analyst")).toBe(false);
    expect(canWithPermissions("organization.admin", editorKeys, "Risk analyst")).toBe(false);
  });
});
