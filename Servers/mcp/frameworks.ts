/**
 * Framework lookup for the MCP tools.
 *
 * Names are resolved against the `frameworks` table rather than a map in this
 * file: the deployment ships 25 of them, the set grows, and a baked-in list
 * would quietly disagree with the table it is meant to describe.
 *
 * Every framework is either organization-wide or use-case scoped
 * (`frameworks.is_organizational`), and a use case must match the frameworks
 * attached to it — `createNewProjectQuery` refuses the pairing otherwise. That
 * rule is enforced here, before anything is written, so the model is told which
 * frameworks disagree rather than seeing "Framework with ID 2 is not allowed
 * for this project".
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";

export interface FrameworkRef {
  id: number;
  name: string;
  isOrganizational: boolean;
}

export async function listFrameworkRefs(): Promise<FrameworkRef[]> {
  const rows = (await sequelize.query(
    `SELECT id, name, is_organizational FROM frameworks ORDER BY id ASC`,
    { type: QueryTypes.SELECT },
  )) as { id: number; name: string; is_organizational: boolean }[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    isOrganizational: row.is_organizational,
  }));
}

/** Match on name, case- and whitespace-insensitively. */
async function matchByName(names: string[]): Promise<FrameworkRef[]> {
  const all = await listFrameworkRefs();
  const byName = new Map(all.map((f) => [f.name.trim().toLowerCase(), f]));

  return names.map((name) => {
    const found = byName.get(name.trim().toLowerCase());
    if (!found) {
      throw new Error(
        `No framework named "${name}" on this deployment. Available: ${all.map((f) => f.name).join(", ")}.`,
      );
    }
    return found;
  });
}

/** Resolve framework names to ids, with no scope rule. Used for risk mappings. */
export async function resolveFrameworkIds(names: string[]): Promise<number[]> {
  return (await matchByName(names)).map((f) => f.id);
}

export interface UseCaseFrameworks {
  ids: number[];
  /** What the use case itself must be, to accept these frameworks. */
  isOrganizational: boolean;
}

/**
 * Resolve the frameworks for a use case, and the scope they imply.
 *
 * An empty list is use-case scoped, matching the column default and the
 * console's own default for a new use case.
 */
export async function resolveUseCaseFrameworks(names: string[]): Promise<UseCaseFrameworks> {
  if (names.length === 0) {
    return { ids: [], isOrganizational: false };
  }

  const matched = await matchByName(names);
  const organizationWide = matched.filter((f) => f.isOrganizational);
  const useCaseScoped = matched.filter((f) => !f.isOrganizational);

  if (organizationWide.length > 0 && useCaseScoped.length > 0) {
    throw new Error(
      `A use case is either organization-wide or use-case scoped, so these cannot be combined: ` +
        `${organizationWide.map((f) => f.name).join(", ")} ${organizationWide.length === 1 ? "is" : "are"} organization-wide, ` +
        `${useCaseScoped.map((f) => f.name).join(", ")} ${useCaseScoped.length === 1 ? "is" : "are"} use-case scoped. ` +
        `Create one use case for each.`,
    );
  }

  return { ids: matched.map((f) => f.id), isOrganizational: organizationWide.length > 0 };
}
