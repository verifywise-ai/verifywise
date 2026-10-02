import { useCallback } from "react";
import allowedRoles from "../constants/permissions";
import { useAuth } from "./useAuth";
import { useMyPermissions } from "./useRolePermissions";

/**
 * Built-in role names whose behavior is defined by the legacy static matrix.
 * SuperAdmin is handled separately (it is a mapping, not a roles-table row).
 */
const BUILTIN_ROLE_NAMES = new Set(["Admin", "Editor", "Reviewer", "Auditor"]);

/**
 * Maps frontend resource/action pairs to the backend permission key that
 * actually guards the corresponding API endpoints (issue #4588).
 *
 * Only pairs with a real backend counterpart belong here. Resources whose
 * routes are not permission-garded backend-side have no entry — for custom
 * roles those resolve to DENIED, mirroring the backend's fail-closed rule
 * (a custom role with no matrix row can do nothing until granted a real,
 * enforced permission).
 */
export const RESOURCE_ACTION_PERMISSION_KEY: Record<string, string> = {
  "organizations.edit": "organization.admin",
  "risks.bulkEdit": "risks.edit",
  "reporting.generate": "reporting.admin",
  "reports.schedule": "scheduledReport.edit",
  "reports.run": "reportRun.edit",
  "reports.templates": "reportTemplate.edit",
  "policies.bulkEdit": "policy.edit",
  "tasks.bulkEdit": "task.edit",
  "sso.manage": "ssoConfig.admin",
  "github.manage": "githubIntegration.admin",
  "roles.manage": "roles.manage",
  "customFields.manage": "customField.admin",
  "extensions.manage": "extension.admin",
  "approvalWorkflows.manage": "approvalWorkflow.admin",
};

/**
 * Permission-aware replacement for the
 * `allowedRoles.<resource>.<action>.includes(userRoleName)` pattern used
 * across the UI (issue #4588).
 *
 * Semantics:
 *  - Built-in roles (incl. SuperAdmin where listed): exactly the legacy
 *    static matrix — zero behavior change.
 *  - Custom roles: allowed only when a backend permission key exists for the
 *    pair AND the user's effective matrix grants it. Everything else is
 *    denied (fail-closed, like the backend).
 *
 * The backend remains the enforcing authority; this only drives affordances.
 */
export function useResourceAccess() {
  const { userRoleName } = useAuth();
  const { can, isLoading } = useMyPermissions();

  const canAccess = useCallback(
    (resource: keyof typeof allowedRoles | string, action: string): boolean => {
      const allowed = (allowedRoles as Record<string, Record<string, string[]>>)[resource]?.[
        action
      ];
      if (!allowed) return false;

      // SuperAdmin is not a roles-table row; keep it on the static matrix.
      if (userRoleName === "SuperAdmin") return allowed.includes(userRoleName);
      if (BUILTIN_ROLE_NAMES.has(userRoleName)) return allowed.includes(userRoleName);

      const permissionKey = RESOURCE_ACTION_PERMISSION_KEY[`${resource}.${action}`];
      return permissionKey != null && can(permissionKey);
    },
    [userRoleName, can],
  );

  return { canAccess, isLoading };
}
