import { RiskModel } from "../domain.layer/models/risks/risk.model";
import { sequelize } from "../database/db";
import { Transaction } from "sequelize";
import { IRisk } from "../domain.layer/interfaces/I.risk";
import { IProjectFrameworks } from "../domain.layer/interfaces/i.projectFramework";
import { TenantAutomationActionModel } from "../domain.layer/models/tenantAutomationAction/tenantAutomationAction.model";
import { replaceTemplateVariables } from "./automation/automation.utils";
import { enqueueAutomationAction } from "../services/automations/automationProducer";
import {
  buildRiskReplacements,
  buildRiskUpdateReplacements,
} from "./automation/risk.automation.utils";
import { recordSnapshotIfChanged } from "./history/riskHistory.utils";

type Mitigation = {
  id: number;
  meta_id: number;
  parent_id: number;
  sup_id: string;
  title: string;
  sub_id: number;
  project_id: number;
};

export const validateRiskFrameworksQuery = async (
  frameworks: number[]
): Promise<boolean> => {
  const result = (await sequelize.query(
    `SELECT id FROM frameworks WHERE is_organizational = true;`
  )) as [{ id: number }[], number];
  const orgFrameworks = result[0].map((f) => f.id);
  for (let f of frameworks) {
    if (!orgFrameworks.includes(f)) {
      return false;
    }
  }
  return true;
};

export const validateRiskProjectsQuery = async (
  projects: number[],
  organizationId: number
): Promise<boolean> => {
  const result = (await sequelize.query(
    `SELECT id FROM projects WHERE organization_id = :organizationId AND is_organizational = false;`,
    { replacements: { organizationId } }
  )) as [{ id: number }[], number];
  const nonOrgProjects = result[0].map((p) => p.id);
  for (let p of projects) {
    if (!nonOrgProjects.includes(p)) {
      return false;
    }
  }
  return true;
};

export const getAllRisksQuery = async (
  organizationId: number,
  filter: "active" | "deleted" | "all" = "active"
): Promise<IRisk[]> => {
  let whereClause = "WHERE r.organization_id = :organizationId";
  switch (filter) {
    case "active":
      whereClause += " AND r.is_deleted = false";
      break;
    case "deleted":
      whereClause += " AND r.is_deleted = true";
      break;
    case "all":
      // No additional filter
      break;
  }

  // OPTIMIZED: Fast query for list view - only fetches basic risk data with projects/frameworks
  // The full relationships (subClauses, annexCategories, controls, assessments, etc.)
  // are fetched separately via getRiskByIdQuery when viewing a single risk
  const query = `
    SELECT
      r.*,
      COALESCE(
        JSON_AGG(DISTINCT pr.project_id) FILTER (WHERE pr.project_id IS NOT NULL),
        '[]'
      ) as projects,
      COALESCE(
        JSON_AGG(DISTINCT fr.framework_id) FILTER (WHERE fr.framework_id IS NOT NULL),
        '[]'
      ) as frameworks
    FROM risks r
    LEFT JOIN projects_risks pr ON r.id = pr.risk_id AND pr.organization_id = :organizationId
    LEFT JOIN frameworks_risks fr ON r.id = fr.risk_id AND fr.organization_id = :organizationId
    ${whereClause}
    GROUP BY r.id
    ORDER BY r.created_at DESC, r.id ASC
  `;

  const result = (await sequelize.query(query, { replacements: { organizationId } })) as [any[], number];
  const risks = result[0];

  // Parse JSON strings if needed
  for (let risk of risks) {
    if (typeof risk.projects === 'string') {
      risk.projects = JSON.parse(risk.projects);
    }
    if (typeof risk.frameworks === 'string') {
      risk.frameworks = JSON.parse(risk.frameworks);
    }
    // Initialize empty arrays for relationships (fetched on demand via getRiskByIdQuery)
    risk.subClauses = [];
    risk.annexCategories = [];
    risk.controls = [];
    risk.assessments = [];
    risk.annexControls_27001 = [];
    risk.subClauses_27001 = [];
  }

  return risks as IRisk[];
};

/**
 * PRESERVED: Original complex query with all relationships
 * This query fetches all risk data including subClauses, annexCategories, controls, assessments, etc.
 * It's slow due to 12+ LEFT JOINs and subqueries in JOIN conditions.
 * Use getAllRisksQuery for list views and getRiskByIdQuery for single risk with full relationships.
 */
