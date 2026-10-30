import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import { getModelLifecycleHistory } from "../extensions/model-lifecycle/modelLifecycle.service";

/**
 * Read path for model_lifecycle_change_history (issue #4977).
 *
 * The table has a bespoke schema (change_type + JSONB old/new snapshots keyed
 * by item_id and, for per-model changes, model_inventory_id), so it cannot be
 * served through the generic getEntityChangeHistory reader. The model
 * lifecycle service maps its rows onto the generic entry shape the
 * HistorySidebar consumes.
 */
export async function getModelLifecycleChangeHistoryById(
  req: Request,
  res: Response,
): Promise<any> {
  const modelId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  // Validate model ID
  if (isNaN(modelId) || modelId <= 0) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid model ID")));
  }

  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 500);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

  logProcessing({
    description: `fetching change history for model lifecycle of model id: ${modelId} (limit: ${limit}, offset: ${offset})`,
    functionName: "getModelLifecycleChangeHistoryById",
    fileName: "modelLifecycleChangeHistory.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const result = await getModelLifecycleHistory(req.organizationId!, modelId, limit, offset);

    await logSuccess({
      eventType: "Read",
      description: `change history retrieved for model id: ${modelId} (${result.data.length} entries, total: ${result.total})`,
      functionName: "getModelLifecycleChangeHistoryById",
      fileName: "modelLifecycleChangeHistory.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "failed to retrieve change history",
      functionName: "getModelLifecycleChangeHistoryById",
      fileName: "modelLifecycleChangeHistory.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](req.t!("Failed to retrieve change history")));
  }
}
