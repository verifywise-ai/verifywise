/**
 * @fileoverview Report scope resolution — turns a report's scope and framework
 * selection into the set of (project, framework) pairings its framework
 * sections are collected from.
 *
 * This file used to say the wizard should never grow a framework picker. That
 * rationale was against a SINGLE frameworkId field: projects_frameworks is
 * many-per-project, so one id would pin a report to one framework and silently
 * drop the project's others. A multi-valued filter where empty means "all" is
 * the case that argument does not cover, and it is what makes an "ISO 42001
 * Internal Audit Pack" expressible at all.
 *
 * Scope + projectId still decide the candidate set; frameworkIds only narrows
 * it, and an empty selection narrows nothing.
 *
 * Before scope existed, frameworkId and projectFrameworkId arrived as NULL from
 * every wizard-driven run and reportTemplateResolver coerced them to 0. Every
 * framework section in collectAllData is gated on the numeric framework id
 * (=== 1 for EU AI Act, 2/3 for ISO, 4 for NIST), so a 0 closed all four gates
 * and the report came out with no compliance, assessment, clauses or NIST
 * content at all. parseFrameworkSelection rejects 0 for the same reason.
 *
 * @module services/reporting/reportScope
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { parseFrameworkSelection, isEmptySelection } from "./frameworkSelection";

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
  frameworkIds?: string[] | null,
): Promise<FrameworkTarget[]> {
  // A project-scoped report with no project covers nothing. Returning empty
  // beats querying the whole organization, which would leak every project's
  // data into a report that asked for one.
  if (scope === "project" && !projectId) return [];

  const selection = parseFrameworkSelection(frameworkIds ?? []);

  // A non-empty selection naming no native framework — only plugin/custom
  // entries, or only unparseable ones — resolves to nothing here, because
  // projects_frameworks holds native pairings only. Falling through to an
  // unfiltered query would widen the report to every framework the caller
  // explicitly did not ask for. The collector turns this into a visible
  // unresolved_framework notice rather than a silently missing section.
  if (!isEmptySelection(selection) && selection.native.length === 0) return [];
  if (isEmptySelection(selection) && (frameworkIds ?? []).length > 0) return [];

  const replacements: Record<string, unknown> = { organizationId };

  let projectPredicate = "";
  if (scope === "project") {
    projectPredicate = " AND pf.project_id = :projectId";
    replacements.projectId = Number(projectId);
  }

  let frameworkPredicate = "";
  if (selection.native.length > 0) {
    // `= ANY(ARRAY[:nativeFrameworkIds]::INTEGER[])` rather than the bare
    // `= ANY(:nativeFrameworkIds)`: sequelize expands an array replacement to
    // a comma list by string substitution, so the bare form renders
    // `ANY(2, 3)` and is a syntax error. Same trap dataCollector.ts documents
    // on fetchRisksForProjects (the ARRAY[] form) and resolveUserNames (the
    // IN form); this uses the ARRAY[] form to match fetchRisksForProjects.
    frameworkPredicate = " AND pf.framework_id = ANY(ARRAY[:nativeFrameworkIds]::INTEGER[])";
    replacements.nativeFrameworkIds = selection.native;
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
      WHERE pf.organization_id = :organizationId${projectPredicate}${frameworkPredicate}
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
