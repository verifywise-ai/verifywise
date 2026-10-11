jest.setTimeout(60000);

/**
 * The indexes behind the foreign keys of the research tables.
 *
 * Postgres runs the action of a foreign key (CASCADE, SET NULL) once for each deleted parent row,
 * and without an index on the child column each of those runs scans the whole table. The tables
 * hold the runs and findings of every tenant, so deleting a vendor, a vendor risk or an
 * organization would cost time in proportion to everybody's rows, not only the deleting tenant's.
 *
 * The test database is migrated by the global setup before any file runs, so this reads the
 * indexes the migrations left.
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";

afterAll(async () => {
  // Each test file has its own sequelize instance; do not leave its connections open.
  await sequelize.close();
});

/** The index definitions of a table of the verifywise schema, by index name. */
const indexesOf = async (table: string): Promise<Record<string, string>> => {
  const rows = (await sequelize.query(
    `SELECT indexname, indexdef FROM pg_indexes
     WHERE schemaname = 'verifywise' AND tablename = :table`,
    { replacements: { table }, type: QueryTypes.SELECT },
  )) as Array<{ indexname: string; indexdef: string }>;
  return Object.fromEntries(rows.map((row) => [row.indexname, row.indexdef]));
};

describe("indexes of vendor_risk_findings", () => {
  it("has one behind the run, the vendor and the accepted vendor risk", async () => {
    const indexes = await indexesOf("vendor_risk_findings");

    expect(indexes.idx_vendor_risk_findings_run).toContain("USING btree (run_id)");
    expect(indexes.idx_vendor_risk_findings_vendor).toContain("USING btree (vendor_id)");
    // Most findings are never accepted, so only the rows that point at a risk are indexed. The
    // equality lookup of the SET NULL action implies the predicate, so the index serves it.
    expect(indexes.idx_vendor_risk_findings_accepted_risk).toContain(
      "USING btree (accepted_vendor_risk_id) WHERE (accepted_vendor_risk_id IS NOT NULL)",
    );
  });

  it("keeps the indexes of the first migration", async () => {
    const indexes = await indexesOf("vendor_risk_findings");

    expect(Object.keys(indexes)).toEqual(
      expect.arrayContaining([
        "idx_vendor_risk_findings_org_status_created",
        "idx_vendor_risk_findings_org_vendor",
      ]),
    );
  });
});

describe("indexes of vendor_research_runs", () => {
  // The indexes of the first migration all lead with organization_id, so the delete of the runs of
  // a vendor (the cascade from a deleted vendor) cannot use any of them.
  it("has one that leads with vendor_id, behind the cascade from a deleted vendor", async () => {
    const indexes = await indexesOf("vendor_research_runs");

    expect(indexes.idx_vendor_research_runs_vendor).toContain("USING btree (vendor_id)");
    // A plain index: the cascade deletes the runs of every status.
    expect(indexes.idx_vendor_research_runs_vendor).not.toContain("WHERE");
    expect(indexes.idx_vendor_research_runs_vendor).not.toContain("UNIQUE");
  });

  it("keeps the three indexes of the first migration", async () => {
    const indexes = await indexesOf("vendor_research_runs");

    expect(Object.keys(indexes)).toEqual(
      expect.arrayContaining([
        "vendor_research_runs_active_uniq",
        "idx_vendor_research_runs_vendor_created",
        "idx_vendor_research_runs_org_created",
      ]),
    );
    // The one that keeps the rule of one active run for each vendor.
    expect(indexes.vendor_research_runs_active_uniq).toContain("UNIQUE");
  });
});
