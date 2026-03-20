import { Transaction } from "sequelize";
import { sequelize } from "../database/db"
import { ITenantAutomationAction } from "../domain.layer/interfaces/i.tenantAutomationAction";
import { AutomationModel } from "../domain.layer/models/automation/automation.model";
import { AutomationActionModel } from "../domain.layer/models/automationAction/automationAction.model";
import { AutomationTriggerModel } from "../domain.layer/models/automationTrigger/automationTrigger.model"
import { TenantAutomationActionModel } from "../domain.layer/models/tenantAutomationAction/tenantAutomationAction.model";
import { IAutomation } from "../domain.layer/interfaces/i.automation";

export const getAllAutomationTriggersQuery = async () => {
  const result = await sequelize.query(
    `SELECT * FROM automation_triggers`,
    {
      mapToModel: true,
      model: AutomationTriggerModel
    }
  )
  return result;
}

export const getAllAutomationActionsByTriggerIdQuery = async (triggerId: number) => {
  const result = await sequelize.query(
    `SELECT aa.*
     FROM automation_triggers_actions ata
     JOIN automation_actions aa ON ata.action_id = aa.id
     WHERE ata.trigger_id = :triggerId
     ORDER BY ata.action_id`,
    {
      replacements: { triggerId },
      mapToModel: true,
      model: AutomationActionModel
    }
  )
  return result;
}

export const getAllAutomationsQuery = async (organizationId: number) => {
  const result = await sequelize.query(
    `SELECT * FROM automations WHERE organization_id = :organizationId ORDER BY created_at DESC, id DESC;`,
    {
      replacements: { organizationId },
      mapToModel: true,
      model: AutomationModel
    }
  )
  return result;
}

export const getAutomationByIdQuery = async (id: number, organizationId: number) => {
  const automations = await sequelize.query(
    `SELECT * FROM automations WHERE organization_id = :organizationId AND id = :id;`,
    {
      replacements: { organizationId, id },
    }
  ) as [AutomationModel[], number]
  const automation = automations[0][0] as unknown as (ITenantAutomationAction & { actions: ITenantAutomationAction[] });
  automation.actions = [];
  if (automations[0].length > 0) {
    const actions = await sequelize.query(
      `SELECT * FROM automation_actions_data WHERE organization_id = :organizationId AND automation_id = :id ORDER BY "order";`,
      {
        replacements: { organizationId, id },
      }
    ) as [TenantAutomationActionModel[], number];
    automation["actions"] = actions[0];
  }
  return automation;
}

export const createAutomationQuery = async (
  automationMeta: Partial<IAutomation>,
  actions: Partial<ITenantAutomationAction>[],
  userId: number,
  organizationId: number,
  transaction: Transaction
) => {
  const _automation = await sequelize.query(
    `INSERT INTO automations(
      organization_id, name, trigger_id, params, created_by) VALUES (
      :organizationId, :name, :trigger_id, :params, :userId) RETURNING *;`,
    {
      replacements: { organizationId, ...automationMeta, params: JSON.stringify(automationMeta.params), userId }, transaction
    }
  ) as [ITenantAutomationAction[], number];
  const automation = _automation[0][0] as unknown as (ITenantAutomationAction & { actions: ITenantAutomationAction[] });

  // add some validations for action params
  await Promise.all(actions.map((action, index) => {
    return sequelize.query(
      `INSERT INTO automation_actions_data(
        organization_id, automation_id, action_type_id, params, "order") VALUES (
        :organizationId, :automationId, :actionTypeId, :params, :order);`,
      {
        replacements: {
          organizationId,
          automationId: automation.id,
          actionTypeId: action.action_type_id,
          params: action.params ? JSON.stringify(action.params) : null,
          order: index + 1
        }, transaction
      }
    )
  }))

  const _actions = await sequelize.query(
    `SELECT * FROM automation_actions_data WHERE organization_id = :organizationId AND automation_id = :id ORDER BY "order";`,
    {
      replacements: { organizationId, id: automation.id }, transaction
    }
  ) as [TenantAutomationActionModel[], number];
  automation["actions"] = _actions[0];

  return automation;
}

export const updateAutomationByIdQuery = async (
  id: number,
  currentAutomation: Partial<IAutomation>,
  actions: Partial<ITenantAutomationAction>[],
  organizationId: number,
  transaction: Transaction
) => {
  let automation = null;
  const updatedAutomation: Partial<IAutomation> = {};
  const setClause = [
    "name",
    "trigger_id",
    "params",
    "is_active"
  ].filter((field) => {
    if (field === "is_active" && currentAutomation[field as keyof IAutomation] !== undefined) {
      (updatedAutomation as any)[field] = currentAutomation[field as keyof IAutomation];
      return true;
    }
    if (field === "params" && currentAutomation[field as keyof IAutomation] !== undefined) {
      (updatedAutomation as any)[field] = JSON.stringify(currentAutomation[field as keyof IAutomation]);
      return true;
    }
    if (currentAutomation[field as keyof IAutomation] !== undefined && currentAutomation[field as keyof IAutomation]) {
      (updatedAutomation as any)[field] = currentAutomation[field as keyof IAutomation];
      return true;
    }
    return false;
  }).map((field) => `${field} = :${field}`).join(", ");

  if (!setClause) {
    const result = await sequelize.query(
      `SELECT * FROM automations WHERE organization_id = :organizationId AND id = :id;`,
      {
        replacements: { organizationId, id }, transaction
      }
    ) as [ITenantAutomationAction[], number];
    automation = result[0][0] as unknown as (ITenantAutomationAction & { actions: ITenantAutomationAction[] });
  } else {
    updatedAutomation.id = id;
    (updatedAutomation as any).organizationId = organizationId;
    const query = `UPDATE automations SET ${setClause} WHERE organization_id = :organizationId AND id = :id RETURNING *;`;
    const result = await sequelize.query(query, { replacements: updatedAutomation, transaction }) as [ITenantAutomationAction[], number];
    automation = result[0][0] as unknown as (ITenantAutomationAction & { actions: ITenantAutomationAction[] });
  }

  if (actions && actions.length > 0) {
    await sequelize.query(
      `DELETE FROM automation_actions_data WHERE organization_id = :organizationId AND automation_id = :id;`,
      {
        replacements: { organizationId, id }, transaction
      }
    );

    await Promise.all((actions || []).map((action, index) => {
      return sequelize.query(
        `INSERT INTO automation_actions_data(
        organization_id, automation_id, action_type_id, params, "order") VALUES (
        :organizationId, :automationId, :actionTypeId, :params, :order);`,
        {
          replacements: {
            organizationId,
            automationId: id,
            actionTypeId: action.action_type_id,
            params: action.params ? JSON.stringify(action.params) : null,
            order: index + 1
          }, transaction
        }
      )
    }))
  }

  const _actions = await sequelize.query(
    `SELECT * FROM automation_actions_data WHERE organization_id = :organizationId AND automation_id = :id ORDER BY "order";`,
    {
      replacements: { organizationId, id }, transaction
    }
  ) as [TenantAutomationActionModel[], number];
  automation["actions"] = _actions[0];

  return automation;
}

export const deleteAutomationByIdQuery = async (id: number, organizationId: number, transaction: Transaction) => {
  await sequelize.query(
    `DELETE FROM automation_actions_data WHERE organization_id = :organizationId AND automation_id = :id;`,
    {
      replacements: { organizationId, id }, transaction
    }
  );
  const result = await sequelize.query(
    `DELETE FROM automations WHERE organization_id = :organizationId AND id = :id;`,
    {
      replacements: { organizationId, id }, transaction
    }
  );
  return result.length > 0;
}
