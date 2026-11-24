import { KeyedTarget, keyedTextFingerprint, planKeyedTarget } from "../keyed";
import { BUILTIN_TEXT_SOURCES } from "../builtins";

const target = (over: Partial<KeyedTarget> = {}): KeyedTarget => ({
  label: "test items",
  table: "items_struct",
  select: "SELECT 1",
  columns: { title: "text", questions: "array" },
  expected: new Map([
    ["1", { title: "Policy", questions: ["Is there one?"] }],
    ["2", { title: "Inventory", questions: [] }],
  ]),
  ...over,
});

describe("planKeyedTarget", () => {
  it("writes only the columns that differ, on the row with the same key", () => {
    const plan = planKeyedTarget(target(), [
      { id: 10, key: "1", title: "Policy", questions: ["Old?"] },
      { id: 11, key: "2", title: "Old inventory", questions: null },
    ]);
    expect(plan).toEqual({
      updates: [
        {
          table: "items_struct",
          id: 10,
          values: { questions: ["Is there one?"] },
          kinds: expect.any(Object),
        },
        {
          table: "items_struct",
          id: 11,
          values: { title: "Inventory" },
          kinds: expect.any(Object),
        },
      ],
      missing: 0,
      retitled: [],
    });
  });

  it("treats null and empty text alike", () => {
    const t = target({ columns: { hint: "text" }, expected: new Map([["1", { hint: null }]]) });
    expect(planKeyedTarget(t, [{ id: 1, key: "1", hint: "" }])).toEqual({
      updates: [],
      missing: 0,
      retitled: [],
    });
  });

  // ISO 42001 holds subclause rows (6.1.1–6.1.4, 6.3) that only a migration
  // created; an item added in the code needs a migration. Neither is touched.
  it("leaves database-only rows alone and counts code items with no row", () => {
    const plan = planKeyedTarget(target(), [
      { id: 10, key: "1", title: "Policy", questions: ["Is there one?"] },
      { id: 99, key: "9", title: "Migration-only", questions: [] },
    ]);
    expect(plan).toEqual({ updates: [], missing: 1, retitled: [] });
  });

  it("gives every row sharing a key that key's text", () => {
    const plan = planKeyedTarget(target({ columns: { title: "text" } }), [
      { id: 10, key: "1", title: "Old" },
      { id: 12, key: "1", title: "Old" },
      { id: 11, key: "2", title: "Inventory" },
    ]);
    expect("updates" in plan && plan.updates.map((u) => u.id)).toEqual([10, 12]);
  });

  it("skips a position-keyed target whose titles moved", () => {
    const plan = planKeyedTarget(target({ columns: { title: "text" }, guardMovesOn: "title" }), [
      { id: 10, key: "1", title: "Inventory" },
      { id: 11, key: "2", title: "Policy" },
    ]);
    expect(plan).toEqual({ skip: expect.stringContaining("reordering needs a migration") });
  });

  // EU AI Act repeats control titles under different categories; rewording
  // one of them is not a move.
  it("does not read a title repeated under another parent as a move", () => {
    const t = target({
      columns: { title: "text" },
      guardMovesOn: "title",
      expected: new Map([
        ["1/1", { title: "Oversight documentation, reworded" }],
        ["2/1", { title: "Oversight documentation" }],
      ]),
    });
    const plan = planKeyedTarget(t, [
      { id: 10, key: "1/1", title: "Oversight documentation" },
      { id: 11, key: "2/1", title: "Oversight documentation" },
    ]);
    expect(plan).toMatchObject({
      updates: [{ id: 10, values: { title: "Oversight documentation, reworded" } }],
    });
  });

  it("reports retitled rows when the target asks for it", () => {
    const plan = planKeyedTarget(target({ columns: { title: "text" }, reportTitleChanges: true }), [
      { id: 10, key: "1", title: "Cloud services" },
      { id: 11, key: "2", title: "Inventory" },
    ]);
    expect(plan).toMatchObject({ retitled: ['1: "Cloud services" -> "Policy"'] });
  });

  it("realigns moved titles when the target has no guard", () => {
    const plan = planKeyedTarget(target({ columns: { title: "text" } }), [
      { id: 10, key: "1", title: "Inventory" },
      { id: 11, key: "2", title: "Policy" },
    ]);
    expect("updates" in plan && plan.updates).toHaveLength(2);
  });
});

describe("keyedTextFingerprint", () => {
  it("changes with the text and ignores null vs empty", () => {
    const base = keyedTextFingerprint([target()]);
    expect(
      keyedTextFingerprint([target({ expected: new Map([["1", { title: "X", questions: [] }]]) })]),
    ).not.toBe(base);
    const blank = target({
      expected: new Map([
        ["1", { title: "Policy", questions: ["Is there one?"] }],
        ["2", { title: "Inventory", questions: null }],
      ]),
    });
    expect(keyedTextFingerprint([blank])).toBe(base);
  });
});

describe("built-in text sources", () => {
  // A key that two TS items share would give both rows one item's text.
  it.each(BUILTIN_TEXT_SOURCES.map((b) => [b.key, b] as const))(
    "%s: every target has unique keys and text for every column",
    (_key, source) => {
      for (const t of source.targets()) {
        expect(t.expected.size).toBeGreaterThan(0);
        for (const values of t.expected.values()) {
          for (const column of Object.keys(values))
            expect(Object.keys(t.columns)).toContain(column);
        }
      }
    },
  );
});
