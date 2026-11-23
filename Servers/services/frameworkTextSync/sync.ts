/**
 * Keeps the text of the bundled frameworks (Servers/structures) in step with
 * the registry, so a wording fix ships with the code instead of needing its
 * own data migration.
 *
 * The seed migrations copied each framework's item text into its struct
 * tables once, and the app reads the text from there. On startup this reads
 * every bundled framework's struct rows, plans the changes (./plan.ts) and
 * rewrites only the text columns that differ. Row ids are untouched, so
 * implementation rows, statuses, evidence and progress stay attached.
 *
 * - A framework whose items no longer line up with the registry (added,
 *   removed or renumbered) is skipped with a warning: that change still needs
 *   a migration.
 * - A framework whose tables do not exist yet (migrations not run) is skipped.
 * - Each framework is written in its own transaction under an advisory lock,
 *   so several backend instances starting together take turns; the later one
 *   finds nothing left to write.
 * - Text only moves forward: each framework's textRevision (structures/types)
 *   is recorded in framework_text_revisions, and a build with a lower revision
 *   than the database's (a rollback, an old instance restarting during a
 *   rolling update) leaves the text alone.
 * - Errors are logged and never stop the server.
 *
 * Struct tables hold no organization data (no organization_id), so one write
 * covers every organization.
 */
import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../../database/db";
import { FRAMEWORK_STRUCTURES } from "../../structures";
import type { FrameworkStructure } from "../../structures/types";
import { pgTextArray } from "../../utils/pgArray.utils";
import { planFrameworkTextSync, StructLevel, StructRow, TextUpdate, textRevisionOf } from "./plan";

/** First key of the two-key advisory lock; the second is the framework id. */
export const LOCK_NAMESPACE = 7152023;

export interface FrameworkTextSyncResult {
  key: string;
  updated: number;
  skipped?: string;
  /**
   * How the skip is logged: "warn" needs someone's attention (the items no
   * longer line up), "info" is expected (an older build, tables not migrated
   * yet), "none" is routine (never seeded here).
   */
  notice?: "warn" | "info" | "none";
}

async function tableExists(table: string, transaction: Transaction): Promise<boolean> {
  const rows = (await sequelize.query(`SELECT to_regclass(:name) AS t`, {
    replacements: { name: table },
    type: QueryTypes.SELECT,
    transaction,
  })) as Array<{ t: string | null }>;
  return !!rows[0]?.t;
}

async function readRows(fw: FrameworkStructure, transaction: Transaction) {
  const { tables, cols } = fw;
  const select = (sql: string, replacements: Record<string, unknown>) =>
    sequelize.query(sql, { replacements, type: QueryTypes.SELECT, transaction }) as Promise<
      StructRow[]
    >;

  const l1 = await select(
    `SELECT id, NULL::int AS parent_id, order_no, title, description
       FROM ${tables.l1_struct}
      WHERE framework_id = :frameworkId`,
    { frameworkId: fw.id },
  );
  const l1Ids = l1.map((r) => r.id);
  const l2 = l1Ids.length
    ? await select(
        `SELECT id, ${cols.l2_struct_parent} AS parent_id, order_no, title, description,
                summary, questions, evidence_examples
           FROM ${tables.l2_struct}
          WHERE ${cols.l2_struct_parent} IN (:parents)`,
        { parents: l1Ids },
      )
    : [];
  let l3: StructRow[] | undefined;
  if (tables.l3_struct && cols.l3_struct_parent) {
    const l2Ids = l2.map((r) => r.id);
    l3 = l2Ids.length
      ? await select(
          `SELECT id, ${cols.l3_struct_parent} AS parent_id, order_no, title, description,
                  summary, questions, evidence_examples
             FROM ${tables.l3_struct}
            WHERE ${cols.l3_struct_parent} IN (:parents)`,
          { parents: l2Ids },
        )
      : [];
  }
  return { l1, l2, l3 };
}

function tableFor(fw: FrameworkStructure, level: StructLevel): string {
  if (level === "l1") return fw.tables.l1_struct;
  if (level === "l2") return fw.tables.l2_struct;
  return fw.tables.l3_struct!;
}

