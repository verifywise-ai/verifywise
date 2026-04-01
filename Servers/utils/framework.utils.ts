import { Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { FrameworkModel } from "../domain.layer/models/frameworks/frameworks.model";
import { ProjectFrameworksModel } from "../domain.layer/models/projectFrameworks/projectFrameworks.model";
import {
  frameworkAdditionMap,
  frameworkDeletionMap,
  frameworkFilesDeletionSourceMap,
} from "../types/framework.type";

export const getAllFrameworksQuery = async (
  organizationId: number
): Promise<FrameworkModel[]> => {
  const frameworks = await sequelize.query(
    `SELECT * FROM frameworks ORDER BY created_at DESC, id ASC;`,
    {
      mapToModel: true,
      model: FrameworkModel,
    }
  );
  for (let framework of frameworks) {
    const frameworkProjects = await sequelize.query(
      `SELECT * FROM projects_frameworks WHERE organization_id = :organizationId AND framework_id = :frameworkId`,
      {
        replacements: { frameworkId: framework.id, organizationId },
        mapToModel: true,
        model: ProjectFrameworksModel,
      }
    );
    (framework as any).projects = frameworkProjects;
  }
  return frameworks;
};

export const getAllFrameworkByIdQuery = async (
  id: number,
  organizationId: number
): Promise<FrameworkModel | null> => {
  const result = await sequelize.query(
    `SELECT * FROM frameworks WHERE id = :id ORDER BY created_at DESC, id ASC`,
    {
      replacements: { id },
      mapToModel: true,
      model: FrameworkModel,
    }
  );
  const framework = result[0];
  const frameworkProjects = await sequelize.query(
    `SELECT * FROM projects_frameworks WHERE organization_id = :organizationId AND framework_id = :frameworkId`,
    {
      replacements: { frameworkId: framework.id, organizationId },
      mapToModel: true,
      model: ProjectFrameworksModel,
    }
  );
  (framework as any).projects = frameworkProjects;
  return framework;
};

const checkFrameworkExistsQuery = async (
  frameworkId: number,
  projectId: number,
  organizationId: number,
  transaction: Transaction
): Promise<boolean> => {
  const [[{ exists }]] = (await sequelize.query(
    `SELECT EXISTS (SELECT 1 FROM projects_frameworks WHERE organization_id = :organizationId AND project_id = :projectId AND framework_id = :frameworkId) AS exists;`,
    { replacements: { projectId, frameworkId, organizationId }, transaction }
  )) as [[{ exists: boolean }], number];
  return exists;
};

const canRemoveFrameworkFromProjectQuery = async (
  frameworkId: number,
  projectId: number,
  organizationId: number,
  transaction: Transaction
): Promise<boolean> => {
  const exists = await checkFrameworkExistsQuery(
    frameworkId,
    projectId,
    organizationId,
    transaction
  );
  if (!exists) {
    return false; // Framework not found in the project
  }

  // Count both system frameworks and custom frameworks (from plugin if installed) for the project
  // A framework can only be removed if total count > 1
  // Use safe query that handles missing plugin table
  const [[{ can_remove }]] = (await sequelize.query(
    `SELECT (
      (SELECT COUNT(*) FROM projects_frameworks WHERE organization_id = :organizationId AND project_id = :projectId) +
      CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'verifywise' AND table_name = 'custom_framework_projects')
        THEN (SELECT COUNT(*) FROM custom_framework_projects WHERE organization_id = :organizationId AND project_id = :projectId)
        ELSE 0
      END
    ) > 1 AND EXISTS (SELECT 1 FROM projects_frameworks WHERE organization_id = :organizationId AND project_id = :projectId AND framework_id = :frameworkId) AS can_remove;`,
    { replacements: { projectId, frameworkId, organizationId }, transaction }
  )) as [[{ can_remove: boolean }], number];
  return can_remove;
};

export const canAddFrameworkToProjectQuery = async (
  frameworkId: number,
  projectId: number,
  organizationId: number,
  transaction: Transaction
): Promise<boolean> => {
  const exists = await checkFrameworkExistsQuery(
    frameworkId,
    projectId,
    organizationId,
    transaction
  );
  if (exists) {
    return false; // Framework already added
  }

  const [[{ is_framework_organizational }]] = (await sequelize.query(
    `SELECT is_organizational AS is_framework_organizational FROM frameworks WHERE id = :frameworkId;`,
    { replacements: { frameworkId }, transaction }
  )) as [[{ is_framework_organizational: boolean }], number];
  const [[{ is_project_organizational }]] = (await sequelize.query(
    `SELECT is_organizational AS is_project_organizational FROM projects WHERE organization_id = :organizationId AND id = :projectId;`,
    { replacements: { projectId, organizationId }, transaction }
  )) as [[{ is_project_organizational: boolean }], number];

  if (is_framework_organizational !== is_project_organizational) {
    return false; // Cannot add organizational framework to non-organizational project
  }

  return true; // Framework can be added
};

export const addFrameworkToProjectQuery = async (
  frameworkId: number,
  projectId: number,
  organizationId: number,
  transaction: Transaction
): Promise<boolean> => {
  const canAdd = await canAddFrameworkToProjectQuery(
    frameworkId,
    projectId,
    organizationId,
    transaction
  );
  if (!canAdd) {
    return false;
  }

  const frameworkAdditionFunction = frameworkAdditionMap[frameworkId];
  if (!frameworkAdditionFunction) {
    return false;
  }

  // add the framework to the project
  const result = (await sequelize.query(
    `INSERT INTO projects_frameworks (organization_id, project_id, framework_id) VALUES (:organizationId, :projectId, :frameworkId) RETURNING *;`,
    { replacements: { projectId, frameworkId, organizationId }, transaction }
  )) as [ProjectFrameworksModel[], number];
  if (!result[0]?.length) {
    return false;
  }
  // call framework addition function only if insert was successful
  await frameworkAdditionFunction(projectId, false, organizationId, transaction);
  return true;
};

const deleteFrameworkEvidenceFiles = async (
  projectId: number,
  source: string[],
  organizationId: number,
  transaction: Transaction
): Promise<void> => {
  // First clean up any virtual folder mappings for these files
  await sequelize.query(
    `DELETE FROM file_folder_mappings
     WHERE organization_id = :organizationId AND file_id IN (
       SELECT id FROM files
       WHERE organization_id = :organizationId AND project_id = :project_id AND source IN (:source)
     )`,
    {
      replacements: { project_id: projectId, source, organizationId },
      transaction,
    }
  );

  await sequelize.query(
    `DELETE FROM files WHERE organization_id = :organizationId AND project_id = :project_id AND source IN (:source)`,
    {
      replacements: { project_id: projectId, source, organizationId },
      transaction,
    }
  );
};

export const deleteFrameworkFromProjectQuery = async (
  frameworkId: number,
  projectId: number,
  organizationId: number,
  transaction: Transaction
): Promise<boolean> => {
  const canRemove = await canRemoveFrameworkFromProjectQuery(
    frameworkId,
    projectId,
    organizationId,
    transaction
  );
  if (!canRemove) {
    return false;
  }

  // delete evidence files for the framework
  const frameworkFilesDeletionSource =
    frameworkFilesDeletionSourceMap[frameworkId];
  if (!frameworkFilesDeletionSource) {
    return false;
  }
  await deleteFrameworkEvidenceFiles(
    projectId,
    frameworkFilesDeletionSource,
    organizationId,
    transaction
  );

  const frameworkDeletionFunction = frameworkDeletionMap[frameworkId];
  if (!frameworkDeletionFunction) {
    return false;
  }
  // call framework deletion function
  const result = await frameworkDeletionFunction(
    projectId,
    organizationId,
    transaction
  );
  return result;
};
