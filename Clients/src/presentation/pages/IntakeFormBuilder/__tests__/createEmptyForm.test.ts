import { describe, it, expect } from "vitest";
import { IntakeEntityType } from "../../../../domain/intake/enums";
import { createEmptyForm } from "../types";

describe("createEmptyForm", () => {
  it("starts a new use case form with the EU AI Act step on", () => {
    const form = createEmptyForm(IntakeEntityType.USE_CASE);
    expect(form.euAiActRiskStepEnabled).toBe(true);
  });

  it("leaves out the risk level and role questions from the use case template", () => {
    const mappings = createEmptyForm(IntakeEntityType.USE_CASE).schema.fields.map(
      (f) => f.entityFieldMapping,
    );
    expect(mappings).not.toContain("ai_risk_classification");
    expect(mappings).not.toContain("type_of_high_risk_role");
  });

  it("numbers the use case template fields without gaps", () => {
    const orders = createEmptyForm(IntakeEntityType.USE_CASE).schema.fields.map((f) => f.order);
    expect(orders).toEqual(orders.map((_, i) => i));
  });

  it("keeps the EU AI Act step off for a new model form", () => {
    expect(createEmptyForm(IntakeEntityType.MODEL).euAiActRiskStepEnabled).toBe(false);
  });
});
