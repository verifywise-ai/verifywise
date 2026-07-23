import { MrmBreachAction, MrmThresholdOp, MrmThresholdSeverity } from "../enums/mrmMonitoring.enum";

/**
 * A threshold definition, per (model, metric), optionally per segment/window.
 * gt/gte/lt/lte compare `value_num`; `outside` uses the band [value_lo, value_hi].
 */
export interface IMrmThreshold {
  id?: number;
  organization_id: number;
  model_inventory_id: number;
  metric: string;
  segment?: string; // null = 'overall'
  window?: string; // null = any window
  op: MrmThresholdOp;
  value_num?: number; // gt/gte/lt/lte
  value_lo?: number; // 'outside' band low
  value_hi?: number; // 'outside' band high
  severity: MrmThresholdSeverity;
  breach_action: MrmBreachAction;
  active: boolean;
  created_at?: Date;
  updated_at?: Date;
}
