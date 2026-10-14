/**
 * Audit ledger constants, in a leaf module so the ledger and its retention
 * prune can both import them without importing each other.
 */

/** SHA-256 of 64 zeroes — the "genesis" previous hash for the first entry */
export const GENESIS_HASH = "0".repeat(64);

/**
 * Namespace key for `pg_advisory_xact_lock(AUDIT_LEDGER_LOCK_NS, organization_id)`.
 * Any fixed int works; using a project-unique value avoids collisions with
 * other code that might take advisory locks.
 */
export const AUDIT_LEDGER_LOCK_NS = 9001;
