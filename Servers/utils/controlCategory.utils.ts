import { ControlCategoryModel } from "../domain.layer/models/controlCategory/controlCategory.model";
import { sequelize } from "../database/db";
import { createNewControlsQuery } from "./control.utils";
import { ControlCategories } from "../structures/EU-AI-Act/compliance-tracker/controlCategories.struct";
import { QueryTypes, Transaction } from "sequelize";
import { IControlCategory } from "../domain.layer/interfaces/i.controlCategory";

export const getAllControlCategoriesQuery = async (
  organizationId: number
): Promise<ControlCategoryModel[]> => {
  const controlCategories = await sequelize.query(
    `SELECT * FROM controlcategories WHERE organization_id = :organizationId ORDER BY created_at DESC, id ASC`,
    {
      replacements: { organizationId },
      mapToModel: true,
      model: ControlCategoryModel,
    }
  );
  return controlCategories;
};

export const getControlCategoryByIdQuery = async (
  id: number,
  organizationId: number
): Promise<IControlCategory | null> => {
  const result = await sequelize.query(
    `SELECT * FROM controlcategories WHERE organization_id = :organizationId AND id = :id`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: ControlCategoryModel,
    }
  );
  return result[0];
};

export const getControlCategoryByTitleAndProjectIdQuery = async (
  title: string,
  projectId: number,
  organizationId: number
): Promise<IControlCategory | null> => {
  const result = await sequelize.query(
    "SELECT * FROM controlcategories WHERE organization_id = :organizationId AND title = :title AND project_id = :project_id",
    {
      replacements: { organizationId, title, project_id: projectId },
      mapToModel: true,
      model: ControlCategoryModel,
    }
  );
  return result[0];
};

export const getControlCategoryByProjectIdQuery = async (
  projectId: number,
  organizationId: number
): Promise<IControlCategory[]> => {
  const result = await sequelize.query(
    `SELECT * FROM controlcategories WHERE organization_id = :organizationId AND project_id = :project_id ORDER BY created_at DESC, id ASC`,
    {
      replacements: { organizationId, project_id: projectId },
      mapToModel: true,
      model: ControlCategoryModel,
    }
  );
  return result;
};

export const createControlCategoryQuery = async (
  controlCategory: ControlCategoryModel,
  organizationId: number,
  transaction: Transaction
): Promise<ControlCategoryModel> => {
  const result = await sequelize.query(
    `INSERT INTO controlcategories (
      organization_id, project_id, title, order_no
    ) VALUES (:organizationId, :project_id, :title, :order_no) RETURNING *`,
    {
      replacements: {
        organizationId,
        project_id: controlCategory.project_id,
        title: controlCategory.title,
        order_no: controlCategory.order_no || null,
      },
      mapToModel: true,
      model: ControlCategoryModel,
      // type: QueryTypes.INSERT
      transaction,
    }
  );
  return result[0];
};

export const updateControlCategoryByIdQuery = async (
  id: number,
  controlCategory: Partial<ControlCategoryModel>,
  organizationId: number,
  transaction: Transaction
): Promise<ControlCategoryModel | null> => {
  const updateControlCategory: Partial<
    Record<keyof ControlCategoryModel, any>
  > & { organizationId?: number } = {};
  const setClause = ["title"]
    .filter((f) => {
      if (
        controlCategory[f as keyof ControlCategoryModel] !== undefined &&
        controlCategory[f as keyof ControlCategoryModel]
      ) {
        updateControlCategory[f as keyof ControlCategoryModel] =
          controlCategory[f as keyof ControlCategoryModel];
        return true;
      }
      return false;
    })
    .map((f) => `${f} = :${f}`)
    .join(", ");

  const query = `UPDATE controlcategories SET ${setClause} WHERE organization_id = :organizationId AND id = :id RETURNING *;`;

  updateControlCategory.id = id;
  updateControlCategory.organizationId = organizationId;

  const result = await sequelize.query(query, {
    replacements: updateControlCategory,
    mapToModel: true,
    model: ControlCategoryModel,
    // type: QueryTypes.UPDATE,
    transaction,
  });

  return result[0];
};

export const deleteControlCategoryByIdQuery = async (
  id: number,
  organizationId: number,
  transaction: Transaction
): Promise<Boolean> => {
  const result = await sequelize.query(
    `DELETE FROM controlcategories WHERE organization_id = :organizationId AND id = :id RETURNING *`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: ControlCategoryModel,
      type: QueryTypes.DELETE,
      transaction,
    }
  );
  return result.length > 0;
};

export const createNewControlCategories = async (
  projectId: number,
  enable_ai_data_insertion: boolean,
  organizationId: number,
  transaction: Transaction
) => {
  const createdControlCategories = [];
  let query = `INSERT INTO controlcategories(
    organization_id, project_id, title, order_no
  ) VALUES (:organizationId, :project_id, :title, :order_no) RETURNING *;`;
  for (let controlCategoryStruct of ControlCategories) {
    const result = await sequelize.query(query, {
      replacements: {
        organizationId,
        project_id: projectId,
        title: controlCategoryStruct.title,
        order_no: controlCategoryStruct.order_no,
      },
      mapToModel: true,
      model: ControlCategoryModel,
      // type: QueryTypes.INSERT
      transaction,
    });
    const control_category_id = result[0].id!;
    const controls = await createNewControlsQuery(
      control_category_id,
      controlCategoryStruct.controls,
      enable_ai_data_insertion,
      organizationId,
      transaction
    );
    createdControlCategories.push({ ...result[0].dataValues, controls });
  }
  return createdControlCategories;
};
