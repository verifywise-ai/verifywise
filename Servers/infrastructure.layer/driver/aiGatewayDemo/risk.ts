/**
 * Budget, virtual-key spend counters, risk-detection settings and risk
 * suggestions — all computed from the traffic that was actually inserted.
 *
 * Suggestion titles, descriptions, evidence shapes, compliance tags and
 * mitigations reproduce the condition evaluators in the gateway
 * (AIGateway/src/services/risk_conditions.py) with the seeded values filled in.
 * Each suggestion is evaluated as of its own created_at.
 */

import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../../../database/db";
import { batchInsert, DAY_MS, HOUR_MS, markedTs, MINUTE_MS, pgTextArray } from "./common";
import { COST_ANOMALY_DAYS_AGO, GuardrailLogRow, OUTAGE_DAYS_AGO, SpendRow } from "./traffic";

export const RISK_CONDITIONS: {
  condition_id: string;
  threshold: Record<string, number>;
}[] = [
  { condition_id: "pii_exposure", threshold: { days: 7, min_count: 1 } },
  { condition_id: "no_guardrails", threshold: {} },
  { condition_id: "budget_exhaustion", threshold: { percent: 80 } },
  { condition_id: "provider_concentration", threshold: { percent: 80 } },
  { condition_id: "error_rate_spike", threshold: { multiplier: 2.0, min_requests: 10 } },
  { condition_id: "cost_anomaly", threshold: { multiplier: 2.0, min_usd: 1.0 } },
  { condition_id: "stale_virtual_key", threshold: { days: 90 } },
  { condition_id: "unused_endpoint", threshold: { days: 30 } },
];

export const RISK_CONDITION_IDS = RISK_CONDITIONS.map((c) => c.condition_id);

/** Python float formatting for the few thresholds rendered in descriptions (2.0 -> "2.0"). */
function pyFloat(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : `${value}`;
}

/** Python serialises float thresholds as 2.0 / 1.0; keep that in the stored JSON. */
function pythonFloats(json: string): string {
  return json.replace(/"(multiplier|min_usd)":(\d+)(?=[,}])/g, '"$1":$2.0');
}

const money = (v: number) => v.toFixed(2);
const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;

function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

// ---------------------------------------------------------------------------
// Budgets and virtual-key counters
// ---------------------------------------------------------------------------

/**
 * Sets each virtual key's current_spend_usd to its successful spend in the
 * current calendar month (the counter resets on the 1st) and creates the org
 * budget if none exists. Returns the budget when this call created it.
 */
export async function applySpendCounters(
  organizationId: number,
  now: Date,
  spend: SpendRow[],
  virtualKeyIdByName: Map<string, number>,
  transaction: Transaction,
): Promise<{ limit: number; monthToDate: number } | null> {
  const monthStart = monthStartUtc(now).getTime();
  const perKey = new Map<string, number>();
  let monthToDate = 0;
  for (const r of spend) {
    if (r.status !== 200 || r.createdAt.getTime() < monthStart) continue;
    monthToDate += r.cost;
    if (r.vkName) perKey.set(r.vkName, (perKey.get(r.vkName) ?? 0) + r.cost);
  }
  for (const [name, id] of virtualKeyIdByName.entries()) {
    await sequelize.query(
      `UPDATE ai_gateway_virtual_keys SET current_spend_usd = $1 WHERE id = $2 AND organization_id = $3`,
      { bind: [round(perKey.get(name) ?? 0, 8), id, organizationId], transaction },
    );
  }

  // Limit sized so month-to-date sits just above the 80% alert threshold.
  const limit = Math.max(25, Math.round(monthToDate / 0.83 / 5) * 5);
  const inserted = await batchInsert<{ id: number }>(
    "ai_gateway_budgets",
    [
      "organization_id",
      "monthly_limit_usd",
      "current_spend_usd",
      "alert_threshold_pct",
      "is_hard_limit",
      "alert_email_enabled",
      "alert_slack_enabled",
      "period_start",
      "created_at",
      "updated_at",
    ],
    [
      [
        organizationId,
        limit,
        round(monthToDate, 8),
        80,
        false,
        true,
        false,
        new Date(monthStart),
        markedTs(new Date(now.getTime() - 85 * DAY_MS)),
        now,
      ],
    ],
    transaction,
    { onConflict: "ON CONFLICT (organization_id) DO NOTHING", returning: "id" },
  );
  return inserted.length > 0 ? { limit, monthToDate } : null;
}

// ---------------------------------------------------------------------------
// Risk settings and suggestions
// ---------------------------------------------------------------------------

