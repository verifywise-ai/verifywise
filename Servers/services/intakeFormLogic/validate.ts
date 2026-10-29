import {
  MAX_AFFIX_LENGTH,
  MAX_CONDITIONS,
  MAX_DECIMALS,
  OPERATORS_BY_TYPE,
  REQUIRED_ENTITY_FIELDS,
  RISK_DIMENSIONS,
  RISK_TAGGABLE_TYPES,
} from "./types";
import type { Condition, LogicField, LogicSchema, SchemaLogicError } from "./types";
import { parseFormula } from "./formula";
import { dependenciesOf, sortFields } from "./evaluate";

const NUMERIC_TYPES = ["number", "calculated"];
const OPTION_TYPES = ["select", "multiselect"];

function conditionValueError(condition: Condition, ref: LogicField): "value" | "option" | null {
  const { operator, value } = condition;
  if (["is_empty", "is_not_empty", "is_checked", "is_not_checked"].includes(operator)) return null;
  if (["eq", "neq", "gt", "gte", "lt", "lte"].includes(operator)) {
    return typeof value === "number" && Number.isFinite(value) ? null : "value";
  }
  if (OPTION_TYPES.includes(ref.type)) {
    const known = (ref.options ?? []).map((option) => option.value);
    if (operator === "one_of") {
      if (!Array.isArray(value) || value.length === 0) return "value";
      if (!value.every((item) => typeof item === "string")) return "value";
      return value.every((item) => known.includes(item)) ? null : "option";
    }
    if (typeof value !== "string") return "value";
    return known.includes(value) ? null : "option";
  }
  return typeof value === "string" && value.trim() !== "" ? null : "value";
}

/**
 * Save-time checks for calculated fields, show/hide rules and risk dimension
 * tags. Every message starts with `Field "<label>":` and carries the field id
 * so the builder can show it on that field.
 */
