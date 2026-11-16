import { RISK_APPROVAL_NOT_REQUIRED } from "../domain.layer/enums/risk-approval-status.enum";
import { RiskModel } from "../domain.layer/models/risks/risk.model";
import { getEffectiveRiskLevel } from "./riskLevel.utils";
import { sequelize } from "../database/db";
import { Transaction, QueryTypes } from "sequelize";
import { IRisk } from "../domain.layer/interfaces/I.risk";
import {
  enqueueAutomationActions,
  getEventAutomationActionsQuery,
  IAutomationActionRow,
} from "./automation/automationActions.utils";
import {
  BulkRiskChange,
  buildBulkRiskReplacements,
  buildRiskReplacements,
  buildRiskUpdateReplacements,
} from "./automation/risk.automation.utils";
import { recordSnapshotIfChanged } from "./history/riskHistory.utils";
import { fetchCustomFieldsForEntities } from "./customField.utils";
import { findUsersNotInOrganization, parseReferencedIds } from "./user.utils";
import {
  NotFoundException,
  ValidationException,
} from "../domain.layer/exceptions/custom.exception";
import { toRiskCalendarDate } from "./riskCalendarDate.utils";
import { storedRiskCategories } from "./riskCategory.utils";
import { recordProjectRiskDeletion } from "./projectRiskChangeHistory.utils";
import { getStructureById } from "../structures";
import { unlinkRiskFromAllPoliciesQuery } from "./policyLinkedObject.utils";
import {
  accessibleProjectIdSql,
  getAccessibleProjectIdsQuery,
  isRiskVisibleQuery,
  projectRiskVisibilitySql,
  riskVisibilitySql,
  RiskViewer,
  scopedRiskViewer,
  SYSTEM_RISK_VIEWER,
} from "./riskVisibility.utils";

type RiskAutomationTrigger = "risk_added" | "risk_updated" | "risk_deleted";

/**
 * Every active action of the organization's automations for a risk trigger,
 * by automation, then action order (R-L6). Automations from before that
 * change run only the event's first action until saved again
 * (keepLegacyFirstActionOnly).
 */
const findRiskAutomationActions = (
  triggerKey: RiskAutomationTrigger,
  organizationId: number,
  transaction?: Transaction,
): Promise<IAutomationActionRow[]> =>
  getEventAutomationActionsQuery(organizationId, triggerKey, transaction);

/**
 * Full names ("name surname") of the given users, keyed by id, in one query.
 * Empty ids are skipped; a user not found is simply absent from the map.
 */
export const getUserFullNamesQuery = async (
  ids: Array<number | null | undefined>,
  transaction?: Transaction,
): Promise<Map<number, string>> => {
  const userIds = [...new Set(ids.filter((id) => Boolean(id)).map(Number))];
  if (userIds.length === 0) return new Map();
  const rows = await sequelize.query<{ id: number; full_name: string }>(
    `SELECT id, name || ' ' || surname AS full_name FROM users WHERE id IN (:userIds);`,
    { replacements: { userIds }, type: QueryTypes.SELECT, transaction },
  );
  return new Map(rows.map((row) => [Number(row.id), row.full_name]));
};

/** The risk with owner_name and approver_name for automations; "" when unknown. */
const withUserNames = (risk: any, names: Map<number, string>) => ({
  ...risk,
  owner_name: (risk.risk_owner && names.get(Number(risk.risk_owner))) || "",
  approver_name: (risk.risk_approval && names.get(Number(risk.risk_approval))) || "",
});

type Mitigation = {
  id: number;
  meta_id: number;
  parent_id: number;
  sup_id: string;
  title: string;
  sub_id: number;
  project_id: number;
};

