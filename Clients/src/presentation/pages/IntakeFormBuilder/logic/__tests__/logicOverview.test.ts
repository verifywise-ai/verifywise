import { describe, it, expect } from "vitest";
import { buildLogicOverview } from "../logicOverview";
import type { FormField } from "../../types";

const COUNTRY: FormField = {
  id: "country",
  type: "select",
  label: "Country",
  order: 0,
  options: [
    { value: "eu", label: "EU" },
    { value: "us", label: "United States" },
  ],
};
const COST: FormField = { id: "cost", type: "number", label: "Monthly cost", order: 1 };
const ANNUAL: FormField = {
  id: "annual",
  type: "calculated",
  label: "Annual cost",
  order: 2,
  formula: "{cost} * 12",
};
const GDPR: FormField = {
  id: "gdpr",
  type: "text",
  label: "GDPR contact",
  order: 3,
  riskDimension: "data_sensitivity",
  visibility: {
    match: "any",
    conditions: [
      { fieldId: "country", operator: "equals", value: "eu" },
      { fieldId: "annual", operator: "gt", value: 1000 },
      { fieldId: "gone", operator: "is_not_empty" },
    ],
  },
};

describe("buildLogicOverview", () => {
  it("lists calculations with field names instead of ids", () => {
    const { calculations } = buildLogicOverview([ANNUAL, COST, COUNTRY, GDPR]);
    expect(calculations).toEqual([
      { fieldId: "annual", fieldLabel: "Annual cost", errors: [], formula: "= Monthly cost × 12" },
    ]);
  });

  it("words each rule condition with labels, option labels and the combinator", () => {
    const { rules } = buildLogicOverview([COUNTRY, COST, ANNUAL, GDPR]);
    expect(rules).toHaveLength(1);
    expect(rules[0].summary).toBe("Shown when any condition matches");
    expect(rules[0].conditions).toEqual([
      { field: "Country", operator: "is", value: "EU" },
      { field: "Annual cost", operator: ">", value: "1000" },
      { field: "missing field", operator: "is not empty", value: "" },
    ]);
  });

  it("lists risk dimension tags with their names", () => {
    const { riskTags } = buildLogicOverview([COUNTRY, GDPR]);
    expect(riskTags).toHaveLength(1);
    expect(riskTags[0].fieldLabel).toBe("GDPR contact");
    expect(riskTags[0].dimension).not.toBe("data_sensitivity");
  });

  it("shows a field's errors once, on its first row, without the field prefix", () => {
    const tagged = { ...ANNUAL, riskDimension: "data_sensitivity" };
    const overview = buildLogicOverview(
      [COST, tagged],
      [{ fieldId: "annual", message: 'Field "Annual cost": broken' }],
    );
    expect(overview.calculations[0].errors).toEqual(["broken"]);
    expect(overview.riskTags[0].errors).toEqual([]);
  });

  it("lists errors on fields with no logic row under other problems", () => {
    const { otherProblems } = buildLogicOverview(
      [COUNTRY, COST],
      [{ fieldId: "country", message: 'Field "Country": two options share a value' }],
    );
    expect(otherProblems).toEqual([
      { fieldId: "country", fieldLabel: "Country", errors: ["two options share a value"] },
    ]);
  });

  it("is empty for a form without logic", () => {
    expect(buildLogicOverview([COUNTRY, COST])).toEqual({
      calculations: [],
      rules: [],
      riskTags: [],
      otherProblems: [],
    });
  });

  it("follows form order", () => {
    const later = { ...ANNUAL, id: "later", label: "Later", order: 9 };
    const { calculations } = buildLogicOverview([later, COST, ANNUAL]);
    expect(calculations.map((row) => row.fieldId)).toEqual(["annual", "later"]);
  });
});
