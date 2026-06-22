/**
 * Strict Zod schema for `agent_delete_task`.
 * Soft delete — sets status to "Deleted".
 */

import { z } from "zod";

export const AgentDeleteTaskSchema = z
  .object({
    task_id: z.number().int().positive(),
    reason: z.string().min(1).max(512).optional(),
  })
  .strict();

export type AgentDeleteTaskInput = z.infer<typeof AgentDeleteTaskSchema>;
