import type { Answers, LogicField, LogicSchema } from "./types";
import { evaluateFormula, normalizeDecimals, parseFormula, toNumber } from "./formula";
import { conditionHolds } from "./conditions";

export interface FormEvaluation {
  visibleIds: Set<string>;
  calculated: Record<string, number | null>;
  effectiveAnswers: Answers;
}

/** Null-prototype records: a field id such as "__proto__" stays a plain key. */
const createRecord = <T>(): Record<string, T> => Object.create(null) as Record<string, T>;

const fieldsOf = (schema: LogicSchema | null | undefined): LogicField[] =>
  schema && Array.isArray(schema.fields) ? schema.fields : [];

/** Form order: by `order`, ties keep their array position. */
export function sortFields<T extends { order: number }>(fields: T[]): T[] {
  return fields
    .map((field, index) => ({ field, index }))
    .sort((a, b) => (a.field.order ?? 0) - (b.field.order ?? 0) || a.index - b.index)
    .map((entry) => entry.field);
}

function isShown(field: LogicField, byId: Map<string, LogicField>, effective: Answers): boolean {
  const visibility = field.visibility;
  if (!visibility || !Array.isArray(visibility.conditions) || visibility.conditions.length === 0) {
    return true;
  }
  // Malformed stored rules count as absent (the save check rejects them).
  if (visibility.conditions.some((condition) => !condition || typeof condition !== "object")) {
    return true;
  }
  const results = visibility.conditions.map((condition) =>
    conditionHolds(condition, byId.get(condition.fieldId), effective[condition.fieldId]),
  );
  return visibility.match === "any" ? results.some(Boolean) : results.every(Boolean);
}

function calculate(field: LogicField, effective: Answers): number | null {
  const parsed = parseFormula(field.formula ?? "");
  if (!parsed.ok) return null;
  const values = createRecord<number | null>();
  for (const id of parsed.refs) values[id] = toNumber(effective[id]);
  return evaluateFormula(parsed.ast, values, normalizeDecimals(field.decimals));
}

/**
 * One top-to-bottom pass. Conditions and formulas only read fields above
 * them, so each field is settled when reached: hidden fields add nothing to
 * `effectiveAnswers`, and a visible calculated field adds its value so later
 * conditions and formulas can read it.
 */
export function evaluateForm(schema: LogicSchema, answers: Answers): FormEvaluation {
  const fields = sortFields(fieldsOf(schema));
  const byId = new Map(fields.map((field) => [field.id, field] as const));
  const visibleIds = new Set<string>();
  const calculated = createRecord<number | null>();
  const effectiveAnswers = createRecord<unknown>();
  const source = answers ?? {};

  for (const field of fields) {
    if (!isShown(field, byId, effectiveAnswers)) {
      if (field.type === "calculated") calculated[field.id] = null;
      continue;
    }
    visibleIds.add(field.id);
    if (field.type === "calculated") {
      const value = calculate(field, effectiveAnswers);
      calculated[field.id] = value;
      if (value !== null) effectiveAnswers[field.id] = value;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(source, field.id) && source[field.id] !== undefined) {
      effectiveAnswers[field.id] = source[field.id];
    }
  }

  return { visibleIds, calculated, effectiveAnswers };
}

/**
 * What the server stores: answers to visible fields only (unknown keys and
 * hidden answers dropped) and the server's own calculated values. A visible
 * calculated field without a result is stored as null; a hidden one is left out.
 */
export function cleanSubmission(
  schema: LogicSchema,
  answers: Answers,
): { data: Answers; visibleIds: Set<string> } {
  const evaluation = evaluateForm(schema, answers);
  const data = createRecord<unknown>();
  const source = answers ?? {};
  for (const field of sortFields(fieldsOf(schema))) {
    if (!evaluation.visibleIds.has(field.id)) continue;
    if (field.type === "calculated") {
      data[field.id] = evaluation.calculated[field.id] ?? null;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(source, field.id) && source[field.id] !== undefined) {
      data[field.id] = source[field.id];
    }
  }
  return { data, visibleIds: evaluation.visibleIds };
}

/**
 * Label of the first input, in formula order, that is visible and has no
 * number. Null when every missing input is hidden or the cause is something
 * else (division by zero), so the form shows only "—".
 */
export function firstMissingVisibleInput(
  schema: LogicSchema,
  evaluation: FormEvaluation,
  fieldId: string,
  seen: Set<string> = new Set(),
): string | null {
  if (seen.has(fieldId)) return null;
  seen.add(fieldId);
  const fields = fieldsOf(schema);
  const field = fields.find((candidate) => candidate.id === fieldId);
  if (!field || field.type !== "calculated") return null;
  const parsed = parseFormula(field.formula ?? "");
  if (!parsed.ok) return null;
  for (const id of parsed.refs) {
    const ref = fields.find((candidate) => candidate.id === id);
    if (!ref || !evaluation.visibleIds.has(id)) continue;
    if (ref.type === "calculated") {
      // A calculated input cannot be filled in: name what it is missing, if anything.
      if (toNumber(evaluation.calculated[id]) !== null) continue;
      const nested = firstMissingVisibleInput(schema, evaluation, id, seen);
      if (nested !== null) return nested;
      continue;
    }
    if (toNumber(evaluation.effectiveAnswers[id]) === null) return ref.label;
  }
  return null;
}