export const getAllRisksQueryWithRelationships = async (
  organizationId: number,
  filter: "active" | "deleted" | "all" = "active"
): Promise<IRisk[]> => {
  let whereClause = "WHERE r.organization_id = :organizationId";
  switch (filter) {
    case "active":
      whereClause += " AND is_deleted = false";
      break;
    case "deleted":
      whereClause += " AND is_deleted = true";
      break;
    case "all":
      // No additional filter
      break;
  }

  const query = `
    SELECT
      r.*,
      COALESCE(
        JSON_AGG(DISTINCT pr.project_id) FILTER (WHERE pr.project_id IS NOT NULL),
        '[]'
      ) as projects,
      COALESCE(
        JSON_AGG(DISTINCT fr.framework_id) FILTER (WHERE fr.framework_id IS NOT NULL),
        '[]'
      ) as frameworks,
      COALESCE(
        JSON_AGG(DISTINCT JSONB_BUILD_OBJECT(
          'id', scr.subclause_id,
          'meta_id', sc.subclause_meta_id,
          'sup_id', csi.clause_no,
          'title', scs.title,
          'sub_id', scs.order_no,
          'parent_id', csi.id,
          'project_id', pf_sc.project_id
        )) FILTER (WHERE scr.subclause_id IS NOT NULL),
        '[]'
      ) as sub_clauses,
      COALESCE(
        JSON_AGG(DISTINCT JSONB_BUILD_OBJECT(
          'id', acr.annexcategory_id,
          'meta_id', ac.annexcategory_meta_id,
          'sup_id', asi.annex_no,
          'sub_id', acs.sub_id,
          'title', acs.title,
          'parent_id', asi.id,
          'project_id', pf_ac.project_id
        )) FILTER (WHERE acr.annexcategory_id IS NOT NULL),
        '[]'
      ) as annex_categories,
      COALESCE(
        JSON_AGG(DISTINCT JSONB_BUILD_OBJECT(
          'id', cr.control_id,
          'meta_id', ac_eu.control_meta_id,
          'sup_id', ccs.id,
          'sub_id', cse.id,
          'title', cse.title,
          'parent_id', cse.id,
          'project_id', pf_cr.project_id
        )) FILTER (WHERE cr.control_id IS NOT NULL),
        '[]'
      ) as controls,
      COALESCE(
        JSON_AGG(DISTINCT JSONB_BUILD_OBJECT(
          'id', ans.id,
          'meta_id', ans.question_id,
          'sup_id', ts.id,
          'sub_id', sts.id,
          'title', ts.title || '. ' || sts.title || '. ' || qse.question,
          'parent_id', qse.id,
          'project_id', pf_ans.project_id
        )) FILTER (WHERE ans.id IS NOT NULL),
        '[]'
      ) as assessments,
      COALESCE(
        JSON_AGG(DISTINCT JSONB_BUILD_OBJECT(
          'id', acr_27001.annexcontrol_id,
          'meta_id', ac_27001.annexcontrol_meta_id,
          'sup_id', ccs_27001.id,
          'sub_id', cse_27001.id,
          'title', cse_27001.title,
          'parent_id', cse_27001.id,
          'project_id', pf_ac27001.project_id
        )) FILTER (WHERE acr_27001.annexcontrol_id IS NOT NULL),
        '[]'
      ) as annex_controls_27001,
      COALESCE(
        JSON_AGG(DISTINCT JSONB_BUILD_OBJECT(
          'id', scr_27001.subclause_id,
          'meta_id', sc_27001.subclause_meta_id,
          'sup_id', csi_27001.order_no,
          'title', scs_27001.title,
          'sub_id', scs_27001.order_no,
          'parent_id', csi_27001.id,
          'project_id', pf_sc27001.project_id
        )) FILTER (WHERE scr_27001.subclause_id IS NOT NULL),
        '[]'
      ) as sub_clauses_27001
    FROM risks r

    -- Projects relationship
    LEFT JOIN projects_risks pr ON r.id = pr.risk_id AND pr.organization_id = :organizationId

    -- Frameworks relationship
    LEFT JOIN frameworks_risks fr ON r.id = fr.risk_id AND fr.organization_id = :organizationId

    -- SubClauses ISO relationship
    LEFT JOIN subclauses_iso__risks scr ON r.id = scr.projects_risks_id AND scr.organization_id = :organizationId
    LEFT JOIN subclauses_iso sc ON scr.subclause_id = sc.id AND sc.organization_id = :organizationId
    LEFT JOIN subclauses_struct_iso scs ON scs.id = sc.subclause_meta_id
    LEFT JOIN clauses_struct_iso csi ON csi.id = scs.clause_id
    LEFT JOIN projects_frameworks pf_sc ON pf_sc.framework_id = csi.framework_id AND pf_sc.organization_id = :organizationId
      AND pf_sc.project_id IN (SELECT project_id FROM projects_risks WHERE risk_id = r.id AND organization_id = :organizationId)

    -- Annex Categories relationship
    LEFT JOIN annexcategories_iso__risks acr ON r.id = acr.projects_risks_id AND acr.organization_id = :organizationId
    LEFT JOIN annexcategories_iso ac ON acr.annexcategory_id = ac.id AND ac.organization_id = :organizationId
    LEFT JOIN annexcategories_struct_iso acs ON acs.id = ac.annexcategory_meta_id
    LEFT JOIN annex_struct_iso asi ON asi.id = acs.annex_id
    LEFT JOIN projects_frameworks pf_ac ON pf_ac.framework_id = asi.framework_id AND pf_ac.organization_id = :organizationId
      AND pf_ac.project_id IN (SELECT project_id FROM projects_risks WHERE risk_id = r.id AND organization_id = :organizationId)

    -- Controls EU relationship
    LEFT JOIN controls_eu__risks cr ON r.id = cr.projects_risks_id AND cr.organization_id = :organizationId
    LEFT JOIN controls_eu ac_eu ON cr.control_id = ac_eu.id AND ac_eu.organization_id = :organizationId
    LEFT JOIN controls_struct_eu cse ON cse.id = ac_eu.control_meta_id
    LEFT JOIN controlcategories_struct_eu ccs ON ccs.id = cse.control_category_id
    LEFT JOIN projects_frameworks pf_cr ON pf_cr.framework_id = ccs.framework_id AND pf_cr.organization_id = :organizationId
      AND pf_cr.project_id IN (SELECT project_id FROM projects_risks WHERE risk_id = r.id AND organization_id = :organizationId)

    -- Answers/Assessments EU relationship
    LEFT JOIN answers_eu__risks aur ON r.id = aur.projects_risks_id AND aur.organization_id = :organizationId
    LEFT JOIN answers_eu ans ON aur.answer_id = ans.id AND ans.organization_id = :organizationId
    LEFT JOIN questions_struct_eu qse ON qse.id = ans.question_id
    LEFT JOIN subtopics_struct_eu sts ON sts.id = qse.subtopic_id
    LEFT JOIN topics_struct_eu ts ON ts.id = sts.topic_id
    LEFT JOIN projects_frameworks pf_ans ON pf_ans.framework_id = ts.framework_id AND pf_ans.organization_id = :organizationId
      AND pf_ans.project_id IN (SELECT project_id FROM projects_risks WHERE risk_id = r.id AND organization_id = :organizationId)

    -- Annex Controls ISO 27001 relationship
    LEFT JOIN annexcontrols_iso27001__risks acr_27001 ON r.id = acr_27001.projects_risks_id AND acr_27001.organization_id = :organizationId
    LEFT JOIN annexcontrols_iso27001 ac_27001 ON acr_27001.annexcontrol_id = ac_27001.id AND ac_27001.organization_id = :organizationId
    LEFT JOIN annexcontrols_struct_iso27001 cse_27001 ON cse_27001.id = ac_27001.annexcontrol_meta_id
    LEFT JOIN annex_struct_iso27001 ccs_27001 ON ccs_27001.id = cse_27001.annex_id
    LEFT JOIN projects_frameworks pf_ac27001 ON pf_ac27001.framework_id = ccs_27001.framework_id AND pf_ac27001.organization_id = :organizationId
      AND pf_ac27001.project_id IN (SELECT project_id FROM projects_risks WHERE risk_id = r.id AND organization_id = :organizationId)

    -- SubClauses ISO 27001 relationship
    LEFT JOIN subclauses_iso27001__risks scr_27001 ON r.id = scr_27001.projects_risks_id AND scr_27001.organization_id = :organizationId
    LEFT JOIN subclauses_iso27001 sc_27001 ON scr_27001.subclause_id = sc_27001.id AND sc_27001.organization_id = :organizationId
    LEFT JOIN subclauses_struct_iso27001 scs_27001 ON scs_27001.id = sc_27001.subclause_meta_id
    LEFT JOIN clauses_struct_iso27001 csi_27001 ON csi_27001.id = scs_27001.clause_id
    LEFT JOIN projects_frameworks pf_sc27001 ON pf_sc27001.framework_id = csi_27001.framework_id AND pf_sc27001.organization_id = :organizationId
      AND pf_sc27001.project_id IN (SELECT project_id FROM projects_risks WHERE risk_id = r.id AND organization_id = :organizationId)

    ${whereClause}
    GROUP BY r.id
    ORDER BY r.created_at DESC, r.id ASC
  `;

  const result = (await sequelize.query(query, { replacements: { organizationId } })) as [any[], number];
  const risks = result[0];

  // Helper function to transform arrays - hoisted outside loop for performance
  const transformArray = (arr: any[]) => {
    if (typeof arr === 'string') {
      arr = JSON.parse(arr);
    }

    // Filter out empty objects and transform keys
    const filtered = arr.filter((item: any) => item && item.id != null);

    return filtered.map((item: any) => ({
      id: item.id,
      meta_id: item.meta_id,
      parent_id: item.parent_id,
      sup_id: item.sup_id,
      title: item.title,
      sub_id: item.sub_id,
      project_id: item.project_id
    }));
  };

  // Transform the aggregated JSON arrays back to the expected format
  for (let risk of risks) {
    // Parse JSON strings if needed
    if (typeof risk.projects === 'string') {
      risk.projects = JSON.parse(risk.projects);
    }
    if (typeof risk.frameworks === 'string') {
      risk.frameworks = JSON.parse(risk.frameworks);
    }

    risk.subClauses = transformArray(risk.sub_clauses || []);
    risk.annexCategories = transformArray(risk.annex_categories || []);
    risk.controls = transformArray(risk.controls || []);
    risk.assessments = transformArray(risk.assessments || []);
    risk.annexControls_27001 = transformArray(risk.annex_controls_27001 || []);
    risk.subClauses_27001 = transformArray(risk.sub_clauses_27001 || []);

    // Clean up the snake_case versions
    delete risk.sub_clauses;
    delete risk.annex_categories;
    delete risk.annex_controls_27001;
    delete risk.sub_clauses_27001;
  }

  return risks as IRisk[];
};

