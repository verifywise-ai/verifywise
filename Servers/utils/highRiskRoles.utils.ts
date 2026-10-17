/**
 * EU AI Act roles of a use case. A use case holds Provider, Deployer or both,
 * stored in projects.high_risk_roles (text[]) without duplicates, Provider
 * first. Every write path and every project row leaving the data layer goes
 * through these helpers.
 */
import { HighRiskRole } from "../domain.layer/enums/high-risk-role.enum";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";

/** Storage and display order. */
export const HIGH_RISK_ROLE_ORDER: readonly HighRiskRole[] = [
  HighRiskRole.PROVIDER,
  HighRiskRole.DEPLOYER,
];

/** The intake entityFieldMapping key for the roles; saved form schemas use it. */
export const HIGH_RISK_ROLE_MAPPING = "type_of_high_risk_role";

export const isHighRiskRole = (value: unknown): value is HighRiskRole =>
  typeof value === "string" && (HIGH_RISK_ROLE_ORDER as readonly string[]).includes(value);

const asList = (input: unknown): unknown[] =>
  Array.isArray(input) ? input : input === null || input === undefined ? [] : [input];

/**
 * The stored form of a role list: known roles only, no duplicates, Provider
 * first. A single value (the legacy column, an old API body) reads as a
 * one-item list.
 */
export const normalizeHighRiskRoles = (input: unknown): HighRiskRole[] => {
  const values = asList(input);
  return HIGH_RISK_ROLE_ORDER.filter((role) => values.includes(role));
};

/**
 * The single role older API clients read as type_of_high_risk_role: Provider
 * when the list holds Provider, Deployer when it holds only Deployer, else null.
 */
export const legacyHighRiskRole = (roles: unknown): HighRiskRole | null =>
  normalizeHighRiskRoles(roles)[0] ?? null;

/** "Provider, Deployer"; "" for no roles. */
export const formatHighRiskRoles = (roles: unknown): string =>
  normalizeHighRiskRoles(roles).join(", ");

/** Same roles, whatever the order or duplicates. */
export const sameHighRiskRoles = (a: unknown, b: unknown): boolean =>
  formatHighRiskRoles(a) === formatHighRiskRoles(b);

/**
 * A role list as a SQL text[] expression. Sequelize expands an array
 * replacement into a bare comma list and turns [] into NULL, so the list goes
 * inside ARRAY[...] and an empty list is the literal '{}' with nothing bound.
 * Use it for writes (`SET high_risk_roles = ${sql}`) and reads
 * (`= ANY(${sql})`, which matches nothing for an empty list). `name` is a
 * replacement name chosen by the caller, never user input.
 */
export const highRiskRolesArraySql = (
  roles: unknown,
  name: string,
): { sql: string; replacements: Record<string, HighRiskRole[]> } => {
  const list = normalizeHighRiskRoles(roles);
  if (list.length === 0) return { sql: "'{}'::text[]", replacements: {} };
  return { sql: `ARRAY[:${name}]::text[]`, replacements: { [name]: list } };
};

/**
 * Normalises high_risk_roles on a project row read with SELECT * and adds the
 * derived type_of_high_risk_role. Without it a reader of the removed column
 * gets undefined and the value silently disappears. Sequelize model instances
 * get both on dataValues too, so `{ ...row.dataValues }` carries them.
 * Mutates and returns the row; null and undefined pass through.
 */
export function withLegacyHighRiskRole<T extends object | null | undefined>(row: T): T {
  if (!row) return row;
  const values = (row as { dataValues?: Record<string, unknown> }).dataValues;
  const roles = normalizeHighRiskRoles(
    (values ?? (row as Record<string, unknown>)).high_risk_roles,
  );
  const derived = { high_risk_roles: roles, type_of_high_risk_role: roles[0] ?? null };
  if (values) Object.assign(values, derived);
  Object.assign(row, derived);
  return row;
}

const invalidRoles = (field: string, value: unknown) =>
  new ValidationException(
    `${field} must name only these roles: ${HIGH_RISK_ROLE_ORDER.join(", ")}`,
    field,
    value,
  );

/**
 * The role list a create or update stores, from either request field:
 * - high_risk_roles replaces the list (null clears it);
 * - type_of_high_risk_role X keeps the current list when it already holds X,
 *   so a client that writes back the derived value cannot drop a role, and
 *   otherwise sets [X]; null clears the list;
 * - both present and disagreeing is a ValidationException (400).
 * Returns undefined when the request sends neither field: leave the list alone.
 */
export const resolveHighRiskRolesWrite = (
  body: { high_risk_roles?: unknown; type_of_high_risk_role?: unknown },
  currentRoles: unknown,
): HighRiskRole[] | undefined => {
  const list = body.high_risk_roles;
  const legacy = body.type_of_high_risk_role;
  if (list === undefined && legacy === undefined) return undefined;
  const legacyIsEmpty = legacy === null || legacy === "";
  if (legacy !== undefined && !legacyIsEmpty && !isHighRiskRole(legacy)) {
    throw invalidRoles("type_of_high_risk_role", legacy);
  }

  if (list !== undefined) {
    const values = list === null ? [] : list;
    if (!Array.isArray(values) || !values.every(isHighRiskRole)) {
      throw invalidRoles("high_risk_roles", list);
    }
    const roles = normalizeHighRiskRoles(values);
    const agrees =
      legacy === undefined ||
      (legacyIsEmpty ? roles.length === 0 : roles.includes(legacy as HighRiskRole));
    if (!agrees) {
      throw new ValidationException(
        "type_of_high_risk_role does not match high_risk_roles; send only high_risk_roles",
        "type_of_high_risk_role",
        legacy,
      );
    }
    return roles;
  }

  if (legacyIsEmpty) return [];
  const current = normalizeHighRiskRoles(currentRoles);
  return current.includes(legacy as HighRiskRole) ? current : [legacy as HighRiskRole];
};

/**
 * Roles from intake entity data: the list when present, else the single
 * legacy role an older review dialog or API client sent.
 */
export const highRiskRolesFromEntityData = (data: Record<string, unknown>): HighRiskRole[] =>
  normalizeHighRiskRoles(
    Array.isArray(data.high_risk_roles) ? data.high_risk_roles : data.type_of_high_risk_role,
  );

/**
 * Roles named by an intake answer mapped to the role field. A select stores
 * the option's value, so each value is resolved to its label and a role
 * matches either, case-insensitively. Selected options that name no role come
 * back by label so the reviewer can see them before approving.
 */
export const resolveMappedHighRiskRoles = (
  answer: unknown,
  options: ReadonlyArray<{ value: string; label: string }> = [],
): { roles: HighRiskRole[]; unmatched: string[] } => {
  const matched: HighRiskRole[] = [];
  const unmatched: string[] = [];
  for (const raw of asList(answer)) {
    const value = String(raw);
    if (value.trim() === "") continue;
    const label = options.find((option) => option.value === value)?.label ?? value;
    const role = HIGH_RISK_ROLE_ORDER.find((candidate) =>
      [label, value].some((text) => text.trim().toLowerCase() === candidate.toLowerCase()),
    );
    if (role) matched.push(role);
    else unmatched.push(label);
  }
  return { roles: normalizeHighRiskRoles(matched), unmatched };
};
