/**
 * One ingested metric point. Append-only / immutable — a corrected value is a
 * new point, never an overwrite.
 *
 * `at`      = when the metric pertains to (backfill-honest)
 * `context` = arbitrary caller metadata (sample size, source job); never evaluated
 */
export interface IMrmMetric {
  id?: number;
  organization_id: number;
  model_inventory_id: number;
  metric: string;
  value: number;
  at: Date;
  window?: string; // DB defaults to '' (empty sentinel) — part of the idempotency key
  segment: string; // defaults to 'overall'
  context?: Record<string, unknown>;
  ingestion_token_id?: number; // which token wrote this point (audit)
  received_at?: Date;
  created_at?: Date;
}