export const getRisksByProjectQuery = async (
  projectId: number,
  organizationId: number,
  filter: "active" | "deleted" | "all" = "active"
): Promise<IRisk[] | null> => {
  let whereClause = "WHERE r.organization_id = :organizationId";
  switch (filter) {
    case "active":
      whereClause += " AND r.is_deleted = false";
      break;
    case "deleted":
      whereClause += " AND r.is_deleted = true";
      break;
    case "all":
      // No additional filter
      break;
  }

  const result = (await sequelize.query(
    `SELECT
      r.*,
      COALESCE(
        JSON_AGG(DISTINCT p.id) FILTER (WHERE p.id IS NOT NULL),
        '[]'
      ) as projects,
      COALESCE(
        JSON_AGG(DISTINCT f.id) FILTER (WHERE f.id IS NOT NULL),
        '[]'
      ) as frameworks
    FROM risks r
      INNER JOIN projects_risks pr_filter ON r.id = pr_filter.risk_id AND pr_filter.project_id = :projectId AND pr_filter.organization_id = :organizationId
      LEFT JOIN projects_risks pr ON r.id = pr.risk_id AND pr.organization_id = :organizationId
      LEFT JOIN projects p ON pr.project_id = p.id AND p.organization_id = :organizationId
      LEFT JOIN frameworks_risks fr ON r.id = fr.risk_id AND fr.organization_id = :organizationId
      LEFT JOIN frameworks f ON fr.framework_id = f.id
      ${whereClause}
      GROUP BY r.id
      ORDER BY r.created_at DESC, r.id ASC`,
    { replacements: { projectId, organizationId } }
  )) as [IRisk[], number];
  return result[0];
};

export const getRisksByFrameworkQuery = async (
  frameworkId: number,
  organizationId: number,
  filter: "active" | "deleted" | "all" = "active"
): Promise<IRisk[] | null> => {
  let whereClause = "WHERE r.organization_id = :organizationId";
  switch (filter) {
    case "active":
      whereClause += " AND r.is_deleted = false";
      break;
    case "deleted":
      whereClause += " AND r.is_deleted = true";
      break;
    case "all":
      // No additional filter
      break;
  }

  const result = (await sequelize.query(
    `SELECT
      r.*,
      COALESCE(
        JSON_AGG(DISTINCT p.id) FILTER (WHERE p.id IS NOT NULL),
        '[]'
      ) AS projects,
      COALESCE(
        JSON_AGG(DISTINCT f.id) FILTER (WHERE f.id IS NOT NULL),
        '[]'
      ) AS frameworks
    FROM risks r
    INNER JOIN frameworks_risks fr_filter ON r.id = fr_filter.risk_id AND fr_filter.framework_id = :frameworkId AND fr_filter.organization_id = :organizationId
    LEFT JOIN projects_risks pr ON r.id = pr.risk_id AND pr.organization_id = :organizationId
    LEFT JOIN projects p ON pr.project_id = p.id AND p.organization_id = :organizationId
    LEFT JOIN frameworks_risks fr ON r.id = fr.risk_id AND fr.organization_id = :organizationId
    LEFT JOIN frameworks f ON fr.framework_id = f.id
    ${whereClause}
    GROUP BY r.id
    ORDER BY r.created_at DESC, r.id ASC;
    `,
    { replacements: { frameworkId, organizationId } }
  )) as [IRisk[], number];
  return result[0];
};

