import { describe, it, expect } from "vitest";
import { analyzeMappingCoverage } from "../types";
import { IntakeEntityType } from "../../../../domain/intake/enums";

const RISK = "ai_risk_classification";

describe("analyzeMappingCoverage with the EU AI Act risk step", () => {
  it("lists the risk classification as optional-missing when the step is off", () => {
    const { missingOptional } = analyzeMappingCoverage([], IntakeEntityType.USE_CASE);
    expect(missingOptional.map((m) => m.field)).toContain(RISK);
  });

  it("omits the risk classification when the step is on", () => {
    const { missingOptional, missingRequired } = analyzeMappingCoverage(
      [],
      IntakeEntityType.USE_CASE,
      {
        riskStepEnabled: true,
      },
    );
    expect(missingOptional.map((m) => m.field)).not.toContain(RISK);
    expect(missingRequired.map((m) => m.field)).not.toContain(RISK);
    expect(missingOptional.length).toBeGreaterThan(0);
  });
});
