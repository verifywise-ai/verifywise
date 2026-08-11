/**
 * Phase 6 — Workflow registry.
 *
 * Central index of every workflow definition. Triggers and the controller
 * look up workflows by id from here.
 */

import { WorkflowDefinition } from "./types";

const WORKFLOWS: Record<string, WorkflowDefinition> = {};

/**
 * Register a workflow definition under its id. Re-registering the same id
 * overwrites the previous definition.
 */
function register(definition: WorkflowDefinition): void {
  WORKFLOWS[definition.id] = definition;
}

/**
 * Look up a registered workflow by its id.
 */
function getWorkflow(id: string): WorkflowDefinition | undefined {
  return WORKFLOWS[id];
}

/**
 * List every registered workflow definition.
 */
function listWorkflows(): WorkflowDefinition[] {
  return Object.values(WORKFLOWS);
}

/** Back-compat alias for callers that used the Phase 6 dist name. */
const listWorkflowDefinitions = listWorkflows;

export { register, getWorkflow, listWorkflows, listWorkflowDefinitions };
