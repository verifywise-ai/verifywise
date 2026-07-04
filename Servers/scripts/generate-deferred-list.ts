import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import { getRegisteredTenantTables } from "../tests/integration/tenant-isolation/tenantIsolation.registry";
import * as fs from "fs";
import * as path from "path";

const sharedTableNames = new Set([
  "organizations",
  "roles",
  "frameworks",
  "subscription_history",
  "subscriptions",
  "tiers",
]);

function isStructTable(name: string): boolean {
  return /_struct_/.test(name);
}

async function main(): Promise<void> {
  const rows = await sequelize.query<{ table_name: string }>(
    `
    SELECT DISTINCT table_name
    FROM information_schema.columns
    WHERE table_schema = 'verifywise'
      AND column_name = 'organization_id'
    ORDER BY table_name
    `,
    { type: QueryTypes.SELECT },
  );

  const registryTables = new Set(getRegisteredTenantTables());
  const uncovered = rows
    .map((r) => r.table_name)
    .filter((t) => !registryTables.has(t) && !sharedTableNames.has(t) && !isStructTable(t));

  const lines = uncovered.map(
    (t) =>
      `  { name: "${t}", justification: "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4." },`,
  );

  fs.writeFileSync(path.join(__dirname, "deferred-tables-entries.txt"), lines.join("\n"));
  console.log(`Wrote ${lines.length} deferred table entries`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
