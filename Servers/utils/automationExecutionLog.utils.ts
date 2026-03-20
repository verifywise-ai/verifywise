import { sequelize } from "../database/db";
import { IAutomationExecutionLog } from "../domain.layer/interfaces/i.automationExecutionLog";
import { IActionExecutionResult } from "../domain.layer/models/automationExecutionLog/automationExecutionLog.model";

/**
 * Create a new automation execution log
 */
export async function createAutomationExecutionLog(
  automation_id: number,
  trigger_data: object = {},
  action_results: IActionExecutionResult[] = [],
  status: "success" | "partial_success" | "failure" = "success",
  organizationId: number,
  error_message?: string,
  execution_time_ms?: number
): Promise<IAutomationExecutionLog> {
  const result = (await sequelize.query(
    `INSERT INTO automation_execution_logs (organization_id, automation_id, trigger_data, action_results, status, error_message, execution_time_ms, triggered_at, created_at) VALUES (:organizationId, :automation_id, :trigger_data, :action_results, :status, :error_message, :execution_time_ms, NOW(), NOW()) RETURNING *`,
    {
      replacements: {
        organizationId,
        automation_id,
        trigger_data: JSON.stringify(trigger_data),
        action_results: JSON.stringify(action_results),
        status,
        error_message: error_message || null,
        execution_time_ms: execution_time_ms || null,
      },
    }
  )) as [IAutomationExecutionLog[], number];
  return result[0][0];
}

/**
 * Get automation execution logs by automation ID
 */
export async function getAutomationExecutionLogs(
  automation_id: number,
  limit: number = 50,
  offset: number = 0,
  organizationId: number
): Promise<{ logs: IAutomationExecutionLog[]; total: number }> {
  const result = (await sequelize.query(
    `SELECT *, COUNT(*) OVER() as total_count
     FROM automation_execution_logs
     WHERE organization_id = :organizationId AND automation_id = :automation_id
     ORDER BY triggered_at DESC
     LIMIT :limit OFFSET :offset`,
    {
      replacements: { organizationId, automation_id, limit, offset },
    }
  )) as [IAutomationExecutionLog[], number];

  const total = result.length > 0 ? (result[0] as any).total_count : 0;
  return { logs: result[0], total: parseInt(total) };
}

/**
 * Get execution statistics for an automation
 */
export async function getAutomationExecutionStats(
  automation_id: number,
  organizationId: number
): Promise<{
  total_executions: number;
  successful_executions: number;
  failed_executions: number;
  last_execution_at?: Date;
}> {
  const result = (await sequelize.query(
    `SELECT
      COUNT(*) AS total_executions,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successful_executions,
      SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) AS failed_executions,
      MAX(triggered_at) AS last_execution_at
    FROM automation_execution_logs
    WHERE organization_id = :organizationId AND automation_id = :automation_id`,
    {
      replacements: { organizationId, automation_id },
    }
  )) as [
    {
      total_executions: number;
      successful_executions: number;
      failed_executions: number;
      last_execution_at: Date;
    }[],
    number,
  ];
  return result[0][0];
}

/**
 * Log automation execution with actions
 * This is a helper function that wraps the entire automation execution logging
 */
export async function logAutomationExecution(
  automation_id: number,
  trigger_data: object,
  actionResults: Array<{
    action_id?: number;
    action_type: string;
    status: "success" | "failure";
    result_data?: object;
    error_message?: string;
  }>,
  organizationId: number,
  startTime?: number
): Promise<IAutomationExecutionLog> {
  // Determine overall status
  const hasFailure = actionResults.some((r) => r.status === "failure");
  const hasSuccess = actionResults.some((r) => r.status === "success");
  let status: "success" | "partial_success" | "failure";

  if (!hasFailure) {
    status = "success";
  } else if (hasSuccess) {
    status = "partial_success";
  } else {
    status = "failure";
  }

  // Calculate execution time if startTime provided
  const execution_time_ms = startTime ? Date.now() - startTime : undefined;

  // Add executed_at timestamp to each action result
  const timestampedActionResults: IActionExecutionResult[] = actionResults.map(
    (ar) => ({
      ...ar,
      executed_at: new Date(),
    })
  );

  // Create the execution log with all data
  return await createAutomationExecutionLog(
    automation_id,
    trigger_data,
    timestampedActionResults,
    status,
    organizationId,
    hasFailure ? "One or more actions failed" : undefined,
    execution_time_ms
  );
}

/**
 * Get all execution logs for all automations with pagination
 */
export async function getAllAutomationExecutionLogs(
  organizationId: number,
  limit: number = 50,
  offset: number = 0
): Promise<{ logs: IAutomationExecutionLog[]; total: number }> {
  const result = (await sequelize.query(
    `SELECT
      ael.*,
      a.name as automation_name,
      COUNT(*) OVER() as total_count
    FROM automation_execution_logs ael
    INNER JOIN automations a ON ael.automation_id = a.id AND a.organization_id = :organizationId
    WHERE ael.organization_id = :organizationId
    ORDER BY ael.triggered_at DESC
    LIMIT :limit OFFSET :offset`,
    {
      replacements: { organizationId, limit, offset },
    }
  )) as [IAutomationExecutionLog[], number];

  const total = result.length > 0 ? (result[0] as any).total_count : 0;
  return { logs: result[0], total: parseInt(total) };
}
