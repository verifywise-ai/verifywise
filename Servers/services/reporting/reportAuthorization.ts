import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import { projectAccessSql } from "../../utils/projectVisibility.utils";

/**
 * Who may produce a report, and over what.
 *
 * The read side already applies a membership rule (reportRun.utils'
 * viewerVisibilitySql). Nothing applied one to generation or delivery, so an
 * Editor could schedule a project report they cannot open and have it emailed
 * to themselves as an attachment, and an organization-scope run — the union of
 * every project in the tenant — was producible by any role.
 *
 * Kept as a pure rule plus a thin async wrapper so the rule is table-testable
 * without a database.
 */
export interface ReportScopeCheck {
  /** Role name from the JWT: Admin, Reviewer, Editor, Auditor, SuperAdmin. */
  role: string | null;
  scope: string | undefined;
  projectId: number | null | undefined;
  isMember: boolean;
}

const UNRESTRICTED_ROLES = ["Admin", "SuperAdmin"];

/** Returns [] when permitted, else one or more human-readable reasons. */
export function reportScopeErrors(input: ReportScopeCheck): string[] {
  if (input.role && UNRESTRICTED_ROLES.includes(input.role)) return [];

  // An omitted scope is organization scope: reportTemplate.ctrl defaults it
  // that way, so falling through here would leave the widest case ungated.
  if (input.scope !== "project") {
    return ["organization-scope reports require the Admin role"];
  }

  if (!input.projectId) return ["project scope requires projectId"];
  if (!input.isMember) return ["you are not a member of this project"];
  return [];
}

/**
 * Resolve membership, then apply the rule.
 *
 * A project that does not exist in the caller's organization produces no row
 * and therefore the same "not a member" message — the endpoint never confirms
 * whether another tenant's project id exists.
 */
export async function assertReportScopeAllowed(input: {
  role: string | null;
  userId: number;
  organizationId: number;
  scope: string | undefined;
  projectId: number | null | undefined;
}): Promise<string[]> {
  const needsMembership =
    input.scope === "project" &&
    !!input.projectId &&
    !(input.role && UNRESTRICTED_ROLES.includes(input.role));

  let isMember = false;
  if (needsMembership) {
    // The use case rule (projectAccessSql): owner, member, or through a group
    // attached to the use case, the same people who can open it and see its
    // reports (reportVisibility.utils).
    const access = projectAccessSql("p", input.userId);
    const rows = (await sequelize.query(
      `SELECT 1 AS ok FROM projects p
        WHERE p.id = :projectId
          AND p.organization_id = :organizationId${access.sql}
        LIMIT 1`,
      {
        replacements: {
          projectId: input.projectId,
          organizationId: input.organizationId,
          ...access.replacements,
        },
        type: QueryTypes.SELECT,
      },
    )) as Array<{ ok: number }>;
    isMember = rows.length > 0;
  }

  return reportScopeErrors({
    role: input.role,
    scope: input.scope,
    projectId: input.projectId,
    isMember,
  });
}
