import { ProjectModel } from "../domain.layer/models/project/project.model";
import { sequelize } from "../database/db";
import { ProjectsMembersModel } from "../domain.layer/models/projectsMembers/projectsMembers.model";
import { QueryTypes, Transaction } from "sequelize";
import { VendorsProjectsModel } from "../domain.layer/models/vendorsProjects/vendorsProjects.model";
import { RiskModel } from "../domain.layer/models/risks/risk.model";
import { FileModel } from "../domain.layer/models/file/file.model";
import { ProjectFrameworksModel } from "../domain.layer/models/projectFrameworks/projectFrameworks.model";
import { frameworkDeletionMap } from "../types/framework.type";
import { IProjectAttributes } from "../domain.layer/interfaces/i.project";
import { IRoleAttributes } from "../domain.layer/interfaces/i.role";
import { TenantAutomationActionModel } from "../domain.layer/models/tenantAutomationAction/tenantAutomationAction.model";
import { replaceTemplateVariables } from "./automation/automation.utils";
import { enqueueAutomationAction } from "../services/automations/automationProducer";
import {
  buildProjectReplacements,
  buildProjectUpdateReplacements,
} from "./automation/project.automation.utils";

// Function to generate the next sequential UC ID
// Using a database sequence to fetch the next value
export const generateNextUcId = async (
  _organizationId: number,
  transaction: Transaction
): Promise<string> => {
  const result = await sequelize.query<{ next_id: number }>(
    `SELECT nextval('project_uc_id_seq') AS next_id`,
    {
      type: QueryTypes.SELECT,
      transaction,
    }
  );

  const nextNumber = result[0].next_id;
  return `UC-${nextNumber}`;
};

interface GetUserProjectsOptions {
  userId: number;
  role: IRoleAttributes["name"];
  transaction?: Transaction;
}

export const getUserProjects = async (
  { userId, role, transaction }: GetUserProjectsOptions,
  organizationId: number
) => {
  const baseQueryParts: string[] = [
    `SELECT DISTINCT p.*`,
    `FROM projects p`,
  ];

  const whereConditions: string[] = ["p.organization_id = :organizationId"];
  const replacements: { [key: string]: any } = { organizationId };

  if (role !== "Admin") {
    baseQueryParts.push(
      `LEFT JOIN projects_members pm ON pm.project_id = p.id AND pm.organization_id = :organizationId`
    );
    whereConditions.push("(p.owner = :userId OR pm.user_id = :userId)");
    replacements.userId = userId;
  }

  baseQueryParts.push("WHERE " + whereConditions.join(" AND "));
  baseQueryParts.push("ORDER BY p.created_at DESC, p.id ASC");

  const finalQuery = baseQueryParts.join("\n");

  return sequelize.query(finalQuery, {
    replacements,
    model: ProjectModel,
    mapToModel: true,
    type: QueryTypes.SELECT,
    transaction,
  });
};

export const getAllProjectsQuery = async (
  {
    userId,
    role,
  }: {
    userId: number;
    role: IRoleAttributes["name"];
  },
  organizationId: number
): Promise<IProjectAttributes[]> => {
  if (!userId || !role) {
    throw new Error("User ID and role are required to fetch projects.");
  }

  const projects = await getUserProjects({ userId, role }, organizationId);

  if (!projects || projects.length === 0) return [];

  for (let project of projects) {
    const projectFramework = (await sequelize.query(
      `
        SELECT
          pf.id AS project_framework_id, pf.framework_id,
          f.name AS name
        FROM projects_frameworks pf
        JOIN frameworks f ON pf.framework_id = f.id
        WHERE pf.organization_id = :organizationId AND pf.project_id = :project_id`,
      {
        replacements: { organizationId, project_id: project.id },
      }
    )) as [
      { project_framework_id: number; framework_id: number; name: string }[],
      number,
    ];
    (project.dataValues as any)["framework"] = [];
    for (let pf of projectFramework[0]) {
      (project.dataValues as any)["framework"].push(pf);
    }

    const members = await sequelize.query(
      `SELECT user_id FROM projects_members WHERE organization_id = :organizationId AND project_id = :project_id`,
      {
        replacements: { organizationId, project_id: project.id },
        mapToModel: true,
        model: ProjectsMembersModel,
      }
    );
    (project.dataValues as any)["members"] = members.map((m) => m.user_id);
  }

  return projects;
};

