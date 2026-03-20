import { createHash } from "crypto";
import { sequelize } from "../database/db";
import { QueryTypes, Transaction } from "sequelize";
import { getFeatureSettingsQuery } from "./featureSettings.utils";

/** SHA-256 of 64 zeroes — the "genesis" previous hash for the first entry */
export const GENESIS_HASH = "0".repeat(64);

interface AuditLedgerEntry {
  organizationId: number;
  entryType: "event_log" | "change_history";
  userId: number;
  eventType?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  action?: string | null;
  fieldName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  description?: string | null;
}

interface AuditLedgerHashPayload {
  id: number;
  entry_type: string;
  user_id: number | null;
  occurred_at: string;
  event_type: string | null;
  entity_type: string | null;
  entity_id: number | null;
  action: string | null;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  description: string | null;
  prev_hash: string;
}

/**
 * Compute a deterministic SHA-256 hash for an audit ledger entry.
 * Keys are sorted alphabetically for canonical form.
 */
export function computeEntryHash(payload: AuditLedgerHashPayload): string {
  const sorted: Record<string, unknown> = {};
  const payloadRecord = payload as unknown as Record<string, unknown>;
  for (const key of Object.keys(payloadRecord).sort()) {
    sorted[key] = payloadRecord[key];
  }
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}

/**
 * In-memory cache for the audit_ledger_enabled setting per organization.
 * Avoids a DB query on every single event. Expires after 30 seconds.
 */
const enabledCache = new Map<number, { enabled: boolean; expiry: number }>();
const CACHE_TTL_MS = 30_000;

async function isAuditLedgerEnabled(organizationId: number): Promise<boolean> {
  const now = Date.now();
  const cached = enabledCache.get(organizationId);
  if (cached && cached.expiry > now) return cached.enabled;

  try {
    const settings = await getFeatureSettingsQuery(organizationId);
    const enabled = settings.audit_ledger_enabled !== false;
    enabledCache.set(organizationId, { enabled, expiry: now + CACHE_TTL_MS });
    return enabled;
  } catch {
    // If we can't read settings, default to enabled (don't lose audit data)
    return true;
  }
}

/**
 * Append an entry to the audit_ledger using a SERIALIZABLE transaction.
 *
 * Flow:
 * 1. Check if audit ledger is enabled for this organization
 * 2. Get the prev_hash from the last entry (or GENESIS_HASH)
 * 3. INSERT with entry_hash = 'pending' sentinel
 * 4. Compute the real hash using the assigned id
 * 5. UPDATE the sentinel to the real hash
 *
 * The append-only triggers allow only this specific sentinel→hash transition.
 */
export async function appendToAuditLedger(
  entry: AuditLedgerEntry
): Promise<void> {
  const organizationId = entry.organizationId;

  // Skip if audit ledger is disabled for this organization
  if (!(await isAuditLedgerEnabled(organizationId))) return;

  const txn: Transaction = await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE,
  });

  try {
    // Step 1: Get the previous hash
    const lastRows: any[] = await sequelize.query(
      `SELECT entry_hash FROM audit_ledger
       WHERE organization_id = :organizationId
       ORDER BY id DESC LIMIT 1`,
      { replacements: { organizationId }, type: QueryTypes.SELECT, transaction: txn }
    );
    const prevHash = lastRows.length > 0 ? lastRows[0].entry_hash.trim() : GENESIS_HASH;

    // Step 2: INSERT with sentinel hash
    const sentinel = "pending".padEnd(64, "0");
    const insertResult: any[] = await sequelize.query(
      `INSERT INTO audit_ledger
       (organization_id, entry_type, user_id, occurred_at, event_type, entity_type, entity_id,
        action, field_name, old_value, new_value, description, entry_hash, prev_hash)
       VALUES (:organizationId, :entry_type, :user_id, NOW(), :event_type, :entity_type, :entity_id,
        :action, :field_name, :old_value, :new_value, :description, :sentinel, :prev_hash)
       RETURNING id, occurred_at`,
      {
        replacements: {
          organizationId,
          entry_type: entry.entryType,
          user_id: entry.userId,
          event_type: entry.eventType || null,
          entity_type: entry.entityType || null,
          entity_id: entry.entityId || null,
          action: entry.action || null,
          field_name: entry.fieldName || null,
          old_value: entry.oldValue || null,
          new_value: entry.newValue || null,
          description: entry.description || null,
          sentinel,
          prev_hash: prevHash,
        },
        type: QueryTypes.INSERT,
        transaction: txn,
      }
    );

    // QueryTypes.INSERT returns [rows[], rowCount] — access first row from the array
    const rows = insertResult[0] as any[];
    const inserted = rows[0];
    const newId: number = inserted.id;
    // Canonicalize to ISO string — Sequelize returns Date objects for TIMESTAMPTZ
    const occurredAt: string = inserted.occurred_at instanceof Date
      ? inserted.occurred_at.toISOString()
      : String(inserted.occurred_at);

    // Step 3: Compute the real hash
    const realHash = computeEntryHash({
      id: newId,
      entry_type: entry.entryType,
      user_id: entry.userId,
      occurred_at: occurredAt,
      event_type: entry.eventType || null,
      entity_type: entry.entityType || null,
      entity_id: entry.entityId || null,
      action: entry.action || null,
      field_name: entry.fieldName || null,
      old_value: entry.oldValue || null,
      new_value: entry.newValue || null,
      description: entry.description || null,
      prev_hash: prevHash,
    });

    // Step 4: UPDATE sentinel → real hash (trigger allows this one transition)
    await sequelize.query(
      `UPDATE audit_ledger SET entry_hash = :realHash WHERE id = :id`,
      {
        replacements: { realHash, id: newId },
        transaction: txn,
      }
    );

    await txn.commit();
  } catch (error) {
    await txn.rollback();
    throw error;
  }
}

