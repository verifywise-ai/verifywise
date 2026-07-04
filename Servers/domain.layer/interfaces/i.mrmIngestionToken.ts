/**
 * A per-org, named, revocable machine-to-machine ingestion token. Only the hash
 * is stored — the plaintext is shown once on creation.
 *
 * - model_inventory_id null => org-wide token; set => scoped to a single model
 * - revoked_at        null => active; set => revoked (soft, kept for audit)
 */
export interface IMrmIngestionToken {
  id?: number;
  organization_id: number;
  name: string;
  token_hash: string;
  model_inventory_id?: number;
  last_used_at?: Date;
  revoked_at?: Date;
  created_by?: number;
  created_at?: Date;
}
