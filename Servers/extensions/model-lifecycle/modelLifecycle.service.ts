import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { appendToAuditLedger } from "../../utils/auditLedger.utils";
import { GENERIC_FORMATTERS } from "../../config/changeHistory.config";

/**
 * DB helpers for the model-lifecycle extension.
 *
 * Every function is scoped to a single organization. The seven backing
 * tables (model_lifecycle_phases / _items / _values / _item_files /
 * _item_people / _item_approvals / _change_history) are declared in the
 * extensions migration.
 *
 * Note on files: the extension never deletes a `files` row. An attached file
 * may be evidence or a policy document that other records point to, so
 * detaching it (`detachFile`) or deleting its phase/item only removes the
 * item_files link (phase/item delete via ON DELETE CASCADE through
 * model_lifecycle_values). The file stays in the File Manager, which owns
 * deleting it.
 */

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

export async function listPhases(organizationId: number, includeInactive: boolean): Promise<any[]> {
  const activeFilter = includeInactive ? "" : "AND is_active = TRUE";
  const phases = (await sequelize.query(
    `SELECT id, name, description, display_order, is_active, created_at, updated_at
       FROM model_lifecycle_phases
      WHERE organization_id = :organizationId ${activeFilter}
      ORDER BY display_order ASC;`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as any[];

  for (const phase of phases) {
    const itemFilter = includeInactive ? "" : "AND is_active = TRUE";
    phase.items = await sequelize.query(
      `SELECT id, phase_id, name, description, item_type, is_required,
              display_order, config, is_active, created_at, updated_at
         FROM model_lifecycle_items
        WHERE organization_id = :organizationId AND phase_id = :phaseId ${itemFilter}
        ORDER BY display_order ASC;`,
      {
        replacements: { organizationId, phaseId: phase.id },
        type: QueryTypes.SELECT,
      },
    );
  }
  return phases;
}

export async function createPhase(
  organizationId: number,
  input: { name: string; description?: string; display_order?: number },
): Promise<any> {
  let displayOrder = input.display_order;
  if (displayOrder === undefined) {
    const rows = (await sequelize.query(
      `SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order
         FROM model_lifecycle_phases
        WHERE organization_id = :organizationId;`,
      { replacements: { organizationId }, type: QueryTypes.SELECT },
    )) as Array<{ next_order: number }>;
    displayOrder = rows[0]?.next_order ?? 1;
  }
  const rows = (await sequelize.query(
    `INSERT INTO model_lifecycle_phases (organization_id, name, description, display_order)
     VALUES (:organizationId, :name, :description, :displayOrder)
     RETURNING *;`,
    {
      replacements: {
        organizationId,
        name: input.name,
        description: input.description ?? null,
        displayOrder,
      },
      type: QueryTypes.INSERT,
    },
  )) as unknown as [any[], number];
  return (rows[0] as any)[0];
}

export async function updatePhase(
  organizationId: number,
  phaseId: number,
  patch: Partial<{
    name: string;
    description: string;
    display_order: number;
    is_active: boolean;
  }>,
): Promise<any | null> {
  const set: string[] = [];
  const replacements: Record<string, unknown> = { organizationId, phaseId };
  if (patch.name !== undefined) {
    set.push("name = :name");
    replacements.name = patch.name;
  }
  if (patch.description !== undefined) {
    set.push("description = :description");
    replacements.description = patch.description;
  }
  if (patch.display_order !== undefined) {
    set.push("display_order = :displayOrder");
    replacements.displayOrder = patch.display_order;
  }
  if (patch.is_active !== undefined) {
    set.push("is_active = :isActive");
    replacements.isActive = patch.is_active;
  }
  if (set.length === 0) return null;
  set.push("updated_at = NOW()");

  const rows = (await sequelize.query(
    `UPDATE model_lifecycle_phases SET ${set.join(", ")}
      WHERE organization_id = :organizationId AND id = :phaseId
      RETURNING *;`,
    { replacements, type: QueryTypes.UPDATE },
  )) as unknown as [any[], number];
  return (rows[0] as any)?.[0] ?? null;
}

export async function deletePhase(organizationId: number, phaseId: number): Promise<void> {
  await sequelize.query(
    `DELETE FROM model_lifecycle_phases
      WHERE organization_id = :organizationId AND id = :phaseId;`,
    { replacements: { organizationId, phaseId } },
  );
}

export async function reorderPhases(organizationId: number, orderedIds: number[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await sequelize.query(
      `UPDATE model_lifecycle_phases
          SET display_order = :order, updated_at = NOW()
        WHERE organization_id = :organizationId AND id = :id;`,
      { replacements: { organizationId, order: i + 1, id: orderedIds[i] } },
    );
  }
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export async function createItem(
  organizationId: number,
  phaseId: number,
  input: {
    name: string;
    description?: string;
    item_type?: string;
    is_required?: boolean;
    display_order?: number;
    config?: Record<string, unknown>;
  },
): Promise<any> {
  let displayOrder = input.display_order;
  if (displayOrder === undefined) {
    const rows = (await sequelize.query(
      `SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order
         FROM model_lifecycle_items
        WHERE organization_id = :organizationId AND phase_id = :phaseId;`,
      { replacements: { organizationId, phaseId }, type: QueryTypes.SELECT },
    )) as Array<{ next_order: number }>;
    displayOrder = rows[0]?.next_order ?? 1;
  }
  const rows = (await sequelize.query(
    `INSERT INTO model_lifecycle_items
       (organization_id, phase_id, name, description, item_type, is_required, display_order, config)
     VALUES
       (:organizationId, :phaseId, :name, :description, :itemType, :isRequired,
        :displayOrder, CAST(:config AS JSONB))
     RETURNING *;`,
    {
      replacements: {
        organizationId,
        phaseId,
        name: input.name,
        description: input.description ?? null,
        itemType: input.item_type ?? "text",
        isRequired: input.is_required ?? false,
        displayOrder,
        config: JSON.stringify(input.config ?? {}),
      },
      type: QueryTypes.INSERT,
    },
  )) as unknown as [any[], number];
  return (rows[0] as any)[0];
}

// ---------------------------------------------------------------------------
// Item change history (issue #4915)
// ---------------------------------------------------------------------------

// JSONB does not keep key order, so objects compare with sorted keys:
// otherwise re-saving an unchanged config or value records a change.
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value !== null && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value as Record<string, unknown>)
            .sort()
            .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
        )
      : value;
const normalize = (value: unknown): string | null =>
  value === undefined || value === null
    ? null
    : typeof value === "object"
      ? JSON.stringify(canonical(value))
      : String(value);

/**
 * Record one row in model_lifecycle_change_history. The table has a bespoke
 * schema (change_type + JSONB old/new snapshots), so it is written directly
 * rather than through the generic change-history writer.
 */
async function recordItemChange(
  organizationId: number,
  itemId: number,
  changeType: string,
  changedBy: number | null,
  oldValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null,
  modelInventoryId?: number | null,
): Promise<void> {
  // model_inventory_id is only set for per-model changes (value edits); the
  // column stays NULL for template item edits, as before.
  const modelColumn = modelInventoryId != null ? ", model_inventory_id" : "";
  const modelValue = modelInventoryId != null ? ", :modelInventoryId" : "";
  await sequelize.query(
    `INSERT INTO model_lifecycle_change_history
       (organization_id, item_id, change_type, changed_by, old_value, new_value${modelColumn})
     VALUES (:organizationId, :itemId, :changeType, :changedBy,
             CAST(:oldValue AS JSONB), CAST(:newValue AS JSONB)${modelValue});`,
    {
      replacements: {
        organizationId,
        itemId,
        changeType,
        changedBy,
        oldValue: oldValue ? JSON.stringify(oldValue) : null,
        newValue: newValue ? JSON.stringify(newValue) : null,
        modelInventoryId: modelInventoryId ?? null,
      },
    },
  );
}

export async function updateItem(
  organizationId: number,
  itemId: number,
  patch: Partial<{
    name: string;
    description: string;
    item_type: string;
    is_required: boolean;
    display_order: number;
    config: Record<string, unknown>;
    is_active: boolean;
  }>,
  changedBy: number | null = null,
): Promise<any | null> {
  const set: string[] = [];
  const replacements: Record<string, unknown> = { organizationId, itemId };
  if (patch.name !== undefined) {
    set.push("name = :name");
    replacements.name = patch.name;
  }
  if (patch.description !== undefined) {
    set.push("description = :description");
    replacements.description = patch.description;
  }
  if (patch.item_type !== undefined) {
    set.push("item_type = :itemType");
    replacements.itemType = patch.item_type;
  }
  if (patch.is_required !== undefined) {
    set.push("is_required = :isRequired");
    replacements.isRequired = patch.is_required;
  }
  if (patch.display_order !== undefined) {
    set.push("display_order = :displayOrder");
    replacements.displayOrder = patch.display_order;
  }
  if (patch.config !== undefined) {
    set.push("config = CAST(:config AS JSONB)");
    replacements.config = JSON.stringify(patch.config);
  }
  if (patch.is_active !== undefined) {
    set.push("is_active = :isActive");
    replacements.isActive = patch.is_active;
  }
  if (set.length === 0) return null;
  set.push("updated_at = NOW()");

  // Snapshot the patched fields for the change history before the update
  // replaces them (#4915).
  const beforeRows = (await sequelize.query(
    `SELECT name, description, item_type, is_required, display_order, config, is_active
       FROM model_lifecycle_items
      WHERE organization_id = :organizationId AND id = :itemId;`,
    { replacements: { organizationId, itemId }, type: QueryTypes.SELECT },
  )) as any[];
  const before = beforeRows[0] ?? null;

  const rows = (await sequelize.query(
    `UPDATE model_lifecycle_items SET ${set.join(", ")}
      WHERE organization_id = :organizationId AND id = :itemId
      RETURNING *;`,
    { replacements, type: QueryTypes.UPDATE },
  )) as unknown as [any[], number];
  const updated = (rows[0] as any)?.[0] ?? null;
  if (updated && before) {
    // Snapshot only the columns this function can actually write, normalized
    // for comparison (review: raw req.body keys recorded phantom "changes"
    // and mixed stringified/raw types). No row is written when nothing
    // differs.
    const TRACKED = [
      "name",
      "description",
      "item_type",
      "is_required",
      "display_order",
      "config",
      "is_active",
    ] as const;
    const oldSnapshot: Record<string, unknown> = {};
    const newSnapshot: Record<string, unknown> = {};
    for (const key of TRACKED) {
      if (!(key in patch)) continue;
      const oldValue = (before as Record<string, unknown>)[key];
      const newValue = (patch as Record<string, unknown>)[key];
      if (normalize(oldValue) === normalize(newValue)) continue;
      oldSnapshot[key] = oldValue ?? null;
      newSnapshot[key] = newValue ?? null;
    }

    if (Object.keys(newSnapshot).length > 0) {
      try {
        await recordItemChange(
          organizationId,
          itemId,
          "updated",
          changedBy,
          oldSnapshot,
          newSnapshot,
        );
        // Same tamper-evident trail the generic change-history writer keeps.
        appendToAuditLedger({
          organizationId,
          entryType: "change_history",
          userId: changedBy,
          entityType: "model_lifecycle_item",
          entityId: itemId,
          action: "updated",
          description: `Model lifecycle item ${itemId} updated (${Object.keys(newSnapshot).join(", ")})`,
        }).catch((error) => {
          console.error("Failed to append model lifecycle change to the audit ledger:", error);
        });
      } catch (error) {
        // History must never fail the edit.
        console.error("Failed to record model lifecycle item change:", error);
      }
    }
  }
  return updated;
}

export async function deleteItem(organizationId: number, itemId: number): Promise<void> {
  await sequelize.query(
    `DELETE FROM model_lifecycle_items
      WHERE organization_id = :organizationId AND id = :itemId;`,
    { replacements: { organizationId, itemId } },
  );
}

export async function reorderItems(
  organizationId: number,
  phaseId: number,
  orderedIds: number[],
): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await sequelize.query(
      `UPDATE model_lifecycle_items
          SET display_order = :order, updated_at = NOW()
        WHERE organization_id = :organizationId AND id = :id AND phase_id = :phaseId;`,
      { replacements: { organizationId, order: i + 1, id: orderedIds[i], phaseId } },
    );
  }
}

