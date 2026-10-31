# Intake form logic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add calculated fields, show/hide rules and risk dimension tags to intake forms, with the server as the authority on what is stored and scored.

**Architecture:** One pure logic module (formula parser and evaluator, condition checks, form evaluation, schema checks) lives in `Servers/services/intakeFormLogic/` and is copied byte for byte to `Clients/src/application/utils/intakeFormLogic/`. One JSON file of cases drives both Jest and Vitest, and a Vitest test asserts the two copies are identical. The server cleans every submission with it (drops hidden answers, recomputes calculated values) before validating, storing and scoring; the public form and builder use the client copy for live behaviour.

**Tech Stack:** Node 22 + Express 4 + TypeScript + Jest (Servers); React 19 + MUI 7 + react-hook-form 7 + Vitest + Testing Library (Clients).

**Spec:** `docs/superpowers/specs/2026-10-13-intake-form-logic-design.md`

## Global Constraints

- Sentence case for all UI text; border `#d0d5dd`; border radius 4px; primary `#13715B`; 30px control height on desktop.
- Builder and review screens use theme values (`theme.palette.*`), never new hardcoded colours. The public form keeps its existing literal colours (`#334155`, `#94a3b8`, `#e2e8f0`) to match the file.
- Spacing as pixel strings (`gap: "8px"`), never MUI numeric multipliers.
- House components: `Field`, `Select` (items `{ _id, name }`), `Checkbox`, `CustomizableButton` (`text=` prop), `Chip` (`variant` `default` / `info` / `error`). No raw MUI `Button`.
- Every new user-facing string needs de/fr/es entries in `Clients/src/i18n/translations.ts`; add only keys `npm run i18n:audit:strict` reports (a duplicate key is a TS1117 typecheck failure).
- No `console.log`. No competitor names anywhere.
- Commit format `type(scope): description` with a body. Work on a feature branch in a worktree off `develop`, never on `develop`.
- Formulas: `+ - * /`, parentheses, unary minus, dot-decimal literals (`12`, `0.5`, `.5`), references `{fieldId}` (id characters `A-Z a-z 0-9 _ -`) to `number` or `calculated` fields **earlier** in the form. Max 500 characters, max 20 nested parentheses.
- Conditions reference **earlier** fields only; max 20 per field; empty referenced answer makes every operator false except `is_empty` and `is_not_checked`.
- Calculated values: rounded half away from zero to `decimals` (0–6, default 2), `-0` becomes `0`; formatted with `Intl.NumberFormat(navigator.language)`; optional prefix/suffix of at most 10 characters each.
- Server gates (run from `Servers`): `npm run build && npm run format-check && npm run test && npm run check:api-drift`. Client gates (run from `Clients`): `npm run typecheck && npm run i18n:audit:strict && npm run format-check && npx vitest run`.

## Review Focus

1. **A hidden required field in the public form must not block submit.** react-hook-form keeps rules of fields that unmount; the page must unregister hidden fields (keeping their values). Pinned by Task 6, test "submits without hidden answers and ignores typed calculated values".
2. **Number answers arrive as strings (`"12"`), blanks (`""`) or junk (`"abc"`).** They must compute and compare as numbers or count as missing, never throw. Pinned by fixture cases "number answers given as strings" / "non-numeric string is missing" (Task 2) and Task 6's live calculation test, which types into a real number input.
3. **Submissions made before this ships have no calculated keys.** The submission card must not show a calculated row for them (and must not show "—" either). Pinned by Task 9, test "omits a calculated field the submission never stored".
4. **Resubmission pre-fills answers to fields that are now hidden.** They must stay hidden and must not be submitted. Pinned by Task 6, test "does not submit pre-filled answers to hidden fields".
5. **Large, negative and non-English formatting of calculated values.** `1e21`, negatives and `de-DE` must format without exponent notation or wrong separators. Pinned by Task 5, `formatCalculatedValue` tests.

---

## File structure

**Servers (create)**
- `services/intakeFormLogic/types.ts` — shared types and constants.
- `services/intakeFormLogic/formula.ts` — parser, evaluator, rounding, `toNumber`.
- `services/intakeFormLogic/conditions.ts` — `isEmptyAnswer`, `conditionHolds`.
- `services/intakeFormLogic/evaluate.ts` — `sortFields`, `evaluateForm`, `cleanSubmission`, `firstMissingVisibleInput`.
- `services/intakeFormLogic/validate.ts` — `validateSchemaLogic`.
- `services/intakeFormLogic/index.ts` — re-exports.
- `services/intakeFormLogic/__fixtures__/intakeFormLogic.cases.json` — the shared cases.
- `services/intakeFormLogic/__tests__/intakeFormLogic.cases.test.ts` — Jest runner.
- `controllers/__tests__/intakeForm.formLogic.test.ts` — controller tests.

**Servers (modify)**
- `domain.layer/interfaces/i.intakeForm.ts` — field type + new properties.
- `utils/intakeFormSchema.validation.ts` — `validateIntakeFormSchemaLogic`.
- `controllers/intakeForm.ctrl.ts` — save checks, submission cleaning, by-entity field extras.
- `services/intakeRiskScoring.service.ts` + `services/tests/intakeRiskScoring.service.spec.ts`.

**Clients (create)**
- `src/application/utils/intakeFormLogic/*.ts` — byte-identical copy of the six server files.
- `src/application/utils/intakeFormLogic/__tests__/intakeFormLogic.cases.test.ts` — Vitest runner + copy-identity + required-entity parity.
- `src/application/utils/intakeAnswerFormat.ts` + `src/application/utils/__tests__/intakeAnswerFormat.test.ts`.
- `src/presentation/pages/PublicIntakeForm/CalculatedFieldDisplay.tsx`.
- `src/presentation/pages/PublicIntakeForm/__tests__/PublicIntakeForm.logic.test.tsx`.
- `src/presentation/pages/IntakeFormBuilder/EditorSection.tsx`, `FormulaEditor.tsx`, `VisibilityEditor.tsx`.
- `src/presentation/pages/IntakeFormBuilder/__tests__/FormulaEditor.test.tsx`, `VisibilityEditor.test.tsx`, `FieldPalette.advanced.test.tsx`.
- `src/presentation/pages/IntakeFormBuilder/SubmissionPreviewModal` additions are in-file; test `__tests__/SubmissionPreviewModal.otherAnswers.test.tsx`.

**Clients (modify)**
- `src/presentation/pages/IntakeFormBuilder/types.ts`, `FieldPalette.tsx`, `FieldEditor.tsx`, `FieldCard.tsx`, `FormCanvas.tsx`, `index.tsx`, `SubmissionPreviewModal.tsx`.
- `src/presentation/pages/PublicIntakeForm/index.tsx`.
- `src/presentation/pages/ProjectView/IntakeSubmissionCard/index.tsx` (+ its test).
- `src/application/repository/intakeForm.repository.ts`.
- `src/i18n/translations.ts`.

**Docs (modify)**
- `shared/user-guide-content/content/ai-governance/intake-forms.ts` (+ mirror to `~/website/verifywise/content/user-guide/content/ai-governance/intake-forms.ts`, never committed).
- `docs/technical/domains/use-cases.md`.

---

### Task 1: Formula parser and evaluator (server)

**Files:**
- Create: `Servers/services/intakeFormLogic/types.ts`
- Create: `Servers/services/intakeFormLogic/formula.ts`
- Create: `Servers/services/intakeFormLogic/index.ts`
- Create: `Servers/services/intakeFormLogic/__fixtures__/intakeFormLogic.cases.json`
- Test: `Servers/services/intakeFormLogic/__tests__/intakeFormLogic.cases.test.ts`

**Interfaces:**
- Produces: `parseFormula(src: string): ParseResult`, `evaluateFormula(ast: FormulaNode, values: Record<string, number | null | undefined>, decimals: number): number | null`, `normalizeDecimals(decimals: unknown): number`, `roundHalfAwayFromZero(value: number, decimals: number): number`, `toNumber(value: unknown): number | null`, types `FormulaNode`, `ParseResult`, `LogicField`, `LogicSchema`, `Condition`, `Visibility`, `Answers`, `SchemaLogicError`, `ConditionOperator`, constants `RISK_DIMENSIONS`, `RISK_TAGGABLE_TYPES`, `REQUIRED_ENTITY_FIELDS`, `OPERATORS_BY_TYPE`, `MAX_*`, `DEFAULT_DECIMALS`.

- [ ] **Step 1: Write the fixture with the formula cases**

Create `Servers/services/intakeFormLogic/__fixtures__/intakeFormLogic.cases.json`. `formulaParts` builds a long formula as `[text, times]` pairs joined in order. Positions are 0-based.

```json
{
  "parse": [
    { "name": "simple product", "formula": "{monthly_cost} * 12", "ok": true, "refs": ["monthly_cost"] },
    { "name": "precedence and parentheses", "formula": "({users} + {contractors}) / {sites}", "ok": true, "refs": ["users", "contractors", "sites"] },
    { "name": "decimal literals", "formula": "0.5 * .5 + 12", "ok": true, "refs": [] },
    { "name": "unary minus", "formula": "-{a} - -2", "ok": true, "refs": ["a"] },
    { "name": "duplicate refs listed once", "formula": "{a} + {a}", "ok": true, "refs": ["a"] },
    { "name": "ids with dashes and underscores", "formula": "{field_1697040000000_ab-12}", "ok": true, "refs": ["field_1697040000000_ab-12"] },
    { "name": "empty formula", "formula": "   ", "ok": false, "position": 0 },
    { "name": "unexpected closing parenthesis", "formula": "{a} * 12)", "ok": false, "position": 8 },
    { "name": "missing closing parenthesis", "formula": "({a} + 1", "ok": false, "position": 8 },
    { "name": "comma decimal rejected", "formula": "1,5", "ok": false, "position": 1 },
    { "name": "exponent rejected", "formula": "1e3", "ok": false, "position": 1 },
    { "name": "trailing dot rejected", "formula": "12.", "ok": false, "position": 2 },
    { "name": "reference with a space", "formula": "{bad id} + 1", "ok": false, "position": 0 },
    { "name": "empty reference", "formula": "{} + 1", "ok": false, "position": 0 },
    { "name": "operator without operand", "formula": "{a} *", "ok": false, "position": 5 },
    { "name": "longer than 500 characters", "formulaParts": [["1+", 250], ["1", 1]], "ok": false, "position": 500 },
    { "name": "20 nested parentheses allowed", "formulaParts": [["(", 20], ["1", 1], [")", 20]], "ok": true, "refs": [] },
    { "name": "21 nested parentheses rejected", "formulaParts": [["(", 21], ["1", 1], [")", 21]], "ok": false, "position": 20 }
  ],
  "evaluateFormula": [
    { "name": "annual cost", "formula": "{monthly_cost} * 12", "values": { "monthly_cost": 1200 }, "decimals": 2, "expected": 14400 },
    { "name": "missing input", "formula": "{monthly_cost} * 12", "values": {}, "decimals": 2, "expected": null },
    { "name": "null input", "formula": "{monthly_cost} * 12", "values": { "monthly_cost": null }, "decimals": 2, "expected": null },
    { "name": "division by zero", "formula": "{a} / {b}", "values": { "a": 1, "b": 0 }, "decimals": 2, "expected": null },
    { "name": "division by zero inside an expression", "formula": "1 / (2 - 2) + 1", "values": {}, "decimals": 2, "expected": null },
    { "name": "precedence", "formula": "2 + 3 * 4", "values": {}, "decimals": 2, "expected": 14 },
    { "name": "rounds half away from zero", "formula": "{a}", "values": { "a": 1.005 }, "decimals": 2, "expected": 1.01 },
    { "name": "negative rounds away from zero", "formula": "{a}", "values": { "a": -2.5 }, "decimals": 0, "expected": -3 },
    { "name": "negative zero becomes zero", "formula": "-0.001", "values": {}, "decimals": 2, "expected": 0 },
    { "name": "invalid decimals fall back to 2", "formula": "{a} / 3", "values": { "a": 1 }, "decimals": 9, "expected": 0.33 },
    { "name": "zero decimals", "formula": "{a} / 3", "values": { "a": 2 }, "decimals": 0, "expected": 1 },
    { "name": "overflow is no result", "formula": "{a} * {a}", "values": { "a": 1e200 }, "decimals": 2, "expected": null }
  ]
}
```

- [ ] **Step 2: Write the Jest runner (formula sections only)**

Create `Servers/services/intakeFormLogic/__tests__/intakeFormLogic.cases.test.ts`:

```ts
/**
 * Runs the shared intake form logic cases. The Vitest runner in
 * Clients/src/application/utils/intakeFormLogic/__tests__ runs the same file
 * against the client copy, so both sides behave the same.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { evaluateFormula, parseFormula } from "..";

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
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd Servers && npx jest services/intakeFormLogic`
Expected: FAIL with `Cannot find module '..'`.

- [ ] **Step 4: Write `types.ts`**

```ts
/**
 * Intake form logic: calculated fields, show/hide rules and risk dimension
 * tags. This module is pure (no I/O, no framework imports) and is copied byte
 * for byte to Clients/src/application/utils/intakeFormLogic/. Both copies run
 * Servers/services/intakeFormLogic/__fixtures__/intakeFormLogic.cases.json, and
 * a client test fails if the copies differ. Change both together.
 */

export const MAX_FORMULA_LENGTH = 500;
export const MAX_FORMULA_DEPTH = 20;
export const MAX_CONDITIONS = 20;
export const MAX_AFFIX_LENGTH = 10;
export const DEFAULT_DECIMALS = 2;
export const MAX_DECIMALS = 6;

export const RISK_DIMENSIONS = [
  "data_sensitivity",
  "autonomy_level",
  "impact_scope",
  "transparency",
  "human_oversight",
  "domain_criticality",
] as const;
export type RiskDimensionKey = (typeof RISK_DIMENSIONS)[number];

/** Field types that can carry a risk dimension tag. */
export const RISK_TAGGABLE_TYPES: string[] = [
  "text",
  "textarea",
  "select",
  "multiselect",
  "checkbox",
];

/**
 * Entity fields that must never be hidden, by intake entity type. The client
 * test checks this against the entityRequired flags in ENTITY_FIELD_MAPPINGS.
 */
export const REQUIRED_ENTITY_FIELDS: Record<string, string[]> = {
  model: ["name"],
  use_case: ["project_title", "goal"],
};

export const CONDITION_OPERATORS = [
  "equals",
  "not_equals",
  "one_of",
  "is_checked",
  "is_not_checked",
  "contains",
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "is_empty",
  "is_not_empty",
] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

const EMPTY_CHECKS: ConditionOperator[] = ["is_empty", "is_not_empty"];
const OPTION_OPERATORS: ConditionOperator[] = ["equals", "not_equals", "one_of", ...EMPTY_CHECKS];
const TEXT_OPERATORS: ConditionOperator[] = ["equals", "contains", ...EMPTY_CHECKS];
const NUMBER_OPERATORS: ConditionOperator[] = ["eq", "neq", "gt", "gte", "lt", "lte", ...EMPTY_CHECKS];

/** Operators allowed for each referenced field type. */
export const OPERATORS_BY_TYPE: Record<string, ConditionOperator[]> = {
  select: OPTION_OPERATORS,
  multiselect: OPTION_OPERATORS,
  checkbox: ["is_checked", "is_not_checked"],
  text: TEXT_OPERATORS,
  textarea: TEXT_OPERATORS,
  email: TEXT_OPERATORS,
  url: TEXT_OPERATORS,
  number: NUMBER_OPERATORS,
  calculated: NUMBER_OPERATORS,
  date: EMPTY_CHECKS,
};

/** `operator` is a string so stored JSON fits; validateSchemaLogic checks it. */
export interface Condition {
  fieldId: string;
  operator: string;
  value?: string | number | string[];
}

export interface Visibility {
  match: "all" | "any";
  conditions: Condition[];
}

/** The parts of a form field this module reads. Server and client field types both fit it. */
export interface LogicField {
  id: string;
  type: string;
  label: string;
  order: number;
  options?: Array<{ value: string; label: string }>;
  entityFieldMapping?: string;
  formula?: string;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  visibility?: Visibility;
  riskDimension?: string;
  required?: boolean;
  validation?: { required?: boolean };
}

export interface LogicSchema {
  fields: LogicField[];
}

export type Answers = Record<string, unknown>;

export interface SchemaLogicError {
  fieldId: string;
  message: string;
}
```

- [ ] **Step 5: Write `formula.ts`**

```ts
import { DEFAULT_DECIMALS, MAX_DECIMALS, MAX_FORMULA_DEPTH, MAX_FORMULA_LENGTH } from "./types";

export type FormulaNode =
  | { kind: "num"; value: number }
  | { kind: "ref"; fieldId: string }
  | { kind: "neg"; operand: FormulaNode }
  | { kind: "bin"; op: "+" | "-" | "*" | "/"; left: FormulaNode; right: FormulaNode };

export type ParseResult =
  | { ok: true; ast: FormulaNode; refs: string[] }
  | { ok: false; error: string; position: number };

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
```

- [ ] **Step 6: Write `index.ts`**

```ts
export * from "./types";
export * from "./formula";
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd Servers && npx jest services/intakeFormLogic`
Expected: PASS, 30 tests.

- [ ] **Step 8: Build and format**

Run: `cd Servers && npm run build && npx prettier --write services/intakeFormLogic && npm run format-check`
Expected: build exit 0, format-check clean.

- [ ] **Step 9: Commit**

```bash
git add Servers/services/intakeFormLogic
git commit -m "feat(intake): add the intake form formula parser and evaluator

Pure module shared with the client (copied in a later task): parses
arithmetic formulas over earlier number and calculated fields without
eval, evaluates them with half-away-from-zero rounding, and treats
missing inputs, division by zero and overflow as no result. Cases live
in a JSON fixture that both test suites will run."
```

---

### Task 2: Conditions, form evaluation and schema checks (server)

**Files:**
- Create: `Servers/services/intakeFormLogic/conditions.ts`
- Create: `Servers/services/intakeFormLogic/evaluate.ts`
- Create: `Servers/services/intakeFormLogic/validate.ts`
- Modify: `Servers/services/intakeFormLogic/index.ts`
- Modify: `Servers/services/intakeFormLogic/__fixtures__/intakeFormLogic.cases.json`
- Test: `Servers/services/intakeFormLogic/__tests__/intakeFormLogic.cases.test.ts`

**Interfaces:**
- Consumes: Task 1 exports.
- Produces: `isEmptyAnswer(value: unknown): boolean`, `conditionHolds(condition: Condition, referenced: LogicField | undefined, answer: unknown): boolean`, `sortFields<T extends { order: number }>(fields: T[]): T[]`, `evaluateForm(schema: LogicSchema, answers: Answers): FormEvaluation` where `FormEvaluation = { visibleIds: Set<string>; calculated: Record<string, number | null>; effectiveAnswers: Answers }`, `cleanSubmission(schema: LogicSchema, answers: Answers): { data: Answers; visibleIds: Set<string> }`, `firstMissingVisibleInput(schema: LogicSchema, evaluation: FormEvaluation, fieldId: string): string | null`, `validateSchemaLogic(schema: LogicSchema, entityType: string): SchemaLogicError[]`.

- [ ] **Step 1: Add the form and schema cases to the fixture**

