/**
 * Runs the shared intake form logic cases. The Vitest runner in
 * Clients/src/application/utils/intakeFormLogic/__tests__ runs the same file
 * against the client copy, so both sides behave the same.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  cleanSubmission,
  evaluateForm,
  evaluateFormula,
  firstMissingVisibleInput,
  parseFormula,
  validateSchemaLogic,
} from "..";

type FormulaCase = { formula?: string; formulaParts?: Array<[string, number]> };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cases: any = JSON.parse(
  readFileSync(resolve(__dirname, "../__fixtures__/intakeFormLogic.cases.json"), "utf8"),
);

const formulaOf = (c: FormulaCase): string =>
  c.formulaParts ? c.formulaParts.map(([text, times]) => text.repeat(times)).join("") : c.formula!;

describe("intake form logic cases", () => {
  describe("parseFormula", () => {
    it.each(cases.parse)("$name", (c: any) => {
      const result = parseFormula(formulaOf(c));
      expect(result.ok).toBe(c.ok);
      if (result.ok) expect(result.refs).toEqual(c.refs);
      else expect(result.position).toBe(c.position);
    });
  });

  describe("evaluateFormula", () => {
    it.each(cases.evaluateFormula)("$name", (c: any) => {
      const parsed = parseFormula(c.formula);
      if (!parsed.ok) throw new Error(`fixture formula does not parse: ${c.formula}`);
      const result = evaluateFormula(parsed.ast, c.values, c.decimals);
      expect(Object.is(result, c.expected)).toBe(true);
    });
  });

  describe("evaluateForm", () => {
    it.each(cases.evaluateForm)("$name", (c: any) => {
      // "anyOrder" cases must give the same result with the fields in reverse order.
      const layouts = c.anyOrder
        ? [
            c.fields,
            c.fields.map((field: any, i: number) => ({ ...field, order: c.fields.length - 1 - i })),
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
    it.each(cases.cleanSubmission)("$name", (c: any) => {
      expect({ ...cleanSubmission({ fields: c.fields }, c.answers).data }).toEqual(c.data);
    });
  });

  describe("firstMissingVisibleInput", () => {
    it.each(cases.firstMissingVisibleInput)("$name", (c: any) => {
      const schema = { fields: c.fields };
      const evaluation = evaluateForm(schema, c.answers);
      expect(firstMissingVisibleInput(schema, evaluation, c.fieldId)).toBe(c.expected);
    });
  });

  describe("validateSchemaLogic", () => {
    it.each(cases.validateSchemaLogic)("$name", (c: any) => {
      const errors = validateSchemaLogic({ fields: c.fields }, c.entityType);
      expect(Array.from(new Set(errors.map((e) => e.fieldId))).sort()).toEqual(c.errorFieldIds);
      for (const message of c.messages ?? []) {
        expect(errors.map((e) => e.message)).toContain(message);
      }
      for (const error of errors) expect(error.message).toMatch(/^Field "/);
    });
  });
});
