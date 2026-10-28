import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { appendToAuditLedger } from "../../utils/auditLedger.utils";

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
  // Snapshot the current answer (if any) so the change history can store
  // before/after values (#4977).
  const beforeRows = (await sequelize.query(
    `SELECT value_text, value_json
       FROM model_lifecycle_values
      WHERE organization_id = :organizationId AND model_inventory_id = :modelId AND item_id = :itemId;`,
    { replacements: { organizationId, modelId, itemId }, type: QueryTypes.SELECT },
  )) as any[];
  const before = beforeRows[0] ?? null;

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
    },
  )) as unknown as [any[], number];
  const upserted = (rows[0] as any)[0];

  if (upserted) {
    try {
      const TRACKED = ["value_text", "value_json"] as const;
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
        const changeType = before ? "updated" : "created";
        await recordItemChange(
          organizationId,
          itemId,
          changeType,
          userId ?? null,
          before ? oldSnapshot : null,
          newSnapshot,
          modelId,
        );
        // Same tamper-evident trail the generic change-history writer keeps.
        appendToAuditLedger({
          organizationId,
          entryType: "change_history",
          userId: userId ?? null,
          entityType: "model_lifecycle_value",
          entityId: itemId,
          action: changeType,
          description: `Model lifecycle value for item ${itemId} ${changeType} (${Object.keys(newSnapshot).join(", ")})`,
        }).catch((error) => {
          console.error(
            "Failed to append model lifecycle value change to the audit ledger:",
            error,
          );
        });
      }
    } catch (error) {
      // History must never fail the edit.
      console.error("Failed to record model lifecycle value change:", error);
    }
  }

  return upserted;
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
  return (rows[0] as any)?.[0] ?? { value_id: valueId, file_id: fileId };
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
  return Array.isArray(rows) && rows.length > 0;
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
  return (rows[0] as any)?.[0] ?? { value_id: valueId, user_id: personUserId };
}

export async function removePerson(
  organizationId: number,
  modelId: number,
  itemId: number,
  personUserId: number,
): Promise<void> {
  await sequelize.query(
    `DELETE FROM model_lifecycle_item_people
      WHERE organization_id = :organizationId AND user_id = :personUserId
        AND value_id = (
          SELECT id FROM model_lifecycle_values
           WHERE organization_id = :organizationId
             AND model_inventory_id = :modelId AND item_id = :itemId
        );`,
    { replacements: { organizationId, personUserId, modelId, itemId } },
  );
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
  return (rows[0] as any)?.[0] ?? { value_id: valueId, user_id: approverUserId, status: "pending" };
}

export async function removeApprover(
  organizationId: number,
  modelId: number,
  itemId: number,
  approverUserId: number,
): Promise<void> {
  await sequelize.query(
    `DELETE FROM model_lifecycle_item_approvals
      WHERE organization_id = :organizationId AND user_id = :approverUserId
        AND value_id = (
          SELECT id FROM model_lifecycle_values
           WHERE organization_id = :organizationId
             AND model_inventory_id = :modelId AND item_id = :itemId
        );`,
    { replacements: { organizationId, approverUserId, modelId, itemId } },
  );
}

export type ApprovalStatus = "pending" | "approved" | "rejected";

export async function updateApprovalStatus(
  organizationId: number,
  modelId: number,
  itemId: number,
  approverUserId: number,
  status: ApprovalStatus,
): Promise<any | null> {
  // decided_at is NULL only when the reviewer walks the decision back to
  // "pending"; otherwise we stamp NOW().
  const decidedAtSql = status === "pending" ? "NULL" : "NOW()";
  const rows = (await sequelize.query(
    `UPDATE model_lifecycle_item_approvals
        SET status = :status, decided_at = ${decidedAtSql}
      WHERE organization_id = :organizationId AND user_id = :approverUserId
        AND value_id = (
          SELECT id FROM model_lifecycle_values
           WHERE organization_id = :organizationId
             AND model_inventory_id = :modelId AND item_id = :itemId
        )
      RETURNING *;`,
    {
      replacements: { organizationId, status, approverUserId, modelId, itemId },
      type: QueryTypes.UPDATE,
    },
  )) as unknown as [any[], number];
  return (rows[0] as any)?.[0] ?? null;
}
