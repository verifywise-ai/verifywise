import { DEFAULT_DECIMALS, MAX_DECIMALS, MAX_FORMULA_DEPTH, MAX_FORMULA_LENGTH } from "./types";

export type FormulaNode =
  | { kind: "num"; value: number }
  | { kind: "ref"; fieldId: string }
  | { kind: "neg"; operand: FormulaNode }
  | { kind: "bin"; op: "+" | "-" | "*" | "/"; left: FormulaNode; right: FormulaNode };

export type ParseResult =
  { ok: true; ast: FormulaNode; refs: string[] } | { ok: false; error: string; position: number };

interface ParseFailure {
  parseFailure: true;
  error: string;
  position: number;
}

const fail = (error: string, position: number): ParseFailure => ({
  parseFailure: true,
  error,
  position,
});

const isParseFailure = (value: unknown): value is ParseFailure =>
  typeof value === "object" && value !== null && (value as ParseFailure).parseFailure === true;

const ID_CHAR = /[A-Za-z0-9_-]/;
const NUMBER_LITERAL = /^(\d+(\.\d+)?|\.\d+)/;

/**
 * Parses an arithmetic formula. Grammar:
 *   sum     = product (("+" | "-") product)*
 *   product = unary (("*" | "/") unary)*
 *   unary   = "-" unary | primary
 *   primary = number | "{" id "}" | "(" sum ")"
 * No eval and no Function: the AST is walked by evaluateFormula.
 */
export function parseFormula(src: string): ParseResult {
  if (typeof src !== "string" || src.trim() === "") {
    return { ok: false, error: "Formula is empty", position: 0 };
  }
  if (src.length > MAX_FORMULA_LENGTH) {
    return {
      ok: false,
      error: `Formula is longer than ${MAX_FORMULA_LENGTH} characters`,
      position: MAX_FORMULA_LENGTH,
    };
  }

  let pos = 0;
  const refs: string[] = [];

  const skipSpace = () => {
    while (pos < src.length && /\s/.test(src[pos])) pos += 1;
  };
  const unexpected = (): ParseFailure =>
    pos >= src.length
      ? fail("Unexpected end of formula", pos)
      : fail(`Unexpected '${src[pos]}'`, pos);

  // Declared before use by the closures below; assigned once.
  let parseSum: (depth: number) => FormulaNode = () => {
    throw unexpected();
  };

  const parsePrimary = (depth: number): FormulaNode => {
    skipSpace();
    const ch = src[pos];
    if (ch === "(") {
      if (depth >= MAX_FORMULA_DEPTH) {
        throw fail(`Parentheses are nested deeper than ${MAX_FORMULA_DEPTH}`, pos);
      }
      pos += 1;
      const inner = parseSum(depth + 1);
      skipSpace();
      if (src[pos] !== ")") {
        throw pos >= src.length ? fail("Expected ')'", pos) : unexpected();
      }
      pos += 1;
      return inner;
    }
    if (ch === "{") {
      const start = pos;
      pos += 1;
      let id = "";
      while (pos < src.length && ID_CHAR.test(src[pos])) {
        id += src[pos];
        pos += 1;
      }
      if (id === "" || src[pos] !== "}") throw fail("Invalid field reference", start);
      pos += 1;
      refs.push(id);
      return { kind: "ref", fieldId: id };
    }
    const match = NUMBER_LITERAL.exec(src.slice(pos));
    if (match) {
      pos += match[0].length;
      return { kind: "num", value: Number(match[0]) };
    }
    throw unexpected();
  };

  const parseUnary = (depth: number): FormulaNode => {
    skipSpace();
    if (src[pos] === "-") {
      pos += 1;
      return { kind: "neg", operand: parseUnary(depth) };
    }
    return parsePrimary(depth);
  };

  const parseProduct = (depth: number): FormulaNode => {
    let left = parseUnary(depth);
    for (;;) {
      skipSpace();
      const op = src[pos];
      if (op === "*" || op === "/") {
        pos += 1;
        left = { kind: "bin", op, left, right: parseUnary(depth) };
      } else {
        return left;
      }
    }
  };

  parseSum = (depth: number): FormulaNode => {
    let left = parseProduct(depth);
    for (;;) {
      skipSpace();
      const op = src[pos];
      if (op === "+" || op === "-") {
        pos += 1;
        left = { kind: "bin", op, left, right: parseProduct(depth) };
      } else {
        return left;
      }
    }
  };

  try {
    const ast = parseSum(0);
    skipSpace();
    if (pos < src.length) throw unexpected();
    return { ok: true, ast, refs: Array.from(new Set(refs)) };
  } catch (err) {
    if (isParseFailure(err)) return { ok: false, error: err.error, position: err.position };
    throw err;
  }
}

/** `decimals` when it is a whole number from 0 to 6, else the default of 2. */
export function normalizeDecimals(decimals: unknown): number {
  return typeof decimals === "number" &&
    Number.isInteger(decimals) &&
    decimals >= 0 &&
    decimals <= MAX_DECIMALS
    ? decimals
    : DEFAULT_DECIMALS;
}

/**
 * Rounds half away from zero. Shifting the decimal point through the string
 * form avoids binary error (1.005 rounds to 1.01). `-0` comes back as `0`.
 */
export function roundHalfAwayFromZero(value: number, decimals: number): number {
  const abs = Math.abs(value);
  let rounded = Number(`${Math.round(Number(`${abs}e${decimals}`))}e-${decimals}`);
  if (!Number.isFinite(rounded)) rounded = Math.round(abs * 10 ** decimals) / 10 ** decimals;
  const signed = value < 0 ? -rounded : rounded;
  return signed === 0 ? 0 : signed;
}

/** A finite number, a numeric string ("12", " 3.5 ") as that number, else null. */
export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

const evaluateNode = (
  node: FormulaNode,
  values: Record<string, number | null | undefined>,
): number | null => {
  switch (node.kind) {
    case "num":
      return node.value;
    case "ref": {
      const value = Object.prototype.hasOwnProperty.call(values, node.fieldId)
        ? values[node.fieldId]
        : null;
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    }
    case "neg": {
      const operand = evaluateNode(node.operand, values);
      return operand === null ? null : -operand;
    }
    case "bin": {
      const left = evaluateNode(node.left, values);
      const right = evaluateNode(node.right, values);
      if (left === null || right === null) return null;
      if (node.op === "/" && right === 0) return null;
      const result =
        node.op === "+"
          ? left + right
          : node.op === "-"
            ? left - right
            : node.op === "*"
              ? left * right
              : left / right;
      return Number.isFinite(result) ? result : null;
    }
  }
};

/** The formula's value, or null when an input is missing, on division by zero or overflow. */
export function evaluateFormula(
  ast: FormulaNode,
  values: Record<string, number | null | undefined>,
  decimals: number,
): number | null {
  const raw = evaluateNode(ast, values);
  if (raw === null) return null;
  const rounded = roundHalfAwayFromZero(raw, normalizeDecimals(decimals));
  return Number.isFinite(rounded) ? rounded : null;
}
