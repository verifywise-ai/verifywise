import { Transaction } from "sequelize";
import { getStorageForProvider } from "./index";
import { StorageObjectRef } from "./types";

/**
 * Bridges the gap between object storage (non-transactional) and database
 * transactions:
 *
 * - Puts that happen inside a transaction are registered with
 *   registerPendingPut; if the transaction's work fails, withStorageCleanup
 *   removes the orphaned objects. On success the registry entry is simply
 *   dropped (keyed by the transaction object in a WeakMap).
 * - Deletes must never run before commit: a rollback would resurrect the row
 *   with a dangling storage_key while its object is already gone. Use
 *   deleteObjectOnCommit, which defers the delete to transaction.afterCommit.
 */

const pendingPuts = new WeakMap<Transaction, StorageObjectRef[]>();
const pendingDeletes = new WeakMap<Transaction, StorageObjectRef[]>();
const rollbackPatched = new WeakSet<Transaction>();

/**
 * Sequelize transactions expose afterCommit but no rollback hook. To make
 * rollback cleanup automatic for every caller — including early
 * `await transaction.rollback(); return ...` paths scattered through the
 * controllers — the first pending put on a transaction wraps its rollback
 * method so pending objects are removed before the rollback runs. The wrap
 * is per transaction instance and idempotent; commit paths never call it.
 */
const attachRollbackCleanup = (transaction: Transaction): void => {
  if (rollbackPatched.has(transaction)) return;
  rollbackPatched.add(transaction);
  const originalRollback = transaction.rollback.bind(transaction);
  transaction.rollback = (async () => {
    await cleanupPendingPuts(transaction);
    return originalRollback();
  }) as Transaction["rollback"];
};

const deleteRef = async (ref: StorageObjectRef): Promise<void> => {
  if (!ref.key) return; // local provider: bytes die with the row
  try {
    await getStorageForProvider(ref.provider).delete(ref.key);
  } catch (error) {
    // Orphaned object: the row is gone, the object is unreachable and can be
    // reaped by a bucket lifecycle rule or manual sweep. Never rethrow — this
    // runs after commit and must not fail the request.
    console.error("Failed to delete storage object after commit:", error);
  }
};

const flushDeletes = async (transaction: Transaction): Promise<void> => {
  const refs = pendingDeletes.get(transaction) ?? [];
  pendingDeletes.delete(transaction);
  for (const ref of refs) {
    await deleteRef(ref);
  }
};

/**
 * Track an object stored within `transaction` so it can be removed if the
 * transaction's work is rolled back (see withStorageCleanup). No-op for
 * refs without a key (local provider) or when no transaction is active.
 */
export const registerPendingPut = (
  transaction: Transaction | null | undefined,
  ref: StorageObjectRef,
): void => {
  if (!transaction || !ref.key) return;
  const refs = pendingPuts.get(transaction);
  if (refs) {
    refs.push(ref);
  } else {
    pendingPuts.set(transaction, [ref]);
  }
  attachRollbackCleanup(transaction);
};

/**
 * Best-effort delete of every object registered via registerPendingPut for
 * `transaction`. Call before rolling back a transaction that stored objects:
 * either wrap work in withStorageCleanup, or invoke this directly in
 * catch / early-rollback paths:
 *
 *   } catch (e) {
 *     await cleanupPendingPuts(tx);
 *     await tx.rollback();
 *     throw e;
 *   }
 */
export const cleanupPendingPuts = async (transaction: Transaction): Promise<void> => {
  const refs = pendingPuts.get(transaction) ?? [];
  pendingPuts.delete(transaction);
  for (const ref of refs) {
    try {
      if (ref.key) await getStorageForProvider(ref.provider).delete(ref.key);
    } catch (cleanupError) {
      console.error("Failed to clean up storage object after rollback:", cleanupError);
    }
  }
};

/**
 * Run `fn` with `transaction`; if it throws (i.e. the caller will roll back),
 * best-effort delete any objects stored via registerPendingPut for this
 * transaction before rethrowing. Callers keep their existing
 * `catch { await transaction.rollback(); throw; }` blocks — wrap the try body:
 *
 *   const tx = await sequelize.transaction();
 *   try {
 *     await withStorageCleanup(tx, async () => { ...existing work... });
 *     await tx.commit();
 *   } catch (e) { await tx.rollback(); throw e; }
 */
export const withStorageCleanup = async <T>(
  transaction: Transaction,
  fn: () => Promise<T>,
): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    await cleanupPendingPuts(transaction);
    throw error;
  }
};

/**
 * Delete a stored object only after `transaction` commits. Without a
 * transaction the delete runs immediately. Deleting before commit is unsafe:
 * a rollback would leave the row pointing at a deleted object.
 */
export const deleteObjectOnCommit = (
  transaction: Transaction | null | undefined,
  ref: StorageObjectRef,
): void => {
  if (!ref.key) return; // local provider: bytes die with the row
  if (!transaction) {
    void deleteRef(ref);
    return;
  }
  const refs = pendingDeletes.get(transaction);
  if (refs) {
    refs.push(ref);
  } else {
    pendingDeletes.set(transaction, [ref]);
    transaction.afterCommit(() => flushDeletes(transaction));
  }
};