interface VerifyChainOptions {
  batchSize?: number;
  maxEntries?: number;
}

interface VerifyChainResult {
  status: "intact" | "compromised" | "empty" | "partial";
  totalEntries: number;
  brokenAtId?: number;
  expectedHash?: string;
  actualHash?: string;
}

/**
 * Walk the entire audit chain and recompute every hash.
 * Returns the first broken link if any.
 */
export async function verifyChain(
  organizationId: number,
  options?: VerifyChainOptions
): Promise<VerifyChainResult> {
  const batchSize = options?.batchSize || 1000;
  const maxEntries = options?.maxEntries || 100000;
  let offset = 0;
  let prevHash = GENESIS_HASH;
  let totalEntries = 0;

  while (true) {
    const rows: any[] = await sequelize.query(
      `SELECT id, entry_type, user_id, occurred_at, event_type, entity_type,
              entity_id, action, field_name, old_value, new_value, description,
              entry_hash, prev_hash
       FROM audit_ledger
       WHERE organization_id = :organizationId
       ORDER BY id ASC
       LIMIT :batchSize OFFSET :offset`,
      {
        replacements: { organizationId, batchSize, offset },
        type: QueryTypes.SELECT,
      }
    );

    if (rows.length === 0) break;

    for (const row of rows) {
      totalEntries++;

      // Trim CHAR(64) padding to avoid false-positive chain breaks
      const rowPrevHash = row.prev_hash?.trim() ?? "";
      const rowEntryHash = row.entry_hash?.trim() ?? "";

      // Verify prev_hash linkage
      if (rowPrevHash !== prevHash) {
        return {
          status: "compromised",
          totalEntries,
          brokenAtId: row.id,
          expectedHash: prevHash,
          actualHash: rowPrevHash,
        };
      }

      // Recompute hash from row data — canonicalize occurred_at to ISO string
      const occurredAt = row.occurred_at instanceof Date
        ? row.occurred_at.toISOString()
        : String(row.occurred_at);
      const expectedHash = computeEntryHash({
        id: row.id,
        entry_type: row.entry_type,
        user_id: row.user_id,
        occurred_at: occurredAt,
        event_type: row.event_type,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        action: row.action,
        field_name: row.field_name,
        old_value: row.old_value,
        new_value: row.new_value,
        description: row.description,
        prev_hash: rowPrevHash,
      });

      if (rowEntryHash !== expectedHash) {
        return {
          status: "compromised",
          totalEntries,
          brokenAtId: row.id,
          expectedHash,
          actualHash: rowEntryHash,
        };
      }

      prevHash = rowEntryHash;
    }

    // Cap the number of entries verified to prevent unbounded CPU usage
    if (totalEntries >= maxEntries) {
      return { status: "partial", totalEntries };
    }

    offset += batchSize;
  }

  if (totalEntries === 0) {
    return { status: "empty", totalEntries: 0 };
  }

  return { status: "intact", totalEntries };
}
