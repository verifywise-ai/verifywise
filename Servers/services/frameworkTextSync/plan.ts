/**
 * Which struct rows of a bundled framework hold text that differs from the
 * registry (Servers/structures), and what to write.
 *
 * Pure: it compares the registry seed with rows already read from the
 * database, so the matching rules are testable without one. The runner
 * (./sync.ts) reads the rows and applies the plan.
 *
 * Rows are matched by position, the way the seed migrations numbered them:
 * a level-1 item by its order_no within the framework, a level-2 item by its
 * order_no within its level-1 parent, a level-3 item within its level-2
 * parent. order_no is the seed's own value or, when the seed leaves it out,
 * the item's 1-based index (the same `item.order_no || index + 1` the
 * migrations use). Row ids never change, so implementation rows, statuses,
 * evidence and progress stay attached.
 *
 * Only text is synced. When the database holds a different set of items
 * (one was added, removed or renumbered in the registry), position no longer
 * identifies the same item, so the framework is skipped with a reason and
 * the change needs a migration.
 */
import type { FrameworkSeed, SeedLevel1, SeedLevel2, SeedLevel3 } from "../../structures/types";

export type StructLevel = "l1" | "l2" | "l3";

/** A struct row as read from the database. parent_id is null for level 1. */
export interface StructRow {
  id: number;
  parent_id: number | null;
  order_no: number | null;
  title: string;
  description: string | null;
  summary?: string | null;
  questions?: string[] | null;
  evidence_examples?: string[] | null;
}

export interface StructRows {
  l1: StructRow[];
  l2: StructRow[];
  l3?: StructRow[];
}

/** The text columns of a level that differ, with the registry's values. */
export interface TextUpdate {
  level: StructLevel;
  id: number;
  values: Partial<
    Pick<StructRow, "title" | "description" | "summary" | "questions" | "evidence_examples">
  >;
}

export type TextSyncPlan = { updates: TextUpdate[] } | { skip: string };

type SeedItem = SeedLevel1 | SeedLevel2 | SeedLevel3;

const orderOf = (item: { order_no?: number }, index: number): number => item.order_no || index + 1;

const text = (v: string | null | undefined): string | null => v || null;
const list = (v: string[] | null | undefined): string[] => (Array.isArray(v) ? v : []);
const sameList = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * The text columns a level stores. Level 1 has no summary, questions or
 * evidence examples; levels 2 and 3 have all five.
 */
function diffText(level: StructLevel, seed: SeedItem, row: StructRow): TextUpdate["values"] {
  const values: TextUpdate["values"] = {};
  if (seed.title !== row.title) values.title = seed.title;
  if (text(seed.description) !== text(row.description)) values.description = text(seed.description);
  if (level === "l1") return values;

  const item = seed as SeedLevel3;
  if (text(item.summary) !== text(row.summary)) values.summary = text(item.summary);
  if (!sameList(list(item.questions), list(row.questions))) values.questions = list(item.questions);
  if (!sameList(list(item.evidence_examples), list(row.evidence_examples))) {
    values.evidence_examples = list(item.evidence_examples);
  }
  return values;
}

/**
 * Pairs the seed items under one parent with that parent's rows, by order_no.
 * Returns a reason when they cannot be paired one to one.
 */
function pair<T extends SeedItem>(
  label: string,
  items: T[],
  rows: StructRow[],
): { pairs: Array<[T, StructRow]> } | { mismatch: string } {
  if (items.length !== rows.length) {
    return {
      mismatch: `${label}: the registry has ${items.length} items, the database ${rows.length}`,
    };
  }
  const byOrder = new Map<number, StructRow>();
  for (const row of rows) {
    if (row.order_no === null || byOrder.has(row.order_no)) {
      return { mismatch: `${label}: database order numbers are missing or repeated` };
    }
    byOrder.set(row.order_no, row);
  }
  const pairs: Array<[T, StructRow]> = [];
  const seen = new Set<number>();
  for (let i = 0; i < items.length; i++) {
    const order = orderOf(items[i], i);
    const row = byOrder.get(order);
    if (!row || seen.has(order)) {
      return { mismatch: `${label}: no database row at position ${order}` };
    }
    seen.add(order);
    pairs.push([items[i], row]);
  }
  return { pairs };
}

export function planFrameworkTextSync(seed: FrameworkSeed, rows: StructRows): TextSyncPlan {
  const threeLevel = seed.hierarchy?.type === "three_level";
  const updates: TextUpdate[] = [];
  const collect = (level: StructLevel, item: SeedItem, row: StructRow) => {
    const values = diffText(level, item, row);
    if (Object.keys(values).length) updates.push({ level, id: row.id, values });
  };
  const childrenOf = (all: StructRow[] | undefined, parentId: number) =>
    (all ?? []).filter((r) => r.parent_id === parentId);

  const l1 = pair("level 1", seed.structure ?? [], rows.l1);
  if ("mismatch" in l1) return { skip: l1.mismatch };

  for (const [l1Item, l1Row] of l1.pairs) {
    collect("l1", l1Item, l1Row);
    const l2 = pair(
      `level 2 under "${l1Item.title}"`,
      l1Item.items ?? [],
      childrenOf(rows.l2, l1Row.id),
    );
    if ("mismatch" in l2) return { skip: l2.mismatch };

    for (const [l2Item, l2Row] of l2.pairs) {
      collect("l2", l2Item, l2Row);
      if (!threeLevel) continue;
      const l3 = pair(
        `level 3 under "${l2Item.title}"`,
        l2Item.items ?? [],
        childrenOf(rows.l3, l2Row.id),
      );
      if ("mismatch" in l3) return { skip: l3.mismatch };
      for (const [l3Item, l3Row] of l3.pairs) collect("l3", l3Item, l3Row);
    }
  }

  return { updates };
}
