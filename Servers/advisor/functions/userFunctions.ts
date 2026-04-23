/**
 * Read-only `list_users` function for the AI advisor.
 *
 * Pairs with `Servers/advisor/tools/userTools.ts`. Both halves are merged
 * into the LLM tool surface from `controllers/advisor.ctrl.ts`.
 *
 * Used by write tools that need a user id (e.g. `agent_create_risk`'s
 * `approver` field). The LLM looks up a name/email here, picks the
 * matching id, then passes it to the write tool.
 */

import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";

export interface ListUsersParams {
  search?: string;
  limit?: number;
}

export interface AdvisorUserSummary {
  id: number;
  name: string;
  surname: string;
  email: string;
  role: string | null;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const listUsers = async (
  params: ListUsersParams,
  organizationId: number,
): Promise<AdvisorUserSummary[]> => {
  const limit = Math.min(
    params.limit && params.limit > 0 ? params.limit : DEFAULT_LIMIT,
    MAX_LIMIT,
  );

  // Substring filter is applied in SQL so we don't fetch the entire org's
  // user table just to throw most rows away. ILIKE for case-insensitive
  // match across name/surname/email.
  const replacements: Record<string, unknown> = {
    organization_id: organizationId,
    limit,
  };

  let whereClause = "users.organization_id = :organization_id";
  if (params.search && params.search.trim().length > 0) {
    replacements.search = `%${params.search.trim()}%`;
    whereClause += `
      AND (
        users.name ILIKE :search
        OR users.surname ILIKE :search
        OR users.email ILIKE :search
      )
    `;
  }

  try {
    const rows = (await sequelize.query(
      `
      SELECT
        users.id,
        users.name,
        users.surname,
        users.email,
        roles.name AS role
      FROM users
      LEFT JOIN roles ON users.role_id = roles.id
      WHERE ${whereClause}
      ORDER BY users.name ASC, users.surname ASC, users.id ASC
      LIMIT :limit
    `,
      {
        replacements,
        type: (await import("sequelize")).QueryTypes.SELECT,
      },
    )) as Array<{
      id: number;
      name: string;
      surname: string;
      email: string;
      role: string | null;
    }>;

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      surname: r.surname,
      email: r.email,
      role: r.role,
    }));
  } catch (error) {
    logger.error("Error listing users for advisor:", error);
    throw new Error(
      `Failed to list users: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
};

const availableUserTools: any = {
  list_users: listUsers,
};

export { availableUserTools };
