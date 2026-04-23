/**
 * Read-only `list_frameworks` lookup function for the AI advisor.
 *
 * Pairs with `Servers/advisor/tools/frameworkLookupTools.ts`.
 *
 * Frameworks are global reference data (no organization_id) — EU AI Act,
 * ISO 42001, ISO 27001, NIST AI RMF, etc. They're shared across all
 * tenants. The query is a simple SELECT on the `frameworks` table with
 * an optional ILIKE filter, no org scoping needed.
 *
 * NOTE: This file is separate from `frameworkFunctions.ts` (which holds
 * the analytics tool executors) to keep lookup tools grouped with their
 * family (`list_users`, `list_projects`, `list_frameworks`).
 */

import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import logger from "../../utils/logger/fileLogger";

export interface ListFrameworksParams {
  search?: string;
}

export interface AdvisorFrameworkSummary {
  id: number;
  name: string;
  description: string | null;
  /** true = organizational (single shared project), false = project-based (linked per project) */
  is_organizational: boolean;
}

const listFrameworks = async (
  params: ListFrameworksParams,
  _organizationId: number,
): Promise<AdvisorFrameworkSummary[]> => {
  const replacements: Record<string, unknown> = {};

  // Only return frameworks that are actually enabled (adopted) in this
  // organization. A framework is "enabled" when at least one project in
  // the org has it linked via `projects_frameworks`. Without this filter,
  // the LLM could propose linking a risk to a framework nobody has
  // adopted — the DB row would exist but nothing in the UI would show it.
  replacements.organization_id = _organizationId;

  let searchClause = "";
  if (params.search && params.search.trim().length > 0) {
    replacements.search = `%${params.search.trim()}%`;
    searchClause = "AND frameworks.name ILIKE :search";
  }

  try {
    const rows = (await sequelize.query(
      `
      SELECT DISTINCT
        frameworks.id,
        frameworks.name,
        frameworks.description,
        frameworks.is_organizational
      FROM frameworks
      INNER JOIN projects_frameworks pf
        ON pf.framework_id = frameworks.id
        AND pf.organization_id = :organization_id
      WHERE 1=1 ${searchClause}
      ORDER BY frameworks.name ASC, frameworks.id ASC
    `,
      {
        replacements,
        type: QueryTypes.SELECT,
      },
    )) as Array<{
      id: number;
      name: string;
      description: string | null;
      is_organizational: boolean;
    }>;

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      is_organizational: r.is_organizational,
    }));
  } catch (error) {
    logger.error("Error listing frameworks for advisor:", error);
    throw new Error(
      `Failed to list frameworks: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
};

const availableFrameworkLookupTools: any = {
  list_frameworks: listFrameworks,
};

export { availableFrameworkLookupTools };
