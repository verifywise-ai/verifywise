import { MrmRevalidationTriggerSource } from "../enums/mrmMonitoring.enum";

/**
 * One immutable revalidation-trigger firing.
 *
 * Every trigger firing is recorded — including no-ops where a revalidation was
 * already open for the model (created_validation = false, resulting_validation_id
 * points at the already-open task or is null). `resulting_validation_id` is null
 * when the firing did not associate with any validation task (or the task was
 * later deleted — ON DELETE SET NULL). `source_ref` carries optional audit
 * context (breach evaluation id, change record, old/new tier).
 *
 * Tenant-scoped by organization_id.
 */
export interface IMrmRevalidationEvent {
  id?: number;
  organization_id: number;
  model_inventory_id: number;
  trigger_source: MrmRevalidationTriggerSource;
  reason?: string;
  resulting_validation_id?: number;
  created_validation: boolean;
  source_ref?: Record<string, unknown>;
  fired_at?: Date;
  created_at?: Date;
}