export const validateRiskFrameworksQuery = async (frameworks: number[]): Promise<boolean> => {
  const result = (await sequelize.query(
    `SELECT id FROM frameworks WHERE is_organizational = true;`,
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
  organizationId: number,
): Promise<boolean> => {
  const result = (await sequelize.query(
    `SELECT id FROM projects WHERE organization_id = :organizationId AND is_organizational = false;`,
    { replacements: { organizationId } },
  )) as [{ id: number }[], number];
  const nonOrgProjects = result[0].map((p) => p.id);
  for (let p of projects) {
    if (!nonOrgProjects.includes(p)) {
      return false;
    }
  }
  return true;
};

/**
 * Tenant guard for the ids a risk points at. Owner and approver must be
 * members of the organization, linked use cases must belong to it, and
 * framework ids must exist (frameworks are a global catalog).
 *
 * Every risk write path (REST, MCP, advisor, intake, AI detection, demo seed)
 * goes through createRiskQuery / updateRiskByIdQuery, which call this.
 *
 * @throws ValidationException naming the first offending field.
 */
export const assertRiskReferencesInOrganization = async (
  refs: {
    risk_owner?: number | null;
    risk_approval?: number | null;
    projects?: number[];
    frameworks?: number[];
  },
  organizationId: number,
  transaction?: Transaction,
  options: {
    /** The acting user. A non-Admin may only link use cases they can write to. */
    viewer?: RiskViewer;
    /** Use cases already linked: not re-checked against the viewer. */
    alreadyLinked?: number[];
    /**
     * The use cases the viewer can access, when the caller has already read
     * them (getAccessibleProjectIdsQuery over at least every id in `projects`).
     * Saves the query.
     */
    accessibleProjectIds?: number[];
  } = {},
): Promise<void> => {
  const isOutside = async (id: number | null | undefined): Promise<boolean> => {
    const ids = parseReferencedIds([id]);
    if (ids === null) return true;
    if (ids.length === 0) return false;
    const outside = await findUsersNotInOrganization(ids, organizationId, transaction ?? null);
    return outside.length > 0;
  };
  if (await isOutside(refs.risk_owner)) {
    throw new ValidationException(
      "The risk owner must be a member of this organization",
      "risk_owner",
      refs.risk_owner,
    );
  }
  if (await isOutside(refs.risk_approval)) {
    throw new ValidationException(
      "The risk approver must be a member of this organization",
      "risk_approval",
      refs.risk_approval,
    );
  }

  const projectIds = parseReferencedIds(refs.projects ?? []);
  const projectRows =
    projectIds && projectIds.length > 0
      ? ((await sequelize.query(
          `SELECT id FROM projects WHERE organization_id = :organizationId AND id IN (:ids)`,
          {
            replacements: { organizationId, ids: projectIds },
            type: QueryTypes.SELECT,
            transaction,
          },
        )) as { id: number }[])
      : [];
  if (projectIds === null || projectRows.length !== projectIds.length) {
    throw new ValidationException(
      "Linked use cases must belong to this organization",
      "projects",
      refs.projects,
    );
  }

  // A use case the viewer cannot see is answered like one outside the
  // organization: no new status or message. Only newly linked ones count.
  if (options.viewer && scopedRiskViewer(options.viewer) && projectIds) {
    const already = new Set((options.alreadyLinked ?? []).map(Number));
    const toCheck = [...new Set(projectIds)].filter((id) => !already.has(id));
    const known = options.accessibleProjectIds;
    const accessible = known
      ? toCheck.filter((id) => known.includes(id))
      : await getAccessibleProjectIdsQuery(toCheck, organizationId, options.viewer, transaction);
    if (accessible.length !== toCheck.length) {
      throw new ValidationException(
        "Linked use cases must belong to this organization",
        "projects",
        refs.projects,
      );
    }
  }

  const frameworkIds = parseReferencedIds(refs.frameworks ?? []);
  const frameworkRows =
    frameworkIds && frameworkIds.length > 0
      ? ((await sequelize.query(`SELECT id FROM frameworks WHERE id IN (:ids)`, {
          replacements: { ids: frameworkIds },
          type: QueryTypes.SELECT,
          transaction,
        })) as { id: number }[])
      : [];
  if (frameworkIds === null || frameworkRows.length !== frameworkIds.length) {
    throw new ValidationException(
      "One or more linked frameworks do not exist",
      "frameworks",
      refs.frameworks,
    );
  }
};

export const getAllRisksQuery = async (
  organizationId: number,
  filter: "active" | "deleted" | "all" = "active",
  viewer: RiskViewer,
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

  // A non-Admin viewer sees only the risks riskVisibilitySql lets through,
  // and each risk's projects only among the use cases they can access.
  const visibility = riskVisibilitySql("r", viewer);
  whereClause += visibility.sql;
  const projectAccess = accessibleProjectIdSql("pr.project_id", viewer);

  // OPTIMIZED: Fast query for list view - only fetches basic risk data with projects/frameworks
  // The full relationships (subClauses, annexCategories, controls, assessments, etc.)
  // are fetched separately via getRiskByIdQuery when viewing a single risk
  const query = `
    SELECT
      r.*,
      COALESCE(
        JSON_AGG(DISTINCT pr.project_id) FILTER (WHERE pr.project_id IS NOT NULL${projectAccess.sql}),
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

  const risks = (await sequelize.query(query, {
    replacements: { organizationId, ...visibility.replacements, ...projectAccess.replacements },
    type: QueryTypes.SELECT,
  })) as any[];

  // Parse JSON strings if needed
  for (let risk of risks) {
    if (typeof risk.projects === "string") {
      risk.projects = JSON.parse(risk.projects);
    }
    if (typeof risk.frameworks === "string") {
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

  const riskIds = risks
    .map((r: any) => r.id)
    .filter((id: any): id is number => typeof id === "number");
  const customFieldsByRisk = await fetchCustomFieldsForEntities(
    "project_risk",
    riskIds,
    organizationId,
  );
  for (let risk of risks) {
    risk.custom_fields = customFieldsByRisk.get(risk.id) ?? [];
  }

  return risks as IRisk[];
};

export const getRisksByProjectQuery = async (
  projectId: number,
  organizationId: number,
  filter: "active" | "deleted" | "all" = "active",
  viewer: RiskViewer,
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

  // A viewer who cannot see the use case gets only the risks they own or
  // approve there (projectRiskVisibilitySql). Each risk's projects list only
  // the use cases they can access.
  const visibility = projectRiskVisibilitySql("r", viewer);
  whereClause += visibility.sql;
  const projectAccess = accessibleProjectIdSql("p.id", viewer);

  const result = (await sequelize.query(
    `SELECT
      r.*,
      COALESCE(
        JSON_AGG(DISTINCT p.id) FILTER (WHERE p.id IS NOT NULL${projectAccess.sql}),
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
    {
      replacements: {
        projectId,
        organizationId,
        ...visibility.replacements,
        ...projectAccess.replacements,
      },
      type: QueryTypes.SELECT,
    },
  )) as IRisk[];
  return result;
};

export const getRisksByFrameworkQuery = async (
  frameworkId: number,
  organizationId: number,
  filter: "active" | "deleted" | "all" = "active",
  viewer: RiskViewer,
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

  const visibility = riskVisibilitySql("r", viewer);
  whereClause += visibility.sql;
  // Each risk's projects list only the use cases the viewer can access.
  const projectAccess = accessibleProjectIdSql("p.id", viewer);

  const result = (await sequelize.query(
    `SELECT
      r.*,
      COALESCE(
        JSON_AGG(DISTINCT p.id) FILTER (WHERE p.id IS NOT NULL${projectAccess.sql}),
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
    {
      replacements: {
        frameworkId,
        organizationId,
        ...visibility.replacements,
        ...projectAccess.replacements,
      },
      type: QueryTypes.SELECT,
    },
  )) as IRisk[];
  return result;
};

/**
 * One risk with its links and mappings, or null when it is missing, archived
 * (unless includeDeleted) or hidden from the viewer (risk visibility rule):
 * a hidden risk is answered exactly like a missing one. For a non-Admin the
 * use case ids it carries are narrowed to the use cases they can access:
 * `projects`, and the mapping rows, each kept once under its own use case
 * and only when that use case is accessible.
 */
export const getRiskByIdQuery = async (
  id: number,
  organizationId: number,
  viewer: RiskViewer,
  includeDeleted: boolean = false,
): Promise<IRisk | null> => {
  const visibility = riskVisibilitySql("risks", viewer);
  const whereClause = includeDeleted
    ? "WHERE id = :id AND organization_id = :organizationId"
    : "WHERE id = :id AND organization_id = :organizationId AND is_deleted = false";
  const result = (await sequelize.query(`SELECT * FROM risks ${whereClause}${visibility.sql}`, {
    replacements: { id, organizationId, ...visibility.replacements },
  })) as [IRisk[], number];
  const projectRisk = result[0][0];
  if (!projectRisk) return null;
  // Every use case id below is narrowed to the ones the viewer can access.
  const projectAccess = accessibleProjectIdSql("projects_risks.project_id", viewer);
  const mappingAccess = accessibleProjectIdSql("pf.project_id", viewer);
  const mappingReplacements = {
    riskId: projectRisk.id,
    organizationId,
    ...mappingAccess.replacements,
  };
  // Each mapping query joins projects_frameworks on the framework alone, so a
  // mapping comes back once per use case using that framework. Admins and the
  // system viewer keep that output as it is. For anyone else the row is kept
  // only when pf is the mapping's own use case (the element row's
  // projects_frameworks_id, given as `realPf`) and that use case is accessible,
  // so a mapping on a hidden use case never shows under an accessible one.
  const scopedMappings = scopedRiskViewer(viewer) !== null;
  const mappingScope = (realPf: string): string =>
    scopedMappings ? ` AND pf.id = ${realPf}${mappingAccess.sql}` : "";

  let ownerFullName = "";

  // Run query ONLY if risk_owner exists
  if (projectRisk.risk_owner) {
    const ownerResult = (await sequelize.query(
      `SELECT name || ' ' || surname AS full_name
      FROM users
      WHERE id = :owner_id;`,
      {
        replacements: { owner_id: projectRisk.risk_owner },
      },
    )) as [{ full_name: string }[], number];

    ownerFullName = ownerResult?.[0]?.[0]?.full_name ?? "";
  }
  (projectRisk as any).owner_name = ownerFullName;

  let approverFullName = "";
  if (projectRisk.risk_approval) {
    const approver_name = (await sequelize.query(
      `SELECT name || ' ' || surname AS full_name FROM users WHERE id = :approver_id;`,
      {
        replacements: { approver_id: projectRisk.risk_approval },
      },
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
    `SELECT project_id FROM projects_risks WHERE risk_id = :riskId AND organization_id = :organizationId${projectAccess.sql}`,
    { replacements: { riskId: projectRisk.id, organizationId, ...projectAccess.replacements } },
  )) as [{ project_id: number }[], number];
  if (attachedProjects[0].length > 0) {
    (projectRisk as any).projects = attachedProjects[0].map((p) => p.project_id);
  }

  const attachedFrameworks = (await sequelize.query(
    `SELECT framework_id FROM frameworks_risks WHERE risk_id = :riskId AND organization_id = :organizationId`,
    { replacements: { riskId: projectRisk.id, organizationId } },
  )) as [{ framework_id: number }[], number];
  if (attachedFrameworks[0].length > 0) {
    (projectRisk as any).frameworks = attachedFrameworks[0].map((f) => f.framework_id);
  }

  const attachedSubClauses = (await sequelize.query(
    `SELECT
        scr.subclause_id AS id, sc.subclause_meta_id AS meta_id, csi.clause_no AS sup_id, scs.title, scs.order_no AS sub_id, csi.id AS parent_id, pf.project_id AS project_id
      FROM subclauses_iso__risks scr JOIN subclauses_iso sc ON scr.subclause_id = sc.id AND sc.organization_id = :organizationId
      JOIN subclauses_struct_iso scs ON scs.id = sc.subclause_meta_id
      JOIN clauses_struct_iso csi ON csi.id = scs.clause_id
      JOIN projects_frameworks pf ON pf.framework_id = csi.framework_id AND pf.organization_id = :organizationId
      WHERE scr.projects_risks_id = :riskId AND scr.organization_id = :organizationId${mappingScope("sc.projects_frameworks_id")}`,
    { replacements: mappingReplacements },
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
      WHERE acr.projects_risks_id = :riskId AND acr.organization_id = :organizationId${mappingScope("ac.projects_frameworks_id")}`,
    { replacements: mappingReplacements },
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
      WHERE cr.projects_risks_id = :riskId AND cr.organization_id = :organizationId${mappingScope("ac.projects_frameworks_id")}`,
    { replacements: mappingReplacements },
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
      WHERE aur.projects_risks_id = :riskId AND aur.organization_id = :organizationId${mappingScope(
        "(SELECT asm.projects_frameworks_id FROM assessments asm WHERE asm.id = ans.assessment_id AND asm.organization_id = :organizationId)",
      )}`,
    { replacements: mappingReplacements },
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
      WHERE acr.projects_risks_id = :riskId AND acr.organization_id = :organizationId${mappingScope("ac.projects_frameworks_id")}`,
    { replacements: mappingReplacements },
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
      WHERE scr.projects_risks_id = :riskId AND scr.organization_id = :organizationId${mappingScope("sc.projects_frameworks_id")}`,
    { replacements: mappingReplacements },
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
  transaction?: Transaction,
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
    `INSERT INTO projects_risks (project_id, risk_id, organization_id) VALUES ${placeholders}
     ON CONFLICT (risk_id, project_id) DO NOTHING`,
    {
      replacements,
      transaction,
    },
  );
};

/**
 * Links one live risk to one use case of the organization, through the same
 * junction writer createRiskQuery and updateRiskByIdQuery use. A link that
 * already exists is left as it is.
 *
 * @throws NotFoundException when the risk is missing, deleted or in another
 *   organization; ValidationException when the use case is not in it.
 */
export const linkRiskToProjectQuery = async (
  riskId: number,
  projectId: number,
  organizationId: number,
  transaction: Transaction | undefined,
  viewer: RiskViewer,
): Promise<void> => {
  const risks = await sequelize.query(
    `SELECT id FROM risks
      WHERE id = :riskId AND organization_id = :organizationId
        AND (is_deleted = false OR is_deleted IS NULL)`,
    { replacements: { riskId, organizationId }, type: QueryTypes.SELECT, transaction },
  );
  // A risk the viewer cannot see is a missing one.
  if (
    risks.length === 0 ||
    !(await isRiskVisibleQuery(riskId, organizationId, viewer, transaction))
  ) {
    throw new NotFoundException("Risk not found", "risk", riskId);
  }
  await assertRiskReferencesInOrganization({ projects: [projectId] }, organizationId, transaction, {
    viewer,
  });
  await createProjectRiskLink([projectId], riskId, organizationId, transaction);
};

const getLinkedProjectIdsQuery = async (
  riskId: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<number[]> => {
  const rows = await sequelize.query<{ project_id: number }>(
    `SELECT project_id FROM projects_risks WHERE risk_id = :riskId AND organization_id = :organizationId`,
    { replacements: { riskId, organizationId }, type: QueryTypes.SELECT, transaction },
  );
  return rows.map((r) => Number(r.project_id));
};

const createFrameworkRiskLink = async (
  frameworks: number[],
  riskId: number,
  organizationId: number,
  transaction: Transaction,
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
    },
  );
};

export const createRiskQuery = async (
  projectRisk: Partial<RiskModel & { projects: number[]; frameworks: number[] }>,
  organizationId: number,
  transaction: Transaction,
  { viewer }: { viewer: RiskViewer },
): Promise<RiskModel> => {
  await assertRiskReferencesInOrganization(projectRisk, organizationId, transaction, { viewer });

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
        risk_category: `{${(projectRisk.risk_category || []).join(",")}}`,
        impact: projectRisk.impact,
        assessment_mapping: projectRisk.assessment_mapping,
        controls_mapping: projectRisk.controls_mapping,
        likelihood: projectRisk.likelihood,
        severity: projectRisk.severity,
        risk_level_autocalculated: projectRisk.risk_level_autocalculated,
        review_notes: projectRisk.review_notes,
        mitigation_status: projectRisk.mitigation_status,
        current_risk_level: projectRisk.current_risk_level,
        deadline: toRiskCalendarDate(projectRisk.deadline ?? null),
        mitigation_plan: projectRisk.mitigation_plan,
        implementation_strategy: projectRisk.implementation_strategy,
        mitigation_evidence_document: projectRisk.mitigation_evidence_document,
        likelihood_mitigation: projectRisk.likelihood_mitigation,
        risk_severity: projectRisk.risk_severity,
        final_risk_level: projectRisk.final_risk_level,
        risk_approval: projectRisk.risk_approval,
        // An omitted value would bind NULL, which the column refuses; store
        // the column default instead.
        approval_status: projectRisk.approval_status ?? RISK_APPROVAL_NOT_REQUIRED,
        date_of_assessment: toRiskCalendarDate(projectRisk.date_of_assessment ?? null),
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
        currency: projectRisk.currency ?? "USD",
      },
      mapToModel: true,
      model: RiskModel,
      // type: QueryTypes.INSERT
      transaction,
    },
  );

  if (projectRisk.projects && projectRisk.projects.length > 0) {
    await createProjectRiskLink(projectRisk.projects, result[0].id!, organizationId, transaction);
  }

  if (projectRisk.frameworks && projectRisk.frameworks.length > 0) {
    await createFrameworkRiskLink(
      projectRisk.frameworks,
      result[0].id!,
      organizationId,
      transaction,
    );
  }
  const createdRisk = result[0];

  const actions = await findRiskAutomationActions("risk_added", organizationId, transaction);
  if (actions.length > 0) {
    const risk = createdRisk.dataValues;
    const names = await getUserFullNamesQuery([risk.risk_owner, risk.risk_approval], transaction);
    await enqueueAutomationActions(
      actions,
      buildRiskReplacements(withUserNames(risk, names)),
      organizationId,
      transaction,
    );
  }

  // Record history snapshots for all tracked parameters
  try {
    await Promise.all([
      recordSnapshotIfChanged("severity", organizationId, undefined, transaction),
      recordSnapshotIfChanged("likelihood", organizationId, undefined, transaction),
      recordSnapshotIfChanged("mitigation_status", organizationId, undefined, transaction),
      recordSnapshotIfChanged("risk_level", organizationId, undefined, transaction),
    ]);
  } catch (historyError) {
    console.error("Error recording risk history snapshots:", historyError);
    // Don't throw - history recording failure shouldn't block risk creation
  }

  return createdRisk;
};

