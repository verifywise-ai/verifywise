import {
  customFieldKeyOf,
  customFieldMapping,
  isCompatibleCustomFieldType,
  isCustomFieldMapping,
  INTAKE_CUSTOM_FIELD_ENTITY,
} from "..";

describe("custom field mapping helpers", () => {
  it("recognises a prefixed mapping with a key", () => {
    expect(isCustomFieldMapping("custom_field:risk_owner")).toBe(true);
    expect(isCustomFieldMapping("custom_field:")).toBe(false);
    expect(isCustomFieldMapping("name")).toBe(false);
    expect(isCustomFieldMapping(undefined)).toBe(false);
    expect(isCustomFieldMapping(null)).toBe(false);
  });

  it("round-trips the key", () => {
    expect(customFieldKeyOf(customFieldMapping("x"))).toBe("x");
  });

  it("checks question and field type pairs", () => {
    expect(isCompatibleCustomFieldType("select", "scored_select")).toBe(true);
    expect(isCompatibleCustomFieldType("select", "select")).toBe(true);
    expect(isCompatibleCustomFieldType("checkbox", "boolean")).toBe(true);
    expect(isCompatibleCustomFieldType("text", "text")).toBe(true);
    expect(isCompatibleCustomFieldType("number", "number")).toBe(true);
    expect(isCompatibleCustomFieldType("date", "date")).toBe(true);
    expect(isCompatibleCustomFieldType("multiselect", "multiselect")).toBe(true);
    expect(isCompatibleCustomFieldType("textarea", "text")).toBe(false);
    expect(isCompatibleCustomFieldType("number", "text")).toBe(false);
    expect(isCompatibleCustomFieldType("constructor", "text")).toBe(false);
  });

  it("maps intake entity types to custom field entities", () => {
    expect(INTAKE_CUSTOM_FIELD_ENTITY).toEqual({
      model: "model_inventory",
      use_case: "project",
      ai_app: "ai_app",
    });
  });
});
