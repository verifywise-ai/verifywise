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
import { translateError } from "../utils/i18n.utils";
import {
  getAutomationExecutionLogs,
  getAutomationExecutionStats,
} from "../utils/automationExecutionLog.utils";

/**
 * Normalize automation `params` from a JSON string or plain object.
 * Route validators usually sanitize to an object already; this is a
 * defensive fallback for direct controller calls and keeps invalid JSON
 * from throwing inside a DB transaction (which would surface as 500).
 */
function parseAutomationParams(raw: unknown): Record<string, unknown> {
  if (raw == null || raw === "") {
    return {};
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string") {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new SyntaxError("params must be a JSON object");
  }
  throw new SyntaxError("params must be a JSON string or object");
}

function paramsValidationError(message: string) {
  return STATUS_CODE[400]({
    errors: [{ field: "params", message, location: "body" }],
  });
}

export const getAllAutomationTriggers = async (_req: Request, res: Response) => {
  try {
    const result = await getAllAutomationTriggersQuery();
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    console.error("Error fetching automation triggers:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(_req, error)));
  }
};

export const getAllAutomationActionsByTriggerId = async (req: Request, res: Response) => {
  const triggerId = parseInt(
    Array.isArray(req.params.triggerId) ? req.params.triggerId[0] : req.params.triggerId,
    10,
  );
  if (isNaN(triggerId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid trigger ID")));
  }

  try {
    const result = await getAllAutomationActionsByTriggerIdQuery(triggerId);
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    console.error(`Error fetching actions for trigger ID ${triggerId}:`, error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
};

export const getAllAutomations = async (req: Request, res: Response) => {
  try {
    const result = await getAllAutomationsQuery(req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    console.error("Error fetching automations:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
};

export const getAutomationById = async (req: Request, res: Response) => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  if (isNaN(id)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid automation ID")));
  }

  try {
    const automation = await getAutomationByIdQuery(id, req.organizationId!);
    if (!automation) {
      return res.status(404).json(STATUS_CODE[404]({ message: req.t!("Automation not found") }));
    }
    return res.status(200).json(STATUS_CODE[200](automation));
  } catch (error) {
    console.error(`Error fetching automation with ID ${id}:`, error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
};

export const createAutomation = async (req: Request, res: Response) => {
  let params: Record<string, unknown>;
  try {
    params = parseAutomationParams(req.body.params);
  } catch {
    return res.status(400).json(paramsValidationError(req.t!("params must be valid JSON")));
  }

  const triggerId = req.body.triggerId as number;
  const name = req.body.name as string;
  const actions = req.body.actions as Partial<ITenantAutomationAction>[];

  const transaction = await sequelize.transaction();
  try {
    const automation = await createAutomationQuery(
      { name, trigger_id: triggerId, params },
      actions,
      req.userId!,
      req.organizationId!,
      transaction,
    );

    await transaction.commit();
    return res.status(201).json(STATUS_CODE[201](automation));
  } catch (error) {
    await transaction.rollback();
    console.error("Error creating automation:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
};

export const updateAutomation = async (req: Request, res: Response) => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json(STATUS_CODE[400]({ message: req.t!("Invalid automation ID") }));
  }

  let params: Record<string, unknown>;
  try {
    params = parseAutomationParams(req.body.params);
  } catch {
    return res.status(400).json(paramsValidationError(req.t!("params must be valid JSON")));
  }

  const transaction = await sequelize.transaction();
  try {
    const actions = req.body.actions as Partial<ITenantAutomationAction>[];

    const automation = await updateAutomationByIdQuery(
      id,
      {
        name: req.body.name,
        is_active: req.body.is_active,
        trigger_id: req.body.triggerId,
        params,
      },
      actions,
      req.organizationId!,
      transaction,
    );

    await transaction.commit();
    return res.status(200).json(STATUS_CODE[200](automation));
  } catch (error) {
    await transaction.rollback();
    console.error(`Error updating automation with ID ${id}:`, error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
};

export const deleteAutomationById = async (req: Request, res: Response) => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  if (isNaN(id)) {
    return res.status(400).json(STATUS_CODE[400]({ message: req.t!("Invalid automation ID") }));
  }

  const transaction = await sequelize.transaction();
  try {
    const deleted = await deleteAutomationByIdQuery(id, req.organizationId!, transaction);
    if (!deleted) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]({ message: req.t!("Automation not found") }));
    }
    await transaction.commit();
    return res
      .status(200)
      .json(STATUS_CODE[200]({ message: req.t!("Automation deleted successfully") }));
  } catch (error) {
    await transaction.rollback();
    console.error(`Error deleting automation with ID ${id}:`, error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
};

export const getAutomationHistory = async (req: Request, res: Response) => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  if (isNaN(id)) {
    return res.status(400).json(STATUS_CODE[400]({ message: req.t!("Invalid automation ID") }));
  }

  try {
    const limit =
      parseInt(
        Array.isArray(req.query.limit)
          ? String(req.query.limit[0])
          : String(req.query.limit || "50"),
        10,
      ) || 50;
    const offset =
      parseInt(
        Array.isArray(req.query.offset)
          ? String(req.query.offset[0])
          : String(req.query.offset || "0"),
        10,
      ) || 0;

    const { logs, total } = await getAutomationExecutionLogs(
      id,
      limit,
      offset,
      req.organizationId!,
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
      }),
    );
  } catch (error) {
    console.error(`Error fetching automation history for ID ${id}:`, error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
};

export const getAutomationStats = async (req: Request, res: Response) => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  if (isNaN(id)) {
    return res.status(400).json(STATUS_CODE[400]({ message: req.t!("Invalid automation ID") }));
  }

  try {
    const stats = await getAutomationExecutionStats(id, req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](stats));
  } catch (error) {
    console.error(`Error fetching automation stats for ID ${id}:`, error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
};
