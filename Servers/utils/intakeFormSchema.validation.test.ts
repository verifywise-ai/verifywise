import { describe, it, expect } from "@jest/globals";
import { validateIntakeFormSchemaLabels } from "./intakeFormSchema.validation";
import { IIntakeFormField } from "../domain.layer/interfaces/i.intakeForm";

/**
 * The public intake form is rendered from these definitions, so an empty label
 * in the data is an unlabelled input in the DOM. These tests pin the contract
 * the API enforces on create/update.
 */

function field(overrides: Partial<IIntakeFormField> = {}): IIntakeFormField {
  return {
    id: "company_name",
    type: "text",
    label: "Company name",
    required: true,
    order: 1,
    ...overrides,
  };
}

function schema(fields: IIntakeFormField[]) {
  return { version: "1.0", fields };
}

describe("validateIntakeFormSchemaLabels", () => {
  describe("schemas it accepts", () => {
    it("accepts a well-formed schema", () => {
      expect(validateIntakeFormSchemaLabels(schema([field()]))).toEqual([]);
    });

    it("accepts an absent schema — a form may be created before its fields exist", () => {
      expect(validateIntakeFormSchemaLabels(undefined)).toEqual([]);
      expect(validateIntakeFormSchemaLabels(null)).toEqual([]);
    });

    it("accepts a schema with no fields key and one with an empty field list", () => {
      expect(validateIntakeFormSchemaLabels({ version: "1.0" })).toEqual([]);
      expect(validateIntakeFormSchemaLabels(schema([]))).toEqual([]);
    });

    it("accepts a label that merely repeats the placeholder", () => {
      // Duplicating the placeholder is a readability smell, not an accessibility
      // failure — the control still has a name. Rejecting it here would break
      // legitimate forms such as label "Email" with placeholder "Email".
      const result = validateIntakeFormSchemaLabels(
        schema([field({ label: "Email", placeholder: "Email" })]),
      );
      expect(result).toEqual([]);
    });
  });

  describe("labels that would render an unnamed control", () => {
    it("rejects an empty label", () => {
      expect(validateIntakeFormSchemaLabels(schema([field({ label: "" })]))).toEqual([
        'Field "company_name" must have a non-empty label',
      ]);
    });

    it("rejects a whitespace-only label", () => {
      expect(validateIntakeFormSchemaLabels(schema([field({ label: "   \t\n " })]))).toEqual([
        'Field "company_name" must have a non-empty label',
      ]);
    });

    it("rejects a missing label, which the type system allows through as undefined", () => {
      const bare = { id: "company_name", type: "text", required: true, order: 1 };
      expect(validateIntakeFormSchemaLabels(schema([bare as IIntakeFormField]))).toEqual([
        'Field "company_name" must have a non-empty label',
      ]);
    });

    it("rejects an empty id — the label cannot be associated without one", () => {
      const result = validateIntakeFormSchemaLabels(schema([field({ id: "" })]));
      expect(result).toEqual(["Field 1 must have a non-empty id"]);
    });

    it("reports every offending field, not just the first", () => {
      const result = validateIntakeFormSchemaLabels(
        schema([
          field({ id: "a", label: "" }),
          field({ id: "b", label: "Fine" }),
          field({ id: "c", label: "  " }),
        ]),
      );
      expect(result).toEqual([
        'Field "a" must have a non-empty label',
        'Field "c" must have a non-empty label',
      ]);
    });
  });

  describe("select and multiselect options", () => {
    it("accepts options that all carry text", () => {
      const result = validateIntakeFormSchemaLabels(
        schema([
          field({
            id: "tier",
            type: "select",
            label: "Risk tier",
            options: [
              { value: "high", label: "High" },
              { value: "low", label: "Low" },
            ],
          }),
        ]),
      );
      expect(result).toEqual([]);
    });

    it("rejects an option with an empty label, which renders a blank choice", () => {
      const result = validateIntakeFormSchemaLabels(
        schema([
          field({
            id: "tier",
            type: "select",
            label: "Risk tier",
            options: [
              { value: "high", label: "High" },
              { value: "low", label: "" },
            ],
          }),
        ]),
      );
      expect(result).toEqual(['Field "tier" option 2 must have a non-empty label']);
    });

    it("rejects a select with no options at all", () => {
      const result = validateIntakeFormSchemaLabels(
        schema([field({ id: "tier", type: "select", label: "Risk tier" })]),
      );
      expect(result).toEqual(['Field "tier" is a select and must have at least one option']);
    });

    it("applies the same rule to multiselect", () => {
      const result = validateIntakeFormSchemaLabels(
        schema([
          field({
            id: "regions",
            type: "multiselect",
            label: "Regions",
            options: [{ value: "eu", label: "  " }],
          }),
        ]),
      );
      expect(result).toEqual(['Field "regions" option 1 must have a non-empty label']);
    });

    it("does not require options on field types that have none", () => {
      expect(validateIntakeFormSchemaLabels(schema([field({ type: "textarea" })]))).toEqual([]);
    });
  });

  describe("malformed input", () => {
    it("rejects a schema that is not an object", () => {
      expect(validateIntakeFormSchemaLabels("nope")).toEqual(["Form schema must be an object"]);
      expect(validateIntakeFormSchemaLabels([])).toEqual(["Form schema must be an object"]);
    });

    it("rejects a fields value that is not an array", () => {
      expect(validateIntakeFormSchemaLabels({ version: "1.0", fields: {} })).toEqual([
        "Form schema fields must be an array",
      ]);
    });

    it("rejects a null entry in the fields array", () => {
      const result = validateIntakeFormSchemaLabels(schema([null as unknown as IIntakeFormField]));
      expect(result).toEqual(["Field 1 is not a valid field definition"]);
    });
  });
});
