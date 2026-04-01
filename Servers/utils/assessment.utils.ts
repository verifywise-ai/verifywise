import { AssessmentModel } from "../domain.layer/models/assessment/assessment.model";
import { sequelize } from "../database/db";
import { createNewTopicsQuery } from "./topic.utils";
import { Transaction } from "sequelize";

export const getAllAssessmentsQuery = async (
  organizationId: number
): Promise<AssessmentModel[]> => {
  const assessments = await sequelize.query(
    `SELECT * FROM assessments WHERE organization_id = :organizationId ORDER BY created_at DESC, id ASC`,
    {
      replacements: { organizationId },
      mapToModel: true,
      model: AssessmentModel,
    }
  );
  return assessments;
};

export const getAssessmentByIdQuery = async (
  id: number,
  organizationId: number
): Promise<AssessmentModel | null> => {
  const result = await sequelize.query(
    `SELECT * FROM assessments WHERE organization_id = :organizationId AND id = :id`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: AssessmentModel,
    }
  );
  return result[0];
};

export const getAssessmentByProjectIdQuery = async (
  projectId: number,
  organizationId: number
): Promise<AssessmentModel[]> => {
  const result = await sequelize.query(
    `SELECT * FROM assessments WHERE organization_id = :organizationId AND project_id = :project_id ORDER BY created_at DESC, id ASC`,
    {
      replacements: { organizationId, project_id: projectId },
      mapToModel: true,
      model: AssessmentModel,
    }
  );
  return result;
};

export const createNewAssessmentQuery = async (
  assessment: AssessmentModel,
  enable_ai_data_insertion: boolean,
  organizationId: number,
  transaction: Transaction
): Promise<Object> => {
  const result = await sequelize.query(
    `INSERT INTO assessments (organization_id, project_id) VALUES (:organizationId, :project_id) RETURNING *`,
    {
      replacements: { organizationId, project_id: assessment.project_id },
      mapToModel: true,
      model: AssessmentModel,
      transaction,
    }
  );
  const topics = await createNewTopicsQuery(
    result[0].id!,
    enable_ai_data_insertion,
    organizationId,
    transaction
  );
  return { assessment: result[0], topics };
};

export const updateAssessmentByIdQuery = async (
  id: number,
  assessment: Partial<AssessmentModel>,
  organizationId: number,
  transaction: Transaction
): Promise<Boolean> => {
  const result = await sequelize.query(
    `UPDATE assessments SET project_id = :project_id WHERE organization_id = :organizationId AND id = :id RETURNING *`,
    {
      replacements: {
        organizationId,
        project_id: assessment.project_id,
        id: id,
      },
      mapToModel: true,
      model: AssessmentModel,
      // type: QueryTypes.UPDATE
      transaction,
    }
  );
  return result.length > 0;
};

export const deleteAssessmentByIdQuery = async (
  id: number,
  organizationId: number,
  transaction: Transaction
): Promise<Boolean> => {
  const result = await sequelize.query(
    `DELETE FROM assessments WHERE organization_id = :organizationId AND id = :id RETURNING *`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: AssessmentModel,
      transaction,
    }
  );
  return result.length > 0;
};
