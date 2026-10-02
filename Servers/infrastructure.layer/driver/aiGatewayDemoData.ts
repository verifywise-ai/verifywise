/**
 * AI Gateway demo data for the autoDriver.
 *
 * Seeds every AI Gateway area for a demo organization with data shaped exactly
 * like what the gateway (FastAPI service, same `verifywise` database) writes:
 *
 *   - config: provider API keys, endpoints, virtual keys (catalog.ts)
 *   - 90 days of traffic in ai_gateway_spend_logs with adoption growth,
 *     weekday/business-hours shape, a provider outage with fallback and a
 *     cost-anomaly day; the response cache (traffic.ts)
 *   - LLM guardrail rules, settings and detection logs (guardrails.ts)
 *   - prompt library with versions, labels and test datasets (prompts.ts)
 *   - Agent Control: MCP servers/tools, agent keys, tool rules, approvals and
 *     30 days of tool-call audit linked to model calls by run id (agentControl.ts)
 *   - budget, virtual-key counters, risk settings and risk suggestions computed
 *     from the inserted traffic (risk.ts)
 *
 * Gateway tables have no FK to projects; the demo ties to the autoDriver's use
 * cases by naming (coding assistant, recommendation engine, demand
 * forecasting, recruitment screening, plus a support chatbot).
 *
 * It participates in the autoDriver transaction and follows the insert/delete
 * + existence-guard + idempotency conventions of shadowAiDemoData.ts. Seeded
 * config rows are recognised on delete by name/slug plus a microsecond marker
 * on their timestamps (see DEMO_MICROS_MARKER), so an org's real gateway
 * configuration is never touched.
 */

import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../../database/db";
import { markerPredicate, SeededRandom, tablesExist } from "./aiGatewayDemo/common";
import {
  API_KEYS,
  ENDPOINT_SLUGS,
  insertCatalog,
  VIRTUAL_KEY_NAMES,
} from "./aiGatewayDemo/catalog";
import { generateTraffic, insertCache, insertSpendLogs } from "./aiGatewayDemo/traffic";
import {
  GUARDRAIL_NAMES,
  GUARDRAIL_SETTINGS,
  insertGuardrailLogs,
  insertGuardrails,
  insertGuardrailSettings,
} from "./aiGatewayDemo/guardrails";
import { deletePrompts, insertPrompts, PROMPT_SLUGS } from "./aiGatewayDemo/prompts";
import {
  deleteAgentControl,
  insertAgentControl,
  MCP_SERVER_SLUGS,
  MCP_SERVERS,
  planAgentRuns,
} from "./aiGatewayDemo/agentControl";
import {
  applySpendCounters,
  insertRiskSettings,
  insertRiskSuggestions,
  RISK_CONDITIONS,
  RISK_CONDITION_IDS,
} from "./aiGatewayDemo/risk";

// ---------------------------------------------------------------------------
// Module table sets (each module is skipped if its migration has not run)
// ---------------------------------------------------------------------------

const CORE_TABLES = [
  "ai_gateway_api_keys",
  "ai_gateway_endpoints",
  "ai_gateway_virtual_keys",
  "ai_gateway_spend_logs",
];
const GUARDRAIL_TABLES = [
  "ai_gateway_guardrails",
  "ai_gateway_guardrail_logs",
  "ai_gateway_guardrail_settings",
];
const CACHE_TABLES = ["ai_gateway_cache"];
const BUDGET_TABLES = ["ai_gateway_budgets"];
const RISK_TABLES = ["ai_gateway_risk_settings", "ai_gateway_risk_suggestions"];
const PROMPT_TABLES = [
  "ai_gateway_prompts",
  "ai_gateway_prompt_versions",
  "ai_gateway_prompt_labels",
  "ai_gateway_prompt_test_datasets",
];
const MCP_TABLES = [
  "ai_gateway_mcp_servers",
  "ai_gateway_mcp_tools",
  "ai_gateway_mcp_agent_keys",
  "ai_gateway_mcp_guardrail_rules",
  "ai_gateway_mcp_approval_requests",
  "ai_gateway_mcp_audit_logs",
];

async function countWhere(sql: string, bind: unknown[], transaction: Transaction): Promise<number> {
  const rows = await sequelize.query<{ count: string }>(sql, {
    bind,
    type: QueryTypes.SELECT,
    transaction,
  });
  return parseInt(rows[0]?.count ?? "0", 10);
}

// ---------------------------------------------------------------------------
// INSERT
// ---------------------------------------------------------------------------