Add these four keys to the top-level object in `intakeFormLogic.cases.json` (after `"evaluateFormula"`). Field objects carry only what the case needs.

```json
  "evaluateForm": [
    {
      "name": "no rules: every field shown",
      "fields": [
        { "id": "a", "type": "text", "label": "A", "order": 0 },
        { "id": "b", "type": "number", "label": "B", "order": 1 }
      ],
      "answers": { "a": "x" },
      "visibleIds": ["a", "b"],
      "calculated": {}
    },
    {
      "name": "select equals shows the field",
      "fields": [
        { "id": "q", "type": "select", "label": "Q", "order": 0, "options": [{ "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" }] },
        { "id": "d", "type": "text", "label": "D", "order": 1, "visibility": { "match": "all", "conditions": [{ "fieldId": "q", "operator": "equals", "value": "yes" }] } }
      ],
      "answers": { "q": "yes", "d": "hi" },
      "visibleIds": ["d", "q"],
      "calculated": {}
    },
    {
      "name": "select equals hides the field",
      "fields": [
        { "id": "q", "type": "select", "label": "Q", "order": 0, "options": [{ "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" }] },
        { "id": "d", "type": "text", "label": "D", "order": 1, "visibility": { "match": "all", "conditions": [{ "fieldId": "q", "operator": "equals", "value": "yes" }] } }
      ],
      "answers": { "q": "no", "d": "hi" },
      "visibleIds": ["q"],
      "calculated": {}
    },
    {
      "name": "empty answer: not_equals is false",
      "fields": [
        { "id": "q", "type": "select", "label": "Q", "order": 0, "options": [{ "value": "yes", "label": "Yes" }] },
        { "id": "d", "type": "text", "label": "D", "order": 1, "visibility": { "match": "all", "conditions": [{ "fieldId": "q", "operator": "not_equals", "value": "yes" }] } }
      ],
      "answers": {},
      "visibleIds": ["q"],
      "calculated": {}
    },
    {
      "name": "multiselect equals means includes",
      "fields": [
        { "id": "m", "type": "multiselect", "label": "M", "order": 0, "options": [{ "value": "a", "label": "A" }, { "value": "b", "label": "B" }] },
        { "id": "d", "type": "text", "label": "D", "order": 1, "visibility": { "match": "all", "conditions": [{ "fieldId": "m", "operator": "equals", "value": "b" }] } }
      ],
      "answers": { "m": ["a", "b"] },
      "visibleIds": ["d", "m"],
      "calculated": {}
    },
    {
      "name": "multiselect not_equals means does not include",
      "fields": [
        { "id": "m", "type": "multiselect", "label": "M", "order": 0, "options": [{ "value": "a", "label": "A" }, { "value": "b", "label": "B" }] },
        { "id": "d", "type": "text", "label": "D", "order": 1, "visibility": { "match": "all", "conditions": [{ "fieldId": "m", "operator": "not_equals", "value": "b" }] } }
      ],
      "answers": { "m": ["a"] },
      "visibleIds": ["d", "m"],
      "calculated": {}
    },
    {
      "name": "one_of on a select",
      "fields": [
        { "id": "q", "type": "select", "label": "Q", "order": 0, "options": [{ "value": "x", "label": "X" }, { "value": "y", "label": "Y" }, { "value": "z", "label": "Z" }] },
        { "id": "d", "type": "text", "label": "D", "order": 1, "visibility": { "match": "all", "conditions": [{ "fieldId": "q", "operator": "one_of", "value": ["y", "z"] }] } }
      ],
      "answers": { "q": "z" },
      "visibleIds": ["d", "q"],
      "calculated": {}
    },
    {
      "name": "checkbox is_checked",
      "fields": [
        { "id": "c", "type": "checkbox", "label": "C", "order": 0 },
        { "id": "d", "type": "text", "label": "D", "order": 1, "visibility": { "match": "all", "conditions": [{ "fieldId": "c", "operator": "is_checked" }] } }
      ],
      "answers": { "c": true },
      "visibleIds": ["c", "d"],
      "calculated": {}
    },
    {
      "name": "unanswered checkbox counts as not checked",
      "fields": [
        { "id": "c", "type": "checkbox", "label": "C", "order": 0 },
        { "id": "d", "type": "text", "label": "D", "order": 1, "visibility": { "match": "all", "conditions": [{ "fieldId": "c", "operator": "is_not_checked" }] } }
      ],
      "answers": {},
      "visibleIds": ["c", "d"],
      "calculated": {}
    },
    {
      "name": "text contains is case-insensitive",
      "fields": [
        { "id": "t", "type": "text", "label": "T", "order": 0 },
        { "id": "d", "type": "text", "label": "D", "order": 1, "visibility": { "match": "all", "conditions": [{ "fieldId": "t", "operator": "contains", "value": "Health" }] } }
      ],
      "answers": { "t": "uses HEALTH records" },
      "visibleIds": ["d", "t"],
      "calculated": {}
    },
    {
      "name": "number answers given as strings",
      "fields": [
        { "id": "n", "type": "number", "label": "N", "order": 0 },
        { "id": "d", "type": "text", "label": "D", "order": 1, "visibility": { "match": "all", "conditions": [{ "fieldId": "n", "operator": "gt", "value": 10 }] } }
      ],
      "answers": { "n": "12" },
      "visibleIds": ["d", "n"],
      "calculated": {}
    },
    {
      "name": "non-numeric string is missing",
      "fields": [
        { "id": "n", "type": "number", "label": "N", "order": 0 },
        { "id": "d", "type": "text", "label": "D", "order": 1, "visibility": { "match": "all", "conditions": [{ "fieldId": "n", "operator": "neq", "value": 10 }] } }
      ],
      "answers": { "n": "abc" },
      "visibleIds": ["n"],
      "calculated": {}
    },
    {
      "name": "match any shows on one true condition",
      "fields": [
        { "id": "n", "type": "number", "label": "N", "order": 0 },
        { "id": "d", "type": "text", "label": "D", "order": 1, "visibility": { "match": "any", "conditions": [{ "fieldId": "n", "operator": "gt", "value": 10 }, { "fieldId": "n", "operator": "lt", "value": 0 }] } }
      ],
      "answers": { "n": 5 },
      "visibleIds": ["n"],
      "calculated": {}
    },
    {
      "name": "match all needs every condition",
      "fields": [
        { "id": "n", "type": "number", "label": "N", "order": 0 },
        { "id": "d", "type": "text", "label": "D", "order": 1, "visibility": { "match": "all", "conditions": [{ "fieldId": "n", "operator": "gte", "value": 5 }, { "fieldId": "n", "operator": "lte", "value": 5 }] } }
      ],
      "answers": { "n": 5 },
      "visibleIds": ["d", "n"],
      "calculated": {}
    },
    {
      "name": "chained hiding ignores a stale answer",
      "fields": [
        { "id": "q", "type": "select", "label": "Q", "order": 0, "options": [{ "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" }] },
        { "id": "b", "type": "text", "label": "B", "order": 1, "visibility": { "match": "all", "conditions": [{ "fieldId": "q", "operator": "equals", "value": "yes" }] } },
        { "id": "c", "type": "text", "label": "C", "order": 2, "visibility": { "match": "all", "conditions": [{ "fieldId": "b", "operator": "is_not_empty" }] } }
      ],
      "answers": { "q": "no", "b": "stale", "c": "x" },
      "visibleIds": ["q"],
      "calculated": {}
    },
    {
      "name": "calculated from number answers",
      "fields": [
        { "id": "cost", "type": "number", "label": "Cost", "order": 0 },
        { "id": "months", "type": "number", "label": "Months", "order": 1 },
        { "id": "total", "type": "calculated", "label": "Total", "order": 2, "formula": "{cost} * {months}", "decimals": 2 }
      ],
      "answers": { "cost": "100", "months": 12 },
      "visibleIds": ["cost", "months", "total"],
      "calculated": { "total": 1200 }
    },
    {
      "name": "calculated with a hidden input is null",
      "fields": [
        { "id": "flag", "type": "checkbox", "label": "Flag", "order": 0 },
        { "id": "cost", "type": "number", "label": "Cost", "order": 1, "visibility": { "match": "all", "conditions": [{ "fieldId": "flag", "operator": "is_checked" }] } },
        { "id": "total", "type": "calculated", "label": "Total", "order": 2, "formula": "{cost} * 2" }
      ],
      "answers": { "cost": 5 },
      "visibleIds": ["flag", "total"],
      "calculated": { "total": null }
    },
    {
      "name": "condition on a calculated field",
      "fields": [
        { "id": "a", "type": "number", "label": "A", "order": 0 },
        { "id": "total", "type": "calculated", "label": "Total", "order": 1, "formula": "{a} * 2" },
        { "id": "big", "type": "text", "label": "Big", "order": 2, "visibility": { "match": "all", "conditions": [{ "fieldId": "total", "operator": "gt", "value": 10 }] } }
      ],
      "answers": { "a": 6 },
      "visibleIds": ["a", "big", "total"],
      "calculated": { "total": 12 }
    },
    {
      "name": "hidden calculated field is null",
      "fields": [
        { "id": "flag", "type": "checkbox", "label": "Flag", "order": 0 },
        { "id": "total", "type": "calculated", "label": "Total", "order": 1, "formula": "1 + 1", "visibility": { "match": "all", "conditions": [{ "fieldId": "flag", "operator": "is_checked" }] } }
      ],
      "answers": {},
      "visibleIds": ["flag"],
      "calculated": { "total": null }
    },
    {
      "name": "formula on a later field gets no value",
      "fields": [
        { "id": "total", "type": "calculated", "label": "Total", "order": 0, "formula": "{b} + 1" },
        { "id": "b", "type": "number", "label": "B", "order": 1 }
      ],
      "answers": { "b": 5 },
      "visibleIds": ["b", "total"],
      "calculated": { "total": null }
    },
    {
      "name": "malformed visibility shows the field",
      "fields": [
        { "id": "d", "type": "text", "label": "D", "order": 0, "visibility": { "match": "all", "conditions": "oops" } }
      ],
      "answers": {},
      "visibleIds": ["d"],
      "calculated": {}
    }
  ],
  "cleanSubmission": [
    {
      "name": "drops hidden answers and unknown keys",
      "fields": [
        { "id": "q", "type": "select", "label": "Q", "order": 0, "options": [{ "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" }] },
        { "id": "d", "type": "text", "label": "D", "order": 1, "visibility": { "match": "all", "conditions": [{ "fieldId": "q", "operator": "equals", "value": "yes" }] } }
      ],
      "answers": { "q": "no", "d": "secret", "junk": "x" },
      "data": { "q": "no" }
    },
    {
      "name": "replaces a client calculated value with the server value",
      "fields": [
        { "id": "cost", "type": "number", "label": "Cost", "order": 0 },
        { "id": "total", "type": "calculated", "label": "Total", "order": 1, "formula": "{cost} * 12" }
      ],
      "answers": { "cost": "10", "total": 999 },
      "data": { "cost": "10", "total": 120 }
    },
    {
      "name": "visible calculated field without a result is stored as null",
      "fields": [
        { "id": "cost", "type": "number", "label": "Cost", "order": 0 },
        { "id": "total", "type": "calculated", "label": "Total", "order": 1, "formula": "{cost} * 12" }
      ],
      "answers": {},
      "data": { "total": null }
    },
    {
      "name": "hidden calculated field is left out",
      "fields": [
        { "id": "flag", "type": "checkbox", "label": "Flag", "order": 0 },
        { "id": "total", "type": "calculated", "label": "Total", "order": 1, "formula": "1 + 1", "visibility": { "match": "all", "conditions": [{ "fieldId": "flag", "operator": "is_checked" }] } }
      ],
      "answers": { "flag": false },
      "data": { "flag": false }
    }
  ],
  "firstMissingVisibleInput": [
    {
      "name": "names the first visible missing input",
      "fields": [
        { "id": "cost", "type": "number", "label": "Cost", "order": 0 },
        { "id": "months", "type": "number", "label": "Months", "order": 1 },
        { "id": "total", "type": "calculated", "label": "Total", "order": 2, "formula": "{cost} * {months}" }
      ],
      "answers": { "months": 3 },
      "fieldId": "total",
      "expected": "Cost"
    },
    {
      "name": "no hint when the missing input is hidden",
      "fields": [
        { "id": "flag", "type": "checkbox", "label": "Flag", "order": 0 },
        { "id": "cost", "type": "number", "label": "Cost", "order": 1, "visibility": { "match": "all", "conditions": [{ "fieldId": "flag", "operator": "is_checked" }] } },
        { "id": "total", "type": "calculated", "label": "Total", "order": 2, "formula": "{cost} + 1" }
      ],
      "answers": {},
      "fieldId": "total",
      "expected": null
    },
    {
      "name": "no hint on division by zero",
      "fields": [
        { "id": "a", "type": "number", "label": "A", "order": 0 },
        { "id": "b", "type": "number", "label": "B", "order": 1 },
        { "id": "total", "type": "calculated", "label": "Total", "order": 2, "formula": "{a} / {b}" }
      ],
      "answers": { "a": 1, "b": 0 },
      "fieldId": "total",
      "expected": null
    }
  ],
  "validateSchemaLogic": [
    {
      "name": "a valid form has no errors",
      "entityType": "use_case",
      "fields": [
        { "id": "q", "type": "select", "label": "Q", "order": 0, "options": [{ "value": "yes", "label": "Yes" }] },
        { "id": "d", "type": "text", "label": "D", "order": 1, "visibility": { "match": "all", "conditions": [{ "fieldId": "q", "operator": "equals", "value": "yes" }] } },
        { "id": "n", "type": "number", "label": "N", "order": 2 },
        { "id": "total", "type": "calculated", "label": "Total", "order": 3, "formula": "{n} * 2", "decimals": 0, "prefix": "€" },
        { "id": "t", "type": "text", "label": "T", "order": 4, "riskDimension": "data_sensitivity" }
      ],
      "errorFieldIds": []
    },
    {
      "name": "condition on a later field",
      "entityType": "use_case",
      "fields": [
        { "id": "d", "type": "text", "label": "D", "order": 0, "visibility": { "match": "all", "conditions": [{ "fieldId": "q", "operator": "is_not_empty" }] } },
        { "id": "q", "type": "text", "label": "Q", "order": 1 }
      ],
      "errorFieldIds": ["d"]
    },
    {
      "name": "condition on itself",
      "entityType": "use_case",
      "fields": [
        { "id": "d", "type": "text", "label": "D", "order": 0, "visibility": { "match": "all", "conditions": [{ "fieldId": "d", "operator": "is_not_empty" }] } }
      ],
      "errorFieldIds": ["d"]
    },
    {
      "name": "condition on a removed field",
      "entityType": "use_case",
      "fields": [
        { "id": "d", "type": "text", "label": "D", "order": 0, "visibility": { "match": "all", "conditions": [{ "fieldId": "gone", "operator": "is_not_empty" }] } }
      ],
      "errorFieldIds": ["d"]
    },
    {
      "name": "operator not allowed for the field type",
      "entityType": "use_case",
      "fields": [
        { "id": "t", "type": "text", "label": "T", "order": 0 },
        { "id": "d", "type": "text", "label": "D", "order": 1, "visibility": { "match": "all", "conditions": [{ "fieldId": "t", "operator": "gt", "value": 3 }] } }
      ],
      "errorFieldIds": ["d"]
    },
    {
      "name": "option that no longer exists",
      "entityType": "use_case",
      "fields": [
        { "id": "q", "type": "select", "label": "Q", "order": 0, "options": [{ "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" }] },
        { "id": "d", "type": "text", "label": "D", "order": 1, "visibility": { "match": "all", "conditions": [{ "fieldId": "q", "operator": "equals", "value": "maybe" }] } }
      ],
      "errorFieldIds": ["d"]
    },
    {
      "name": "one_of needs at least one option",
      "entityType": "use_case",
      "fields": [
        { "id": "q", "type": "select", "label": "Q", "order": 0, "options": [{ "value": "yes", "label": "Yes" }] },
        { "id": "d", "type": "text", "label": "D", "order": 1, "visibility": { "match": "all", "conditions": [{ "fieldId": "q", "operator": "one_of", "value": [] }] } }
      ],
      "errorFieldIds": ["d"]
    },
    {
      "name": "numeric condition needs a number",
      "entityType": "use_case",
      "fields": [
        { "id": "n", "type": "number", "label": "N", "order": 0 },
        { "id": "d", "type": "text", "label": "D", "order": 1, "visibility": { "match": "all", "conditions": [{ "fieldId": "n", "operator": "gt", "value": "10" }] } }
      ],
      "errorFieldIds": ["d"]
    },
    {
      "name": "text condition needs a non-empty value",
      "entityType": "use_case",
      "fields": [
        { "id": "t", "type": "text", "label": "T", "order": 0 },
        { "id": "d", "type": "text", "label": "D", "order": 1, "visibility": { "match": "all", "conditions": [{ "fieldId": "t", "operator": "contains", "value": "  " }] } }
      ],
      "errorFieldIds": ["d"]
    },
    {
      "name": "more than 20 conditions",
      "entityType": "use_case",
      "fields": [
        { "id": "t", "type": "text", "label": "T", "order": 0 },
        { "id": "d", "type": "text", "label": "D", "order": 1, "visibility": { "match": "any", "conditions": [
          { "fieldId": "t", "operator": "is_empty" }, { "fieldId": "t", "operator": "is_empty" }, { "fieldId": "t", "operator": "is_empty" },
          { "fieldId": "t", "operator": "is_empty" }, { "fieldId": "t", "operator": "is_empty" }, { "fieldId": "t", "operator": "is_empty" },
          { "fieldId": "t", "operator": "is_empty" }, { "fieldId": "t", "operator": "is_empty" }, { "fieldId": "t", "operator": "is_empty" },
          { "fieldId": "t", "operator": "is_empty" }, { "fieldId": "t", "operator": "is_empty" }, { "fieldId": "t", "operator": "is_empty" },
          { "fieldId": "t", "operator": "is_empty" }, { "fieldId": "t", "operator": "is_empty" }, { "fieldId": "t", "operator": "is_empty" },
          { "fieldId": "t", "operator": "is_empty" }, { "fieldId": "t", "operator": "is_empty" }, { "fieldId": "t", "operator": "is_empty" },
          { "fieldId": "t", "operator": "is_empty" }, { "fieldId": "t", "operator": "is_empty" }, { "fieldId": "t", "operator": "is_empty" }
        ] } }
      ],
      "errorFieldIds": ["d"]
    },
    {
      "name": "malformed match value",
      "entityType": "use_case",
      "fields": [
        { "id": "t", "type": "text", "label": "T", "order": 0 },
        { "id": "d", "type": "text", "label": "D", "order": 1, "visibility": { "match": "some", "conditions": [{ "fieldId": "t", "operator": "is_empty" }] } }
      ],
      "errorFieldIds": ["d"]
    },
    {
      "name": "rules on the use case title",
      "entityType": "use_case",
      "fields": [
        { "id": "t", "type": "text", "label": "T", "order": 0 },
        { "id": "title", "type": "text", "label": "Title", "order": 1, "entityFieldMapping": "project_title", "visibility": { "match": "all", "conditions": [{ "fieldId": "t", "operator": "is_empty" }] } }
      ],
      "errorFieldIds": ["title"]
    },
    {
      "name": "rules on the model name",
      "entityType": "model",
      "fields": [
        { "id": "t", "type": "text", "label": "T", "order": 0 },
        { "id": "name", "type": "text", "label": "Name", "order": 1, "entityFieldMapping": "name", "visibility": { "match": "all", "conditions": [{ "fieldId": "t", "operator": "is_empty" }] } }
      ],
      "errorFieldIds": ["name"]
    },
    {
      "name": "rules on an optional mapped field are fine",
      "entityType": "use_case",
      "fields": [
        { "id": "t", "type": "text", "label": "T", "order": 0 },
        { "id": "start", "type": "date", "label": "Start", "order": 1, "entityFieldMapping": "start_date", "visibility": { "match": "all", "conditions": [{ "fieldId": "t", "operator": "is_not_empty" }] } }
      ],
      "errorFieldIds": []
    },
    {
      "name": "formula that does not parse",
      "entityType": "use_case",
      "fields": [
        { "id": "n", "type": "number", "label": "N", "order": 0 },
        { "id": "total", "type": "calculated", "label": "Total", "order": 1, "formula": "{n} *" }
      ],
      "errorFieldIds": ["total"]
    },
    {
      "name": "formula on a later field",
      "entityType": "use_case",
      "fields": [
        { "id": "total", "type": "calculated", "label": "Total", "order": 0, "formula": "{n} + 1" },
        { "id": "n", "type": "number", "label": "N", "order": 1 }
      ],
      "errorFieldIds": ["total"]
    },
    {
      "name": "formula on itself",
      "entityType": "use_case",
      "fields": [
        { "id": "total", "type": "calculated", "label": "Total", "order": 0, "formula": "{total} + 1" }
      ],
      "errorFieldIds": ["total"]
    },
    {
      "name": "formula on a text field",
      "entityType": "use_case",
      "fields": [
        { "id": "t", "type": "text", "label": "T", "order": 0 },
        { "id": "total", "type": "calculated", "label": "Total", "order": 1, "formula": "{t} + 1" }
      ],
      "errorFieldIds": ["total"]
    },
    {
      "name": "formula on a removed field",
      "entityType": "use_case",
      "fields": [
        { "id": "total", "type": "calculated", "label": "Total", "order": 0, "formula": "{gone} + 1" }
      ],
      "errorFieldIds": ["total"]
    },
    {
      "name": "decimals out of range",
      "entityType": "use_case",
      "fields": [
        { "id": "total", "type": "calculated", "label": "Total", "order": 0, "formula": "1", "decimals": 7 }
      ],
      "errorFieldIds": ["total"]
    },
    {
      "name": "fractional decimals",
      "entityType": "use_case",
      "fields": [
        { "id": "total", "type": "calculated", "label": "Total", "order": 0, "formula": "1", "decimals": 1.5 }
      ],
      "errorFieldIds": ["total"]
    },
    {
      "name": "prefix longer than 10 characters",
      "entityType": "use_case",
      "fields": [
        { "id": "total", "type": "calculated", "label": "Total", "order": 0, "formula": "1", "prefix": "12345678901" }
      ],
      "errorFieldIds": ["total"]
    },
    {
      "name": "required calculated field",
      "entityType": "use_case",
      "fields": [
        { "id": "total", "type": "calculated", "label": "Total", "order": 0, "formula": "1", "validation": { "required": true } }
      ],
      "errorFieldIds": ["total"]
    },
    {
      "name": "unknown risk dimension",
      "entityType": "use_case",
      "fields": [
        { "id": "t", "type": "text", "label": "T", "order": 0, "riskDimension": "vibes" }
      ],
      "errorFieldIds": ["t"]
    },
    {
      "name": "risk dimension on a number field",
      "entityType": "use_case",
      "fields": [
        { "id": "n", "type": "number", "label": "N", "order": 0, "riskDimension": "impact_scope" }
      ],
      "errorFieldIds": ["n"]
    }
  ]
```