export const getProjectByIdQuery = async (
  id: number,
  organizationId: number
): Promise<IProjectAttributes | null> => {
  const result = await sequelize.query(
    `SELECT * FROM projects WHERE organization_id = :organizationId AND id = :id`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: ProjectModel,
    }
  );
  if (result.length === 0) return null;
  const project = result[0];
  const projectFramework = (await sequelize.query(
    `
      SELECT
        pf.id AS project_framework_id, pf.framework_id,
        f.name AS name
      FROM projects_frameworks pf
      JOIN frameworks f ON pf.framework_id = f.id
      WHERE pf.organization_id = :organizationId AND pf.project_id = :project_id`,
    {
      replacements: { organizationId, project_id: project.id },
    }
  )) as [
    { project_framework_id: number; framework_id: number; name: string }[],
    number,
  ];
  (project.dataValues as any)["framework"] = [];
  for (let pf of projectFramework[0]) {
    (project.dataValues as any)["framework"].push(pf);
  }

  // Handle case where project owner might be null or user doesn't exist
  let ownerName = "Unassigned";
  if (project.owner) {
    const projectOwner = (await sequelize.query(
      `SELECT name || ' ' || surname AS full_name FROM users WHERE id = :owner_id;`,
      {
        replacements: { owner_id: project.owner },
      }
    )) as [{ full_name: string }[], number];
    if (projectOwner[0] && projectOwner[0][0]) {
      ownerName = projectOwner[0][0].full_name;
    }
  }
  (project.dataValues as any)["owner_name"] = ownerName;

  const members = await sequelize.query(
    `SELECT user_id FROM projects_members WHERE organization_id = :organizationId AND project_id = :project_id`,
    {
      replacements: { organizationId, project_id: project.id },
      mapToModel: true,
      model: ProjectsMembersModel,
    }
  );
  (project.dataValues as any)["members"] = members.map((m) => m.user_id);

  return project;
};

export const countSubControlsByProjectId = async (
  project_id: number,
  organizationId: number
): Promise<{
  totalSubcontrols: string;
  doneSubcontrols: string;
}> => {
  const result = await sequelize.query(
    `SELECT COUNT(*) AS "totalSubcontrols", COUNT(CASE WHEN sc.status = 'Done' THEN 1 END) AS "doneSubcontrols" FROM
      controlcategories cc JOIN controls c ON cc.id = c.control_category_id AND c.organization_id = :organizationId
        JOIN subcontrols sc ON c.id = sc.control_id AND sc.organization_id = :organizationId
      WHERE cc.organization_id = :organizationId AND cc.project_id = :project_id`,
    {
      replacements: { organizationId, project_id },
      type: QueryTypes.SELECT,
    }
  );
  return result[0] as {
    totalSubcontrols: string;
    doneSubcontrols: string;
  };
};

export const countAnswersByProjectId = async (
  project_id: number,
  organizationId: number
): Promise<{
  totalAssessments: string;
  answeredAssessments: string;
}> => {
  const result = await sequelize.query(
    `SELECT COUNT(*) AS "totalAssessments", COUNT(CASE WHEN q.status = 'Done' THEN 1 END) AS "answeredAssessments" FROM
      assessments a JOIN topics t ON a.id = t.assessment_id AND t.organization_id = :organizationId
        JOIN subtopics st ON t.id = st.topic_id AND st.organization_id = :organizationId
          JOIN questions q ON st.id = q.subtopic_id AND q.organization_id = :organizationId
      WHERE a.organization_id = :organizationId AND a.project_id = :project_id`,
    {
      replacements: { organizationId, project_id },
      type: QueryTypes.SELECT,
    }
  );
  return result[0] as {
    totalAssessments: string;
    answeredAssessments: string;
  };
};