export async function insertAiGatewayDemoData(
  organizationId: number,
  userId: number,
  transaction: Transaction,
): Promise<void> {
  // Gracefully skip if the AI Gateway tables don't exist (Alembic not run).
  if (!(await tablesExist(CORE_TABLES, transaction))) {
    return;
  }

  // Idempotent: skip when the demo endpoints are already there. Also skip if
  // the org owns a real endpoint with one of the demo slugs (unique per org).
  const existing = await countWhere(
    `SELECT COUNT(*)::text AS count FROM ai_gateway_endpoints
     WHERE organization_id = $1 AND slug = ANY($2::text[])`,
    [organizationId, ENDPOINT_SLUGS],
    transaction,
  );
  if (existing > 0) {
    return;
  }

  const rng = new SeededRandom(1337 + organizationId);
  const now = new Date();

  const hasGuardrails = await tablesExist(GUARDRAIL_TABLES, transaction);
  const hasCache = await tablesExist(CACHE_TABLES, transaction);
  const hasBudgets = await tablesExist(BUDGET_TABLES, transaction);
  const hasRisk = await tablesExist(RISK_TABLES, transaction);
  let hasPrompts = await tablesExist(PROMPT_TABLES, transaction);
  let hasMcp = await tablesExist(MCP_TABLES, transaction);

  // Slugs / tool names must not collide with the org's own config.
  if (hasPrompts) {
    hasPrompts =
      (await countWhere(
        `SELECT COUNT(*)::text AS count FROM ai_gateway_prompts
         WHERE organization_id = $1 AND slug = ANY($2::text[])`,
        [organizationId, PROMPT_SLUGS],
        transaction,
      )) === 0;
  }
  if (hasMcp) {
    const toolNames = MCP_SERVERS.flatMap((s) => s.tools.map((t) => t.tool_name));
    hasMcp =
      (await countWhere(
        `SELECT COUNT(*)::text AS count FROM (
           SELECT id FROM ai_gateway_mcp_servers WHERE organization_id = $1 AND slug = ANY($2::text[])
           UNION ALL
           SELECT id FROM ai_gateway_mcp_tools WHERE organization_id = $1 AND tool_name = ANY($3::text[])
         ) x`,
        [organizationId, MCP_SERVER_SLUGS, toolNames],
        transaction,
      )) === 0;
  }

  // ---- Config ----
  const promptIdBySlug = hasPrompts
    ? await insertPrompts(organizationId, userId, now, rng, transaction)
    : new Map<string, number>();
  const { endpointIdBySlug, virtualKeyIdByName } = await insertCatalog(
    organizationId,
    userId,
    now,
    rng,
    promptIdBySlug,
    transaction,
  );
  const guardrailIdByName = hasGuardrails
    ? await insertGuardrails(organizationId, userId, now, rng, transaction)
    : new Map<string, number>();
  if (hasGuardrails) {
    await insertGuardrailSettings(organizationId, now, transaction);
  }

  // ---- Traffic (generated in memory, then inserted) ----
  const traffic = generateTraffic(rng, now);
  const agentPlan = hasMcp ? planAgentRuns(rng, now) : null;
  const spend = agentPlan
    ? traffic.spend
        .concat(agentPlan.modelCalls)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    : traffic.spend;

  await insertSpendLogs(
    organizationId,
    userId,
    spend,
    endpointIdBySlug,
    virtualKeyIdByName,
    transaction,
  );
  if (hasGuardrails) {
    await insertGuardrailLogs(
      organizationId,
      traffic.guardrailLogs,
      guardrailIdByName,
      endpointIdBySlug,
      transaction,
    );
  }
  if (hasCache) {
    await insertCache(organizationId, traffic.cache, endpointIdBySlug, transaction);
  }
  if (agentPlan) {
    await insertAgentControl(organizationId, userId, now, rng, agentPlan, transaction);
  }

  // ---- Counters, budget, risk ----
  const budget = hasBudgets
    ? await applySpendCounters(organizationId, now, spend, virtualKeyIdByName, transaction)
    : null;
  if (hasRisk) {
    await insertRiskSettings(organizationId, now, transaction);
    await insertRiskSuggestions(
      organizationId,
      userId,
      now,
      spend,
      hasGuardrails ? traffic.guardrailLogs : [],
      budget,
      endpointIdBySlug,
      virtualKeyIdByName,
      transaction,
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

/**
 * Removes only what insertAiGatewayDemoData created. Config rows are matched
 * by their seeded name/slug AND the demo timestamp marker; logs are matched
 * through the seeded endpoints, virtual keys and guardrails. Singletons are
 * removed only while they still hold the seeded values.
 */
export async function deleteAiGatewayDemoData(
  organizationId: number,
  transaction: Transaction,
): Promise<void> {
  if (!(await tablesExist(CORE_TABLES, transaction))) {
    return;
  }
  const marker = markerPredicate;
  const run = (sql: string, bind: unknown[]) => sequelize.query(sql, { bind, transaction });

  const endpointIds = `SELECT id FROM ai_gateway_endpoints
     WHERE organization_id = $1 AND slug = ANY($2::text[]) AND ${marker("created_at")}`;
  const vkIds = `SELECT id FROM ai_gateway_virtual_keys
     WHERE organization_id = $1 AND name = ANY($3::text[]) AND ${marker("created_at")}`;
  const coreBind = [organizationId, ENDPOINT_SLUGS, VIRTUAL_KEY_NAMES];

  // Agent Control first (its audit rows reference agent keys and servers).
  if (await tablesExist(MCP_TABLES, transaction)) {
    await deleteAgentControl(organizationId, transaction, marker);
  }

  if (await tablesExist(RISK_TABLES, transaction)) {
    await run(
      `DELETE FROM ai_gateway_risk_suggestions
       WHERE organization_id = $1 AND condition_id = ANY($2::text[]) AND ${marker("created_at")}`,
      [organizationId, RISK_CONDITION_IDS],
    );
    for (const c of RISK_CONDITIONS) {
      await run(
        `DELETE FROM ai_gateway_risk_settings
         WHERE organization_id = $1 AND condition_id = $2 AND ${marker("updated_at")}
           AND is_enabled = TRUE AND severity_override IS NULL AND threshold = $3::jsonb`,
        [organizationId, c.condition_id, JSON.stringify(c.threshold)],
      );
    }
  }

  if (await tablesExist(BUDGET_TABLES, transaction)) {
    await run(
      `DELETE FROM ai_gateway_budgets
       WHERE organization_id = $1 AND ${marker("created_at")}
         AND alert_threshold_pct = 80 AND is_hard_limit = FALSE
         AND alert_email_enabled = TRUE AND alert_slack_enabled = FALSE`,
      [organizationId],
    );
  }

  const hasGuardrails = await tablesExist(GUARDRAIL_TABLES, transaction);
  const guardrailIds = `SELECT id FROM ai_gateway_guardrails
     WHERE organization_id = $1 AND name = ANY($2::text[]) AND ${marker("created_at")}`;
  if (hasGuardrails) {
    await run(
      `DELETE FROM ai_gateway_guardrail_logs
       WHERE organization_id = $1
         AND (endpoint_id IN (${endpointIds}) OR guardrail_id IN (${guardrailIds.replace("$2", "$3")}))`,
      [organizationId, ENDPOINT_SLUGS, GUARDRAIL_NAMES],
    );
  }
  const hasCache = await tablesExist(CACHE_TABLES, transaction);
  if (hasCache) {
    await run(
      `DELETE FROM ai_gateway_cache WHERE organization_id = $1 AND endpoint_id IN (${endpointIds})`,
      [organizationId, ENDPOINT_SLUGS],
    );
  }

  // Spend logs: everything on a demo endpoint (virtual-key and playground
  // traffic) or through a demo virtual key.
  await run(
    `DELETE FROM ai_gateway_spend_logs
     WHERE organization_id = $1 AND (endpoint_id IN (${endpointIds}) OR virtual_key_id IN (${vkIds}))`,
    coreBind,
  );
  await run(`DELETE FROM ai_gateway_virtual_keys WHERE id IN (${vkIds.replace("$3", "$2")})`, [
    organizationId,
    VIRTUAL_KEY_NAMES,
  ]);
  await run(`DELETE FROM ai_gateway_endpoints WHERE id IN (${endpointIds})`, [
    organizationId,
    ENDPOINT_SLUGS,
  ]);
  await run(
    `DELETE FROM ai_gateway_api_keys
     WHERE organization_id = $1 AND key_name = ANY($2::text[]) AND ${marker("created_at")}
       AND NOT EXISTS (SELECT 1 FROM ai_gateway_endpoints e WHERE e.api_key_id = ai_gateway_api_keys.id)`,
    [organizationId, API_KEYS.map((k) => k.key_name)],
  );

  if (hasGuardrails) {
    await run(`DELETE FROM ai_gateway_guardrails WHERE id IN (${guardrailIds})`, [
      organizationId,
      GUARDRAIL_NAMES,
    ]);
    // The cache_* columns arrived with the cache migration; compare them only when present.
    const s = GUARDRAIL_SETTINGS;
    const cacheColumns = hasCache
      ? `AND cache_global_enabled = $9 AND cache_default_ttl_seconds = $10
         AND cache_max_entries_per_org = $11`
      : "";
    const bind: unknown[] = [
      organizationId,
      s.pii_on_error,
      s.content_filter_on_error,
      s.pii_replacement_format,
      s.content_filter_replacement,
      s.log_retention_days,
      s.log_request_body,
      s.log_response_body,
    ];
    if (hasCache) {
      bind.push(s.cache_global_enabled, s.cache_default_ttl_seconds, s.cache_max_entries_per_org);
    }
    await run(
      `DELETE FROM ai_gateway_guardrail_settings
       WHERE organization_id = $1 AND ${marker("created_at")}
         AND pii_on_error = $2 AND content_filter_on_error = $3
         AND pii_replacement_format = $4 AND content_filter_replacement = $5
         AND log_retention_days = $6 AND log_request_body = $7 AND log_response_body = $8
         ${cacheColumns}`,
      bind,
    );
  }

  // Prompts last: endpoints referenced them (ON DELETE SET NULL) and are gone now.
  if (await tablesExist(PROMPT_TABLES, transaction)) {
    await deletePrompts(organizationId, transaction, marker("created_at"));
  }
}
