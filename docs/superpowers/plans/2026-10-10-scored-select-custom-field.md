# Scored select custom field — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `scored_select` custom field type. It's a single-choice dropdown whose options carry a score. It's available on all 8 custom-field entity types, and definition changes are recorded in the audit ledger.

**Architecture:** The data shape is described in the spec.
- **Pure logic in focused modules.** Scored-option validation and moves go in `Servers/utils/customFieldScoredSelect.utils.ts`. Ledger diffing goes in `Servers/utils/customFieldAudit.utils.ts`.
- **`Servers/utils/customField.utils.ts`** wires them into create, update, delete and value writes. Update and delete run in their own transaction, with row locks. Ledger writes happen after commit.
- **Client.** A scored options editor and a move dialog sit next to the Settings page. One shared formatter renders "High (3)" in every table.

**Tech stack:** Node 22, Express, raw Sequelize queries, PostgreSQL, Jest (Servers); React 19, MUI 7, React Query, Vitest (Clients).

**Spec:** `docs/superpowers/specs/2026-10-10-scored-select-custom-field-design.md`. Read it before any task. The decisions table there is binding.

## Global constraints

- **Branch:** `feature/scored-select-custom-field` in the worktree `/Users/gorkemcetin/.claude-worktrees/verifywise/scored-select`. Never commit to `develop`.
- **Commit format:** `type(scope): description`, with scope `custom-fields`.
- **Field type key:** `scored_select`. The UI label is "Scored select".
- **Option shape:** `{ id, label, score }`.
  - The server assigns the id, as `opt_` plus 8 lowercase hex characters.
  - 1 to 50 options per field.
  - Labels are trimmed, 1 to 255 characters, and unique ignoring case.
  - Scores are finite numbers, rounded to 2 decimals on save, with `-0` stored as `0`.
- **Stored value:** the option id, as a JSON string.
- **Display:** `"<label> (<score>)"`, with trailing zeros dropped. An unknown id shows `"—"`.
- **Ledger:** `entryType: "event_log"`, `entityType: "custom_field_definition"`. One entry per change. Reordering isn't logged. Writes are best-effort and happen after commit.
- **UI rules:**
  - Sentence case for all screen text.
  - Every new string needs de, fr and es entries in `Clients/src/i18n/translations.ts`, and `npm run i18n:audit:strict` must report 0 gaps.
  - Use house components (`Field`, `Select`, `StandardModal`, `CustomizableButton`), not raw MUI inputs.
  - Spacing uses pixel strings (`gap: "8px"`).
- **Gates, run from each package directory:**
  - `cd Servers && npm run build && npm run test && npm run format-check`
  - `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check && npx vitest run src/presentation/components/CustomFieldsSection src/presentation/pages/SettingsPage/CustomFields src/domain`
- **Code style:**
  - No `console.log`.
  - No competitor names in code or commits.
  - Run `npx prettier --write <files>` on every changed file before committing.

## Review focus

These are the failure modes most likely to bite a real admin or reviewer. Each one has a test in the task that owns it.

1. **Renaming an option keeps every record's answer.** The value stores the id, so the label can change freely. *Task 2:* update with renamed labels; values untouched, ids kept.
2. **Two admins edit the same field.** One removes "Medium" while a reviewer saves "Medium" on a use case. The value must never end up pointing at a removed option. *Task 2:* the value write reads the definition `FOR SHARE` inside its transaction. *Task 4:* the update reads it `FOR UPDATE`.
3. **A client sends ids it shouldn't**, for example an id copied from another field, or ids on create. These must be rejected, never stored. *Task 1:* tests for an unknown id, ids on create, and duplicate ids.
4. **A score typed as `0.333` or `-0`** must store and show `0.33` and `0`. Totals in the future formulas PR must match what's shown. *Task 1:* `roundScore`. *Task 5:* `formatScore`.
5. **Existing select and multiselect fields behave exactly as before** after the `options` type widens. *Task 2:* select and multiselect value regression tests. *Task 5:* the existing section tests still pass.

---

### Task 1: Field type, migration and scored option helpers

**Files:**
- Create: `Servers/database/migrations/20261010090000-add-scored-select-custom-field-type.js`
- Create: `Servers/utils/customFieldScoredSelect.utils.ts`
- Test: `Servers/utils/__tests__/customFieldScoredSelect.utils.test.ts`
- Test: `Servers/utils/__tests__/scoredSelectMigration.test.ts`

**Interfaces:**
- Produces (from `customFieldScoredSelect.utils.ts`):
  - `interface IScoredOption { id: string; label: string; score: number }`
  - `const MAX_SCORED_OPTIONS = 50`, `const OPTION_MIN = 1`, `const OPTION_MAX = 255`
  - `const OPTIONS_IN_USE = "options_in_use"`
  - `roundScore(score: number): number`
  - `formatScore(score: number): string`
  - `formatScoredOption(o: { label: string; score: number }): string`
  - `validateScoredOptions(input: unknown, existing: IScoredOption[] | null): IScoredOption[]`
  - `removedOptions(before: IScoredOption[], after: IScoredOption[]): IScoredOption[]`
  - `validateOptionMoves(moves: unknown, removed: IScoredOption[], after: IScoredOption[]): Record<string, string>`

- [ ] **Step 1: Create the branch**

```bash
cd /Users/gorkemcetin/.claude-worktrees/verifywise/scored-select
git checkout -b feature/scored-select-custom-field
```

- [ ] **Step 2: Write the failing helper tests**

`Servers/utils/__tests__/customFieldScoredSelect.utils.test.ts`:

```ts
import { describe, it, expect } from "@jest/globals";
import {
  formatScore,
  formatScoredOption,
  MAX_SCORED_OPTIONS,
  removedOptions,
  roundScore,
  validateOptionMoves,
  validateScoredOptions,
  type IScoredOption,
} from "../customFieldScoredSelect.utils";

const ID = /^opt_[0-9a-f]{8}$/;
const existing: IScoredOption[] = [
  { id: "opt_00000001", label: "High", score: 3 },
  { id: "opt_00000002", label: "Medium", score: 2 },
  { id: "opt_00000003", label: "Low", score: 1 },
];

describe("roundScore / formatScore", () => {
  it("rounds to 2 decimals and drops -0", () => {
    expect(roundScore(0.333)).toBe(0.33);
    expect(roundScore(2.5)).toBe(2.5);
    expect(roundScore(-2)).toBe(-2);
    expect(Object.is(roundScore(-0.001), 0)).toBe(true);
  });
  it("formats without trailing zeros", () => {
    expect(formatScore(3)).toBe("3");
    expect(formatScore(0.5)).toBe("0.5");
    expect(formatScore(0.333)).toBe("0.33");
    expect(formatScoredOption({ label: "High", score: 3 })).toBe("High (3)");
  });
});

describe("validateScoredOptions", () => {
  it("assigns ids on create, trims labels, rounds scores, keeps order", () => {
    const out = validateScoredOptions(
      [
        { label: " High ", score: 3 },
        { label: "Low", score: 0.333 },
      ],
      null,
    );
    expect(out.map((o) => o.label)).toEqual(["High", "Low"]);
    expect(out.map((o) => o.score)).toEqual([3, 0.33]);
    out.forEach((o) => expect(o.id).toMatch(ID));
    expect(new Set(out.map((o) => o.id)).size).toBe(2);
  });

  it("keeps existing ids on update and assigns new ones to new rows", () => {
    const out = validateScoredOptions(
      [
        { id: "opt_00000003", label: "Minimal", score: 1 },
        { id: "opt_00000001", label: "High", score: 4 },
        { label: "Extreme", score: 5 },
      ],
      existing,
    );
    expect(out[0]).toEqual({ id: "opt_00000003", label: "Minimal", score: 1 });
    expect(out[1]).toEqual({ id: "opt_00000001", label: "High", score: 4 });
    expect(out[2].id).toMatch(ID);
    expect(["opt_00000001", "opt_00000002", "opt_00000003"]).not.toContain(out[2].id);
  });

  it("drops unknown keys on an option", () => {
    const [o] = validateScoredOptions([{ label: "A", score: 1, color: "red" }], null);
    expect(Object.keys(o).sort()).toEqual(["id", "label", "score"]);
  });

  it.each([
    ["an empty list", []],
    ["a non-array", "High"],
    ["too many options", Array.from({ length: MAX_SCORED_OPTIONS + 1 }, (_, i) => ({ label: `o${i}`, score: i }))],
    ["a string option", ["High"]],
    ["a missing score", [{ label: "High" }]],
    ["a non-finite score", [{ label: "High", score: Infinity }]],
    ["a string score", [{ label: "High", score: "3" }]],
    ["an empty label", [{ label: "  ", score: 1 }]],
    ["labels that differ only in case", [{ label: "High", score: 3 }, { label: "high ", score: 2 }]],
  ])("rejects %s", (_name, input) => {
    expect(() => validateScoredOptions(input, null)).toThrow();
  });

  it("rejects ids on create (clients can't mint ids)", () => {
    expect(() => validateScoredOptions([{ id: "opt_00000001", label: "High", score: 3 }], null)).toThrow(
      /unknown option id/,
    );
  });

  it("rejects an id from another field and a duplicated id", () => {
    expect(() => validateScoredOptions([{ id: "opt_deadbeef", label: "X", score: 1 }], existing)).toThrow(
      /unknown option id/,
    );
    expect(() =>
      validateScoredOptions(
        [
          { id: "opt_00000001", label: "High", score: 3 },
          { id: "opt_00000001", label: "Again", score: 3 },
        ],
        existing,
      ),
    ).toThrow(/unique/);
  });
});

describe("removedOptions / validateOptionMoves", () => {
  const after: IScoredOption[] = [existing[0], existing[2]];
  const removed = removedOptions(existing, after);

  it("lists options that are no longer present", () => {
    expect(removed).toEqual([existing[1]]);
  });
  it("accepts a move from a removed option to a remaining one", () => {
    expect(validateOptionMoves({ opt_00000002: "opt_00000003" }, removed, after)).toEqual({
      opt_00000002: "opt_00000003",
    });
  });
  it("treats a missing value as no moves", () => {
    expect(validateOptionMoves(undefined, removed, after)).toEqual({});
    expect(validateOptionMoves(null, removed, after)).toEqual({});
  });
  it.each([
    ["a non-object", "opt_00000003"],
    ["a source that wasn't removed", { opt_00000001: "opt_00000003" }],
    ["a target that was removed", { opt_00000002: "opt_00000002" }],
    ["an unknown target", { opt_00000002: "opt_ffffffff" }],
  ])("rejects %s", (_name, moves) => {
    expect(() => validateOptionMoves(moves, removed, after)).toThrow();
  });
});
```

- [ ] **Step 3: Write the failing migration test**

`Servers/utils/__tests__/scoredSelectMigration.test.ts`:

```ts
import { describe, it, expect } from "@jest/globals";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const migration = require("../../database/migrations/20261010090000-add-scored-select-custom-field-type.js");

/** A fake queryInterface that records SQL; SELECTs return the given rows. */
function fakeQueryInterface(scoredCount = 0) {
  const statements: string[] = [];
  return {
    statements,
    sequelize: {
      query: async (sql: string) => {
        statements.push(sql.replace(/\s+/g, " ").trim());
        return /^SELECT/i.test(sql.trim()) ? [[{ count: scoredCount }], {}] : [[], {}];
      },
    },
  };
}

describe("add-scored-select-custom-field-type migration", () => {
  it("up re-creates the field type CHECK with scored_select", async () => {
    const qi = fakeQueryInterface();
    await migration.up(qi);
    expect(qi.statements).toHaveLength(1);
    expect(qi.statements[0]).toContain("DROP CONSTRAINT IF EXISTS cfd_field_type_allowed");
    expect(qi.statements[0]).toContain(
      "CHECK (field_type IN ('text','number','date','boolean','select','multiselect','user','scored_select'))",
    );
  });

  it("down restores the original CHECK when no scored field exists", async () => {
    const qi = fakeQueryInterface(0);
    await migration.down(qi);
    expect(qi.statements[1]).toContain(
      "CHECK (field_type IN ('text','number','date','boolean','select','multiselect','user'))",
    );
  });

  it("down refuses to drop customer data when scored fields exist", async () => {
    const qi = fakeQueryInterface(2);
    await expect(migration.down(qi)).rejects.toThrow(/2 scored select/);
    expect(qi.statements).toHaveLength(1);
  });
});
```

- [ ] **Step 4: Run both tests to confirm they fail**

Run: `cd Servers && npx jest utils/__tests__/customFieldScoredSelect.utils.test.ts utils/__tests__/scoredSelectMigration.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 5: Write the migration**

`Servers/database/migrations/20261010090000-add-scored-select-custom-field-type.js`:

```js
"use strict";

/**
 * Adds "scored_select" to the custom field type allowlist. Drops and re-adds
 * the CHECK constraint, which the original 20260520164729 migration baked the
 * allowlist into.
 */

const BASE_TYPES = ["text", "number", "date", "boolean", "select", "multiselect", "user"];

const typeList = (types) => types.map((t) => `'${t}'`).join(",");

const setAllowedTypes = (queryInterface, types) =>
  queryInterface.sequelize.query(`
    ALTER TABLE verifywise.custom_field_definitions
      DROP CONSTRAINT IF EXISTS cfd_field_type_allowed,
      ADD CONSTRAINT cfd_field_type_allowed
        CHECK (field_type IN (${typeList(types)}));
  `);

