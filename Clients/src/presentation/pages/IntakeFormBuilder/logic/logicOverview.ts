import { describeFormula } from "../../../../application/utils/intakeAnswerFormat";
import {
  sortFields,
  type ConditionOperator,
  type SchemaLogicError,
} from "../../../../application/utils/intakeFormLogic";
import { operatorLabel, visibilitySummary } from "../VisibilityEditor";
import { RISK_DIMENSION_OPTIONS, type FormField } from "../types";

/** One condition of a show/hide rule, split so each part can be shown and translated. */
export interface ConditionText {
  /** The field the condition reads; "missing field" when it was removed. */
  field: string;
  operator: string;
  /** Empty for operators without a value, such as "is empty". */
  value: string;
}

interface LogicRowBase {
  fieldId: string;
  fieldLabel: string;
  /**
   * Messages from the save checks for this field, without the leading
   * `Field "<label>":`. Only on the field's first row, so they show once.
   */
  errors: string[];
}

export interface CalculationRow extends LogicRowBase {
  /** "= Monthly cost × 12", with labels instead of field ids. */
  formula: string;
}

export interface RuleRow extends LogicRowBase {
  /** visibilitySummary wording: "Shown when all conditions match". */
  summary: string;
  conditions: ConditionText[];
}

export interface RiskTagRow extends LogicRowBase {
  dimension: string;
}

export interface LogicOverview {
  calculations: CalculationRow[];
  rules: RuleRow[];
  riskTags: RiskTagRow[];
  /** Fields with save-check problems but no calculation, rule or tag to show them on. */
  otherProblems: LogicRowBase[];
}

/** Shown for a condition on a field that was removed, as describeFormula does. */
export const MISSING_FIELD = "missing field";

function valueText(value: unknown, ref: FormField | undefined): string {
  const label = (item: unknown) =>
    ref?.options?.find((option) => option.value === item)?.label ?? String(item);
  if (Array.isArray(value)) return value.map(label).join(", ");
  if (value === undefined || value === null || value === "") return "";
  return ref?.options ? label(value) : String(value);
}

/**
 * Every calculation, show/hide rule and risk dimension tag on the form, in
 * form order, worded with field labels. Errors come from validateSchemaLogic.
 */
export function buildLogicOverview(
  fields: FormField[],
  errors: SchemaLogicError[] = [],
): LogicOverview {
  const sorted = sortFields(fields);
  const byId = new Map(sorted.map((field) => [field.id, field] as const));
  const shown = new Set<string>();
  // Each field's errors go on its first row only.
  const errorsFor = (field: FormField) => {
    if (shown.has(field.id)) return [];
    shown.add(field.id);
    const prefix = `Field "${field.label}": `;
    return errors
      .filter((error) => error.fieldId === field.id)
      .map((error) =>
        error.message.startsWith(prefix) ? error.message.slice(prefix.length) : error.message,
      );
  };
  const overview: LogicOverview = { calculations: [], rules: [], riskTags: [], otherProblems: [] };

  for (const field of sorted) {
    const base = () => ({ fieldId: field.id, fieldLabel: field.label, errors: errorsFor(field) });
    if (field.type === "calculated") {
      overview.calculations.push({
        ...base(),
        formula: describeFormula(field.formula ?? "", sorted),
      });
    }
    const conditions = Array.isArray(field.visibility?.conditions)
      ? field.visibility.conditions
      : [];
    if (conditions.length > 0) {
      overview.rules.push({
        ...base(),
        summary: visibilitySummary(field.visibility),
        conditions: conditions.map((condition) => {
          const ref = condition ? byId.get(condition.fieldId) : undefined;
          return {
            field: ref?.label ?? MISSING_FIELD,
            operator: operatorLabel(ref?.type ?? "", condition?.operator as ConditionOperator),
            value: valueText(condition?.value, ref),
          };
        }),
      });
    }
    if (field.riskDimension) {
      overview.riskTags.push({
        ...base(),
        dimension:
          RISK_DIMENSION_OPTIONS.find((option) => option._id === field.riskDimension)?.name ??
          field.riskDimension,
      });
    }
  }
  for (const field of sorted) {
    if (shown.has(field.id)) continue;
    const base = { fieldId: field.id, fieldLabel: field.label, errors: errorsFor(field) };
    if (base.errors.length > 0) overview.otherProblems.push(base);
  }
  return overview;
}
