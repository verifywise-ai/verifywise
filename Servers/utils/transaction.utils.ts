import { Transaction } from "sequelize";
import { sequelize } from "../database/db";
import logger from "./logger/fileLogger";
import { EventType, logRollbackFailure } from "./logger/logHelper";

/** Who runs the transaction and where, for the log of a failed rollback. */
export interface TransactionContext {
  functionName: string;
  fileName: string;
  eventType: EventType;
  organizationId: number;
  userId: number;
}

/**
 * Run `work` in the caller's transaction, or in a new one that is committed
 * here (rolled back on error). Lets a service take an optional transaction:
 * hooks registered with `tx.afterCommit` run once whichever transaction it
 * is commits, and never on rollback.
 *
 * A rollback that fails is logged through `logRollbackFailure` with
 * `context` and the error that caused it; the original error is thrown.
 */
export async function inTransaction<T>(
  transaction: Transaction | undefined,
  context: TransactionContext,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  if (transaction) return work(transaction);
  const tx = await sequelize.transaction();
  try {
    const result = await work(tx);
    await tx.commit();
    return result;
  } catch (error) {
    try {
      await tx.rollback();
    } catch (rollbackError) {
      try {
        await logRollbackFailure({
          functionName: context.functionName,
          fileName: context.fileName,
          eventType: context.eventType,
          userId: context.userId,
          organizationId: context.organizationId,
          originalError: error,
          rollbackError,
        });
      } catch (logError) {
        // Logging must never hide the original error.
        logger.error("Transaction rollback failed and could not be logged:", logError);
      }
    }
    throw error;
  }
}