export const getRiskByIdQuery = async (
  id: number,
  organizationId: number,
  includeDeleted: boolean = false
): Promise<IRisk | null> => {
  const whereClause = includeDeleted
    ? "WHERE id = :id AND organization_id = :organizationId"
    : "WHERE id = :id AND organization_id = :organizationId AND is_deleted = false";
  const result = (await sequelize.query(
    `SELECT * FROM risks ${whereClause}`,
    { replacements: { id, organizationId } }
  )) as [IRisk[], number];
  const projectRisk = result[0][0];
  if (!projectRisk) return null;

    let ownerFullName = "";

  // Run query ONLY if risk_owner exists
  if (projectRisk.risk_owner) {
    const ownerResult = await sequelize.query(
      `SELECT name || ' ' || surname AS full_name
      FROM users
      WHERE id = :owner_id;`,
      {
        replacements: { owner_id: projectRisk.risk_owner }
      }
    ) as [{ full_name: string }[], number];

    ownerFullName = ownerResult?.[0]?.[0]?.full_name ?? "";
  }
  (projectRisk as any).owner_name = ownerFullName;

  let approverFullName = "";
  if (projectRisk.risk_approval) {
    const approver_name = (await sequelize.query(
      `SELECT name || ' ' || surname AS full_name FROM users WHERE id = :approver_id;`,
      {
        replacements: { approver_id: projectRisk.risk_approval },
      }
    )) as [{ full_name: string }[], number];
    approverFullName = approver_name?.[0]?.[0]?.full_name ?? "";
  }
  (projectRisk as any).approver_name = approverFullName;

  (projectRisk as any).projects = [];
  (projectRisk as any).frameworks = [];
  (projectRisk as any).subClauses = [];
  (projectRisk as any).annexCategories = [];
  (projectRisk as any).controls = [];
  (projectRisk as any).assessments = [];
  (projectRisk as any).subClauses_27001 = [];
  (projectRisk as any).annexControls_27001 = [];

  const attachedProjects = (await sequelize.query(
    `SELECT project_id FROM projects_risks WHERE risk_id = :riskId AND organization_id = :organizationId`,
    { replacements: { riskId: projectRisk.id, organizationId } }
  )) as [{ project_id: number }[], number];
  if (attachedProjects[0].length > 0) {
    (projectRisk as any).projects = attachedProjects[0].map(
      (p) => p.project_id
    );
  }

  const attachedFrameworks = (await sequelize.query(
    `SELECT framework_id FROM frameworks_risks WHERE risk_id = :riskId AND organization_id = :organizationId`,
    { replacements: { riskId: projectRisk.id, organizationId } }
  )) as [{ framework_id: number }[], number];
  if (attachedFrameworks[0].length > 0) {
    (projectRisk as any).frameworks = attachedFrameworks[0].map(
      (f) => f.framework_id
    );
  }

  const attachedSubClauses = (await sequelize.query(
    `SELECT
        scr.subclause_id AS id, sc.subclause_meta_id AS meta_id, csi.clause_no AS sup_id, scs.title, scs.order_no AS sub_id, csi.id AS parent_id, pf.project_id AS project_id
      FROM subclauses_iso__risks scr JOIN subclauses_iso sc ON scr.subclause_id = sc.id AND sc.organization_id = :organizationId
      JOIN subclauses_struct_iso scs ON scs.id = sc.subclause_meta_id
      JOIN clauses_struct_iso csi ON csi.id = scs.clause_id
      JOIN projects_frameworks pf ON pf.framework_id = csi.framework_id AND pf.organization_id = :organizationId
      WHERE scr.projects_risks_id = :riskId AND scr.organization_id = :organizationId`,
    { replacements: { riskId: projectRisk.id, organizationId } }
  )) as [Mitigation[], number];
  if (attachedSubClauses[0].length > 0) {
    (projectRisk as any).subClauses = attachedSubClauses[0];
  }

  const attachedAnnexCategories = (await sequelize.query(
    `SELECT
       acr.annexcategory_id AS id, ac.annexcategory_meta_id AS meta_id, asi.annex_no AS sup_id, acs.sub_id AS sub_id, acs.title, asi.id AS parent_id, pf.project_id AS project_id
      FROM annexcategories_iso__risks acr JOIN annexcategories_iso ac ON acr.annexcategory_id = ac.id AND ac.organization_id = :organizationId
      JOIN annexcategories_struct_iso acs ON acs.id = ac.annexcategory_meta_id
      JOIN annex_struct_iso asi ON asi.id = acs.annex_id
      JOIN projects_frameworks pf ON pf.framework_id = asi.framework_id AND pf.organization_id = :organizationId
      WHERE acr.projects_risks_id = :riskId AND acr.organization_id = :organizationId`,
    { replacements: { riskId: projectRisk.id, organizationId } }
  )) as [Mitigation[], number];
  if (attachedAnnexCategories[0].length > 0) {
    (projectRisk as any).annexCategories = attachedAnnexCategories[0];
  }

  const attachedControls = (await sequelize.query(
    `SELECT cr.control_id AS id, ac.control_meta_id AS meta_id, ccs.id AS sup_id, cse.id AS sub_id, cse.title, cse.id AS parent_id, pf.project_id AS project_id
      FROM controls_eu__risks cr JOIN controls_eu ac ON cr.control_id = ac.id AND ac.organization_id = :organizationId
      JOIN controls_struct_eu cse ON cse.id = ac.control_meta_id
      JOIN controlcategories_struct_eu ccs ON ccs.id = cse.control_category_id
      JOIN projects_frameworks pf ON pf.framework_id = ccs.framework_id AND pf.organization_id = :organizationId
      WHERE cr.projects_risks_id = :riskId AND cr.organization_id = :organizationId`,
    { replacements: { riskId: projectRisk.id, organizationId } }
  )) as [Mitigation[], number];
  if (attachedControls[0].length > 0) {
    (projectRisk as any).controls = attachedControls[0];
  }

  const attachedAssessments = (await sequelize.query(
    `SELECT ans.id AS id, ans.question_id AS meta_id, ts.id AS sup_id, sts.id AS sub_id,
        ts.title || '. ' || sts.title || '. ' || qse.question AS title,
        qse.id AS parent_id, pf.project_id AS project_id
      FROM answers_eu__risks aur JOIN answers_eu ans ON aur.answer_id = ans.id AND ans.organization_id = :organizationId
      JOIN questions_struct_eu qse ON qse.id = ans.question_id
      JOIN subtopics_struct_eu sts ON sts.id = qse.subtopic_id
      JOIN topics_struct_eu ts ON ts.id = sts.topic_id
      JOIN projects_frameworks pf ON pf.framework_id = ts.framework_id AND pf.organization_id = :organizationId
      WHERE aur.projects_risks_id = :riskId AND aur.organization_id = :organizationId`,
    { replacements: { riskId: projectRisk.id, organizationId } }
  )) as [Mitigation[], number];
  if (attachedAssessments[0].length > 0) {
    (projectRisk as any).assessments = attachedAssessments[0];
  }

  const attachedAnnexControls_27001 = (await sequelize.query(
    `SELECT acr.annexcontrol_id AS id, ac.annexcontrol_meta_id AS meta_id, ccs.id AS sup_id, cse.id AS sub_id, cse.title, cse.id AS parent_id, pf.project_id AS project_id
      FROM annexcontrols_iso27001__risks acr JOIN annexcontrols_iso27001 ac ON acr.annexcontrol_id = ac.id AND ac.organization_id = :organizationId
      JOIN annexcontrols_struct_iso27001 cse ON cse.id = ac.annexcontrol_meta_id
      JOIN annex_struct_iso27001 ccs ON ccs.id = cse.annex_id
      JOIN projects_frameworks pf ON pf.framework_id = ccs.framework_id AND pf.organization_id = :organizationId
      WHERE acr.projects_risks_id = :riskId AND acr.organization_id = :organizationId`,
    { replacements: { riskId: projectRisk.id, organizationId } }
  )) as [Mitigation[], number];
  if (attachedAnnexControls_27001[0].length > 0) {
    (projectRisk as any).annexControls_27001 = attachedAnnexControls_27001[0];
  }

  const attachedSubClauses_27001 = (await sequelize.query(
    `SELECT
        scr.subclause_id AS id, sc.subclause_meta_id AS meta_id, csi.order_no AS sup_id, scs.title, scs.order_no AS sub_id, csi.id AS parent_id, pf.project_id AS project_id
      FROM subclauses_iso27001__risks scr JOIN subclauses_iso27001 sc ON scr.subclause_id = sc.id AND sc.organization_id = :organizationId
      JOIN subclauses_struct_iso27001 scs ON scs.id = sc.subclause_meta_id
      JOIN clauses_struct_iso27001 csi ON csi.id = scs.clause_id
      JOIN projects_frameworks pf ON pf.framework_id = csi.framework_id AND pf.organization_id = :organizationId
      WHERE scr.projects_risks_id = :riskId AND scr.organization_id = :organizationId`,
    { replacements: { riskId: projectRisk.id, organizationId } }
  )) as [Mitigation[], number];
  if (attachedSubClauses_27001[0].length > 0) {
    (projectRisk as any).subClauses_27001 = attachedSubClauses_27001[0];
  }

  return projectRisk;
};

