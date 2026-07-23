/**
 * A registered metric key in an org's catalogue (e.g. `psi`, `auc`). Thresholds
 * attach to known keys and the UI offers them; unknown keys are still accepted
 * at ingestion (stored + flagged "no threshold defined").
 */
export interface IMrmMetricKey {
  id?: number;
  organization_id: number;
  key: string;
  display_name?: string;
  created_at?: Date;
}
