/**
 * Strict Zod schema for the `agent_update_task` AI write tool.
 *
 * Partial counterpart to `createTask/schema.ts`. Everything except
 * `task_id` is optional — callers set only the fields they're changing.
 * A `.refine()` rule rejects the "task_id only" no-op case.
 */

import { z } from "zod";
import { TaskPriorityEnum, TaskStatusEnum } from "../createTask/schema";

const isoDateString = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), {
    message: "must be a valid ISO date string (e.g. 2026-05-15)",
  });

export const AgentUpdateTaskSchema = z
  .object({
    task_id: z.number().int().positive(),
    title: z.string().min(1).max(255).optional(),
    description: z.string().max(256).optional(),
    priority: TaskPriorityEnum.optional(),
    status: TaskStatusEnum.optional(),
    due_date: isoDateString.optional(),
    assignees: z.array(z.number().int().positive()).min(1).max(50).optional(),
    categories: z.array(z.string().min(1).max(50)).max(10).optional(),
  })
  .strict()
  .refine(
    (data) => {
      const keys = Object.keys(data).filter((k) => k !== "task_id");
      return keys.length > 0;
    },
    {
      message: "At least one field besides task_id must be provided — nothing to update",
      path: [],
    },
  );

export type AgentUpdateTaskInput = z.infer<typeof AgentUpdateTaskSchema>;

export const AGENT_UPDATE_TASK_UPDATABLE_FIELDS = [
  { inputKey: "title", dbKey: "title" },
  { inputKey: "description", dbKey: "description" },
  { inputKey: "priority", dbKey: "priority" },
  { inputKey: "status", dbKey: "status" },
  { inputKey: "due_date", dbKey: "due_date" },
  { inputKey: "categories", dbKey: "categories" },
] as const;
