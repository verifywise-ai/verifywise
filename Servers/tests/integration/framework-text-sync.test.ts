jest.setTimeout(120000);

/**
 * The bundled framework text sync against a migrated database.
 *
 * Right after the migrations, the struct tables hold exactly the registry's
 * text, so a sync must change nothing in any framework: that proves the
 * planner pairs items the way the seed migrations numbered them, for all of
 * them. Then a wording drift is introduced (as a database seeded by an older
 * release would have) and the sync must repair it in place, keeping row ids.
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { FRAMEWORK_STRUCTURES, requireStructureByKey } from "../../structures";
import { FrameworkTextSyncResult, syncFrameworkText } from "../../services/frameworkTextSync/sync";
import { BUILTIN_TEXT_SOURCES } from "../../services/frameworkTextSync/builtins";
import { textRevisionOf } from "../../services/frameworkTextSync/plan";

const fw = requireStructureByKey("osfi-e23");
const L1 = `verifywise.${fw.tables.l1_struct}`;
const L2 = `verifywise.${fw.tables.l2_struct}`;
const PARENT = fw.cols.l2_struct_parent;
const quiet = { info: () => {}, warn: () => {} };
type Log = { info: (m: string) => void; warn: (m: string) => void };
/** Syncs only the given bundled frameworks (OSFI E-23 by default). */
const syncBundled = (log: Log = quiet, frameworks = [fw]) =>
  syncFrameworkText(log, { bundled: frameworks, builtins: [] });

async function firstRows() {
  const [l1] = (await sequelize.query(
    `SELECT id, description FROM ${L1} WHERE framework_id = :id ORDER BY order_no LIMIT 1`,
    { replacements: { id: fw.id }, type: QueryTypes.SELECT },
  )) as Array<{ id: number; description: string | null }>;
  const [l2] = (await sequelize.query(
    `SELECT id, title, questions FROM ${L2} WHERE ${PARENT} = :parent ORDER BY order_no LIMIT 1`,
    { replacements: { parent: l1.id }, type: QueryTypes.SELECT },
  )) as Array<{ id: number; title: string; questions: string[] }>;
  return { l1, l2 };
}

