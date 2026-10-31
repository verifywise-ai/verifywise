import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { AUDIT_LEDGER_LOCK_NS } from "./auditLedgerConstants";

export interface LedgerCheckpoint {
  pruned_through_id: number;
  anchor_hash: string;
  cutoff: string;
}

/**
 * Latest retention checkpoint for an organization, or null when the ledger
 * has never been pruned. `anchor_hash` is the entry_hash of the last deleted
 * row, i.e. the prev_hash the first remaining row must carry.
 */
export async function getLatestLedgerCheckpoint(
  organizationId: number,
  transaction?: Transaction,
): Promise<LedgerCheckpoint | null> {
  const rows: any[] = await sequelize.query(
    `SELECT pruned_through_id, anchor_hash, cutoff
       FROM audit_ledger_retention_checkpoints
      WHERE organization_id = :organizationId
      ORDER BY pruned_through_id DESC, id DESC
      LIMIT 1`,
    { replacements: { organizationId }, type: QueryTypes.SELECT, transaction },
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    pruned_through_id: Number(row.pruned_through_id),
    anchor_hash: String(row.anchor_hash).trim(),
    cutoff: row.cutoff instanceof Date ? row.cutoff.toISOString() : String(row.cutoff),
  };
}

/**
 * Delete up to `batchSize` of the oldest audit_ledger rows older than
 * `cutoff`, as one contiguous prefix of the organization's chain, after
 * writing a checkpoint that anchors the new first row. Returns the number of
 * rows deleted; fewer than `batchSize` means there is nothing more to prune.
 *
 * Everything happens in one transaction under the same per-org advisory lock
 * that appends take, so no append can interleave with the prune. The delete
 * trigger only accepts the delete because the checkpoint was inserted earlier
 * in this very transaction and the flag below is set.
 */
export async function pruneAuditLedgerBatch(
  organizationId: number,
  cutoff: string,
  batchSize: number,
): Promise<number> {
  return sequelize.transaction(async (transaction) => {
    const q = (sql: string, replacements: Record<string, unknown>) =>
      sequelize.query(sql, { replacements, type: QueryTypes.SELECT, transaction }) as Promise<
        any[]
      >;

    await q(`SELECT set_config('app.current_org', :org, true)`, { org: String(organizationId) });
    await q(`SELECT pg_advisory_xact_lock(:ns, :organizationId)`, {
      ns: AUDIT_LEDGER_LOCK_NS,
      organizationId,
    });

    // First id inside the retention period; with none, the newest id, so the newest row is kept.
    // occurred_at is not strictly monotonic with id, and the delete trigger rejects any row
    // that is not older than the cutoff. Taking only ids below the MIN(id) of the in-retention
    // rows means no row we delete can be inside the retention period, however the timestamps
    // are ordered. A newer row in the middle of older ones simply ends the prune before it.
    const [{ bound }] = await q(
      `SELECT COALESCE(
         (SELECT MIN(id) FROM audit_ledger WHERE organization_id = :organizationId AND occurred_at >= :cutoff),
         (SELECT MAX(id) FROM audit_ledger WHERE organization_id = :organizationId)
       ) AS bound`,
      { organizationId, cutoff },
    );
    if (bound === null) return 0;

    const [last] = await q(
      `SELECT id, entry_hash, (SELECT COUNT(*) FROM audit_ledger
                                WHERE organization_id = :organizationId AND id <= s.id)::int AS n
         FROM audit_ledger s
        WHERE s.id = (SELECT MAX(id) FROM (
                        SELECT id FROM audit_ledger
                         WHERE organization_id = :organizationId AND id < :bound
                         ORDER BY id ASC LIMIT :batchSize) b)`,
      { organizationId, bound, batchSize },
    );
    if (!last) return 0;

    await q(
      `INSERT INTO audit_ledger_retention_checkpoints
         (organization_id, pruned_through_id, anchor_hash, cutoff, rows_deleted)
       VALUES (:organizationId, :id, :hash, :cutoff, :n) RETURNING id`,
      { organizationId, id: last.id, hash: String(last.entry_hash).trim(), cutoff, n: last.n },
    );
    await q(`SELECT set_config('verifywise.ledger_retention', 'on', true)`, {});
    await sequelize.query(
      `DELETE FROM audit_ledger WHERE organization_id = :organizationId AND id <= :id`,
      { replacements: { organizationId, id: last.id }, transaction },
    );
    return last.n;
  });
}
