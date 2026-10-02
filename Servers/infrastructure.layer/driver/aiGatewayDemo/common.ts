/**
 * Shared helpers for the AI Gateway demo seeder: deterministic RNG, batched
 * multi-row INSERTs, table-existence guards, and the small formatting helpers
 * needed to reproduce exactly what the (Python) gateway writes.
 */

import crypto from "crypto";
import { Transaction, QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";

// ---------------------------------------------------------------------------
// Seeded RNG (deterministic output)
// ---------------------------------------------------------------------------

export class SeededRandom {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed % 2147483647;
    if (this.seed <= 0) this.seed += 2147483646;
  }
  next(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  float(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }
  /** true with probability p */
  chance(p: number): boolean {
    return this.next() < p;
  }
  /** Weighted pick: items[i] is chosen with probability weights[i] / sum(weights). */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }
  hex(length: number): string {
    let out = "";
    for (let i = 0; i < length; i++) out += "0123456789abcdef"[this.int(0, 15)];
    return out;
  }
  base62(length: number): string {
    const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    let out = "";
    for (let i = 0; i < length; i++) out += alphabet[this.int(0, alphabet.length - 1)];
    return out;
  }
  /** RFC 4122 version-4 UUID built from the seeded stream. */
  uuid4(): string {
    const h = this.hex(32).split("");
    h[12] = "4";
    h[16] = "89ab"[this.int(0, 3)];
    const s = h.join("");
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
  }
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/**
 * Seeded config / singleton rows are stamped with this value in the last three
 * digits of their created_at microseconds (e.g. "...14:03:11.123471+00").
 * It is invisible in the UI (timestamps render to the second at most) and lets
 * deleteAiGatewayDemoData tell seeded rows apart from real gateway config that
 * happens to share a name or slug. Rows written by the gateway use NOW(), which
 * matches the marker by chance only 1 in 1000 times, and every delete also
 * requires the seeded name/slug to match.
 */
export const DEMO_MICROS_MARKER = 471;

/** SQL predicate: `<column>` carries the demo micro-second marker. */
export function markerPredicate(column: string): string {
  return `(EXTRACT(MICROSECONDS FROM ${column})::bigint % 1000) = ${DEMO_MICROS_MARKER}`;
}

/** ISO timestamp carrying the demo marker in its microseconds. */
export function markedTs(date: Date): string {
  const iso = date.toISOString(); // 2026-09-22T14:03:11.123Z
  return `${iso.slice(0, 23)}${String(DEMO_MICROS_MARKER).padStart(3, "0")}+00:00`;
}

/** Python `datetime.now(timezone.utc).isoformat()` format with microseconds. */
export function pythonIso(date: Date, micros: number): string {
  const iso = date.toISOString();
  return `${iso.slice(0, 23)}${String(micros % 1000).padStart(3, "0")}+00:00`;
}

// ---------------------------------------------------------------------------
// Hashing / canonical JSON
// ---------------------------------------------------------------------------

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

/** Escape non-ASCII characters the way Python's json.dumps(ensure_ascii=True) does. */
function asciiEscape(json: string): string {
  return json.replace(
    /[\u0080-\uffff]/g,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/**
 * Python `json.dumps(value, sort_keys=True, separators=(",", ":"))` — the
 * canonical encoding the gateway hashes approval arguments with.
 */
export function canonicalJsonCompact(value: unknown): string {
  return asciiEscape(JSON.stringify(sortKeysDeep(value)));
}

/**
 * Python `json.dumps(value, sort_keys=True, ensure_ascii=True)` with the default
 * ", " / ": " separators — the encoding the response cache hashes prompts with.
 */
export function canonicalJsonPython(value: unknown): string {
  const encode = (v: unknown): string => {
    if (Array.isArray(v)) return `[${v.map(encode).join(", ")}]`;
    if (v && typeof v === "object") {
      const keys = Object.keys(v as Record<string, unknown>).sort();
      return `{${keys
        .map((k) => `${JSON.stringify(k)}: ${encode((v as Record<string, unknown>)[k])}`)
        .join(", ")}}`;
    }
    return JSON.stringify(v === undefined ? null : v);
  };
  return asciiEscape(encode(value));
}

// ---------------------------------------------------------------------------
// Postgres literal helpers
// ---------------------------------------------------------------------------

/** Postgres int[] literal, e.g. {1,2,3}. */
export function pgIntArray(values: number[]): string {
  return `{${values.join(",")}}`;
}

/** Postgres text[] literal with every element quoted. */
export function pgTextArray(values: string[]): string {
  return `{${values.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

/** True when every listed table exists (to_regclass guard per module). */
export async function tablesExist(tables: string[], transaction: Transaction): Promise<boolean> {
  const checks = tables.map((t, i) => `to_regclass('${t}') AS t${i}`).join(", ");
  const result = await sequelize.query<Record<string, string | null>>(`SELECT ${checks}`, {
    type: QueryTypes.SELECT,
    transaction,
  });
  const row = result[0] ?? {};
  return tables.every((_, i) => !!row[`t${i}`]);
}

const BATCH_SIZE = 500;

/** Columns that exist on a table (older gateway schemas lack some newer columns). */
async function tableColumns(table: string, transaction: Transaction): Promise<Set<string>> {
  const rows = await sequelize.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = $1`,
    { bind: [table], type: QueryTypes.SELECT, transaction },
  );
  return new Set(rows.map((r) => r.column_name));
}

/**
 * Multi-row INSERT in batches of ~500 rows per statement, using positional
 * bind parameters. Columns missing from the live table (older migrations) are
 * dropped. `casts` optionally maps a column to a SQL cast suffix (e.g.
 * "::jsonb"); `onConflict` is appended verbatim (e.g. "ON CONFLICT DO
 * NOTHING"). Returns the RETURNING rows, in insertion order, when `returning`
 * is given.
 */
export async function batchInsert<R extends object = Record<string, unknown>>(
  table: string,
  columns: string[],
  rows: unknown[][],
  transaction: Transaction,
  options: { returning?: string; casts?: Record<string, string>; onConflict?: string } = {},
): Promise<R[]> {
  const out: R[] = [];
  if (rows.length === 0) return out;
  const available = await tableColumns(table, transaction);
  const keep = columns.map((c) => available.has(c));
  const cols = columns.filter((_, i) => keep[i]);
  const casts = options.casts ?? {};
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const chunk = rows.slice(start, start + BATCH_SIZE);
    const bind: unknown[] = [];
    const tuples = chunk.map((row) => {
      const placeholders: string[] = [];
      row.forEach((value, i) => {
        if (!keep[i]) return;
        bind.push(value === undefined ? null : value);
        placeholders.push(`$${bind.length}${casts[columns[i]] ?? ""}`);
      });
      return `(${placeholders.join(", ")})`;
    });
    const sql =
      `INSERT INTO ${table} (${cols.join(", ")}) VALUES ${tuples.join(", ")}` +
      (options.onConflict ? ` ${options.onConflict}` : "") +
      (options.returning ? ` RETURNING ${options.returning}` : "");
    if (options.returning) {
      const result = await sequelize.query<R>(sql, { bind, type: QueryTypes.SELECT, transaction });
      out.push(...result);
    } else {
      await sequelize.query(sql, { bind, transaction });
    }
  }
  return out;
}

/** Round a USD amount to the 8-decimal precision the gateway stores. */
export function usd(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}
