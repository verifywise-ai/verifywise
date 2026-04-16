/**
 * Master Control Propagation Service.
 *
 * When a master control's shared fields (status / owner / due_date /
 * implementation_details) change, this service fans out the update to every
 * mapped framework row in the current organisation. All writes happen inside
 * a single Sequelize transaction; on any failure, the transaction rolls back
 * and a descriptive PropagationError is raised so the caller can surface the
 * problem to the user.
 *
 * Design notes
 * ------------
 * - **Mappings point to struct rows** (shared, org-less requirement metadata).
 *   For each mapping, we find every tenant row in the current organisation
 *   whose `*_meta_id` FK matches the mapped struct id, and update those.
 * - **Status translation** is required because each framework uses its own
 *   enum (see `FRAMEWORK_STATUS_TRANSLATIONS`). Unknown values are skipped.
 * - **Field name translation** is also required: EU controls use
 *   `implementation_details`; ISO/NIST tenant tables use
 *   `implementation_description`. Owners, approvers, reviewers, and due
 *   dates share the same column name everywhere.
 * - **Partial failures** — if one adapter raises, the whole transaction
 *   rolls back; the master update that triggered propagation is kept atomic
 *   with the fan-out by the caller passing its own transaction handle.
 */

import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import type {
  Framework,
  FrameworkEntityType,
  IMasterControlFrameworkMapping,
} from "../domain.layer/interfaces/i.masterControlMapping";
import type { MasterControlStatus } from "../domain.layer/interfaces/i.masterControl";

export interface PropagationPayload {
  status?: MasterControlStatus | null;
  owner?: number | null;
  reviewer?: number | null;
  approver?: number | null;
  due_date?: string | Date | null;
  implementation_details?: string | null;
}

export interface PropagationResult {
  mappingId: number;
  framework: Framework;
  framework_entity_type: FrameworkEntityType;
  framework_entity_id: number;
  tenantTable: string;
  rowsUpdated: number;
  skipped: boolean;
  reason?: string;
}

/**
 * Per-entity-type adapter describing where the tenant rows live and which
 * column translates master `implementation_details` (EU keeps the same
 * name; ISO/NIST use `implementation_description`).
 */
interface EntityAdapter {
  tenantTable: string;
  metaIdColumn: string;
  implementationColumn: "implementation_details" | "implementation_description";
}

const ENTITY_ADAPTERS: Record<FrameworkEntityType, EntityAdapter> = {
  control_eu: {
    tenantTable: "controls_eu",
    metaIdColumn: "control_meta_id",
    implementationColumn: "implementation_details",
  },
  subcontrol_eu: {
    tenantTable: "subcontrols_eu",
    metaIdColumn: "subcontrol_meta_id",
    implementationColumn: "implementation_details",
  },
  subclause_struct_iso: {
    tenantTable: "subclauses_iso",
    metaIdColumn: "subclause_meta_id",
    implementationColumn: "implementation_description",
  },
  annex_category_iso: {
    tenantTable: "annexcategories_iso",
    metaIdColumn: "annexcategory_meta_id",
    implementationColumn: "implementation_description",
  },
  iso27001_subclause: {
    tenantTable: "subclauses_iso27001",
    metaIdColumn: "subclause_meta_id",
    implementationColumn: "implementation_description",
  },
  iso27001_annex_category: {
    tenantTable: "annexcontrols_iso27001",
    metaIdColumn: "annexcontrol_meta_id",
    implementationColumn: "implementation_description",
  },
  subcategory_nist: {
    tenantTable: "nist_ai_rmf_subcategories",
    metaIdColumn: "subcategory_meta_id",
    implementationColumn: "implementation_description",
  },
};

/**
 * Status value translation table — master vocabulary → framework vocabulary.
 * The EU controls table keeps the master's 3-value scale; the others use a
 * broader "Not started / In progress / Done" palette.
 */
const FRAMEWORK_STATUS_TRANSLATIONS: Record<
  FrameworkEntityType,
  Record<MasterControlStatus, string>