async function applyUpdate(fw: FrameworkStructure, update: TextUpdate, transaction: Transaction) {
  const sets: string[] = [];
  const replacements: Record<string, unknown> = { id: update.id };
  for (const [column, value] of Object.entries(update.values)) {
    if (column === "questions" || column === "evidence_examples") {
      sets.push(`${column} = CAST(:${column} AS TEXT[])`);
      replacements[column] = pgTextArray(value as string[]);
    } else {
      sets.push(`${column} = :${column}`);
      replacements[column] = value;
    }
  }
  await sequelize.query(
    `UPDATE ${tableFor(fw, update.level)} SET ${sets.join(", ")} WHERE id = :id`,
    { replacements, transaction },
  );
}

async function storedRevision(frameworkId: number, transaction: Transaction): Promise<number> {
  const rows = (await sequelize.query(
    `SELECT revision FROM framework_text_revisions WHERE framework_id = :frameworkId`,
    { replacements: { frameworkId }, type: QueryTypes.SELECT, transaction },
  )) as Array<{ revision: number }>;
  return rows[0]?.revision ?? 0;
}

async function recordRevision(frameworkId: number, revision: number, transaction: Transaction) {
  await sequelize.query(
    `INSERT INTO framework_text_revisions (framework_id, revision, updated_at)
     VALUES (:frameworkId, :revision, NOW())
     ON CONFLICT (framework_id) DO UPDATE
       SET revision = EXCLUDED.revision, updated_at = NOW()
     WHERE framework_text_revisions.revision < EXCLUDED.revision`,
    { replacements: { frameworkId, revision }, transaction },
  );
}

async function syncOne(fw: FrameworkStructure): Promise<FrameworkTextSyncResult> {
  const skip = (skipped: string, notice: FrameworkTextSyncResult["notice"]) => ({
    key: fw.key,
    updated: 0,
    skipped,
    notice,
  });
  return sequelize.transaction(async (transaction) => {
    // Wait for an instance already syncing this framework rather than skip
    // it: if that one fails and rolls back, this one still does the work, and
    // after a success it finds nothing left to write.
    await sequelize.query(`SELECT pg_advisory_xact_lock(:ns, :id)`, {
      replacements: { ns: LOCK_NAMESPACE, id: fw.id },
      transaction,
    });

    const needed = [
      fw.tables.l1_struct,
      fw.tables.l2_struct,
      fw.tables.l3_struct,
      "framework_text_revisions",
    ].filter((t): t is string => !!t);
    for (const table of needed) {
      if (!(await tableExists(table, transaction))) {
        return skip(`table ${table} does not exist yet`, "info");
      }
    }

    // An older build (a rollback, or an old instance restarting during a
    // rolling update) must not restore older wording.
    const revision = textRevisionOf(fw);
    const stored = await storedRevision(fw.id, transaction);
    if (revision < stored) {
      return skip(`the database holds text revision ${stored}, this build ${revision}`, "info");
    }

    const rows = await readRows(fw, transaction);
    // A framework this database never seeded has no rows; nothing to sync.
    if (!rows.l1.length) return skip("not seeded in this database", "none");

    const plan = planFrameworkTextSync(fw.seed, rows);
    if ("skip" in plan) return skip(plan.skip, "warn");

    for (const update of plan.updates) await applyUpdate(fw, update, transaction);
    await recordRevision(fw.id, revision, transaction);
    return { key: fw.key, updated: plan.updates.length };
  });
}

/**
 * Syncs every bundled framework. One framework's failure is reported and does
 * not stop the others.
 */
export async function syncBundledFrameworkText(
  log: { info: (m: string) => void; warn: (m: string) => void },
  frameworks: FrameworkStructure[] = FRAMEWORK_STRUCTURES,
): Promise<FrameworkTextSyncResult[]> {
  const results: FrameworkTextSyncResult[] = [];
  for (const fw of frameworks) {
    try {
      const result = await syncOne(fw);
      results.push(result);
      if (result.updated) {
        log.info(
          `[framework-text-sync] ${fw.key}: updated ${result.updated} item(s) from the registry`,
        );
      } else if (result.skipped && result.notice === "warn") {
        log.warn(`[framework-text-sync] ${fw.key}: skipped, ${result.skipped}`);
      } else if (result.skipped && result.notice === "info") {
        log.info(`[framework-text-sync] ${fw.key}: skipped, ${result.skipped}`);
      }
    } catch (error) {
      const message = (error as Error)?.message ?? String(error);
      results.push({ key: fw.key, updated: 0, skipped: `error: ${message}`, notice: "warn" });
      log.warn(`[framework-text-sync] ${fw.key}: failed, ${message}`);
    }
  }
  return results;
}
