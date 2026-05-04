/**
 * Post-approval executor for `agent_delete_risk`.
 *
 * Delegates to `deleteRiskByIdQuery` which runs the soft-delete UPDATE
 * (`is_deleted = true, deleted_at = NOW()`) inside the approve
 * transaction. If the row is already deleted or doesn't exist, the
 * underlying query returns without an affected row and we surface an
 * error — the approval rolls back.
 */

import { deleteRiskByIdQuery } from "../../../utils/risk.utils";
import type { AiActionExecuteContext, AiActionExecuteResult } from "../types";
import type { AgentDeleteRiskInput } from "./schema";

export async function executeDeleteRisk(
  ctx: AiActionExecuteContext<AgentDeleteRiskInput>,
): Promise<AiActionExecuteResult> {
  const input = ctx.inputParams;

  const success = await deleteRiskByIdQuery(input.risk_id, ctx.organizationId, ctx.transaction);

  if (!success) {
    throw new Error(
      `Risk #${input.risk_id} could not be deleted — it may already be deleted or no longer exists in this organization.`,
    );
  }

  return { entityId: input.risk_id };
}
