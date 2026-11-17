/**
 * Resolvers for requireUseCaseAccessVia: the use case (project id) that a
 * child row belongs to, looked up in the caller's organization only. Each
 * answers null when the row is not in that organization, so the guard passes
 * the request on and the handler answers as it always has.
 *
 * Every query is a fixed string: the table is chosen from a closed list, never
 * from the request.
 */
import { Request } from "express";
import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import type { UseCaseOfChild } from "../middleware/projectAccess.middleware";
import { getImplContextQuery, type ImplLevel } from "./frameworkImpl.utils";

const firstProjectId = async (sql: string, id: number, organizationId: number) => {
  const rows = await sequelize.query<{ project_id: number | null }>(sql, {
    replacements: { id, organizationId },
    type: QueryTypes.SELECT,
  });
  return rows[0]?.project_id ?? null;
};

/** A projects_frameworks row: a framework attached to a use case. */
export const useCaseOfProjectFramework: UseCaseOfChild = (id, organizationId) =>
  firstProjectId(
    `SELECT project_id FROM projects_frameworks
      WHERE organization_id = :organizationId AND id = :id`,
    id,
    organizationId,
  );

/** The use case of a requirement row that names its projects_frameworks row. */
const viaProjectFramework = (sql: string): UseCaseOfChild => {
  return (id, organizationId) => firstProjectId(sql, id, organizationId);
};

const joinProjectFramework = `JOIN projects_frameworks pf
         ON pf.organization_id = r.organization_id AND pf.id = r.projects_frameworks_id
      WHERE r.organization_id = :organizationId AND r.id = :id`;

/** An EU AI Act control (controls_eu). */
export const useCaseOfEuControl = viaProjectFramework(
  `SELECT pf.project_id FROM controls_eu r ${joinProjectFramework}`,
);

/** An ISO 42001 subclause (subclauses_iso). */
export const useCaseOfIso42001Subclause = viaProjectFramework(
  `SELECT pf.project_id FROM subclauses_iso r ${joinProjectFramework}`,
);

/** An ISO 42001 annex category (annexcategories_iso). */
export const useCaseOfIso42001AnnexCategory = viaProjectFramework(
  `SELECT pf.project_id FROM annexcategories_iso r ${joinProjectFramework}`,
);

/** An ISO 27001 subclause (subclauses_iso27001). */
export const useCaseOfIso27001Subclause = viaProjectFramework(
  `SELECT pf.project_id FROM subclauses_iso27001 r ${joinProjectFramework}`,
);

/** An ISO 27001 annex control (annexcontrols_iso27001). */
export const useCaseOfIso27001AnnexControl = viaProjectFramework(
  `SELECT pf.project_id FROM annexcontrols_iso27001 r ${joinProjectFramework}`,
);

/** A NIST AI RMF subcategory (nist_ai_rmf_subcategories). */
export const useCaseOfNistSubcategory = viaProjectFramework(
  `SELECT pf.project_id FROM nist_ai_rmf_subcategories r ${joinProjectFramework}`,
);

/** An EU AI Act answer (answers_eu), through its assessment. */
export const useCaseOfEuAnswer: UseCaseOfChild = (id, organizationId) =>
  firstProjectId(
    `SELECT pf.project_id FROM answers_eu a
       JOIN assessments s
         ON s.organization_id = a.organization_id AND s.id = a.assessment_id
       JOIN projects_frameworks pf
         ON pf.organization_id = s.organization_id AND pf.id = s.projects_frameworks_id
      WHERE a.organization_id = :organizationId AND a.id = :id`,
    id,
    organizationId,
  );

/** A FRIA (fria_assessments). */
export const useCaseOfFria: UseCaseOfChild = (id, organizationId) =>
  firstProjectId(
    `SELECT project_id FROM fria_assessments
      WHERE organization_id = :organizationId AND id = :id`,
    id,
    organizationId,
  );

const IMPL_LEVELS: ReadonlySet<string> = new Set<ImplLevel>(["l2", "l3"]);

/**
 * An impl row of one of the bundled frameworks (frameworkImpl routes). The
 * table comes from the framework registry for :frameworkId and :level; a
 * framework or level that has none resolves to null, so the handler answers
 * its usual 400 or 404.
 */
export const useCaseOfFrameworkImpl: UseCaseOfChild = async (id, organizationId, req: Request) => {
  const frameworkId = Number(req.params.frameworkId);
  const level = String(req.params.level);
  if (!Number.isSafeInteger(frameworkId) || !IMPL_LEVELS.has(level)) return null;
  const context = await getImplContextQuery(frameworkId, level as ImplLevel, id, organizationId);
  return context?.project_id ?? null;
};
