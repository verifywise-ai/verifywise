import { describe, it, expect } from "vitest";
import {
  analyzeMappingCoverage,
  isRiskStepSetField,
  usedEntityMappingsFor,
  type FormField,
} from "../types";
import { IntakeEntityType } from "../../../../domain/intake/enums";
import type { ICustomFieldDefinition } from "../../../../domain/interfaces/i.customField";

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

  it.each(["select", "multiselect"] as const)(
    "accepts a %s question mapped to the roles",
    (type) => {
      const field: FormField = {
        id: "f1",
        type,
        label: "Your role",
        entityFieldMapping: ROLE,
        order: 0,
      };
      expect(analyzeMappingCoverage([field], IntakeEntityType.USE_CASE).typeMismatches).toEqual([]);
    },
  );
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

describe("analyzeMappingCoverage with custom field mappings", () => {
  const definition = (
    field_key: string,
    field_type: ICustomFieldDefinition["field_type"],
  ): ICustomFieldDefinition => ({
    id: 1,
    organization_id: 1,
    entity_type: "model_inventory",
    field_key,
    label: field_key,
    field_type,
    options: null,
    required: false,
    created_by: null,
    created_at: "",
    updated_at: "",
  });
  const mapped = (type: FormField["type"], key: string): FormField => ({
    id: `q-${key}`,
    type,
    label: `Question ${key}`,
    entityFieldMapping: `custom_field:${key}`,
    order: 0,
  });

  it("reports a mapping whose custom field no longer exists", () => {
    const field = mapped("text", "gone");
    const { customFieldProblems } = analyzeMappingCoverage([field], IntakeEntityType.MODEL, {
      customFields: [],
    });
    expect(customFieldProblems).toEqual([{ formField: field, reason: "missing" }]);
  });

  it("reports a question whose type does not fit the custom field", () => {
    const field = mapped("text", "cost");
    const { customFieldProblems } = analyzeMappingCoverage([field], IntakeEntityType.MODEL, {
      customFields: [definition("cost", "number")],
    });
    expect(customFieldProblems).toEqual([{ formField: field, reason: "incompatible" }]);
  });

  it("reports nothing for a valid mapping and keeps it out of the entity checks", () => {
    const field = mapped("number", "cost");
    const coverage = analyzeMappingCoverage([field], IntakeEntityType.MODEL, {
      customFields: [definition("cost", "number")],
    });
    expect(coverage.customFieldProblems).toEqual([]);
    expect(coverage.typeMismatches).toEqual([]);
    const listed = [...coverage.missingRequired, ...coverage.missingOptional].map((m) => m.field);
    expect(listed).not.toContain("custom_field:cost");
  });

  it("reports nothing while the custom fields are still loading", () => {
    const { customFieldProblems } = analyzeMappingCoverage(
      [mapped("text", "gone")],
      IntakeEntityType.MODEL,
    );
    expect(customFieldProblems).toEqual([]);
  });
});