export const createNewProjectQuery = async (
  project: Partial<ProjectModel> & { enable_ai_data_insertion?: boolean },
  members: number[],
  frameworks: number[],
  organizationId: number,
  userId: number,
  transaction: Transaction,
  isDemo: boolean = false
): Promise<ProjectModel> => {
  const allowedFrameworks: number[] = [];
  if (project.is_organizational === true) {
    const result = (await sequelize.query(
      `SELECT id FROM frameworks WHERE is_organizational = true;`,
      { transaction }
    )) as [{ id: number }[], number];
    allowedFrameworks.push(...result[0].map((f) => f.id));
  } else {
    const result = (await sequelize.query(
      `SELECT id FROM frameworks WHERE is_organizational = false;`,
      { transaction }
    )) as [{ id: number }[], number];
    allowedFrameworks.push(...result[0].map((f) => f.id));
  }
  for (let framework of frameworks) {
    if (!allowedFrameworks.includes(framework)) {
      throw new Error(
        `Framework with ID ${framework} is not allowed for this project.`
      );
    }
  }

  const ucId = await generateNextUcId(organizationId, transaction);

  // If approval workflow is assigned, store frameworks for later creation
  const pendingFrameworks = project.approval_workflow_id ? frameworks : null;
  const enableAiDataInsertion = project.approval_workflow_id ? (project.enable_ai_data_insertion || false) : false;

  const result = await sequelize.query(
    `INSERT INTO projects (
      organization_id, uc_id, project_title, owner, start_date, geography, target_industry, description, ai_risk_classification,
      type_of_high_risk_role, goal, status, last_updated, last_updated_by, is_demo, is_organizational, approval_workflow_id,
      pending_frameworks, enable_ai_data_insertion
    ) VALUES (
      :organization_id, :uc_id, :project_title, :owner, :start_date, :geography, :target_industry, :description, :ai_risk_classification,
      :type_of_high_risk_role, :goal, :status, :last_updated, :last_updated_by, :is_demo, :is_organizational, :approval_workflow_id,
      :pending_frameworks, :enable_ai_data_insertion
    ) RETURNING *`,
    {
      replacements: {
        organization_id: organizationId,
        uc_id: ucId,
        project_title: project.project_title,
        owner: project.owner,
        start_date: project.start_date,
        geography: project.geography || 1,
        ai_risk_classification: project.ai_risk_classification || null,
        type_of_high_risk_role: project.type_of_high_risk_role || null,
        goal: project.goal || null,
        target_industry: project.target_industry || null,
        description: project.description || null,
        status: project.status || "Not started",
        last_updated: new Date(Date.now()),
        last_updated_by: userId,
        is_demo: isDemo,
        is_organizational: project.is_organizational || false,
        approval_workflow_id: project.approval_workflow_id || null,
        pending_frameworks: pendingFrameworks ? JSON.stringify(pendingFrameworks) : null,
        enable_ai_data_insertion: enableAiDataInsertion,
      },
      mapToModel: true,
      model: ProjectModel,
      transaction,
    }
  );
  const createdProject = result[0];
  console.log("Project created with ID:", createdProject.id);
  console.log("createdProject.approval_workflow_id:", (createdProject as any).approval_workflow_id);
  (createdProject.dataValues as any)["members"] = [];
  for (let member of members) {
    await sequelize.query(
      `INSERT INTO projects_members (organization_id, project_id, user_id, is_demo) VALUES (:organization_id, :project_id, :user_id, :is_demo) RETURNING *`,
      {
        replacements: {
          organization_id: organizationId,
          project_id: createdProject.id,
          user_id: member,
          is_demo: isDemo,
        },
        mapToModel: true,
        model: ProjectsMembersModel,
        transaction,
      }
    );
    (createdProject.dataValues as any)["members"].push(member);
  }
  (createdProject.dataValues as any)["framework"] = [];
  // Only create projects_frameworks records if NO approval workflow is assigned
  if (!project.approval_workflow_id) {
    for (let framework of frameworks) {
      await sequelize.query(
        `INSERT INTO projects_frameworks (organization_id, project_id, framework_id, is_demo) VALUES (:organization_id, :project_id, :framework_id, :is_demo) RETURNING *`,
        {
          replacements: {
            organization_id: organizationId,
            project_id: createdProject.id,
            framework_id: framework,
            is_demo: isDemo,
          },
          mapToModel: true,
          model: ProjectFrameworksModel,
          transaction,
        }
      );
      (createdProject.dataValues as any)["framework"].push(framework);
    }
  }

  const automations = (await sequelize.query(
    `SELECT
      pat.key AS trigger_key,
      paa.key AS action_key,
      a.id AS automation_id,
      aa.*
    FROM automation_triggers pat
    JOIN automations a ON a.trigger_id = pat.id AND a.organization_id = :organizationId
    JOIN automation_actions_data aa ON a.id = aa.automation_id AND aa.organization_id = :organizationId
    JOIN automation_actions paa ON aa.action_type_id = paa.id
    WHERE pat.key = 'project_added' AND a.is_active ORDER BY aa."order" ASC;`,
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
    if (automation["trigger_key"] === "project_added") {
      const owner_name = (await sequelize.query(
        `SELECT name || ' ' || surname AS full_name FROM users WHERE id = :owner_id;`,
        {
          replacements: { owner_id: createdProject.dataValues.owner },
          transaction,
        }
      )) as [{ full_name: string }[], number];

      const params = automation.params!;

      // Build replacements
      const replacements = buildProjectReplacements({
        ...createdProject.dataValues,
        owner_name: owner_name[0]?.[0]?.full_name || "Unknown",
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

  return createdProject;
};

export const updateProjectUpdatedByIdQuery = async (
  id: number, // this is not the project id,
  byTable:
    | "controls"
    | "answers"
    | "vendors"
    | "subclauses"
    | "annexcategories"
    | "annexcontrols_iso27001"
    | "subclauses_iso27001",
  organizationId: number,
  transaction: Transaction
): Promise<void> => {
  const queryMap = {
    controls: `SELECT pf.project_id as id FROM controls_eu c JOIN projects_frameworks pf ON pf.id = c.projects_frameworks_id AND pf.organization_id = :organizationId WHERE c.organization_id = :organizationId AND c.id = :id;`,
    answers: `SELECT pf.project_id as id FROM assessments a JOIN answers_eu ans ON ans.assessment_id = a.id AND ans.organization_id = :organizationId JOIN projects_frameworks pf ON pf.id = a.projects_frameworks_id AND pf.organization_id = :organizationId WHERE a.organization_id = :organizationId AND ans.id = :id;`,
    vendors: `SELECT project_id as id FROM vendors_projects WHERE organization_id = :organizationId AND vendor_id = :id;`,
    subclauses: `SELECT pf.project_id as id FROM subclauses_iso sc JOIN projects_frameworks pf ON pf.id = sc.projects_frameworks_id AND pf.organization_id = :organizationId WHERE sc.organization_id = :organizationId AND sc.id = :id;`,
    annexcategories: `SELECT pf.project_id as id FROM annexcategories_iso a JOIN projects_frameworks pf ON pf.id = a.projects_frameworks_id AND pf.organization_id = :organizationId WHERE a.organization_id = :organizationId AND a.id = :id;`,
    subclauses_iso27001: `SELECT pf.project_id as id FROM subclauses_iso27001 sc JOIN projects_frameworks pf ON pf.id = sc.projects_frameworks_id AND pf.organization_id = :organizationId WHERE sc.organization_id = :organizationId AND sc.id = :id;`,
    annexcontrols_iso27001: `SELECT pf.project_id as id FROM annexcontrols_iso27001 a JOIN projects_frameworks pf ON pf.id = a.projects_frameworks_id AND pf.organization_id = :organizationId WHERE a.organization_id = :organizationId AND a.id = :id;`,
  };
  const query = queryMap[byTable];
  const result = (await sequelize.query(query, {
    replacements: { organizationId, id },
    transaction,
  })) as [{ id: number }[], number];
  if (result[0].length > 0) {
    const projectIds = result[0].map(({ id }) => id);
    await sequelize.query(
      `UPDATE projects SET last_updated = :last_updated WHERE organization_id = :organizationId AND id IN (:project_ids);`,
      {
        replacements: {
          organizationId,
          last_updated: new Date(),
          project_ids: projectIds,
        },
        transaction,
      }
    );
  }
};

export const updateProjectByIdQuery = async (
  id: number,
  project: Partial<ProjectModel>,
  members: number[],
  organizationId: number,
  transaction: Transaction
): Promise<(IProjectAttributes & { members: number[] }) | null> => {
  const oldProject = await getProjectByIdQuery(id, organizationId);
  const _currentMembers = await sequelize.query(
    `SELECT user_id FROM projects_members WHERE organization_id = :organizationId AND project_id = :project_id`,
    {
      replacements: { organizationId, project_id: id },
      mapToModel: true,
      model: ProjectsMembersModel,
      transaction,
    }
  );
  const currentMembers = _currentMembers.map((m) => m.user_id);
  const deletedMembers = currentMembers.filter((m) => !members.includes(m));
  const newMembers = members.filter((m) => !currentMembers.includes(m));

  for (let member of deletedMembers) {
    await sequelize.query(
      `DELETE FROM projects_members WHERE organization_id = :organizationId AND user_id = :user_id AND project_id = :project_id`,
      {
        replacements: { organizationId, user_id: member, project_id: id },
        mapToModel: true,
        model: ProjectsMembersModel,
        type: QueryTypes.DELETE,
        transaction,
      }
    );
  }

  for (let member of newMembers) {
    await sequelize.query(
      `INSERT INTO projects_members (organization_id, project_id, user_id) VALUES (:organizationId, :project_id, :user_id);`,
      {
        replacements: { organizationId, user_id: member, project_id: id },
        mapToModel: true,
        model: ProjectsMembersModel,
        transaction,
      }
    );
  }

  const updateProject: Partial<Record<keyof ProjectModel, any>> & { organizationId?: number } = {};
  const setClause = [
    "project_title",
    "owner",
    "start_date",
    "ai_risk_classification",
    "type_of_high_risk_role",
    "goal",
    "geography",
    "target_industry",
    "description",
    "last_updated",
    "last_updated_by",
    "status",
  ]
    .filter((f) => {
      if (
        project[f as keyof ProjectModel] !== undefined &&
        project[f as keyof ProjectModel]
      ) {
        updateProject[f as keyof ProjectModel] =
          project[f as keyof ProjectModel];
        return true;
      }
      return false;
    })
    .map((f) => `${f} = :${f}`)
    .join(", ");

  const query = `UPDATE projects SET ${setClause} WHERE organization_id = :organizationId AND id = :id RETURNING *;`;

  updateProject.id = id;
  updateProject.organizationId = organizationId;

  const result = await sequelize.query(query, {
    replacements: updateProject,
    mapToModel: true,
    model: ProjectModel,
    transaction,
  });

  const updatedMembers = await sequelize.query(
    `SELECT user_id FROM projects_members WHERE organization_id = :organizationId AND project_id = :project_id`,
    {
      replacements: { organizationId, project_id: id },
      mapToModel: true,
      model: ProjectsMembersModel,
      transaction,
    }
  );
  const updatedProject = result[0];
  const automations = (await sequelize.query(
    `SELECT
      pat.key AS trigger_key,
      paa.key AS action_key,
      a.id AS automation_id,
      aa.*
    FROM automation_triggers pat
    JOIN automations a ON a.trigger_id = pat.id AND a.organization_id = :organizationId
    JOIN automation_actions_data aa ON a.id = aa.automation_id AND aa.organization_id = :organizationId
    JOIN automation_actions paa ON aa.action_type_id = paa.id
    WHERE pat.key = 'project_updated' AND a.is_active ORDER BY aa."order" ASC;`,
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
    if (automation["trigger_key"] === "project_updated") {
      const owner_name = (await sequelize.query(
        `SELECT name || ' ' || surname AS full_name FROM users WHERE id = :owner_id;`,
        {
          replacements: { owner_id: updatedProject.dataValues.owner },
          transaction,
        }
      )) as [{ full_name: string }[], number];

      const params = automation.params!;

      // Build replacements
      const replacements = buildProjectUpdateReplacements(oldProject, {
        ...updatedProject.dataValues,
        owner_name: owner_name[0]?.[0]?.full_name || "Unknown",
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
  return result.length
    ? {
        ...updatedProject.dataValues,
        members: updatedMembers.map((m) => m.user_id),
      }
    : null;
};

const deleteTable = async (
  entity: string,
  foreignKey: string,
  id: number,
  organizationId: number,
  transaction: Transaction
) => {
  let tableToDelete = entity;
  if (entity === "vendors") {
    tableToDelete = "vendors_projects";
  }
  await sequelize.query(
    `DELETE FROM ${tableToDelete} WHERE organization_id = :organizationId AND ${foreignKey} = :x;`,
    {
      replacements: { organizationId, x: id },
      mapToModel: true,
      type: QueryTypes.DELETE,
      transaction,
    }
  );
};

export const deleteHelper = async (
  childObject: Record<string, any>,
  parent_id: number,
  organizationId: number,
  transaction: Transaction
) => {
  const childTableName = Object.keys(childObject).filter(
    (k) => !["foreignKey", "model"].includes(k)
  )[0];
  let childIds: any = {};
  if (
    childTableName !== "projects_members" &&
    childTableName !== "projects_frameworks" &&
    childTableName !== "projects_risks"
  ) {
    if (childTableName === "vendors") {
      childIds = await sequelize.query(
        `SELECT vendor_id FROM vendors_projects WHERE organization_id = :organizationId AND project_id = :project_id`,
        {
          replacements: { organizationId, project_id: parent_id },
          mapToModel: true,
          model: VendorsProjectsModel,
          transaction,
        }
      );
    } else {
      childIds = await sequelize.query(
        `SELECT id FROM ${childTableName} WHERE organization_id = :organizationId AND ${childObject[childTableName].foreignKey} = :x`,
        {
          replacements: { organizationId, x: parent_id },
          mapToModel: true,
          model: childObject[childTableName].model,
          transaction,
        }
      );
    }
  }
  await Promise.all(
    Object.keys(childObject[childTableName])
      .filter((k) => !["foreignKey", "model"].includes(k))
      .map(async (k) => {
        for (let ch of childIds) {
          let childId = ch.id;
          if (childTableName === "vendors") childId = ch.vendor_id;
          await deleteHelper(
            { [k]: childObject[childTableName][k] },
            childId,
            organizationId,
            transaction
          );
        }
      })
  );
  await deleteTable(
    childTableName,
    childObject[childTableName].foreignKey,
    parent_id,
    organizationId,
    transaction
  );
};

export const deleteProjectByIdQuery = async (
  id: number,
  organizationId: number,
  transaction: Transaction
): Promise<boolean> => {
  const frameworks = await sequelize.query(
    `SELECT framework_id FROM projects_frameworks WHERE organization_id = :organizationId AND project_id = :project_id`,
    {
      replacements: { organizationId, project_id: id },
      mapToModel: true,
      model: ProjectFrameworksModel,
      transaction,
    }
  );
  const dependantEntities = [
    { files: { foreignKey: "project_id", model: FileModel } },
    { projects_risks: { foreignKey: "project_id", model: RiskModel } },
    {
      projects_members: {
        foreignKey: "project_id",
        model: ProjectsMembersModel,
      },
    },
  ];
  for (let entity of dependantEntities) {
    await deleteHelper(entity, id, organizationId, transaction);
  }
  await Promise.all(
    frameworks.map(({ framework_id }) => {
      const deleteFunction = frameworkDeletionMap[framework_id];
      if (!deleteFunction) {
        throw new Error(
          `Unsupported framework_id encountered: ${framework_id}`
        );
      }
      return deleteFunction(id, organizationId, transaction);
    })
  );

  const result = await sequelize.query(
    `DELETE FROM projects WHERE organization_id = :organizationId AND id = :id RETURNING *`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: ProjectModel,
      type: QueryTypes.DELETE,
      transaction,
    }
  );
  const deletedProject = result[0];

  // Automation trigger is optional - wrap in try-catch to prevent automation failures
  // from blocking the core project deletion operation
  try {
    // Only proceed with automation if we have a valid deleted project
    if (deletedProject && deletedProject.owner) {
      const automations = (await sequelize.query(
        `SELECT
          pat.key AS trigger_key,
          paa.key AS action_key,
          a.id AS automation_id,
          aa.*
        FROM automation_triggers pat
        JOIN automations a ON a.trigger_id = pat.id AND a.organization_id = :organizationId
        JOIN automation_actions_data aa ON a.id = aa.automation_id AND aa.organization_id = :organizationId
        JOIN automation_actions paa ON aa.action_type_id = paa.id
        WHERE pat.key = 'project_deleted' AND a.is_active ORDER BY aa."order" ASC;`,
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
        if (automation["trigger_key"] === "project_deleted") {
          const owner_name = (await sequelize.query(
            `SELECT name || ' ' || surname AS full_name FROM users WHERE id = :owner_id;`,
            {
              replacements: { owner_id: deletedProject.owner },
              transaction,
            }
          )) as [{ full_name: string }[], number];

          const params = automation.params!;

          // Build replacements
          const replacements = buildProjectReplacements({
            ...deletedProject,
            owner_name: owner_name[0]?.[0]?.full_name || "Unknown",
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
    }
  } catch (automationError) {
    // Log but don't throw - automation failure shouldn't block project deletion
    console.warn(
      `[deleteProjectByIdQuery] Automation trigger failed for project ${id}:`,
      automationError instanceof Error ? automationError.message : automationError
    );
  }

  return result.length > 0;
};

export const calculateProjectRisks = async (
  project_id: number,
  organizationId: number
): Promise<
  {
    risk_level_autocalculated: string;
    count: string;
  }[]
> => {
  const result = await sequelize.query<{
    risk_level_autocalculated: string;
    count: string;
  }>(
    `SELECT risk_level_autocalculated, count(*) AS count
     FROM risks r
     JOIN projects_risks pr ON r.id = pr.risk_id AND pr.organization_id = :organizationId
     WHERE r.organization_id = :organizationId AND pr.project_id = :project_id
     GROUP BY risk_level_autocalculated`,
    {
      replacements: { organizationId, project_id },
      type: QueryTypes.SELECT,
    }
  );
  return result;
};

export const calculateVendirRisks = async (
  project_id: number,
  organizationId: number
): Promise<
  {
    risk_level: string;
    count: string;
  }[]
> => {
  const result = await sequelize.query<{ risk_level: string; count: string }>(
    `SELECT risk_level, count(*) AS count FROM vendorrisks WHERE organization_id = :organizationId AND project_id = :project_id GROUP BY risk_level`,
    {
      replacements: { organizationId, project_id },
      type: QueryTypes.SELECT,
    }
  );
  return result;
};

/**
 * Gets current project members to identify newly added ones
 * @param projectId - The project ID to get members for
 * @param organizationId - The organization ID for tenant isolation
 * @param transaction - Optional transaction for database consistency
 * @returns Array of user IDs that are currently members of the project
 */
export const getCurrentProjectMembers = async (
  projectId: number,
  organizationId: number,
  transaction?: Transaction
): Promise<number[]> => {
  const currentMembersResult = await sequelize.query(
    `SELECT user_id FROM projects_members WHERE organization_id = :organizationId AND project_id = :project_id`,
    {
      replacements: { organizationId, project_id: projectId },
      type: QueryTypes.SELECT,
      transaction,
    }
  );
  return (currentMembersResult as any[]).map((m) => m.user_id);
};