describe("bundled framework text sync", () => {
  afterAll(async () => {
    await sequelize.close();
  });

  // Right after the migrations every framework already holds the code's text,
  // with one known exception on a fresh install: ISO 27001 Annex A controls
  // that 20260420113913 left under the wrong titles (the sync realigns them to
  // their control numbers). NIST MEASURE 2.10–2.13, which the seed could not
  // insert, are added by 20261123170316, so no item in the code lacks a row.
  it("changes nothing right after the migrations except the known ISO 27001 fix", async () => {
    const results = await syncFrameworkText(quiet);
    expect(results).toHaveLength(FRAMEWORK_STRUCTURES.length + BUILTIN_TEXT_SOURCES.length);
    const byKey = new Map(results.map((r) => [r.key, r]));
    const others = results.filter((r) => r.key !== "iso-27001");
    expect(others.filter((r) => r.updated > 0 || r.skipped || r.missing)).toEqual([]);
    const iso27001 = byKey.get("iso-27001") as FrameworkTextSyncResult;
    expect(iso27001.skipped).toBeUndefined();
    expect(iso27001.updated).toBeGreaterThan(0);

    const [a519] = (await sequelize.query(
      `SELECT ac.title FROM annexcontrols_struct_iso27001 ac
         JOIN annexcategories_struct_iso27001 cat ON cat.id = ac.category_id
        WHERE cat.annex_id = 'A.5' AND ac.order_no = 19`,
      { type: QueryTypes.SELECT },
    )) as Array<{ title: string }>;
    expect(a519.title).toBe("Information security in supplier relationships");

    // A second run has nothing left to do anywhere.
    const again = await syncFrameworkText(quiet);
    expect(again.filter((r) => r.updated > 0 || r.skipped)).toEqual([]);
  });

  it("restores drifted text in place and keeps row ids", async () => {
    const before = await firstRows();
    await sequelize.query(`UPDATE ${L1} SET description = 'Old wording' WHERE id = :id`, {
      replacements: { id: before.l1.id },
    });
    await sequelize.query(
      `UPDATE ${L2} SET title = 'Old title', questions = '{"Old question?"}' WHERE id = :id`,
      { replacements: { id: before.l2.id } },
    );

    const results = await syncBundled();
    expect(results).toEqual([{ key: "osfi-e23", updated: 2 }]);

    const after = await firstRows();
    expect(after.l1).toEqual(before.l1);
    expect(after.l2).toEqual(before.l2);

    // A second run has nothing left to do.
    expect(await syncBundled()).toEqual([{ key: "osfi-e23", updated: 0 }]);
  });

  // An extra item means positions no longer identify the same items, so
  // nothing is written and the framework is reported as skipped.
  it("skips a framework whose items no longer line up with the registry", async () => {
    const { l1, l2 } = await firstRows();
    await sequelize.query(`UPDATE ${L2} SET title = 'Old title' WHERE id = :id`, {
      replacements: { id: l2.id },
    });
    const [extra] = (await sequelize.query(
      `INSERT INTO ${L2} (${PARENT}, title, order_no) VALUES (:parent, 'Extra', 999) RETURNING id`,
      { replacements: { parent: l1.id }, type: QueryTypes.SELECT },
    )) as Array<{ id: number }>;
    const warnings: string[] = [];

    try {
      const results = await syncBundled({ info: () => {}, warn: (m: string) => warnings.push(m) });
      expect(results[0]).toMatchObject({ key: "osfi-e23", updated: 0, notice: "warn" });
      expect(results[0].skipped).toContain("the database");
      expect(warnings.join("\n")).toContain("osfi-e23: skipped");
      const [row] = (await sequelize.query(`SELECT title FROM ${L2} WHERE id = :id`, {
        replacements: { id: l2.id },
        type: QueryTypes.SELECT,
      })) as Array<{ title: string }>;
      expect(row.title).toBe("Old title");
    } finally {
      await sequelize.query(`DELETE FROM ${L2} WHERE id = :id`, { replacements: { id: extra.id } });
      await syncBundled();
    }
  });

  it("records each framework's text revision after syncing", async () => {
    await syncFrameworkText(quiet);
    const rows = (await sequelize.query(
      `SELECT framework_id, revision FROM framework_text_revisions`,
      { type: QueryTypes.SELECT },
    )) as Array<{ framework_id: number; revision: number }>;
    const byId = new Map(
      rows.map((r: { framework_id: number; revision: number }) => [r.framework_id, r.revision]),
    );
    for (const each of FRAMEWORK_STRUCTURES) expect(byId.get(each.id)).toBe(textRevisionOf(each));
    for (const each of BUILTIN_TEXT_SOURCES) expect(byId.get(each.id)).toBe(each.textRevision);
  });

  // A rollback, or an old instance restarting during a rolling update, must
  // not write its older wording over the newer text.
  it("leaves the text alone for a build older than the database's revision", async () => {
    const { l2 } = await firstRows();
    await sequelize.query(`UPDATE ${L2} SET title = 'Newer wording' WHERE id = :id`, {
      replacements: { id: l2.id },
    });
    await sequelize.query(
      `UPDATE framework_text_revisions SET revision = 5 WHERE framework_id = :id`,
      { replacements: { id: fw.id } },
    );
    try {
      const [result] = await syncBundled();
      expect(result).toMatchObject({ key: "osfi-e23", updated: 0, notice: "info" });
      expect(result.skipped).toContain("text revision 5, this build 1");
      expect((await firstRows()).l2.title).toBe("Newer wording");

      // A build at or above the stored revision writes its text and records it.
      const newer = { ...fw, textRevision: 6 };
      expect(await syncBundled(quiet, [newer])).toEqual([{ key: "osfi-e23", updated: 1 }]);
      const [stored] = (await sequelize.query(
        `SELECT revision FROM framework_text_revisions WHERE framework_id = :id`,
        { replacements: { id: fw.id }, type: QueryTypes.SELECT },
      )) as Array<{ revision: number }>;
      expect(stored.revision).toBe(6);
    } finally {
      await sequelize.query(
        `UPDATE framework_text_revisions SET revision = :revision WHERE framework_id = :id`,
        { replacements: { id: fw.id, revision: textRevisionOf(fw) } },
      );
      await syncBundled();
    }
  });

  // Several backend instances start together: they take turns on the lock,
  // the drift is fixed once, and neither fails.
  it("lets instances starting together take turns", async () => {
    const { l2 } = await firstRows();
    await sequelize.query(`UPDATE ${L2} SET title = 'Old title' WHERE id = :id`, {
      replacements: { id: l2.id },
    });
    const [a, b] = await Promise.all([syncBundled(), syncBundled()]);
    expect(a[0].updated + b[0].updated).toBe(1);
    expect([a[0].skipped, b[0].skipped]).toEqual([undefined, undefined]);
  });
});
