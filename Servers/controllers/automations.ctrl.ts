import { Request, Response } from "express";
import {
  createAutomationQuery,
  deleteAutomationByIdQuery,
  getAllAutomationActionsByTriggerIdQuery,
  getAllAutomationsQuery,
  getAllAutomationTriggersQuery,
  getAutomationByIdQuery,
  updateAutomationByIdQuery,
} from "../utils/automation.utils";
import { sequelize } from "../database/db";
import { ITenantAutomationAction } from "../domain.layer/interfaces/i.tenantAutomationAction";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  getAutomationExecutionLogs,
  getAutomationExecutionStats,
} from "../utils/automationExecutionLog.utils";

export const getAllAutomationTriggers = async (
  _req: Request,
  res: Response
) => {
  try {
    const result = await getAllAutomationTriggersQuery();
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    console.error("Error fetching automation triggers:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

export const getAllAutomationActionsByTriggerId = async (
  req: Request,
  res: Response
) => {
  const triggerId = parseInt(Array.isArray(req.params.triggerId) ? req.params.triggerId[0] : req.params.triggerId, 10);
  if (isNaN(triggerId)) {
    return res.status(400).json({ message: "Invalid trigger ID" });
  }

  try {
    const result = await getAllAutomationActionsByTriggerIdQuery(triggerId);
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    console.error(`Error fetching actions for trigger ID ${triggerId}:`, error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

export const getAllAutomations = async (req: Request, res: Response) => {
  try {
    const result = await getAllAutomationsQuery(req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    console.error("Error fetching automations:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

export const getAutomationById = async (req: Request, res: Response) => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  if (isNaN(id)) {
    return res.status(400).json({ message: "Invalid automation ID" });
  }

  try {
    const automation = await getAutomationByIdQuery(id, req.organizationId!);
    if (!automation) {
      return res
        .status(404)
        .json(STATUS_CODE[404]({ message: "Automation not found" }));
    }
    return res.status(200).json(STATUS_CODE[200](automation));
  } catch (error) {
    console.error(`Error fetching automation with ID ${id}:`, error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

export const createAutomation = async (req: Request, res: Response) => {
  const transaction = await sequelize.transaction();
  try {
    const triggerId = req.body.triggerId as number;
    const name = req.body.name as string;
    const actions = req.body.actions as Partial<ITenantAutomationAction>[];
    const params = JSON.parse(req.body.params || "{}") as Record<string, any>;

    if (
      !triggerId ||
      !name ||
      !Array.isArray(actions) ||
      actions.length === 0
    ) {
      await transaction.rollback();
      return res
        .status(400)
        .json(
          STATUS_CODE[400]({
            message: "Missing required fields: triggerId, name, actions",
          })
        );
    }

    // Fetch action types to validate send_email actions
    // const actionTypes = await getAllAutomationActionsByTriggerIdQuery(triggerId);

    // // Validate send_email actions have recipients
    // for (const action of actions) {
    //   const actionType = actionTypes.find((at: any) => at.id === action.action_type_id);
    //   if (actionType && actionType.key === 'send_email') {
    //     const actionParams = typeof action.params === 'string' ? JSON.parse(action.params) : action.params;
    //     const recipients = actionParams?.to;

    //     if (!Array.isArray(recipients) || recipients.length === 0) {
    //       await transaction.rollback();
    //       return res.status(400).json(STATUS_CODE[400]({
    //         message: "Send email action must have at least one recipient"
    //       }));
    //     }
    //   }
    // }

    const automation = await createAutomationQuery(
      { name, trigger_id: triggerId, params },
      actions,
      req.userId!,
      req.organizationId!,
      transaction
    );

    await transaction.commit();
    return res.status(201).json(STATUS_CODE[201](automation));
  } catch (error) {
    await transaction.rollback();
    console.error("Error creating automation:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

export const updateAutomation = async (req: Request, res: Response) => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (isNaN(id)) {
    return res
      .status(400)
      .json(STATUS_CODE[400]({ message: "Invalid automation ID" }));
  }

  const transaction = await sequelize.transaction();
  try {
    const actions = req.body.actions as Partial<ITenantAutomationAction>[];
    // const triggerId = req.body.triggerId;

    // // Validate send_email actions have recipients if actions are provided
    // if (actions && actions.length > 0 && triggerId) {
    //   // Fetch action types to validate send_email actions
    //   const actionTypes = await getAllAutomationActionsByTriggerIdQuery(triggerId);

    //   for (const action of actions) {
    //     const actionType = actionTypes.find((at: any) => at.id === action.action_type_id);
    //     if (actionType && actionType.key === 'send_email') {
    //       const actionParams = typeof action.params === 'string' ? JSON.parse(action.params) : action.params;
    //       const recipients = actionParams?.to;

    //       if (!Array.isArray(recipients) || recipients.length === 0) {
    //         await transaction.rollback();
    //         return res.status(400).json(STATUS_CODE[400]({
    //           message: "Send email action must have at least one recipient"
    //         }));
    //       }
    //     }
    //   }
    // }

    const automation = await updateAutomationByIdQuery(
      id,
      {
        name: req.body.name,
        is_active: req.body.is_active,
        trigger_id: req.body.triggerId,
        params: JSON.parse(req.body.params || "{}") as Record<string, any>,
      },
      actions,
      req.organizationId!,
      transaction
    );

    await transaction.commit();
    return res.status(200).json(STATUS_CODE[200](automation));
  } catch (error) {
    await transaction.rollback();
    console.error(`Error updating automation with ID ${id}:`, error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

export const deleteAutomationById = async (req: Request, res: Response) => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  if (isNaN(id)) {
    return res
      .status(400)
      .json(STATUS_CODE[400]({ message: "Invalid automation ID" }));
  }

  const transaction = await sequelize.transaction();
  try {
    const deleted = await deleteAutomationByIdQuery(
      id,
      req.organizationId!,
      transaction
    );
    if (!deleted) {
      await transaction.rollback();
      return res
        .status(404)
        .json(STATUS_CODE[404]({ message: "Automation not found" }));
    }
    await transaction.commit();
    return res
      .status(200)
      .json(STATUS_CODE[200]({ message: "Automation deleted successfully" }));
  } catch (error) {
    await transaction.rollback();
    console.error(`Error deleting automation with ID ${id}:`, error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

export const getAutomationHistory = async (req: Request, res: Response) => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  if (isNaN(id)) {
    return res
      .status(400)
      .json(STATUS_CODE[400]({ message: "Invalid automation ID" }));
  }

  try {
    const limit = parseInt(Array.isArray(req.query.limit) ? String(req.query.limit[0]) : String(req.query.limit || '50'), 10) || 50;
    const offset = parseInt(Array.isArray(req.query.offset) ? String(req.query.offset[0]) : String(req.query.offset || '0'), 10) || 0;

    const { logs, total } = await getAutomationExecutionLogs(
      id,
      limit,
      offset,
      req.organizationId!
    );

    // Map action_results to actions for frontend compatibility
    const mappedLogs = logs.map((log: any) => ({
      ...log,
      actions: log.action_results || [],
    }));

    return res.status(200).json(
      STATUS_CODE[200]({
        logs: mappedLogs,
        total,
        limit,
        offset,
      })
    );
  } catch (error) {
    console.error(`Error fetching automation history for ID ${id}:`, error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

export const getAutomationStats = async (req: Request, res: Response) => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  if (isNaN(id)) {
    return res
      .status(400)
      .json(STATUS_CODE[400]({ message: "Invalid automation ID" }));
  }

  try {
    const stats = await getAutomationExecutionStats(id, req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](stats));
  } catch (error) {
    console.error(`Error fetching automation stats for ID ${id}:`, error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};
