/**
 * Strict Zod schema for the `agent_create_task` AI write tool.
 *
 * Mirrors the validation rules of the UI's task creation modal
 * (`Clients/src/presentation/components/Modals/CreateTask/index.tsx`):
 * same required fields, same min/max length caps, same enum values.
 * Drift between this schema and the UI form means tasks created by the
 * AI advisor would behave differently from tasks created by hand, so
 * update both sides together when the form changes.
 *
 * `.strict()` rejects unknown keys — we want loud failures when the LLM
 * hallucinates a field that doesn't exist on the tasks table.
 */

import { z } from "zod";

/**
 * Task priority enum — matches `Servers/domain.layer/enums/task-priority.enum.ts`
 * and the UI form's priority dropdown.
 */
export const TaskPriorityEnum = z.enum(["Low", "Medium", "High"]);

/**
 * Task status enum — matches the three values the UI form's status
 * dropdown exposes. The backend enum has extra values ("Overdue",
 * "Deleted") but the UI never asks the user to pick those and the AI
 * should not either. "Overdue" is computed server-side from `due_date`,
 * and "Deleted" is set by the delete tool, not by create.
 */
export const TaskStatusEnum = z.enum(["Open", "In Progress", "Completed"]);

/**
 * ISO date string (YYYY-MM-DD or full ISO datetime). The form sends an
 * ISO string built from a dayjs picker. We accept both bare dates and
 * full datetimes so the LLM can pass either.
 */
const isoDateString = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), {
    message: "must be a valid ISO date string (e.g. 2026-05-15)",
  });

/**
 * Mirrors the UI's task form:
 *
 *   title        → required, 1..255 (UI: min 1, max 64; backend column: max 255
 *                                     — we use the backend cap because the
 *                                     64-char UI cap feels arbitrary and the
 *                                     LLM shouldn't be forced to truncate)
 *   description  → optional, 0..256 (matches the form's `checkStringValidation`)
 *   priority     → required, enum (UI defaults to "Medium")
 *   status       → required, enum (UI defaults to "Open")
 *   due_date     → required, ISO date; backend rejects past dates for OPEN
 *                  tasks, so the LLM should only send future dates for new
 *                  OPEN tasks
 *   assignees    → required, at least 1 user id (the UI form requires ≥1
 *                  assignee; the LLM resolves names via `list_users`)
 *   categories   → optional, up to 10 strings, each 1..50 chars (matches
 *                  backend validation)
 *
 * Note: `creator_id` and `organization_id` are NOT on the schema — the
 * UI form doesn't collect them either. They come from the authenticated
 * request context at execute time.
 */
export const AgentCreateTaskSchema = z
  .object({
    title: z.string().min(1).max(255),
    description: z.string().max(256).optional(),
    priority: TaskPriorityEnum,
    status: TaskStatusEnum,
    due_date: isoDateString,
    assignees: z.array(z.number().int().positive()).min(1).max(50),
    categories: z
      .array(z.string().min(1).max(50))
      .max(10)
      .optional(),
  })
  .strict();

export type AgentCreateTaskInput = z.infer<typeof AgentCreateTaskSchema>;
