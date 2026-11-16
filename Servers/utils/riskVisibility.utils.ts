import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { projectAccessSql, seesAllProjects } from "./projectVisibility.utils";
import { getUserRoleInOrganization } from "./userPermission.utils";

/** A user, with their role in the organization, as the risk visibility rule sees them. */
export type UserRiskViewer = { userId: number; role: string };

/**
 * The viewer for internal callers that act on every risk of the organization
 * with no user to scope by: the demo seed, MCP tools (Admin-only), intake
 * approval (ruling J8), jobs and organization-wide aggregates. Passing it is a
 * deliberate choice, never a default.
 */
export const SYSTEM_RISK_VIEWER = Object.freeze({ system: true } as const);

/**
 * Who a risk read or write runs for. The risk list and access functions take
 * one with no default, so a new caller has to name a user or the system viewer
 * and cannot fail open by leaving it out.
 */
export type RiskViewer = UserRiskViewer | typeof SYSTEM_RISK_VIEWER;

/** The signed-in user as the risk visibility rule sees them. */
export const riskViewer = (req: { userId?: number; role?: string }): UserRiskViewer => ({
  userId: req.userId!,
  role: req.role ?? "",
});

/**
 * The user whose risks are narrowed, or null when the viewer sees every risk
 * in the organization (the system viewer, an Admin or a SuperAdmin).
 */
export function scopedRiskViewer(viewer: RiskViewer): UserRiskViewer | null {
  if ("system" in viewer || seesAllProjects(viewer.role)) return null;
  return viewer;
}

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
 *
 * The "not linked" test does not filter projects_risks.organization_id: the
 * column is nullable, and a row with NULL there must still count as a link,
 * or a linked risk would look unlinked and show to everyone. risk_id already
 * pins the organization (the risk itself is filtered by it). The "linked to a
 * use case they can see" test keeps the filter, where a NULL row hides the
 * risk, which is the safe side.
 */
export function riskVisibilitySql(
  riskAlias: string,
  viewer: RiskViewer,
): { sql: string; replacements: Record<string, unknown> } {
  const condition = riskVisibilityCondition(riskAlias, viewer);
  return condition
    ? { sql: ` AND ${condition.sql}`, replacements: condition.replacements }
    : { sql: "", replacements: {} };
}

/**
 * The same rule as riskVisibilitySql as a bare condition (no leading AND), for
 * a WHERE built from a list of conditions or for a joined risk. Null when the
 * viewer sees every risk.
 */
export function riskVisibilityCondition(
  riskAlias: string,
  viewer: RiskViewer,
): { sql: string; replacements: Record<string, unknown> } | null {
  const scoped = scopedRiskViewer(viewer);
  if (!scoped) return null;
  const access = projectAccessSql("pv", scoped.userId);
  return {
    sql: `(NOT EXISTS (
             SELECT 1 FROM projects_risks prv
              WHERE prv.risk_id = ${riskAlias}.id)
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
 * The rule for a risk known only by an id column of another table (a policy
 * link, a risk link end): `EXISTS (...)` over the risk with that id in the
 * organization that the viewer can see, or an empty sql for a viewer who sees
 * every risk. A NULL id matches no risk, so a caller whose column is nullable
 * must allow the NULL case itself (`col IS NULL OR ...`). The caller's query
 * must bind :organizationId.
 */
export function riskIdVisibilitySql(
  column: string,
  viewer: RiskViewer,
): { sql: string; replacements: Record<string, unknown> } {
  const condition = riskVisibilityCondition("rvid", viewer);
  if (!condition) return { sql: "", replacements: {} };
  return {
    sql: `EXISTS (
             SELECT 1 FROM risks rvid
              WHERE rvid.id = ${column}
                AND rvid.organization_id = :organizationId
                AND ${condition.sql})`,
    replacements: condition.replacements,
  };
}

/**
 * Narrows a risk's use case ids (its `projects` array, the use case of a
 * mapping row) to the use cases the viewer can access (projectAccessSql), so a
 * risk never names a use case hidden from the viewer. An " AND EXISTS (...)"
 * fragment against `projectIdColumn`, or empty for a viewer who sees every use
 * case. The caller's query must bind :organizationId.
 *
 * Only the response is narrowed. An edit keeps the links to hidden use cases
 * (ruling J3), so sending the narrowed list back loses nothing.
 */
export function accessibleProjectIdSql(
  projectIdColumn: string,
  viewer: RiskViewer,
): { sql: string; replacements: Record<string, unknown> } {
  const scoped = scopedRiskViewer(viewer);
  if (!scoped) return { sql: "", replacements: {} };
  const access = projectAccessSql("pacc", scoped.userId);
  return {
    sql: ` AND EXISTS (
             SELECT 1 FROM projects pacc
              WHERE pacc.id = ${projectIdColumn}
                AND pacc.organization_id = :organizationId${access.sql})`,
    replacements: access.replacements,
  };
}

/**
 * The rule for the risks of one use case (bound as :projectId). A viewer who
 * can see that use case gets all its risks; one who cannot gets only the
 * risks they own or approve there, so a risk shared with another use case
 * they can see does not expose the hidden use case's list (ruling J7).
 *
 * Only for a query that already joins the risk to :projectId through
 * projects_risks. Under that join this is the whole risk rule: a risk linked
 * to an accessible use case, or owned or approved by the viewer, passes
 * riskVisibilitySql too, so that check is not repeated.
 */
export function projectRiskVisibilitySql(
  riskAlias: string,
  viewer: RiskViewer,
): { sql: string; replacements: Record<string, unknown> } {
  const scoped = scopedRiskViewer(viewer);
  if (!scoped) return { sql: "", replacements: {} };
  const access = projectAccessSql("pvs", scoped.userId);
  return {
    sql: ` AND (EXISTS (
        SELECT 1 FROM projects pvs
         WHERE pvs.id = :projectId AND pvs.organization_id = :organizationId${access.sql})
      OR ${riskAlias}.risk_owner = :visibilityUserId OR ${riskAlias}.risk_approval = :visibilityUserId)`,
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
  if (!scopedRiskViewer(viewer)) return true;
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
 * request): their role in the organization, read from organization_members
 * by getUserRoleInOrganization. A user with no role in it is a plain
 * non-Admin, so the visibility rule applies to them.
 * Ruling J9: a SuperAdmin with no role in this organization is scoped like a
 * non-Admin too: a SuperAdmin is a cross-tenant org/user admin, never an
 * in-org Admin, and an elected SuperAdmin follows their role in the org.
 */
export async function riskViewerForUserQuery(
  userId: number,
  organizationId: number,
): Promise<UserRiskViewer> {
  const role = await getUserRoleInOrganization(organizationId, userId);
  return { userId, role: role?.name ?? "" };
}

/**
 * The viewer for a write that names no user. It fails closed: user id 0
 * matches no owner, approver or use case member, so it sees only the risks
 * that are linked to no use case and can link a risk to none.
 */
export const UNKNOWN_RISK_VIEWER: UserRiskViewer = Object.freeze({ userId: 0, role: "" });

/**
 * Which of these use cases of the organization the viewer can see and write
 * to (projectAccessSql: owner, member or group member; Admins and the system
 * viewer all).
 */
export async function getAccessibleProjectIdsQuery(
  projectIds: number[],
  organizationId: number,
  viewer: RiskViewer,
  transaction?: Transaction,
): Promise<number[]> {
  if (projectIds.length === 0) return [];
  const scoped = scopedRiskViewer(viewer);
  const access = scoped ? projectAccessSql("p", scoped.userId) : { sql: "", replacements: {} };
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
