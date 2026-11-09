import { describe, it, expect } from "@jest/globals";
import {
  resolveEuAiActRiskStep,
  defaultEuAiActRiskStepEnabled,
} from "../intakeFormSchema.validation";

const field = (entityFieldMapping?: string) =>
  ({
    id: "f1",
    label: "Risk",
    type: "select",
    options: [{ label: "High", value: "high" }],
    entityFieldMapping,
  }) as any;

describe("resolveEuAiActRiskStep", () => {
  it("allows the step on a use case form without a risk mapping", () => {
    expect(
      resolveEuAiActRiskStep({
        entityType: "use_case",
        enabled: true,
        schema: { version: "1.0", fields: [field("goal")] } as any,
      }),
    ).toEqual({ enabled: true, errors: [] });
  });

  it("forces the step off on a model form", () => {
    expect(resolveEuAiActRiskStep({ entityType: "model", enabled: true, schema: null })).toEqual({
      enabled: false,
      errors: [],
    });
  });

  it("rejects the step together with a question mapped to ai_risk_classification", () => {
    expect(
      resolveEuAiActRiskStep({
        entityType: "use_case",
        enabled: true,
        schema: { version: "1.0", fields: [field("ai_risk_classification")] } as any,
      }),
    ).toEqual({
      enabled: true,
      errors: [
        "Remove the AI risk classification mapping from the form's questions before turning on the EU AI Act risk classification step",
      ],
    });
  });

  it("allows a risk mapping when the step is off", () => {
    expect(
      resolveEuAiActRiskStep({
        entityType: "use_case",
        enabled: false,
        schema: { version: "1.0", fields: [field("ai_risk_classification")] } as any,
      }),
    ).toEqual({ enabled: false, errors: [] });
  });
});

describe("defaultEuAiActRiskStepEnabled", () => {
  it("is on for a use case form without a risk mapping", () => {
    expect(
      defaultEuAiActRiskStepEnabled("use_case", { version: "1.0", fields: [field("goal")] } as any),
    ).toBe(true);
  });

  it("is off for a use case form that maps a question to the AI risk classification", () => {
    expect(
      defaultEuAiActRiskStepEnabled("use_case", {
        version: "1.0",
        fields: [field("ai_risk_classification")],
      } as any),
    ).toBe(false);
  });

  it("is off for a model form", () => {
    expect(defaultEuAiActRiskStepEnabled("model", null)).toBe(false);
  });
});
