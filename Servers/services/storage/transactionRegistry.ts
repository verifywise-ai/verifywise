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
    const refs = pendingPuts.get(transaction) ?? [];
    pendingPuts.delete(transaction);
    for (const ref of refs) {
      try {
        if (ref.key) await getStorageForProvider(ref.provider).delete(ref.key);
      } catch (cleanupError) {
        console.error("Failed to clean up storage object after rollback:", cleanupError);
      }
    }
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
