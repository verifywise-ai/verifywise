/**
 * Read-only project tools for the AI advisor.
 *
 * Pairs with `Servers/advisor/tools/projectTools.ts`. Both halves are
 * merged into the LLM tool surface from `controllers/advisor.ctrl.ts`.
 *
 * Used by write tools that need a project id (e.g. `agent_create_risk`'s
 * `project_ids` field, `agent_create_task`'s future project linkage).
 * The LLM looks up a project name/code here, picks the matching id,
 * then passes it to the write tool.
 *
 * Note: the product calls these "use cases" but the DB table is named
 * `projects`. The existing `fetch_use_cases` tool reads the same rows
 * via the heavy `getAllProjectsQuery` path. This tool is deliberately
 * lighter — it skips the framework/members joins so the LLM can resolve
 * an id in a single cheap query.
 */

import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import logger from "../../utils/logger/fileLogger";

export interface ListProjectsParams {
  search?: string;
  limit?: number;
}

export interface AdvisorProjectSummary {
  id: number;
  uc_id: string | null;
  project_title: string;
  status: string | null;
  ai_risk_classification: string | null;
  owner: number | null;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const listProjects = async (
  params: ListProjectsParams,
  organizationId: number,
): Promise<AdvisorProjectSummary[]> => {
  const limit = Math.min(
    params.limit && params.limit > 0 ? params.limit : DEFAULT_LIMIT,
    MAX_LIMIT,
  );

  const replacements: Record<string, unknown> = {
    organization_id: organizationId,
    limit,
  };

  let whereClause = "projects.organization_id = :organization_id";
  if (params.search && params.search.trim().length > 0) {
    replacements.search = `%${params.search.trim()}%`;
    whereClause += `
      AND (
        projects.project_title ILIKE :search
        OR projects.uc_id ILIKE :search
      )
    `;
  }

  try {
    const rows = (await sequelize.query(
      `
      SELECT
        projects.id,
        projects.uc_id,
        projects.project_title,
        projects.status,
        projects.ai_risk_classification,
        projects.owner
      FROM projects
      WHERE ${whereClause}
      ORDER BY projects.project_title ASC, projects.id ASC
      LIMIT :limit
    `,
      {
        replacements,
        type: QueryTypes.SELECT,
      },
    )) as Array<{
      id: number;
      uc_id: string | null;
      project_title: string;
      status: string | null;
      ai_risk_classification: string | null;
      owner: number | null;
    }>;

    return rows.map((r) => ({
      id: r.id,
      uc_id: r.uc_id,
      project_title: r.project_title,
      status: r.status,
      ai_risk_classification: r.ai_risk_classification,
      owner: r.owner,
    }));
  } catch (error) {
    logger.error("Error listing projects for advisor:", error);
    throw new Error(
      `Failed to list projects: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
};

const availableProjectTools: any = {
  list_projects: listProjects,
};

export { availableProjectTools };