- [ ] **Step 2: Extend the Jest runner**

In `intakeFormLogic.cases.test.ts`, replace the import line with:

```ts
import {
  cleanSubmission,
  evaluateForm,
  evaluateFormula,
  firstMissingVisibleInput,
  parseFormula,
  validateSchemaLogic,
} from "..";
```

and add these blocks inside the top-level `describe`, after the `evaluateFormula` block:

```ts
  describe("evaluateForm", () => {
    it.each(cases.evaluateForm)("$name", (c: any) => {
      const result = evaluateForm({ fields: c.fields }, c.answers);
      expect(Array.from(result.visibleIds).sort()).toEqual(c.visibleIds);
      expect({ ...result.calculated }).toEqual(c.calculated);
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
      for (const error of errors) expect(error.message).toMatch(/^Field "/);
    });
  });
```

- [ ] **Step 3: Run it to verify the new cases fail**

Run: `cd Servers && npx jest services/intakeFormLogic`
Expected: FAIL — `evaluateForm is not a function` (and the other new imports).

- [ ] **Step 4: Write `conditions.ts`**

```ts
import type { Condition, LogicField } from "./types";
import { toNumber } from "./formula";

/** undefined, null, blank strings and empty arrays are empty; false is an answer. */
export function isEmptyAnswer(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

const normalizeText = (value: string): string => value.trim().toLowerCase();

/**
 * Whether one condition holds. `answer` is the referenced field's effective
 * answer (empty when that field is hidden). On an empty answer only is_empty
 * and is_not_checked can be true, so a dependent field stays hidden until the
 * earlier question is answered.
 */
export function conditionHolds(
  condition: Condition,
  referenced: LogicField | undefined,
  answer: unknown,
): boolean {
  if (!referenced) return false;
  const { operator, value } = condition;
  if (operator === "is_empty") return isEmptyAnswer(answer);
  if (operator === "is_not_empty") return !isEmptyAnswer(answer);
  if (operator === "is_checked") return answer === true;
  if (operator === "is_not_checked") return answer !== true;
  if (isEmptyAnswer(answer)) return false;

  switch (operator) {
    case "equals":
    case "not_equals": {
      const wanted = operator === "equals";
      if (referenced.type === "multiselect") {
        return Array.isArray(answer) && answer.includes(value) === wanted;
      }
      if (typeof answer !== "string" || typeof value !== "string") return false;
      const same =
        referenced.type === "select"
          ? answer === value
          : normalizeText(answer) === normalizeText(value);
      return same === wanted;
    }
    case "one_of": {
      const wanted = Array.isArray(value) ? value : [];
      if (referenced.type === "multiselect") {
        return Array.isArray(answer) && answer.some((item) => wanted.includes(item));
      }
      return typeof answer === "string" && wanted.includes(answer);
    }
    case "contains":
      return (
        typeof answer === "string" &&
        typeof value === "string" &&
        value.trim() !== "" &&
        normalizeText(answer).includes(normalizeText(value))
      );
    case "eq":
    case "neq":
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const left = toNumber(answer);
      const right = typeof value === "number" && Number.isFinite(value) ? value : null;
      if (left === null || right === null) return false;
      if (operator === "eq") return left === right;
      if (operator === "neq") return left !== right;
      if (operator === "gt") return left > right;
      if (operator === "gte") return left >= right;
      if (operator === "lt") return left < right;
      return left <= right;
    }
    default:
      return false;
  }
}
```

- [ ] **Step 5: Write `evaluate.ts`**

```ts
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

function isShown(
  field: LogicField,
  byId: Map<string, LogicField>,
  effective: Answers,
): boolean {
  const visibility = field.visibility;
  if (!visibility || !Array.isArray(visibility.conditions) || visibility.conditions.length === 0) {
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
): string | null {
  const fields = fieldsOf(schema);
  const field = fields.find((candidate) => candidate.id === fieldId);
  if (!field || field.type !== "calculated") return null;
  const parsed = parseFormula(field.formula ?? "");
  if (!parsed.ok) return null;
  for (const id of parsed.refs) {
    const ref = fields.find((candidate) => candidate.id === id);
    if (!ref || !evaluation.visibleIds.has(id)) continue;
    const value =
      ref.type === "calculated" ? evaluation.calculated[id] : evaluation.effectiveAnswers[id];
    if (toNumber(value) === null) return ref.label;
  }
  return null;
}
```

- [ ] **Step 6: Write `validate.ts`**

```ts
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
import { sortFields } from "./evaluate";

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
  const position = new Map(fields.map((field, index) => [field.id, index] as const));
  const byId = new Map(fields.map((field) => [field.id, field] as const));
  const requiredEntityFields = REQUIRED_ENTITY_FIELDS[entityType] ?? [];
  const errors: SchemaLogicError[] = [];

  fields.forEach((field, index) => {
    const add = (message: string) =>
      errors.push({ fieldId: field.id, message: `Field "${field.label}": ${message}` });

    if (field.type === "calculated") {
      const parsed = parseFormula(field.formula ?? "");
      if (!parsed.ok) {
        add(`${parsed.error} at position ${parsed.position + 1} of the formula`);
      } else {
        for (const refId of parsed.refs) {
          const ref = byId.get(refId);
          if (!ref) {
            add("the formula refers to a field that was removed");
          } else if ((position.get(refId) ?? Infinity) >= index) {
            add(`the formula uses "${ref.label}", which is not above it`);
          } else if (!NUMERIC_TYPES.includes(ref.type)) {
            add(`the formula uses "${ref.label}", which is not a number or calculated field`);
          }
        }
      }
      if (
        field.decimals !== undefined &&
        !(Number.isInteger(field.decimals) && field.decimals >= 0 && field.decimals <= MAX_DECIMALS)
      ) {
        add(`decimals must be a whole number from 0 to ${MAX_DECIMALS}`);
      }
      if ((field.prefix ?? "").length > MAX_AFFIX_LENGTH || (field.suffix ?? "").length > MAX_AFFIX_LENGTH) {
        add(`prefix and suffix must be at most ${MAX_AFFIX_LENGTH} characters`);
      }
      if (field.required || field.validation?.required || field.entityFieldMapping || field.riskDimension) {
        add("a calculated field cannot be required, mapped to an entity field or tagged with a risk dimension");
      }
    }

    if (field.riskDimension !== undefined && field.type !== "calculated") {
      if (!(RISK_DIMENSIONS as readonly string[]).includes(field.riskDimension)) {
        add("unknown risk dimension");
      } else if (!RISK_TAGGABLE_TYPES.includes(field.type)) {
        add(`a ${field.type} field cannot be tagged with a risk dimension`);
      }
    }

    const visibility = field.visibility;
    if (visibility === undefined) return;
    if (
      typeof visibility !== "object" ||
      visibility === null ||
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
      if ((position.get(ref.id) ?? Infinity) >= index) {
        add(`depends on "${ref.label}", which is not above it`);
        continue;
      }
      if (!(OPERATORS_BY_TYPE[ref.type] ?? []).includes(condition.operator as never)) {
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
  });

  return errors;
}
```

- [ ] **Step 7: Update `index.ts`**

```ts
export * from "./types";
export * from "./formula";
export * from "./conditions";
export * from "./evaluate";
export * from "./validate";
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd Servers && npx jest services/intakeFormLogic`
Expected: PASS (30 formula + 21 evaluateForm + 4 cleanSubmission + 3 firstMissingVisibleInput + 25 validateSchemaLogic = 83 tests).

- [ ] **Step 9: Build and format**

Run: `cd Servers && npm run build && npx prettier --write services/intakeFormLogic && npm run format-check`
Expected: build exit 0, format-check clean.

- [ ] **Step 10: Commit**

```bash
git add Servers/services/intakeFormLogic
git commit -m "feat(intake): evaluate show/hide rules and check form logic on save

Adds the condition operators, a one-pass form evaluation (hidden fields
count as empty, calculated values feed later fields), submission cleaning
(hidden answers and unknown keys dropped, server calculated values,
null for a visible calculated field with no result) and the save-time
schema checks, including the rule that fields mapped to required entity
fields cannot be hidden."
```

---

### Task 3: Server types, save checks and submission cleaning

**Files:**
- Modify: `Servers/domain.layer/interfaces/i.intakeForm.ts:7-32`
- Modify: `Servers/utils/intakeFormSchema.validation.ts` (append)
- Modify: `Servers/controllers/intakeForm.ctrl.ts` (imports ~40-45; `validateFormData` 294-410; create ~556-560; update ~687-691; submit ~1856-1868, ~1945, ~2014; legacy submit ~2206-2218, ~2295, ~2371)
- Test: `Servers/controllers/__tests__/intakeForm.formLogic.test.ts`

**Interfaces:**
- Consumes: `cleanSubmission`, `parseFormula`, `validateSchemaLogic` from `../services/intakeFormLogic`.
- Produces: `validateIntakeFormSchemaLogic(schema: unknown, entityType: string): string[]` in `utils/intakeFormSchema.validation.ts`; `IIntakeFormField` gains `formula?`, `decimals?`, `prefix?`, `suffix?`, `visibility?`, `riskDimension?`; `IntakeFieldType` gains `"calculated"`.

- [ ] **Step 1: Write the failing controller tests**

Create `Servers/controllers/__tests__/intakeForm.formLogic.test.ts`:

```ts
// Servers/controllers/__tests__/intakeForm.formLogic.test.ts
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { createHmac } from "crypto";

// intakeForm.ctrl.ts throws at import without a signing secret, so set one first.
process.env.JWT_SECRET = process.env.JWT_SECRET || "intake-form-logic-test-secret";

jest.mock("../../utils/intakeForm.utils", () => ({
  getTenantByPublicId: jest.fn(),
  getTenantHashBySlug: jest.fn(),
  checkRateLimitQuery: jest.fn(),
  getFormByPublicIdQuery: jest.fn(),
  getActivePublicFormQuery: jest.fn(),
  getIntakeFormByIdQuery: jest.fn(),
  createSubmissionQuery: jest.fn(),
  getSubmissionByIdQuery: jest.fn(),
  getSubmissionByEntityQuery: jest.fn(),
  approveSubmissionQuery: jest.fn(),
  updateSubmissionRiskQuery: jest.fn<any>().mockResolvedValue(undefined),
  updateSubmissionRiskOverrideQuery: jest.fn<any>().mockResolvedValue(undefined),
  updateIntakeFormQuery: jest.fn<any>().mockResolvedValue({ id: 1 }),
}));
jest.mock("../../utils/euAiActClassification.utils", () => ({
  insertClassificationRunQuery: jest.fn(),
  getLatestRunForSubmissionQuery: jest.fn(),
}));
jest.mock("../../utils/project.utils", () => ({ createNewProjectQuery: jest.fn() }));
jest.mock("../../utils/eu.utils", () => ({ createEUFrameworkQuery: jest.fn() }));
jest.mock("../../utils/modelInventory.utils", () => ({ createNewModelInventoryQuery: jest.fn() }));
jest.mock("../../utils/useCaseChangeHistory.utils", () => ({
  recordMultipleFieldChanges: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../services/intakeFormEmail.service", () => ({
  sendSubmissionReceivedEmail: jest.fn<any>().mockResolvedValue(undefined),
  sendNewSubmissionAdminNotification: jest.fn<any>().mockResolvedValue(undefined),
  sendSubmissionApprovedEmail: jest.fn<any>().mockResolvedValue(undefined),
  sendSubmissionRejectedEmail: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../services/intakeRiskScoring.service", () => ({
  calculateSubmissionRisk: jest.fn<any>().mockResolvedValue({}),
}));
jest.mock("../../services/intakeLLM.service", () => ({
  generateSuggestedQuestions: jest.fn(),
  generateFieldGuidance: jest.fn(),
}));
jest.mock("../../utils/aiTrustCentre.utils", () => ({ getCompanyLogoQuery: jest.fn() }));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn<any>().mockResolvedValue(undefined),
  logFailure: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_, err) => (err as Error).message),
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (d: any) => ({ message: "OK", data: d }),
    201: (d: any) => ({ message: "Created", data: d }),
    400: (d: any) => ({ message: "Bad Request", data: d }),
    404: (d: any) => ({ message: "Not Found", data: d }),
    429: (d: any) => ({ message: "Too Many Requests", data: d }),
    500: (d: any) => ({ message: "Internal Server Error", data: d }),
  },
}));
jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn<any>().mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() }),
  },
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const ctrl = require("../intakeForm.ctrl") as typeof import("../intakeForm.ctrl");
const intake = require("../../utils/intakeForm.utils");
const scoring = require("../../services/intakeRiskScoring.service");
/* eslint-enable @typescript-eslint/no-require-imports */

/** Same format as the controller's private createSignedToken. */
const sign = (payload: object) => {
  const data = JSON.stringify(payload);
  const secret = (process.env.JWT_SECRET || process.env.ENCRYPTION_KEY)!;
  const signature = createHmac("sha256", secret).update(data).digest("hex");
  return Buffer.from(JSON.stringify({ data, signature })).toString("base64");
};

const req = (overrides: any = {}) => ({
  userId: 7,
  organizationId: 5,
  ip: "127.0.0.1",
  headers: {},
  lang: "en",
  t: (k: string) => k,
  params: {},
  body: {},
  ...overrides,
});

const res = () => {
  const r: any = {};
  r.status = jest.fn<any>().mockReturnValue(r);
  r.json = jest.fn<any>().mockReturnValue(r);
  return r;
};

const LOGIC_FIELDS = [
  {
    id: "q",
    type: "select",
    label: "Personal data?",
    order: 0,
    required: false,
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
  },
  {
    id: "d",
    type: "text",
    label: "Describe the data",
    order: 1,
    required: false,
    validation: { required: true },
    visibility: { match: "all", conditions: [{ fieldId: "q", operator: "equals", value: "yes" }] },
  },
  { id: "cost", type: "number", label: "Monthly cost", order: 2, required: false },
  {
    id: "total",
    type: "calculated",
    label: "Annual cost",
    order: 3,
    required: false,
    formula: "{cost} * 12",
  },
];

const FORM = { id: 1, name: "F", entityType: "use_case", euAiActRiskStepEnabled: false, publicId: "abc" };

const ROUTES = {
  byId: { handler: ctrl.submitPublicFormByPublicId, params: { publicId: "abc" } },
  bySlug: { handler: ctrl.submitPublicForm, params: { tenantSlug: "t", formSlug: "f" } },
};

const submit = async (route: keyof typeof ROUTES, formData: object) => {
  const r = res();
  await ROUTES[route].handler(
    req({
      params: ROUTES[route].params,
      body: {
        submitterEmail: "a@b.co",
        formData,
        captchaToken: sign({ answer: 4, timestamp: Date.now() }),
        captchaAnswer: 4,
      },
    }) as any,
    r,
  );
  return r;
};

const useSchema = (fields: object[]) => {
  intake.getIntakeFormByIdQuery.mockResolvedValue({
    ...FORM,
    schema: { version: "1.0", fields },
    recipients: [],
    riskTierSystem: "eu_ai_act",
    llmKeyId: null,
  });
};

describe("public submit with form logic", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    intake.getTenantByPublicId.mockResolvedValue({ orgId: 5 });
    intake.getTenantHashBySlug.mockResolvedValue({ id: 5 });
    intake.checkRateLimitQuery.mockResolvedValue(true);
    intake.getFormByPublicIdQuery.mockResolvedValue(FORM);
    intake.getActivePublicFormQuery.mockResolvedValue(FORM);
    intake.createSubmissionQuery.mockResolvedValue({ id: 99 });
    useSchema(LOGIC_FIELDS);
  });

  it.each(["byId", "bySlug"] as const)(
    "%s: drops hidden answers, skips their required check and stores server calculated values",
    async (route) => {
      const r = await submit(route, { q: "no", d: "", cost: "10", total: 5, junk: "x" });
      expect(r.status).toHaveBeenCalledWith(201);
      const stored = intake.createSubmissionQuery.mock.calls[0][0].data;
      expect({ ...stored }).toEqual({ q: "no", cost: "10", total: 120 });
      expect({ ...scoring.calculateSubmissionRisk.mock.calls[0][0] }).toEqual({
        q: "no",
        cost: "10",
        total: 120,
      });
    },
  );

  it.each(["byId", "bySlug"] as const)(
    "%s: a visible required field still blocks the submit",
    async (route) => {
      const r = await submit(route, { q: "yes", cost: "10" });
      expect(r.status).toHaveBeenCalledWith(400);
      expect(intake.createSubmissionQuery).not.toHaveBeenCalled();
    },
  );

  it.each(["byId", "bySlug"] as const)(
    "%s: a form without logic stores its answers unchanged",
    async (route) => {
      useSchema([
        { id: "a", type: "text", label: "A", order: 0, required: false },
        { id: "b", type: "number", label: "B", order: 1, required: false },
      ]);
      const r = await submit(route, { a: "x", b: "3" });
      expect(r.status).toHaveBeenCalledWith(201);
      expect({ ...intake.createSubmissionQuery.mock.calls[0][0].data }).toEqual({ a: "x", b: "3" });
    },
  );
});

describe("saving a form with invalid logic", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    intake.getIntakeFormByIdQuery.mockResolvedValue({
      id: 1,
      entityType: "use_case",
      euAiActRiskStepEnabled: false,
      schema: { version: "1.0", fields: [] },
    });
  });

  it("rejects a formula that uses a later field and does not save", async () => {
    const r = res();
    await ctrl.updateIntakeForm(
      req({
        params: { id: "1" },
        body: {
          schema: {
            version: "1.0",
            fields: [
              { id: "total", type: "calculated", label: "Total", order: 0, required: false, formula: "{n} + 1" },
              { id: "n", type: "number", label: "N", order: 1, required: false },
            ],
          },
        },
      }) as any,
      r,
    );
    expect(r.status).toHaveBeenCalledWith(400);
    expect(String(r.json.mock.calls[0][0].data)).toContain('Field "Total"');
    expect(intake.updateIntakeFormQuery).not.toHaveBeenCalled();
  });

  it("checks the stored schema when only the entity type changes", async () => {
    intake.getIntakeFormByIdQuery.mockResolvedValue({
      id: 1,
      entityType: "use_case",
      euAiActRiskStepEnabled: false,
      schema: {
        version: "1.0",
        fields: [
          { id: "t", type: "text", label: "T", order: 0, required: false },
          {
            id: "name",
            type: "text",
            label: "Model name",
            order: 1,
            required: false,
            entityFieldMapping: "name",
            visibility: { match: "all", conditions: [{ fieldId: "t", operator: "is_empty" }] },
          },
        ],
      },
    });
    const r = res();
    await ctrl.updateIntakeForm(req({ params: { id: "1" }, body: { entityType: "model" } }) as any, r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(intake.updateIntakeFormQuery).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd Servers && npx jest controllers/__tests__/intakeForm.formLogic.test.ts`
