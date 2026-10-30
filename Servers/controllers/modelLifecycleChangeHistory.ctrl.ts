import { getModelLifecycleHistory } from "../extensions/model-lifecycle/modelLifecycle.service";
import { createChangeHistoryHandler } from "./changeHistoryHandler";

/**
 * Read path for model_lifecycle_change_history (issue #4977).
 *
 * The table has a bespoke schema (change_type + JSONB old/new snapshots keyed
 * by item_id and, for per-model changes, model_inventory_id), so it cannot be
 * served through the generic getEntityChangeHistory reader. The model
 * lifecycle service maps its rows onto the generic entry shape the
 * HistorySidebar consumes.
 */
export const getModelLifecycleChangeHistoryById = createChangeHistoryHandler({
  subject: "model lifecycle",
  invalidIdMessage: "Invalid model ID",
  functionName: "getModelLifecycleChangeHistoryById",
  fileName: "modelLifecycleChangeHistory.ctrl.ts",
  fetchHistory: getModelLifecycleHistory,
});
