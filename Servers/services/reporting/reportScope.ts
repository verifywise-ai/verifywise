/**
 * @fileoverview Report scope resolution — turns a report's scope into the set
 * of (project, framework) pairings its framework sections are collected from.
 *
 * The report wizard has no framework picker, and it should not grow one:
 * projects_frameworks is many-per-project, so a single frameworkId field would
 * pin a report to one framework and silently drop the project's others.
 * Scope + projectId is all the caller states; the pairings are derived here.
 *
 * Before this existed, frameworkId and projectFrameworkId arrived as NULL from
 * every wizard-driven run and reportTemplateResolver coerced them to 0. Every
 * framework section in collectAllData is gated on the numeric framework id
 * (=== 1 for EU AI Act, 2/3 for ISO, 4 for NIST), so a 0 closed all four gates
 * and the report came out with no compliance, assessment, clauses or NIST
 * content at all.
 *
 * @module services/reporting/reportScope
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";

export type ReportScope = "project" | "organization";

/** One projects_frameworks pairing a report collects framework sections from. */
export interface FrameworkTarget {
  projectId: number;
  projectTitle: string;
  /** projects.is_organizational — NOT the report's scope. See collectAllData. */
  isOrganizationalProject: boolean;
  frameworkId: number;
  frameworkName: string;
  projectFrameworkId: number;
}

/**
 * Every pairing the report covers, ordered so the merged sections read in a
 * stable project-then-framework order.
 *
 * Project scope narrows to the one project; organization scope drops that
 * predicate and covers the whole tenant. Both join `projects` on
 * organization_id as well, so a pairing row can never pull in another tenant's
 * project.
 */
export async function resolveFrameworkTargets(
  scope: ReportScope,
  projectId: number | null | undefined,
  organizationId: number,
): Promise<FrameworkTarget[]> {
  // A project-scoped report with no project covers nothing. Returning empty
  // beats querying the whole organization, which would leak every project's
  // data into a report that asked for one.
  if (scope === "project" && !projectId) return [];

  const replacements: Record<string, number> = { organizationId };
  let projectPredicate = "";
  if (scope === "project") {
    projectPredicate = " AND pf.project_id = :projectId";
    replacements.projectId = Number(projectId);
  }

  const rows = (await sequelize.query(
    `SELECT pf.id AS project_framework_id,
            pf.framework_id,
            pf.project_id,
            p.project_title,
            p.is_organizational,
            f.name AS framework_name
       FROM projects_frameworks pf
       JOIN projects p ON p.id = pf.project_id AND p.organization_id = :organizationId
       JOIN frameworks f ON f.id = pf.framework_id
      WHERE pf.organization_id = :organizationId${projectPredicate}
      ORDER BY pf.project_id, pf.framework_id`,
    { replacements, type: QueryTypes.SELECT },
  )) as any[];

  return rows.map((r) => ({
    projectId: Number(r.project_id),
    projectTitle: r.project_title,
    isOrganizationalProject: Boolean(r.is_organizational),
    frameworkId: Number(r.framework_id),
    frameworkName: r.framework_name,
    projectFrameworkId: Number(r.project_framework_id),
  }));
}
