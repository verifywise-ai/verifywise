import { Transaction } from "sequelize";
import { sequelize } from "../database/db";
import logger from "./logger/fileLogger";

/**
 * Run `work` in the caller's transaction, or in a new one that is committed
 * here (rolled back on error). Lets a service take an optional transaction:
 * hooks registered with `tx.afterCommit` run once whichever transaction it
 * is commits, and never on rollback.
 */
export async function inTransaction<T>(
  transaction: Transaction | undefined,
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
      logger.error("Transaction rollback failed:", rollbackError);
    }
    throw error;
  }
}
