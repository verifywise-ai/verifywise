import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { projectAccessSql, projectVisibilitySql, seesAllProjects } from "./projectVisibility.utils";

export type RiskViewer = { userId: number; role: string };

/** The signed-in user as the risk visibility rule sees them. */
export const riskViewer = (req: { userId?: number; role?: string }): RiskViewer => ({
  userId: req.userId!,
  role: req.role ?? "",
});

/**
 * Which risks a user can see. Admins (and SuperAdmins) see every risk in the
 * org. Everyone else sees a risk when
 *  - it is not linked to any use case (only projects_risks counts: a link to a
 *    framework or one of its elements does not tie a risk to a use case), or
 *  - it is linked to at least one use case they can see (projectAccessSql), or
 *  - they are its owner or approver, so an assignee can always act on it.
 *
 * Returns an SQL fragment (starting with " AND ", or empty) against `riskAlias`
 * and the replacements it needs. The caller's query must bind :organizationId.
 * The check is a pair of EXISTS subqueries, so a risk's own aggregates (the
 * `projects` array of a list query) are never narrowed by it.
 */
export function riskVisibilitySql(
  riskAlias: string,
  viewer: RiskViewer,
): { sql: string; replacements: Record<string, unknown> } {
  if (seesAllProjects(viewer.role)) {
    return { sql: "", replacements: {} };
  }
  const access = projectAccessSql("pv", viewer.userId);
  return {
    sql: ` AND (NOT EXISTS (
             SELECT 1 FROM projects_risks prv
              WHERE prv.risk_id = ${riskAlias}.id
                AND prv.organization_id = :organizationId)
           OR EXISTS (
             SELECT 1 FROM projects_risks prv
             JOIN projects pv
               ON pv.id = prv.project_id
              AND pv.organization_id = :organizationId
              WHERE prv.risk_id = ${riskAlias}.id
                AND prv.organization_id = :organizationId${access.sql})
           OR ${riskAlias}.risk_owner = :visibilityUserId
           OR ${riskAlias}.risk_approval = :visibilityUserId)`,
    replacements: access.replacements,
  };
}

/**
 * Whether the viewer can see one risk that exists in the organization
 * (deleted or not). Admins always can, without a query: a risk that does not
 * exist is the caller's own not-found. For anyone else a missing risk is not
 * visible.
 */
export async function isRiskVisibleQuery(
  riskId: number,
  organizationId: number,
  viewer: RiskViewer,
  transaction?: Transaction,
): Promise<boolean> {
  if (seesAllProjects(viewer.role)) return true;
  const visibility = riskVisibilitySql("r", viewer);
  const rows = await sequelize.query<{ id: number }>(
    `SELECT r.id FROM risks r
      WHERE r.id = :riskId AND r.organization_id = :organizationId${visibility.sql}`,
    {
      replacements: { riskId, organizationId, ...visibility.replacements },
      type: QueryTypes.SELECT,
      transaction,
    },
  );
  return rows.length > 0;
}

/**
 * The viewer for a user known only by id (advisor tools, which carry no
 * request): their role in the organization. A user with no role in it is
 * a plain non-Admin, so the visibility rule applies to them.
 */
export async function riskViewerForUserQuery(
  userId: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<RiskViewer> {
  const rows = await sequelize.query<{ name: string }>(
    `SELECT r.name FROM organization_members om
       JOIN roles r ON r.id = om.role_id
      WHERE om.user_id = :userId AND om.organization_id = :organizationId`,
    { replacements: { userId, organizationId }, type: QueryTypes.SELECT, transaction },
  );
  return { userId, role: rows[0]?.name ?? "" };
}

/**
 * Which of these use cases of the organization the viewer can see and write
 * to (projectVisibilitySql: owner, member or group member; Admins all).
 */
export async function getAccessibleProjectIdsQuery(
  projectIds: number[],
  organizationId: number,
  viewer: RiskViewer,
  transaction?: Transaction,
): Promise<number[]> {
  if (projectIds.length === 0) return [];
  const access = projectVisibilitySql("p", viewer);
  const rows = await sequelize.query<{ id: number }>(
    `SELECT p.id FROM projects p
      WHERE p.organization_id = :organizationId AND p.id IN (:projectIds)${access.sql}`,
    {
      replacements: { organizationId, projectIds, ...access.replacements },
      type: QueryTypes.SELECT,
      transaction,
    },
  );
  return rows.map((r) => Number(r.id));
}