export function validateSchemaLogic(schema: LogicSchema, entityType: string): SchemaLogicError[] {
  const fields = sortFields(schema && Array.isArray(schema.fields) ? schema.fields : []);
  const byId = new Map(fields.map((field) => [field.id, field] as const));
  const dependencies = new Map(fields.map((field) => [field.id, dependenciesOf(field)] as const));
  // Whether `target` can be reached from `start` through rules and formulas.
  const reaches = (start: string, target: string): boolean => {
    const seen = new Set<string>();
    const stack = [start];
    while (stack.length > 0) {
      const id = stack.pop() as string;
      if (id === target) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...(dependencies.get(id) ?? []));
    }
    return false;
  };
  // The first of `refs` that leads back to `field`, if any.
  const loopThrough = (field: LogicField, refs: string[]): LogicField | null => {
    for (const refId of refs) {
      const ref = byId.get(refId);
      if (ref && (refId === field.id || reaches(refId, field.id))) return ref;
    }
    return null;
  };
  const requiredEntityFields = Object.prototype.hasOwnProperty.call(
    REQUIRED_ENTITY_FIELDS,
    entityType,
  )
    ? REQUIRED_ENTITY_FIELDS[entityType]
    : [];
  const errors: SchemaLogicError[] = [];
  const seenIds = new Set<string>();
  // Fields some show/hide condition depends on: rules match options by value.
  const referencedIds = new Set(
    fields.flatMap((field) =>
      Array.isArray(field.visibility?.conditions)
        ? field.visibility.conditions.map((condition) => condition?.fieldId)
        : [],
    ),
  );

  fields.forEach((field) => {
    const add = (message: string) =>
      errors.push({ fieldId: field.id, message: `Field "${field.label}": ${message}` });

    if (seenIds.has(field.id)) add(`another field already uses the id "${field.id}"`);
    seenIds.add(field.id);

    // Rules match options by value, so a field a rule uses needs unique,
    // non-blank values. Only those fields are checked: older forms may hold
    // duplicate values from the previous option editor and must stay saveable.
    if (
      OPTION_TYPES.includes(field.type) &&
      referencedIds.has(field.id) &&
      Array.isArray(field.options)
    ) {
      const values = field.options.map((option) => option?.value);
      if (values.some((value) => typeof value !== "string" || value.trim() === "")) {
        add("every option needs a value");
      } else if (new Set(values).size !== values.length) {
        add("two options share a value");
      }
    }

    if (field.type === "calculated") {
      const parsed = parseFormula(field.formula ?? "");
      if (!parsed.ok) {
        add(`${parsed.error} at position ${parsed.position + 1} of the formula`);
      } else {
        for (const refId of parsed.refs) {
          const ref = byId.get(refId);
          if (!ref) {
            add("the formula refers to a field that was removed");
          } else if (!NUMERIC_TYPES.includes(ref.type)) {
            add(`the formula uses "${ref.label}", which is not a number or calculated field`);
          }
        }
        const loop = loopThrough(field, parsed.refs);
        if (loop === field) {
          add("the formula uses this field itself");
        } else if (loop) {
          add(`the formula forms a circular reference with "${loop.label}"`);
        }
      }
      if (
        field.decimals != null &&
        !(Number.isInteger(field.decimals) && field.decimals >= 0 && field.decimals <= MAX_DECIMALS)
      ) {
        add(`decimals must be a whole number from 0 to ${MAX_DECIMALS}`);
      }
      const affixes: unknown[] = [field.prefix, field.suffix];
      if (affixes.some((affix) => affix != null && typeof affix !== "string")) {
        add("prefix and suffix must be text");
      } else if (
        (field.prefix ?? "").length > MAX_AFFIX_LENGTH ||
        (field.suffix ?? "").length > MAX_AFFIX_LENGTH
      ) {
        add(`prefix and suffix must be at most ${MAX_AFFIX_LENGTH} characters`);
      }
      if (
        field.required ||
        field.validation?.required ||
        field.entityFieldMapping ||
        field.riskDimension
      ) {
        add(
          "a calculated field cannot be required, mapped to an entity field or tagged with a risk dimension",
        );
      }
    }

    // null means "not set", as the runtime treats it.
    if (field.riskDimension != null && field.type !== "calculated") {
      if (!(RISK_DIMENSIONS as readonly string[]).includes(field.riskDimension)) {
        add("unknown risk dimension");
      } else if (!RISK_TAGGABLE_TYPES.includes(field.type)) {
        add(`a ${field.type} field cannot be tagged with a risk dimension`);
      }
    }

    const visibility = field.visibility;
    if (visibility == null) return;
    if (
      typeof visibility !== "object" ||
      (visibility.match !== "all" && visibility.match !== "any") ||
      !Array.isArray(visibility.conditions)
    ) {
      add("show/hide rules are malformed");
      return;
    }
    if (visibility.conditions.length === 0) return;
    if (visibility.conditions.length > MAX_CONDITIONS) {
      add(`at most ${MAX_CONDITIONS} conditions are allowed`);
    }
    if (field.entityFieldMapping && requiredEntityFields.includes(field.entityFieldMapping)) {
      add("fields mapped to a required entity field cannot have show/hide rules");
    }
    for (const condition of visibility.conditions) {
      if (!condition || typeof condition !== "object") {
        add("show/hide rules are malformed");
        continue;
      }
      const ref = byId.get(condition.fieldId);
      if (!ref) {
        add("a condition refers to a field that was removed");
        continue;
      }
      const allowed = Object.prototype.hasOwnProperty.call(OPERATORS_BY_TYPE, ref.type)
        ? OPERATORS_BY_TYPE[ref.type]
        : [];
      if (!allowed.includes(condition.operator as never)) {
        add(`"${condition.operator}" cannot be used with "${ref.label}"`);
        continue;
      }
      const valueError = conditionValueError(condition, ref);
      if (valueError === "option") {
        add(`the condition on "${ref.label}" uses an option that no longer exists`);
      } else if (valueError === "value") {
        add(`the condition on "${ref.label}" needs a valid value`);
      }
    }
    const loop = loopThrough(
      field,
      visibility.conditions.flatMap((condition) =>
        condition && typeof condition === "object" ? [condition.fieldId] : [],
      ),
    );
    if (loop === field) {
      add("the show/hide rules depend on this field itself");
    } else if (loop) {
      add(`the show/hide rules form a circular reference with "${loop.label}"`);
    }
  });

  return errors;
}