// ---------------------------------------------------------------------------
// Per-model reads
// ---------------------------------------------------------------------------

export async function getLifecycleForModel(
  organizationId: number,
  modelId: number,
): Promise<any[]> {
  const phases = (await sequelize.query(
    `SELECT id, name, description, display_order, is_active
       FROM model_lifecycle_phases
      WHERE organization_id = :organizationId AND is_active = TRUE
      ORDER BY display_order ASC;`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as any[];

  for (const phase of phases) {
    const items = (await sequelize.query(
      `SELECT id, phase_id, name, description, item_type, is_required,
              display_order, config, is_active
         FROM model_lifecycle_items
        WHERE organization_id = :organizationId AND phase_id = :phaseId AND is_active = TRUE
        ORDER BY display_order ASC;`,
      {
        replacements: { organizationId, phaseId: phase.id },
        type: QueryTypes.SELECT,
      },
    )) as any[];

    const values = (await sequelize.query(
      `SELECT v.id, v.model_inventory_id, v.item_id, v.value_text, v.value_json,
              v.updated_by, v.created_at, v.updated_at
         FROM model_lifecycle_values v
         JOIN model_lifecycle_items i ON v.item_id = i.id
        WHERE v.organization_id = :organizationId
          AND v.model_inventory_id = :modelId
          AND i.phase_id = :phaseId;`,
      {
        replacements: { organizationId, modelId, phaseId: phase.id },
        type: QueryTypes.SELECT,
      },
    )) as any[];

    const valueIds = values
      .map((v) => v.id)
      .filter((id): id is number => id !== null && id !== undefined);
    const filesByValue: Record<number, any[]> = {};
    const peopleByValue: Record<number, any[]> = {};
    const approvalsByValue: Record<number, any[]> = {};

    if (valueIds.length > 0) {
      const files = (await sequelize.query(
        `SELECT lf.id, lf.value_id, lf.file_id, lf.created_at,
                f.filename, f.type AS mimetype
           FROM model_lifecycle_item_files lf
           JOIN files f ON lf.file_id = f.id AND f.organization_id = lf.organization_id
          WHERE lf.organization_id = :organizationId AND lf.value_id IN (:valueIds);`,
        {
          replacements: { organizationId, valueIds },
          type: QueryTypes.SELECT,
        },
      )) as any[];
      for (const f of files) (filesByValue[f.value_id] ??= []).push(f);

      const people = (await sequelize.query(
        `SELECT lp.id, lp.value_id, lp.user_id, lp.created_at,
                u.name, u.surname, u.email
           FROM model_lifecycle_item_people lp
           JOIN users u ON lp.user_id = u.id
          WHERE lp.organization_id = :organizationId AND lp.value_id IN (:valueIds);`,
        {
          replacements: { organizationId, valueIds },
          type: QueryTypes.SELECT,
        },
      )) as any[];
      for (const p of people) (peopleByValue[p.value_id] ??= []).push(p);

      const approvals = (await sequelize.query(
        `SELECT la.id, la.value_id, la.user_id, la.status, la.decided_at, la.created_at,
                u.name, u.surname, u.email
           FROM model_lifecycle_item_approvals la
           JOIN users u ON la.user_id = u.id
          WHERE la.organization_id = :organizationId AND la.value_id IN (:valueIds);`,
        {
          replacements: { organizationId, valueIds },
          type: QueryTypes.SELECT,
        },
      )) as any[];
      for (const a of approvals) (approvalsByValue[a.value_id] ??= []).push(a);
    }

    const valueByItemId: Record<number, any> = {};
    for (const v of values) {
      v.files = filesByValue[v.id] ?? [];
      v.people = peopleByValue[v.id] ?? [];
      v.approvals = approvalsByValue[v.id] ?? [];
      valueByItemId[v.item_id] = v;
    }
    for (const item of items) item.value = valueByItemId[item.id] ?? null;
    phase.items = items;
  }
  return phases;
}

export async function getProgressForModel(organizationId: number, modelId: number): Promise<any> {
  const phaseProgress = (await sequelize.query(
    `SELECT
       p.id  AS phase_id,
       p.name AS phase_name,
       COUNT(i.id)::int AS total_items,
       COUNT(v.id)::int AS filled_items,
       COUNT(CASE WHEN i.is_required THEN 1 END)::int AS required_items,
       COUNT(CASE WHEN i.is_required AND v.id IS NOT NULL THEN 1 END)::int AS filled_required_items
     FROM model_lifecycle_phases p
     JOIN model_lifecycle_items i
       ON i.phase_id = p.id AND i.is_active = TRUE AND i.organization_id = :organizationId
     LEFT JOIN model_lifecycle_values v
       ON v.item_id = i.id
      AND v.model_inventory_id = :modelId
      AND v.organization_id = :organizationId
      AND (v.value_text IS NOT NULL OR v.value_json IS NOT NULL
        OR EXISTS (SELECT 1 FROM model_lifecycle_item_files    lf WHERE lf.value_id = v.id AND lf.organization_id = :organizationId)
        OR EXISTS (SELECT 1 FROM model_lifecycle_item_people   lp WHERE lp.value_id = v.id AND lp.organization_id = :organizationId)
        OR EXISTS (SELECT 1 FROM model_lifecycle_item_approvals la WHERE la.value_id = v.id AND la.organization_id = :organizationId))
    WHERE p.organization_id = :organizationId AND p.is_active = TRUE
    GROUP BY p.id, p.name, p.display_order
    ORDER BY p.display_order ASC;`,
    { replacements: { organizationId, modelId }, type: QueryTypes.SELECT },
  )) as Array<{
    phase_id: number;
    phase_name: string;
    total_items: number;
    filled_items: number;
    required_items: number;
    filled_required_items: number;
  }>;

  const totals = phaseProgress.reduce(
    (acc, p) => ({
      total_items: acc.total_items + p.total_items,
      filled_items: acc.filled_items + p.filled_items,
      total_required: acc.total_required + p.required_items,
      filled_required: acc.filled_required + p.filled_required_items,
    }),
    { total_items: 0, filled_items: 0, total_required: 0, filled_required: 0 },
  );

  return {
    phases: phaseProgress,
    ...totals,
    completion_percentage:
      totals.total_items > 0 ? Math.round((totals.filled_items / totals.total_items) * 100) : 0,
  };
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

export async function upsertValue(
  organizationId: number,
  modelId: number,
  itemId: number,
  userId: number,
  input: { value_text?: string | null; value_json?: unknown },
): Promise<any> {
  const { before, upserted } = await sequelize.transaction(async (transaction) => {
    // Make sure the row exists, then snapshot the current answer so the
    // change history can store before/after values (#4977). FOR UPDATE holds
    // the row until commit, so a concurrent save, even of a first answer,
    // waits instead of reading the same "before". A row created here is
    // empty, which counts as no answer below.
    await sequelize.query(
      `INSERT INTO model_lifecycle_values
         (organization_id, model_inventory_id, item_id, updated_by)
       VALUES (:organizationId, :modelId, :itemId, :userId)
       ON CONFLICT (organization_id, model_inventory_id, item_id) DO NOTHING;`,
      { replacements: { organizationId, modelId, itemId, userId }, transaction },
    );
    const beforeRows = (await sequelize.query(
      `SELECT value_text, value_json
         FROM model_lifecycle_values
        WHERE organization_id = :organizationId AND model_inventory_id = :modelId AND item_id = :itemId
          FOR UPDATE;`,
      { replacements: { organizationId, modelId, itemId }, type: QueryTypes.SELECT, transaction },
    )) as any[];

    const rows = (await sequelize.query(
      `INSERT INTO model_lifecycle_values
         (organization_id, model_inventory_id, item_id, value_text, value_json, updated_by)
       VALUES (:organizationId, :modelId, :itemId, :valueText,
               CASE WHEN :valueJson IS NULL THEN NULL ELSE CAST(:valueJson AS JSONB) END,
               :userId)
       ON CONFLICT (organization_id, model_inventory_id, item_id)
       DO UPDATE SET
         value_text = EXCLUDED.value_text,
         value_json = EXCLUDED.value_json,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING *;`,
      {
        replacements: {
          organizationId,
          modelId,
          itemId,
          userId,
          valueText: input.value_text ?? null,
          valueJson: input.value_json !== undefined ? JSON.stringify(input.value_json) : null,
        },
        type: QueryTypes.INSERT,
        transaction,
      },
    )) as unknown as [any[], number];
    return { before: beforeRows[0] ?? null, upserted: (rows[0] as any)[0] };
  });

  if (upserted) {
    const TRACKED = ["value_text", "value_json"] as const;
    // A row created empty by a file, person or approver action has no answer
    // yet, so the first real answer is recorded as created.
    const hadAnswer =
      !!before &&
      TRACKED.some((key) => normalize((before as Record<string, unknown>)[key]) !== null);
    const oldSnapshot: Record<string, unknown> = {};
    const newSnapshot: Record<string, unknown> = {};
    for (const key of TRACKED) {
      const oldValue = before ? (before as Record<string, unknown>)[key] : null;
      const newValue = (upserted as Record<string, unknown>)[key];
      if (normalize(oldValue) === normalize(newValue)) continue;
      oldSnapshot[key] = oldValue ?? null;
      newSnapshot[key] = newValue ?? null;
    }

    if (Object.keys(newSnapshot).length > 0) {
      await recordValueEvent(
        organizationId,
        modelId,
        itemId,
        userId ?? null,
        hadAnswer ? "updated" : "created",
        hadAnswer ? oldSnapshot : null,
        newSnapshot,
        Object.keys(newSnapshot).join(", "),
      );
    }
  }

  return upserted;
}

/** A user's display name, as every other history table shows it. */
const userLabel = (organizationId: number, userId: number): Promise<string> =>
  GENERIC_FORMATTERS.user(userId, { organizationId });

/**
 * File name of a file in the organization, or "File #id". A failed lookup
 * also falls back to the id: history must never fail the edit.
 */
async function fileLabel(organizationId: number, fileId: number): Promise<string> {
  try {
    const rows = (await sequelize.query(
      `SELECT filename FROM files WHERE id = :fileId AND organization_id = :organizationId;`,
      { replacements: { fileId, organizationId }, type: QueryTypes.SELECT },
    )) as Array<{ filename: string | null }>;
    return rows[0]?.filename || `File #${fileId}`;
  } catch {
    return `File #${fileId}`;
  }
}

/**
 * Record a per-model lifecycle event (answer edit, file, person or approval
 * change) in model_lifecycle_change_history and the audit ledger. History
 * must never fail the edit: any error is logged and swallowed.
 */
async function recordValueEvent(
  organizationId: number,
  modelId: number,
  itemId: number,
  changedBy: number | null,
  changeType: string,
  oldValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null,
  detail: string,
): Promise<void> {
  try {
    await recordItemChange(
      organizationId,
      itemId,
      changeType,
      changedBy,
      oldValue,
      newValue,
      modelId,
    );
    // Same tamper-evident trail the generic change-history writer keeps.
    appendToAuditLedger({
      organizationId,
      entryType: "change_history",
      userId: changedBy,
      entityType: "model_lifecycle_value",
      entityId: itemId,
      action: changeType,
      description: `Model lifecycle value for item ${itemId} ${changeType} (${detail})`,
    }).catch((error) => {
      console.error("Failed to append model lifecycle value change to the audit ledger:", error);
    });
  } catch (error) {
    console.error("Failed to record model lifecycle value change:", error);
  }
}

async function ensureValueRow(
  organizationId: number,
  modelId: number,
  itemId: number,
  userId: number,
): Promise<number> {
  await sequelize.query(
    `INSERT INTO model_lifecycle_values
       (organization_id, model_inventory_id, item_id, updated_by)
     VALUES (:organizationId, :modelId, :itemId, :userId)
     ON CONFLICT (organization_id, model_inventory_id, item_id) DO NOTHING;`,
    { replacements: { organizationId, modelId, itemId, userId } },
  );
  const rows = (await sequelize.query(
    `SELECT id FROM model_lifecycle_values
      WHERE organization_id = :organizationId AND model_inventory_id = :modelId AND item_id = :itemId;`,
    { replacements: { organizationId, modelId, itemId }, type: QueryTypes.SELECT },
  )) as Array<{ id: number }>;
  return rows[0].id;
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

/**
 * Link a file to a lifecycle item. Returns null when the file is not in the
 * caller's organization (the foreign key alone accepts any tenant's file), so
 * the caller can answer 404 without revealing whether the id exists.
 */
export async function attachFile(
  organizationId: number,
  modelId: number,
  itemId: number,
  userId: number,
  fileId: number,
): Promise<any | null> {
  const owned = (await sequelize.query(
    `SELECT 1 FROM files WHERE id = :fileId AND organization_id = :organizationId;`,
    { replacements: { fileId, organizationId }, type: QueryTypes.SELECT },
  )) as unknown[];
  if (owned.length === 0) return null;

  const valueId = await ensureValueRow(organizationId, modelId, itemId, userId);
  const rows = (await sequelize.query(
    `INSERT INTO model_lifecycle_item_files (organization_id, value_id, file_id)
     VALUES (:organizationId, :valueId, :fileId)
     ON CONFLICT (organization_id, value_id, file_id) DO NOTHING
     RETURNING *;`,
    {
      replacements: { organizationId, valueId, fileId },
      type: QueryTypes.INSERT,
    },
  )) as unknown as [any[], number];
  const linked = (rows[0] as any)?.[0];
  // Only a new link is history; ON CONFLICT DO NOTHING returns no row.
  if (linked) {
    const file = await fileLabel(organizationId, fileId);
    await recordValueEvent(
      organizationId,
      modelId,
      itemId,
      userId ?? null,
      "file_attached",
      null,
      {
        file,
      },
      "file",
    );
  }
  return linked ?? { value_id: valueId, file_id: fileId };
}

/**
 * Remove the link between a lifecycle item and a file. Returns false when the
 * item had no link to that file, so the caller can answer 404.
 *
 * The `files` row is deliberately left in place. Lifecycle uploads go through
 * the File Manager, so the file is listed there, and `attachFile` accepts any
 * file id in the organization: the file may be evidence or a policy document
 * that other records point to, some of them without a foreign key. Deleting
 * it belongs to the File Manager, which checks the caller's role and project
 * access and clears folder mappings.
 */
export async function detachFile(
  organizationId: number,
  modelId: number,
  itemId: number,
  fileId: number,
  actorId: number | null = null,
): Promise<boolean> {
  const rows = (await sequelize.query(
    `DELETE FROM model_lifecycle_item_files
      WHERE organization_id = :organizationId AND file_id = :fileId
        AND value_id = (
          SELECT id FROM model_lifecycle_values
           WHERE organization_id = :organizationId
             AND model_inventory_id = :modelId AND item_id = :itemId
        )
      RETURNING id;`,
    {
      replacements: { organizationId, fileId, modelId, itemId },
      type: QueryTypes.DELETE,
    },
  )) as unknown as Array<{ id: number }> | undefined;
  const detached = Array.isArray(rows) && rows.length > 0;
  if (detached) {
    const file = await fileLabel(organizationId, fileId);
    await recordValueEvent(
      organizationId,
      modelId,
      itemId,
      actorId,
      "file_removed",
      { file },
      null,
      "file",
    );
  }
  return detached;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export async function addPerson(
  organizationId: number,
  modelId: number,
  itemId: number,
  userId: number,
  personUserId: number,
): Promise<any> {
  const valueId = await ensureValueRow(organizationId, modelId, itemId, userId);
  const rows = (await sequelize.query(
    `INSERT INTO model_lifecycle_item_people (organization_id, value_id, user_id)
     VALUES (:organizationId, :valueId, :personUserId)
     ON CONFLICT (organization_id, value_id, user_id) DO NOTHING
     RETURNING *;`,
    {
      replacements: { organizationId, valueId, personUserId },
      type: QueryTypes.INSERT,
    },
  )) as unknown as [any[], number];
  const added = (rows[0] as any)?.[0];
  if (added) {
    const person = await userLabel(organizationId, personUserId);
    await recordValueEvent(
      organizationId,
      modelId,
      itemId,
      userId ?? null,
      "person_added",
      null,
      {
        person,
      },
      "person",
    );
  }
  return added ?? { value_id: valueId, user_id: personUserId };
}

export async function removePerson(
  organizationId: number,
  modelId: number,
  itemId: number,
  personUserId: number,
  actorId: number | null = null,
): Promise<void> {
  const rows = (await sequelize.query(
    `DELETE FROM model_lifecycle_item_people
      WHERE organization_id = :organizationId AND user_id = :personUserId
        AND value_id = (
          SELECT id FROM model_lifecycle_values
           WHERE organization_id = :organizationId
             AND model_inventory_id = :modelId AND item_id = :itemId
        )
      RETURNING id;`,
    {
      replacements: { organizationId, personUserId, modelId, itemId },
      type: QueryTypes.DELETE,
    },
  )) as unknown as Array<{ id: number }> | undefined;
  if (Array.isArray(rows) && rows.length > 0) {
    const person = await userLabel(organizationId, personUserId);
    await recordValueEvent(
      organizationId,
      modelId,
      itemId,
      actorId,
      "person_removed",
      { person },
      null,
      "person",
    );
  }
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export async function addApprover(
  organizationId: number,
  modelId: number,
  itemId: number,
  userId: number,
  approverUserId: number,
): Promise<any> {
  const valueId = await ensureValueRow(organizationId, modelId, itemId, userId);
  const rows = (await sequelize.query(
    `INSERT INTO model_lifecycle_item_approvals (organization_id, value_id, user_id, status)
     VALUES (:organizationId, :valueId, :approverUserId, 'pending')
     ON CONFLICT (organization_id, value_id, user_id) DO NOTHING
     RETURNING *;`,
    {
      replacements: { organizationId, valueId, approverUserId },
      type: QueryTypes.INSERT,
    },
  )) as unknown as [any[], number];
  const added = (rows[0] as any)?.[0];
  if (added) {
    const approver = await userLabel(organizationId, approverUserId);
    // The change-type constraint has no approver_added, so this is an update
    // whose snapshot names the approver.
    await recordValueEvent(
      organizationId,
      modelId,
      itemId,
      userId ?? null,
      "updated",
      null,
      { approver, status: "pending" },
      "approver",
    );
  }
  return added ?? { value_id: valueId, user_id: approverUserId, status: "pending" };
}

export async function removeApprover(
  organizationId: number,
  modelId: number,
  itemId: number,
  approverUserId: number,
  actorId: number | null = null,
): Promise<void> {
  const rows = (await sequelize.query(
    `DELETE FROM model_lifecycle_item_approvals
      WHERE organization_id = :organizationId AND user_id = :approverUserId
        AND value_id = (
          SELECT id FROM model_lifecycle_values
           WHERE organization_id = :organizationId
             AND model_inventory_id = :modelId AND item_id = :itemId
        )
      RETURNING status;`,
    {
      replacements: { organizationId, approverUserId, modelId, itemId },
      type: QueryTypes.DELETE,
    },
  )) as unknown as Array<{ status: string }> | undefined;
  if (Array.isArray(rows) && rows.length > 0) {
    const approver = await userLabel(organizationId, approverUserId);
    await recordValueEvent(
      organizationId,
      modelId,
      itemId,
      actorId,
      "updated",
      { approver, status: rows[0].status },
      null,
      "approver",
    );
  }
}

export type ApprovalStatus = "pending" | "approved" | "rejected";

export async function updateApprovalStatus(
  organizationId: number,
  modelId: number,
  itemId: number,
  approverUserId: number,
  status: ApprovalStatus,
  actorId: number | null = null,
): Promise<any | null> {
  // decided_at is NULL only when the reviewer walks the decision back to
  // "pending"; otherwise we stamp NOW(). The CTE locks the row and reads the
  // previous status in the same statement, for the change history.
  const decidedAtSql = status === "pending" ? "NULL" : "NOW()";
  const rows = (await sequelize.query(
    `WITH prev AS (
       SELECT a.id, a.status
         FROM model_lifecycle_item_approvals a
        WHERE a.organization_id = :organizationId AND a.user_id = :approverUserId
          AND a.value_id = (
            SELECT id FROM model_lifecycle_values
             WHERE organization_id = :organizationId
               AND model_inventory_id = :modelId AND item_id = :itemId
          )
          FOR UPDATE
     )
     UPDATE model_lifecycle_item_approvals a
        SET status = :status, decided_at = ${decidedAtSql}
       FROM prev
      WHERE a.id = prev.id
      RETURNING a.*, prev.status AS previous_status;`,
    {
      replacements: { organizationId, status, approverUserId, modelId, itemId },
      type: QueryTypes.UPDATE,
    },
  )) as unknown as [any[], number];
  const row = (rows[0] as any)?.[0];
  if (!row) return null;
  const { previous_status: previousStatus, ...updated } = row;
  if (previousStatus !== status) {
    const approver = await userLabel(organizationId, approverUserId);
    await recordValueEvent(
      organizationId,
      modelId,
      itemId,
      actorId,
      status === "pending" ? "updated" : status,
      { approver, status: previousStatus },
      { approver, status },
      "approval",
    );
  }
  return updated;
}

// ---------------------------------------------------------------------------
// Per-model change history (issue #4977)
// ---------------------------------------------------------------------------

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

const isBlank = (value: unknown): boolean => value === undefined || value === null || value === "";

/**
 * Flatten a JSONB snapshot for display: the answer text (and JSON value) for
 * an answer edit, or the file, person or approver (with the approval status)
 * for other events. A snapshot with nothing in it, such as a cleared answer,
 * returns undefined, which the sidebar shows as "-".
 */
export function formatLifecycleSnapshot(
  snapshot: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!snapshot) return undefined;
  const { value_text, value_json, file, person, approver, status } = snapshot;
  const parts: string[] = [];
  if (!isBlank(value_text)) parts.push(String(value_text));
  if (!isBlank(value_json)) parts.push(JSON.stringify(value_json));
  if (!isBlank(file)) parts.push(String(file));
  if (!isBlank(person)) parts.push(String(person));
  if (!isBlank(approver)) {
    parts.push(isBlank(status) ? String(approver) : `${approver} (${status})`);
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}

/** What a history row is about, shown after the item name. */
function lifecycleEventLabel(row: LifecycleHistoryRow): string | null {
  const snapshot = { ...(row.old_value ?? {}), ...(row.new_value ?? {}) };
  if ("file" in snapshot) return "File";
  if ("person" in snapshot) return "Person";
  if ("approver" in snapshot) return "Approval";
  return null;
}

/**
 * One page of a model's lifecycle history, newest first, mapped onto the
 * generic change-history entry shape the HistorySidebar reads. The table
 * keeps its own change types (file_attached, approved, ...); they are all
 * shown as updates, since none of them creates or deletes the model.
 */
export async function getModelLifecycleHistory(
  organizationId: number,
  modelId: number,
  limit: number,
  offset: number,
): Promise<{ data: any[]; hasMore: boolean; total: number }> {
  const countRows = (await sequelize.query(
    `SELECT COUNT(*)::int AS total
       FROM model_lifecycle_change_history
      WHERE organization_id = :organizationId AND model_inventory_id = :modelId;`,
    { replacements: { organizationId, modelId }, type: QueryTypes.SELECT },
  )) as Array<{ total: number }>;
  const total = countRows[0]?.total ?? 0;

  const rows = (await sequelize.query(
    `SELECT ch.id, ch.item_id, ch.change_type, ch.changed_by,
            ch.old_value, ch.new_value, ch.created_at,
            u.name AS user_name, u.surname AS user_surname, u.email AS user_email,
            i.name AS item_name
       FROM model_lifecycle_change_history ch
       LEFT JOIN users u ON u.id = ch.changed_by
       LEFT JOIN model_lifecycle_items i
         ON i.id = ch.item_id AND i.organization_id = ch.organization_id
      WHERE ch.organization_id = :organizationId AND ch.model_inventory_id = :modelId
      ORDER BY ch.created_at DESC, ch.id DESC
      LIMIT :limit OFFSET :offset;`,
    {
      replacements: { organizationId, modelId, limit, offset },
      type: QueryTypes.SELECT,
    },
  )) as LifecycleHistoryRow[];

  const data = rows.map((row) => {
    const item = row.item_name || (row.item_id ? `Lifecycle item #${row.item_id}` : "Lifecycle");
    const event = lifecycleEventLabel(row);
    return {
      id: row.id,
      action: "updated",
      field_name: event ? `${item}: ${event.toLowerCase()}` : item,
      old_value: formatLifecycleSnapshot(row.old_value),
      new_value: formatLifecycleSnapshot(row.new_value),
      changed_by_user_id: row.changed_by,
      changed_at: row.created_at,
      user_name: row.user_name ?? undefined,
      user_surname: row.user_surname ?? undefined,
      user_email: row.user_email ?? undefined,
    };
  });

  return { data, hasMore: offset + data.length < total, total };
}
