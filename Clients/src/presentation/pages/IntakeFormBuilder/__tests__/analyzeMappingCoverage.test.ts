import { describe, it, expect } from "vitest";
import { analyzeMappingCoverage } from "../types";
import { IntakeEntityType } from "../../../../domain/intake/enums";

const RISK = "ai_risk_classification";
const ROLE = "type_of_high_risk_role";

describe("analyzeMappingCoverage with the EU AI Act risk step", () => {
  it("lists the risk classification and role as optional-missing when the step is off", () => {
    const { missingOptional } = analyzeMappingCoverage([], IntakeEntityType.USE_CASE);
    expect(missingOptional.map((m) => m.field)).toEqual(expect.arrayContaining([RISK, ROLE]));
  });

  it("omits the risk classification and role when the step is on", () => {
    const { missingOptional, missingRequired } = analyzeMappingCoverage(
      [],
      IntakeEntityType.USE_CASE,
      {
        riskStepEnabled: true,
      },
    );
    expect(missingOptional.map((m) => m.field)).not.toContain(RISK);
    expect(missingRequired.map((m) => m.field)).not.toContain(RISK);
    expect(missingOptional.map((m) => m.field)).not.toContain(ROLE);
    expect(missingRequired.map((m) => m.field)).not.toContain(ROLE);
    expect(missingOptional.length).toBeGreaterThan(0);
  });
});