const createProjectRiskLink = async (
  projects: number[],
  riskId: number,
  organizationId: number,
  transaction: Transaction
): Promise<void> => {
  const projectReplacements: { [key: string]: number }[] = [];
  const placeholders = projects
    .map((_, index) => {
      projectReplacements.push({ [`projectId_${index}`]: projects![index] });
      return `(:projectId_${index}, :riskId, :organizationId)`;
    })
    .join(", ");
  const replacements: any = {
    riskId: riskId,
    organizationId,
    ...Object.assign({}, ...projectReplacements),
  };
  await sequelize.query(
    `INSERT INTO projects_risks (project_id, risk_id, organization_id) VALUES ${placeholders}`,
    {
      replacements,
      transaction,
    }
  );
};

const createFrameworkRiskLink = async (
  frameworks: number[],
  riskId: number,
  organizationId: number,
  transaction: Transaction
): Promise<void> => {
  const frameworkReplacements: { [key: string]: number }[] = [];
  const placeholders = frameworks
    .map((_, index) => {
      frameworkReplacements.push({
        [`frameworkId_${index}`]: frameworks![index],
      });
      return `(:frameworkId_${index}, :riskId, :organizationId)`;
    })
    .join(", ");
  const replacements: any = {
    riskId: riskId,
    organizationId,
    ...Object.assign({}, ...frameworkReplacements),
  };
  await sequelize.query(
    `INSERT INTO frameworks_risks (framework_id, risk_id, organization_id) VALUES ${placeholders}`,
    {
      replacements,
      transaction,
    }
  );
};

export const createRiskQuery = async (
  projectRisk: Partial<
    RiskModel & { projects: number[]; frameworks: number[] }
  >,
  organizationId: number,
  transaction: Transaction
): Promise<RiskModel> => {
  const result = await sequelize.query(
    `INSERT INTO risks (
      organization_id, risk_name, risk_owner, ai_lifecycle_phase, risk_description,
      risk_category, impact, assessment_mapping, controls_mapping, likelihood,
      severity, risk_level_autocalculated, review_notes, mitigation_status,
      current_risk_level, deadline, mitigation_plan, implementation_strategy,
      mitigation_evidence_document, likelihood_mitigation, risk_severity,
      final_risk_level, risk_approval, approval_status, date_of_assessment, is_demo,
      event_frequency_min, event_frequency_likely, event_frequency_max,
      loss_regulatory_min, loss_regulatory_likely, loss_regulatory_max,
      loss_operational_min, loss_operational_likely, loss_operational_max,
      loss_litigation_min, loss_litigation_likely, loss_litigation_max,
      loss_reputational_min, loss_reputational_likely, loss_reputational_max,
      total_loss_likely, ale_estimate, control_effectiveness, residual_ale,
      mitigation_cost_annual, roi_percentage, benchmark_id, currency
    ) VALUES (
      :organization_id, :risk_name, :risk_owner, :ai_lifecycle_phase, :risk_description,
      :risk_category::enum_projectrisks_risk_category[], :impact, :assessment_mapping, :controls_mapping, :likelihood,
      :severity, :risk_level_autocalculated, :review_notes, :mitigation_status,
      :current_risk_level, :deadline, :mitigation_plan, :implementation_strategy,
      :mitigation_evidence_document, :likelihood_mitigation, :risk_severity,
      :final_risk_level, :risk_approval, :approval_status, :date_of_assessment, :is_demo,
      :event_frequency_min, :event_frequency_likely, :event_frequency_max,
      :loss_regulatory_min, :loss_regulatory_likely, :loss_regulatory_max,
      :loss_operational_min, :loss_operational_likely, :loss_operational_max,
      :loss_litigation_min, :loss_litigation_likely, :loss_litigation_max,
      :loss_reputational_min, :loss_reputational_likely, :loss_reputational_max,
      :total_loss_likely, :ale_estimate, :control_effectiveness, :residual_ale,
      :mitigation_cost_annual, :roi_percentage, :benchmark_id, :currency
    ) RETURNING *`,
    {
      replacements: {
        organization_id: organizationId,
        risk_name: projectRisk.risk_name,
        risk_owner: projectRisk.risk_owner,
        ai_lifecycle_phase: projectRisk.ai_lifecycle_phase,
        risk_description: projectRisk.risk_description,
        risk_category: `{${(projectRisk.risk_category || []).join(',')}}`,
        impact: projectRisk.impact,
        assessment_mapping: projectRisk.assessment_mapping,
        controls_mapping: projectRisk.controls_mapping,
        likelihood: projectRisk.likelihood,
        severity: projectRisk.severity,
        risk_level_autocalculated: projectRisk.risk_level_autocalculated,
        review_notes: projectRisk.review_notes,
        mitigation_status: projectRisk.mitigation_status,
        current_risk_level: projectRisk.current_risk_level,
        deadline: projectRisk.deadline,
        mitigation_plan: projectRisk.mitigation_plan,
        implementation_strategy: projectRisk.implementation_strategy,
        mitigation_evidence_document: projectRisk.mitigation_evidence_document,
        likelihood_mitigation: projectRisk.likelihood_mitigation,
        risk_severity: projectRisk.risk_severity,
        final_risk_level: projectRisk.final_risk_level,
        risk_approval: projectRisk.risk_approval,
        approval_status: projectRisk.approval_status,
        date_of_assessment: projectRisk.date_of_assessment,
        is_demo: projectRisk.is_demo || false,
        event_frequency_min: projectRisk.event_frequency_min ?? null,
        event_frequency_likely: projectRisk.event_frequency_likely ?? null,
        event_frequency_max: projectRisk.event_frequency_max ?? null,
        loss_regulatory_min: projectRisk.loss_regulatory_min ?? null,
        loss_regulatory_likely: projectRisk.loss_regulatory_likely ?? null,
        loss_regulatory_max: projectRisk.loss_regulatory_max ?? null,
        loss_operational_min: projectRisk.loss_operational_min ?? null,
        loss_operational_likely: projectRisk.loss_operational_likely ?? null,
        loss_operational_max: projectRisk.loss_operational_max ?? null,
        loss_litigation_min: projectRisk.loss_litigation_min ?? null,
        loss_litigation_likely: projectRisk.loss_litigation_likely ?? null,
        loss_litigation_max: projectRisk.loss_litigation_max ?? null,
        loss_reputational_min: projectRisk.loss_reputational_min ?? null,
        loss_reputational_likely: projectRisk.loss_reputational_likely ?? null,
        loss_reputational_max: projectRisk.loss_reputational_max ?? null,
        total_loss_likely: projectRisk.total_loss_likely ?? null,
        ale_estimate: projectRisk.ale_estimate ?? null,
        control_effectiveness: projectRisk.control_effectiveness ?? null,
        residual_ale: projectRisk.residual_ale ?? null,
        mitigation_cost_annual: projectRisk.mitigation_cost_annual ?? null,
        roi_percentage: projectRisk.roi_percentage ?? null,
        benchmark_id: projectRisk.benchmark_id ?? null,
        currency: projectRisk.currency ?? 'USD',
      },
      mapToModel: true,
      model: RiskModel,
      // type: QueryTypes.INSERT
      transaction,
    }
  );

  if (projectRisk.projects && projectRisk.projects.length > 0) {
    await createProjectRiskLink(
      projectRisk.projects,
      result[0].id!,
      organizationId,
      transaction
    );
  }

  if (projectRisk.frameworks && projectRisk.frameworks.length > 0) {
    await createFrameworkRiskLink(
      projectRisk.frameworks,
      result[0].id!,
      organizationId,
      transaction
    );
  }
  const createdRisk = result[0];

  const automations = (await sequelize.query(
    `SELECT
      pat.key AS trigger_key,
      paa.key AS action_key,
      a.id AS automation_id,
      aa.*
    FROM automation_triggers pat JOIN automations a ON a.trigger_id = pat.id AND a.organization_id = :organizationId JOIN automation_actions_data aa ON a.id = aa.automation_id AND aa.organization_id = :organizationId JOIN automation_actions paa ON aa.action_type_id = paa.id WHERE pat.key = 'risk_added' AND a.is_active ORDER BY aa."order" ASC;`,
    { replacements: { organizationId }, transaction }
  )) as [
    (TenantAutomationActionModel & {
      trigger_key: string;
      action_key: string;
      automation_id: number;
    })[],
    number,
  ];
  if (automations[0].length > 0) {
    const automation = automations[0][0];
    if (automation["trigger_key"] === "risk_added") {
      const owner_name = (await sequelize.query(
        `SELECT name || ' ' || surname AS full_name FROM users WHERE id = :owner_id;`,
        {
          replacements: { owner_id: createdRisk.dataValues.risk_owner },
          transaction,
        }
      )) as [{ full_name: string }[], number];
      const approver_name = (await sequelize.query(
        `SELECT name || ' ' || surname AS full_name FROM users WHERE id = :approver_id;`,
        {
          replacements: { approver_id: createdRisk.dataValues.risk_approval },
          transaction,
        }
      )) as [{ full_name: string }[], number];

      const params = automation.params!;

      // Build replacements
      const replacements = buildRiskReplacements({
        ...createdRisk.dataValues,
        owner_name: owner_name?.[0]?.[0]?.full_name ?? "",
        approver_name: approver_name?.[0]?.[0]?.full_name ?? "",
      });

      // Replace variables in subject and body
      const processedParams = {
        ...params,
        subject: replaceTemplateVariables(params.subject || "", replacements),
        body: replaceTemplateVariables(params.body || "", replacements),
        automation_id: automation.automation_id,
      };

      // Enqueue with processed params
      await enqueueAutomationAction(automation.action_key, {
        ...processedParams,
        organizationId,
      });
    } else {
      console.warn(
        `No matching trigger found for key: ${automation["trigger_key"]}`
      );
    }
  }

  // Record history snapshots for all tracked parameters
  try {
    await Promise.all([
      recordSnapshotIfChanged("severity", organizationId, undefined, transaction),
      recordSnapshotIfChanged("likelihood", organizationId, undefined, transaction),
      recordSnapshotIfChanged(
        "mitigation_status",
        organizationId,
        undefined,
        transaction
      ),
      recordSnapshotIfChanged("risk_level", organizationId, undefined, transaction),
    ]);
  } catch (historyError) {
    console.error("Error recording risk history snapshots:", historyError);
    // Don't throw - history recording failure shouldn't block risk creation
  }

  return createdRisk;
};

