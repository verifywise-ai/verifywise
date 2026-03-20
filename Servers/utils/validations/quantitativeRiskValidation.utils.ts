/**
 * Quantitative Risk Validation Utilities
 *
 * Validates FAIR-inspired quantitative risk fields:
 * - Three-point estimates: min ≤ likely ≤ max
 * - Non-negative values for frequencies and losses
 * - Control effectiveness: 0-100%
 * - Mitigation cost: non-negative
 */

import {
  validateNumber,
  ValidationError,
} from "./validation.utils";

/**
 * Validate a three-point estimate (min ≤ likely ≤ max).
 * All three fields are optional, but if any is provided, consistency is checked.
 */
function validateThreePointEstimate(
  min: unknown,
  likely: unknown,
  max: unknown,
  fieldPrefix: string
): ValidationError[] {
  const errors: ValidationError[] = [];

  const minResult = validateNumber(min, `${fieldPrefix}_min`, { min: 0 });
  if (!minResult.isValid) {
    errors.push({
      field: `${fieldPrefix}_min`,
      message: minResult.message || "Invalid value",
      code: minResult.code || "INVALID_NUMBER",
    });
  }

  const likelyResult = validateNumber(likely, `${fieldPrefix}_likely`, { min: 0 });
  if (!likelyResult.isValid) {
    errors.push({
      field: `${fieldPrefix}_likely`,
      message: likelyResult.message || "Invalid value",
      code: likelyResult.code || "INVALID_NUMBER",
    });
  }

  const maxResult = validateNumber(max, `${fieldPrefix}_max`, { min: 0 });
  if (!maxResult.isValid) {
    errors.push({
      field: `${fieldPrefix}_max`,
      message: maxResult.message || "Invalid value",
      code: maxResult.code || "INVALID_NUMBER",
    });
  }

  // If all three are provided, check ordering
  if (errors.length === 0) {
    const minVal = min != null ? Number(min) : null;
    const likelyVal = likely != null ? Number(likely) : null;
    const maxVal = max != null ? Number(max) : null;

    if (minVal != null && likelyVal != null && minVal > likelyVal) {
      errors.push({
        field: `${fieldPrefix}_min`,
        message: `${fieldPrefix}_min must be ≤ ${fieldPrefix}_likely`,
        code: "INVALID_RANGE_ORDER",
      });
    }

    if (likelyVal != null && maxVal != null && likelyVal > maxVal) {
      errors.push({
        field: `${fieldPrefix}_likely`,
        message: `${fieldPrefix}_likely must be ≤ ${fieldPrefix}_max`,
        code: "INVALID_RANGE_ORDER",
      });
    }

    if (minVal != null && maxVal != null && minVal > maxVal) {
      errors.push({
        field: `${fieldPrefix}_min`,
        message: `${fieldPrefix}_min must be ≤ ${fieldPrefix}_max`,
        code: "INVALID_RANGE_ORDER",
      });
    }
  }

  return errors;
}

/**
 * Validate all FAIR quantitative fields on a risk.
 * Returns an array of validation errors (empty if valid).
 *
 * All fields are optional — only provided fields are validated.
 */
export function validateQuantitativeRiskFields(data: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  // Event Frequency
  errors.push(
    ...validateThreePointEstimate(
      data.event_frequency_min,
      data.event_frequency_likely,
      data.event_frequency_max,
      "event_frequency"
    )
  );

  // Loss Magnitude: Regulatory
  errors.push(
    ...validateThreePointEstimate(
      data.loss_regulatory_min,
      data.loss_regulatory_likely,
      data.loss_regulatory_max,
      "loss_regulatory"
    )
  );

  // Loss Magnitude: Operational
  errors.push(
    ...validateThreePointEstimate(
      data.loss_operational_min,
      data.loss_operational_likely,
      data.loss_operational_max,
      "loss_operational"
    )
  );

  // Loss Magnitude: Litigation
  errors.push(
    ...validateThreePointEstimate(
      data.loss_litigation_min,
      data.loss_litigation_likely,
      data.loss_litigation_max,
      "loss_litigation"
    )
  );

  // Loss Magnitude: Reputational
  errors.push(
    ...validateThreePointEstimate(
      data.loss_reputational_min,
      data.loss_reputational_likely,
      data.loss_reputational_max,
      "loss_reputational"
    )
  );

  // Control effectiveness: 0-100%
  if (data.control_effectiveness != null) {
    const ceResult = validateNumber(data.control_effectiveness, "control_effectiveness", {
      min: 0,
      max: 100,
    });
    if (!ceResult.isValid) {
      errors.push({
        field: "control_effectiveness",
        message: ceResult.message || "Must be between 0 and 100",
        code: ceResult.code || "INVALID_NUMBER",
      });
    }
  }

  // Mitigation cost: non-negative
  if (data.mitigation_cost_annual != null) {
    const mcResult = validateNumber(data.mitigation_cost_annual, "mitigation_cost_annual", {
      min: 0,
    });
    if (!mcResult.isValid) {
      errors.push({
        field: "mitigation_cost_annual",
        message: mcResult.message || "Must be non-negative",
        code: mcResult.code || "INVALID_NUMBER",
      });
    }
  }

  // Currency: 3-character code
  if (data.currency != null && data.currency !== "") {
    const currency = String(data.currency);
    if (currency.length !== 3 || !/^[A-Z]{3}$/.test(currency)) {
      errors.push({
        field: "currency",
        message: "Currency must be a 3-letter ISO 4217 code (e.g., USD, EUR)",
        code: "INVALID_CURRENCY",
      });
    }
  }

  return errors;
}
