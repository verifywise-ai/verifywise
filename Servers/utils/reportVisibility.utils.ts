/**
 * Who may see a report artifact that may belong to a project: a run, or a
 * schedule (which carries its recipients and its stored report details).
 *
 * Admin and SuperAdmin see everything. Everyone else sees an artifact for a
 * project only when they own the project or are a member of it; an
 * organization-wide artifact (no project) is visible to every member. This
 * mirrors the legacy Generate list (getGeneratedReportsQuery), and runs and
 * schedules share it so the two can never disagree about the same project.
 */
export type ReportViewer = {
  userId: number | null;
  /** Role name from the JWT: Admin, Reviewer, Editor, Auditor, SuperAdmin. */
  role: string | null;
};

/**
 * The membership predicate, or null when the viewer may see everything.
 *
 * `projectIdTextSql` is an SQL expression giving the artifact's project id as
 * text, or NULL for an organization-wide artifact. Compared as text so a value
 * that is not a number can never raise a cast error mid-query. The predicate
 * binds :organization_id and :viewerUserId; the caller supplies both.
 */
export function projectVisibilitySql(
  viewer: ReportViewer,
  projectIdTextSql: string,
): string | null {
  if (viewer.role === "Admin" || viewer.role === "SuperAdmin") return null;
  return `(${projectIdTextSql} IS NULL OR EXISTS (
       SELECT 1 FROM projects p
       LEFT JOIN projects_members pm
         ON pm.project_id = p.id AND pm.organization_id = :organization_id
       WHERE p.id::text = ${projectIdTextSql}
         AND p.organization_id = :organization_id
         AND (p.owner = :viewerUserId OR pm.user_id = :viewerUserId)
     ))`;
}
