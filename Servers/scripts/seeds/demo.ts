/**
 * Demo data CLI for one organization — the same seeder as the UI
 * "Create demo data" button (infrastructure.layer/driver/autoDriver.driver.ts),
 * called directly through the app's sequelize instead of over HTTP.
 *
 * What it seeds (all rows are tagged so --delete can remove exactly them):
 * - Shadow AI demo data (tools, events, rollups, rules, alerts)
 * - AI Gateway demo data (endpoints, 90 days of traffic, guardrails, prompts,
 *   Agent Control, gateway risk)
 * - With --with-use-cases: the governance block too (3 demo use cases with the
 *   EU AI Act, risks, vendors, models, dataset, tasks, trainings, policies, AI
 *   apps, incidents, plus a demo organizational project with ISO 42001 when
 *   the org has none). Skipped if the org already has demo (is_demo) projects,
 *   so it never duplicates. The org's own projects are left alone.
 *
 * Every part is idempotent: running it twice adds nothing the second time.
 *
 * LOCAL / DEMO ONLY. --delete and --reset remove the org's demo rows
 * (is_demo = true and the tagged gateway/Shadow AI rows); never point them at
 * an org whose demo data someone relies on.
 *
 * Usage (from Servers/):
 *   npm run seed:demo -- --org 1                      # gateway + Shadow AI
 *   npm run seed:demo -- --org 1 --with-use-cases     # + demo use cases
 *   npm run seed:demo -- --org 1 --user 2             # seed as a specific user
 *   npm run seed:demo:delete -- --org 7               # remove demo data only
 *   npm run seed:demo:reset -- --org 7 --with-use-cases  # delete, then insert
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import {
  deleteMockData,
  insertMockData,
} from "../../infrastructure.layer/driver/autoDriver.driver";

interface Args {
  org: number;
  user?: number;
  delete: boolean;
  reset: boolean;
  withUseCases: boolean;
}

const USAGE =
  "Usage: npm run seed:demo -- --org <id> [--user <id>] [--with-use-cases] [--delete | --reset]";

// Tables summarized before/after. Tables that do not exist on this database
// (for example AI Gateway tables before its Alembic migrations ran) are skipped.
const SUMMARY_TABLES: Array<{ label: string; table: string; where?: string }> = [
  { label: "demo use cases", table: "projects", where: "is_demo = true" },
  { label: "demo risks", table: "risks", where: "is_demo = true" },
  { label: "demo vendors", table: "vendors", where: "is_demo = true" },
  { label: "demo vendor risks", table: "vendorrisks", where: "is_demo = true" },
  { label: "demo models", table: "model_inventories", where: "is_demo = true" },
  { label: "demo model risks", table: "model_risks", where: "is_demo = true" },
  { label: "demo datasets", table: "datasets", where: "is_demo = true" },
  { label: "demo tasks", table: "tasks", where: "is_demo = true" },
  { label: "demo trainings", table: "trainingregistar", where: "is_demo = true" },
  { label: "demo policies", table: "policy_manager", where: "is_demo = true" },
  { label: "demo AI apps", table: "ai_apps", where: "is_demo = true" },
  { label: "demo incidents", table: "ai_incident_managements", where: "is_demo = true" },
  { label: "Shadow AI tools", table: "shadow_ai_tools" },
  { label: "Shadow AI events", table: "shadow_ai_events" },
  { label: "AI Gateway endpoints", table: "ai_gateway_endpoints" },
  { label: "AI Gateway spend logs", table: "ai_gateway_spend_logs" },
  { label: "Agent Control audit logs", table: "ai_gateway_mcp_audit_logs" },
];

function parseArgs(argv: string[]): Args {
  const args: Args = { org: NaN, delete: false, reset: false, withUseCases: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value.\n${USAGE}`);
      return v;
    };
    if (a === "--org") args.org = Number(next());
    else if (a === "--user") args.user = Number(next());
    else if (a === "--delete") args.delete = true;
    else if (a === "--reset") args.reset = true;
    else if (a === "--with-use-cases") args.withUseCases = true;
    else if (a === "--help" || a === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else throw new Error(`Unknown argument "${a}".\n${USAGE}`);
  }
  if (!Number.isInteger(args.org) || args.org <= 0) {
    throw new Error(`--org <id> is required and must be a positive integer.\n${USAGE}`);
  }
  if (args.user !== undefined && (!Number.isInteger(args.user) || args.user <= 0)) {
    throw new Error(`--user must be a positive integer.\n${USAGE}`);
  }
  if (args.delete && args.reset) throw new Error(`Use --delete or --reset, not both.\n${USAGE}`);
  if (args.delete && args.withUseCases) {
    throw new Error("--with-use-cases has no effect with --delete (delete removes all demo data).");
  }
  return args;
}

async function resolveUser(orgId: number, userId?: number): Promise<number> {
  if (userId !== undefined) {
    const rows = await sequelize.query<{ id: number }>(
      `SELECT id FROM users WHERE id = :userId AND organization_id = :orgId`,
      { replacements: { userId, orgId }, type: QueryTypes.SELECT },
    );
    if (!rows[0]) throw new Error(`User ${userId} does not belong to org ${orgId}.`);
    return userId;
  }
  const admins = await sequelize.query<{ id: number }>(
    `SELECT id FROM users WHERE organization_id = :orgId AND role_id = 1 ORDER BY id LIMIT 1`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  );
  if (!admins[0]) throw new Error(`Org ${orgId} has no Admin user; pass --user <id>.`);
  return admins[0].id;
}

async function countRows(orgId: number): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const { label, table, where } of SUMMARY_TABLES) {
    const [exists] = await sequelize.query<{ t: string | null }>(
      `SELECT to_regclass(:table) AS t`,
      { replacements: { table }, type: QueryTypes.SELECT },
    );
    if (!exists?.t) continue;
    const [row] = await sequelize.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${table}
        WHERE organization_id = :orgId ${where ? `AND ${where}` : ""}`,
      { replacements: { orgId }, type: QueryTypes.SELECT },
    );
    counts.set(label, parseInt(row.count, 10));
  }
  return counts;
}

function printSummary(before: Map<string, number>, after: Map<string, number>) {
  console.log("\nRows for this org (before -> after):");
  for (const [label, was] of before) {
    const now = after.get(label) ?? 0;
    const delta = now - was;
    const sign = delta > 0 ? `+${delta}` : `${delta}`;
    console.log(
      `  ${label.padEnd(26)} ${String(was).padStart(7)} -> ${String(now).padStart(7)}  (${sign})`,
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const [org] = await sequelize.query<{ id: number; name: string }>(
    `SELECT id, name FROM organizations WHERE id = :id`,
    { replacements: { id: args.org }, type: QueryTypes.SELECT },
  );
  if (!org) throw new Error(`Organization ${args.org} does not exist.`);

  const before = await countRows(org.id);

  if (args.delete || args.reset) {
    console.log(`Deleting demo data from org ${org.id} ("${org.name}")...`);
    await deleteMockData(org.id);
  }

  if (!args.delete) {
    const userId = await resolveUser(org.id, args.user);
    console.log(
      `Seeding demo data into org ${org.id} ("${org.name}") as user ${userId}` +
        (args.withUseCases ? " with use cases" : " (gateway + Shadow AI only)") +
        "...",
    );
    await insertMockData(org.id, org.id, userId, { includeGovernance: args.withUseCases });
  }

  printSummary(before, await countRows(org.id));
}

main()
  .then(async () => {
    await sequelize.close();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(`[seed:demo] FAILED: ${err instanceof Error ? err.message : err}`);
    await sequelize.close().catch(() => undefined);
    process.exit(1);
  });
