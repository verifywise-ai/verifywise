/**
 * Strict Zod schema for the `agent_register_model` AI write tool.
 *
 * Mirrors the validation shape of the model_inventories table. Field
 * naming intentionally matches the legacy LLM-facing tool input
 * (`name`, `model_type`, `version`, `description`, `project_id`) so the
 * cutover from the old createWriteToolFn version doesn't break any
 * existing prompt/example flows.
 *
 * Mapping to the DB columns is done in `execute.ts`:
 *   name        → model
 *   model_type  → provider
 *   version     → version
 *   description → capabilities
 *   project_id  → row in model_inventories_projects_frameworks
 *
 * `.strict()` rejects unknown keys so we get loud failures when the LLM
 * hallucinates a field that doesn't exist on the table.
 */

import { z } from "zod";

export const AgentRegisterModelSchema = z
  .object({
    name: z.string().min(1).max(255),
    model_type: z.string().min(1).max(255).optional(),
    version: z.string().max(100).optional(),
    description: z.string().max(2000).optional(),
    project_id: z.number().int().positive().optional(),
  })
  .strict();

export type AgentRegisterModelInput = z.infer<typeof AgentRegisterModelSchema>;
