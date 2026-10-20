import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";

export const EXPORT_BATCH_SIZE = 1000;

export const AUDIT_LEDGER_EXPORT_COLUMNS = [
  "id",
  "occurred_at",
  "user_id",
  "user",
  "entry_type",
  "event_type",
  "action",
  "entity_type",
  "entity_id",
  "field_name",
  "old_value",
  "new_value",
  "description",
  "entry_hash",
  "prev_hash",
] as const;

/** The ledger's entry types; any other entry_type filter is a 400. */
export const LEDGER_ENTRY_TYPES = ["event_log", "change_history"] as const;

export const isLedgerEntryType = (value: string): boolean =>
  (LEDGER_ENTRY_TYPES as readonly string[]).includes(value);

export interface AuditLedgerExportFilters {
  entityType?: string;
  entryType?: string;
}

/**
 * WHERE clause shared by the ledger list and the export, so the same filters
 * always select the same rows. The SQL is fixed text: an empty filter value
 * matches everything, so no part of the query is built from request input.
 * Tables are aliased `al`.
 */
export const LEDGER_FILTER_SQL = `al.organization_id = :organizationId
  AND (:entityType = '' OR al.entity_type = :entityType)
  AND (:entryType = '' OR al.entry_type = :entryType)`;

/** Replacements for LEDGER_FILTER_SQL; a missing filter is an empty string. */
export const ledgerFilterReplacements = (
  organizationId: number,
  filters: AuditLedgerExportFilters,
): Record<string, string | number> => ({
  organizationId,
  entityType: filters.entityType ?? "",
  entryType: filters.entryType ?? "",
});

/** One batch of the org's ledger after `afterId`, oldest first. */
export const fetchAuditLedgerBatch = async (
  organizationId: number,
  filters: AuditLedgerExportFilters,
  afterId: number,
): Promise<any[]> => {
  const replacements = {
    ...ledgerFilterReplacements(organizationId, filters),
    afterId,
    limit: EXPORT_BATCH_SIZE,
  };

  return sequelize.query(
    `SELECT al.*, u.name AS user_name, u.surname AS user_surname
       FROM audit_ledger al
       LEFT JOIN users u ON al.user_id = u.id
      WHERE ${LEDGER_FILTER_SQL}
        AND al.id > :afterId
      ORDER BY al.id ASC
      LIMIT :limit`,
    { replacements, type: QueryTypes.SELECT },
  );
};

/**
 * A ledger row as CSV values, in AUDIT_LEDGER_EXPORT_COLUMNS order. Text is
 * exported as stored, not redacted: the export is the verifiable copy kept
 * before retention cleanup, so every row must still match its entry_hash.
 */
export const ledgerRowValues = (row: any): unknown[] => [
  row.id,
  row.occurred_at instanceof Date ? row.occurred_at.toISOString() : row.occurred_at,
  row.user_id,
  [row.user_name, row.user_surname].filter(Boolean).join(" "),
  row.entry_type,
  row.event_type,
  row.action,
  row.entity_type,
  row.entity_id,
  row.field_name,
  row.old_value,
  row.new_value,
  row.description,
  row.entry_hash,
  row.prev_hash,
];
