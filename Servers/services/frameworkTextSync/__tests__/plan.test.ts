import { frameworkTextFingerprint, planFrameworkTextSync, StructRows } from "../plan";
import type { FrameworkSeed } from "../../../structures/types";
import { FRAMEWORK_STRUCTURES } from "../../../structures";

const twoLevel = (structure: FrameworkSeed["structure"]): FrameworkSeed => ({
  name: "Test framework",
  hierarchy: { type: "two_level" },
  structure,
});

const seed = twoLevel([
  {
    title: "Governance",
    description: "How the programme is run",
    items: [
      {
        title: "Policy",
        description: "A written policy",
        summary: "Have a policy",
        questions: ["Is there a policy?"],
        evidence_examples: ["Policy document"],
      },
      { title: "Inventory", description: null },
    ],
  },
]);

/** Rows exactly as the seed migration writes them for `seed`. */
const matchingRows = (): StructRows => ({
  l1: [
    {
      id: 10,
      parent_id: null,
      order_no: 1,
      title: "Governance",
      description: "How the programme is run",
    },
  ],
  l2: [
    {
      id: 20,
      parent_id: 10,
      order_no: 1,
      title: "Policy",
      description: "A written policy",
      summary: "Have a policy",
      questions: ["Is there a policy?"],
      evidence_examples: ["Policy document"],
    },
    {
      id: 21,
      parent_id: 10,
      order_no: 2,
      title: "Inventory",
      description: null,
      summary: null,
      questions: [],
      evidence_examples: [],
    },
  ],
});