> = {
  control_eu: {
    Waiting: "Waiting",
    "In progress": "In progress",
    Done: "Done",
  },
  subcontrol_eu: {
    Waiting: "Waiting",
    "In progress": "In progress",
    Done: "Done",
  },
  subclause_struct_iso: {
    Waiting: "Not started",
    "In progress": "In progress",
    Done: "Done",
  },
  annex_category_iso: {
    Waiting: "Not started",
    "In progress": "In progress",
    Done: "Done",
  },
  iso27001_subclause: {
    Waiting: "Not started",
    "In progress": "In progress",
    Done: "Done",
  },
  iso27001_annex_category: {
    Waiting: "Not started",
    "In progress": "In progress",
    Done: "Done",
  },
  subcategory_nist: {
    Waiting: "Not started",
    "In progress": "In progress",
    Done: "Done",
  },
};

export class PropagationError extends Error {
  constructor(
    message: string,
    public readonly context: {
      masterControlId: number;
      mapping?: IMasterControlFrameworkMapping;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = "PropagationError";
  }
}

/**
 * Which top-level master fields trigger propagation.
 * Master fields not in this list (title, description, risk_review, etc.)
 * are master-only and do NOT propagate.
 */
export const PROPAGATABLE_FIELDS: ReadonlyArray<keyof PropagationPayload> = [
  "status",
  "owner",
  "reviewer",
  "approver",
  "due_date",
  "implementation_details",
];

/** Does the caller's diff include any field that propagates? */
export function hasPropagatableChanges(payload: Partial<PropagationPayload>): boolean {
  return PROPAGATABLE_FIELDS.some((k) => k in payload);
}

/**
 * Build the SET clause + replacements for a single adapter's UPDATE.
 * Returns `null` when there's nothing to set (e.g. every field was skipped).
 */
function buildSetClause(
  payload: Partial<PropagationPayload>,
  adapter: EntityAdapter,
  entityType: FrameworkEntityType
): { sql: string; replacements: Record<string, any> } | null {
  const sets: string[] = [];
  const replacements: Record<string, any> = {};

  if ("status" in payload) {
    const translated = payload.status
      ? FRAMEWORK_STATUS_TRANSLATIONS[entityType][payload.status]
      : null;
    if (translated !== undefined) {
      sets.push(`status = :status`);
      replacements.status = translated;
    }
  }
  if ("owner" in payload) {
    sets.push(`owner = :owner`);
    replacements.owner = payload.owner ?? null;
  }
  if ("reviewer" in payload) {
    sets.push(`reviewer = :reviewer`);
    replacements.reviewer = payload.reviewer ?? null;
  }
  if ("approver" in payload) {
    sets.push(`approver = :approver`);
    replacements.approver = payload.approver ?? null;
  }
  if ("due_date" in payload) {
    sets.push(`due_date = :due_date`);
    replacements.due_date = payload.due_date ?? null;
  }
  if ("implementation_details" in payload) {
    sets.push(`${adapter.implementationColumn} = :implementation`);
    replacements.implementation = payload.implementation_details ?? null;
  }

  if (sets.length === 0) return null;
  return { sql: sets.join(", "), replacements };
}

/**
 * Propagate a diff from a master control to every tenant row in every
 * mapped framework. Runs inside the caller's transaction — the caller is
 * responsible for commit/rollback so the master + fan-out stay atomic.
 */
export async function propagateMasterControlUpdate(
  masterControlId: number,
  organizationId: number,
  payload: Partial<PropagationPayload>,
  transaction: Transaction
): Promise<PropagationResult[]> {
  if (!hasPropagatableChanges(payload)) return [];

  const mappings = await sequelize.query<IMasterControlFrameworkMapping>(
    `SELECT id, master_control_id, framework, framework_entity_type,
            framework_entity_id, created_at
       FROM master_control_framework_mappings
      WHERE master_control_id = :masterControlId
        AND organization_id = :organizationId`,
    {
      replacements: { masterControlId, organizationId },
      type: QueryTypes.SELECT,
      transaction,
    }
  );

  const results: PropagationResult[] = [];

  for (const mapping of mappings) {
    const adapter = ENTITY_ADAPTERS[mapping.framework_entity_type];
    if (!adapter) {
      results.push({
        mappingId: mapping.id!,
        framework: mapping.framework,
        framework_entity_type: mapping.framework_entity_type,
        framework_entity_id: mapping.framework_entity_id,
        tenantTable: "",
        rowsUpdated: 0,
        skipped: true,
        reason: `No adapter registered for entity type "${mapping.framework_entity_type}"`,
      });
      continue;
    }

    const clause = buildSetClause(payload, adapter, mapping.framework_entity_type);
    if (!clause) {
      results.push({
        mappingId: mapping.id!,
        framework: mapping.framework,
        framework_entity_type: mapping.framework_entity_type,
        framework_entity_id: mapping.framework_entity_id,
        tenantTable: adapter.tenantTable,
        rowsUpdated: 0,
        skipped: true,
        reason: "No propagatable fields after translation",
      });
      continue;
    }

    try {
      const [, affected] = await sequelize.query(
        `UPDATE ${adapter.tenantTable}
            SET ${clause.sql}
          WHERE organization_id = :organizationId
            AND ${adapter.metaIdColumn} = :metaId`,
        {
          replacements: {
            ...clause.replacements,
            organizationId,
            metaId: mapping.framework_entity_id,
          },
          transaction,
        }
      );
      const rowCount =
        typeof affected === "number"
          ? affected
          : (affected as any)?.rowCount ?? 0;

      results.push({
        mappingId: mapping.id!,
        framework: mapping.framework,
        framework_entity_type: mapping.framework_entity_type,
        framework_entity_id: mapping.framework_entity_id,
        tenantTable: adapter.tenantTable,
        rowsUpdated: rowCount,
        skipped: false,
      });
    } catch (err) {
      // Re-throw wrapped so the controller can surface a clear message and
      // roll back the whole master update atomically.
      throw new PropagationError(
        `Failed to propagate to ${adapter.tenantTable} for mapping ${mapping.id}: ${(err as Error).message}`,
        { masterControlId, mapping, cause: err as Error }
      );
    }
  }

  return results;
}

/** Preview which tenant rows would be affected by a given payload — used by
 *  the Propagation Preview modal on the client. Read-only, no writes. */
export async function previewPropagation(
  masterControlId: number,
  organizationId: number,
  payload: Partial<PropagationPayload>
): Promise<PropagationResult[]> {
  if (!hasPropagatableChanges(payload)) return [];

  const mappings = await sequelize.query<IMasterControlFrameworkMapping>(
    `SELECT id, master_control_id, framework, framework_entity_type,
            framework_entity_id, created_at
       FROM master_control_framework_mappings
      WHERE master_control_id = :masterControlId
        AND organization_id = :organizationId`,
    {
      replacements: { masterControlId, organizationId },
      type: QueryTypes.SELECT,
    }
  );

  const results: PropagationResult[] = [];
  for (const mapping of mappings) {
    const adapter = ENTITY_ADAPTERS[mapping.framework_entity_type];
    if (!adapter) {
      results.push({
        mappingId: mapping.id!,
        framework: mapping.framework,
        framework_entity_type: mapping.framework_entity_type,
        framework_entity_id: mapping.framework_entity_id,
        tenantTable: "",
        rowsUpdated: 0,
        skipped: true,
        reason: `No adapter registered for "${mapping.framework_entity_type}"`,
      });
      continue;
    }
    const countRows = await sequelize.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n
         FROM ${adapter.tenantTable}
        WHERE organization_id = :organizationId
          AND ${adapter.metaIdColumn} = :metaId`,
      {
        replacements: {
          organizationId,
          metaId: mapping.framework_entity_id,
        },
        type: QueryTypes.SELECT,
      }
    );
    results.push({
      mappingId: mapping.id!,
      framework: mapping.framework,
      framework_entity_type: mapping.framework_entity_type,
      framework_entity_id: mapping.framework_entity_id,
      tenantTable: adapter.tenantTable,
      rowsUpdated: parseInt(countRows[0]?.n ?? "0", 10),
      skipped: false,
    });
  }
  return results;
}
