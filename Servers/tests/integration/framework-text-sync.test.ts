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
import { requireStructureByKey } from "../../structures";
import { syncBundledFrameworkText } from "../../services/frameworkTextSync/sync";

const fw = requireStructureByKey("osfi-e23");
const L1 = `verifywise.${fw.tables.l1_struct}`;
const L2 = `verifywise.${fw.tables.l2_struct}`;
const PARENT = fw.cols.l2_struct_parent;
const quiet = { info: () => {}, warn: () => {} };

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

  it("changes nothing in any framework right after the migrations", async () => {
    const results = await syncBundledFrameworkText(quiet);
    const problems = results.filter((r) => r.updated > 0 || r.skipped);
    expect(problems).toEqual([]);
    expect(results).toHaveLength(24);
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

    const results = await syncBundledFrameworkText(quiet, [fw]);
    expect(results).toEqual([{ key: "osfi-e23", updated: 2 }]);

    const after = await firstRows();
    expect(after.l1).toEqual(before.l1);
    expect(after.l2).toEqual(before.l2);

    // A second run has nothing left to do.
    expect(await syncBundledFrameworkText(quiet, [fw])).toEqual([{ key: "osfi-e23", updated: 0 }]);
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
      const results = await syncBundledFrameworkText(
        { info: () => {}, warn: (m) => warnings.push(m) },
        [fw],
      );
      expect(results[0]).toMatchObject({ key: "osfi-e23", updated: 0 });
      expect(results[0].skipped).toContain("the database");
      expect(warnings.join("\n")).toContain("osfi-e23: skipped");
      const [row] = (await sequelize.query(`SELECT title FROM ${L2} WHERE id = :id`, {
        replacements: { id: l2.id },
        type: QueryTypes.SELECT,
      })) as Array<{ title: string }>;
      expect(row.title).toBe("Old title");
    } finally {
      await sequelize.query(`DELETE FROM ${L2} WHERE id = :id`, { replacements: { id: extra.id } });
      await syncBundledFrameworkText(quiet, [fw]);
    }
  });

  // Several backend instances start together; the one that finds the
  // framework's lock held leaves it to the holder.
  it("leaves a framework to the instance already syncing it", async () => {
    await sequelize.transaction(async (transaction) => {
      await sequelize.query(`SELECT pg_advisory_xact_lock(7152023, :id)`, {
        replacements: { id: fw.id },
        transaction,
      });
      const results = await syncBundledFrameworkText(quiet, [fw]);
      expect(results).toEqual([
        { key: "osfi-e23", updated: 0, skipped: "another instance is syncing it" },
      ]);
    });
  });
});