describe("planFrameworkTextSync", () => {
  it("plans nothing when the database already matches the registry", () => {
    expect(planFrameworkTextSync(seed, matchingRows())).toEqual({ updates: [] });
  });

  it("plans only the columns whose text changed, on the row at the same position", () => {
    const rows = matchingRows();
    rows.l2[0].title = "Old policy title";
    rows.l2[0].questions = ["Old question?"];
    rows.l1[0].description = "Old description";
    expect(planFrameworkTextSync(seed, rows)).toEqual({
      updates: [
        { level: "l1", id: 10, values: { description: "How the programme is run" } },
        {
          level: "l2",
          id: 20,
          values: { title: "Policy", questions: ["Is there a policy?"] },
        },
      ],
    });
  });

  // The seed migrations write a missing description as NULL and a missing
  // list as '{}', so neither counts as a change.
  it("treats null, empty text and an empty list as the same", () => {
    const rows = matchingRows();
    rows.l2[1].description = "";
    rows.l2[1].questions = null;
    rows.l2[1].evidence_examples = null;
    expect(planFrameworkTextSync(seed, rows)).toEqual({ updates: [] });
  });

  it("matches by order_no, not by the order rows come back in", () => {
    const rows = matchingRows();
    rows.l2.reverse();
    rows.l2.find((r) => r.id === 21)!.title = "Old inventory title";
    expect(planFrameworkTextSync(seed, rows)).toEqual({
      updates: [{ level: "l2", id: 21, values: { title: "Inventory" } }],
    });
  });

  it("uses the seed's own order_no when it sets one", () => {
    const explicit = twoLevel([{ title: "A", order_no: 5, items: [{ title: "A1", order_no: 3 }] }]);
    const rows: StructRows = {
      l1: [{ id: 1, parent_id: null, order_no: 5, title: "A", description: null }],
      l2: [{ id: 2, parent_id: 1, order_no: 3, title: "old", description: null }],
    };
    expect(planFrameworkTextSync(explicit, rows)).toEqual({
      updates: [{ level: "l2", id: 2, values: { title: "A1" } }],
    });
  });

  // Position identifies an item only while the set of items is the same; an
  // added or removed item needs a migration, so nothing is written.
  it("skips the framework when an item was added in the registry", () => {
    const rows = matchingRows();
    rows.l2.pop();
    const plan = planFrameworkTextSync(seed, rows);
    expect(plan).toEqual({
      skip: expect.stringContaining("the registry has 2 items, the database 1"),
    });
  });

  it("skips the framework when database order numbers repeat", () => {
    const rows = matchingRows();
    rows.l2[1].order_no = 1;
    expect(planFrameworkTextSync(seed, rows)).toEqual({
      skip: expect.stringContaining("missing or repeated"),
    });
  });

  it("skips the framework when a position has no row", () => {
    const rows = matchingRows();
    rows.l2[1].order_no = 7;
    expect(planFrameworkTextSync(seed, rows)).toEqual({
      skip: expect.stringContaining("no database row at position 2"),
    });
  });

  // Reordering keeps the count, so position alone would put each item's text
  // on a row that holds another item's status and evidence.
  it("skips the framework when the registry swaps two items", () => {
    const swapped = twoLevel([
      { ...seed.structure[0], items: [seed.structure[0].items![1], seed.structure[0].items![0]] },
    ]);
    expect(planFrameworkTextSync(swapped, matchingRows())).toEqual({
      skip: expect.stringContaining("reordering needs a migration"),
    });
  });

  it("skips the framework when items shift (one inserted, another removed)", () => {
    const shifted = twoLevel([
      {
        ...seed.structure[0],
        items: [{ title: "New first item" }, seed.structure[0].items![0]],
      },
    ]);
    expect(planFrameworkTextSync(shifted, matchingRows())).toEqual({
      skip: expect.stringContaining('"Policy" is at a different position'),
    });
  });

  it("does not read a title repeated under another parent as a move", () => {
    const repeated = twoLevel([
      { title: "A", items: [{ title: "General, reworded" }] },
      { title: "B", items: [{ title: "General" }] },
    ]);
    const rows: StructRows = {
      l1: [
        { id: 1, parent_id: null, order_no: 1, title: "A", description: null },
        { id: 2, parent_id: null, order_no: 2, title: "B", description: null },
      ],
      l2: [
        { id: 3, parent_id: 1, order_no: 1, title: "General", description: null },
        { id: 4, parent_id: 2, order_no: 1, title: "General", description: null },
      ],
    };
    expect(planFrameworkTextSync(repeated, rows)).toEqual({
      updates: [{ level: "l2", id: 3, values: { title: "General, reworded" } }],
    });
  });

  it("reports a position the registry repeats as a registry problem", () => {
    const repeated = twoLevel([
      {
        title: "Governance",
        items: [
          { title: "Policy", order_no: 1 },
          { title: "Inventory", order_no: 1 },
        ],
      },
    ]);
    expect(planFrameworkTextSync(repeated, matchingRows())).toEqual({
      skip: expect.stringContaining("registry order numbers repeat at 1"),
    });
  });

  it("syncs the third level of a three-level framework", () => {
    const three: FrameworkSeed = {
      name: "Three",
      hierarchy: { type: "three_level" },
      structure: [
        { title: "C", items: [{ title: "C1", items: [{ title: "C1.a", summary: "new" }] }] },
      ],
    };
    const rows: StructRows = {
      l1: [{ id: 1, parent_id: null, order_no: 1, title: "C", description: null }],
      l2: [{ id: 2, parent_id: 1, order_no: 1, title: "C1", description: null }],
      l3: [{ id: 3, parent_id: 2, order_no: 1, title: "C1.a", description: null, summary: "old" }],
    };
    expect(planFrameworkTextSync(three, rows)).toEqual({
      updates: [{ level: "l3", id: 3, values: { summary: "new" } }],
    });
  });

  // Every bundled framework must be one the planner can read: a seed whose
  // positions repeat could never be matched, and would silently never sync.
  it.each(FRAMEWORK_STRUCTURES.map((fw) => [fw.key, fw]))(
    "%s has unique positions at every level",
    (_key, fw) => {
      const unique = (items: Array<{ order_no?: number }>) => {
        const orders = items.map((item, i) => item.order_no || i + 1);
        return new Set(orders).size === orders.length;
      };
      expect(unique(fw.seed.structure)).toBe(true);
      for (const l1 of fw.seed.structure) {
        expect(unique(l1.items ?? [])).toBe(true);
        for (const l2 of l1.items ?? []) expect(unique(l2.items ?? [])).toBe(true);
      }
    },
  );
});

describe("frameworkTextFingerprint", () => {
  it("changes with any synced text and with positions, and ignores null vs empty", () => {
    const base = frameworkTextFingerprint(seed);
    const reworded = twoLevel([{ ...seed.structure[0], description: "Reworded" }]);
    expect(frameworkTextFingerprint(reworded)).not.toBe(base);
    const blank = twoLevel([
      {
        ...seed.structure[0],
        items: [seed.structure[0].items![0], { title: "Inventory", description: "" }],
      },
    ]);
    expect(frameworkTextFingerprint(blank)).toBe(base);
  });
});
