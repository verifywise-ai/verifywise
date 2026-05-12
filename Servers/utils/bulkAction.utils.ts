/**
 * @fileoverview Shared helpers for bulk-action endpoints.
 *
 * Bulk endpoints accept `{ ids: number[], action: ... }` payloads to mutate
 * many rows in a single request. These helpers standardize:
 *   - input validation (positive integers, deduped, capped)
 *   - tenant-ownership guard (every id must belong to the caller's organization)
 *   - transactional wrapper that emits one audit-log entry per bulk operation
 *
 * @module utils/bulkAction.utils
 */

import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { logSuccess, logFailure } from "./logger/logHelper";
import {
  ForbiddenException,
  ValidationException,
} from "../domain.layer/exceptions/custom.exception";
import { safeSQLIdentifier } from "./security.utils";

interface ParseBulkIdsOptions {
  /** Maximum number of ids per request. Defaults to 200. */
  max?: number;
  /** Field name used in validation errors. Defaults to "ids". */
  field?: string;
}

/**
 * Validate and normalize a bulk-action `ids` payload.
 *
 * @throws ValidationException if input is not a non-empty array of positive integers,
 *         or if it exceeds the configured maximum length.
 * @returns A deduped array of positive integers preserving first-seen order.
 */
export function parseBulkIds(input: unknown, options: ParseBulkIdsOptions = {}): number[] {
  const { max = 200, field = "ids" } = options;

  if (!Array.isArray(input)) {
    throw new ValidationException("ids must be an array", field, input);
  }
  if (input.length === 0) {
    throw new ValidationException("ids must not be empty", field, input);
  }
  if (input.length > max) {
    throw new ValidationException(
      `ids cannot exceed ${max} entries per request`,
      field,
      input.length,
    );
  }

  const seen = new Set<number>();
  const result: number[] = [];
  for (const value of input) {
    const num = typeof value === "number" ? value : Number(value);
    if (!Number.isInteger(num) || num <= 0) {
      throw new ValidationException("ids must be positive integers", field, value);
    }
    if (seen.has(num)) continue;
    seen.add(num);
    result.push(num);
  }
  return result;
}

interface AssertOrgOwnsIdsParams {
  /** Unqualified table name (e.g., "tasks"). Validated via safeSQLIdentifier. */
  table: string;
  ids: number[];
  organizationId: number;
  transaction?: Transaction;
}

/**
 * Cross-tenant guard: every id in `ids` must exist in `table` for the caller's
 * organization. Performs one COUNT query.
 *
 * @throws ForbiddenException if any id is missing or belongs to a different org.
 */
export async function assertOrgOwnsIds({
  table,
  ids,
  organizationId,
  transaction,
}: AssertOrgOwnsIdsParams): Promise<void> {
  if (ids.length === 0) return;

  const safeTable = safeSQLIdentifier(table);

  const result = await sequelize.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM ${safeTable}
     WHERE id IN (:ids) AND organization_id = :organizationId`,
    {
      replacements: { ids, organizationId },
      type: QueryTypes.SELECT,
      transaction,
    },
  );

  const found = Number(result[0]?.count ?? 0);
  if (found !== ids.length) {
    throw new ForbiddenException(
      "One or more ids are not accessible in this organization",
      table,
      "bulk_action",
      { metadata: { expected: ids.length, found } },
    );
  }
}

interface BulkAuditMeta {
  /** Short verb describing the operation, e.g. "mark_complete", "archive". */
  action: string;
  ids: number[];
  fileName: string;
  functionName: string;
  userId: number;
  organizationId: number;
  /** Optional override for the human-readable description. */
  description?: string;
  /** Optional override for the audit event type. Defaults to "Update". */
  eventType?: "Create" | "Update" | "Delete";
}

interface WithBulkTransactionOptions {
  audit: BulkAuditMeta;
}

/**
 * Run `handler` inside a Sequelize transaction. On success, commits and emits
 * a single audit-log entry summarizing the bulk action. On failure, rolls back
 * and emits one failure entry, then rethrows.
 */
export async function withBulkTransaction<T>(
  options: WithBulkTransactionOptions,
  handler: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  const { audit } = options;
  const transaction = await sequelize.transaction();

  try {
    const result = await handler(transaction);
    await transaction.commit();

    await logSuccess({
      eventType: audit.eventType ?? "Update",
      description:
        audit.description ??
        `Bulk ${audit.action} on ${audit.ids.length} record(s) [ids=${audit.ids.join(",")}]`,
      functionName: audit.functionName,
      fileName: audit.fileName,
      userId: audit.userId,
      organizationId: audit.organizationId,
    });

    return result;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // Rollback may fail if the transaction was already finalized; ignore.
    }

    await logFailure({
      eventType: audit.eventType ?? "Update",
      description: `Bulk ${audit.action} failed`,
      functionName: audit.functionName,
      fileName: audit.fileName,
      userId: audit.userId,
      organizationId: audit.organizationId,
      error: error as Error,
    });

    throw error;
  }
}
