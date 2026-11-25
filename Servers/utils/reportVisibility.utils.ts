import { projectAccessSql, seesAllProjects } from "./projectVisibility.utils";

/**
 * Who may see a report artifact that may belong to a project: a run, or a
 * schedule (which carries its recipients and its stored report details).
 *
 * Admin and SuperAdmin see everything. Everyone else sees an artifact for a
 * project only when they can see the project itself (projectAccessSql: owner,
 * member, or through a group attached to it), and an organization-wide
 * artifact (no project) is visible to every member. Runs and schedules share
 * it, and it reuses the use case rule, so a person who can open a use case can
 * see its reports and nobody else can.
 */
export type ReportViewer = {
  userId: number | null;
  /** Role name from the JWT: Admin, Reviewer, Editor, Auditor, SuperAdmin. */
  role: string | null;
};

/**
 * The visibility predicate and its replacements, or null when the viewer may
 * see everything.
 *
 * `projectIdSql` is an SQL expression giving the artifact's project id, or
 * NULL for an organization-wide artifact. Pass `{ asText: true }` when it is
 * text (a run's JSON snapshot value), so a value that is not a number can never
 * raise a cast error; an integer column compares directly and keeps the
 * primary-key lookup. A null userId matches no owner, member or group, so an
 * unidentified caller sees organization-wide artifacts only.
 */
export function reportVisibilityPredicate(
  viewer: ReportViewer,
  organizationId: number,
  projectIdSql: string,
  opts: { asText?: boolean } = {},
): { sql: string; replacements: Record<string, unknown> } | null {
  if (seesAllProjects(viewer.role ?? undefined)) return null;
  const access = projectAccessSql("p", viewer.userId as number);
  const idMatch = opts.asText ? `p.id::text = ${projectIdSql}` : `p.id = ${projectIdSql}`;
  return {
    sql: `(${projectIdSql} IS NULL OR EXISTS (
       SELECT 1 FROM projects p
        WHERE ${idMatch}
          AND p.organization_id = :organizationId${access.sql}
     ))`,
    replacements: { ...access.replacements, organizationId },
  };
}
