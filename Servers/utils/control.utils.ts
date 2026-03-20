import { ControlModel } from "../domain.layer/models/control/control.model";
import { sequelize } from "../database/db";
import { createNewSubControlsQuery } from "./subControl.utils";
import { QueryTypes, Transaction } from "sequelize";
import { IControl } from "../domain.layer/interfaces/i.control";

export const getAllControlsQuery = async (
  organizationId: number
): Promise<IControl[]> => {
  const controls = await sequelize.query(
    `SELECT * FROM controls WHERE organization_id = :organizationId ORDER BY created_at DESC, id ASC`,
    {
      replacements: { organizationId },
      mapToModel: true,
      model: ControlModel,
    }
  );
  return controls;
};

export const getControlByIdQuery = async (
  id: number,
  organizationId: number
): Promise<IControl | null> => {
  const result = await sequelize.query(
    `SELECT * FROM controls WHERE organization_id = :organizationId AND id = :id`,
    {
      mapToModel: true,
      model: ControlModel,
      replacements: { organizationId, id },
    }
  );
  return result[0];
};

export const getAllControlsByControlGroupQuery = async (
  controlGroupId: any,
  organizationId: number
): Promise<IControl[]> => {
  const controls = await sequelize.query(
    `SELECT * FROM controls WHERE organization_id = :organizationId AND control_category_id = :control_category_id ORDER BY created_at DESC, id ASC`,
    {
      replacements: { organizationId, control_category_id: controlGroupId },
      mapToModel: true,
      model: ControlModel,
    }
  );
  return controls;
};

export const getControlByIdAndControlTitleAndControlDescriptionQuery = async (
  id: number,
  controlTitle: string,
  controlDescription: string,
  organizationId: number
): Promise<IControl | null> => {
  const result = await sequelize.query(
    `SELECT * FROM controls WHERE organization_id = :organizationId
      AND control_category_id = :control_category_id
      AND control_title = :control_title
      AND control_description = :control_description`,
    {
      replacements: {
        organizationId,
        control_category_id: id,
        control_title: controlTitle,
        control_description: controlDescription,
      },
      mapToModel: true,
      model: ControlModel,
    }
  );
  return result[0];
};

export const createNewControlQuery = async (
  control: Partial<ControlModel>,
  organizationId: number,
  transaction: Transaction
): Promise<ControlModel> => {
  const result = await sequelize.query(
    `INSERT INTO controls (
      organization_id, title, description, order_no,
      status, approver, risk_review,
      owner, reviewer, due_date,
      implementation_details, control_category_id
    ) VALUES (
      :organizationId, :title, :description, :order_no,
      :status, :approver, :risk_review,
      :owner, :reviewer, :due_date,
      :implementation_details, :control_category_id) RETURNING *`,
    {
      replacements: {
        organizationId,
        title: control.title,
        description: control.description,
        order_no: control.order_no || null,
        status: control.status,
        approver: control.approver,
        risk_review: control.risk_review,
        owner: control.owner,
        reviewer: control.reviewer,
        due_date: control.due_date,
        implementation_details: control.implementation_details,
        control_category_id: control.control_category_id,
      },
      mapToModel: true,
      model: ControlModel,
      transaction,
    }
  );
  return result[0];
};

export const updateControlByIdQuery = async (
  id: number,
  control: Partial<ControlModel>,
  organizationId: number,
  transaction: Transaction
): Promise<ControlModel> => {
  const updateControl: Partial<Record<keyof ControlModel, any>> & { organizationId?: number } = {};
  const setClause = [
    "title",
    "description",
    "status",
    "approver",
    "risk_review",
    "owner",
    "reviewer",
    "due_date",
    "implementation_details",
  ]
    .filter((f) => {
      if (
        control[f as keyof ControlModel] !== undefined &&
        control[f as keyof ControlModel]
      ) {
        updateControl[f as keyof ControlModel] =
          control[f as keyof ControlModel];
        return true;
      }
      return false;
    })
    .map((f) => `${f} = :${f}`)
    .join(", ");

  const query = `UPDATE controls SET ${setClause} WHERE organization_id = :organizationId AND id = :id RETURNING *;`;

  updateControl.id = id;
  updateControl.organizationId = organizationId;

  const result = await sequelize.query(query, {
    replacements: updateControl,
    mapToModel: true,
    model: ControlModel,
    // type: QueryTypes.UPDATE,
    transaction,
  });
  return result[0];
};

export const deleteControlByIdQuery = async (
  id: number,
  organizationId: number,
  transaction: Transaction
): Promise<Boolean> => {
  const result = await sequelize.query(
    `DELETE FROM controls WHERE organization_id = :organizationId AND id = :id RETURNING *`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: ControlModel,
      type: QueryTypes.DELETE,
      transaction,
    }
  );
  return result.length > 0;
};

export const createNewControlsQuery = async (
  controlCategoryId: number,
  controls: {
    order_no: number;
    title: string;
    description: string;
    implementation_details: string;
    subControls: {
      order_no: number;
      title: string;
      description: string;
      implementation_details: string;
      evidence_description?: string;
      feedback_description?: string;
    }[];
  }[],
  enable_ai_data_insertion: boolean,
  organizationId: number,
  transaction: Transaction
) => {
  const createdControls = [];
  let query = `INSERT INTO controls(
    organization_id, title, description, order_no, control_category_id,
    implementation_details, status
  ) VALUES (
    :organizationId, :title, :description, :order_no, :control_category_id,
    :implementation_details, :status
  ) RETURNING *;`;
  for (let controlStruct of controls) {
    const result = await sequelize.query(query, {
      replacements: {
        organizationId,
        title: controlStruct.title,
        description: controlStruct.description,
        order_no: controlStruct.order_no,
        control_category_id: controlCategoryId,
        implementation_details: enable_ai_data_insertion
          ? controlStruct.implementation_details
          : null,
        status: enable_ai_data_insertion ? "Waiting" : null,
      },
      mapToModel: true,
      model: ControlModel,
      // type: QueryTypes.INSERT
      transaction,
    });
    const control_id = result[0].id!;
    const subControls = await createNewSubControlsQuery(
      control_id,
      controlStruct.subControls,
      enable_ai_data_insertion,
      organizationId,
      transaction
    );
    createdControls.push({ ...result[0].dataValues, subControls });
  }
  return createdControls;
};
