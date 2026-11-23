/**
 * Text sync for tables whose rows are identified by an explicit key rather
 * than by position in a generic l1/l2/l3 tree: the four built-in frameworks
 * (EU AI Act, ISO 42001, ISO 27001, NIST AI RMF), each with its own struct
 * tables, and the `frameworks` row's description for every framework.
 *
 * A source (./builtins.ts) describes each table as a KeyedTarget: the SQL that
 * reads its rows with a key, and the text each key should hold according to
 * the TS structures. The plan pairs them by key and writes only the columns
 * that differ. Pure: it compares rows already read, so it is testable without
 * a database.
 *
 * - A database row whose key the TS does not have is left alone (ISO 42001
 *   holds clause 6.1.1–6.1.4 and 6.3 rows that only a migration created).
 * - A TS item with no database row is not inserted; adding items needs a
 *   migration. It is counted so the gap is visible.
 * - Several rows with the same key all get that key's text (ISO 27001 fresh
 *   installs hold two "General" subclause rows under clause 6).
 * - A target keyed by position can ask for the moved-title guard: when a
 *   title moved to another key, the items were reordered and the source is
 *   skipped, as for the bundled frameworks.
 */
import { createHash } from "crypto";

export type ColumnKind = "text" | "array";
export type TextValue = string | string[] | null;

export interface KeyedTarget {
  /** For log messages, e.g. "EU AI Act controls". */
  label: string;
  /** Table the updates go to (unqualified). */
  table: string;
  /**
   * Returns `id`, `key` (text) and every column in `columns`. Binds
   * :frameworkId when it needs it.
   */
  select: string;
  columns: Record<string, ColumnKind>;
  /** Key → the text each column should hold. */
  expected: Map<string, Record<string, TextValue>>;
  /** Column checked for moved items, for targets keyed by position. */
  guardMovesOn?: string;
}

export interface KeyedRow {
  id: number;
  key: string;
  [column: string]: unknown;
}

export interface KeyedUpdate {
  table: string;
  id: number;
  values: Record<string, TextValue>;
  kinds: Record<string, ColumnKind>;
}

export type KeyedPlan = { updates: KeyedUpdate[]; missing: number } | { skip: string };

const asText = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const same = (kind: ColumnKind, a: unknown, b: unknown): boolean => {
  if (kind === "text") return asText(a) === asText(b);
  const x = asList(a);
  const y = asList(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

export function planKeyedTarget(target: KeyedTarget, rows: KeyedRow[]): KeyedPlan {
  const rowsByKey = new Map<string, KeyedRow[]>();
  for (const row of rows) {
    const list = rowsByKey.get(row.key) ?? [];
    list.push(row);
    rowsByKey.set(row.key, list);
  }

  if (target.guardMovesOn) {
    const column = target.guardMovesOn;
    const dbValues = new Set(rows.map((r) => asText(r[column])));
    const expectedValues = new Set([...target.expected.values()].map((v) => asText(v[column])));
    for (const [key, values] of target.expected) {
      for (const row of rowsByKey.get(key) ?? []) {
        const want = asText(values[column]);
        const have = asText(row[column]);
        if (want === have) continue;
        const moving = expectedValues.has(have) ? have : dbValues.has(want) ? want : null;
        if (moving) {
          return {
            skip: `${target.label}: "${moving}" is at a different position than in the database (reordering needs a migration)`,
          };
        }
      }
    }
  }

  const updates: KeyedUpdate[] = [];
  let missing = 0;
  for (const [key, values] of target.expected) {
    const matches = rowsByKey.get(key);
    if (!matches) {
      missing++;
      continue;
    }
    for (const row of matches) {
      const changed: Record<string, TextValue> = {};
      for (const [column, kind] of Object.entries(target.columns)) {
        if (!(column in values)) continue;
        if (!same(kind, values[column], row[column])) {
          changed[column] = kind === "text" ? asText(values[column]) : asList(values[column]);
        }
      }
      if (Object.keys(changed).length) {
        updates.push({ table: target.table, id: row.id, values: changed, kinds: target.columns });
      }
    }
  }
  return { updates, missing };
}

/** Fingerprint of everything a set of targets would write, for the revision check. */
export function keyedTextFingerprint(targets: KeyedTarget[]): string {
  const normalized = targets.map((t) => [
    t.table,
    [...t.expected.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, values]) => [
        key,
        Object.keys(t.columns).map((c) =>
          t.columns[c] === "text" ? asText(values[c]) : asList(values[c]),
        ),
      ]),
  ]);
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}
