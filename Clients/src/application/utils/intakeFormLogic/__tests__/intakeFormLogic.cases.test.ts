import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  cleanSubmission,
  evaluateForm,
  evaluateFormula,
  firstMissingVisibleInput,
  parseFormula,
  validateSchemaLogic,
  REQUIRED_ENTITY_FIELDS,
} from "..";
import { ENTITY_FIELD_MAPPINGS } from "../../../../presentation/pages/IntakeFormBuilder/types";

// The cases live with the server module; both suites run the same file.
// Resolve with node:path, as src/i18n/__tests__/euAiActQuestionnaire.translations.test.ts
// does: Vite refuses `new URL(..., import.meta.url)` for files outside Clients/.
const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = resolve(HERE, "../../../../../../Servers/services/intakeFormLogic");
const CLIENT_DIR = resolve(HERE, "..");
const MODULE_FILES = [
  "types.ts",
  "formula.ts",
  "conditions.ts",
  "evaluate.ts",
  "validate.ts",
  "index.ts",
];

// One record per case; field shapes vary by section.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cases: Record<string, Array<Record<string, any>>> = JSON.parse(
  readFileSync(resolve(SERVER_DIR, "__fixtures__/intakeFormLogic.cases.json"), "utf8"),
);

type FormulaCase = { formula?: string; formulaParts?: Array<[string, number]> };
const formulaOf = (c: FormulaCase): string =>
  c.formulaParts ? c.formulaParts.map(([text, times]) => text.repeat(times)).join("") : c.formula!;

describe("intake form logic cases (client copy)", () => {
  it.each(MODULE_FILES)("%s is identical to the server copy", (file) => {
    expect(readFileSync(resolve(CLIENT_DIR, file), "utf8")).toBe(
      readFileSync(resolve(SERVER_DIR, file), "utf8"),
    );
  });

  it("REQUIRED_ENTITY_FIELDS matches entityRequired in ENTITY_FIELD_MAPPINGS", () => {
    for (const [entityType, mappings] of Object.entries(ENTITY_FIELD_MAPPINGS)) {
      expect(REQUIRED_ENTITY_FIELDS[entityType]).toEqual(
        mappings.filter((mapping) => mapping.entityRequired).map((mapping) => mapping.field),
      );
    }
  });

  describe("parseFormula", () => {
    it.each(cases.parse)("$name", (c) => {
      const result = parseFormula(formulaOf(c));
      expect(result.ok).toBe(c.ok);
      if (result.ok) expect(result.refs).toEqual(c.refs);
      else expect(result.position).toBe(c.position);
    });
  });

  describe("evaluateFormula", () => {
    it.each(cases.evaluateFormula)("$name", (c) => {
      const parsed = parseFormula(c.formula);
      if (!parsed.ok) throw new Error(`fixture formula does not parse: ${c.formula}`);
      expect(Object.is(evaluateFormula(parsed.ast, c.values, c.decimals), c.expected)).toBe(true);
    });
  });

  describe("evaluateForm", () => {
    it.each(cases.evaluateForm)("$name", (c) => {
      // "anyOrder" cases must give the same result with the fields in reverse order.
      const layouts = c.anyOrder
        ? [
            c.fields,
            c.fields.map((field: object, i: number) => ({
              ...field,
              order: c.fields.length - 1 - i,
            })),
          ]
        : [c.fields];
      for (const fields of layouts) {
        const result = evaluateForm({ fields }, c.answers);
        expect(Array.from(result.visibleIds).sort()).toEqual(c.visibleIds);
        expect({ ...result.calculated }).toEqual(c.calculated);
      }
    });
  });

  describe("cleanSubmission", () => {
    it.each(cases.cleanSubmission)("$name", (c) => {
      expect({ ...cleanSubmission({ fields: c.fields }, c.answers).data }).toEqual(c.data);
    });
  });

  describe("firstMissingVisibleInput", () => {
    it.each(cases.firstMissingVisibleInput)("$name", (c) => {
      const schema = { fields: c.fields };
      expect(firstMissingVisibleInput(schema, evaluateForm(schema, c.answers), c.fieldId)).toBe(
        c.expected,
      );
    });
  });

  describe("validateSchemaLogic", () => {
    it.each(cases.validateSchemaLogic)("$name", (c) => {
      const errors = validateSchemaLogic({ fields: c.fields }, c.entityType);
      expect(Array.from(new Set(errors.map((e) => e.fieldId))).sort()).toEqual(c.errorFieldIds);
      for (const message of c.messages ?? []) {
        expect(errors.map((e) => e.message)).toContain(message);
      }
    });
  });
});
