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

export interface DependencyGraph {
  /** Per field (by array position): the positions of the fields it reads. */
  deps: number[][];
  /**
   * Strongly connected components, each listing positions in form order,
   * with every component after the components it reads. A component of more
   * than one field, or a field reading itself, is a loop.
   */
  components: number[][];
  /** Per field: the index of its component in `components`. */
  componentOf: number[];
}

/**
 * The read graph of `fields` (in form order) and its loops, in one linear
 * pass (Tarjan's algorithm, iterative). Positions, not ids, are the nodes,
 * so a form with a duplicate id (rejected on save) still covers every field;
 * a reference reads the last field with that id, as id lookups do.
 */
export function dependencyGraph(fields: LogicField[]): DependencyGraph {
  const indexOf = new Map(fields.map((field, index) => [field.id, index] as const));
  const deps = fields.map((field) => {
    const read = new Set<number>();
    for (const id of dependenciesOf(field)) {
      const dep = indexOf.get(id);
      if (dep !== undefined) read.add(dep);
    }
    return Array.from(read);
  });
  const order = new Array<number>(fields.length).fill(-1);
  const low = new Array<number>(fields.length).fill(0);
  const onStack = new Array<boolean>(fields.length).fill(false);
  const componentOf = new Array<number>(fields.length).fill(-1);
  const stack: number[] = [];
  const components: number[][] = [];
  let counter = 0;
  for (let root = 0; root < fields.length; root += 1) {
    if (order[root] !== -1) continue;
    // Each frame: a node and how many of its edges have been followed.
    const frames: Array<[number, number]> = [[root, 0]];
    order[root] = low[root] = counter++;
    stack.push(root);
    onStack[root] = true;
    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      const [node, edge] = frame;
      if (edge < deps[node].length) {
        frame[1] += 1;
        const next = deps[node][edge];
        if (order[next] === -1) {
          order[next] = low[next] = counter++;
          stack.push(next);
          onStack[next] = true;
          frames.push([next, 0]);
        } else if (onStack[next]) {
          low[node] = Math.min(low[node], order[next]);
        }
        continue;
      }
      frames.pop();
      if (frames.length > 0) {
        const parent = frames[frames.length - 1][0];
        low[parent] = Math.min(low[parent], low[node]);
      }
      if (low[node] === order[node]) {
        const component: number[] = [];
        let member: number;
        do {
          member = stack.pop() as number;
          onStack[member] = false;
          componentOf[member] = components.length;
          component.push(member);
        } while (member !== node);
        components.push(component.sort((a, b) => a - b));
      }
    }
  }
  return { deps, components, componentOf };
}

/**
 * Ids of the fields that read `fieldId`, directly or through other fields.
 * A rule or formula on `fieldId` that reads one of them would make a loop.
 */
export function readersOf(fields: LogicField[], fieldId: string): Set<string> {
  const { deps } = dependencyGraph(fields);
  const readers: number[][] = fields.map(() => []);
  deps.forEach((read, index) => {
    for (const dep of read) readers[dep].push(index);
  });
  const found = new Set<number>();
  const stack = fields.flatMap((field, index) => (field.id === fieldId ? [index] : []));
  while (stack.length > 0) {
    const index = stack.pop() as number;
    for (const reader of readers[index]) {
      if (found.has(reader)) continue;
      found.add(reader);
      stack.push(reader);
    }
  }
  return new Set(Array.from(found, (index) => fields[index].id));
}

/**
 * Fields are settled in dependency order, so rules and formulas may read
 * fields anywhere in the form: hidden fields add nothing to
 * `effectiveAnswers`, and a visible calculated field adds its value for the
 * rules and formulas that read it.
 */
export function evaluateForm(schema: LogicSchema, answers: Answers): FormEvaluation {
  const sorted = sortFields(fieldsOf(schema));
  // Every field after what it reads. Forms whose rules and formulas only
  // read fields above keep form order. The fields of a loop run in form
  // order and read only what is settled by then, so a loop gives empty
  // values instead of hanging. Saving a live form rejects loops.
  const fields = dependencyGraph(sorted).components.flatMap((component) =>
    component.map((index) => sorted[index]),
  );
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
