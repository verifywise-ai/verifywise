import { isEmptyAnswer, normalizeDecimals } from "./intakeFormLogic";

interface CalculatedDisplay {
  decimals?: number | null;
  prefix?: string | null;
  suffix?: string | null;
}

/**
 * A calculated value as people read it: grouped and fixed to the field's
 * decimals in the viewer's locale, with its prefix and suffix. "—" when there
 * is no value.
 */
export function formatCalculatedValue(
  value: number | null | undefined,
  field: CalculatedDisplay,
  locale: string = typeof navigator !== "undefined" ? navigator.language : "en-US",
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const decimals = normalizeDecimals(field.decimals ?? undefined);
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
  return [field.prefix, number, field.suffix]
    .filter((part): part is string => typeof part === "string" && part.trim() !== "")
    .join(" ");
}

const OPERATOR_SYMBOLS: Record<string, string> = { "*": "×", "/": "÷", "-": "−" };

/** "{cost} * 12" → "= Monthly cost × 12". Empty for an empty formula. */
export function describeFormula(
  formula: string,
  fields: Array<{ id: string; label: string }>,
): string {
  if (formula.trim() === "") return "";
  const labels = new Map(fields.map((field) => [field.id, field.label]));
  const text = formula.replace(/\{([A-Za-z0-9_-]+)\}|[*/-]/g, (match: string, id?: string) =>
    id !== undefined ? (labels.get(id) ?? "missing field") : OPERATOR_SYMBOLS[match],
  );
  return `= ${text.replace(/\s+/g, " ").trim()}`;
}

export type FormulaSegment =
  | { kind: "text"; text: string; start: number }
  | { kind: "ref"; fieldId: string; start: number; end: number };

/**
 * "{cost} * 12" → a reference to cost, then the text " * 12". Offsets index
 * the formula string, so an editor can map its caret onto the stored formula.
 * Text segments are never empty.
 */
export function splitFormula(formula: string): FormulaSegment[] {
  const segments: FormulaSegment[] = [];
  let last = 0;
  for (const match of formula.matchAll(/\{([A-Za-z0-9_-]+)\}/g)) {
    const start = match.index ?? 0;
    if (start > last) {
      segments.push({ kind: "text", text: formula.slice(last, start), start: last });
    }
    const end = start + match[0].length;
    segments.push({ kind: "ref", fieldId: match[1], start, end });
    last = end;
  }
  if (last < formula.length) {
    segments.push({ kind: "text", text: formula.slice(last), start: last });
  }
  return segments;
}

export interface AnswerField {
  type: string;
  options?: Array<{ label: string; value: string }> | null;
  decimals?: number | null;
  prefix?: string | null;
  suffix?: string | null;
}

/** An answer as reviewers read it. "—" for no value. */
export function formatAnswer(
  field: AnswerField,
  value: unknown,
  formatDate: (date: string) => string,
): string {
  if (field.type === "calculated") {
    return formatCalculatedValue(typeof value === "number" ? value : null, field);
  }
  if (isEmptyAnswer(value)) return "—";
  if (field.type === "checkbox") return value ? "Yes" : "No";
  if (field.type === "date") return formatDate(value as string);
  if (field.type === "select" && field.options) {
    return field.options.find((option) => option.value === value)?.label ?? String(value);
  }
  if (field.type === "multiselect" && Array.isArray(value) && field.options) {
    return value
      .map((v) => field.options!.find((option) => option.value === v)?.label ?? v)
      .join(", ");
  }
  return String(value);
}
