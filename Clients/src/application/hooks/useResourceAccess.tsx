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
 * Every resource/action pair gated in the UI maps to the backend permission
 * key that guards the corresponding capability (issue #4588). Built-in roles
 * keep the legacy static-matrix behavior via `allowedRoles`; custom roles
 * resolve through their granted matrix — fail-closed when not granted, like
 * the backend.
 */
export const RESOURCE_ACTION_PERMISSION_KEY: Record<string, string> = {
  // Organization
  "organizations.view": "organizations.view",
  "organizations.create": "organization.admin",
  "organizations.edit": "organization.admin",
  // Projects
  "projects.view": "projects.view",
  "projects.create": "projects.create",
  "projects.edit": "projects.edit",
  "projects.delete": "projects.delete",
  "projects.editTeamMembers": "projects.editTeamMembers",
  // Project risks (backend-enforced by the risks.* keys)
  "projectRisks.view": "risks.view",
  "projectRisks.create": "risks.edit",
  "projectRisks.edit": "risks.edit",
  "projectRisks.delete": "risks.edit",
  "projectRisks.bulkEdit": "risks.edit",
  // Vendors
  "vendors.view": "vendors.view",
  "vendors.create": "vendors.create",
  "vendors.edit": "vendors.edit",
  "vendors.delete": "vendors.delete",
  // Frameworks
  "frameworks.view": "frameworks.view",
  "frameworks.edit": "frameworks.edit",
  "frameworks.manage": "frameworks.manage",
  "frameworks.audit": "frameworks.audit",
  // Training
  "training.view": "training.view",
  "training.create": "training.create",
  "training.edit": "training.edit",
  "training.delete": "training.delete",
  // Model inventory
  "modelInventory.view": "modelInventory.view",
  "modelInventory.create": "modelInventory.create",
  "modelInventory.edit": "modelInventory.edit",
  "modelInventory.delete": "modelInventory.delete",
  // Slack & features
  "slack.view": "slack.view",
  "slack.manage": "slack.manage",
  "features.manage": "features.manage",
  // API keys & LLM keys
  "apiKeys.view": "apiKeys.view",
  "apiKeys.manage": "apiKeys.manage",
  "llmKeys.view": "llmKeys.admin",
  "llmKeys.manage": "llmKeys.admin",
  // Evaluations
  "evals.view": "evals.view",
  "evals.createProject": "evals.createProject",
  "evals.editProject": "evals.editProject",
  "evals.deleteProject": "evals.deleteProject",
  "evals.createExperiment": "evals.createExperiment",
  "evals.deleteExperiment": "evals.deleteExperiment",
  "evals.createScorer": "evals.createScorer",
  "evals.editScorer": "evals.editScorer",
  "evals.deleteScorer": "evals.deleteScorer",
  "evals.uploadDataset": "evals.uploadDataset",
  "evals.deleteDataset": "evals.deleteDataset",
  "evals.manageApiKeys": "evals.manageApiKeys",
  // Post-market monitoring
  "postMarketMonitoring.view": "postMarketMonitoring.view",
  "postMarketMonitoring.edit": "postMarketMonitoring.edit",
  // Reporting & other already-enforced keys
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
