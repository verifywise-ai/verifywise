import { describe, it, expect } from "vitest";
import {
  pertEstimate,
  computeTotalLoss,
  computeALE,
  computeResidualALE,
  computeROI,
  computeDerivedFields,
  formatCurrency,
  formatPercentage,
} from "../fairCalculator";
import { IQuantitativeRiskFields } from "../../../domain/interfaces/i.quantitativeRisk";

describe("pertEstimate", () => {
  it("computes (min + 4*likely + max) / 6", () => {
    // (1 + 4*3 + 5) / 6 = 18/6 = 3
    expect(pertEstimate(1, 3, 5)).toBe(3);
  });

  it("returns null when min is null", () => {
    expect(pertEstimate(null, 3, 5)).toBeNull();
  });

  it("returns null when likely is undefined", () => {
    expect(pertEstimate(1, undefined, 5)).toBeNull();
  });

  it("returns null when max is null", () => {
    expect(pertEstimate(1, 3, null)).toBeNull();
  });

  it("handles zero values correctly", () => {
    // (0 + 4*0 + 0) / 6 = 0
    expect(pertEstimate(0, 0, 0)).toBe(0);
  });

  it("handles asymmetric distributions", () => {
    // (10 + 4*20 + 100) / 6 = 190/6 ≈ 31.6667
    expect(pertEstimate(10, 20, 100)).toBeCloseTo(190 / 6);
  });
});

describe("computeTotalLoss", () => {
  const fullLossFields: Partial<IQuantitativeRiskFields> = {
    loss_regulatory_min: 100,
    loss_regulatory_likely: 200,
    loss_regulatory_max: 300,
    loss_operational_min: 50,
    loss_operational_likely: 100,
    loss_operational_max: 150,
    loss_litigation_min: 10,
    loss_litigation_likely: 20,
    loss_litigation_max: 30,
    loss_reputational_min: 5,
    loss_reputational_likely: 10,
    loss_reputational_max: 15,
  };

  it("sums PERT estimates of all 4 categories", () => {
    const expected =
      (100 + 4 * 200 + 300) / 6 +
      (50 + 4 * 100 + 150) / 6 +
      (10 + 4 * 20 + 30) / 6 +
      (5 + 4 * 10 + 15) / 6;
    expect(computeTotalLoss(fullLossFields)).toBeCloseTo(expected);
  });

  it("returns partial sum when some categories are incomplete", () => {
    const partial: Partial<IQuantitativeRiskFields> = {
      loss_regulatory_min: 100,
      loss_regulatory_likely: 200,
      loss_regulatory_max: 300,
      // other categories missing
    };
    expect(computeTotalLoss(partial)).toBeCloseTo((100 + 4 * 200 + 300) / 6);
  });

  it("returns null when no complete triples exist", () => {
    expect(computeTotalLoss({})).toBeNull();
    expect(computeTotalLoss({ loss_regulatory_min: 100 })).toBeNull();
  });
});

describe("computeALE", () => {
  it("computes frequency PERT * totalLoss", () => {
    const fields: Partial<IQuantitativeRiskFields> = {
      event_frequency_min: 1,
      event_frequency_likely: 2,
      event_frequency_max: 3,
      loss_regulatory_min: 1000,
      loss_regulatory_likely: 2000,
      loss_regulatory_max: 3000,
    };
    const freq = (1 + 4 * 2 + 3) / 6; // 2
    const loss = (1000 + 4 * 2000 + 3000) / 6; // 2000
    expect(computeALE(fields)).toBeCloseTo(freq * loss);
  });

  it("returns null when frequency is missing", () => {
    const fields: Partial<IQuantitativeRiskFields> = {
      loss_regulatory_min: 1000,
      loss_regulatory_likely: 2000,
      loss_regulatory_max: 3000,
    };
    expect(computeALE(fields)).toBeNull();
  });

  it("returns null when loss data is missing", () => {
    const fields: Partial<IQuantitativeRiskFields> = {
      event_frequency_min: 1,
      event_frequency_likely: 2,
      event_frequency_max: 3,
    };
    expect(computeALE(fields)).toBeNull();
  });
});

describe("computeResidualALE", () => {
  it("computes ALE * (1 - eff/100)", () => {
    expect(computeResidualALE(10000, 60)).toBeCloseTo(4000);
  });

  it("returns ALE when effectiveness is null", () => {
    expect(computeResidualALE(10000, null)).toBe(10000);
  });

  it("returns ALE when effectiveness is undefined", () => {
    expect(computeResidualALE(10000, undefined)).toBe(10000);
  });

  it("returns null when ALE is null", () => {
    expect(computeResidualALE(null, 60)).toBeNull();
  });

  it("returns 0 at 100% effectiveness", () => {
    expect(computeResidualALE(10000, 100)).toBe(0);
  });
});

describe("computeROI", () => {
  it("computes ((ALE - residualALE) - cost) / cost * 100", () => {
    // ((10000 - 4000) - 2000) / 2000 * 100 = 200
    expect(computeROI(10000, 4000, 2000)).toBeCloseTo(200);
  });

  it("returns null when cost is 0", () => {
    expect(computeROI(10000, 4000, 0)).toBeNull();
  });

  it("returns null when cost is null", () => {
    expect(computeROI(10000, 4000, null)).toBeNull();
  });

  it("returns null when ALE is null", () => {
    expect(computeROI(null, 4000, 2000)).toBeNull();
  });

  it("returns null when residualALE is null", () => {
    expect(computeROI(10000, null, 2000)).toBeNull();
  });
});

describe("computeDerivedFields", () => {
  it("computes all fields for complete input", () => {
    const fields: Partial<IQuantitativeRiskFields> = {
      event_frequency_min: 1,
      event_frequency_likely: 2,
      event_frequency_max: 3,
      loss_regulatory_min: 1000,
      loss_regulatory_likely: 2000,
      loss_regulatory_max: 3000,
      control_effectiveness: 50,
      mitigation_cost_annual: 500,
    };
    const result = computeDerivedFields(fields);

    expect(result.total_loss_likely).not.toBeNull();
    expect(result.ale_estimate).not.toBeNull();
    expect(result.residual_ale).not.toBeNull();
    expect(result.roi_percentage).not.toBeNull();
  });

  it("returns all null for empty input", () => {
    const result = computeDerivedFields({});
    expect(result.total_loss_likely).toBeNull();
    expect(result.ale_estimate).toBeNull();
    expect(result.residual_ale).toBeNull();
    expect(result.roi_percentage).toBeNull();
  });
});

describe("formatCurrency", () => {
  it("formats 1234 as $1,234", () => {
    expect(formatCurrency(1234)).toBe("$1,234");
  });

  it("returns em-dash for null", () => {
    expect(formatCurrency(null)).toBe("\u2014");
  });

  it("returns em-dash for undefined", () => {
    expect(formatCurrency(undefined)).toBe("\u2014");
  });

  it("formats 0 as $0", () => {
    expect(formatCurrency(0)).toBe("$0");
  });
});

describe("formatPercentage", () => {
  it("formats 12.34 as 12.3%", () => {
    expect(formatPercentage(12.34)).toBe("12.3%");
  });

  it("returns em-dash for null", () => {
    expect(formatPercentage(null)).toBe("\u2014");
  });

  it("returns em-dash for undefined", () => {
    expect(formatPercentage(undefined)).toBe("\u2014");
  });

  it("formats 0 as 0.0%", () => {
    expect(formatPercentage(0)).toBe("0.0%");
  });
});
