import { createEmptyForm, ENTITY_FIELD_MAPPINGS } from "../types";
import { IntakeEntityType } from "../../../../domain/intake/enums";

describe("AI app intake forms (#5193)", () => {
  it("starts with name, description and departments mapped to the AI app", () => {
    const form = createEmptyForm(IntakeEntityType.AI_APP);
    expect(form.entityType).toBe(IntakeEntityType.AI_APP);
    expect(form.schema.fields.map((f) => f.entityFieldMapping)).toEqual([
      "name",
      "description",
      "departments",
    ]);
    // The EU AI Act step belongs to use case forms only.
    expect(form.euAiActRiskStepEnabled).toBe(false);
  });

  it("offers the AI app fields approval copies, with the name required", () => {
    const mappings = ENTITY_FIELD_MAPPINGS[IntakeEntityType.AI_APP];
    expect(mappings.map((m) => m.field)).toEqual(["name", "description", "departments"]);
    expect(mappings.find((m) => m.field === "name")?.entityRequired).toBe(true);
  });
});
