import { describe, it, expect } from "vitest";
import {
  analyzeMappingCoverage,
  isRiskStepSetField,
  usedEntityMappingsFor,
  type FormField,
} from "../types";
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

describe("analyzeMappingCoverage type checks with the EU AI Act risk step on", () => {
  it.each([RISK, ROLE])("still flags a non-select field mapped to %s", (mapping) => {
    const field: FormField = {
      id: "f1",
      type: "text",
      label: "Mapped field",
      entityFieldMapping: mapping,
      order: 0,
    };
    const { typeMismatches } = analyzeMappingCoverage([field], IntakeEntityType.USE_CASE, {
      riskStepEnabled: true,
    });
    expect(typeMismatches.map((m) => m.entityMapping.field)).toEqual([mapping]);
  });
});

describe("usedEntityMappingsFor", () => {
  const fields: FormField[] = [
    { id: "a", type: "select", label: "Role", entityFieldMapping: ROLE, order: 0 },
    { id: "b", type: "text", label: "Name", entityFieldMapping: "project_title", order: 1 },
  ];

  it("blocks the risk classification and role while the step is on", () => {
    const used = usedEntityMappingsFor(fields, "b", true);
    expect(used).toEqual(expect.arrayContaining([RISK, ROLE]));
    expect(used).not.toContain("project_title");
  });

  it("only blocks mappings taken by other fields while the step is off", () => {
    expect(usedEntityMappingsFor(fields, "a", false)).toEqual(["project_title"]);
  });
});

describe("isRiskStepSetField", () => {
  it("is true for the risk classification and the high-risk role", () => {
    expect(isRiskStepSetField(RISK)).toBe(true);
    expect(isRiskStepSetField(ROLE)).toBe(true);
  });

  it("is false for other mappings and for no mapping", () => {
    expect(isRiskStepSetField("project_title")).toBe(false);
    expect(isRiskStepSetField(undefined)).toBe(false);
  });
});