Expected: FAIL — the first test stores `d`, `total: 5` and `junk`; the save tests get 200.

- [ ] **Step 3: Extend the field interface**

In `Servers/domain.layer/interfaces/i.intakeForm.ts`, replace the `IntakeFieldType` declaration and add properties to `IIntakeFormField` (after `validation`):

```ts
export type IntakeFieldType =
  | "text"
  | "textarea"
  | "select"
  | "multiselect"
  | "checkbox"
  | "date"
  | "email"
  | "url"
  | "number"
  | "calculated";
```

```ts
  /** Calculated fields: arithmetic over earlier number/calculated fields, e.g. "{cost} * 12". */
  formula?: string;
  /** Calculated fields: decimals to round and show, 0–6, default 2. */
  decimals?: number;
  /** Calculated fields: display-only text before / after the value, at most 10 characters. */
  prefix?: string;
  suffix?: string;
  /** Show the field only when these conditions on earlier fields match. */
  visibility?: {
    match: "all" | "any";
    conditions: Array<{ fieldId: string; operator: string; value?: string | number | string[] }>;
  };
  /** The risk dimension this field's answer feeds (see intakeRiskScoring.service.ts). */
  riskDimension?: string;
```

- [ ] **Step 4: Add the schema logic wrapper**

Append to `Servers/utils/intakeFormSchema.validation.ts`:

```ts
/**
 * Calculated fields, show/hide rules and risk dimension tags (see
 * services/intakeFormLogic). Runs only on a well-formed schema; the label
 * check above reports malformed ones.
 */
export function validateIntakeFormSchemaLogic(schema: unknown, entityType: string): string[] {
  if (schema === undefined || schema === null || typeof schema !== "object" || Array.isArray(schema)) {
    return [];
  }
  const { fields } = schema as Partial<IIntakeFormSchema>;
  if (!Array.isArray(fields)) return [];
  return validateSchemaLogic({ fields }, entityType).map((error) => error.message);
}
```

and add at the top of the file, after the existing import:

```ts
import { validateSchemaLogic } from "../services/intakeFormLogic";
```

- [ ] **Step 5: Wire the save checks into create and update**

In `Servers/controllers/intakeForm.ctrl.ts`, extend the import from `../utils/intakeFormSchema.validation`:

```ts
import {
  validateIntakeFormSchemaLabels,
  validateIntakeFormSchemaLogic,
  resolveEuAiActRiskStep,
} from "../utils/intakeFormSchema.validation";
```

and add, next to the other service imports:

```ts
import { cleanSubmission, parseFormula } from "../services/intakeFormLogic";
```

In `createIntakeForm`, directly after the block that returns 400 for `schemaErrors`:

```ts
    const logicErrors = validateIntakeFormSchemaLogic(schema, entityType);
    if (logicErrors.length > 0) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](logicErrors.join("; ")));
    }
```

In `updateIntakeForm`, directly after its `schemaErrors` block:

```ts
    const logicErrors = validateIntakeFormSchemaLogic(
      schema ?? existingForm.schema,
      entityType ?? existingForm.entityType,
    );
    if (logicErrors.length > 0) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](logicErrors.join("; ")));
    }
```

- [ ] **Step 6: Make `validateFormData` skip hidden and calculated fields**

Replace the signature and loop head of `validateFormData` (line ~294):

```ts
function validateFormData(
  formData: Record<string, unknown>,
  schema: IIntakeFormSchema,
  visibleIds?: Set<string>,
): string[] {
  const errors: string[] = [];

  for (const field of schema.fields) {
    // Hidden fields are never required; calculated values come from the server.
    if (visibleIds && !visibleIds.has(field.id)) continue;
    if (field.type === "calculated") continue;
    const value = formData[field.id];
```

(the rest of the loop body is unchanged).

- [ ] **Step 7: Add the submission cleaner**

Add below `validateFormData`:

```ts
/**
 * Applies the form's show/hide rules and formulas to submitted answers. The
 * browser is never trusted: answers to hidden fields and unknown keys are
 * dropped and calculated values are recomputed here.
 */
function prepareSubmissionData(
  formData: Record<string, unknown>,
  schema: IIntakeFormSchema,
): { data: Record<string, unknown>; visibleIds: Set<string> } {
  for (const field of schema.fields ?? []) {
    if (field.type === "calculated" && !parseFormula(field.formula ?? "").ok) {
      logger.warn(`Intake form field ${field.id} has a formula that does not parse; storing no value`);
    }
  }
  return cleanSubmission(schema, formData);
}
```

- [ ] **Step 8: Use cleaned data in both submit handlers**

In `submitPublicFormByPublicId`, replace the validation block (~1856-1868):

```ts
    // Apply show/hide rules and formulas, then validate what will be stored
    let cleanedData: Record<string, unknown> = formData;
    if (fullFormForValidation?.schema) {
      const prepared = prepareSubmissionData(formData, fullFormForValidation.schema);
      cleanedData = prepared.data;
      const validationErrors = validateFormData(
        cleanedData,
        fullFormForValidation.schema,
        prepared.visibleIds,
      );
      if (validationErrors.length > 0) {
        return res.status(400).json(
          STATUS_CODE[400]({
            message: req.t!("Form validation failed"),
            errors: validationErrors,
          }),
        );
      }
    }
```

then change `data: formData,` in its `createSubmissionQuery` call (~1945) to `data: cleanedData,` and the first argument of its `calculateSubmissionRisk(` call (~2014) from `formData,` to `cleanedData,`.

Make the same three edits in `submitPublicForm` (validation block ~2206-2218, `data: formData,` ~2295, `calculateSubmissionRisk(` first argument ~2371).

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd Servers && npx jest controllers/__tests__/intakeForm.formLogic.test.ts controllers/__tests__/intakeForm.riskStep.test.ts utils`
Expected: PASS (new file 8 tests; existing risk-step and schema validation tests unchanged).

- [ ] **Step 10: Gates**

Run: `cd Servers && npm run build && npx prettier --write controllers utils domain.layer/interfaces && npm run format-check && npm run check:api-drift`
Expected: all clean (no routes changed, so no swagger drift).

- [ ] **Step 11: Commit**

```bash
git add Servers/domain.layer/interfaces/i.intakeForm.ts Servers/utils/intakeFormSchema.validation.ts Servers/controllers/intakeForm.ctrl.ts Servers/controllers/__tests__/intakeForm.formLogic.test.ts
git commit -m "feat(intake): enforce form logic on save and clean submissions

