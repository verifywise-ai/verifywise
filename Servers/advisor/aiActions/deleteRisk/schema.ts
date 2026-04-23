/**
 * Strict Zod schema for the `agent_delete_risk` AI write tool.
 *
 * Delete is intentionally narrow: it takes a `risk_id` and an optional
 * `reason` for audit context. No other fields — the deletion itself is
 * binary.
 *
 * The underlying query (`deleteRiskByIdQuery`) is a SOFT delete —
 * `is_deleted = true, deleted_at = NOW()` on the row. Nothing is
 * physically removed. The Phase 2 rule engine will eventually let
 * Admins auto-approve soft deletes but require extra confirmation for
 * hard deletes (which we don't expose to the AI at all).
 */

import { z } from "zod";

export const AgentDeleteRiskSchema = z
  .object({
    risk_id: z.number().int().positive(),
    reason: z.string().min(1).max(512).optional(),
  })
  .strict();

export type AgentDeleteRiskInput = z.infer<typeof AgentDeleteRiskSchema>;
