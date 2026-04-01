/**
 * Client-side FAIR calculator — mirrors backend computeDerivedFields()
 * for live preview in the QuantitativeRiskForm.
 */

import { IQuantitativeRiskFields } from "../../domain/interfaces/i.quantitativeRisk";

/** PERT weighted average: (min + 4*likely + max) / 6 */
export function pertEstimate(
  min: number | null | undefined,
  likely: number | null | undefined,
  max: number | null | undefined
): number | null {
  if (min == null || likely == null || max == null) return null;
  return (min + 4 * likely + max) / 6;
}

/** Sum of PERT estimates for all 4 loss categories */
export function computeTotalLoss(fields: Partial<IQuantitativeRiskFields>): number | null {
  const categories = [
    { min: fields.loss_regulatory_min, likely: fields.loss_regulatory_likely, max: fields.loss_regulatory_max },
    { min: fields.loss_operational_min, likely: fields.loss_operational_likely, max: fields.loss_operational_max },
    { min: fields.loss_litigation_min, likely: fields.loss_litigation_likely, max: fields.loss_litigation_max },
    { min: fields.loss_reputational_min, likely: fields.loss_reputational_likely, max: fields.loss_reputational_max },
  ];

  let total = 0;
  let hasAny = false;

  for (const cat of categories) {
    const est = pertEstimate(cat.min, cat.likely, cat.max);
    if (est != null) {
      total += est;
      hasAny = true;
    }
  }

  return hasAny ? total : null;
}

/** ALE = PERT(frequency) × total_loss */
export function computeALE(fields: Partial<IQuantitativeRiskFields>): number | null {
  const freq = pertEstimate(
    fields.event_frequency_min,
    fields.event_frequency_likely,
    fields.event_frequency_max
  );
  const totalLoss = computeTotalLoss(fields);

  if (freq == null || totalLoss == null) return null;
  return freq * totalLoss;
}

/** Residual ALE = ALE × (1 - control_effectiveness / 100) */
export function computeResidualALE(
  ale: number | null,
  controlEffectiveness: number | null | undefined
): number | null {
  if (ale == null) return null;
  if (controlEffectiveness == null) return ale;
  return ale * (1 - controlEffectiveness / 100);
}

/** ROI = ((ALE - residualALE) - mitigationCost) / mitigationCost × 100 */
export function computeROI(
  ale: number | null,
  residualALE: number | null,
  mitigationCost: number | null | undefined
): number | null {
  if (ale == null || residualALE == null || mitigationCost == null || mitigationCost === 0) {
    return null;
  }
  return ((ale - residualALE) - mitigationCost) / mitigationCost * 100;
}

/**
 * Compute all derived FAIR fields from input fields.
 * Used for live preview in the form.
 */
export function computeDerivedFields(fields: Partial<IQuantitativeRiskFields>): {
  total_loss_likely: number | null;
  ale_estimate: number | null;
  residual_ale: number | null;
  roi_percentage: number | null;
} {
  const totalLoss = computeTotalLoss(fields);
  const ale = computeALE(fields);
  const residual = computeResidualALE(ale, fields.control_effectiveness);
  const roi = computeROI(ale, residual, fields.mitigation_cost_annual);

  return {
    total_loss_likely: totalLoss,
    ale_estimate: ale,
    residual_ale: residual,
    roi_percentage: roi,
  };
}

/** Format a number as currency string */
export function formatCurrency(value: number | null | undefined, currency = "USD"): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/** Format a percentage value */
export function formatPercentage(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toFixed(1)}%`;
}
