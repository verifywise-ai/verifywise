import { HighRiskRole } from "../../domain/enums/highRiskRole.enum";

/** Storage and display order, as on the server. */
export const HIGH_RISK_ROLE_ORDER: readonly HighRiskRole[] = [
  HighRiskRole.PROVIDER,
  HighRiskRole.DEPLOYER,
];

/** Shown when EU AI Act is selected and no role is. Same text as the server. */
export const HIGH_RISK_ROLES_REQUIRED_MESSAGE =
  "Select at least one high-risk role when EU AI Act is selected.";

// Role names from before the reduction to Provider and Deployer (migration
// 20260421234619) collapse onto Provider, as the migration did.
const LEGACY_PROVIDER_NAMES = [
  "provider",
  "distributor",
  "importer",
  "product manufacturer",
  "authorized representative",
];

type WithRoles = { high_risk_roles?: unknown; type_of_high_risk_role?: unknown } | null | undefined;

/** One API or legacy value as a role, or null when it names none. */
const toHighRiskRole = (value: unknown): HighRiskRole | null => {
  if (typeof value === "number") {
    if (value === 1) return HighRiskRole.PROVIDER;
    return value === 0 || value === 2 ? HighRiskRole.DEPLOYER : null;
  }
  if (typeof value !== "string") return null;
  const name = value.trim().toLowerCase().replace(/_/g, " ");
  if (name === "deployer" || name === "not applicable") return HighRiskRole.DEPLOYER;
  return LEGACY_PROVIDER_NAMES.includes(name) ? HighRiskRole.PROVIDER : null;
};

/** Known roles only, no duplicates, Provider first. A single value reads as a one-item list. */
export const normalizeHighRiskRoles = (input: unknown): HighRiskRole[] => {
  const values = Array.isArray(input)
    ? input
    : input === null || input === undefined || input === ""
      ? []
      : [input];
  const roles = values.map(toHighRiskRole);
  return HIGH_RISK_ROLE_ORDER.filter((role) => roles.includes(role));
};

/** "Provider, Deployer"; "" for no roles. */
export const formatHighRiskRoles = (roles: unknown): string =>
  normalizeHighRiskRoles(roles).join(", ");

/** A use case's roles: its list, or the single role of a response from before the list. */
export const projectHighRiskRoles = (project: WithRoles): HighRiskRole[] =>
  normalizeHighRiskRoles(project?.high_risk_roles ?? project?.type_of_high_risk_role);

/** The roles a classification names; results saved before the list have only role. */
export const classificationRoles = (
  result: { roles?: unknown; role?: unknown } | null | undefined,
): HighRiskRole[] => normalizeHighRiskRoles(result?.roles ?? result?.role);

/** The required-field message for the roles, or "" when they are valid. */
export const highRiskRolesError = (roles: unknown, hasEuAiAct: boolean): string =>
  hasEuAiAct && normalizeHighRiskRoles(roles).length === 0 ? HIGH_RISK_ROLES_REQUIRED_MESSAGE : "";

/** The roles to send on save: only with EU AI Act; otherwise none. */
export const highRiskRolesPayload = (roles: unknown, hasEuAiAct: boolean): HighRiskRole[] =>
  hasEuAiAct ? normalizeHighRiskRoles(roles) : [];

/** Sort key for tables: the joined list, lower case. */
export const highRiskRolesSortKey = (project: WithRoles): string =>
  formatHighRiskRoles(projectHighRiskRoles(project)).toLowerCase();
