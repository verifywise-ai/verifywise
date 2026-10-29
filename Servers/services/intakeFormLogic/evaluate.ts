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

/** Ids a field reads: its show/hide conditions and, for a calculated field, its formula. */
export function dependenciesOf(field: LogicField): string[] {
  const ids: string[] = [];
  const conditions = field.visibility?.conditions;
  if (Array.isArray(conditions)) {
    for (const condition of conditions) {
      if (condition && typeof condition === "object" && typeof condition.fieldId === "string") {
        ids.push(condition.fieldId);
      }
    }
  }
  if (field.type === "calculated") {
    const parsed = parseFormula(field.formula ?? "");
    if (parsed.ok) ids.push(...parsed.refs);
  }
  return ids;
}

/**
 * Fields ordered so each comes after every field it reads, ties kept in form
 * order. A form whose rules and formulas only read fields above keeps form
 * order. Fields in a loop, or reading one, cannot be ordered: they follow in
 * form order and read only what is settled by then, so a loop gives empty
 * values instead of hanging. Saving rejects loops.
 */
function evaluationOrder(fields: LogicField[]): LogicField[] {
  // Indexes, not ids: a form with a duplicate id (rejected on save) still
  // evaluates every field. A reference reads the last field with that id, as
  // the id lookups below do.
  const indexOf = new Map(fields.map((field, index) => [field.id, index] as const));
  const dependents: number[][] = fields.map(() => []);
  const waiting = fields.map((field, index) => {
    const deps = new Set<number>();
    for (const id of dependenciesOf(field)) {
      const dep = indexOf.get(id);
      if (dep !== undefined) deps.add(dep);
    }
    for (const dep of deps) if (dep !== index) dependents[dep].push(index);
    // A field reading itself is a loop: it is never ready.
    return deps.size;
  });
  const ready = waiting.flatMap((count, index) => (count === 0 ? [index] : []));
  const placed = new Set<number>();
  const ordered: LogicField[] = [];
  while (ready.length > 0) {
    // Earliest in form order first, so independent fields keep their order.
    ready.sort((a, b) => a - b);
    const index = ready.shift() as number;
    placed.add(index);
    ordered.push(fields[index]);
    for (const dependent of dependents[index]) {
      waiting[dependent] -= 1;
      if (waiting[dependent] === 0) ready.push(dependent);
    }
  }
  fields.forEach((field, index) => {
    if (!placed.has(index)) ordered.push(field);
  });
  return ordered;
}

/**
 * Fields are settled in dependency order, so rules and formulas may read
 * fields anywhere in the form: hidden fields add nothing to
 * `effectiveAnswers`, and a visible calculated field adds its value for the
 * rules and formulas that read it.
 */
export function evaluateForm(schema: LogicSchema, answers: Answers): FormEvaluation {
  const sorted = sortFields(fieldsOf(schema));
  const fields = evaluationOrder(sorted);
  const byId = new Map(sorted.map((field) => [field.id, field] as const));
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