/** Text columns of risks: "" is stored as sent. */
const RISK_TEXT_COLUMNS = new Set([
  "risk_description",
  "impact",
  "assessment_mapping",
  "controls_mapping",
  "review_notes",
  "mitigation_plan",
  "implementation_strategy",
  "mitigation_evidence_document",
  "final_risk_level",
  "approval_status",
]);
/** User columns of risks: 0 means no user. */
const RISK_USER_COLUMNS = new Set(["risk_owner", "risk_approval"]);

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
  transaction: Transaction,
  {
    recordSnapshots = true,
    runAutomations = true,
    viewer,
  }: { recordSnapshots?: boolean; runAutomations?: boolean; viewer: RiskViewer },
): Promise<RiskModel | null> => {
  const scopedViewer = scopedRiskViewer(viewer) ?? undefined;
  // A risk the viewer cannot see is answered like a missing one (null), before
  // anything is validated or written, so a validation error never tells a
  // hidden risk from a missing one. The UPDATE below repeats the rule.
  if (scopedViewer && !(await isRiskVisibleQuery(id, organizationId, scopedViewer, transaction))) {
    return null;
  }
  // Read as the system on purpose: it only feeds the change diff (owner and
  // approver checks, automation, snapshots), and the viewer's read would
  // narrow nothing the diff uses. getRiskByIdQuery runs outside the
  // transaction, so it is not the visibility check either.
  const existingRisk = await getRiskByIdQuery(id, organizationId, SYSTEM_RISK_VIEWER, true);
  // The use case links as they were, read once: the viewer check skips the
  // ones already linked, and the link edit below diffs against them.
  const editsProjectLinks =
    (projectRisk.projects && projectRisk.projects.length > 0) || projectRisk.deletedLinkedProject;
  const linkedBefore = editsProjectLinks
    ? await getLinkedProjectIdsQuery(id, organizationId, transaction)
    : [];
  // For a non-Admin, which of the current and requested use cases they can
  // access, read once: it checks the new links and finds the hidden links the
  // edit keeps (ruling J3).
  const accessibleProjectIds =
    scopedViewer && editsProjectLinks
      ? await getAccessibleProjectIdsQuery(
          [
            ...new Set([
              ...linkedBefore,
              ...(parseReferencedIds(projectRisk.projects ?? []) ?? []),
            ]),
          ],
          organizationId,
          scopedViewer,
          transaction,
        )
      : undefined;
  // Unchanged owner/approver are not re-checked, so a risk whose owner has
  // left the organization can still be edited.
  await assertRiskReferencesInOrganization(
    {
      risk_owner:
        Number(projectRisk.risk_owner) !== Number(existingRisk?.risk_owner)
          ? projectRisk.risk_owner
          : undefined,
      risk_approval:
        Number(projectRisk.risk_approval) !== Number(existingRisk?.risk_approval)
          ? projectRisk.risk_approval
          : undefined,
      projects: projectRisk.projects,
      frameworks: projectRisk.frameworks,
    },
    organizationId,
    transaction,
    { viewer: scopedViewer, alreadyLinked: linkedBefore, accessibleProjectIds },
  );
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
      // A key that is present is written, so a field can be cleared (R-M1).
      // risk_name is NOT NULL, so an empty name is skipped.
      const hasValue = value !== undefined && (f !== "risk_name" || Boolean(value));
      if (hasValue) {
        if (f === "risk_category") {
          // Format array for PostgreSQL
          const arr = value as string[];
          updateProjectRisk[f as keyof RiskModel] = `{${(arr || []).join(",")}}` as any;
        } else if (
          !RISK_TEXT_COLUMNS.has(f) &&
          (value === "" || (RISK_USER_COLUMNS.has(f) && Number(value) === 0))
        ) {
          // "" (and user id 0) on an enum, date or user column means none.
          updateProjectRisk[f as keyof RiskModel] = null;
        } else if (f === "deadline" || f === "date_of_assessment") {
          updateProjectRisk[f as keyof RiskModel] = toRiskCalendarDate(value);
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

  // A risk hidden from the viewer matches nothing, as deleteRiskByIdQuery.
  const visibility = riskVisibilitySql("risks", viewer);
  let query = `UPDATE risks SET ${setClause.join(", ")} WHERE id = :id AND organization_id = :organizationId${visibility.sql} RETURNING *;`;
  if (setClause.length === 0) {
    query = `SELECT * FROM risks WHERE id = :id AND organization_id = :organizationId${visibility.sql};`;
  }
  updateProjectRisk.organizationId = organizationId;

  updateProjectRisk.id = id;

  const result = await sequelize.query(query, {
    replacements: { ...updateProjectRisk, ...visibility.replacements },
    mapToModel: true,
    model: RiskModel,
    // type: QueryTypes.UPDATE,
    transaction,
  });
  // No row: missing or hidden. Nothing else is written.
  const updatedRisk = result[0];
  if (!updatedRisk) return null;

  // Handle project links - delete if explicitly flagged as deleted or if new projects are provided
  if (editsProjectLinks) {
    const currentProjectIds = linkedBefore;
    const newProjectIds = projectRisk.projects || [];

    // A non-Admin only replaces links among the use cases they can see. Links
    // to the others stay, so editing a risk cannot unlink a use case that is
    // hidden from the editor (ruling J3).
    const keptHiddenIds = accessibleProjectIds
      ? currentProjectIds.filter((pid) => !accessibleProjectIds.includes(Number(pid)))
      : [];

    // Find projects that are being removed
    const deletedProjectIds = currentProjectIds.filter(
      (projectId) => !newProjectIds.includes(projectId) && !keptHiddenIds.includes(projectId),
    );

    // Clean up every framework's mappings for the removed projects (R-L7)
    if (deletedProjectIds.length > 0) {
      await deleteRiskMappingsForProjectsQuery(id, deletedProjectIds, organizationId, transaction);
    }

    // Delete the project-risk links (all of them, except the hidden ones a
    // non-Admin keeps)
    await sequelize.query(
      `DELETE FROM projects_risks WHERE risk_id = :riskId AND organization_id = :organizationId${
        keptHiddenIds.length > 0 ? " AND project_id NOT IN (:keptHiddenIds)" : ""
      }`,
      {
        replacements: { riskId: id, organizationId, keptHiddenIds },
        transaction,
      },
    );
    // Only create new links if projects array is provided and not empty
    if (projectRisk.projects && projectRisk.projects.length > 0) {
      await createProjectRiskLink(projectRisk.projects, id, organizationId, transaction);
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
      },
    )) as [{ framework_id: number }[], number];

    const currentFrameworkIds = currentFrameworksResult[0].map((row) => row.framework_id);
    const newFrameworkIds = projectRisk.frameworks || [];

    // Find frameworks that are being removed
    const deletedFrameworkIds = currentFrameworkIds.filter(
      (frameworkId) => !newFrameworkIds.includes(frameworkId),
    );

    // Clean up the removed frameworks' mappings, whatever the framework (R-L7)
    if (deletedFrameworkIds.length > 0) {
      const projectFrameworks = (await sequelize.query(
        `SELECT id FROM projects_frameworks WHERE framework_id IN (:deletedFrameworkIds) AND organization_id = :organizationId`,
        {
          replacements: { deletedFrameworkIds, organizationId },
          transaction,
        },
      )) as [{ id: number }[], number];
      await deleteRiskMappingsForProjectFrameworksQuery(
        id,
        projectFrameworks[0].map((pf) => pf.id),
        organizationId,
        transaction,
      );
    }

    // Delete all framework-risk links
    await sequelize.query(
      `DELETE FROM frameworks_risks WHERE risk_id = :riskId AND organization_id = :organizationId`,
      {
        replacements: { riskId: id, organizationId },
        transaction,
      },
    );
    // Only create new links if frameworks array is provided and not empty
    if (projectRisk.frameworks && projectRisk.frameworks.length > 0) {
      await createFrameworkRiskLink(projectRisk.frameworks, id, organizationId, transaction);
    }
  }
  // A bulk action passes runAutomations: false and runs the automations once
  // for the whole batch (enqueueBulkRiskAutomation).
  const actions = runAutomations
    ? await findRiskAutomationActions("risk_updated", organizationId, transaction)
    : [];
  if (actions.length > 0) {
    const risk = updatedRisk.dataValues;
    const names = await getUserFullNamesQuery([risk.risk_owner, risk.risk_approval], transaction);
    await enqueueAutomationActions(
      actions,
      buildRiskUpdateReplacements(existingRisk, withUserNames(risk, names)),
      organizationId,
      transaction,
    );
  }

  // Record history snapshots if tracked parameters changed. A bulk edit
  // skips this and records them once after its loop.
  if (!recordSnapshots) return updatedRisk;
  try {
    const parametersToCheck = [
      { key: "severity", param: "severity" },
      { key: "likelihood", param: "likelihood" },
      { key: "mitigation_status", param: "mitigation_status" },
    ];

    const snapshotPromises = [];
    // Snapshots are keyed by the effective level, so a change to either the
    // inherent or the current level can move the counts.
    const effective = (r: any) => (r ? getEffectiveRiskLevel(r) : null);
    if (existingRisk && effective(existingRisk) !== effective(updatedRisk.dataValues)) {
      snapshotPromises.push(
        recordSnapshotIfChanged("risk_level", organizationId, undefined, transaction),
      );
    }
    for (const { key, param } of parametersToCheck) {
      // Cast to any to avoid TypeScript complaining about indexing RiskModel with IRisk keys
      if (existingRisk && (existingRisk as any)[param] !== (updatedRisk.dataValues as any)[param]) {
        snapshotPromises.push(recordSnapshotIfChanged(key, organizationId, undefined, transaction));
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

/**
 * Soft-delete one risk. Returns the archived row (as it was written), or null
 * when no active risk matched.
 */
export const deleteRiskByIdQuery = async (
  id: number,
  organizationId: number,
  transaction: Transaction,
  {
    viewer,
    recordSnapshots = true,
    runAutomations = true,
  }: { viewer: RiskViewer; recordSnapshots?: boolean; runAutomations?: boolean },
): Promise<RiskModel | null> => {
  // Soft delete. Custom field values stay with the archived risk, and nothing
  // else runs when no active risk matched (R-M7). A risk hidden from the
  // viewer does not match, so it is answered like a missing one.
  const visibility = riskVisibilitySql("risks", viewer);
  const result = (await sequelize.query(
    `UPDATE risks SET is_deleted = true, deleted_at = NOW(), updated_at = NOW() WHERE id = :id AND organization_id = :organizationId AND is_deleted = false${visibility.sql} RETURNING *`,
    {
      replacements: { id, organizationId, ...visibility.replacements },
      mapToModel: true,
      // model: RiskModel,
      // type: QueryTypes.UPDATE,
      transaction,
    },
  )) as [RiskModel[], number];
  const deletedRisk = result[0][0];
  if (!deletedRisk) return null;
  // A bulk action passes runAutomations: false and runs the automations once
  // for the whole batch (enqueueBulkRiskAutomation).
  const actions = runAutomations
    ? await findRiskAutomationActions("risk_deleted", organizationId, transaction)
    : [];
  if (actions.length > 0) {
    const names = await getUserFullNamesQuery(
      [deletedRisk.risk_owner, deletedRisk.risk_approval],
      transaction,
    );
    await enqueueAutomationActions(
      actions,
      buildRiskReplacements(withUserNames(deletedRisk, names)),
      organizationId,
      transaction,
    );
  }

  // Record history snapshots for all tracked parameters after deletion. A
  // bulk archive skips this and records them once after its loop.
  if (recordSnapshots) {
    await recordRiskSnapshots(organizationId, transaction);
  }

  return deletedRisk;
};

/**
 * The active (not archived) risks of the organization among `ids`. Archived
 * ids are left out, so a bulk edit leaves them alone.
 */
export const getActiveRisksByIdsQuery = async (
  ids: number[],
  organizationId: number,
  transaction?: Transaction,
): Promise<IRisk[]> => {
  if (ids.length === 0) return [];
  return sequelize.query<IRisk>(
    `SELECT * FROM risks WHERE organization_id = :organizationId AND id IN (:ids) AND is_deleted = false`,
    { replacements: { organizationId, ids }, type: QueryTypes.SELECT, transaction },
  );
};

/** Same risk categories, ignoring order and duplicates. */
export const sameRiskCategories = (stored: unknown, next: string[]): boolean => {
  const a = new Set(storedRiskCategories(stored));
  const b = new Set(next);
  return a.size === b.size && [...a].every((c) => b.has(c));
};

/**
 * One project (use case) title per risk, for notifications: the title of the
 * lowest-id project each risk is linked to. Risks with no project are absent.
 */
export const getProjectTitlesByRiskIdsQuery = async (
  riskIds: number[],
  organizationId: number,
): Promise<Map<number, string>> => {
  if (riskIds.length === 0) return new Map();
  const rows = await sequelize.query<{ risk_id: number; project_title: string }>(
    `SELECT DISTINCT ON (prl.risk_id) prl.risk_id, p.project_title
       FROM projects_risks prl
       JOIN projects p ON p.id = prl.project_id AND p.organization_id = :organizationId
      WHERE prl.risk_id IN (:riskIds) AND prl.organization_id = :organizationId
      ORDER BY prl.risk_id, p.id ASC`,
    { replacements: { riskIds, organizationId }, type: QueryTypes.SELECT },
  );
  return new Map(rows.map((r) => [Number(r.risk_id), r.project_title]));
};

/**
 * The stored approver and approval status of a risk, read with a row lock
 * inside `transaction`, so two saves that both change the approval resolve
 * one after the other instead of against the same stale read. Null when the
 * risk is not in this organization.
 */
export const lockRiskApprovalQuery = async (
  riskId: number,
  organizationId: number,
  transaction: Transaction,
): Promise<{ risk_approval: number | null; approval_status: string | null } | null> => {
  const rows = await sequelize.query<{
    risk_approval: number | null;
    approval_status: string | null;
  }>(
    `SELECT risk_approval, approval_status FROM risks
      WHERE id = :riskId AND organization_id = :organizationId
      FOR UPDATE`,
    { replacements: { riskId, organizationId }, type: QueryTypes.SELECT, transaction },
  );
  return rows[0] ?? null;
};

/**
 * Record the four risk history snapshots. A bulk archive or edit records them
 * once after its loop. Failures are logged, never thrown: history must not
 * block the change.
 */
export const recordRiskSnapshots = async (
  organizationId: number,
  transaction: Transaction,
): Promise<void> => {
  try {
    await Promise.all([
      recordSnapshotIfChanged("severity", organizationId, undefined, transaction),
      recordSnapshotIfChanged("likelihood", organizationId, undefined, transaction),
      recordSnapshotIfChanged("mitigation_status", organizationId, undefined, transaction),
      recordSnapshotIfChanged("risk_level", organizationId, undefined, transaction),
    ]);
  } catch (historyError) {
    console.error("Error recording risk history snapshots:", historyError);
  }
};

/**
 * Run the risk automations once for a whole bulk action: `risk_deleted` for an
 * archive, `risk_updated` for a set owner/category. The per-risk paths run
 * with runAutomations: false, so each action sends once per bulk action, not
 * once per risk. Runs every action the single path would and enqueues after
 * commit. Owner and approver names come from one query for the batch.
 */
export const enqueueBulkRiskAutomation = async (
  trigger: "risk_deleted" | "risk_updated",
  changes: BulkRiskChange[],
  organizationId: number,
  transaction: Transaction,
): Promise<void> => {
  if (changes.length === 0) return;
  const actions = await findRiskAutomationActions(trigger, organizationId, transaction);
  if (actions.length === 0) return;

  const names = await getUserFullNamesQuery(
    changes.flatMap(({ before, after }) => [
      before.risk_owner,
      before.risk_approval,
      after.risk_owner,
      after.risk_approval,
    ]),
    transaction,
  );
  const withNames = (risk: any) => withUserNames(risk, names);
  await enqueueAutomationActions(
    actions,
    buildBulkRiskReplacements(
      trigger,
      changes.map(({ before, after }) => ({ before: withNames(before), after: withNames(after) })),
    ),
    organizationId,
    transaction,
  );
};

/**
 * Archive (soft-delete) one risk with every side effect of the single delete:
 * the risk_deleted automation, the change-history entry and the risk's policy
 * links. Shared by DELETE /projectRisks/:id and the bulk archive, which passes
 * recordSnapshots: false and runAutomations: false and records the snapshots
 * and runs the automation once for the whole batch.
 *
 * Returns the archived row (the bulk archive uses it for its automation
 * summary), or null, doing nothing else, when no active risk matched. A risk
 * the viewer cannot see does not match (risk visibility rule).
 */
export const archiveRiskQuery = async (
  id: number,
  organizationId: number,
  userId: number | undefined,
  transaction: Transaction,
  {
    viewer,
    recordSnapshots = true,
    runAutomations = true,
  }: { viewer: RiskViewer; recordSnapshots?: boolean; runAutomations?: boolean },
): Promise<RiskModel | null> => {
  const archived = await deleteRiskByIdQuery(id, organizationId, transaction, {
    viewer,
    recordSnapshots,
    runAutomations,
  });
  if (!archived) return null;

  if (userId) {
    await recordProjectRiskDeletion(id, userId, organizationId, transaction);
  }

  // An archived risk is no longer linked to any policy (R-M8).
  await unlinkRiskFromAllPoliciesQuery(id, organizationId, transaction);

  return archived;
};

/**
 * One mapping table family: the risk junction, its impl-id column, and the
 * subquery that selects the impl rows belonging to :pfIds. Every name here is
 * a literal or comes from the Servers/structures registry, never from input.
 */
type RiskMappingTable = { risksTable: string; implCol: string; implIdsSql: string };

const BUILT_IN_RISK_MAPPING_TABLES: Record<number, RiskMappingTable[]> = {
  // EU AI Act
  1: [
    {
      risksTable: "answers_eu__risks",
      implCol: "answer_id",
      implIdsSql: `SELECT ae.id FROM answers_eu ae JOIN assessments a ON ae.assessment_id = a.id AND ae.organization_id = :organizationId AND a.organization_id = :organizationId WHERE a.projects_frameworks_id IN (:pfIds)`,
    },
    {
      risksTable: "controls_eu__risks",
      implCol: "control_id",
      implIdsSql: `SELECT c.id FROM controls_eu c WHERE c.projects_frameworks_id IN (:pfIds) AND c.organization_id = :organizationId`,
    },
    {
      risksTable: "subcontrols_eu__risks",
      implCol: "subcontrol_id",
      implIdsSql: `SELECT sc.id FROM subcontrols_eu sc JOIN controls_eu c ON c.id = sc.control_id AND c.organization_id = :organizationId WHERE sc.organization_id = :organizationId AND c.projects_frameworks_id IN (:pfIds)`,
    },
  ],
  // ISO 42001
  2: [
    {
      risksTable: "subclauses_iso__risks",
      implCol: "subclause_id",
      implIdsSql: `SELECT id FROM subclauses_iso WHERE projects_frameworks_id IN (:pfIds) AND organization_id = :organizationId`,
    },
    {
      risksTable: "annexcategories_iso__risks",
      implCol: "annexcategory_id",
      implIdsSql: `SELECT id FROM annexcategories_iso WHERE projects_frameworks_id IN (:pfIds) AND organization_id = :organizationId`,
    },
  ],
  // ISO 27001
  3: [
    {
      risksTable: "subclauses_iso27001__risks",
      implCol: "subclause_id",
      implIdsSql: `SELECT id FROM subclauses_iso27001 WHERE projects_frameworks_id IN (:pfIds) AND organization_id = :organizationId`,
    },
    {
      risksTable: "annexcontrols_iso27001__risks",
      implCol: "annexcontrol_id",
      implIdsSql: `SELECT id FROM annexcontrols_iso27001 WHERE projects_frameworks_id IN (:pfIds) AND organization_id = :organizationId`,
    },
  ],
  // NIST AI RMF
  4: [
    {
      risksTable: "nist_ai_rmf_subcategories__risks",
      implCol: "nist_ai_rmf_subcategory_id",
      implIdsSql: `SELECT id FROM nist_ai_rmf_subcategories WHERE projects_frameworks_id IN (:pfIds) AND organization_id = :organizationId`,
    },
  ],
};

/** The bundled frameworks' l2 (and l3) junctions, from the structures registry. */
const bundledRiskMappingTables = (frameworkId: number): RiskMappingTable[] => {
  const structure = getStructureById(frameworkId);
  if (!structure) return [];
  const { tables, cols } = structure;
  const families: RiskMappingTable[] = [
    {
      risksTable: tables.l2_risks,
      implCol: cols.l2_risks_impl,
      implIdsSql: `SELECT id FROM ${tables.l2_impl} WHERE projects_frameworks_id IN (:pfIds) AND organization_id = :organizationId`,
    },
  ];
  if (tables.l3_impl && tables.l3_risks && cols.l3_risks_impl) {
    families.push({
      risksTable: tables.l3_risks,
      implCol: cols.l3_risks_impl,
      implIdsSql: `SELECT id FROM ${tables.l3_impl} WHERE projects_frameworks_id IN (:pfIds) AND organization_id = :organizationId`,
    });
  }
  return families;
};

/**
 * Delete one risk's mappings to the impl rows of the given projects_frameworks
 * rows, for every framework those rows belong to: the four built-in ones and
 * the bundled registry frameworks (R-L7).
 */
export const deleteRiskMappingsForProjectFrameworksQuery = async (
  riskId: number,
  projectFrameworkIds: number[],
  organizationId: number,
  transaction: Transaction,
): Promise<void> => {
  if (projectFrameworkIds.length === 0) return;

  const frameworkRows = (await sequelize.query(
    `SELECT DISTINCT framework_id FROM projects_frameworks
      WHERE id IN (:pfIds) AND organization_id = :organizationId`,
    {
      replacements: { pfIds: projectFrameworkIds, organizationId },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as { framework_id: number }[];

  for (const { framework_id } of frameworkRows) {
    const families =
      BUILT_IN_RISK_MAPPING_TABLES[framework_id] ?? bundledRiskMappingTables(framework_id);
    for (const { risksTable, implCol, implIdsSql } of families) {
      await sequelize.query(
        `DELETE FROM ${risksTable}
          WHERE organization_id = :organizationId AND projects_risks_id = :riskId
            AND ${implCol} IN (${implIdsSql})`,
        {
          replacements: { riskId, pfIds: projectFrameworkIds, organizationId },
          transaction,
        },
      );
    }
  }
};

/**
 * Delete one risk's mappings to everything the given projects (use cases)
 * hold: the projects_frameworks frameworks, custom frameworks and imported
 * frameworks.
 */
export const deleteRiskMappingsForProjectsQuery = async (
  riskId: number,
  projectIds: number[],
  organizationId: number,
  transaction: Transaction,
): Promise<void> => {
  if (projectIds.length === 0) return;

  const projectFrameworks = (await sequelize.query(
    `SELECT id FROM projects_frameworks WHERE project_id IN (:projectIds) AND organization_id = :organizationId`,
    {
      replacements: { projectIds, organizationId },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as { id: number }[];
  await deleteRiskMappingsForProjectFrameworksQuery(
    riskId,
    projectFrameworks.map((pf) => pf.id),
    organizationId,
    transaction,
  );

  const replacements = { riskId, projectIds, organizationId };
  const customLevel2ImplIds = `SELECT l2.id FROM custom_framework_level2_impl l2
      JOIN custom_framework_projects cfp ON cfp.id = l2.project_framework_id AND cfp.organization_id = :organizationId
     WHERE l2.organization_id = :organizationId AND cfp.project_id IN (:projectIds)`;
  await sequelize.query(
    `DELETE FROM custom_framework_level2_risks
      WHERE organization_id = :organizationId AND risk_id = :riskId
        AND level2_impl_id IN (${customLevel2ImplIds})`,
    { replacements, transaction },
  );
  await sequelize.query(
    `DELETE FROM custom_framework_level3_risks
      WHERE organization_id = :organizationId AND risk_id = :riskId
        AND level3_impl_id IN (
          SELECT l3.id FROM custom_framework_level3_impl l3
           WHERE l3.organization_id = :organizationId AND l3.level2_impl_id IN (${customLevel2ImplIds})
        )`,
    { replacements, transaction },
  );

  for (const [risksTable, implCol, implTable] of [
    ["imported_framework_topic_impl__risks", "topic_impl_id", "imported_framework_topic_impl"],
    [
      "imported_framework_subtopic_impl__risks",
      "subtopic_impl_id",
      "imported_framework_subtopic_impl",
    ],
  ] as const) {
    await sequelize.query(
      `DELETE FROM ${risksTable}
        WHERE organization_id = :organizationId AND projects_risks_id = :riskId
          AND ${implCol} IN (
            SELECT i.id FROM ${implTable} i
              JOIN projects_imported_frameworks pif ON pif.id = i.project_imported_framework_id AND pif.organization_id = :organizationId
             WHERE i.organization_id = :organizationId AND pif.project_id IN (:projectIds)
          )`,
      { replacements, transaction },
    );
  }
};

export const PROJECT_RISK_CATEGORIES = [
  "Strategic risk",
  "Operational risk",
  "Compliance risk",
  "Financial risk",
  "Cybersecurity risk",
  "Reputational risk",
  "Legal risk",
  "Technological risk",
  "Third-party/vendor risk",
  "Environmental risk",
  "Human resources risk",
  "Geopolitical risk",
  "Fraud risk",
  "Data privacy risk",
  "Health and safety risk",
] as const;

export type ProjectRiskCategory = (typeof PROJECT_RISK_CATEGORIES)[number];

export const PROJECT_RISK_CATEGORIES_SET: Set<string> = new Set(PROJECT_RISK_CATEGORIES);
