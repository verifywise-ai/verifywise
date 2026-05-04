/**
 * Generic AI Action Executor.
 *
 * Runs the actual write operation that an approval request proposed, after
 * a human approves it. Dispatched from `processApprovalQuery` in
 * `utils/approvalRequest.utils.ts` when an `ai_action` approval reaches
 * the final approved state.
 *
 * Runs inside the same transaction as the approval state transition — if
 * the executor throws, the entire approval rolls back (the approver sees
 * an error and the request stays in its pre-approve state).
 *
 * All action-specific logic lives in the individual handlers under
 * `aiActions/<actionName>/`. This file is purely the dispatch + I/O
 * boundary: it loads `entity_data`, looks up the handler in the registry,
 * re-validates the stored input, calls the handler's `execute`, and
 * writes the result back to the approval row.
 *
 * Adding a new tool requires no changes here — register it in
 * `registry.ts` and it's picked up automatically.
 *
 * Post-commit side effects (logEvent, portfolio snapshot, assignment
 * notifications) are intentionally NOT run in slice 1. AI-created rows
 * are audit-linked via the approval_requests row and its entity_data;
 * the gap between that and the event_logs / change_history tables will
 * be closed in a later slice when we extend the post-approval pipeline.
 */

import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";
import { getAiActionHandler } from "./registry";

/**
 * Payload stored in `approval_requests.entity_data` for AI actions.
 * Created by the action's file() function and consumed here.
 */
export interface AiActionEntityData {
  tool_name: string;
  input_params: Record<string, unknown>;
  preview: string;
  requested_via?: string;
  result?: AiActionResult;
}

export type AiActionResult =
  | {
      status: "success";
      entity_id: number;
      executed_at: string;
    }
  | {
      status: "failed";
      phase: "pre_execute_validation" | "execute";
      error: string;
      executed_at: string;
    };

/**
 * Load an approval request's `entity_data` JSONB column, parsed as
 * `AiActionEntityData`. Returns null if the row is missing or the
 * column is empty.
 */
async function loadEntityData(
  requestId: number,
  organizationId: number,
  transaction: Transaction,
): Promise<AiActionEntityData | null> {
  const rows = (await sequelize.query(
    `SELECT entity_data FROM approval_requests
      WHERE organization_id = :organizationId AND id = :requestId`,
    {
      replacements: { organizationId, requestId },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as Array<{ entity_data: AiActionEntityData | string | null }>;

  if (rows.length === 0 || !rows[0].entity_data) {
    return null;
  }

  const raw = rows[0].entity_data;
  return typeof raw === "string" ? (JSON.parse(raw) as AiActionEntityData) : raw;
}

/**
 * Patch `entity_id` and `entity_data.result` onto the approval request
 * row after execution.
 */
async function writeExecutionResult(
  requestId: number,
  organizationId: number,
  entityId: number | null,
  mergedData: AiActionEntityData,
  transaction: Transaction,
): Promise<void> {
  await sequelize.query(
    `UPDATE approval_requests
        SET entity_id = :entityId,
            entity_data = CAST(:entityData AS JSONB),
            updated_at = NOW()
      WHERE organization_id = :organizationId AND id = :requestId`,
    {
      replacements: {
        organizationId,
        requestId,
        entityId,
        entityData: JSON.stringify(mergedData),
      },
      transaction,
    },
  );
}

/**
 * Look up the requester on the approval record. The requester is used as
 * the `changed_by` user for change history and — in actions that don't
 * expose an explicit owner field to the LLM — as the default owner of
 * any rows the execute function creates.
 */
async function getRequesterId(
  requestId: number,
  organizationId: number,
  transaction: Transaction,
): Promise<number | null> {
  const rows = (await sequelize.query(
    `SELECT requested_by FROM approval_requests
      WHERE organization_id = :organizationId AND id = :requestId`,
    {
      replacements: { organizationId, requestId },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as Array<{ requested_by: number }>;

  return rows[0]?.requested_by ?? null;
}

/**
 * Execute an approved AI action.
 *
 * @param requestId       — `approval_requests.id` that was just approved.
 * @param organizationId  — tenant scope.
 * @param transaction     — the transaction from processApprovalQuery.
 *                          Shared so the write and the approval state
 *                          change commit atomically.
 */
export async function executeAiAction(
  requestId: number,
  organizationId: number,
  transaction: Transaction,
): Promise<void> {
  const data = await loadEntityData(requestId, organizationId, transaction);
  if (!data) {
    throw new Error(
      `[aiActionExecutor] approval_requests.entity_data is missing for request ${requestId}`,
    );
  }

  logger.debug(`[aiActionExecutor] executing ${data.tool_name} for request ${requestId}`);

  // 1. Dispatch on tool_name via the registry. An unknown tool means
  //    either (a) the handler was removed without a migration path, or
  //    (b) the stored payload was tampered with. Either way, fail loud.
  const handler = getAiActionHandler(data.tool_name);
  if (!handler) {
    throw new Error(`[aiActionExecutor] unknown AI action tool: ${data.tool_name}`);
  }

  // 2. Re-validate the stored input at execute time. The LLM's input was
  //    validated when the approval was filed, but the schema may have
  //    evolved between then and now, or the stored data may have been
  //    tampered with. A strict re-parse is cheap insurance.
  const parsed = handler.schema.safeParse(data.input_params);
  if (!parsed.success) {
    const errorText = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    const merged: AiActionEntityData = {
      ...data,
      result: {
        status: "failed",
        phase: "pre_execute_validation",
        error: errorText,
        executed_at: new Date().toISOString(),
      },
    };
    await writeExecutionResult(requestId, organizationId, null, merged, transaction);
    throw new Error(`[aiActionExecutor] ${data.tool_name} input validation failed: ${errorText}`);
  }

  // 3. Look up the requester. Every action needs this; hoist it once.
  const requesterId = await getRequesterId(requestId, organizationId, transaction);
  if (requesterId == null) {
    throw new Error(
      `[aiActionExecutor] approval request ${requestId} not found while looking up requester`,
    );
  }

  // 4. Delegate to the handler's execute function. This is the only
  //    action-specific code path. Handlers return `{ entityId }` on
  //    success or throw on failure; a throw rolls back the surrounding
  //    transaction, which is exactly what we want since the approval
  //    shouldn't land if the write didn't.
  const executeResult = await handler.execute({
    requesterId,
    organizationId,
    transaction,
    inputParams: parsed.data,
    approvalRequestId: requestId,
  });

  // 5. Record the execution outcome on the approval row so the UI can
  //    surface it and so a later audit trail has a single place to look.
  const merged: AiActionEntityData = {
    ...data,
    result: {
      status: "success",
      entity_id: executeResult.entityId,
      executed_at: new Date().toISOString(),
    },
  };
  await writeExecutionResult(
    requestId,
    organizationId,
    executeResult.entityId,
    merged,
    transaction,
  );
}