export const updateRiskByIdQuery = async (
  id: number,
  projectRisk: Partial<
    RiskModel & {
      projects: number[];
      frameworks: number[];
      deletedLinkedProject?: boolean;
      deletedLinkedFrameworks?: boolean;
    }
  >,
  organizationId: number,
  transaction: Transaction
): Promise<RiskModel | null> => {
  const existingRisk = await getRiskByIdQuery(id, organizationId, true);
  const updateProjectRisk: Partial<Record<keyof RiskModel, any>> & { organizationId?: number } = {};
  const setClause = [
    "risk_name",
    "risk_owner",
    "ai_lifecycle_phase",
    "risk_description",
    "risk_category",
    "impact",
    "assessment_mapping",
    "controls_mapping",
    "likelihood",
    "severity",
    "risk_level_autocalculated",
    "review_notes",
    "mitigation_status",
    "current_risk_level",
    "deadline",
    "mitigation_plan",
    "implementation_strategy",
    "mitigation_evidence_document",
    "likelihood_mitigation",
    "risk_severity",
    "final_risk_level",
    "risk_approval",
    "approval_status",
    "date_of_assessment",
    // Quantitative (FAIR) fields
    "event_frequency_min",
    "event_frequency_likely",
    "event_frequency_max",
    "loss_regulatory_min",
    "loss_regulatory_likely",
    "loss_regulatory_max",
    "loss_operational_min",
    "loss_operational_likely",
    "loss_operational_max",
    "loss_litigation_min",
    "loss_litigation_likely",
    "loss_litigation_max",
    "loss_reputational_min",
    "loss_reputational_likely",
    "loss_reputational_max",
    "total_loss_likely",
    "ale_estimate",
    "control_effectiveness",
    "residual_ale",
    "mitigation_cost_annual",
    "roi_percentage",
    "benchmark_id",
    "currency",
  ]
    .filter((f) => {
      const value = projectRisk[f as keyof RiskModel];
      // For quantitative FAIR fields, allow null and 0 as valid update values
      const isQuantitativeField = [
        "event_frequency_min", "event_frequency_likely", "event_frequency_max",
        "loss_regulatory_min", "loss_regulatory_likely", "loss_regulatory_max",
        "loss_operational_min", "loss_operational_likely", "loss_operational_max",
        "loss_litigation_min", "loss_litigation_likely", "loss_litigation_max",
        "loss_reputational_min", "loss_reputational_likely", "loss_reputational_max",
        "total_loss_likely", "ale_estimate", "control_effectiveness", "residual_ale",
        "mitigation_cost_annual", "roi_percentage", "benchmark_id", "currency",
      ].includes(f);
      const hasValue = isQuantitativeField
        ? value !== undefined
        : value !== undefined && value;
      if (hasValue) {
        if (f === "risk_category") {
          // Format array for PostgreSQL
          const arr = value as string[];
          updateProjectRisk[f as keyof RiskModel] = `{${(arr || []).join(',')}}` as any;
        } else {
          updateProjectRisk[f as keyof RiskModel] = value;
        }
        return true;
      }
      return false;
    })
    .map((f) => {
      if (f === "risk_category") {
        return `${f} = :${f}::enum_projectrisks_risk_category[]`;
      }
      return `${f} = :${f}`;
    });

  let query = `UPDATE risks SET ${setClause.join(", ")} WHERE id = :id AND organization_id = :organizationId RETURNING *;`;
  if (setClause.length === 0) {
    query = `SELECT * FROM risks WHERE id = :id AND organization_id = :organizationId;`;
  }
  updateProjectRisk.organizationId = organizationId;

  updateProjectRisk.id = id;

  const result = await sequelize.query(query, {
    replacements: updateProjectRisk,
    mapToModel: true,
    model: RiskModel,
    // type: QueryTypes.UPDATE,
    transaction,
  });

  // Handle project links - delete if explicitly flagged as deleted or if new projects are provided
  if (
    (projectRisk.projects && projectRisk.projects.length > 0) ||
    projectRisk.deletedLinkedProject
  ) {
    // First, get the current projects linked to this risk to identify deleted ones
    const currentProjectsResult = (await sequelize.query(
      `SELECT project_id FROM projects_risks WHERE risk_id = :riskId AND organization_id = :organizationId`,
      {
        replacements: { riskId: id, organizationId },
        transaction,
      }
    )) as [{ project_id: number }[], number];

    const currentProjectIds = currentProjectsResult[0].map(
      (row) => row.project_id
    );
    const newProjectIds = projectRisk.projects || [];

    // Find projects that are being removed
    const deletedProjectIds = currentProjectIds.filter(
      (projectId) => !newProjectIds.includes(projectId)
    );

    // Clean up mitigation mappings for deleted projects
    if (deletedProjectIds.length > 0) {
      const projectFrameworks = (await sequelize.query(
        `SELECT * FROM projects_frameworks WHERE project_id IN (:deletedProjectIds) AND organization_id = :organizationId`,
        {
          replacements: { deletedProjectIds, organizationId },
          transaction,
        }
      )) as [(IProjectFrameworks & { id: number })[], number];

      for (let pf of projectFrameworks[0]) {
        if (pf.framework_id === 1) {
          await sequelize.query(
            `DELETE FROM answers_eu__risks WHERE organization_id = :organizationId AND answer_id IN (
              SELECT ae.id FROM answers_eu ae JOIN assessments a ON ae.assessment_id = a.id AND ae.organization_id = :organizationId AND a.organization_id = :organizationId WHERE a.projects_frameworks_id = :pfId
            ) AND projects_risks_id = :riskId`,
            { replacements: { pfId: pf.id, riskId: id, organizationId }, transaction }
          );

          await sequelize.query(
            `DELETE FROM controls_eu__risks WHERE organization_id = :organizationId AND control_id IN (
              SELECT sc.id FROM controls_eu c JOIN subcontrols_eu sc ON c.id = sc.control_id AND c.organization_id = :organizationId AND sc.organization_id = :organizationId WHERE c.projects_frameworks_id = :pfId
            ) AND projects_risks_id = :riskId`,
            { replacements: { pfId: pf.id, riskId: id, organizationId }, transaction }
          );
        }
      }
    }

    // Delete all project-risk links
    await sequelize.query(
      `DELETE FROM projects_risks WHERE risk_id = :riskId AND organization_id = :organizationId`,
      {
        replacements: { riskId: id, organizationId },
        transaction,
      }
    );
    // Only create new links if projects array is provided and not empty
    if (projectRisk.projects && projectRisk.projects.length > 0) {
      await createProjectRiskLink(
        projectRisk.projects,
        id,
        organizationId,
        transaction
      );
    }
  }

  // Handle framework links - delete if explicitly flagged as deleted or if new frameworks are provided
  if (
    (projectRisk.frameworks && projectRisk.frameworks.length > 0) ||
    projectRisk.deletedLinkedFrameworks
  ) {
    // First, get the current frameworks linked to this risk to identify deleted ones
    const currentFrameworksResult = (await sequelize.query(
      `SELECT framework_id FROM frameworks_risks WHERE risk_id = :riskId AND organization_id = :organizationId`,
      {
        replacements: { riskId: id, organizationId },
        transaction,
      }
    )) as [{ framework_id: number }[], number];

    const currentFrameworkIds = currentFrameworksResult[0].map(
      (row) => row.framework_id
    );
    const newFrameworkIds = projectRisk.frameworks || [];

    // Find frameworks that are being removed
    const deletedFrameworkIds = currentFrameworkIds.filter(
      (frameworkId) => !newFrameworkIds.includes(frameworkId)
    );

    // Clean up mitigation mappings for deleted frameworks (if framework-specific cleanup is needed)
    if (deletedFrameworkIds.length > 0) {
      const projectFrameworks = (await sequelize.query(
        `SELECT * FROM projects_frameworks WHERE framework_id IN (:deletedFrameworkIds) AND organization_id = :organizationId`,
        {
          replacements: { deletedFrameworkIds, organizationId },
          transaction,
        }
      )) as [(IProjectFrameworks & { id: number })[], number];
      for (let pf of projectFrameworks[0]) {
        if (pf.framework_id === 2) {
          await sequelize.query(
            `DELETE FROM subclauses_iso__risks WHERE organization_id = :organizationId AND subclause_id IN (
              SELECT sc.id FROM subclauses_iso sc WHERE sc.projects_frameworks_id = :pfId AND sc.organization_id = :organizationId
            ) AND projects_risks_id = :riskId`,
            { replacements: { pfId: pf.id, riskId: id, organizationId }, transaction }
          );

          await sequelize.query(
            `DELETE FROM annexcategories_iso__risks WHERE organization_id = :organizationId AND annexcategory_id IN (
              SELECT ac.id FROM annexcategories_iso ac WHERE ac.projects_frameworks_id = :pfId AND ac.organization_id = :organizationId
            ) AND projects_risks_id = :riskId`,
            { replacements: { pfId: pf.id, riskId: id, organizationId }, transaction }
          );
        }

        if (pf.framework_id === 3) {
          await sequelize.query(
            `DELETE FROM subclauses_iso27001__risks WHERE organization_id = :organizationId AND subclause_id IN (
              SELECT sc.id FROM subclauses_iso27001 sc WHERE sc.projects_frameworks_id = :pfId AND sc.organization_id = :organizationId
            ) AND projects_risks_id = :riskId`,
            { replacements: { pfId: pf.id, riskId: id, organizationId }, transaction }
          );

          await sequelize.query(
            `DELETE FROM annexcontrols_iso27001__risks WHERE organization_id = :organizationId AND annexcontrol_id IN (
              SELECT ac.id FROM annexcontrols_iso27001 ac WHERE ac.projects_frameworks_id = :pfId AND ac.organization_id = :organizationId
            ) AND projects_risks_id = :riskId`,
            { replacements: { pfId: pf.id, riskId: id, organizationId }, transaction }
          );
        }
      }
    }

    // Delete all framework-risk links
    await sequelize.query(
      `DELETE FROM frameworks_risks WHERE risk_id = :riskId AND organization_id = :organizationId`,
      {
        replacements: { riskId: id, organizationId },
        transaction,
      }
    );
    // Only create new links if frameworks array is provided and not empty
    if (projectRisk.frameworks && projectRisk.frameworks.length > 0) {
      await createFrameworkRiskLink(
        projectRisk.frameworks,
        id,
        organizationId,
        transaction
      );
    }
  }
  const updatedRisk = result[0];
  const automations = (await sequelize.query(
    `SELECT
      pat.key AS trigger_key,
      paa.key AS action_key,
      a.id AS automation_id,
      aa.*
    FROM automation_triggers pat JOIN automations a ON a.trigger_id = pat.id AND a.organization_id = :organizationId JOIN automation_actions_data aa ON a.id = aa.automation_id AND aa.organization_id = :organizationId JOIN automation_actions paa ON aa.action_type_id = paa.id WHERE pat.key = 'risk_updated' AND a.is_active ORDER BY aa."order" ASC;`,
    { replacements: { organizationId }, transaction }
  )) as [
    (TenantAutomationActionModel & {
      trigger_key: string;
      action_key: string;
      automation_id: number;
    })[],
    number,
  ];
  if (automations[0].length > 0) {
    const automation = automations[0][0];
    if (automation["trigger_key"] === "risk_updated") {
      let ownerFullName = "";

        if (updatedRisk.dataValues.risk_owner) {
          const ownerResult = await sequelize.query(
            `SELECT name || ' ' || surname AS full_name 
            FROM users 
            WHERE id = :owner_id;`,
            {
              replacements: { owner_id: updatedRisk.dataValues.risk_owner },
              transaction
            }
          ) as [{ full_name: string }[], any];

          ownerFullName = ownerResult?.[0]?.[0]?.full_name ?? "";
        }

        let approverFullName = "";
        if (updatedRisk.dataValues.risk_approval) {
          const approver_name = await sequelize.query(
            `SELECT name || ' ' || surname AS full_name FROM users WHERE id = :approver_id;`,
            {
              replacements: { approver_id: updatedRisk.dataValues.risk_approval }, transaction
            }
          ) as [{ full_name: string }[], number];
          approverFullName = approver_name?.[0]?.[0]?.full_name ?? "";
        }

      const params = automation.params!;

      // Build replacements
      const replacements = buildRiskUpdateReplacements(existingRisk, {
        ...updatedRisk.dataValues,
        owner_name: ownerFullName,
        approver_name: approverFullName
      });

      // Replace variables in subject and body
      const processedParams = {
        ...params,
        subject: replaceTemplateVariables(params.subject || "", replacements),
        body: replaceTemplateVariables(params.body || "", replacements),
        automation_id: automation.automation_id,
      };

      // Enqueue with processed params
      await enqueueAutomationAction(automation.action_key, {
        ...processedParams,
        organizationId,
      });
    } else {
      console.warn(
        `No matching trigger found for key: ${automation["trigger_key"]}`
      );
    }
  }

  // Record history snapshots if tracked parameters changed
  try {
    const parametersToCheck = [
      { key: "severity", param: "severity" },
      { key: "likelihood", param: "likelihood" },
      { key: "mitigation_status", param: "mitigation_status" },
      { key: "risk_level", param: "risk_level_autocalculated" },
    ];

    const snapshotPromises = [];
    for (const { key, param } of parametersToCheck) {
      // Cast to any to avoid TypeScript complaining about indexing RiskModel with IRisk keys
      if (
        existingRisk &&
        (existingRisk as any)[param] !== (updatedRisk.dataValues as any)[param]
      ) {
        snapshotPromises.push(
          recordSnapshotIfChanged(key, organizationId, undefined, transaction)
        );
      }
    }

    if (snapshotPromises.length > 0) {
      await Promise.all(snapshotPromises);
    }
  } catch (historyError) {
    console.error("Error recording risk history snapshots:", historyError);
    // Don't throw - history recording failure shouldn't block risk update
  }

  return updatedRisk;
};

