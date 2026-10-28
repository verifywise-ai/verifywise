import { Request, Response } from "express";
import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { translateError } from "../utils/i18n.utils";

/**
 * Read path for model_lifecycle_change_history (issue #4977).
 *
 * The table has a bespoke schema (change_type + JSONB old/new snapshots keyed
 * by item_id and, for per-model value edits, model_inventory_id), so it cannot
 * be served through the generic getEntityChangeHistory reader. This controller
 * maps its rows onto the generic change-history entry shape the
 * HistorySidebar consumes: the lifecycle item name becomes the field name and
 * the JSONB snapshots are flattened to readable old/new values.
 */

interface LifecycleHistoryRow {
  id: number;
  item_id: number | null;
  change_type: string;
  changed_by: number | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
  user_name: string | null;
  user_surname: string | null;
  user_email: string | null;
  item_name: string | null;
}

/** Flatten a JSONB snapshot for display: prefer the plain text answer. */
function formatSnapshot(snapshot: Record<string, unknown> | null | undefined): string | undefined {
  if (!snapshot) return undefined;
  const { value_text, value_json } = snapshot as Record<string, unknown>;
  const parts: string[] = [];
  if (value_text !== undefined && value_text !== null && value_text !== "") {
    parts.push(String(value_text));
  }
  if (value_json !== undefined && value_json !== null) {
    parts.push(JSON.stringify(value_json));
  }
  if (parts.length > 0) return parts.join(" ");
  return Object.keys(snapshot).length > 0 ? JSON.stringify(snapshot) : undefined;
}

export async function getModelLifecycleChangeHistoryById(
  req: Request,
  res: Response,
): Promise<any> {
  const modelId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  // Validate model ID
  if (isNaN(modelId) || modelId <= 0) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid model ID")));
  }

  const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
  const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

  logStructured(
    "processing",
    `fetching change history for model lifecycle of model id: ${modelId} (limit: ${limit}, offset: ${offset})`,
    "getModelLifecycleChangeHistoryById",
    "modelLifecycleChangeHistory.ctrl.ts",
  );

  try {
    const countRows = (await sequelize.query(
      `SELECT COUNT(*)::int AS total
         FROM model_lifecycle_change_history
        WHERE organization_id = :organizationId AND model_inventory_id = :modelId;`,
      {
        replacements: { organizationId: req.organizationId!, modelId },
        type: QueryTypes.SELECT,
      },
    )) as Array<{ total: number }>;
    const total = countRows[0]?.total ?? 0;

    const rows = (await sequelize.query(
      `SELECT ch.id, ch.item_id, ch.change_type, ch.changed_by,
              ch.old_value, ch.new_value, ch.created_at,
              u.name AS user_name, u.surname AS user_surname, u.email AS user_email,
              i.name AS item_name
         FROM model_lifecycle_change_history ch
         LEFT JOIN users u ON u.id = ch.changed_by
         LEFT JOIN model_lifecycle_items i ON i.id = ch.item_id
        WHERE ch.organization_id = :organizationId AND ch.model_inventory_id = :modelId
        ORDER BY ch.created_at DESC, ch.id DESC
        LIMIT :limit OFFSET :offset;`,
      {
        replacements: { organizationId: req.organizationId!, modelId, limit, offset },
        type: QueryTypes.SELECT,
      },
    )) as LifecycleHistoryRow[];

    const data = rows.map((row) => ({
      id: row.id,
      action: row.change_type,
      field_name: row.item_name || (row.item_id ? `Lifecycle item #${row.item_id}` : "Lifecycle"),
      old_value: formatSnapshot(row.old_value),
      new_value: formatSnapshot(row.new_value),
      changed_by_user_id: row.changed_by,
      changed_at: row.created_at,
      user_name: row.user_name ?? undefined,
      user_surname: row.user_surname ?? undefined,
      user_email: row.user_email ?? undefined,
    }));

    logStructured(
      "successful",
      `change history retrieved for model id: ${modelId} (${data.length} entries, total: ${total})`,
      "getModelLifecycleChangeHistoryById",
      "modelLifecycleChangeHistory.ctrl.ts",
    );

    return res
      .status(200)
      .json(STATUS_CODE[200]({ data, hasMore: offset + data.length < total, total }));
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve change history",
      "getModelLifecycleChangeHistoryById",
      "modelLifecycleChangeHistory.ctrl.ts",
    );
    logger.error("Error in getModelLifecycleChangeHistoryById:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