module.exports = {
  async up(queryInterface) {
    await setAllowedTypes(queryInterface, [...BASE_TYPES, "scored_select"]);
  },

  async down(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(`
      SELECT COUNT(*)::int AS count
        FROM verifywise.custom_field_definitions
       WHERE field_type = 'scored_select';
    `);
    const count = Number(rows?.[0]?.count ?? 0);
    if (count > 0) {
      throw new Error(
        `Cannot roll back: ${count} scored select custom field(s) exist. Delete them first.`,
      );
    }
    await setAllowedTypes(queryInterface, BASE_TYPES);
  },
};
```

- [ ] **Step 6: Write the helper module**

`Servers/utils/customFieldScoredSelect.utils.ts`:

```ts
import { randomBytes } from "crypto";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";

/**
 * Scored select options: a single-choice custom field whose options carry a
 * score. A record stores the option's id; its score is always read from the
 * definition, so rescoring an option rescores every record that picked it.
 */
export interface IScoredOption {
  id: string;
  label: string;
  score: number;
}

export const MAX_SCORED_OPTIONS = 50;
export const OPTION_MIN = 1;
export const OPTION_MAX = 255;

/** Error code on the 409 a definition update returns when removed options are in use. */
export const OPTIONS_IN_USE = "options_in_use";

/** Round to 2 decimals; never store -0. */
export const roundScore = (score: number): number => {
  const rounded = Math.round(score * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
};

/** 3 -> "3", 0.5 -> "0.5", 0.333 -> "0.33". */
export const formatScore = (score: number): string => String(roundScore(score));

export const formatScoredOption = (o: { label: string; score: number }): string =>
  `${o.label} (${formatScore(o.score)})`;

const newOptionId = (taken: Set<string>): string => {
  for (;;) {
    const id = `opt_${randomBytes(4).toString("hex")}`;
    if (!taken.has(id)) return id;
  }
};

/**
 * Validate scored options from a create (existing = null) or update request.
 * An option may carry an id only if `existing` has it; options without one get
 * a new id. Returns options in the given order.
 */
export const validateScoredOptions = (
  input: unknown,
  existing: IScoredOption[] | null,
): IScoredOption[] => {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_SCORED_OPTIONS) {
    throw new ValidationException(
      `scored select fields need 1..${MAX_SCORED_OPTIONS} options`,
      "options",
    );
  }

  const existingIds = new Set((existing ?? []).map((o) => o.id));
  const seenIds = new Set<string>();
  const seenLabels = new Set<string>();
  const parsed: Array<{ id?: string; label: string; score: number }> = [];

  for (const raw of input) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new ValidationException("each option needs a label and a score", "options");
    }
    const { id, label, score } = raw as Record<string, unknown>;

    if (typeof label !== "string") {
      throw new ValidationException("option label must be a string", "options");
    }
    const trimmed = label.trim();
    if (trimmed.length < OPTION_MIN || trimmed.length > OPTION_MAX) {
      throw new ValidationException(
        `option labels must be ${OPTION_MIN}..${OPTION_MAX} characters`,
        "options",
      );
    }
    const labelKey = trimmed.toLowerCase();
    if (seenLabels.has(labelKey)) {
      throw new ValidationException("option labels must be unique", "options", trimmed);
    }
    seenLabels.add(labelKey);

    if (typeof score !== "number" || !Number.isFinite(score)) {
      throw new ValidationException("option score must be a finite number", "options", trimmed);
    }

    if (id !== undefined && id !== null) {
      if (typeof id !== "string" || !existingIds.has(id)) {
        throw new ValidationException("unknown option id", "options", id);
      }
      if (seenIds.has(id)) {
        throw new ValidationException("option ids must be unique", "options", id);
      }
      seenIds.add(id);
    }

    parsed.push({
      id: typeof id === "string" ? id : undefined,
      label: trimmed,
      score: roundScore(score),
    });
  }

  const taken = new Set([...existingIds, ...seenIds]);
  return parsed.map((o) => {
    const id = o.id ?? newOptionId(taken);
    taken.add(id);
    return { id, label: o.label, score: o.score };
  });
};

/** Options in `before` that `after` no longer has. */
export const removedOptions = (before: IScoredOption[], after: IScoredOption[]): IScoredOption[] => {
  const kept = new Set(after.map((o) => o.id));
  return before.filter((o) => !kept.has(o.id));
};

/**
 * Validate `option_moves` ({ removedId: targetId }). A source must be a removed
 * option; a target must be one of the remaining options.
 */
export const validateOptionMoves = (
  moves: unknown,
  removed: IScoredOption[],
  after: IScoredOption[],
): Record<string, string> => {
  if (moves === undefined || moves === null) return {};
  if (typeof moves !== "object" || Array.isArray(moves)) {
    throw new ValidationException("option_moves must be an object", "option_moves");
  }
  const removedIds = new Set(removed.map((o) => o.id));
  const targetIds = new Set(after.map((o) => o.id));
  const result: Record<string, string> = {};
  for (const [from, to] of Object.entries(moves as Record<string, unknown>)) {
    if (!removedIds.has(from)) {
      throw new ValidationException("option_moves can only move a removed option", "option_moves", from);
    }
    if (typeof to !== "string" || !targetIds.has(to)) {
      throw new ValidationException("option_moves target must be a remaining option", "option_moves", to);
    }
    result[from] = to;
  }
  return result;
};
```

- [ ] **Step 7: Run the tests until they pass**

Run: `cd Servers && npx jest utils/__tests__/customFieldScoredSelect.utils.test.ts utils/__tests__/scoredSelectMigration.test.ts`
Expected: all PASS.

- [ ] **Step 8: Format and commit**

```bash
cd /Users/gorkemcetin/.claude-worktrees/verifywise/scored-select
npx prettier --write Servers/utils/customFieldScoredSelect.utils.ts Servers/utils/__tests__/customFieldScoredSelect.utils.test.ts Servers/utils/__tests__/scoredSelectMigration.test.ts Servers/database/migrations/20261010090000-add-scored-select-custom-field-type.js
git add Servers/utils/customFieldScoredSelect.utils.ts Servers/utils/__tests__/customFieldScoredSelect.utils.test.ts Servers/utils/__tests__/scoredSelectMigration.test.ts Servers/database/migrations/20261010090000-add-scored-select-custom-field-type.js
git commit -m "feat(custom-fields): scored select type migration and option helpers"
```

---

### Task 2: Wire the type into definitions and value writes

**Files:**
- Modify: `Servers/utils/customField.utils.ts`:
  - types at :12-46
  - `FIELD_TYPES` at :61-69
  - `OPTION_MIN` and `OPTION_MAX` at :74-75
  - `validateOptionsForType` at :115-155
  - `validateDefinitionInput` at :168-209
  - `validateValueForDefinition` at :211-301
  - `createCustomFieldDefinitionQuery` input type at :368-379
  - `setCustomFieldValueQuery` at :489-537
- Test: `Servers/utils/__tests__/customField.scoredSelect.test.ts`

**Interfaces:**
- Consumes: from Task 1, `IScoredOption`, `OPTION_MIN`, `OPTION_MAX` and `validateScoredOptions`.
- Produces:
  - `CustomFieldType` includes `"scored_select"`.
  - `ICustomFieldDefinition.options: string[] | IScoredOption[] | null`.
  - `validateOptionsForType(fieldType, options, existing?: IScoredOption[] | null)`.
  - An internal `selectDefinitionForLock(id, organizationId, transaction, lock: "SHARE" | "UPDATE"): Promise<ICustomFieldDefinition | null>`, exported for Task 4.

- [ ] **Step 1: Write the failing tests**

`Servers/utils/__tests__/customField.scoredSelect.test.ts`:

```ts
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockQuery = jest.fn(async (..._args: any[]): Promise<any> => []);
const mockTx = { id: "tx", commit: jest.fn(async () => undefined), rollback: jest.fn(async () => undefined) };
jest.mock("../../database/db", () => ({
  sequelize: {
    query: (...args: any[]) => mockQuery(...args),
    transaction: async () => mockTx,
  },
}));
const mockAppend = jest.fn(async (..._args: any[]) => undefined);
jest.mock("../auditLedger.utils", () => ({
  appendToAuditLedger: (...args: any[]) => mockAppend(...args),
}));

import {
  createCustomFieldDefinitionQuery,
  setCustomFieldValueQuery,
} from "../customField.utils";

const ORG = 7;
const flat = (sql: unknown) => String(sql).replace(/\s+/g, " ").trim();

const scoredDef = {
  id: 11,
  organization_id: ORG,
  entity_type: "project",
  field_key: "feasibility",
  label: "Technical feasibility",
  field_type: "scored_select",
  options: [
    { id: "opt_00000001", label: "High", score: 3 },
    { id: "opt_00000002", label: "Medium", score: 2 },
  ],
  required: false,
};
const selectDef = { ...scoredDef, id: 12, field_type: "select", options: ["US", "EU"] };
const multiDef = { ...scoredDef, id: 13, field_type: "multiselect", options: ["a", "b"] };

/** Route each SQL statement to a canned answer. */
function serve(def: unknown) {
  mockQuery.mockImplementation(async (sql: unknown) => {
    const s = flat(sql);
    if (s.startsWith("SELECT * FROM custom_field_definitions")) return [def];
    if (s.startsWith("SELECT 1 AS ok FROM")) return [{ ok: 1 }];
    if (s.startsWith("INSERT INTO custom_field_values")) return [{ id: 1, definition_id: 11 }];
    if (s.startsWith("INSERT INTO custom_field_definitions")) return [{ ...scoredDef, id: 99 }];
    return [];
  });
}

beforeEach(() => {
  mockQuery.mockReset();
  mockAppend.mockReset();
});

describe("creating a scored select definition", () => {
  it("stores validated options with server-assigned ids", async () => {
    serve(scoredDef);
    await createCustomFieldDefinitionQuery(
      {
        entity_type: "project",
        field_key: "feasibility",
        label: "Technical feasibility",
        field_type: "scored_select",
        options: [
          { label: "High", score: 3 },
          { label: "Low", score: 1.005 },
        ],
      },
      ORG,
      3,
    );
    const insert = mockQuery.mock.calls.find((c) => flat(c[0]).startsWith("INSERT INTO custom_field_definitions"))!;
    const stored = JSON.parse((insert[1] as any).replacements.options);
    expect(stored.map((o: any) => o.label)).toEqual(["High", "Low"]);
    stored.forEach((o: any) => expect(o.id).toMatch(/^opt_[0-9a-f]{8}$/));
    expect((insert[1] as any).replacements.field_type).toBe("scored_select");
  });

  it("rejects option objects on a plain select", async () => {
    await expect(
      createCustomFieldDefinitionQuery(
        {
          entity_type: "project",
          field_key: "region",
          label: "Region",
          field_type: "select",
          options: [{ label: "US", score: 1 }] as any,
        },
        ORG,
        3,
      ),
    ).rejects.toThrow(/option values must be strings/);
  });
});

