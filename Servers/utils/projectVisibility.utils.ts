/** Roles that see every use case in the org, whatever the owner or members. */
export const seesAllProjects = (role: string | undefined): boolean =>
  role === "Admin" || role === "SuperAdmin";

/**
 * Which use cases (projects) a user can see: Admins (and SuperAdmins) every
 * one in the org, everyone else the ones they own or are a member of.
 *
 * The single definition behind the use cases list (getUserProjects) and the
 * lifecycle summary and dashboard queries, so their counts always agree. It
 * also gates PATCH /projects/:id (canViewProjectQuery) and the routes behind
 * requireProjectAccess (getProjectAccessQuery).
 * Returns an SQL fragment (starting with " AND ", or empty) against `alias`
 * and the replacements it needs. The caller's query must bind
 * :organizationId.
 */
export function projectVisibilitySql(
  alias: string,
  viewer: { userId: number; role: string },
): { sql: string; replacements: Record<string, unknown> } {
  if (seesAllProjects(viewer.role)) {
    return { sql: "", replacements: {} };
  }
  return {
    sql: ` AND (${alias}.owner = :visibilityUserId OR EXISTS (
             SELECT 1 FROM projects_members pm
              WHERE pm.organization_id = :organizationId
                AND pm.project_id = ${alias}.id
                AND pm.user_id = :visibilityUserId))`,
    replacements: { visibilityUserId: viewer.userId },
  };
}