export const deleteRiskByIdQuery = async (
  id: number,
  organizationId: number,
  transaction: Transaction
): Promise<Boolean> => {
  const result = (await sequelize.query(
    `UPDATE risks SET is_deleted = true, deleted_at = NOW(), updated_at = NOW() WHERE id = :id AND organization_id = :organizationId AND is_deleted = false RETURNING *`,
    {
      replacements: { id, organizationId },
      mapToModel: true,
      // model: RiskModel,
      // type: QueryTypes.UPDATE,
      transaction,
    }
  )) as [RiskModel[], number];
  const deletedRisk = result[0][0];
  const automations = (await sequelize.query(
    `SELECT
      pat.key AS trigger_key,
      paa.key AS action_key,
      a.id AS automation_id,
      aa.*
    FROM automation_triggers pat JOIN automations a ON a.trigger_id = pat.id AND a.organization_id = :organizationId JOIN automation_actions_data aa ON a.id = aa.automation_id AND aa.organization_id = :organizationId JOIN automation_actions paa ON aa.action_type_id = paa.id WHERE pat.key = 'risk_deleted' AND a.is_active ORDER BY aa."order" ASC;`,
    { replacements: { organizationId }, transaction }
  )) as [
    (TenantAutomationActionModel & {
      trigger_key: string;
      action_key: string;
      automation_id: number;
    })[],
    number,
  ];
  if (automations[0].length > 0) {
    const automation = automations[0][0];
    if (automation["trigger_key"] === "risk_deleted") {
      const owner_name = (await sequelize.query(
        `SELECT name || ' ' || surname AS full_name FROM users WHERE id = :owner_id;`,
        {
          replacements: { owner_id: deletedRisk.risk_owner },
          transaction,
        }
      )) as [{ full_name: string }[], number];
      const approver_name = (await sequelize.query(
        `SELECT name || ' ' || surname AS full_name FROM users WHERE id = :approver_id;`,
        {
          replacements: { approver_id: deletedRisk.risk_approval },
          transaction,
        }
      )) as [{ full_name: string }[], number];

      const params = automation.params!;

      // Build replacements
      const replacements = buildRiskReplacements({
        ...deletedRisk,
        owner_name: owner_name?.[0]?.[0]?.full_name ?? "",
        approver_name: approver_name?.[0]?.[0]?.full_name ?? "",
      });

      // Replace variables in subject and body
      const processedParams = {
        ...params,
        subject: replaceTemplateVariables(params.subject || "", replacements),
        body: replaceTemplateVariables(params.body || "", replacements),
        automation_id: automation.automation_id,
      };

      // Enqueue with processed params
      await enqueueAutomationAction(automation.action_key, {
        ...processedParams,
        organizationId,
      });
    } else {
      console.warn(
        `No matching trigger found for key: ${automation["trigger_key"]}`
      );
    }
  }

  // Record history snapshots for all tracked parameters after deletion
  try {
    await Promise.all([
      recordSnapshotIfChanged("severity", organizationId, undefined, transaction),
      recordSnapshotIfChanged("likelihood", organizationId, undefined, transaction),
      recordSnapshotIfChanged(
        "mitigation_status",
        organizationId,
        undefined,
        transaction
      ),
      recordSnapshotIfChanged("risk_level", organizationId, undefined, transaction),
    ]);
  } catch (historyError) {
    console.error("Error recording risk history snapshots:", historyError);
    // Don't throw - history recording failure shouldn't block risk deletion
  }

  return result[0].length > 0;
};
