/**
 * Automation run-history seeder — fills the "History" view of an org's
 * existing automations with 30 days of execution logs.
 *
 * - Uses the org's own automations (no hardcoded ids). If the org has none, it
 *   prints how to create one and exits without writing anything.
 * - Only the "send_email" action exists in automation_actions, so every seeded
 *   run records send_email results (success, partial success across several
 *   recipients, or failure).
 * - Seeded rows carry trigger_data.seeded_by = "demo-seed". Reruns delete only
 *   those rows first, so real execution history is never touched and reruns
 *   don't stack.
 * - Deterministic (seeded RNG per automation id).
 *
 * LOCAL / DEMO ONLY.
 *
 * Usage (from Servers/):
 *   npm run seed:automation-logs -- --org 1
 *   npm run seed:automation-logs -- --org 1 --runs 20   # runs per automation (1-200, default 15)
 *   npm run seed:automation-logs -- --org 1 --clear     # remove seeded rows only
 */

import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../../database/db";

const SEED_TAG = "demo-seed";
const USAGE = "Usage: npm run seed:automation-logs -- --org <id> [--runs <n>] [--clear]";

interface Args {
  org: number;
  runs: number;
  clear: boolean;
}

interface AutomationRow {
  id: number;
  name: string;
  trigger_key: string | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { org: NaN, runs: 15, clear: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--org") args.org = Number(argv[++i]);
    else if (a === "--runs") args.runs = Number(argv[++i]);
    else if (a === "--clear") args.clear = true;
    else if (a === "--help" || a === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else throw new Error(`Unknown argument "${a}".\n${USAGE}`);
  }
  if (!Number.isInteger(args.org) || args.org <= 0) {
    throw new Error(`--org <id> is required and must be a positive integer.\n${USAGE}`);
  }
  if (!Number.isInteger(args.runs) || args.runs < 1 || args.runs > 200) {
    throw new Error(`--runs must be an integer between 1 and 200.\n${USAGE}`);
  }
  return args;
}

/** Small deterministic PRNG (mulberry32) so reruns produce the same history. */
function rng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const RECIPIENT_POOL = [
  "compliance@example.com",
  "security@example.com",
  "ml-team@example.com",
  "governance@example.com",
];

const FAILURES = [
  "SMTP server unavailable",
  "Recipient mailbox full",
  "Email provider rate limit exceeded",
];

/** Human subject line derived from the automation's trigger key. */
function subjectFor(triggerKey: string | null): string {
  if (!triggerKey) return "Automation notification";
  if (triggerKey === "scheduled_report") return "Scheduled compliance report";
  if (triggerKey === "vendor_review_date_approaching") return "Vendor review date approaching";
  const [entity, verb] = triggerKey.split("_");
  const noun = entity.charAt(0).toUpperCase() + entity.slice(1);
  return `${noun} ${verb ?? "changed"}`;
}

function buildRun(automation: AutomationRow, index: number, total: number, rand: () => number) {
  // Spread runs across the last 30 days, oldest first, with some jitter.
  const dayMs = 24 * 60 * 60 * 1000;
  const slot = (30 * dayMs) / total;
  const triggeredAt = new Date(Date.now() - 30 * dayMs + index * slot + rand() * slot * 0.8);
  const subject = subjectFor(automation.trigger_key);
  const roll = rand();
  const recipientCount = 1 + Math.floor(rand() * 3);
  const recipients = RECIPIENT_POOL.slice(0, recipientCount);
  const executedAt = (offsetMs: number) => new Date(triggeredAt.getTime() + offsetMs).toISOString();

  let status: "success" | "partial_success" | "failure";
  let errorMessage: string | null = null;
  let actionResults: Record<string, unknown>[];

  if (roll < 0.7) {
    status = "success";
    actionResults = [
      {
        action_type: "send_email",
        status: "success",
        result_data: { recipients, subject, sent_at: executedAt(400) },
        executed_at: executedAt(400),
      },
    ];
  } else if (roll < 0.88 && recipientCount > 1) {
    status = "partial_success";
    errorMessage = "Some actions failed";
    actionResults = [
      {
        action_type: "send_email",
        status: "success",
        result_data: { recipients: recipients.slice(0, -1), subject, sent_at: executedAt(350) },
        executed_at: executedAt(350),
      },
      {
        action_type: "send_email",
        status: "failure",
        error_message: `${recipients[recipients.length - 1]}: Recipient mailbox full`,
        executed_at: executedAt(900),
      },
    ];
  } else {
    status = "failure";
    const reason = FAILURES[Math.floor(rand() * FAILURES.length)];
    errorMessage = "Failed to send notification email";
    actionResults = [
      {
        action_type: "send_email",
        status: "failure",
        error_message: reason,
        executed_at: executedAt(200),
      },
    ];
  }

  return {
    triggered_at: triggeredAt,
    trigger_data: {
      trigger_type: automation.trigger_key ?? "manual",
      triggered_by: rand() < 0.8 ? "system" : "user",
      seeded_by: SEED_TAG,
    },
    action_results: actionResults,
    status,
    error_message: errorMessage,
    execution_time_ms: 300 + Math.floor(rand() * 2700),
  };
}

async function clearSeeded(orgId: number, transaction?: Transaction): Promise<number> {
  const [, meta] = (await sequelize.query(
    `DELETE FROM automation_execution_logs
      WHERE organization_id = :orgId AND trigger_data->>'seeded_by' = :tag`,
    { replacements: { orgId, tag: SEED_TAG }, transaction },
  )) as [unknown, { rowCount?: number }];
  return meta?.rowCount ?? 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const [org] = await sequelize.query<{ id: number; name: string }>(
    `SELECT id, name FROM organizations WHERE id = :id`,
    { replacements: { id: args.org }, type: QueryTypes.SELECT },
  );
  if (!org) throw new Error(`Organization ${args.org} does not exist.`);

  if (args.clear) {
    const removed = await clearSeeded(org.id);
    console.log(`Removed ${removed} seeded execution log(s) from org ${org.id}.`);
    return;
  }

  const automations = await sequelize.query<AutomationRow>(
    `SELECT a.id, a.name, t.key AS trigger_key
       FROM automations a
       LEFT JOIN automation_triggers t ON t.id = a.trigger_id
      WHERE a.organization_id = :orgId
      ORDER BY a.id`,
    { replacements: { orgId: org.id }, type: QueryTypes.SELECT },
  );
  if (automations.length === 0) {
    console.log(
      `Org ${org.id} ("${org.name}") has no automations, so there is nothing to add history to.\n` +
        "Create one on the Automations page (/automations), then rerun this command.",
    );
    return;
  }

  const transaction = await sequelize.transaction();
  try {
    const replaced = await clearSeeded(org.id, transaction);

    let total = 0;
    for (const automation of automations) {
      const rand = rng(automation.id * 7919);
      const counts = { success: 0, partial_success: 0, failure: 0 };
      for (let i = 0; i < args.runs; i++) {
        const run = buildRun(automation, i, args.runs, rand);
        counts[run.status]++;
        await sequelize.query(
          `INSERT INTO automation_execution_logs
             (organization_id, automation_id, triggered_at, trigger_data, action_results,
              status, error_message, execution_time_ms, created_at)
           VALUES
             (:orgId, :automationId, :triggeredAt, CAST(:triggerData AS jsonb),
              CAST(:actionResults AS jsonb), :status, :errorMessage, :executionTimeMs, :triggeredAt)`,
          {
            replacements: {
              orgId: org.id,
              automationId: automation.id,
              triggeredAt: run.triggered_at,
              triggerData: JSON.stringify(run.trigger_data),
              actionResults: JSON.stringify(run.action_results),
              status: run.status,
              errorMessage: run.error_message,
              executionTimeMs: run.execution_time_ms,
            },
            transaction,
          },
        );
      }
      total += args.runs;
      console.log(
        `  #${automation.id} "${automation.name}": ${args.runs} runs ` +
          `(${counts.success} success, ${counts.partial_success} partial, ${counts.failure} failed)`,
      );
    }
    await transaction.commit();
    console.log(
      `Seeded ${total} execution log(s) across ${automations.length} automation(s) in org ${org.id}` +
        (replaced ? ` (replaced ${replaced} previously seeded).` : "."),
    );
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

main()
  .then(async () => {
    await sequelize.close();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(`[seed:automation-logs] FAILED: ${err instanceof Error ? err.message : err}`);
    await sequelize.close().catch(() => undefined);
    process.exit(1);
  });