describe("setting a value", () => {
  const write = (def: unknown, value: unknown) => {
    serve(def);
    return setCustomFieldValueQuery({ definition_id: (def as any).id, entity_id: 5, value }, ORG, mockTx as any);
  };

  it("accepts a current option id and stores it", async () => {
    await write(scoredDef, "opt_00000002");
    const insert = mockQuery.mock.calls.find((c) => flat(c[0]).startsWith("INSERT INTO custom_field_values"))!;
    expect((insert[1] as any).replacements.value).toBe(JSON.stringify("opt_00000002"));
  });

  it.each([["a label", "Medium"], ["an unknown id", "opt_ffffffff"], ["a number", 2]])(
    "rejects %s",
    async (_name, value) => {
      await expect(write(scoredDef, value)).rejects.toThrow(/allowed options/);
    },
  );

  it("reads the definition FOR SHARE inside the caller's transaction", async () => {
    await write(scoredDef, "opt_00000001");
    const read = mockQuery.mock.calls.find((c) => flat(c[0]).startsWith("SELECT * FROM custom_field_definitions"))!;
    expect(flat(read[0])).toMatch(/FOR SHARE$/);
    expect((read[1] as any).transaction).toBe(mockTx);
  });

  it("still validates select and multiselect values by label (regression)", async () => {
    await expect(write(selectDef, "EU")).resolves.toBeDefined();
    await expect(write(selectDef, "XX")).rejects.toThrow(/allowed options/);
    await expect(write(multiDef, ["a", "b"])).resolves.toBeDefined();
    await expect(write(multiDef, ["c"])).rejects.toThrow(/allowed options/);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd Servers && npx jest utils/__tests__/customField.scoredSelect.test.ts`
Expected: FAIL. `field_type` "scored_select" is rejected as "Invalid field_type", and there's no `FOR SHARE` read.

- [ ] **Step 3: Update the types and allowlist in `customField.utils.ts`**

Add this import below the existing imports:

```ts
import {
  IScoredOption,
  OPTION_MAX,
  OPTION_MIN,
  validateScoredOptions,
} from "./customFieldScoredSelect.utils";
```

Make these edits:
- `CustomFieldType` becomes `"text" | "number" | "date" | "boolean" | "select" | "multiselect" | "user" | "scored_select";`.
- In `ICustomFieldDefinition`, `options: string[] | null;` becomes `options: string[] | IScoredOption[] | null;`.
- Add `"scored_select",` to the `FIELD_TYPES` set.
- Delete the local `const OPTION_MIN = 1;` and `const OPTION_MAX = 255;` lines, since they're imported now.

Below `assertEntityType`, add a helper for select and multiselect so they keep comparing against string labels:

```ts
const stringOptionsOf = (def: ICustomFieldDefinition): string[] =>
  def.field_type === "scored_select" ? [] : ((def.options ?? []) as string[]);
```

- [ ] **Step 4: Route options validation**

Replace `validateOptionsForType` with:

```ts
const validateOptionsForType = (
  fieldType: CustomFieldType,
  options: unknown,
  existing: IScoredOption[] | null = null,
): string[] | IScoredOption[] | null => {
  if (fieldType === "scored_select") {
    return validateScoredOptions(options, existing);
  }

  const needsOptions = fieldType === "select" || fieldType === "multiselect";

  if (!needsOptions) {
    if (options !== null && options !== undefined) {
      throw new ValidationException(
        "options is only allowed for select, multiselect and scored select fields",
        "options",
      );
    }
    return null;
  }

  if (!Array.isArray(options) || options.length === 0) {
    throw new ValidationException(
      "select/multiselect fields require a non-empty options array",
      "options",
    );
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const opt of options) {
    if (typeof opt !== "string") {
      throw new ValidationException("option values must be strings", "options");
    }
    const trimmed = opt.trim();
    if (trimmed.length < OPTION_MIN || trimmed.length > OPTION_MAX) {
      throw new ValidationException(
        `option values must be ${OPTION_MIN}..${OPTION_MAX} characters`,
        "options",
      );
    }
    if (seen.has(trimmed)) {
      throw new ValidationException("option values must be unique", "options", trimmed);
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
};
```

Also make these type changes:
- In `validateDefinitionInput`, the return type's `options: string[] | null;` becomes `options: string[] | IScoredOption[] | null;`.
- In `createCustomFieldDefinitionQuery`, the input field `options?: string[] | null;` becomes `options?: unknown;`.

- [ ] **Step 5: Add value validation for the new type**

In `validateValueForDefinition`:
- In the `"select"` case, replace `def.options?.includes(raw)` with `stringOptionsOf(def).includes(raw)`.
- In the `"multiselect"` case, replace `def.options?.includes(v)` with `stringOptionsOf(def).includes(v)`.
- Add this case right after `"multiselect"`:

```ts
    case "scored_select": {
      const options = (def.options ?? []) as IScoredOption[];
      if (typeof raw !== "string" || !options.some((o) => o.id === raw)) {
        throw new ValidationException("Value must be one of the allowed options", "value", raw);
      }
      return raw;
    }
```

- [ ] **Step 6: Lock the definition in value writes**

Add this below `getCustomFieldDefinitionByIdQuery`:

```ts
/**
 * Read a definition inside a transaction with a row lock. A definition update
 * takes FOR UPDATE; a value write takes FOR SHARE. The two then serialize, so a
 * value can never be validated against options a concurrent update removes.
 */
export const selectDefinitionForLock = async (
  id: number,
  organizationId: number,
  transaction: Transaction,
  lock: "SHARE" | "UPDATE",
): Promise<ICustomFieldDefinition | null> => {
  const sql =
    lock === "UPDATE"
      ? `SELECT * FROM custom_field_definitions
           WHERE id = :id AND organization_id = :organizationId FOR UPDATE`
      : `SELECT * FROM custom_field_definitions
           WHERE id = :id AND organization_id = :organizationId FOR SHARE`;
  const rows = (await sequelize.query(sql, {
    replacements: { id, organizationId },
    type: QueryTypes.SELECT,
    transaction,
  })) as ICustomFieldDefinition[];
  return rows[0] ?? null;
};
```

In `setCustomFieldValueQuery`, replace

```ts
  const definition = await getCustomFieldDefinitionByIdQuery(definitionId, organizationId);
```

with

```ts
  // Inside the caller's transaction, lock the definition (see
  // selectDefinitionForLock). The type isn't known before the read, so every
  // value write takes the shared lock; it only blocks a concurrent definition
  // update of the same field.
  const definition = transaction
    ? await selectDefinitionForLock(definitionId, organizationId, transaction, "SHARE")
    : await getCustomFieldDefinitionByIdQuery(definitionId, organizationId);
```

- [ ] **Step 7: Run the tests and the build**

Run: `cd Servers && npx jest utils/__tests__/customField.scoredSelect.test.ts utils/__tests__/customFieldScoredSelect.utils.test.ts && npm run build`
Expected: all PASS, and the build exits 0. If `tsc` reports another reader of `options` as `string[]`, narrow it with `stringOptionsOf`.

- [ ] **Step 8: Format and commit**

```bash
npx prettier --write Servers/utils/customField.utils.ts Servers/utils/__tests__/customField.scoredSelect.test.ts
git add Servers/utils/customField.utils.ts Servers/utils/__tests__/customField.scoredSelect.test.ts
git commit -m "feat(custom-fields): validate scored select options and values; lock definitions on value writes"
```

---

### Task 3: Audit ledger entries for definition changes

**Files:**
- Create: `Servers/utils/customFieldAudit.utils.ts`
- Test: `Servers/utils/__tests__/customFieldAudit.utils.test.ts`

**Interfaces:**
- Consumes:
  - From Task 1: `IScoredOption`, `formatScore` and `formatScoredOption`.
  - From Task 2: the types `ICustomFieldDefinition` and `CustomFieldEntityType`, imported as types only from `./customField.utils`.
  - `appendToAuditLedger` from `./auditLedger.utils`.
- Produces:
  - `interface MovedAnswers { from: IScoredOption; to: IScoredOption; count: number }`
  - `interface LedgerChange { eventType: "Create" | "Update" | "Delete"; fieldName: string | null; oldValue: string | null; newValue: string | null; description: string }`
  - `diffDefinitionForLedger(before: ICustomFieldDefinition | null, after: ICustomFieldDefinition | null, extra?: { moved?: MovedAnswers[]; lostAnswers?: number }): LedgerChange[]`
  - `recordDefinitionChanges(organizationId: number, userId: number | null, definitionId: number, changes: LedgerChange[]): Promise<void>`

- [ ] **Step 1: Write the failing tests**

`Servers/utils/__tests__/customFieldAudit.utils.test.ts`:

```ts
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockAppend = jest.fn(async (..._args: any[]): Promise<void> => undefined);
jest.mock("../auditLedger.utils", () => ({
  appendToAuditLedger: (...args: any[]) => mockAppend(...args),
}));
jest.mock("../logger/logHelper", () => ({ logFailure: jest.fn(async () => undefined) }));

import { diffDefinitionForLedger, recordDefinitionChanges } from "../customFieldAudit.utils";

const base = {
  id: 11,
  organization_id: 7,
  entity_type: "project" as const,
  field_key: "feasibility",
  label: "Technical feasibility",
  field_type: "scored_select" as const,
  required: false,
  created_by: 1,
  created_at: new Date(),
  updated_at: new Date(),
  options: [
    { id: "opt_1", label: "High", score: 3 },
    { id: "opt_2", label: "Medium", score: 2 },
    { id: "opt_3", label: "Low", score: 1 },
  ],
};

beforeEach(() => mockAppend.mockReset());

describe("diffDefinitionForLedger", () => {
  it("records create and delete", () => {
    expect(diffDefinitionForLedger(null, base)).toEqual([
      expect.objectContaining({ eventType: "Create", description: "Use cases · Technical feasibility" }),
    ]);
    const [del] = diffDefinitionForLedger(base, null, { lostAnswers: 12 });
    expect(del.eventType).toBe("Delete");
    expect(del.description).toBe("Use cases · Technical feasibility · 12 records lost their answer");
  });

  it("records label and required changes", () => {
    const changes = diffDefinitionForLedger(base, { ...base, label: "Feasibility", required: true });
    expect(changes).toEqual([
      expect.objectContaining({ fieldName: "label", oldValue: "Technical feasibility", newValue: "Feasibility" }),
      expect.objectContaining({ fieldName: "required", oldValue: "false", newValue: "true" }),
    ]);
  });

  it("records one entry per scored option change and none for a reorder", () => {
    const after = {
      ...base,
      options: [
        { id: "opt_3", label: "Minimal", score: 1 },
        { id: "opt_1", label: "High", score: 4 },
        { id: "opt_9", label: "Extreme", score: 5 },
      ],
    };
    const changes = diffDefinitionForLedger(base, after, {
      moved: [{ from: base.options[1], to: after.options[0], count: 80 }],
    });
    expect(changes).toEqual([
      expect.objectContaining({ fieldName: "option label", oldValue: "Low", newValue: "Minimal" }),
      expect.objectContaining({ fieldName: "option score: High", oldValue: "3", newValue: "4" }),
      expect.objectContaining({ fieldName: "option", oldValue: null, newValue: "Extreme (5)" }),
      expect.objectContaining({
        fieldName: "option",
        oldValue: "Medium (2)",
        newValue: null,
        description: "Use cases · Technical feasibility · 80 answers moved to Minimal",
      }),
    ]);
    const reordered = { ...base, options: [...base.options].reverse() };
    expect(diffDefinitionForLedger(base, reordered)).toEqual([]);
  });

  it("records select option changes as one entry, ignoring order", () => {
    const select = { ...base, field_type: "select" as const, options: ["US", "EU"] };
    expect(diffDefinitionForLedger(select, { ...select, options: ["EU", "US"] })).toEqual([]);
    expect(diffDefinitionForLedger(select, { ...select, options: ["US", "APAC"] })).toEqual([
      expect.objectContaining({ fieldName: "options", oldValue: "US, EU", newValue: "US, APAC" }),
    ]);
  });
});

describe("recordDefinitionChanges", () => {
  it("writes one event_log entry per change", async () => {
    await recordDefinitionChanges(7, 3, 11, diffDefinitionForLedger(base, { ...base, label: "X", required: true }));
    expect(mockAppend).toHaveBeenCalledTimes(2);
    expect(mockAppend.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        organizationId: 7,
        userId: 3,
        entryType: "event_log",
        eventType: "Update",
        entityType: "custom_field_definition",
        entityId: 11,
        fieldName: "label",
      }),
    );
  });

  it("never throws when the ledger write fails", async () => {
    mockAppend.mockRejectedValue(new Error("ledger down"));
    await expect(recordDefinitionChanges(7, 3, 11, diffDefinitionForLedger(null, base))).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd Servers && npx jest utils/__tests__/customFieldAudit.utils.test.ts`
Expected: FAIL with "Cannot find module '../customFieldAudit.utils'".

- [ ] **Step 3: Write the module**

`Servers/utils/customFieldAudit.utils.ts`:

```ts
import { appendToAuditLedger } from "./auditLedger.utils";
import { logFailure } from "./logger/logHelper";
import { formatScore, formatScoredOption, IScoredOption } from "./customFieldScoredSelect.utils";
import type { CustomFieldEntityType, ICustomFieldDefinition } from "./customField.utils";

/** Answers moved from a removed scored option to another option. */
export interface MovedAnswers {
  from: IScoredOption;
  to: IScoredOption;
  count: number;
}

export interface LedgerChange {
  eventType: "Create" | "Update" | "Delete";
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  description: string;
}

const ENTITY_PLURALS: Record<CustomFieldEntityType, string> = {
  vendor: "Vendors",
  policy: "Policies",
  project: "Use cases",
  project_risk: "Project risks",
  vendor_risk: "Vendor risks",
  model_inventory: "Models",
  task: "Tasks",
  model_risk: "Model risks",
};

const describeField = (def: ICustomFieldDefinition): string =>
  `${ENTITY_PLURALS[def.entity_type]} · ${def.label}`;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The audit-ledger entries for one definition change: create (before = null),
 * delete (after = null) or update. One entry per changed property; a reorder
 * of options changes nothing a score depends on and is not recorded.
 */
export const diffDefinitionForLedger = (
  before: ICustomFieldDefinition | null,
  after: ICustomFieldDefinition | null,
  extra: { moved?: MovedAnswers[]; lostAnswers?: number } = {},
): LedgerChange[] => {
  if (!before && after) {
    return [{ eventType: "Create", fieldName: null, oldValue: null, newValue: null, description: describeField(after) }];
  }
  if (before && !after) {
    return [
      {
        eventType: "Delete",
        fieldName: null,
        oldValue: null,
        newValue: null,
        description: `${describeField(before)} · ${plural(extra.lostAnswers ?? 0, "record", "records")} lost their answer`,
      },
    ];
  }
  if (!before || !after) return [];

  const description = describeField(after);
  const changes: LedgerChange[] = [];
  const update = (fieldName: string, oldValue: string | null, newValue: string | null, desc = description) =>
    changes.push({ eventType: "Update", fieldName, oldValue, newValue, description: desc });

  if (before.label !== after.label) update("label", before.label, after.label);
  if (before.required !== after.required) update("required", String(before.required), String(after.required));

  if (after.field_type === "scored_select") {
    const prev = (before.options ?? []) as IScoredOption[];
    const next = (after.options ?? []) as IScoredOption[];
    const prevById = new Map(prev.map((o) => [o.id, o]));
    for (const option of next) {
      const old = prevById.get(option.id);
      if (!old) {
        update("option", null, formatScoredOption(option));
        continue;
      }
      if (old.label !== option.label) update("option label", old.label, option.label);
      if (old.score !== option.score) {
        update(`option score: ${option.label}`, formatScore(old.score), formatScore(option.score));
      }
    }
    const kept = new Set(next.map((o) => o.id));
    for (const option of prev) {
      if (kept.has(option.id)) continue;
      const move = extra.moved?.find((m) => m.from.id === option.id);
      update(
        "option",
        formatScoredOption(option),
        null,
        move ? `${description} · ${plural(move.count, "answer", "answers")} moved to ${move.to.label}` : description,
      );
    }
  } else {
    const prev = (before.options ?? []) as string[];
    const next = (after.options ?? []) as string[];
    if ([...prev].sort().join("\u0000") !== [...next].sort().join("\u0000")) {
      update("options", prev.join(", "), next.join(", "));
    }
  }
  return changes;
};

/** Write ledger entries after the change committed. Best-effort, like FRIA: never throws. */
export const recordDefinitionChanges = async (
  organizationId: number,
  userId: number | null,
  definitionId: number,
  changes: LedgerChange[],
): Promise<void> => {
  for (const change of changes) {
    try {
      await appendToAuditLedger({
        organizationId,
        entryType: "event_log",
        userId,
        eventType: change.eventType,
        entityType: "custom_field_definition",
        entityId: definitionId,
        fieldName: change.fieldName,
        oldValue: change.oldValue,
        newValue: change.newValue,
        description: change.description,
      });
    } catch (error) {
      try {
        await logFailure({
          eventType: change.eventType,
          description: "Failed to write a custom field change to the audit ledger",
          functionName: "recordDefinitionChanges",
          fileName: "customFieldAudit.utils.ts",
          error: error as Error,
          userId: userId ?? undefined,
          organizationId,
        });
      } catch {
        // Logging must not break the request either.
      }
    }
  }
};
```

- [ ] **Step 4: Run the tests until they pass**

Run: `cd Servers && npx jest utils/__tests__/customFieldAudit.utils.test.ts && npm run build`
Expected: PASS, and the build exits 0. If `logFailure` rejects `userId: undefined`, read its parameter type in `Servers/utils/logger/logHelper.ts` and pass what it requires (for example `userId ?? 0`).

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write Servers/utils/customFieldAudit.utils.ts Servers/utils/__tests__/customFieldAudit.utils.test.ts
git add Servers/utils/customFieldAudit.utils.ts Servers/utils/__tests__/customFieldAudit.utils.test.ts
git commit -m "feat(custom-fields): audit ledger entries for custom field definition changes"
```

---

### Task 4: Update with moves, delete with counts, usage endpoint, ledger wiring

**Files:**
- Modify: `Servers/utils/customField.utils.ts`:
  - `createCustomFieldDefinitionQuery` at :368-420
  - `updateCustomFieldDefinitionQuery` at :422-465
  - `deleteCustomFieldDefinitionQuery` at :467-485
  - a new `getCustomFieldUsageQuery`
- Modify: `Servers/controllers/customField.ctrl.ts`:
  - `respondWithError` at :27-39
  - the update and delete handlers, which now pass `req.userId`
  - a new `getCustomFieldUsage` handler
- Modify: `Servers/routes/customField.route.ts`, adding the usage route.
- Modify: `Servers/swagger.yaml` and `docs/api-docs/src/config/endpoints.ts`.
- Test: `Servers/utils/__tests__/customField.scoredSelect.test.ts` (extend it)
- Test: `Servers/controllers/__tests__/customField.ctrl.test.ts` (new)

**Interfaces:**
- Consumes:
  - Task 1: `removedOptions`, `validateOptionMoves`, `OPTIONS_IN_USE`.
  - Task 2: `selectDefinitionForLock`.
  - Task 3: `diffDefinitionForLedger`, `recordDefinitionChanges`, `MovedAnswers`.
- Produces:
  - `updateCustomFieldDefinitionQuery(id: number, organizationId: number, patch: { label?: unknown; required?: unknown; options?: unknown; option_moves?: unknown }, userId?: number | null): Promise<ICustomFieldDefinition>`
  - `deleteCustomFieldDefinitionQuery(id: number, organizationId: number, userId?: number | null): Promise<boolean>`
  - `getCustomFieldUsageQuery(id: number, organizationId: number): Promise<{ total: number; by_option: Record<string, number> } | null>`
  - `GET /api/custom-fields/definitions/by-id/:id/usage`, behind admin only, returning `STATUS_CODE[200]({ total, by_option })`.
  - A 409 response body: `{ message: "Conflict", data: { message, code: "options_in_use", in_use: [{ id, label, count }], entity_type } }`.

- [ ] **Step 1: Extend the util tests (failing)**

Append to `Servers/utils/__tests__/customField.scoredSelect.test.ts`.

First add `updateCustomFieldDefinitionQuery`, `deleteCustomFieldDefinitionQuery` and `getCustomFieldUsageQuery` to the import from `../customField.utils`. Then add:

```ts
/** Serve an update: the locked read, usage counts, the move UPDATEs, then the definition UPDATE. */
function serveUpdate(def: any, usage: Array<{ option_key: string; count: number }>, movedRows = 0) {
  mockQuery.mockImplementation(async (sql: unknown, opts: any) => {
    const s = flat(sql);
    if (s.startsWith("SELECT * FROM custom_field_definitions")) return [def];
    if (s.includes("GROUP BY")) return usage;
    if (s.startsWith("UPDATE custom_field_values")) return Array.from({ length: movedRows }, () => ({ "?column?": 1 }));
    if (s.startsWith("UPDATE custom_field_definitions")) {
      return [{ ...def, label: opts.replacements.label, required: opts.replacements.required, options: JSON.parse(opts.replacements.options) }];
    }
    if (s.startsWith("DELETE FROM custom_field_definitions")) return [{ id: def.id }];
    return [];
  });
}

const sameOptionsMinusMedium = [
  { id: "opt_00000001", label: "High", score: 3 },
];

describe("updating a scored select definition", () => {
  beforeEach(() => {
    mockTx.commit.mockClear();
    mockTx.rollback.mockClear();
  });

  it("locks the definition FOR UPDATE inside one transaction and commits", async () => {
    serveUpdate(scoredDef, []);
    await updateCustomFieldDefinitionQuery(11, ORG, { label: "Feasibility" }, 3);
    const read = mockQuery.mock.calls.find((c) => flat(c[0]).startsWith("SELECT * FROM custom_field_definitions"))!;
    expect(flat(read[0])).toMatch(/FOR UPDATE$/);
    for (const call of mockQuery.mock.calls) expect((call[1] as any).transaction).toBe(mockTx);
    expect(mockTx.commit).toHaveBeenCalledTimes(1);
  });

  it("keeps ids when options are renamed, so answers are untouched", async () => {
    serveUpdate(scoredDef, [{ option_key: "opt_00000002", count: 4 }]);
    const out = await updateCustomFieldDefinitionQuery(
      11,
      ORG,
      {
        options: [
          { id: "opt_00000001", label: "Very high", score: 3 },
          { id: "opt_00000002", label: "Medium", score: 2 },
        ],
      },
      3,
    );
    expect((out.options as any[]).map((o) => o.id)).toEqual(["opt_00000001", "opt_00000002"]);
    expect(mockQuery.mock.calls.some((c) => flat(c[0]).startsWith("UPDATE custom_field_values"))).toBe(false);
  });

  it("removes an unused option without a move", async () => {
    serveUpdate(scoredDef, [{ option_key: "opt_00000001", count: 5 }]);
    await expect(
      updateCustomFieldDefinitionQuery(11, ORG, { options: sameOptionsMinusMedium }, 3),
    ).resolves.toBeDefined();
  });

  it("refuses to remove a used option without a move: 409 with counts, nothing written", async () => {
    serveUpdate(scoredDef, [{ option_key: "opt_00000002", count: 80 }]);
    const err: any = await updateCustomFieldDefinitionQuery(11, ORG, { options: sameOptionsMinusMedium }, 3).catch(
      (e) => e,
    );
    expect(err.statusCode).toBe(409);
    expect(err.metadata).toEqual(
      expect.objectContaining({
        code: "options_in_use",
        entity_type: "project",
        in_use: [{ id: "opt_00000002", label: "Medium", count: 80 }],
      }),
    );
    expect(mockQuery.mock.calls.some((c) => flat(c[0]).startsWith("UPDATE"))).toBe(false);
    expect(mockTx.rollback).toHaveBeenCalledTimes(1);
    expect(mockAppend).not.toHaveBeenCalled();
  });

  it("moves answers then removes the option, scoped to the field and org", async () => {
    serveUpdate(scoredDef, [{ option_key: "opt_00000002", count: 80 }], 80);
    await updateCustomFieldDefinitionQuery(
      11,
      ORG,
      { options: sameOptionsMinusMedium, option_moves: { opt_00000002: "opt_00000001" } },
      3,
    );
    const move = mockQuery.mock.calls.find((c) => flat(c[0]).startsWith("UPDATE custom_field_values"))!;
    expect(flat(move[0])).toContain(
      "SET value = to_jsonb(CAST(:target AS text)), updated_at = NOW() WHERE definition_id = :id AND organization_id = :organizationId AND value = to_jsonb(CAST(:removed AS text)) RETURNING 1",
    );
    expect((move[1] as any).replacements).toEqual({ target: "opt_00000001", removed: "opt_00000002", id: 11, organizationId: ORG });
    expect(mockAppend).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Use cases · Technical feasibility · 80 answers moved to High" }),
    );
  });

  it("rejects option_moves on a field that is not scored", async () => {
    serveUpdate(selectDef, []);
    await expect(
      updateCustomFieldDefinitionQuery(12, ORG, { option_moves: { a: "b" } }, 3),
    ).rejects.toThrow(/only allowed for scored select/);
  });

  it("writes ledger entries only after commit", async () => {
    const order: string[] = [];
    mockTx.commit.mockImplementationOnce(async () => {
      order.push("commit");
    });
    mockAppend.mockImplementation(async () => {
      order.push("ledger");
    });
    serveUpdate(scoredDef, []);
    await updateCustomFieldDefinitionQuery(11, ORG, { label: "Feasibility" }, 3);
    expect(order).toEqual(["commit", "ledger"]);
  });
});

describe("usage and delete", () => {
  it("returns total and per-option counts for a scored field", async () => {
    serveUpdate(scoredDef, [
      { option_key: "opt_00000001", count: 40 },
      { option_key: "opt_00000002", count: 80 },
    ]);
    await expect(getCustomFieldUsageQuery(11, ORG)).resolves.toEqual({
      total: 120,
      by_option: { opt_00000001: 40, opt_00000002: 80 },
    });
  });

  it("returns only a total for other field types", async () => {
    serveUpdate(selectDef, [{ option_key: "EU", count: 3 }]);
    await expect(getCustomFieldUsageQuery(12, ORG)).resolves.toEqual({ total: 3, by_option: {} });
  });

  it("logs how many records lost their answer when a field is deleted", async () => {
    serveUpdate(scoredDef, [{ option_key: "opt_00000001", count: 12 }]);
    await expect(deleteCustomFieldDefinitionQuery(11, ORG, 3)).resolves.toBe(true);
    expect(mockAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "Delete",
        description: "Use cases · Technical feasibility · 12 records lost their answer",
      }),
    );
  });
});
```

- [ ] **Step 2: Write the failing controller test**

`Servers/controllers/__tests__/customField.ctrl.test.ts`:

```ts
import { describe, it, expect, jest } from "@jest/globals";
import { ConflictException } from "../../domain.layer/exceptions/custom.exception";

const mockUpdate = jest.fn(async (..._a: any[]): Promise<any> => ({}));
jest.mock("../../utils/customField.utils", () => ({
  updateCustomFieldDefinitionQuery: (...a: any[]) => mockUpdate(...a),
}));
jest.mock("../../database/db", () => ({ sequelize: {} }));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(async () => undefined),
  logFailure: jest.fn(async () => undefined),
}));
jest.mock("../../utils/i18n.utils", () => ({ translateError: (_r: unknown, e: Error) => e.message }));

import { updateCustomFieldDefinition } from "../customField.ctrl";

const res = () => {
  const r: any = {};
  r.status = jest.fn(() => r);
  r.json = jest.fn(() => r);
  return r;
};
const req = { params: { id: "11" }, body: {}, userId: 3, organizationId: 7 } as any;

describe("updateCustomFieldDefinition", () => {
  it("returns the in-use details on an options_in_use conflict", async () => {
    mockUpdate.mockRejectedValueOnce(
      new ConflictException("Some removed options are in use", "custom_field_definition", "options", {
        metadata: { code: "options_in_use", in_use: [{ id: "opt_2", label: "Medium", count: 80 }], entity_type: "project" },
      }),
    );
    const r = res();
    await updateCustomFieldDefinition(req, r);
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json).toHaveBeenCalledWith({
      message: "Conflict",
      data: {
        message: "Some removed options are in use",
        code: "options_in_use",
        in_use: [{ id: "opt_2", label: "Medium", count: 80 }],
        entity_type: "project",
      },
    });
  });

  it("keeps the plain message for other conflicts", async () => {
    mockUpdate.mockRejectedValueOnce(new ConflictException("Duplicate key"));
    const r = res();
    await updateCustomFieldDefinition(req, r);
    expect(r.json).toHaveBeenCalledWith({ message: "Conflict", data: "Duplicate key" });
  });

  it("passes the user id to the update", async () => {
    mockUpdate.mockResolvedValueOnce({ id: 11 });
    await updateCustomFieldDefinition(req, res());
    expect(mockUpdate).toHaveBeenLastCalledWith(11, 7, {}, 3);
  });
});
```

- [ ] **Step 3: Run both tests to confirm they fail**

Run: `cd Servers && npx jest utils/__tests__/customField.scoredSelect.test.ts controllers/__tests__/customField.ctrl.test.ts`
Expected: FAIL. `getCustomFieldUsageQuery` isn't exported, there's no 409 detail body, and update doesn't run in a transaction.

- [ ] **Step 4: Implement create, update, delete and usage in `customField.utils.ts`**

Add to the imports:

```ts
import {
  IScoredOption,
  OPTION_MAX,
  OPTION_MIN,
  OPTIONS_IN_USE,
  removedOptions,
  validateOptionMoves,
  validateScoredOptions,
} from "./customFieldScoredSelect.utils";
import {
  diffDefinitionForLedger,
  MovedAnswers,
  recordDefinitionChanges,
} from "./customFieldAudit.utils";
```

These replace Task 2's narrower import from `customFieldScoredSelect.utils`.

Add this below `selectDefinitionForLock`:

```ts
/** Value counts for one field, keyed by the stored value as text (an option id for scored selects). */
const countValuesByKey = async (
  id: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<Record<string, number>> => {
  const rows = (await sequelize.query(
    `SELECT value #>> '{}' AS option_key, COUNT(*)::int AS count
       FROM custom_field_values
      WHERE definition_id = :id AND organization_id = :organizationId
      GROUP BY 1`,
    { replacements: { id, organizationId }, type: QueryTypes.SELECT, transaction },
  )) as Array<{ option_key: string; count: number }>;
  return Object.fromEntries(rows.map((r) => [r.option_key, Number(r.count)]));
};

const sumCounts = (counts: Record<string, number>): number =>
  Object.values(counts).reduce((a, b) => a + b, 0);

export const getCustomFieldUsageQuery = async (
  id: number,
  organizationId: number,
): Promise<{ total: number; by_option: Record<string, number> } | null> => {
  assertPositiveInt(id, "id");
  assertPositiveInt(organizationId, "organizationId");
  const definition = await getCustomFieldDefinitionByIdQuery(id, organizationId);
  if (!definition) return null;
  const counts = await countValuesByKey(id, organizationId);
  return {
    total: sumCounts(counts),
    by_option: definition.field_type === "scored_select" ? counts : {},
  };
};
```

In `createCustomFieldDefinitionQuery`, record the change after the INSERT succeeds. Replace `return rows[0];` inside the `try` with:

```ts
    const created = rows[0];
    await recordDefinitionChanges(organizationId, userId, created.id, diffDefinitionForLedger(null, created));
    return created;
```

Replace `updateCustomFieldDefinitionQuery` with:

```ts
export const updateCustomFieldDefinitionQuery = async (
  id: number,
  organizationId: number,
  patch: { label?: unknown; required?: unknown; options?: unknown; option_moves?: unknown },
  userId: number | null = null,
): Promise<ICustomFieldDefinition> => {
  assertPositiveInt(id, "id");
  assertPositiveInt(organizationId, "organizationId");

  const transaction = await sequelize.transaction();
  // Assigned inside the try; the catch always rethrows.
  let before!: ICustomFieldDefinition;
  let after!: ICustomFieldDefinition;
  const moved: MovedAnswers[] = [];
  try {
    // field_type, field_key, entity_type are immutable on update — changing them
    // would invalidate existing values. Force a create + delete instead.
    const existing = await selectDefinitionForLock(id, organizationId, transaction, "UPDATE");
    if (!existing) {
      throw new NotFoundException("Custom field definition not found", "custom_field_definition", id);
    }
    before = existing;
    const isScored = existing.field_type === "scored_select";
    const hasMoves = patch.option_moves !== undefined && patch.option_moves !== null;
    if (!isScored && hasMoves) {
      throw new ValidationException(
        "option_moves is only allowed for scored select fields",
        "option_moves",
      );
    }

    const label = patch.label !== undefined ? validateLabel(patch.label) : existing.label;
    const required = patch.required !== undefined ? Boolean(patch.required) : existing.required;
    const options =
      patch.options !== undefined
        ? validateOptionsForType(
            existing.field_type,
            patch.options,
            isScored ? ((existing.options ?? []) as IScoredOption[]) : null,
          )
        : existing.options;

    if (isScored) {
      const prev = (existing.options ?? []) as IScoredOption[];
      const next = (options ?? []) as IScoredOption[];
      const removed = removedOptions(prev, next);
      const moves = validateOptionMoves(patch.option_moves, removed, next);
      if (removed.length > 0) {
        const counts = await countValuesByKey(id, organizationId, transaction);
        const inUse = removed
          .filter((o) => (counts[o.id] ?? 0) > 0 && !moves[o.id])
          .map((o) => ({ id: o.id, label: o.label, count: counts[o.id] }));
        if (inUse.length > 0) {
          throw new ConflictException(
            "Some removed options are in use. Choose where to move their answers.",
            "custom_field_definition",
            "options",
            { metadata: { code: OPTIONS_IN_USE, in_use: inUse, entity_type: existing.entity_type } },
          );
        }
        for (const option of removed) {
          const target = moves[option.id];
          if (!target) continue;
          const rows = await sequelize.query(
            `UPDATE custom_field_values
                SET value = to_jsonb(CAST(:target AS text)), updated_at = NOW()
              WHERE definition_id = :id AND organization_id = :organizationId
                AND value = to_jsonb(CAST(:removed AS text))
              RETURNING 1`,
            {
              replacements: { target, removed: option.id, id, organizationId },
              type: QueryTypes.SELECT,
              transaction,
            },
          );
          moved.push({ from: option, to: next.find((o) => o.id === target)!, count: rows.length });
        }
      }
    }

    const rows = (await sequelize.query(
      `UPDATE custom_field_definitions
          SET label = :label,
              required = :required,
              options = CAST(:options AS JSONB),
              updated_at = NOW()
        WHERE id = :id AND organization_id = :organizationId
        RETURNING *`,
      {
        replacements: {
          id,
          organizationId,
          label,
          required,
          options: options ? JSON.stringify(options) : null,
        },
        type: QueryTypes.SELECT,
        transaction,
      },
    )) as ICustomFieldDefinition[];
    after = rows[0];
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  await recordDefinitionChanges(organizationId, userId, id, diffDefinitionForLedger(before, after, { moved }));
  return after;
};
```

Replace `deleteCustomFieldDefinitionQuery` with:

```ts
export const deleteCustomFieldDefinitionQuery = async (
  id: number,
  organizationId: number,
  userId: number | null = null,
): Promise<boolean> => {
  assertPositiveInt(id, "id");
  assertPositiveInt(organizationId, "organizationId");

  const transaction = await sequelize.transaction();
  // Assigned inside the try; the catch always rethrows.
  let deleted!: ICustomFieldDefinition;
  let lostAnswers!: number;
  try {
    const existing = await selectDefinitionForLock(id, organizationId, transaction, "UPDATE");
    if (!existing) {
      await transaction.rollback();
      return false;
    }
    lostAnswers = sumCounts(await countValuesByKey(id, organizationId, transaction));
    // Cascade on FK removes all values for this definition.
    await sequelize.query(
      `DELETE FROM custom_field_definitions
         WHERE id = :id AND organization_id = :organizationId
         RETURNING id`,
      { replacements: { id, organizationId }, type: QueryTypes.SELECT, transaction },
    );
    deleted = existing;
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  await recordDefinitionChanges(organizationId, userId, id, diffDefinitionForLedger(deleted, null, { lostAnswers }));
  return true;
};
```

- [ ] **Step 5: Controller and route**

In `Servers/controllers/customField.ctrl.ts`:
- Import `ConflictException` from `"../domain.layer/exceptions/custom.exception"`.
- Import `getCustomFieldUsageQuery` and `OPTIONS_IN_USE`. The second comes from `"../utils/customFieldScoredSelect.utils"`.
- Replace `respondWithError` with:

```ts
// Map our CustomException subclasses to HTTP status, mirroring the
// aiDetectionRepository pattern. Falls back to 500 for unknown errors.
const respondWithError = (req: Request, res: Response, error: unknown): Response => {
  // A definition update that removes options still in use returns the counts,
  // so the client can ask where to move those answers.
  if (error instanceof ConflictException && error.metadata?.code === OPTIONS_IN_USE) {
    return res.status(409).json(
      STATUS_CODE[409]({
        message: error.message,
        code: OPTIONS_IN_USE,
        in_use: error.metadata.in_use,
        entity_type: error.metadata.entity_type,
      }),
    );
  }
  const statusCode =
    error instanceof Error && "statusCode" in error
      ? (error as Error & { statusCode: number }).statusCode
      : 500;
  const statusFn = (STATUS_CODE as any)[statusCode];
  if (typeof statusFn === "function") {
    return res.status(statusCode).json(statusFn((error as Error).message));
  }
  return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
};
```

Make these changes to the existing handlers:
- In `updateCustomFieldDefinition`, call `updateCustomFieldDefinitionQuery(id, req.organizationId!, req.body ?? {}, req.userId!)`.
- In `deleteCustomFieldDefinition`, call `deleteCustomFieldDefinitionQuery(id, req.organizationId!, req.userId!)`.

Add this handler after `getCustomFieldDefinitionById`:

```ts
export async function getCustomFieldUsage(req: Request, res: Response): Promise<any> {
  const id = parseIntParam(req.params.id);
  try {
    const usage = await getCustomFieldUsageQuery(id, req.organizationId!);
    if (!usage) {
      return res.status(404).json(STATUS_CODE[404]({}));
    }
    return res.status(200).json(STATUS_CODE[200](usage));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to read usage for custom field definition ${id}`,
      functionName: "getCustomFieldUsage",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}
```

`FILE_NAME` is defined at :20. If `logFailure`'s `eventType` union doesn't include `"Read"`, use the value the other read handlers in this file pass.

In `Servers/routes/customField.route.ts`, import `getCustomFieldUsage` and add this after the `/definitions/by-id/:id` route:

```ts
router.get(
  "/definitions/by-id/:id/usage",
  authenticateJWT,
  authorize("customField.admin"),
  getCustomFieldUsage,
);
```

- [ ] **Step 6: API docs**

**`Servers/swagger.yaml`.** Find the custom fields section by searching for `custom-fields/definitions`, then:
- Add `scored_select` to the `field_type` enum.
- Document `options` for `scored_select` as an array of `{ id: string, label: string, score: number }`. `id` is omitted for new options.
- Add the optional `option_moves` object on the PATCH body.
- Add the 409 response with the `options_in_use` body.
- Add `GET /custom-fields/definitions/by-id/{id}/usage` with the response `{ total: integer, by_option: object }`.

Copy the indentation and `$ref` style of the neighbouring custom-field entries.

**`docs/api-docs/src/config/endpoints.ts`.** Find the custom fields entries and make the same additions, following that file's existing entry shape.

- [ ] **Step 7: Run tests, build and the full server suite**

Run: `cd Servers && npx jest utils/__tests__/customField.scoredSelect.test.ts controllers/__tests__/customField.ctrl.test.ts && npm run build && npm run test`
Expected: the new tests PASS, the build exits 0, and the full unit suite passes. Compare any failure against `develop`; a pre-existing failure isn't caused by this task, but name it in the report.

- [ ] **Step 8: Format and commit**

```bash
npx prettier --write Servers/utils/customField.utils.ts Servers/controllers/customField.ctrl.ts Servers/routes/customField.route.ts Servers/utils/__tests__/customField.scoredSelect.test.ts Servers/controllers/__tests__/customField.ctrl.test.ts
cd Servers && npm run format-check && cd ..
git add Servers/utils/customField.utils.ts Servers/controllers/customField.ctrl.ts Servers/routes/customField.route.ts Servers/utils/__tests__/customField.scoredSelect.test.ts Servers/controllers/__tests__/customField.ctrl.test.ts Servers/swagger.yaml docs/api-docs/src/config/endpoints.ts
git commit -m "feat(custom-fields): move answers when removing used options, usage counts, ledger on update and delete"
```

---

### Task 5: Client types, display and value input

**Files:**
- Modify: `Clients/src/domain/interfaces/i.customField.ts`
- Modify: `Clients/src/presentation/components/CustomFieldsSection/formatCustomFieldValue.ts`
- Modify: `Clients/src/presentation/components/CustomFieldsSection/index.tsx`:
  - `renderInput` at :384-403
  - `SelectInput` at :460-475
  - `MultiSelectInput` at :477-492
- Modify: `Clients/src/i18n/translations.ts`
- Test: `Clients/src/presentation/components/CustomFieldsSection/__tests__/formatCustomFieldValue.test.ts` (new)
- Test: `Clients/src/presentation/components/CustomFieldsSection/__tests__/CustomFieldsSection.test.tsx` (extend)

**Interfaces:**
- Produces (from `i.customField.ts`):
  - `CustomFieldType` includes `"scored_select"`.
  - `interface IScoredOption { id: string; label: string; score: number }`
  - `interface IScoredOptionInput { id?: string; label: string; score: number }`
  - `ICustomFieldDefinition.options: string[] | IScoredOption[] | null`
  - Create and update inputs take `options?: string[] | IScoredOptionInput[] | null`, and `IUpdateCustomFieldDefinitionInput` gets `option_moves?: Record<string, string>`.
  - Helpers:
    - `stringOptions(def: { field_type: string; options?: unknown }): string[]`
    - `scoredOptions(def: { field_type: string; options?: unknown }): IScoredOption[]`
    - `formatScore(score: number): string`
    - `formatScoredOption(o: { label: string; score: number }): string`
    - `entityCountNoun(entity: CustomFieldEntityType, count: number): string`
  - `CUSTOM_FIELD_TYPE_LABELS.scored_select = "Scored select"`

- [ ] **Step 1: Write the failing formatter test**

`Clients/src/presentation/components/CustomFieldsSection/__tests__/formatCustomFieldValue.test.ts`:

```ts
import { formatCustomFieldValue } from "../formatCustomFieldValue";
import {
  entityCountNoun,
  formatScore,
  scoredOptions,
  stringOptions,
} from "../../../../domain/interfaces/i.customField";

const scored = {
  field_type: "scored_select",
  options: [
    { id: "opt_1", label: "High", score: 3 },
    { id: "opt_2", label: "Half", score: 0.5 },
  ],
};

describe("scored select display", () => {
  it("shows the label with its score", () => {
    expect(formatCustomFieldValue(scored, "opt_1")).toBe("High (3)");
    expect(formatCustomFieldValue(scored, "opt_2")).toBe("Half (0.5)");
  });
  it("shows a dash for an id that matches no option, and for no value", () => {
    expect(formatCustomFieldValue(scored, "opt_gone")).toBe("—");
    expect(formatCustomFieldValue(scored, null)).toBe("—");
  });
  it("formats scores without trailing zeros and never -0", () => {
    expect(formatScore(3)).toBe("3");
    expect(formatScore(0.333)).toBe("0.33");
    expect(formatScore(-0)).toBe("0");
  });
  it("keeps select formatting unchanged", () => {
    expect(formatCustomFieldValue({ field_type: "select", options: ["US"] }, "US")).toBe("US");
  });
});

describe("option helpers", () => {
  it("separates string and scored options by field type", () => {
    expect(stringOptions({ field_type: "select", options: ["US"] })).toEqual(["US"]);
    expect(stringOptions(scored)).toEqual([]);
    expect(scoredOptions(scored)).toHaveLength(2);
    expect(scoredOptions({ field_type: "select", options: ["US"] })).toEqual([]);
  });
  it("names records in the singular or plural", () => {
    expect(entityCountNoun("project", 1)).toBe("use case");
    expect(entityCountNoun("project", 80)).toBe("use cases");
    expect(entityCountNoun("model_inventory", 2)).toBe("models");
  });
});
```

- [ ] **Step 2: Add a failing section test**

Append to `CustomFieldsSection.test.tsx`, inside the top-level `describe`, using the file's existing mocks:

```tsx
  describe("scored select", () => {
    const scoredDef = {
      id: 8,
      label: "Feasibility",
      field_type: "scored_select",
      required: false,
      options: [
        { id: "opt_h", label: "High", score: 3 },
        { id: "opt_m", label: "Medium", score: 2 },
      ],
    };

    it("lists options with their scores and stages the option id", async () => {
      mockDefsData = [scoredDef];
      mockValuesData = [];
      const ref = createRef<CustomFieldsSectionHandle>();
      renderWithProviders(<CustomFieldsSection ref={ref} entityType="project" entityId={1} />);

      const hidden = document.getElementById("cf-8")!;
      const combobox = hidden.closest(".MuiInputBase-root")!.querySelector('[role="combobox"]') as HTMLElement;
      await userEvent.click(combobox);
      expect(screen.getByRole("option", { name: "High (3)" })).toBeInTheDocument();
      await userEvent.click(screen.getByRole("option", { name: "Medium (2)" }));

      await ref.current!.flush(42);
      expect(mockSetCustomFieldValue).toHaveBeenCalledWith(
        expect.objectContaining({ definition_id: 8, entity_id: 42, value: "opt_m" }),
      );
    });
  });
```

If the file resets `mockDefsData` in a `beforeEach`, this test's assignments run after it, so no extra reset is needed. If opening the `Select` with `userEvent.click` doesn't open the menu, use `fireEvent.mouseDown(combobox)`, the pattern in `SettingsPage/CustomFields/__tests__/CustomFields.test.tsx`.

- [ ] **Step 3: Run both tests to confirm they fail**

Run: `cd Clients && npx vitest run src/presentation/components/CustomFieldsSection`
Expected: FAIL. The helpers aren't exported, and there's no scored select input.

- [ ] **Step 4: Implement the types and helpers**

In `Clients/src/domain/interfaces/i.customField.ts`:
- `CustomFieldType` becomes `"text" | "number" | "date" | "boolean" | "select" | "multiselect" | "user" | "scored_select";`.
- Add the two interfaces:

```ts
/** A scored select option: the stored value is `id`; `score` is read from the definition. */
export interface IScoredOption {
  id: string;
  label: string;
  score: number;
}

/** An option as the client sends it: new options have no id yet. */
export interface IScoredOptionInput {
  id?: string;
  label: string;
  score: number;
}
```

- Make these field changes:
  - In `ICustomFieldDefinition`, `options` becomes `string[] | IScoredOption[] | null`.
  - In `ICreateCustomFieldDefinitionInput` and `IUpdateCustomFieldDefinitionInput`, `options?` becomes `string[] | IScoredOptionInput[] | null`.
  - `IUpdateCustomFieldDefinitionInput` gains `option_moves?: Record<string, string>;`.
  - Add `scored_select: "Scored select",` to `CUSTOM_FIELD_TYPE_LABELS`.
- Append:

```ts
type OptionsLike = { field_type: string; options?: unknown };

/** Options of a select or multiselect field (labels). */
export const stringOptions = (def: OptionsLike): string[] =>
  def.field_type !== "scored_select" && Array.isArray(def.options) ? (def.options as string[]) : [];

/** Options of a scored select field. */
export const scoredOptions = (def: OptionsLike): IScoredOption[] =>
  def.field_type === "scored_select" && Array.isArray(def.options)
    ? (def.options as IScoredOption[])
    : [];

/** 3 -> "3", 0.5 -> "0.5", 0.333 -> "0.33"; never "-0". */
export const formatScore = (score: number): string => {
  const rounded = Number(score.toFixed(2));
  return String(Object.is(rounded, -0) ? 0 : rounded);
};

export const formatScoredOption = (o: { label: string; score: number }): string =>
  `${o.label} (${formatScore(o.score)})`;

const ENTITY_COUNT_NOUNS: Record<CustomFieldEntityType, [string, string]> = {
  vendor: ["vendor", "vendors"],
  policy: ["policy", "policies"],
  project: ["use case", "use cases"],
  project_risk: ["project risk", "project risks"],
  vendor_risk: ["vendor risk", "vendor risks"],
  model_inventory: ["model", "models"],
  task: ["task", "tasks"],
  model_risk: ["model risk", "model risks"],
};

/** "use case" for 1, "use cases" otherwise. */
export const entityCountNoun = (entity: CustomFieldEntityType, count: number): string =>
  ENTITY_COUNT_NOUNS[entity][count === 1 ? 0 : 1];
```

- [ ] **Step 5: Formatter and section input**

In `formatCustomFieldValue.ts`:
- Import `scoredOptions` and `formatScoredOption` from `"../../../domain/interfaces/i.customField"`.
- Add `options?: unknown;` to `CustomFieldDefLike`.
- Insert this before the final `return String(raw);`:

```ts
  if (def.field_type === "scored_select") {
    const option = scoredOptions(def).find((o) => o.id === raw);
    return option ? formatScoredOption(option) : "—";
  }
```

In `CustomFieldsSection/index.tsx`:
- Import `scoredOptions`, `stringOptions` and `formatScoredOption` from the same interfaces module.
- In `SelectInput`, replace `(definition.options ?? [])` with `stringOptions(definition)`.
- In `MultiSelectInput`, replace `definition.options ?? []` with `stringOptions(definition)`.
- In `renderInput`, add `case "scored_select": return <ScoredSelectInput {...props} />;` after `"select"`.
- Add this after `SelectInput`:

```tsx
const ScoredSelectInput: React.FC<InputProps> = ({ definition, draft, setDraft, disabled }) => {
  const items = scoredOptions(definition).map((opt) => ({
    _id: opt.id,
    name: formatScoredOption(opt),
  }));
  return (
    <Select
      id={`cf-${definition.id}`}
      value={typeof draft === "string" ? draft : ""}
      items={items}
      onChange={(e) => setDraft((e.target.value as string) || null)}
      disabled={disabled}
      placeholder="Select an option"
    />
  );
};
```

`normalize`, `valuesEqual` and `isEmpty` already treat any non-multiselect, non-boolean type like select, so they need no change.

- [ ] **Step 6: Translations**

Add `"Scored select"` to the de, fr and es dictionaries in `Clients/src/i18n/translations.ts`:
- de: `"Bewertete Auswahl"`
- fr: `"Sélection notée"`
- es: `"Selección con puntuación"`

Put each next to that language's `"Single select"` entry. Find the three with `grep -n '"Single select"' Clients/src/i18n/translations.ts`.

- [ ] **Step 7: Run the tests and gates**

Run: `cd Clients && npx vitest run src/presentation/components/CustomFieldsSection && npm run typecheck && npm run i18n:audit:strict`
Expected: PASS, typecheck exits 0, and 0 i18n gaps. If typecheck flags another reader of `definition.options` as `string[]` (for example `Settings/CustomFields/index.tsx:201` or `:354`), narrow it with `stringOptions(...)`. Task 6 rewrites the Settings ones properly; a minimal narrowing now is fine.

- [ ] **Step 8: Format and commit**

```bash
cd Clients && npx prettier --write src/domain/interfaces/i.customField.ts src/presentation/components/CustomFieldsSection/formatCustomFieldValue.ts src/presentation/components/CustomFieldsSection/index.tsx src/presentation/components/CustomFieldsSection/__tests__/formatCustomFieldValue.test.ts src/presentation/components/CustomFieldsSection/__tests__/CustomFieldsSection.test.tsx src/i18n/translations.ts && cd ..
git add -A Clients/src/domain/interfaces/i.customField.ts Clients/src/presentation/components/CustomFieldsSection Clients/src/i18n/translations.ts Clients/src/presentation/pages/SettingsPage/CustomFields/index.tsx
git commit -m "feat(custom-fields): scored select display and input on records"
```

---

### Task 6: Settings — scored options editor, move dialog, usage counts

**Files:**
- Create: `Clients/src/presentation/pages/SettingsPage/CustomFields/ScoredOptionsEditor.tsx`
- Create: `Clients/src/presentation/pages/SettingsPage/CustomFields/MoveOptionAnswersModal.tsx`
- Modify: `Clients/src/presentation/pages/SettingsPage/CustomFields/index.tsx`
- Modify: `Clients/src/application/repository/customField.repository.ts`, adding `getCustomFieldUsage`.
- Modify: `Clients/src/application/hooks/useCustomFields.ts`, adding a `usage` query key and the `useCustomFieldUsage` hook.
- Modify: `Clients/src/i18n/translations.ts`
- Test: `Clients/src/presentation/pages/SettingsPage/CustomFields/__tests__/CustomFields.test.tsx` (extend, and add `useCustomFieldUsage` to its hooks mock)

**Interfaces:**
- Consumes: from Task 5, `scoredOptions`, `stringOptions`, `formatScoredOption`, `entityCountNoun`, `IScoredOption` and `IScoredOptionInput`. From Task 4, the usage endpoint and the 409 body.
- Produces:
  - `getCustomFieldUsage(id: number): Promise<{ total: number; by_option: Record<string, number> }>`
  - `useCustomFieldUsage(definitionId: number | null)`: a React Query result, disabled when `null`.
  - `ScoredOptionRow = { key: string; id?: string; label: string; score: string }`
  - `rowsFromOptions(options: IScoredOption[]): ScoredOptionRow[]`
  - `newScoredRow(): ScoredOptionRow`
  - `<ScoredOptionsEditor rows onChange usage? />`
  - `<MoveOptionAnswersModal inUse entityType remaining isSubmitting onCancel onConfirm(moves) />`

- [ ] **Step 1: Repository and hook**

Append to `customField.repository.ts`:

```ts
export async function getCustomFieldUsage(
  id: number,
): Promise<{ total: number; by_option: Record<string, number> }> {
  const response = await apiServices.get<Envelope<{ total: number; by_option: Record<string, number> }>>(
    `/custom-fields/definitions/by-id/${id}/usage`,
  );
  return response.data?.data ?? { total: 0, by_option: {} };
}
```

In `useCustomFields.ts`:
- Add `usage: (id: number | null) => ["customFields", "usage", id] as const,` to `customFieldsKeys`, matching how its other keys are written.
- Import `getCustomFieldUsage`.
- Add the hook:

```ts
/** How many records have a value for a field, and per scored option. Admin only. */
export function useCustomFieldUsage(definitionId: number | null) {
  return useQuery({
    queryKey: customFieldsKeys.usage(definitionId),
    queryFn: () => getCustomFieldUsage(definitionId as number),
    enabled: definitionId !== null,
  });
}
```

In `useUpdateCustomFieldDefinition` and `useDeleteCustomFieldDefinition`'s `onSuccess`, also invalidate the field's values and usage. Moving answers changes record values:

```ts
qc.invalidateQueries({ queryKey: ["customFields", "values"] });
qc.invalidateQueries({ queryKey: ["customFields", "usage"] });
```

- [ ] **Step 2: Write the failing Settings tests**

In `CustomFields.test.tsx`:
- Add `let mockUsage: { total: number; by_option: Record<string, number> } | undefined;` next to the other mocks.
- Add `useCustomFieldUsage: () => ({ data: mockUsage }),` to the `vi.mock("../../../../../application/hooks/useCustomFields", …)` factory.
- Reset it in `beforeEach` with `mockUsage = undefined;`.
- Append these tests inside the `describe`:

```tsx
  describe("scored select", () => {
    const scoredDef = buildDefinition({
      id: 5,
      entity_type: "project",
      label: "Feasibility",
      field_key: "feasibility",
      field_type: "scored_select",
      options: [
        { id: "opt_h", label: "High", score: 3 },
        { id: "opt_m", label: "Medium", score: 2 },
        { id: "opt_l", label: "Low", score: 1 },
      ],
    });

    it("shows scored options as label (score) chips", () => {
      mockQueryState = { data: [scoredDef], isLoading: false, isError: false };
      renderWithProviders(<CustomFieldsTab />);
      expect(screen.getByText("High (3)")).toBeInTheDocument();
      expect(screen.getByText("Low (1)")).toBeInTheDocument();
    });

    it("creates a scored select with rows of label and score", async () => {
      renderWithProviders(<CustomFieldsTab />);
      await userEvent.click(screen.getByRole("button", { name: /add field/i }));
      await userEvent.type(document.getElementById("cf-label")!, "Feasibility");
      await userEvent.type(document.getElementById("cf-field-key")!, "feasibility");
      openCustomSelect("cf-field-type");
      await userEvent.click(screen.getByRole("option", { name: "Scored select" }));

      const labels = () => screen.getAllByPlaceholderText("Option label");
      const scores = () => screen.getAllByPlaceholderText("Score");
      await userEvent.type(labels()[0], "High");
      await userEvent.type(scores()[0], "3");
      await userEvent.click(screen.getByRole("button", { name: /add option/i }));
      await userEvent.type(labels()[1], "Low");
      await userEvent.type(scores()[1], "0.333");
      await userEvent.tab();
      expect(scores()[1]).toHaveValue(0.33);

      await userEvent.click(screen.getByRole("button", { name: /^create$/i }));
      expect(mockCreateMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          field_type: "scored_select",
          options: [
            { label: "High", score: 3 },
            { label: "Low", score: 0.33 },
          ],
        }),
        expect.anything(),
      );
    });

    it("blocks saving an option without a score", async () => {
      renderWithProviders(<CustomFieldsTab />);
      await userEvent.click(screen.getByRole("button", { name: /add field/i }));
      await userEvent.type(document.getElementById("cf-label")!, "Feasibility");
      await userEvent.type(document.getElementById("cf-field-key")!, "feasibility");
      openCustomSelect("cf-field-type");
      await userEvent.click(screen.getByRole("option", { name: "Scored select" }));
      await userEvent.type(screen.getAllByPlaceholderText("Option label")[0], "High");
      await userEvent.click(screen.getByRole("button", { name: /^create$/i }));
      expect(screen.getByText("Every option needs a label and a score.")).toBeInTheDocument();
      expect(mockCreateMutate).not.toHaveBeenCalled();
    });

    it("reorders options with the up and down buttons and keeps ids on save", async () => {
      mockQueryState = { data: [scoredDef], isLoading: false, isError: false };
      renderWithProviders(<CustomFieldsTab />);
      await userEvent.click(screen.getByTitle("Edit field"));
      await userEvent.click(screen.getAllByRole("button", { name: "Move option down" })[0]);
      await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
      expect(mockUpdateMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 5,
          body: expect.objectContaining({
            options: [
              { id: "opt_m", label: "Medium", score: 2 },
              { id: "opt_h", label: "High", score: 3 },
              { id: "opt_l", label: "Low", score: 1 },
            ],
          }),
        }),
        expect.anything(),
      );
    });

    it("shows how many records use each option", async () => {
      mockQueryState = { data: [scoredDef], isLoading: false, isError: false };
      mockUsage = { total: 80, by_option: { opt_m: 80 } };
      renderWithProviders(<CustomFieldsTab />);
      await userEvent.click(screen.getByTitle("Edit field"));
      expect(screen.getByText("Used by 80")).toBeInTheDocument();
    });

    it("asks where to move answers when a used option is removed, then resends with option_moves", async () => {
      mockQueryState = { data: [scoredDef], isLoading: false, isError: false };
      mockUpdateMutate.mockImplementationOnce((_vars: any, opts: any) =>
        opts.onError({
          status: 409,
          message: "Some removed options are in use. Choose where to move their answers.",
          response: {
            message: "Conflict",
            data: {
              code: "options_in_use",
              in_use: [{ id: "opt_m", label: "Medium", count: 80 }],
              entity_type: "project",
            },
          },
        }),
      );
      renderWithProviders(<CustomFieldsTab />);
      await userEvent.click(screen.getByTitle("Edit field"));
      await userEvent.click(screen.getAllByRole("button", { name: "Remove option" })[1]);
      await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

      expect(await screen.findByText("80 use cases use Medium. Move them to:")).toBeInTheDocument();
      openCustomSelect("move-opt_m");
      await userEvent.click(screen.getByRole("option", { name: "Low (1)" }));
      await userEvent.click(screen.getByRole("button", { name: /move and save/i }));

      expect(mockUpdateMutate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          id: 5,
          body: expect.objectContaining({ option_moves: { opt_m: "opt_l" } }),
        }),
        expect.anything(),
      );
    });

    it("shows how many records lose their value when a field is deleted", async () => {
      mockQueryState = { data: [scoredDef], isLoading: false, isError: false };
      mockUsage = { total: 12, by_option: {} };
      renderWithProviders(<CustomFieldsTab />);
      await userEvent.click(screen.getByTitle("Delete field"));
      expect(screen.getByText("12 use cases have a value for this field.")).toBeInTheDocument();
    });
  });
```

Run: `cd Clients && npx vitest run src/presentation/pages/SettingsPage/CustomFields`
Expected: the new tests FAIL; the existing ones still pass with the extended mock.

- [ ] **Step 3: The options editor**

`Clients/src/presentation/pages/SettingsPage/CustomFields/ScoredOptionsEditor.tsx`:

```tsx
import React from "react";
import { IconButton, Stack, Typography } from "@mui/material";
import { ChevronDown, ChevronUp, Plus as PlusIcon, Trash2 } from "lucide-react";
import Field from "../../../components/Inputs/Field";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import { fill } from "../../../../i18n/fill";
import type { IScoredOption } from "../../../../domain/interfaces/i.customField";

/** One editable option row. `id` is set for options the server already has. */
export interface ScoredOptionRow {
  key: string;
  id?: string;
  label: string;
  score: string;
}

let nextRowKey = 0;
export const newScoredRow = (): ScoredOptionRow => ({
  key: `new-${++nextRowKey}`,
  label: "",
  score: "",
});

export const rowsFromOptions = (options: IScoredOption[]): ScoredOptionRow[] =>
  options.map((o) => ({ key: o.id, id: o.id, label: o.label, score: String(o.score) }));

/** Show what the server will store: rounded to 2 decimals. */
const roundScoreText = (text: string): string => {
  const n = Number(text);
  return text.trim() !== "" && Number.isFinite(n) ? String(Number(n.toFixed(2))) : text;
};

interface ScoredOptionsEditorProps {
  rows: ScoredOptionRow[];
  onChange: (rows: ScoredOptionRow[]) => void;
  /** Records using each option id, from the usage endpoint. */
  usage?: Record<string, number>;
}

const ScoredOptionsEditor: React.FC<ScoredOptionsEditorProps> = ({ rows, onChange, usage }) => {
  const { t } = useTranslation();
  const update = (index: number, patch: Partial<ScoredOptionRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const move = (index: number, delta: -1 | 1) => {
    const next = [...rows];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    onChange(next);
  };

  return (
    <Stack sx={{ gap: "8px" }}>
      <Typography sx={{ fontSize: "13px", fontWeight: 500, color: "text.secondary" }}>
        Options
      </Typography>
      {rows.map((row, index) => {
        const used = row.id ? (usage?.[row.id] ?? 0) : 0;
        return (
          <Stack key={row.key} direction="row" alignItems="center" sx={{ gap: "8px" }}>
            <Field
              id={`cf-option-label-${index}`}
              value={row.label}
              placeholder="Option label"
              onChange={(e) => update(index, { label: e.target.value })}
              sx={{ flex: 2 }}
            />
            <Field
              id={`cf-option-score-${index}`}
              type="number"
              value={row.score}
              placeholder="Score"
              onChange={(e) => update(index, { score: e.target.value })}
              onBlur={() => update(index, { score: roundScoreText(row.score) })}
              sx={{ flex: 1 }}
            />
            <IconButton
              size="small"
              disableRipple
              aria-label="Move option up"
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              <ChevronUp size={16} />
            </IconButton>
            <IconButton
              size="small"
              disableRipple
              aria-label="Move option down"
              disabled={index === rows.length - 1}
              onClick={() => move(index, 1)}
            >
              <ChevronDown size={16} />
            </IconButton>
            <IconButton
              size="small"
              disableRipple
              aria-label="Remove option"
              disabled={rows.length === 1}
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            >
              <Trash2 size={16} />
            </IconButton>
            {used > 0 && (
              <Typography sx={{ fontSize: "12px", color: "text.tertiary", whiteSpace: "nowrap" }}>
                {fill(t("Used by {count}"), { count: used })}
              </Typography>
            )}
          </Stack>
        );
      })}
      <CustomizableButton
        variant="outlined"
        text="Add option"
        icon={<PlusIcon size={14} />}
        onClick={() => onChange([...rows, newScoredRow()])}
        sx={{ alignSelf: "flex-start" }}
      />
    </Stack>
  );
};

export default ScoredOptionsEditor;
```

`Field`'s `sx` prop sizes its wrapper; if it doesn't reach the input, wrap each `Field` in a `Box` with that `flex` value instead. `useTranslation` returns `{ t }` (see `AgentActivityDrawer.tsx` for an example).

- [ ] **Step 4: The move dialog**

`Clients/src/presentation/pages/SettingsPage/CustomFields/MoveOptionAnswersModal.tsx`:

```tsx
import React, { useState } from "react";
import { Stack, Typography } from "@mui/material";
import StandardModal from "../../../components/Modals/StandardModal";
import Select from "../../../components/Inputs/Select";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import { fill } from "../../../../i18n/fill";
import {
  CustomFieldEntityType,
  entityCountNoun,
  formatScoredOption,
  IScoredOptionInput,
} from "../../../../domain/interfaces/i.customField";

export interface OptionInUse {
  id: string;
  label: string;
  count: number;
}

interface MoveOptionAnswersModalProps {
  inUse: OptionInUse[];
  entityType: CustomFieldEntityType;
  /** Options that remain after the save (only ones with an id can be targets). */
  remaining: IScoredOptionInput[];
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: (moves: Record<string, string>) => void;
}

const MoveOptionAnswersModal: React.FC<MoveOptionAnswersModalProps> = ({
  inUse,
  entityType,
  remaining,
  isSubmitting,
  onCancel,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const [moves, setMoves] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const targets = remaining
    .filter((o): o is IScoredOptionInput & { id: string } => typeof o.id === "string")
    .map((o) => ({ _id: o.id, name: formatScoredOption(o) }));

  return (
    <StandardModal
      isOpen={true}
      title="Move answers before removing options"
      description="Records use the options you removed. Choose where their answers go."
      submitButtonText="Move and save"
      isSubmitting={isSubmitting}
      onClose={onCancel}
      onSubmit={() => {
        if (inUse.some((o) => !moves[o.id])) {
          setError(t("Choose an option for each removed option."));
          return;
        }
        onConfirm(moves);
      }}
    >
      <Stack sx={{ gap: "16px" }}>
        {inUse.map((option) => (
          <Stack key={option.id} sx={{ gap: "8px" }}>
            <Typography sx={{ fontSize: "13px" }}>
              {fill(t("{count} {records} use {option}. Move them to:"), {
                count: option.count,
                records: t(entityCountNoun(entityType, option.count)),
                option: option.label,
              })}
            </Typography>
            <Select
              id={`move-${option.id}`}
              value={moves[option.id] ?? ""}
              items={targets}
              placeholder="Select an option"
              onChange={(e) => setMoves((m) => ({ ...m, [option.id]: e.target.value as string }))}
            />
          </Stack>
        ))}
        {error && <Typography sx={{ fontSize: "12px", color: "error.main" }}>{error}</Typography>}
      </Stack>
    </StandardModal>
  );
};

export default MoveOptionAnswersModal;
```

New options (rows without an id) can't be move targets: their id doesn't exist until the save succeeds. The 409 arrives before anything is written, so the admin chooses among existing options.

- [ ] **Step 5: Wire the Settings page**

In `SettingsPage/CustomFields/index.tsx`:

1. **Imports.** Add `useCustomFieldUsage` to the hooks import. From the interfaces module, add `entityCountNoun`, `formatScoredOption`, `IScoredOptionInput`, `scoredOptions` and `stringOptions`. Also import `useTranslation`, `fill`, `ScoredOptionsEditor` (with `newScoredRow`, `rowsFromOptions` and `ScoredOptionRow`), and `MoveOptionAnswersModal` (with `OptionInUse`).

2. **Options column.** Replace the chips block at :200-212 with:

```tsx
                    <Stack direction="row" flexWrap="wrap" sx={{ gap: "4px" }}>
                      {(def.field_type === "scored_select"
                        ? scoredOptions(def).map((o) => ({ key: o.id, text: formatScoredOption(o) }))
                        : stringOptions(def).map((o) => ({ key: o, text: o }))
                      ).map((chip) => (
                        <Chip
                          key={chip.key}
                          label={chip.text}
                          sx={{ fontSize: "11px", height: "20px", borderRadius: "4px" }}
                        />
                      ))}
                    </Stack>
```

3. **Move state in `CustomFieldsTab`.** Next to the other `useState`s, add:

```tsx
  const { t } = useTranslation();
  const [pendingMove, setPendingMove] = useState<{
    id: number;
    body: { label: string; required?: boolean; options: IScoredOptionInput[] };
    inUse: OptionInUse[];
    entityType: CustomFieldEntityType;
  } | null>(null);
  const { data: editingUsage } = useCustomFieldUsage(editing?.id ?? null);
  const { data: deleteUsage } = useCustomFieldUsage(confirmDelete?.id ?? null);
```

Hooks must run before the `if (!isAdmin) return …` early return at :76, so place these above it.

4. **Edit submit at :278-294.** Detect the 409:

```tsx
          onSubmit={(input) => {
            setServerError(null);
            const body = {
              label: input.label,
              required: input.required,
              options: input.options ?? null,
            };
            updateMutation.mutate(
              { id: editing.id, body },
              {
                onSuccess: () => setEditing(null),
                onError: (err: any) => {
                  const data = err?.response?.data;
                  if (err?.status === 409 && data?.code === "options_in_use") {
                    setPendingMove({
                      id: editing.id,
                      body: body as { label: string; required?: boolean; options: IScoredOptionInput[] },
                      inUse: data.in_use as OptionInUse[],
                      entityType: data.entity_type as CustomFieldEntityType,
                    });
                    return;
                  }
                  setServerError(extractErrorMessage(err));
                },
              },
            );
          }}
```

5. **Pass usage to the edit modal.** Add `usage={editingUsage?.by_option}` to the edit `DefinitionFormModal`, and the prop `usage?: Record<string, number>;` to `DefinitionFormModalProps`.

6. **Render the move dialog** after the edit modal:

```tsx
      {pendingMove && (
        <MoveOptionAnswersModal
          inUse={pendingMove.inUse}
          entityType={pendingMove.entityType}
          remaining={pendingMove.body.options}
          isSubmitting={updateMutation.isPending}
          onCancel={() => setPendingMove(null)}
          onConfirm={(moves) =>
            updateMutation.mutate(
              { id: pendingMove.id, body: { ...pendingMove.body, option_moves: moves } },
              {
                onSuccess: () => {
                  setPendingMove(null);
                  setEditing(null);
                },
                onError: (err: any) => {
                  setPendingMove(null);
                  setServerError(extractErrorMessage(err));
                },
              },
            )
          }
        />
      )}
```

7. **Delete confirmation body at :303-306.** Name the records from `confirmDelete.entity_type`, not the page's `entityType` state, which defaults to `"vendor"`:

```tsx
            <Stack sx={{ gap: "8px" }}>
              <Typography fontSize={13}>
                This will permanently remove "{confirmDelete.label}" and all values stored on existing
                records. This action cannot be undone.
              </Typography>
              {(deleteUsage?.total ?? 0) > 0 && (
                <Typography fontSize={13} fontWeight={500}>
                  {fill(t("{count} {records} have a value for this field."), {
                    count: deleteUsage!.total,
                    records: t(entityCountNoun(confirmDelete.entity_type, deleteUsage!.total)),
                  })}
                </Typography>
              )}
            </Stack>
```

8. **`DefinitionFormModal`:**
   - Change the `onSubmit` input type's `options?` to `string[] | IScoredOptionInput[] | null`.
   - Initialise text options with `stringOptions(existing ?? { field_type: "text", options: null }).join("\n")` instead of `(existing?.options ?? []).join("\n")`.
   - Add `const isScored = fieldType === "scored_select";`.
   - Add state:

```tsx
  // Starts with one empty row; the editor never removes the last row.
  const [scoredRows, setScoredRows] = useState<ScoredOptionRow[]>(() =>
    existing ? rowsFromOptions(scoredOptions(existing)) : [newScoredRow()],
  );
```

   - In `handleSubmit`, before `onSubmit(...)`, add:

```tsx
    let scoredInput: IScoredOptionInput[] | null = null;
    if (isScored) {
      const filled = scoredRows.map((r) => ({ ...r, label: r.label.trim() }));
      if (filled.some((r) => r.label === "" || r.score.trim() === "" || !Number.isFinite(Number(r.score)))) {
        setLocalError("Every option needs a label and a score.");
        return;
      }
      const lower = filled.map((r) => r.label.toLowerCase());
      if (new Set(lower).size !== lower.length) {
        setLocalError("Option labels must be unique.");
        return;
      }
      scoredInput = filled.map((r) => ({
        ...(r.id ? { id: r.id } : {}),
        label: r.label,
        score: Number(Number(r.score).toFixed(2)),
      }));
    }
```

   - Change the `onSubmit` call's options to `options: isScored ? scoredInput : needsOptions ? parsedOptions : null,`.
   - Next to the `needsOptions && <Field id="cf-options" …>` block, render:

```tsx
        {isScored && <ScoredOptionsEditor rows={scoredRows} onChange={setScoredRows} usage={usage} />}
```

- [ ] **Step 6: Translations**

Add these keys to the de, fr and es dictionaries. Put them next to `"Scored select"` from Task 5.

| key | de | fr | es |
|---|---|---|---|
| `Options` | (check whether it exists first: `grep -c '"Options":' Clients/src/i18n/translations.ts`) | | |
| `Option label` | Optionsbezeichnung | Libellé de l'option | Etiqueta de la opción |
| `Score` | (check whether it exists first) | | |
| `Add option` | Option hinzufügen | Ajouter une option | Añadir opción |
| `Move option up` | Option nach oben | Monter l'option | Subir opción |
| `Move option down` | Option nach unten | Descendre l'option | Bajar opción |
| `Remove option` | Option entfernen | Supprimer l'option | Quitar opción |
| `Used by {count}` | Verwendet von {count} | Utilisée par {count} | Usada por {count} |
| `Every option needs a label and a score.` | Jede Option braucht eine Bezeichnung und eine Punktzahl. | Chaque option doit avoir un libellé et un score. | Cada opción necesita una etiqueta y una puntuación. |
| `Option labels must be unique.` | Optionsbezeichnungen müssen eindeutig sein. | Les libellés des options doivent être uniques. | Las etiquetas de las opciones deben ser únicas. |
| `Move answers before removing options` | Antworten verschieben, bevor Optionen entfernt werden | Déplacer les réponses avant de supprimer des options | Mover las respuestas antes de quitar opciones |
| `Records use the options you removed. Choose where their answers go.` | Datensätze verwenden die entfernten Optionen. Wählen Sie, wohin ihre Antworten verschoben werden. | Des enregistrements utilisent les options supprimées. Choisissez où déplacer leurs réponses. | Hay registros que usan las opciones quitadas. Elige adónde van sus respuestas. |
| `Move and save` | Verschieben und speichern | Déplacer et enregistrer | Mover y guardar |
| `Choose an option for each removed option.` | Wählen Sie für jede entfernte Option eine Option. | Choisissez une option pour chaque option supprimée. | Elige una opción para cada opción quitada. |
| `{count} {records} use {option}. Move them to:` | {count} {records} verwenden {option}. Verschieben nach: | {count} {records} utilisent {option}. Les déplacer vers : | {count} {records} usan {option}. Moverlos a: |
| `{count} {records} have a value for this field.` | {count} {records} haben einen Wert für dieses Feld. | {count} {records} ont une valeur pour ce champ. | {count} {records} tienen un valor para este campo. |
| `use case` / `use cases` | Anwendungsfall / Anwendungsfälle | cas d'usage / cas d'usage | caso de uso / casos de uso |
| `vendor` / `vendors` | Anbieter / Anbieter | fournisseur / fournisseurs | proveedor / proveedores |
| `policy` / `policies` | Richtlinie / Richtlinien | politique / politiques | política / políticas |
| `project risk` / `project risks` | Projektrisiko / Projektrisiken | risque projet / risques projet | riesgo de proyecto / riesgos de proyecto |
| `vendor risk` / `vendor risks` | Anbieterrisiko / Anbieterrisiken | risque fournisseur / risques fournisseurs | riesgo de proveedor / riesgos de proveedor |
| `model` / `models` | Modell / Modelle | modèle / modèles | modelo / modelos |
| `task` / `tasks` | Aufgabe / Aufgaben | tâche / tâches | tarea / tareas |
| `model risk` / `model risks` | Modellrisiko / Modellrisiken | risque modèle / risques modèles | riesgo de modelo / riesgos de modelo |

For `Options` and `Score`, add an entry only when the grep count is 0, using de "Optionen" / "Punktzahl", fr "Options" / "Score", es "Opciones" / "Puntuación". Never add a duplicate key, because a duplicate object key fails typecheck (TS1117).

- [ ] **Step 7: Run tests and gates**

Run: `cd Clients && npx vitest run src/presentation/pages/SettingsPage/CustomFields src/presentation/components/CustomFieldsSection && npm run typecheck && npm run i18n:audit:strict && npm run format-check`
Expected: all pass, with 0 i18n gaps.

- [ ] **Step 8: Commit**

```bash
cd Clients && npx prettier --write src/presentation/pages/SettingsPage/CustomFields src/application/repository/customField.repository.ts src/application/hooks/useCustomFields.ts src/i18n/translations.ts && cd ..
git add Clients/src/presentation/pages/SettingsPage/CustomFields Clients/src/application/repository/customField.repository.ts Clients/src/application/hooks/useCustomFields.ts Clients/src/i18n/translations.ts
git commit -m "feat(custom-fields): scored options editor, move dialog and usage counts in settings"
```

---

### Task 7: Full verification

**Files:** none new. Fix whatever the gates or the live check expose.

- [ ] **Step 1: All gates**

```bash
cd /Users/gorkemcetin/.claude-worktrees/verifywise/scored-select/Servers && npm run build && npm run test && npm run format-check
cd ../Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check && npx vitest run
```

Expected: everything passes. Report any failure with its output, and compare against `develop` before calling it pre-existing.

- [ ] **Step 2: Migration on a scratch database**

Create a scratch copy of the local database and run the migration both ways:

```bash
createdb -T verifywise verifywise_scoredselect
cd Servers && DB_NAME=verifywise_scoredselect npx sequelize-cli db:migrate
DB_NAME=verifywise_scoredselect npx sequelize-cli db:migrate:undo
DB_NAME=verifywise_scoredselect npx sequelize-cli db:migrate
```

Check how this repo runs migrations (`Servers/package.json` scripts, for example `migrate-db`) and use that command. Expected: up, down and up all succeed. `psql -d verifywise_scoredselect -c "\d+ verifywise.custom_field_definitions"` shows `scored_select` in `cfd_field_type_allowed`.

- [ ] **Step 3: Live check in the browser**

1. Start the backend against the scratch database (`DB_NAME=verifywise_scoredselect`) and the client from this worktree.
2. As an Admin, create three use case fields from the customer's rubric:
   - Technical feasibility: High 3 / Medium 2 / Low 1.
   - Group applicability: One 1 / Few 2 / Most 3.
   - Estimated effort: Low 3 / Medium 2 / High 1.
3. Answer them on two use cases.
4. Confirm the use case table shows "High (3)".
5. Rescore High to 4 and confirm the table shows "High (4)".
6. Remove "Medium" while a use case uses it. The move dialog appears; move its answers to Low and confirm the use case now shows "Low (1)".
7. Open Settings → Audit ledger and confirm entries for the create, the rescore, and the removal ("1 answer moved to Low").
8. Check the browser console for errors.

- [ ] **Step 4: Semgrep on changed files**

```bash
semgrep --config p/javascript --config p/typescript --config p/security-audit --config p/secrets --metrics=off $(git diff --name-only origin/develop -- Servers Clients | grep -E '\.(ts|tsx|js)$')
```

Expected: no findings, or each one explained.