Forms with invalid formulas, rules or risk tags are rejected on create
and update (the stored schema is re-checked when only the entity type
changes). Both public submit handlers now drop answers to hidden fields
and unknown keys, recompute calculated values, skip hidden fields'
required checks, and store and score only the cleaned data."
```

---

### Task 4: Risk scoring reads tagged answers and whole words

**Files:**
- Modify: `Servers/services/intakeRiskScoring.service.ts:35-41, 52-229 (fieldMappings lines), 248-332`
- Test: `Servers/services/tests/intakeRiskScoring.service.spec.ts`

**Interfaces:**
- Consumes: cleaned submission data from Task 3 (hidden answers already removed).
- Produces: `answersForScoring(submissionData, schema): ScoringAnswer[]` (exported for tests); `scoreSubmissionRuleBased` and `calculateSubmissionRisk` keep their signatures.

- [ ] **Step 1: Write the failing tests**

Append inside the top-level `describe("intakeRiskScoring.service", ...)` in `Servers/services/tests/intakeRiskScoring.service.spec.ts`:

```ts
  describe("answer selection and keyword matching", () => {
    const dimension = (result: ReturnType<typeof scoreSubmissionRuleBased>, key: string) =>
      result.find((d) => d.key === key)!;

    it("matches whole words only", () => {
      const schema = { version: "1.0", fields: [{ id: "notes", type: "text", label: "Notes" }] };
      const result = scoreSubmissionRuleBased({ notes: "The file was renamed" }, schema);
      expect(dimension(result, "data_sensitivity").score).toBe(50);
    });

    it("matches multi-word keywords as phrases", () => {
      const schema = { version: "1.0", fields: [{ id: "notes", type: "text", label: "Notes" }] };
      const result = scoreSubmissionRuleBased({ notes: "There is no human in the loop" }, schema);
      expect(dimension(result, "autonomy_level").score).toBeGreaterThanOrEqual(70);
    });

    const taggedSchema = {
      version: "1.0",
      fields: [
        { id: "notes", type: "text", label: "Notes" },
        { id: "purpose", type: "text", label: "Purpose", riskDimension: "data_sensitivity" },
      ],
    };

    it("scores a dimension from its tagged fields only", () => {
      const result = scoreSubmissionRuleBased(
        { notes: "biometric", purpose: "anonymous aggregated" },
        taggedSchema,
      );
      const data = dimension(result, "data_sensitivity");
      expect(data.score).toBeLessThan(30);
      expect(data.signals.join(" ")).not.toContain("biometric");
    });

    it("falls back to every answer when the tagged field has no answer", () => {
      const result = scoreSubmissionRuleBased({ notes: "biometric" }, taggedSchema);
      expect(dimension(result, "data_sensitivity").score).toBeGreaterThan(70);
    });

    it("scores select answers by option label", () => {
      const schema = {
        version: "1.0",
        fields: [
          {
            id: "kind",
            type: "select",
            label: "Data kind",
            options: [{ value: "option1", label: "Health records" }],
          },
        ],
      };
      const result = scoreSubmissionRuleBased({ kind: "option1" }, schema);
      expect(dimension(result, "data_sensitivity").score).toBeGreaterThan(70);
    });

    it("scores a checked checkbox by its label and ignores an unchecked one", () => {
      const schema = {
        version: "1.0",
        fields: [{ id: "bio", type: "checkbox", label: "Uses biometric data" }],
      };
      expect(dimension(scoreSubmissionRuleBased({ bio: true }, schema), "data_sensitivity").score).toBeGreaterThan(70);
      expect(dimension(scoreSubmissionRuleBased({ bio: false }, schema), "data_sensitivity").score).toBe(50);
    });

    it("never scores number, date or calculated values", () => {
      const schema = {
        version: "1.0",
        fields: [
          { id: "n", type: "number", label: "N" },
          { id: "d", type: "date", label: "D" },
          { id: "c", type: "calculated", label: "C" },
        ],
      };
      const result = scoreSubmissionRuleBased({ n: "biometric", d: "biometric", c: "biometric" }, schema);
      expect(dimension(result, "data_sensitivity").score).toBe(50);
    });

    it("names the field in signals", () => {
      const result = scoreSubmissionRuleBased({ purpose: "biometric" }, taggedSchema);
      expect(dimension(result, "data_sensitivity").signals).toContain(
        'High-risk signal: "biometric" (Purpose)',
      );
    });
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd Servers && npx jest services/tests/intakeRiskScoring.service.spec.ts`
Expected: FAIL — "matches whole words only" gets 45, select/checkbox cases get 50, signals lack the field label.

- [ ] **Step 3: Update the local field type**

Replace the `FormField` interface (~line 35):

```ts
interface FormField {
  id: string;
  type: string;
  label: string;
  entityFieldMapping?: string;
  options?: Array<{ value: string; label: string }>;
  riskDimension?: string;
}
```

- [ ] **Step 4: Remove the dead `fieldMappings`**

Delete the six `fieldMappings: [...],` lines from `DIMENSION_CONFIGS` (one per dimension; they compared against entity field names no builder field can carry).

- [ ] **Step 5: Replace `scoreDimension` and `scoreSubmissionRuleBased`**

Replace everything from `function scoreDimension(` through the end of `scoreSubmissionRuleBased` with:

```ts
interface ScoringAnswer {
  label: string;
  text: string;
  riskDimension?: string;
}

/**
 * The text each answer contributes to keyword scoring. Selects contribute
 * their option labels (stored values default to "option1", "option2", ...),
 * a checked checkbox contributes its field label, and number, date and
 * calculated values contribute nothing.
 */
export function answersForScoring(
  submissionData: Record<string, unknown>,
  schema: FormSchema,
): ScoringAnswer[] {
  const answers: ScoringAnswer[] = [];
  for (const field of schema.fields) {
    const value = submissionData[field.id];
    if (value === undefined || value === null || value === "") continue;
    const optionLabel = (v: unknown) =>
      field.options?.find((option) => option.value === v)?.label ?? String(v);
    let text = "";
    switch (field.type) {
      case "text":
      case "textarea":
      case "email":
      case "url":
        text = typeof value === "string" ? value : "";
        break;
      case "select":
        text = optionLabel(value);
        break;
      case "multiselect":
        text = Array.isArray(value) ? value.map(optionLabel).join(", ") : "";
        break;
      case "checkbox":
        text = value === true ? field.label : "";
        break;
      default:
        text = "";
    }
    if (text.trim() !== "") {
      answers.push({ label: field.label, text, riskDimension: field.riskDimension });
    }
  }
  return answers;
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole words and phrases: "name" does not match "renamed". */
const keywordPattern = (keyword: string): RegExp =>
  new RegExp(`\\b${escapeRegExp(keyword.toLowerCase())}\\b`, "i");

function scoreDimension(
  config: (typeof DIMENSION_CONFIGS)[0],
  answers: ScoringAnswer[],
): { score: number; signals: string[] } {
  // Tagged answers decide the dimension; with none answered, every answer counts.
  const tagged = answers.filter((answer) => answer.riskDimension === config.key);
  const pool = tagged.length > 0 ? tagged : answers;
  const firstMatch = (keyword: string) => {
    const pattern = keywordPattern(keyword);
    return pool.find((answer) => pattern.test(answer.text));
  };

  const signals: string[] = [];
  let highMatches = 0;
  let mediumMatches = 0;
  let lowMatches = 0;

  for (const keyword of config.keywords.high) {
    const hit = firstMatch(keyword);
    if (hit) {
      highMatches++;
      signals.push(`High-risk signal: "${keyword}" (${hit.label})`);
    }
  }
  for (const keyword of config.keywords.medium) {
    if (firstMatch(keyword)) mediumMatches++;
  }
  for (const keyword of config.keywords.low) {
    const hit = firstMatch(keyword);
    if (hit) {
      lowMatches++;
      signals.push(`Low-risk signal: "${keyword}" (${hit.label})`);
    }
  }

  let score = 50; // Default neutral
  if (highMatches > 0 && lowMatches === 0) {
    score = 70 + Math.min(highMatches * 5, 30);
  } else if (highMatches > 0 && lowMatches > 0) {
    score = 50 + (highMatches - lowMatches) * 10;
  } else if (mediumMatches > 0 && lowMatches === 0) {
    score = 40 + Math.min(mediumMatches * 5, 20);
  } else if (lowMatches > 0 && highMatches === 0) {
    score = 10 + Math.max(20 - lowMatches * 5, 0);
  }

  return { score: Math.max(0, Math.min(100, score)), signals };
}

export function scoreSubmissionRuleBased(
  submissionData: Record<string, unknown>,
  schema: FormSchema,
): RiskDimension[] {
  const answers = answersForScoring(submissionData, schema);
  return DIMENSION_CONFIGS.map((config) => {
    const { score, signals } = scoreDimension(config, answers);
    return { key: config.key, label: config.label, weight: config.weight, score, signals };
  });
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd Servers && npx jest services/tests/intakeRiskScoring.service.spec.ts`
Expected: PASS, including the pre-existing cases (the `data_type` field in `basicSchema` is untagged, so it is scored through the fallback).

- [ ] **Step 7: Gates**

Run: `cd Servers && npm run build && npx prettier --write services && npm run format-check`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add Servers/services/intakeRiskScoring.service.ts Servers/services/tests/intakeRiskScoring.service.spec.ts
git commit -m "fix(intake): score risk from tagged answers, option labels and whole words

Keyword matching now uses whole words and phrases, so 'name' no longer
matches 'renamed'. A dimension is scored from the answers tagged with it
and falls back to every answer when none is answered. Selects are scored
by option label (stored values are 'option1' by default), a checked
checkbox by its label, and number, date and calculated values are never
scored. Signals name the field. The old fieldMappings check is removed:
no field the builder can create ever matched it."
```

---

### Task 5: Client logic copy, field types and formatting helpers

**Files:**
- Create: `Clients/src/application/utils/intakeFormLogic/{types,formula,conditions,evaluate,validate,index}.ts` (copies)
- Create: `Clients/src/application/utils/intakeFormLogic/__tests__/intakeFormLogic.cases.test.ts`
- Create: `Clients/src/application/utils/intakeAnswerFormat.ts`
- Create: `Clients/src/application/utils/__tests__/intakeAnswerFormat.test.ts`
- Modify: `Clients/src/presentation/pages/IntakeFormBuilder/types.ts:7-8, 34-48`
- Modify: `Clients/src/application/repository/intakeForm.repository.ts` (`FieldType`, `FormField`, `IntakeSubmission`)
- Modify: `Clients/src/presentation/pages/IntakeFormBuilder/FieldEditor.tsx:18-28`, `FieldCard.tsx:9-19`

**Interfaces:**
- Consumes: the six server files from Tasks 1–2.
- Produces: client module at `src/application/utils/intakeFormLogic` with the same exports; `formatCalculatedValue(value: number | null | undefined, field: { decimals?: number; prefix?: string | null; suffix?: string | null }, locale?: string): string`; `describeFormula(formula: string, fields: Array<{ id: string; label: string }>): string`; builder `FieldType` includes `"calculated"`; builder `FormField` gains `formula?`, `decimals?`, `prefix?`, `suffix?`, `visibility?: Visibility`, `riskDimension?: string`; `IntakeSubmission.data?: Record<string, unknown>`.

- [ ] **Step 1: Write the failing Vitest runner**

Create `Clients/src/application/utils/intakeFormLogic/__tests__/intakeFormLogic.cases.test.ts`:

```ts
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
const MODULE_FILES = ["types.ts", "formula.ts", "conditions.ts", "evaluate.ts", "validate.ts", "index.ts"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cases: any = JSON.parse(
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
      expect(Object.is(evaluateFormula(parsed.ast, c.values, c.decimals), c.expected)).toBe(true);
    });
  });

  describe("evaluateForm", () => {
    it.each(cases.evaluateForm)("$name", (c: any) => {
      const result = evaluateForm({ fields: c.fields }, c.answers);
      expect(Array.from(result.visibleIds).sort()).toEqual(c.visibleIds);
      expect({ ...result.calculated }).toEqual(c.calculated);
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
      expect(firstMissingVisibleInput(schema, evaluateForm(schema, c.answers), c.fieldId)).toBe(
        c.expected,
      );
    });
  });

  describe("validateSchemaLogic", () => {
    it.each(cases.validateSchemaLogic)("$name", (c: any) => {
      const errors = validateSchemaLogic({ fields: c.fields }, c.entityType);
      expect(Array.from(new Set(errors.map((e) => e.fieldId))).sort()).toEqual(c.errorFieldIds);
    });
  });
});
```

- [ ] **Step 2: Write the failing formatter tests**

Create `Clients/src/application/utils/__tests__/intakeAnswerFormat.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { describeFormula, formatCalculatedValue } from "../intakeAnswerFormat";

describe("formatCalculatedValue", () => {
  it("formats with grouping, fixed decimals and a prefix", () => {
    expect(formatCalculatedValue(14400, { decimals: 2, prefix: "€" }, "en-US")).toBe("€ 14,400.00");
  });
  it("formats with a suffix and no decimals", () => {
    expect(formatCalculatedValue(1200, { decimals: 0, suffix: "people" }, "en-US")).toBe("1,200 people");
  });
  it("uses the given locale's separators", () => {
    expect(formatCalculatedValue(14400, { decimals: 2 }, "de-DE")).toBe("14.400,00");
  });
  it("formats negatives", () => {
    expect(formatCalculatedValue(-2.5, { decimals: 1 }, "en-US")).toBe("-2.5");
  });
  it("never uses exponent notation for large values", () => {
    expect(formatCalculatedValue(1e21, { decimals: 0 }, "en-US")).toBe(
      "1,000,000,000,000,000,000,000",
    );
  });
  it("falls back to 2 decimals when decimals is invalid", () => {
    expect(formatCalculatedValue(1, { decimals: 9 }, "en-US")).toBe("1.00");
  });
  it("shows a dash when there is no value", () => {
    expect(formatCalculatedValue(null, { decimals: 2, prefix: "€" }, "en-US")).toBe("—");
    expect(formatCalculatedValue(undefined, {}, "en-US")).toBe("—");
  });
});

describe("describeFormula", () => {
  const fields = [
    { id: "cost", label: "Monthly cost" },
    { id: "field_1-a", label: "Head-count" },
  ];
  it("replaces references with labels and operators with symbols", () => {
    expect(describeFormula("{cost} * 12", fields)).toBe("= Monthly cost × 12");
  });
  it("keeps dashes inside labels and ids", () => {
    expect(describeFormula("{field_1-a} - {cost} / 2", fields)).toBe("= Head-count − Monthly cost ÷ 2");
  });
  it("marks a removed field", () => {
    expect(describeFormula("{gone} + 1", fields)).toBe("= missing field + 1");
  });
  it("is empty for an empty formula", () => {
    expect(describeFormula("  ", fields)).toBe("");
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd Clients && npx vitest run src/application/utils/intakeFormLogic src/application/utils/__tests__/intakeAnswerFormat.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Copy the module**

```bash
mkdir -p Clients/src/application/utils/intakeFormLogic
cp Servers/services/intakeFormLogic/{types,formula,conditions,evaluate,validate,index}.ts Clients/src/application/utils/intakeFormLogic/
```

Do not reformat or edit the copies; the identity test compares bytes. (Both prettier configs agree on these files: no quoted object keys are used.)

- [ ] **Step 5: Write `intakeAnswerFormat.ts`**

```ts
import { normalizeDecimals } from "./intakeFormLogic";

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
  return [field.prefix, number, field.suffix].filter((part) => part && part.trim() !== "").join(" ");
}

const OPERATOR_SYMBOLS: Record<string, string> = { "*": "×", "/": "÷", "-": "−" };

/** "{cost} * 12" → "= Monthly cost × 12". Empty for an empty formula. */
export function describeFormula(formula: string, fields: Array<{ id: string; label: string }>): string {
  if (formula.trim() === "") return "";
  const labels = new Map(fields.map((field) => [field.id, field.label]));
  const text = formula.replace(/\{([A-Za-z0-9_-]+)\}|[*/-]/g, (match: string, id?: string) =>
    id !== undefined ? (labels.get(id) ?? "missing field") : OPERATOR_SYMBOLS[match],
  );
  return `= ${text.replace(/\s+/g, " ").trim()}`;
}
```

- [ ] **Step 6: Extend the client types**

In `Clients/src/presentation/pages/IntakeFormBuilder/types.ts`:

```ts
import type { Visibility } from "../../../application/utils/intakeFormLogic";
```

```ts
export type FieldType =
  | "text"
  | "textarea"
  | "select"
  | "multiselect"
  | "checkbox"
  | "date"
  | "email"
  | "url"
  | "number"
  | "calculated";
```

and add to `FormField` (after `entityFieldMapping?: string;`):

```ts
  /** Calculated fields: arithmetic over earlier number/calculated fields, e.g. "{cost} * 12". */
  formula?: string;
  /** Calculated fields: decimals to round and show, 0–6, default 2. */
  decimals?: number;
  /** Calculated fields: display-only text before / after the value, at most 10 characters. */
  prefix?: string;
  suffix?: string;
  /** Show the field only when these conditions on earlier fields match. */
  visibility?: Visibility;
  /** The risk dimension this field's answer feeds. */
  riskDimension?: string;
```

In `Clients/src/application/repository/intakeForm.repository.ts`, add `| "calculated"` to its `FieldType` union, add the same six properties to its `FormField` (importing `Visibility` the same way, path `../utils/intakeFormLogic`), and add to `IntakeSubmission` (after `formData`):

```ts
  /** The stored answers, as the server sends them. */
  data?: Record<string, unknown>;
```

In `FieldEditor.tsx` `FIELD_TYPE_LABELS` and `FieldCard.tsx` `TYPE_LABELS`, add `calculated: "Calculated",` after `checkbox`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd Clients && npx vitest run src/application/utils/intakeFormLogic src/application/utils/__tests__/intakeAnswerFormat.test.ts`
Expected: PASS (6 identity + 1 parity + 83 cases + 11 formatter tests).

- [ ] **Step 8: Gates**

Run: `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check`
Expected: clean. If `i18n:audit:strict` reports "Calculated", add it to `de` ("Berechnet"), `fr` ("Calculé"), `es` ("Calculado") in `src/i18n/translations.ts` next to `"Field settings"` in each language block.

- [ ] **Step 9: Commit**

```bash
git add Clients/src/application/utils Clients/src/presentation/pages/IntakeFormBuilder/types.ts Clients/src/presentation/pages/IntakeFormBuilder/FieldEditor.tsx Clients/src/presentation/pages/IntakeFormBuilder/FieldCard.tsx Clients/src/application/repository/intakeForm.repository.ts Clients/src/i18n/translations.ts
git commit -m "feat(intake): add the client copy of the form logic module

Byte-identical copy of the server module, checked by a test that runs
the server's shared cases and compares the files. Adds the calculated
field type and logic properties to the client field types, the stored
submission data to the submission type, and helpers to format
calculated values and describe formulas with field labels."
```

---

### Task 6: Public form: show/hide and live calculated values

**Files:**
- Create: `Clients/src/presentation/pages/PublicIntakeForm/CalculatedFieldDisplay.tsx`
- Modify: `Clients/src/presentation/pages/PublicIntakeForm/index.tsx` (imports; `useForm` ~153-160; `onSubmit` payload ~268; field loop ~627-635)
- Test: `Clients/src/presentation/pages/PublicIntakeForm/__tests__/PublicIntakeForm.logic.test.tsx`

**Interfaces:**
- Consumes: `evaluateForm`, `cleanSubmission`, `firstMissingVisibleInput` (Task 5 client module); `formatCalculatedValue` (Task 5).
- Produces: `CalculatedFieldDisplay({ field, value, missingLabel })`.

- [ ] **Step 1: Write the failing tests**

Create `Clients/src/presentation/pages/PublicIntakeForm/__tests__/PublicIntakeForm.logic.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { PublicIntakeForm } from "..";

const repo = vi.hoisted(() => ({
  getPublicFormById: vi.fn(),
  submitPublicFormById: vi.fn(),
  getCaptcha: vi.fn(),
  getPublicForm: vi.fn(),
  submitPublicForm: vi.fn(),
}));
vi.mock("../../../../application/repository/intakeForm.repository", () => repo);

const FIELDS = [
  { id: "personal", type: "checkbox", label: "Uses personal data", order: 0 },
  {
    id: "details",
    type: "textarea",
    label: "Describe the data",
    order: 1,
    validation: { required: true },
    visibility: { match: "all", conditions: [{ fieldId: "personal", operator: "is_checked" }] },
  },
  { id: "cost", type: "number", label: "Monthly cost", order: 2 },
  {
    id: "total",
    type: "calculated",
    label: "Annual cost",
    order: 3,
    formula: "{cost} * 12",
    decimals: 2,
    prefix: "€",
  },
];

const formResponse = (extra: object = {}) => ({
  data: {
    form: {
      id: 1,
      name: "Request",
      description: "",
      slug: "request",
      entityType: "use_case",
      schema: { version: "1.0", fields: FIELDS },
      submitButtonText: "Submit",
      designSettings: null,
    },
    ...extra,
  },
});

const renderPage = () =>
  renderWithProviders(
    <Routes>
      <Route path="/:publicId/use-case-form-intake" element={<PublicIntakeForm />} />
      <Route path="/:publicId/use-case-form-intake/success" element={<div>Submitted</div>} />
    </Routes>,
    { route: "/abc/use-case-form-intake" },
  );

const fillContactAndCaptcha = async () => {
  fireEvent.change(await screen.findByLabelText(/Email/), { target: { value: "a@example.com" } });
  await screen.findByText("2 + 2");
  const captcha = document.getElementById("captcha-answer") as HTMLInputElement;
  fireEvent.change(captcha, { target: { value: "4" } });
};

beforeEach(() => {
  vi.clearAllMocks();
  repo.getCaptcha.mockResolvedValue({ data: { question: "2 + 2", token: "t" } });
  repo.submitPublicFormById.mockResolvedValue({ data: { submissionId: 1 } });
  repo.getPublicFormById.mockResolvedValue(formResponse());
});

describe("public form logic", () => {
  it("hides a conditional field until its condition holds", async () => {
    renderPage();
    await screen.findByLabelText("Uses personal data");
    expect(screen.queryByLabelText(/Describe the data/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Uses personal data"));
    expect(await screen.findByLabelText(/Describe the data/)).toBeInTheDocument();
  });

  it("shows the calculated value live, with a hint while an input is missing", async () => {
    renderPage();
    expect(await screen.findByText("Fill in Monthly cost to calculate")).toBeInTheDocument();
    expect(screen.getByTestId("calculated-total")).toHaveTextContent("—");
    fireEvent.change(screen.getByLabelText("Monthly cost"), { target: { value: "1200" } });
    await waitFor(() =>
      expect(screen.getByTestId("calculated-total")).toHaveTextContent("€ 14,400.00"),
    );
    expect(screen.queryByText("Fill in Monthly cost to calculate")).not.toBeInTheDocument();
  });

  it("submits without hidden answers and ignores typed calculated values", async () => {
    renderPage();
    fireEvent.click(await screen.findByLabelText("Uses personal data"));
    fireEvent.change(await screen.findByLabelText(/Describe the data/), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByLabelText("Uses personal data")); // hides the required field again
    fireEvent.change(screen.getByLabelText("Monthly cost"), { target: { value: "10" } });
    await fillContactAndCaptcha();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(repo.submitPublicFormById).toHaveBeenCalled());
    expect({ ...repo.submitPublicFormById.mock.calls[0][1].formData }).toEqual({
      personal: false,
      cost: "10",
      total: 120,
    });
  });

  it("does not submit pre-filled answers to hidden fields", async () => {
    repo.getPublicFormById.mockResolvedValue(
      formResponse({ previousData: { personal: false, details: "old answer", cost: "1" } }),
    );
    renderPage();
    await screen.findByLabelText("Uses personal data");
    expect(screen.queryByLabelText(/Describe the data/)).not.toBeInTheDocument();
    await fillContactAndCaptcha();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(repo.submitPublicFormById).toHaveBeenCalled());
    expect(repo.submitPublicFormById.mock.calls[0][1].formData).not.toHaveProperty("details");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd Clients && npx vitest run src/presentation/pages/PublicIntakeForm/__tests__/PublicIntakeForm.logic.test.tsx`
Expected: FAIL — "Describe the data" is rendered from the start; no `calculated-total`.

- [ ] **Step 3: Create `CalculatedFieldDisplay.tsx`**

```tsx
import { Box, Typography } from "@mui/material";
import type { FormField } from "../IntakeFormBuilder/types";
import { formatCalculatedValue } from "../../../application/utils/intakeAnswerFormat";

interface CalculatedFieldDisplayProps {
  field: FormField;
  value: number | null;
  /** Label of the first visible input still missing, or null. */
  missingLabel: string | null;
}

/** A read-only calculated value on the public form, announced as it changes. */
export function CalculatedFieldDisplay({ field, value, missingLabel }: CalculatedFieldDisplayProps) {
  const labelId = `field-${field.id}-label`;
  return (
    <Box>
      <Typography
        id={labelId}
        sx={{ fontSize: "14px", color: "#334155", fontWeight: 500, mb: "6px" }}
      >
        {field.label}
      </Typography>
      <Box
        role="status"
        aria-live="polite"
        aria-labelledby={labelId}
        data-testid={`calculated-${field.id}`}
        sx={{
          minHeight: "30px",
          display: "flex",
          alignItems: "center",
          px: "12px",
          border: "1px solid #e2e8f0",
          borderRadius: "4px",
          backgroundColor: "#f8fafc",
          fontSize: "14px",
          color: "#0f172a",
        }}
      >
        {formatCalculatedValue(value, field)}
      </Box>
      {value === null && missingLabel && (
        <Typography sx={{ fontSize: "12px", color: "#94a3b8", mt: "4px", lineHeight: 1.4 }}>
          {`Fill in ${missingLabel} to calculate`}
        </Typography>
      )}
      {field.helpText && (
        <Typography sx={{ fontSize: "12px", color: "#94a3b8", mt: "4px", lineHeight: 1.4 }}>
          {field.helpText}
        </Typography>
      )}
    </Box>
  );
}

export default CalculatedFieldDisplay;
```

- [ ] **Step 4: Evaluate the form on every change**

In `index.tsx`:
- Add `Collapse` to the `@mui/material` import (`useEffect` is already imported from React).
- Add imports:

```tsx
import { CalculatedFieldDisplay } from "./CalculatedFieldDisplay";
import {
  cleanSubmission,
  evaluateForm,
  firstMissingVisibleInput,
} from "../../../application/utils/intakeFormLogic";
```

- Extend the `useForm` destructuring with `watch` and `unregister`:

```tsx
  const {
    control,
    handleSubmit,
    reset,
    watch,
    unregister,
    formState: { errors },
  } = useForm<Record<string, unknown>>({
    defaultValues: {},
  });
```

- Directly after it (before any early return), add:

```tsx
  // Show/hide rules and calculated values, recomputed on every change.
  const watchedValues = watch();
  const evaluation = formData ? evaluateForm(formData.schema, watchedValues) : null;
  const hiddenFieldKey = formData
    ? formData.schema.fields
        .filter((field) => !evaluation?.visibleIds.has(field.id))
        .map((field) => field.id)
        .join("|")
    : "";

  // A hidden field must not block submit: drop its validation but keep the
  // typed value, so showing it again restores the answer.
  useEffect(() => {
    if (!hiddenFieldKey) return;
    for (const id of hiddenFieldKey.split("|")) {
      unregister(id, { keepValue: true, keepDefaultValue: true });
    }
  }, [hiddenFieldKey, unregister]);
```

- [ ] **Step 5: Render visible fields only, with a short transition**

Replace the `sortedFields.map(...)` block in the form fields `Box` (~627-635) with:

```tsx
                {sortedFields.map((field) => {
                  const visible = evaluation?.visibleIds.has(field.id) ?? true;
                  return (
                    <Collapse
                      key={field.id}
                      in={visible}
                      timeout={150}
                      unmountOnExit
                      sx={{ opacity: visible ? 1 : 0, transition: "opacity 150ms ease" }}
                    >
                      {field.type === "calculated" ? (
                        <CalculatedFieldDisplay
                          field={field}
                          value={evaluation?.calculated[field.id] ?? null}
                          missingLabel={
                            evaluation
                              ? firstMissingVisibleInput(formData.schema, evaluation, field.id)
                              : null
                          }
                        />
                      ) : (
                        <FormFieldRenderer field={field} control={control} errors={errors} />
                      )}
                    </Collapse>
                  );
                })}
```

- [ ] **Step 6: Submit cleaned answers**

In `onSubmit`, change `formData: data,` to:

```tsx
        formData: cleanSubmission(formData.schema, data).data,
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd Clients && npx vitest run src/presentation/pages/PublicIntakeForm`
Expected: PASS — the new file (4 tests) and the existing public form tests.

- [ ] **Step 8: Gates**

Run: `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check`
Expected: clean. (The hint is a template literal with a field label inside; the public form has no runtime translation today.)

- [ ] **Step 9: Commit**

```bash
git add Clients/src/presentation/pages/PublicIntakeForm
git commit -m "feat(intake): show/hide fields and live calculated values on the public form

Fields appear and disappear as their conditions change, with a short
transition. Hidden fields keep their typed value but lose their
validation, so a hidden required field never blocks submit, and they are
left out of the submitted answers. Calculated fields show a read-only
value formatted in the browser's locale, announced to screen readers,
with a hint naming the first visible input still missing."
```

---

### Task 7: Builder: calculated field type and formula editor

**Files:**
- Create: `Clients/src/presentation/pages/IntakeFormBuilder/EditorSection.tsx`
- Create: `Clients/src/presentation/pages/IntakeFormBuilder/FormulaEditor.tsx`
- Modify: `Clients/src/presentation/pages/IntakeFormBuilder/types.ts` (add `ADVANCED_PALETTE_ITEMS`)
- Modify: `Clients/src/presentation/pages/IntakeFormBuilder/FieldPalette.tsx:2-18, 50-60, 806-814`
- Modify: `Clients/src/presentation/pages/IntakeFormBuilder/FieldEditor.tsx` (props; basic settings; validation and mapping sections)
- Modify: `Clients/src/presentation/pages/IntakeFormBuilder/FieldCard.tsx` (`FieldPreview` switch; chips)
- Modify: `Clients/src/presentation/pages/IntakeFormBuilder/index.tsx:849-860` (pass `allFields`)
- Modify: `Clients/src/i18n/translations.ts`
- Test: `__tests__/FieldPalette.advanced.test.tsx`, `__tests__/FormulaEditor.test.tsx`

**Interfaces:**
- Consumes: `parseFormula`, `evaluateFormula`, `normalizeDecimals`, `sortFields` (client module); `describeFormula`, `formatCalculatedValue` (Task 5).
- Produces: `EditorSection({ title, summary?, defaultOpen?, children })`; `FormulaEditor({ formula, numericFields, decimals, onChange })`; `FieldEditor` prop `allFields: FormField[]`.

- [ ] **Step 1: Write the failing tests**

`Clients/src/presentation/pages/IntakeFormBuilder/__tests__/FieldPalette.advanced.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { FieldPalette } from "../FieldPalette";

describe("FieldPalette advanced section", () => {
  it("keeps Calculated out of the main list until Advanced is opened", () => {
    const onAddField = vi.fn();
    renderWithProviders(<FieldPalette onAddField={onAddField} fieldCount={3} />);
    expect(screen.getByText("Short text")).toBeVisible();
    expect(screen.queryByText("Calculated")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Advanced/ }));
    fireEvent.click(screen.getByText("Calculated"));
    expect(onAddField).toHaveBeenCalledWith(
      expect.objectContaining({ type: "calculated", formula: "", decimals: 2, order: 3 }),
    );
  });
});
```

`Clients/src/presentation/pages/IntakeFormBuilder/__tests__/FormulaEditor.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { FormulaEditor } from "../FormulaEditor";
import type { FormField } from "../types";

const COST: FormField = { id: "cost", type: "number", label: "Monthly cost", order: 0 };

function Harness({ initial = "", onChange = () => {} }: { initial?: string; onChange?: (f: string) => void }) {
  const [formula, setFormula] = useState(initial);
  return (
    <FormulaEditor
      formula={formula}
      numericFields={[COST]}
      decimals={2}
      onChange={(next) => {
        setFormula(next);
        onChange(next);
      }}
    />
  );
}

describe("FormulaEditor", () => {
  it("opens a field picker on '{' and inserts the reference", () => {
    const onChange = vi.fn();
    renderWithProviders(<Harness onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Formula"), { target: { value: "{" } });
    fireEvent.click(screen.getByRole("menuitem", { name: "Monthly cost" }));
    expect(onChange).toHaveBeenLastCalledWith("{cost}");
  });

  it("reads the formula back with labels and previews it with inputs set to 1", () => {
    renderWithProviders(<Harness initial="{cost} * 12" />);
    expect(screen.getByText("= Monthly cost × 12")).toBeInTheDocument();
    expect(screen.getByText("Result with every input set to 1:")).toBeInTheDocument();
    expect(screen.getByText("12.00")).toBeInTheDocument();
  });

  it("shows where a formula stops parsing", () => {
    renderWithProviders(<Harness initial="{cost} * 12)" />);
    expect(screen.getByText("Unexpected ')' at position 12")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd Clients && npx vitest run src/presentation/pages/IntakeFormBuilder/__tests__/FieldPalette.advanced.test.tsx src/presentation/pages/IntakeFormBuilder/__tests__/FormulaEditor.test.tsx`
Expected: FAIL — no Advanced section; `FormulaEditor` not found.

- [ ] **Step 3: Add the advanced palette item**

In `types.ts`, after `PALETTE_ITEMS`:

```ts
/** Field types kept out of the main palette list (few forms need them). */
export const ADVANCED_PALETTE_ITEMS: PaletteItem[] = [
  {
    type: "calculated",
    label: "Calculated",
    icon: "Calculate",
    description: "Read-only result of a formula",
    defaultConfig: { formula: "", decimals: 2 },
  },
];
```

- [ ] **Step 4: Create `EditorSection.tsx`**

```tsx
import { useState, ReactNode } from "react";
import { Box, Collapse, Typography, useTheme } from "@mui/material";
import { ChevronRight } from "lucide-react";

interface EditorSectionProps {
  title: string;
  /** One line shown under the title, e.g. "Always shown". */
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** A collapsed-by-default section in the field editor or palette. */
export function EditorSection({ title, summary, defaultOpen = false, children }: EditorSectionProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Box>
      <Box
        component="button"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        sx={{
          "display": "flex",
          "alignItems": "center",
          "gap": "6px",
          "width": "100%",
          "background": "none",
          "border": "none",
          "padding": "4px 0",
          "cursor": "pointer",
          "textAlign": "left",
          "&:hover": { backgroundColor: theme.palette.background.accent },
        }}
      >
        <Box
          sx={{
            display: "flex",
            color: theme.palette.other.icon,
            transition: "transform 0.15s ease",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
          }}
        >
          <ChevronRight size={14} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography
            sx={{
              fontWeight: 600,
              color: theme.palette.other.icon,
              fontSize: "10px",
              letterSpacing: "0.5px",
              textTransform: "uppercase",
            }}
          >
            {title}
          </Typography>
          {summary && (
            <Typography sx={{ fontSize: "11px", color: theme.palette.text.accent }}>
              {summary}
            </Typography>
          )}
        </Box>
      </Box>
      <Collapse in={open} timeout={150} unmountOnExit>
        <Box sx={{ pt: "12px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {children}
        </Box>
      </Collapse>
    </Box>
  );
}

export default EditorSection;
```

- [ ] **Step 5: Add the Advanced section to the palette**

In `FieldPalette.tsx`: add `Calculator` to the `lucide-react` import, add `Calculate: Calculator,` to `ICON_MAP`, add `ADVANCED_PALETTE_ITEMS` to the `./types` import, import `{ EditorSection } from "./EditorSection"`, and replace the palette list block (~806-814) with:

```tsx
      <Box sx={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <Box sx={{ p: "8px" }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {PALETTE_ITEMS.map((item) => (
              <ClickablePaletteItem key={item.type} item={item} onAdd={handleAddPaletteItem} />
            ))}
          </Box>
        </Box>
        <Box sx={{ p: "8px", borderTop: `1px solid ${theme.palette.border.dark}` }}>
          <EditorSection title="Advanced">
            {ADVANCED_PALETTE_ITEMS.map((item) => (
              <ClickablePaletteItem key={item.type} item={item} onAdd={handleAddPaletteItem} />
            ))}
          </EditorSection>
        </Box>
      </Box>
```

(`EditorSection` unmounts its content while collapsed, which is what the palette test relies on: "Calculated" is absent until Advanced is opened.)

- [ ] **Step 6: Create `FormulaEditor.tsx`**

```tsx
import { useRef, useState, ChangeEvent } from "react";
import { Box, Menu, MenuItem, Typography, useTheme } from "@mui/material";
import Field from "../../components/Inputs/Field";
import type { FormField } from "./types";
import {
  evaluateFormula,
  normalizeDecimals,
  parseFormula,
} from "../../../application/utils/intakeFormLogic";
import {
  describeFormula,
  formatCalculatedValue,
} from "../../../application/utils/intakeAnswerFormat";

interface FormulaEditorProps {
  formula: string;
  /** Number and calculated fields above the field being edited. */
  numericFields: FormField[];
  decimals?: number;
  onChange: (formula: string) => void;
}

export function FormulaEditor({ formula, numericFields, decimals, onChange }: FormulaEditorProps) {
  const theme = useTheme();
  const caretRef = useRef<number>(formula.length);
  const [pickerAnchor, setPickerAnchor] = useState<HTMLElement | null>(null);
  const parsed = formula.trim() === "" ? null : parseFormula(formula);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    const caret = event.target.selectionStart ?? next.length;
    caretRef.current = caret;
    onChange(next);
    // Typing "{" opens the picker of fields the formula may use.
    if (next.length === formula.length + 1 && next[caret - 1] === "{") {
      setPickerAnchor(event.target);
    }
  };

  const insertField = (fieldId: string) => {
    const caret = Math.min(caretRef.current, formula.length);
    const before = formula.slice(0, caret);
    const after = formula.slice(caret);
    const base = before.endsWith("{") ? before.slice(0, -1) : before;
    onChange(`${base}{${fieldId}}${after}`);
    setPickerAnchor(null);
  };

  const preview =
    parsed && parsed.ok
      ? evaluateFormula(
          parsed.ast,
          Object.fromEntries(parsed.refs.map((ref) => [ref, 1])),
          normalizeDecimals(decimals),
        )
      : null;

  return (
    <Box>
      <Field
        id="field-formula"
        label="Formula"
        value={formula}
        onChange={handleChange}
        placeholder="Type { to insert a field"
      />
      <Menu anchorEl={pickerAnchor} open={Boolean(pickerAnchor)} onClose={() => setPickerAnchor(null)}>
        {numericFields.length === 0 ? (
          <MenuItem disabled>Add a number field above this one first</MenuItem>
        ) : (
          numericFields.map((field) => (
            <MenuItem key={field.id} onClick={() => insertField(field.id)} sx={{ fontSize: "13px" }}>
              {field.label}
            </MenuItem>
          ))
        )}
      </Menu>
      {parsed && !parsed.ok && (
        <Typography sx={{ fontSize: "11px", color: theme.palette.status.error.text, mt: "4px" }}>
          {`${parsed.error} at position ${parsed.position + 1}`}
        </Typography>
      )}
      {parsed && parsed.ok && (
        <>
          <Typography sx={{ fontSize: "12px", color: theme.palette.text.secondary, mt: "4px" }}>
            {describeFormula(formula, numericFields)}
          </Typography>
          <Box sx={{ display: "flex", gap: "4px", mt: "2px" }}>
            <Typography sx={{ fontSize: "11px", color: theme.palette.text.accent }}>
              Result with every input set to 1:
            </Typography>
            <Typography sx={{ fontSize: "11px", color: theme.palette.text.accent }}>
              {formatCalculatedValue(preview, { decimals })}
            </Typography>
          </Box>
        </>
      )}
    </Box>
  );
}

export default FormulaEditor;
```

Note: `describeFormula` gets only `numericFields`; a reference to any other field reads "missing field", which matches what the save check will report.

- [ ] **Step 7: Calculated settings in the field editor**

In `FieldEditor.tsx`:
- Add `allFields: FormField[];` to `FieldEditorProps` and to the destructured props.
- Import `{ FormulaEditor } from "./FormulaEditor"`, `{ EditorSection } from "./EditorSection"` and `{ sortFields } from "../../../application/utils/intakeFormLogic"`.
- After `const showMinMaxLength = ...`, add:

```tsx
  const isCalculated = localField.type === "calculated";
  const earlierFields = (() => {
    const sorted = sortFields(allFields);
    const index = sorted.findIndex((candidate) => candidate.id === localField.id);
    return index < 0 ? sorted : sorted.slice(0, index);
  })();
  const numericFields = earlierFields.filter(
    (candidate) => candidate.type === "number" || candidate.type === "calculated",
  );
```

- Wrap the Placeholder `Field` and the whole Guidance text `Box` in `{!isCalculated && (<>...</>)}`.
- Wrap the Validation `Box`, the `Divider` after it and the Entity mapping `Box` in `{!isCalculated && (<>...</>)}`.
- Directly after the Options block (`{showOptions && (...)}`), add:

```tsx
          {isCalculated && (
            <>
              <EditorSection title="Calculation" defaultOpen>
                <FormulaEditor
                  formula={localField.formula ?? ""}
                  numericFields={numericFields}
                  decimals={localField.decimals}
                  onChange={(formula) => handleChange("formula", formula)}
                />
                <Field
                  id="field-decimals"
                  label="Decimals"
                  type="number"
                  value={String(localField.decimals ?? 2)}
                  onChange={(e) => {
                    const v = e.target.value;
                    handleChange("decimals", v === "" ? undefined : Number(v));
                  }}
                />
                <Box sx={{ display: "flex", gap: "8px", minWidth: 0 }}>
                  <Field
                    id="field-prefix"
                    label="Prefix"
                    value={localField.prefix ?? ""}
                    onChange={(e) => handleChange("prefix", e.target.value || undefined)}
                    sx={{ flex: 1, minWidth: 0 }}
                  />
                  <Field
                    id="field-suffix"
                    label="Suffix"
                    value={localField.suffix ?? ""}
                    onChange={(e) => handleChange("suffix", e.target.value || undefined)}
                    sx={{ flex: 1, minWidth: 0 }}
                  />
                </Box>
              </EditorSection>
              <Divider sx={{ borderColor: theme.palette.border.dark }} />
            </>
          )}
```

In `index.tsx`, add `allFields={form.schema.fields}` to the `<FieldEditor ... />` props.

- [ ] **Step 8: Calculated preview and chips on the canvas**

In `FieldCard.tsx`, import `{ describeFormula, formatCalculatedValue } from "../../../application/utils/intakeAnswerFormat"`, add a `fields: FormField[]` prop to `FieldCardProps` (destructure it in `FieldCard`; `FormCanvas` is its only caller), and in the `FieldPreview` switch (it already has `const theme = useTheme();`) add before `default`:

```tsx
    case "calculated":
      return (
        <Box>
          <PreviewFieldLabel label={field.label} guidanceText={field.guidanceText} />
          <Box
            sx={{
              minHeight: "30px",
              display: "flex",
              alignItems: "center",
              px: "12px",
              border: `1px solid ${theme.palette.border.dark}`,
              borderRadius: "4px",
              backgroundColor: theme.palette.background.accent,
              fontSize: "13px",
              color: theme.palette.text.accent,
            }}
          >
            {formatCalculatedValue(null, field)}
          </Box>
        </Box>
      );
```

In the metadata badges `Box`, after the type chip:

```tsx
        {field.type === "calculated" && field.formula && (
          <Typography sx={{ fontSize: "11px", color: theme.palette.text.accent, width: "100%" }}>
            {describeFormula(
              field.formula,
              fields.filter((f) => f.type === "number" || f.type === "calculated"),
            )}
          </Typography>
        )}
```

In `FormCanvas.tsx`, pass `fields={fields}` to each `<FieldCard>`.

- [ ] **Step 9: Translations**

Run: `cd Clients && npm run i18n:audit:strict`. For every string it reports from this table, add the entry to `de`, `fr` and `es` in `src/i18n/translations.ts` (next to `"Field settings"` in each block). Skip strings the audit does not report: they already exist.

| English | de | fr | es |
|---|---|---|---|
| Advanced | Erweitert | Avancé | Avanzado |
| Calculated | Berechnet | Calculé | Calculado |
| Read-only result of a formula | Schreibgeschütztes Ergebnis einer Formel | Résultat en lecture seule d'une formule | Resultado de solo lectura de una fórmula |
| Calculation | Berechnung | Calcul | Cálculo |
| Formula | Formel | Formule | Fórmula |
| Type { to insert a field | Geben Sie { ein, um ein Feld einzufügen | Tapez { pour insérer un champ | Escriba { para insertar un campo |
| Add a number field above this one first | Fügen Sie zuerst darüber ein Zahlenfeld hinzu | Ajoutez d'abord un champ numérique au-dessus | Primero agregue un campo numérico encima |
| Result with every input set to 1: | Ergebnis, wenn jede Eingabe 1 ist: | Résultat avec chaque entrée à 1 : | Resultado con cada entrada en 1: |
| Decimals | Dezimalstellen | Décimales | Decimales |
| Prefix | Präfix | Préfixe | Prefijo |
| Suffix | Suffix | Suffixe | Sufijo |

If the audit reports a string not in this table, translate it in the same register and add it.

- [ ] **Step 10: Run the tests to verify they pass**

Run: `cd Clients && npx vitest run src/presentation/pages/IntakeFormBuilder`
Expected: PASS — the two new files and the existing builder tests.

- [ ] **Step 11: Gates**

Run: `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check`
Expected: clean.

- [ ] **Step 12: Commit**

```bash
git add Clients/src/presentation/pages/IntakeFormBuilder Clients/src/i18n/translations.ts
git commit -m "feat(intake): add calculated fields to the form builder

The calculated field type sits in a collapsed Advanced section of the
palette. Its editor has a formula input where typing '{' opens a picker
of number and calculated fields above it, a line that reads the formula
back with labels, a preview with every input set to 1, parse errors with
their position, and decimals, prefix and suffix. Canvas cards show the
formula in words."
```

---

### Task 8: Builder: show/hide rules, risk tags and live checks

**Files:**
- Create: `Clients/src/presentation/pages/IntakeFormBuilder/VisibilityEditor.tsx`
- Modify: `Clients/src/presentation/pages/IntakeFormBuilder/types.ts` (add `RISK_DIMENSION_OPTIONS`)
- Modify: `Clients/src/presentation/pages/IntakeFormBuilder/FieldEditor.tsx` (rules + risk sections, required label, error list)
- Modify: `Clients/src/presentation/pages/IntakeFormBuilder/FieldCard.tsx` (Conditional chip, error outline)
- Modify: `Clients/src/presentation/pages/IntakeFormBuilder/FormCanvas.tsx` (`errorFieldIds` prop)
- Modify: `Clients/src/presentation/pages/IntakeFormBuilder/index.tsx` (`logicErrors`, save block, props)
- Modify: `Clients/src/i18n/translations.ts`
- Test: `__tests__/VisibilityEditor.test.tsx`; extend `__tests__/IntakeFormBuilder.test.tsx`

**Interfaces:**
- Consumes: `OPERATORS_BY_TYPE`, `RISK_DIMENSIONS`, `RISK_TAGGABLE_TYPES`, `validateSchemaLogic`, `sortFields`, types `Visibility`, `Condition`, `ConditionOperator`, `SchemaLogicError` (client module); `EditorSection` (Task 7); `FieldEditor` `allFields` (Task 7).
- Produces: `VisibilityEditor({ visibility, earlierFields, onChange })`, `operatorLabel(refType: string, operator: ConditionOperator): string`, `visibilitySummary(visibility?: Visibility): string`; `FieldEditor` prop `logicErrors?: SchemaLogicError[]`; `FormCanvas` prop `errorFieldIds?: Set<string>`; `FieldCard` prop `hasLogicError?: boolean`.

- [ ] **Step 1: Write the failing tests**

`Clients/src/presentation/pages/IntakeFormBuilder/__tests__/VisibilityEditor.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { VisibilityEditor, operatorLabel, visibilitySummary } from "../VisibilityEditor";
import type { FormField } from "../types";

const PERSONAL: FormField = {
  id: "personal",
  type: "select",
  label: "Personal data?",
  order: 0,
  options: [
    { value: "yes", label: "Yes" },
    { value: "no", label: "No" },
  ],
};

describe("VisibilityEditor", () => {
  it("adds a condition on the first earlier field with its first operator and option", () => {
    const onChange = vi.fn();
    renderWithProviders(
      <VisibilityEditor visibility={undefined} earlierFields={[PERSONAL]} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add condition" }));
    expect(onChange).toHaveBeenCalledWith({
      match: "all",
      conditions: [{ fieldId: "personal", operator: "equals", value: "yes" }],
    });
  });

  it("clears the rules when the last condition is removed", () => {
    const onChange = vi.fn();
    renderWithProviders(
      <VisibilityEditor
        visibility={{ match: "all", conditions: [{ fieldId: "personal", operator: "equals", value: "yes" }] }}
        earlierFields={[PERSONAL]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove condition" }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("explains when there is no earlier field to depend on", () => {
    renderWithProviders(<VisibilityEditor visibility={undefined} earlierFields={[]} onChange={vi.fn()} />);
    expect(screen.getByText("Add a field above this one to create a rule")).toBeInTheDocument();
  });

  it("words operators for authors", () => {
    expect(operatorLabel("multiselect", "equals")).toBe("includes");
    expect(operatorLabel("select", "not_equals")).toBe("is not");
    expect(operatorLabel("number", "gte")).toBe("≥");
  });

  it("summarises the rules", () => {
    expect(visibilitySummary(undefined)).toBe("Always shown");
    expect(visibilitySummary({ match: "any", conditions: [{ fieldId: "a", operator: "is_empty" }] })).toBe(
      "Shown when any condition matches",
    );
  });
});
```

In `__tests__/IntakeFormBuilder.test.tsx`, add this test inside the existing `describe("a form's stored LLM key", ...)` block (it reuses that block's `renderEditRoute`, `formLoaded` and `toggle` helpers; flipping the suggested questions toggle makes the form dirty so Save is enabled):

```tsx
    it("blocks saving while a field has a logic problem", async () => {
      mockGetLLMKeys.mockResolvedValue({ data: { data: [openAIKey] } });
      vi.mocked(getIntakeForm).mockResolvedValue({
        data: {
          id: 5,
          name: "Intake",
          entityType: "use_case",
          status: "draft",
          suggestedQuestionsEnabled: true,
          llmKeyId: 3,
          schema: {
            version: "1.0",
            fields: [
              { id: "total", type: "calculated", label: "Total", order: 0, formula: "{later} + 1" },
              { id: "later", type: "number", label: "Later", order: 1 },
            ],
          },
        },
      } as never);
      renderEditRoute();
      await formLoaded();
      fireEvent.click(toggle()!);
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(await screen.findByText("Fix the highlighted fields before saving")).toBeInTheDocument();
      expect(updateIntakeForm).not.toHaveBeenCalled();
    });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd Clients && npx vitest run src/presentation/pages/IntakeFormBuilder/__tests__/VisibilityEditor.test.tsx src/presentation/pages/IntakeFormBuilder/__tests__/IntakeFormBuilder.test.tsx`
Expected: FAIL — module missing; the invalid form saves.

- [ ] **Step 3: Add risk dimension options**

In `types.ts`:

```ts
/** Risk dimensions a field can feed, in the order the editor lists them. */
export const RISK_DIMENSION_OPTIONS: Array<{ _id: string; name: string }> = [
  { _id: "data_sensitivity", name: "Data sensitivity" },
  { _id: "autonomy_level", name: "Autonomy level" },
  { _id: "impact_scope", name: "Impact scope" },
  { _id: "transparency", name: "Transparency" },
  { _id: "human_oversight", name: "Human oversight" },
  { _id: "domain_criticality", name: "Domain criticality" },
];
```

- [ ] **Step 4: Create `VisibilityEditor.tsx`**

```tsx
import { Box, IconButton, Typography, useTheme } from "@mui/material";
import { Plus, Trash2 } from "lucide-react";
import Field from "../../components/Inputs/Field";
import Select from "../../components/Inputs/Select";
import Checkbox from "../../components/Inputs/Checkbox";
import { CustomizableButton } from "../../components/button/customizable-button";
import type { FormField } from "./types";
import {
  OPERATORS_BY_TYPE,
  type Condition,
  type ConditionOperator,
  type Visibility,
} from "../../../application/utils/intakeFormLogic";

const SYMBOLS: Partial<Record<ConditionOperator, string>> = {
  eq: "=",
  neq: "≠",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
};

/** How an operator reads for a referenced field of type `refType`. */
export function operatorLabel(refType: string, operator: ConditionOperator): string {
  if (SYMBOLS[operator]) return SYMBOLS[operator]!;
  if (operator === "is_empty") return "is empty";
  if (operator === "is_not_empty") return "is not empty";
  if (operator === "is_checked") return "is checked";
  if (operator === "is_not_checked") return "is not checked";
  if (operator === "contains") return "contains";
  if (refType === "multiselect") {
    if (operator === "equals") return "includes";
    if (operator === "not_equals") return "does not include";
    return "includes any of";
  }
  if (operator === "equals") return "is";
  if (operator === "not_equals") return "is not";
  return "is one of";
}

/** The collapsed section's one-line summary. */
export function visibilitySummary(visibility?: Visibility): string {
  if (!visibility || visibility.conditions.length === 0) return "Always shown";
  return visibility.match === "any"
    ? "Shown when any condition matches"
    : "Shown when all conditions match";
}

const NO_VALUE: ConditionOperator[] = ["is_empty", "is_not_empty", "is_checked", "is_not_checked"];

function defaultCondition(ref: FormField): Condition {
  const operator = (OPERATORS_BY_TYPE[ref.type] ?? ["is_not_empty"])[0];
  const firstOption = ref.options?.[0]?.value;
  if (NO_VALUE.includes(operator)) return { fieldId: ref.id, operator };
  if (operator === "one_of") return { fieldId: ref.id, operator, value: [] };
  if (firstOption !== undefined) return { fieldId: ref.id, operator, value: firstOption };
  return { fieldId: ref.id, operator };
}

interface VisibilityEditorProps {
  visibility?: Visibility;
  /** Fields above the one being edited; rules may only use these. */
  earlierFields: FormField[];
  onChange: (visibility: Visibility | undefined) => void;
}

export function VisibilityEditor({ visibility, earlierFields, onChange }: VisibilityEditorProps) {
  const theme = useTheme();
  const conditions = visibility?.conditions ?? [];
  const match = visibility?.match ?? "all";

  const commit = (next: Condition[], nextMatch = match) =>
    onChange(next.length === 0 ? undefined : { match: nextMatch, conditions: next });
  const update = (index: number, condition: Condition) =>
    commit(conditions.map((c, i) => (i === index ? condition : c)));

  if (earlierFields.length === 0) {
    return (
      <Typography sx={{ fontSize: "11px", color: theme.palette.text.accent }}>
        Add a field above this one to create a rule
      </Typography>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {conditions.length > 1 && (
        <Select
          id="visibility-match"
          label="Match"
          value={match}
          items={[
            { _id: "all", name: "All conditions" },
            { _id: "any", name: "Any condition" },
          ]}
          onChange={(e) => commit(conditions, e.target.value === "any" ? "any" : "all")}
        />
      )}
      {conditions.map((condition, index) => {
        const ref = earlierFields.find((f) => f.id === condition.fieldId) ?? earlierFields[0];
        const operators = OPERATORS_BY_TYPE[ref.type] ?? ["is_empty", "is_not_empty"];
        const operator = condition.operator as ConditionOperator;
        return (
          <Box
            key={index}
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              p: "8px",
              border: `1px solid ${theme.palette.border.dark}`,
              borderRadius: "4px",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Select
                  id={`condition-field-${index}`}
                  label="Field"
                  value={ref.id}
                  items={earlierFields.map((f) => ({ _id: f.id, name: f.label }))}
                  onChange={(e) => {
                    const next = earlierFields.find((f) => f.id === e.target.value);
                    if (next) update(index, defaultCondition(next));
                  }}
                />
              </Box>
              <IconButton
                size="small"
                aria-label="Remove condition"
                onClick={() => commit(conditions.filter((_, i) => i !== index))}
                sx={{ p: "4px", color: theme.palette.other.icon }}
              >
                <Trash2 size={14} />
              </IconButton>
            </Box>
            <Select
              id={`condition-operator-${index}`}
              label="Condition"
              value={operator}
              items={operators.map((op) => ({ _id: op, name: operatorLabel(ref.type, op) }))}
              onChange={(e) =>
                update(index, {
                  ...defaultCondition(ref),
                  operator: e.target.value as ConditionOperator,
                  ...(e.target.value === "one_of" ? { value: [] } : {}),
                })
              }
            />
            {!NO_VALUE.includes(operator) && (ref.type === "select" || ref.type === "multiselect") &&
              operator !== "one_of" && (
                <Select
                  id={`condition-value-${index}`}
                  label="Value"
                  value={typeof condition.value === "string" ? condition.value : ""}
                  items={(ref.options ?? []).map((o) => ({ _id: o.value, name: o.label }))}
                  onChange={(e) => update(index, { ...condition, value: String(e.target.value) })}
                />
              )}
            {operator === "one_of" &&
              (ref.options ?? []).map((option) => {
                const selected = Array.isArray(condition.value) ? condition.value : [];
                const checked = selected.includes(option.value);
                return (
                  <Checkbox
                    key={option.value}
                    id={`condition-${index}-option-${option.value}`}
                    label={option.label}
                    value={option.value}
                    isChecked={checked}
                    size="small"
                    onChange={() =>
                      update(index, {
                        ...condition,
                        value: checked
                          ? selected.filter((v) => v !== option.value)
                          : [...selected, option.value],
                      })
                    }
                  />
                );
              })}
            {!NO_VALUE.includes(operator) && SYMBOLS[operator] && (
              <Field
                id={`condition-value-${index}`}
                label="Value"
                type="number"
                value={typeof condition.value === "number" ? String(condition.value) : ""}
                onChange={(e) =>
                  update(index, {
                    ...condition,
                    value: e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
              />
            )}
            {(operator === "equals" || operator === "contains") &&
              !(ref.type === "select" || ref.type === "multiselect") && (
                <Field
                  id={`condition-value-${index}`}
                  label="Value"
                  value={typeof condition.value === "string" ? condition.value : ""}
                  onChange={(e) => update(index, { ...condition, value: e.target.value })}
                />
              )}
          </Box>
        );
      })}
      <CustomizableButton
        variant="outlined"
        size="small"
        text="Add condition"
        startIcon={<Plus size={14} />}
        isDisabled={conditions.length >= 20}
        onClick={() => commit([...conditions, defaultCondition(earlierFields[0])])}
      />
    </Box>
  );
}

export default VisibilityEditor;
```

- [ ] **Step 5: Rules, risk tag, required label and errors in the field editor**

In `FieldEditor.tsx`:
- Add `logicErrors?: SchemaLogicError[];` to the props (default `[]`), import `{ VisibilityEditor, visibilitySummary } from "./VisibilityEditor"`, `RISK_DIMENSION_OPTIONS` from `./types`, and `RISK_TAGGABLE_TYPES` and `type SchemaLogicError` from the client logic module.
- Add `const hasRules = (localField.visibility?.conditions.length ?? 0) > 0;`.
- Change the required `Checkbox` label to `label={hasRules ? "Required when shown" : "Required field"}`.
- At the top of the content column (first child of the `gap: "20px"` Box), add:

```tsx
          {logicErrors.length > 0 && (
            <Box role="alert" sx={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {logicErrors.map((error) => (
                <Typography
                  key={error.message}
                  sx={{ fontSize: "12px", color: theme.palette.status.error.text }}
                >
                  {error.message}
                </Typography>
              ))}
            </Box>
          )}
```

- At the end of the content column (after the Entity mapping block, inside the same Box), add:

```tsx
          <Divider sx={{ borderColor: theme.palette.border.dark }} />
          <EditorSection title="Show this field only if…" summary={visibilitySummary(localField.visibility)}>
            <VisibilityEditor
              visibility={localField.visibility}
              earlierFields={earlierFields}
              onChange={(visibility) => handleChange("visibility", visibility)}
            />
          </EditorSection>
          {RISK_TAGGABLE_TYPES.includes(localField.type) && (
            <EditorSection title="Risk scoring">
              <Select
                id="field-risk-dimension"
                label="Risk dimension"
                value={localField.riskDimension ?? ""}
                items={[{ _id: "", name: "None" }, ...RISK_DIMENSION_OPTIONS]}
                onChange={(e) =>
                  handleChange("riskDimension", e.target.value === "" ? undefined : String(e.target.value))
                }
              />
            </EditorSection>
          )}
```

- [ ] **Step 6: Conditional chip and error outline on cards**

In `FieldCard.tsx`, add `hasLogicError?: boolean;` to `FieldCardProps` (destructure with default `false`). In the card container `sx`, change the `"border"` line to:

```tsx
        "border": hasLogicError
          ? `1px solid ${theme.palette.status.error.text}`
          : isSelected
            ? `1px solid ${theme.palette.border.dark}`
            : "1px solid transparent",
```

After the type chip in the badges `Box`, add:

```tsx
        {(field.visibility?.conditions.length ?? 0) > 0 && (
          <Chip label="Conditional" variant="info" size="small" uppercase={false} />
        )}
```

In `FormCanvas.tsx`, add `errorFieldIds?: Set<string>;` to `FormCanvasProps`, destructure it, and pass `hasLogicError={errorFieldIds?.has(field.id) ?? false}` to each `<FieldCard>`.

- [ ] **Step 7: Live checks and the save block in the page**

In `index.tsx`, import `{ validateSchemaLogic } from "../../../application/utils/intakeFormLogic"` and add near the other derived values:

```tsx
  // Same checks the server runs on save, shown while editing.
  const logicErrors = useMemo(
    () => validateSchemaLogic(form.schema, form.entityType),
    [form.schema, form.entityType],
  );
  const logicErrorFieldIds = useMemo(
    () => new Set(logicErrors.map((error) => error.fieldId)),
    [logicErrors],
  );
```

At the start of `handleSave`, after the form name check, add:

```tsx
    if (logicErrors.length > 0) {
      setSnackbar({
        open: true,
        message: "Fix the highlighted fields before saving",
        severity: "error",
      });
      return null;
    }
```

Pass `errorFieldIds={logicErrorFieldIds}` to `<FormCanvas>` and `logicErrors={logicErrors.filter((error) => error.fieldId === selectedField.id)}` to `<FieldEditor>`.

- [ ] **Step 8: Translations**

Run `cd Clients && npm run i18n:audit:strict` and add every reported string from this table to `de`, `fr`, `es` (same placement as Task 7):

| English | de | fr | es |
|---|---|---|---|
| Show this field only if… | Dieses Feld nur anzeigen, wenn… | Afficher ce champ uniquement si… | Mostrar este campo solo si… |
| Always shown | Immer angezeigt | Toujours affiché | Siempre visible |
| Shown when all conditions match | Angezeigt, wenn alle Bedingungen zutreffen | Affiché lorsque toutes les conditions sont remplies | Visible cuando se cumplen todas las condiciones |
| Shown when any condition matches | Angezeigt, wenn eine Bedingung zutrifft | Affiché lorsqu'une condition est remplie | Visible cuando se cumple alguna condición |
| Match | Übereinstimmung | Correspondance | Coincidencia |
| All conditions | Alle Bedingungen | Toutes les conditions | Todas las condiciones |
| Any condition | Eine beliebige Bedingung | N'importe quelle condition | Cualquier condición |
| Add condition | Bedingung hinzufügen | Ajouter une condition | Agregar condición |
| Remove condition | Bedingung entfernen | Supprimer la condition | Eliminar condición |
| Add a field above this one to create a rule | Fügen Sie darüber ein Feld hinzu, um eine Regel zu erstellen | Ajoutez un champ au-dessus pour créer une règle | Agregue un campo encima para crear una regla |
| Field | Feld | Champ | Campo |
| Condition | Bedingung | Condition | Condición |
| Value | Wert | Valeur | Valor |
| is | ist | est | es |
| is not | ist nicht | n'est pas | no es |
| is one of | ist eines von | est l'un de | es uno de |
| includes | enthält | inclut | incluye |
| does not include | enthält nicht | n'inclut pas | no incluye |
| includes any of | enthält eines von | inclut l'un de | incluye alguno de |
| is checked | ist ausgewählt | est coché | está marcado |
| is not checked | ist nicht ausgewählt | n'est pas coché | no está marcado |
| contains | enthält | contient | contiene |
| is empty | ist leer | est vide | está vacío |
| is not empty | ist nicht leer | n'est pas vide | no está vacío |
| Risk scoring | Risikobewertung | Évaluation des risques | Puntuación de riesgo |
| Risk dimension | Risikodimension | Dimension de risque | Dimensión de riesgo |
| Data sensitivity | Datensensibilität | Sensibilité des données | Sensibilidad de los datos |
| Autonomy level | Autonomiegrad | Niveau d'autonomie | Nivel de autonomía |
| Impact scope | Auswirkungsbereich | Portée de l'impact | Alcance del impacto |
| Transparency | Transparenz | Transparence | Transparencia |
| Human oversight | Menschliche Aufsicht | Supervision humaine | Supervisión humana |
| Domain criticality | Kritikalität des Bereichs | Criticité du domaine | Criticidad del dominio |
| Required when shown | Erforderlich, wenn angezeigt | Requis lorsqu'il est affiché | Obligatorio cuando se muestra |
| Conditional | Bedingt | Conditionnel | Condicional |
| Fix the highlighted fields before saving | Korrigieren Sie die markierten Felder vor dem Speichern | Corrigez les champs en surbrillance avant d'enregistrer | Corrija los campos resaltados antes de guardar |

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd Clients && npx vitest run src/presentation/pages/IntakeFormBuilder`
Expected: PASS.

- [ ] **Step 10: Gates**

Run: `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check`
Expected: clean.

- [ ] **Step 11: Commit**

```bash
git add Clients/src/presentation/pages/IntakeFormBuilder Clients/src/i18n/translations.ts
git commit -m "feat(intake): add show/hide rules and risk tags to the form builder

Each field gets a collapsed 'Show this field only if…' section with
conditions on fields above it (operators worded per field type, match all
or any) and, for text, select and checkbox fields, a risk dimension
select. The builder runs the server's schema checks as the author edits:
problems show on the field and its card, and saving is blocked until they
are fixed. A required field with rules reads 'Required when shown'."
```

---

### Task 9: Review screens show calculated and other answers

**Files:**
- Modify: `Servers/controllers/intakeForm.ctrl.ts:1124-1133` (`getSubmissionByEntity` fields)
- Modify: `Servers/controllers/__tests__/intakeForm.formLogic.test.ts` (add a describe)
- Modify: `Clients/src/application/utils/intakeAnswerFormat.ts` (add `formatAnswer`)
- Modify: `Clients/src/application/repository/intakeForm.repository.ts` (`IntakeSubmissionField`)
- Modify: `Clients/src/presentation/pages/ProjectView/IntakeSubmissionCard/index.tsx`
- Modify: `Clients/src/presentation/pages/IntakeFormBuilder/SubmissionPreviewModal.tsx`
- Modify: `Clients/src/i18n/translations.ts`
- Test: `Clients/src/presentation/pages/ProjectView/IntakeSubmissionCard/index.test.tsx` (extend), `Clients/src/presentation/pages/IntakeFormBuilder/__tests__/SubmissionPreviewModal.otherAnswers.test.tsx`

**Interfaces:**
- Consumes: `formatCalculatedValue` (Task 5); `sortFields` (client module); stored `null` for visible calculated fields without a result (Task 2/3).
- Produces: `formatAnswer(field: AnswerField, value: unknown, formatDate: (d: string) => string): string`; by-entity field objects gain `answered: boolean`, `decimals`, `prefix`, `suffix`.

- [ ] **Step 1: Write the failing server test**

Append to `Servers/controllers/__tests__/intakeForm.formLogic.test.ts`:

```ts
describe("submission fields for an entity", () => {
  beforeEach(() => jest.clearAllMocks());

  it("marks which fields the submission stored and passes calculated display settings", async () => {
    intake.getSubmissionByEntityQuery.mockResolvedValue({
      submission: { id: 3, data: { cost: "10", total: null }, createdAt: new Date() },
      formName: "F",
      formSchema: {
        fields: [
          { id: "cost", type: "number", label: "Monthly cost", order: 0 },
          { id: "total", type: "calculated", label: "Annual cost", order: 1, decimals: 0, prefix: "€" },
          { id: "old", type: "calculated", label: "Old", order: 2 },
        ],
      },
    });
    const r = res();
    await ctrl.getSubmissionByEntity(
      req({ params: { entityType: "use_case", entityId: "4" } }) as any,
      r,
    );
    expect(r.status).toHaveBeenCalledWith(200);
    const fields = r.json.mock.calls[0][0].data.fields;
    expect(fields.find((f: any) => f.fieldId === "total")).toMatchObject({
      answered: true,
      value: null,
      decimals: 0,
      prefix: "€",
    });
    expect(fields.find((f: any) => f.fieldId === "old").answered).toBe(false);
  });
});
```

(`getSubmissionByEntity` reads `req.params.entityType` and `req.params.entityId`.)

- [ ] **Step 2: Run it to verify it fails**

Run: `cd Servers && npx jest controllers/__tests__/intakeForm.formLogic.test.ts`
Expected: FAIL — `answered` undefined.

- [ ] **Step 3: Add the extras to the server's field list**

In `getSubmissionByEntity`, extend the mapped object:

```ts
      .map((field: any) => ({
        fieldId: field.id,
        label: field.label,
        type: field.type,
        value: submissionData[field.id] ?? null,
        // A visible calculated field without a result is stored as null; a
        // hidden one, or a submission from before the field existed, has no key.
        answered: Object.prototype.hasOwnProperty.call(submissionData ?? {}, field.id),
        options: field.options || null,
        decimals: field.decimals ?? null,
        prefix: field.prefix ?? null,
        suffix: field.suffix ?? null,
        entityFieldMapping: field.entityFieldMapping || null,
        isMapped: Boolean(field.entityFieldMapping),
      }));
```

Run the server test again — PASS. Then `cd Servers && npm run build && npm run format-check`.

- [ ] **Step 4: Write the failing client tests**

In `Clients/src/presentation/pages/ProjectView/IntakeSubmissionCard/index.test.tsx`, add inside `describe("IntakeSubmissionCard", ...)` (it uses the file's `mockUseEntityIntakeSubmission` and `baseSubmission`):

```tsx
  it("shows a calculated value and a dash for a stored empty result", async () => {
    mockUseEntityIntakeSubmission.mockReturnValue({
      isLoading: false,
      data: {
        ...baseSubmission,
        fields: [
          { fieldId: "total", label: "Annual cost", type: "calculated", value: 14400, answered: true, decimals: 2, prefix: "€", suffix: null, options: null, entityFieldMapping: null, isMapped: false },
          { fieldId: "ratio", label: "Ratio", type: "calculated", value: null, answered: true, decimals: 2, prefix: null, suffix: null, options: null, entityFieldMapping: null, isMapped: false },
        ],
      },
    });
    renderWithProviders(<IntakeSubmissionCard projectId={1} />);
    fireEvent.click(await screen.findByText(/Additional answers/));
    expect(screen.getByText("€ 14,400.00")).toBeInTheDocument();
    expect(screen.getByText("Ratio")).toBeInTheDocument();
  });

  it("omits a calculated field the submission never stored", async () => {
    mockUseEntityIntakeSubmission.mockReturnValue({
      isLoading: false,
      data: {
        ...baseSubmission,
        fields: [
          { fieldId: "name", label: "Use case name", type: "text", value: "Bot", answered: true, options: null, entityFieldMapping: "project_title", isMapped: true },
          { fieldId: "old", label: "Old total", type: "calculated", value: null, answered: false, decimals: null, prefix: null, suffix: null, options: null, entityFieldMapping: null, isMapped: false },
        ],
      },
    });
    renderWithProviders(<IntakeSubmissionCard projectId={1} />);
    await screen.findByText("Bot");
    expect(screen.queryByText("Old total")).not.toBeInTheDocument();
    expect(screen.queryByText(/Additional answers/)).not.toBeInTheDocument();
  });
```

Create `Clients/src/presentation/pages/IntakeFormBuilder/__tests__/SubmissionPreviewModal.otherAnswers.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import SubmissionPreviewModal from "../SubmissionPreviewModal";

const repo = vi.hoisted(() => ({
  getSubmissionPreview: vi.fn(),
  approveSubmission: vi.fn(),
  rejectSubmission: vi.fn(),
}));
vi.mock("../../../../application/repository/intakeForm.repository", () => repo);

describe("SubmissionPreviewModal other answers", () => {
  it("lists unmapped answers, including calculated values, in a collapsed section", async () => {
    repo.getSubmissionPreview.mockResolvedValue({
      data: {
        submission: {
          id: 1,
          status: "pending",
          data: { title: "Bot", notes: "Pilot only", total: 14400, hiddenNever: undefined },
        },
        riskAssessment: null,
        entityPreview: { project_title: "Bot" },
        form: {
          id: 1,
          name: "F",
          entityType: "use_case",
          schema: {
            version: "1.0",
            fields: [
              { id: "title", type: "text", label: "Use case name", order: 0, entityFieldMapping: "project_title" },
              { id: "notes", type: "textarea", label: "Notes", order: 1 },
              { id: "total", type: "calculated", label: "Annual cost", order: 2, decimals: 2, prefix: "€" },
              { id: "skipped", type: "text", label: "Skipped", order: 3 },
            ],
          },
        },
        euAiActClassification: null,
      },
    });
    renderWithProviders(
      <SubmissionPreviewModal isOpen onClose={vi.fn()} submissionId={1} onApproved={vi.fn()} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Other answers/ }));
    expect(screen.getByText("Pilot only")).toBeInTheDocument();
    expect(screen.getByText("€ 14,400.00")).toBeInTheDocument();
    expect(screen.queryByText("Skipped")).not.toBeInTheDocument();
  });
});
```

(`SubmissionPreviewModal` is the file's default export and imports exactly these three functions from the repository; the rest of that import is types.)

- [ ] **Step 5: Run them to verify they fail**

Run: `cd Clients && npx vitest run src/presentation/pages/ProjectView/IntakeSubmissionCard src/presentation/pages/IntakeFormBuilder/__tests__/SubmissionPreviewModal.otherAnswers.test.tsx`
Expected: FAIL — calculated rows missing; no "Other answers" button.

- [ ] **Step 6: Shared answer formatting**

Append to `Clients/src/application/utils/intakeAnswerFormat.ts`:

```ts
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
  if (value === null || value === undefined || value === "") return "—";
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
```

- [ ] **Step 7: Use it in the submission card**

In `IntakeSubmissionField` (repository) add `answered?: boolean; decimals?: number | null; prefix?: string | null; suffix?: string | null;`.

In `IntakeSubmissionCard/index.tsx`: delete `renderFieldValue`, import `{ formatAnswer } from "../../../../application/utils/intakeAnswerFormat"`, render `{formatAnswer(field, field.value, formatDate)}` in `FieldRow`, and replace the two filters:

```tsx
  // Calculated fields count when the submission stored them (null shows "—");
  // submissions from before a field existed have no key and show nothing.
  const hasAnswer = (f: IntakeSubmissionField) =>
    f.type === "calculated"
      ? Boolean(f.answered)
      : f.value !== null && f.value !== undefined && f.value !== "";
  const mappedFields = submission.fields.filter((f) => f.isMapped && hasAnswer(f));
  const unmappedFields = submission.fields.filter((f) => !f.isMapped && hasAnswer(f));
```

- [ ] **Step 8: Add "Other answers" to the review dialog**

In `SubmissionPreviewModal.tsx`:
- Add `submissionData: Record<string, unknown>;` to `PreviewData` and set `submissionData: sub?.data ?? {},` in `setPreviewData`.
- Add `const [showOtherAnswers, setShowOtherAnswers] = useState(false);` with the other state, and reset it to `false` where `setShowRejectForm(false)` runs on open.
- Import `{ formatAnswer } from "../../../application/utils/intakeAnswerFormat"`, `{ sortFields } from "../../../application/utils/intakeFormLogic"` and `useFormattedDate` (default export) from `../../../application/hooks/useFormattedDate`. `ChevronDown` and `ChevronUp` are already imported from `lucide-react`.
- Add `const formatDate = useFormattedDate();` with the other hooks.
- After `mappedFields`:

```tsx
  // Answers not mapped to the entity, including calculated values, so
  // reviewers see everything the submitter saw before approving.
  const submissionData = previewData?.submissionData ?? {};
  const otherAnswers = sortFields(previewData?.formSchema?.fields ?? []).filter((field) => {
    if (field.entityFieldMapping) return false;
    if (!Object.prototype.hasOwnProperty.call(submissionData, field.id)) return false;
    const value = submissionData[field.id];
    return field.type === "calculated" || (value !== null && value !== undefined && value !== "");
  });
```

- Directly after the closing `</Box>` of the entity preview block (the one that renders `mappedFields`, ~line 598) and before the reject toggle comment:

```tsx
          {otherAnswers.length > 0 && (
            <Box>
              <Box
                component="button"
                type="button"
                aria-expanded={showOtherAnswers}
                onClick={() => setShowOtherAnswers((prev) => !prev)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  color: theme.palette.text.secondary,
                  fontSize: "13px",
                  fontWeight: 500,
                }}
              >
                Other answers ({otherAnswers.length})
                {showOtherAnswers ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </Box>
              {showOtherAnswers && (
                <Box sx={{ mt: "8px", borderTop: `1px solid ${theme.palette.border.light}` }}>
                  {otherAnswers.map((field) => (
                    <Box
                      key={field.id}
                      sx={{ display: "grid", gridTemplateColumns: "200px 1fr", columnGap: "16px", py: "8px" }}
                    >
                      <Typography sx={{ fontSize: "13px", fontWeight: 500, color: theme.palette.text.secondary }}>
                        {field.label}
                      </Typography>
                      <Typography sx={{ fontSize: "13px", color: theme.palette.text.primary, wordBreak: "break-word" }}>
                        {formatAnswer(field, submissionData[field.id], formatDate)}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          )}
```

- [ ] **Step 9: Translations**

Run `cd Clients && npm run i18n:audit:strict`; if it reports "Other answers", add de "Weitere Antworten", fr "Autres réponses", es "Otras respuestas".

- [ ] **Step 10: Run the tests to verify they pass**

Run: `cd Clients && npx vitest run src/presentation/pages/ProjectView/IntakeSubmissionCard src/presentation/pages/IntakeFormBuilder src/application/utils`
Expected: PASS.

- [ ] **Step 11: Gates**

Run: `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check` and `cd Servers && npm run build && npm run format-check`
Expected: clean.

- [ ] **Step 12: Commit**

```bash
git add Servers/controllers Clients/src
git commit -m "feat(intake): show calculated and other answers to reviewers

The review dialog gains a collapsed 'Other answers' section listing
answers not mapped to the entity, including calculated values, so
reviewers see everything before approving. The submission card shows
calculated values formatted with their prefix and suffix, a dash for a
stored empty result, and nothing for submissions made before the field
existed. Answer formatting is shared between the two screens."
```

---

### Task 10: Documentation

**Files:**
- Modify: `shared/user-guide-content/content/ai-governance/intake-forms.ts`
- Mirror: `~/website/verifywise/content/user-guide/content/ai-governance/intake-forms.ts` (copy only, never commit the website repo)
- Modify: `docs/technical/domains/use-cases.md` (append)

**Interfaces:**
- Consumes: the behaviour of Tasks 1–9.

- [ ] **Step 1: Fix the risk scoring section**

In `intake-forms.ts`, replace the paragraph text `'Every submission is scored across multiple risk dimensions. Each dimension produces a score from 1 to 10, a weight and a set of signals (short explanations of what drove the score).'` with:

```ts
      text: 'Every submission is scored across six risk dimensions. Each dimension produces a score from 0 to 100 (higher is riskier), a weight and a set of signals naming the keyword and the field it came from. Keywords match whole words in text answers, the labels of chosen options and the labels of ticked checkboxes. Number, date and calculated answers are not scored. Tag a field with a risk dimension to make only tagged answers count for that dimension.',
```

and replace the `rows` of the dimension table that follows it with:

```ts
      rows: [
        { dimension: 'Data sensitivity', description: 'Whether personal, financial, health or other sensitive data is involved (weight 20%)' },
        { dimension: 'Autonomy level', description: 'How much the system decides without a person (weight 20%)' },
        { dimension: 'Impact scope', description: 'How many people or how much of the organization it reaches (weight 15%)' },
        { dimension: 'Transparency', description: 'Whether its behaviour can be explained and is documented (weight 15%)' },
        { dimension: 'Human oversight', description: 'How closely people monitor and review it (weight 15%)' },
        { dimension: 'Domain criticality', description: 'How critical the domain is, such as healthcare, hiring or finance (weight 15%)' },
      ],
```

- [ ] **Step 2: Add the new sections**

Insert these blocks immediately before the block `{ type: 'heading', id: 'entity-field-mapping', ... }`:

```ts
    {
      type: 'heading',
      id: 'conditional-fields',
      level: 2,
      text: 'Conditional fields',
    },
    {
      type: 'paragraph',
      text: 'Open "Show this field only if…" in a field\'s settings to show it only when answers above it match. Add one or more conditions and choose whether all or any must match. A condition can only use fields above the one you are editing. Until the earlier question is answered, the field stays hidden.',
    },
    {
      type: 'paragraph',
      text: 'Hidden fields are never required and their answers are not saved. Fields mapped to the use case name, the use case goal or the model name cannot have conditions, because those values are needed to create the entity.',
    },
    {
      type: 'heading',
      id: 'calculated-fields',
      level: 2,
      text: 'Calculated fields',
    },
    {
      type: 'paragraph',
      text: 'A calculated field shows a read-only result that updates as the submitter types, for example annual cost from a monthly cost. Add one from the Advanced section of the field palette. Formulas use + − × ÷ (typed as + - * /), parentheses and numbers, and refer to number or calculated fields above the field. Type { in the formula box to insert a field.',
    },
    {
      type: 'paragraph',
      text: 'Set decimals (0 to 6) and an optional prefix or suffix, such as € or people. If an input is empty or hidden, the result shows a dash. The value is recalculated by VerifyWise when the form is submitted and is shown to reviewers.',
    },
    {
      type: 'heading',
      id: 'risk-dimension-tags',
      level: 2,
      text: 'Risk dimension tags',
    },
    {
      type: 'paragraph',
      text: 'Under "Risk scoring" in a text, dropdown or checkbox field\'s settings, choose the risk dimension its answer should feed. When a dimension has tagged answers, only those answers are scored for it; otherwise every answer is used.',
    },
```

- [ ] **Step 3: Mirror the user guide**

```bash
cp shared/user-guide-content/content/ai-governance/intake-forms.ts ~/website/verifywise/content/user-guide/content/ai-governance/intake-forms.ts
```

(Do not stage or commit anything in `~/website`.)

- [ ] **Step 4: Technical note**

Append to `docs/technical/domains/use-cases.md`:

```markdown
## Intake form logic

Intake forms support calculated fields, show/hide rules and risk dimension tags
(spec: `docs/superpowers/specs/2026-10-13-intake-form-logic-design.md`).

- **Logic module.** `Servers/services/intakeFormLogic/` (formula parser and
  evaluator, conditions, `evaluateForm`, `cleanSubmission`,
  `validateSchemaLogic`) is copied byte for byte to
  `Clients/src/application/utils/intakeFormLogic/`. Change both together: a
  Vitest test compares the files, and both Jest and Vitest run the cases in
  `Servers/services/intakeFormLogic/__fixtures__/intakeFormLogic.cases.json`.
- **Server is authoritative.** Both public submit handlers call
  `cleanSubmission` before validation: answers to hidden fields and unknown
  keys are dropped, calculated values are recomputed, and a visible calculated
  field with no result is stored as `null` (hidden ones are left out).
- **Save checks.** Create and update reject invalid formulas, conditions on
  fields that are not above, stale option values, rules on fields mapped to
  required entity fields (`REQUIRED_ENTITY_FIELDS`) and unknown risk
  dimensions. The builder runs the same checks live.
- **Risk scoring.** `intakeRiskScoring.service.ts` scores whole words in text
  answers, option labels and ticked checkbox labels; a dimension uses only its
  tagged answers when any are present.
```

- [ ] **Step 5: Gates**

Run: `cd Clients && npm run typecheck && npm run format-check`
Expected: clean (the user guide content is included in the client typecheck).

- [ ] **Step 6: Commit**

```bash
git add shared/user-guide-content/content/ai-governance/intake-forms.ts docs/technical/domains/use-cases.md
git commit -m "docs(intake): document conditional fields, calculated fields and risk tags

The user guide gains sections on conditional fields, calculated fields
and risk dimension tags, and its risk scoring section now matches the
code: six dimensions scored 0 to 100 (it said 1 to 10 and listed
dimensions the scorer does not have). The use case domain doc explains
the mirrored logic module and the server-side cleaning."
```

---

## Final verification (after Task 10)

- [ ] `cd Servers && npm run build && npm run format-check && npm run test && npm run check:api-drift`
- [ ] `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check && npx vitest run`
- [ ] Manual check in the app: build a form with a checkbox, a conditional required textarea, two number fields and a calculated total; preview it, toggle the checkbox, type numbers, submit; open the submission review and confirm "Other answers" shows the total; confirm the stored submission has no hidden answer.