export async function insertRiskSettings(
  organizationId: number,
  now: Date,
  transaction: Transaction,
): Promise<void> {
  await batchInsert(
    "ai_gateway_risk_settings",
    [
      "organization_id",
      "condition_id",
      "is_enabled",
      "threshold",
      "severity_override",
      "updated_at",
    ],
    RISK_CONDITIONS.map((c) => [
      organizationId,
      c.condition_id,
      true,
      pythonFloats(JSON.stringify(c.threshold)),
      null,
      markedTs(new Date(now.getTime() - 60 * DAY_MS)),
    ]),
    transaction,
    { onConflict: "ON CONFLICT (organization_id, condition_id) DO NOTHING" },
  );
}

interface Suggestion {
  condition_id: string;
  title: string;
  description: string;
  severity: "high" | "medium" | "low";
  evidence: Record<string, unknown>;
  compliance_tags: string[];
  suggested_mitigation: string;
  status: "pending" | "dismissed";
  dismiss_reason: string | null;
  created_at: Date;
  reviewed_at: Date | null;
}

export async function insertRiskSuggestions(
  organizationId: number,
  userId: number,
  now: Date,
  spend: SpendRow[],
  guardrailLogs: GuardrailLogRow[],
  budget: { limit: number; monthToDate: number } | null,
  endpointIdBySlug: Map<string, number>,
  virtualKeyIdByName: Map<string, number>,
  transaction: Transaction,
): Promise<void> {
  const suggestions: Suggestion[] = [];
  const vkRows = spend.filter((r) => r.vkName !== null);
  const sumCost = (rows: SpendRow[], from: number, to: number) =>
    rows.reduce((acc, r) => {
      const t = r.createdAt.getTime();
      return t >= from && t < to ? acc + r.cost : acc;
    }, 0);

  // ---- pii_exposure (as of a few hours ago) ----
  {
    const at = new Date(now.getTime() - 5 * HOUR_MS);
    const days = 7;
    const piiCount = guardrailLogs.filter(
      (g) =>
        g.guardrailType === "pii" &&
        g.createdAt.getTime() >= at.getTime() - days * DAY_MS &&
        g.createdAt.getTime() < at.getTime(),
    ).length;
    if (piiCount >= 1) {
      suggestions.push({
        condition_id: "pii_exposure",
        title: "PII Exposure Detected in Requests",
        description:
          `${piiCount} PII detection(s) found in guardrail logs over the last ${days} day(s). ` +
          "Sensitive data may be leaking through AI requests.",
        severity: "high",
        evidence: { pii_count: piiCount, days, min_count: 1 },
        compliance_tags: ["GDPR", "HIPAA", "EU AI Act Art. 10"],
        suggested_mitigation:
          "Review guardrail rules for PII detection. " +
          "Enable or tighten PII redaction rules on affected endpoints.",
        status: "pending",
        dismiss_reason: null,
        created_at: at,
        reviewed_at: null,
      });
    }
  }

  // ---- budget_exhaustion (now) ----
  if (budget) {
    const pctUsed = budget.limit > 0 ? (budget.monthToDate / budget.limit) * 100 : 0;
    if (pctUsed >= 80) {
      suggestions.push({
        condition_id: "budget_exhaustion",
        title: "Monthly Budget Nearly Exhausted",
        description:
          `Current month spend is $${money(budget.monthToDate)} ` +
          `(${pctUsed.toFixed(1)}% of $${money(budget.limit)} budget), ` +
          `exceeding the 80% threshold.`,
        severity: "high",
        evidence: {
          total_spend_usd: round(budget.monthToDate, 4),
          budget_usd: round(budget.limit, 4),
          percent_used: round(pctUsed, 2),
          threshold_percent: 80,
        },
        compliance_tags: ["Cost Governance"],
        suggested_mitigation:
          "Review spending by virtual key and endpoint. " +
          "Consider raising the budget, reducing usage, or adding spend limits to virtual keys.",
        status: "pending",
        dismiss_reason: null,
        created_at: new Date(now.getTime() - 50 * MINUTE_MS),
        reviewed_at: null,
      });
    }
  }

  // ---- provider_concentration (30-day virtual-key spend, only when detected) ----
  {
    const at = new Date(now.getTime() - 26 * HOUR_MS);
    const byProvider = new Map<string, number>();
    for (const r of vkRows) {
      const t = r.createdAt.getTime();
      if (t >= at.getTime() - 30 * DAY_MS && t < at.getTime()) {
        byProvider.set(r.provider, (byProvider.get(r.provider) ?? 0) + r.cost);
      }
    }
    const rows = Array.from(byProvider.entries()).sort((a, b) => b[1] - a[1]);
    const total = rows.reduce((acc, [, v]) => acc + v, 0);
    const topPct = rows.length > 0 && total > 0 ? (rows[0][1] / total) * 100 : 0;
    if (topPct >= 80) {
      suggestions.push({
        condition_id: "provider_concentration",
        title: "High Provider Concentration Risk",
        description:
          `Provider '${rows[0][0]}' accounts for ` +
          `${topPct.toFixed(1)}% of 30-day AI spend, exceeding the 80% threshold.`,
        severity: "medium",
        evidence: {
          top_provider: rows[0][0],
          top_provider_pct: round(topPct, 2),
          total_spend_usd: round(total, 4),
          threshold_percent: 80,
          breakdown: rows.map(([provider, v]) => ({ provider, spend_usd: round(v, 4) })),
        },
        compliance_tags: ["Vendor Risk", "EU AI Act Art. 9"],
        suggested_mitigation:
          "Diversify AI provider usage across multiple vendors to reduce dependency risk.",
        status: "pending",
        dismiss_reason: null,
        created_at: at,
        reviewed_at: null,
      });
    }
  }

  // ---- error_rate_spike (end of the provider outage; dismissed the next day) ----
  {
    const outageDay = new Date(now.getTime() - OUTAGE_DAYS_AGO * DAY_MS);
    const at = new Date(
      Date.UTC(outageDay.getUTCFullYear(), outageDay.getUTCMonth(), outageDay.getUTCDate(), 17, 10),
    );
    const inWindow = (r: SpendRow, ms: number) =>
      r.createdAt.getTime() >= at.getTime() - ms && r.createdAt.getTime() < at.getTime();
    const req24 = spend.filter((r) => inWindow(r, DAY_MS));
    const req7 = spend.filter((r) => inWindow(r, 7 * DAY_MS));
    const err24 = req24.filter((r) => r.status >= 400).length;
    const err7 = req7.filter((r) => r.status >= 400).length;
    const rate24 = req24.length >= 10 ? err24 / req24.length : 0;
    const rate7 = req7.length > 0 ? err7 / req7.length : 0;
    if (req24.length >= 10 && rate7 > 0 && rate24 >= 2 * rate7) {
      suggestions.push({
        condition_id: "error_rate_spike",
        title: "Error Rate Spike Detected",
        description:
          `24-hour error rate (${(rate24 * 100).toFixed(1)}%) is ${pyFloat(2.0)}x higher than ` +
          `the 7-day baseline (${(rate7 * 100).toFixed(1)}%).`,
        severity: "high",
        evidence: {
          rate_24h_pct: round(rate24 * 100, 2),
          rate_7d_pct: round(rate7 * 100, 2),
          req_24h: req24.length,
          err_24h: err24,
          req_7d: req7.length,
          err_7d: err7,
          multiplier: 2.0,
        },
        compliance_tags: ["Reliability", "EU AI Act Art. 9"],
        suggested_mitigation:
          "Investigate recent errors in request logs. " +
          "Check provider status pages and review any recent configuration changes.",
        status: "dismissed",
        dismiss_reason:
          "Anthropic API incident (confirmed on their status page), resolved the same afternoon. " +
          "Support traffic failed over to the Haiku fallback endpoint.",
        created_at: at,
        reviewed_at: new Date(at.getTime() + 18 * HOUR_MS),
      });
    }
  }

  // ---- cost_anomaly (during the oversized forecast batch) ----
  {
    const day = new Date(now.getTime() - COST_ANOMALY_DAYS_AGO * DAY_MS);
    const dayStart = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
    const at = new Date(dayStart + 12 * HOUR_MS + 40 * MINUTE_MS);
    const today = sumCost(vkRows, dayStart, at.getTime());
    const avgDaily = sumCost(vkRows, at.getTime() - 7 * DAY_MS, at.getTime()) / 7.0;
    if (today >= 1.0 && avgDaily > 0 && today >= 2 * avgDaily) {
      suggestions.push({
        condition_id: "cost_anomaly",
        title: "Unusual Cost Spike Today",
        description:
          `Today's AI spend ($${money(today)}) is ${pyFloat(2.0)}x higher than ` +
          `the 7-day daily average ($${money(avgDaily)}).`,
        severity: "medium",
        evidence: {
          today_cost_usd: round(today, 4),
          avg_daily_cost_usd: round(avgDaily, 4),
          multiplier: 2.0,
          min_usd: 1.0,
        },
        compliance_tags: ["Cost Governance"],
        suggested_mitigation:
          "Investigate which virtual keys or endpoints drove today's cost increase. " +
          "Check for runaway jobs or unexpected traffic spikes.",
        status: "pending",
        dismiss_reason: null,
        created_at: at,
        reviewed_at: null,
      });
    }
  }

  // ---- stale_virtual_key and unused_endpoint (as of two days ago) ----
  const hygieneAt = new Date(now.getTime() - 2 * DAY_MS - 3 * HOUR_MS);
  {
    const keys = await sequelize.query<{
      id: number;
      name: string;
      created_iso: string;
      created_ms: string;
    }>(
      `SELECT id, name,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"') AS created_iso,
              (EXTRACT(EPOCH FROM created_at) * 1000)::bigint::text AS created_ms
       FROM ai_gateway_virtual_keys
       WHERE organization_id = $1 AND id = ANY($2::int[]) AND is_active = TRUE`,
      {
        bind: [organizationId, Array.from(virtualKeyIdByName.values())],
        type: QueryTypes.SELECT,
        transaction,
      },
    );
    const days = 90;
    const stale = keys
      .filter((k) => Number(k.created_ms) <= hygieneAt.getTime() - days * DAY_MS)
      .map((k) => ({
        id: k.id,
        name: k.name,
        created_at: k.created_iso,
        spend_last_30d_usd: round(
          sumCost(
            vkRows.filter((r) => r.vkName === k.name),
            hygieneAt.getTime() - 30 * DAY_MS,
            hygieneAt.getTime(),
          ),
          4,
        ),
      }))
      .filter((k) => k.spend_last_30d_usd > 0);
    if (stale.length > 0) {
      suggestions.push({
        condition_id: "stale_virtual_key",
        title: "Stale Virtual Keys With Active Spend",
        description:
          `${stale.length} virtual key(s) older than ${days} days still have spend ` +
          "in the last 30 days. These may be leaked or forgotten credentials.",
        severity: "medium",
        evidence: { stale_keys: stale, days_threshold: days },
        compliance_tags: ["Security", "Key Management", "EU AI Act Art. 9"],
        suggested_mitigation:
          "Rotate or deactivate stale virtual keys. " +
          "Audit which services are using them and update their credentials.",
        status: "pending",
        dismiss_reason: null,
        created_at: hygieneAt,
        reviewed_at: null,
      });
    }
  }
  {
    const endpoints = await sequelize.query<{
      id: number;
      slug: string;
      name: string;
      created_iso: string;
    }>(
      `SELECT id, slug, display_name AS name,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"') AS created_iso
       FROM ai_gateway_endpoints
       WHERE organization_id = $1 AND id = ANY($2::int[]) AND is_active = TRUE
       ORDER BY id`,
      {
        bind: [organizationId, Array.from(endpointIdBySlug.values())],
        type: QueryTypes.SELECT,
        transaction,
      },
    );
    const days = 30;
    const unused = endpoints
      .filter(
        (e) =>
          !spend.some(
            (r) =>
              r.endpointSlug === e.slug &&
              r.createdAt.getTime() >= hygieneAt.getTime() - days * DAY_MS &&
              r.createdAt.getTime() < hygieneAt.getTime(),
          ),
      )
      .map((e) => ({ id: e.id, name: e.name, created_at: e.created_iso }));
    if (unused.length > 0) {
      suggestions.push({
        condition_id: "unused_endpoint",
        title: "Active Endpoints With No Recent Traffic",
        description:
          `${unused.length} active endpoint(s) have received zero requests in the last ${days} day(s). ` +
          "These may be stale configurations consuming guardrail resources.",
        severity: "low",
        evidence: { unused_endpoints: unused, days_threshold: days, count: unused.length },
        compliance_tags: ["Hygiene", "EU AI Act Art. 9"],
        suggested_mitigation:
          "Deactivate or remove unused endpoints to keep the configuration clean " +
          "and reduce the attack surface.",
        status: "pending",
        dismiss_reason: null,
        created_at: hygieneAt,
        reviewed_at: null,
      });
    }
  }

  // no_guardrails is not seeded: guardrail rules are org-wide, so every endpoint is covered.

  await batchInsert(
    "ai_gateway_risk_suggestions",
    [
      "organization_id",
      "condition_id",
      "title",
      "description",
      "severity",
      "evidence",
      "compliance_tags",
      "suggested_mitigation",
      "status",
      "accepted_risk_id",
      "dismiss_reason",
      "created_at",
      "reviewed_at",
      "reviewed_by",
    ],
    suggestions.map((s) => [
      organizationId,
      s.condition_id,
      s.title,
      s.description,
      s.severity,
      pythonFloats(JSON.stringify(s.evidence)),
      pgTextArray(s.compliance_tags),
      s.suggested_mitigation,
      s.status,
      null,
      s.dismiss_reason,
      markedTs(s.created_at),
      s.reviewed_at,
      s.reviewed_at ? userId : null,
    ]),
    transaction,
  );
}
