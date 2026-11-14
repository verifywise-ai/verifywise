/**
 * Post-approval executor for `agent_delete_risk`.
 *
 * Delegates to `archiveRiskQuery`, the console's archive: the soft-delete
 * UPDATE (`is_deleted = true, deleted_at = NOW()`), the change-history
 * entry and the risk's policy unlinks, all inside the approve transaction. If the row is already deleted or doesn't exist, the
 * underlying query returns without an affected row and we surface an
 * error — the approval rolls back.
 */

import { archiveRiskQuery } from "../../../utils/risk.utils";
import type { AiActionExecuteContext, AiActionExecuteResult } from "../types";
import type { AgentDeleteRiskInput } from "./schema";

export async function executeDeleteRisk(
  ctx: AiActionExecuteContext<AgentDeleteRiskInput>,
): Promise<AiActionExecuteResult> {
  const input = ctx.inputParams;

  const success = await archiveRiskQuery(
    input.risk_id,
    ctx.organizationId,
    ctx.requesterId,
    ctx.transaction,
  );

  if (!success) {
    throw new Error(
      `Risk #${input.risk_id} could not be deleted — it may already be deleted or no longer exists in this organization.`,
    );
  }

  return { entityId: input.risk_id };
}
