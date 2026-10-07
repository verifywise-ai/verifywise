/**
 * Org-wide LLM guardrail rules (created from the UI catalog presets), the
 * org's guardrail/logging settings singleton, and the detection log.
 *
 * Log rows match what the gateway writes: action_taken is "blocked" or the
 * rule action ("mask", not "masked"); entity_type is the Presidio entity for
 * PII and the rule name for content filters; user_id is NULL.
 */

import { Transaction } from "sequelize";
import { batchInsert, DAY_MS, markedTs, SeededRandom } from "./common";
import { GUARDRAIL_ACTIVE_WINDOWS, GuardrailLogRow } from "./traffic";

interface GuardrailDefinition {
  name: string;
  guardrail_type: "pii" | "content_filter";
  action: "block" | "mask";
  config: Record<string, unknown>;
}

export const GUARDRAILS: GuardrailDefinition[] = [
  {
    name: "Email addresses",
    guardrail_type: "pii",
    action: "mask",
    config: { entities: { EMAIL_ADDRESS: "mask" }, score_thresholds: { ALL: 0.7 }, language: "en" },
  },
  {
    name: "Phone numbers",
    guardrail_type: "pii",
    action: "mask",
    config: { entities: { PHONE_NUMBER: "mask" }, score_thresholds: { ALL: 0.7 }, language: "en" },
  },
  {
    name: "Credit card numbers",
    guardrail_type: "pii",
    action: "block",
    config: { entities: { CREDIT_CARD: "block" }, score_thresholds: { ALL: 0.8 }, language: "en" },
  },
  {
    name: "US Social Security numbers",
    guardrail_type: "pii",
    action: "block",
    config: { entities: { US_SSN: "block" }, score_thresholds: { ALL: 0.8 }, language: "en" },
  },
  {
    // Switched off after two weeks: too many false positives on support chats.
    name: "Person names",
    guardrail_type: "pii",
    action: "mask",
    config: { entities: { PERSON: "mask" }, score_thresholds: { ALL: 0.6 }, language: "en" },
  },
  {
    name: "Prompt injection (basic)",
    guardrail_type: "content_filter",
    action: "block",
    config: {
      type: "regex",
      pattern:
        "(ignore (all |any )?(previous|prior|above|preceding) (instructions|prompts|rules|directions)|disregard (all |any )?(previous|prior|above) (instructions|prompts))",
    },
  },
  {
    name: "AWS credentials",
    guardrail_type: "content_filter",
    action: "block",
    config: {
      type: "regex",
      pattern: "(AKIA[0-9A-Z]{16}|aws_secret_access_key\\s*=\\s*[A-Za-z0-9/+=]{40})",
    },
  },
];

export const GUARDRAIL_NAMES = GUARDRAILS.map((g) => g.name);

/** Seeded values of the guardrail-settings singleton (used for the conditional delete). */
export const GUARDRAIL_SETTINGS = {
  pii_on_error: "block",
  content_filter_on_error: "allow",
  pii_replacement_format: "<ENTITY_TYPE>",
  content_filter_replacement: "[REDACTED]",
  log_retention_days: 90,
  log_request_body: true,
  log_response_body: true,
  cache_global_enabled: true,
  cache_default_ttl_seconds: 14400,
  cache_max_entries_per_org: 50000,
};

export async function insertGuardrails(
  organizationId: number,
  userId: number,
  now: Date,
  rng: SeededRandom,
  transaction: Transaction,
): Promise<Map<string, number>> {
  const rows = GUARDRAILS.map((g) => {
    const [createdDaysAgo, deactivatedDaysAgo] = GUARDRAIL_ACTIVE_WINDOWS[g.name];
    const createdAt = new Date(
      now.getTime() - createdDaysAgo * DAY_MS - rng.int(1, 6) * 3600 * 1000,
    );
    const updatedAt =
      deactivatedDaysAgo > 0 ? new Date(now.getTime() - deactivatedDaysAgo * DAY_MS) : createdAt;
    return [
      organizationId,
      g.guardrail_type,
      g.name,
      JSON.stringify(g.config),
      "input",
      g.action,
      deactivatedDaysAgo === 0,
      userId,
      markedTs(createdAt),
      updatedAt.toISOString(),
    ];
  });
  const inserted = await batchInsert<{ id: number; name: string }>(
    "ai_gateway_guardrails",
    [
      "organization_id",
      "guardrail_type",
      "name",
      "config",
      "scope",
      "action",
      "is_active",
      "created_by",
      "created_at",
      "updated_at",
    ],
    rows,
    transaction,
    { returning: "id, name" },
  );
  return new Map(inserted.map((r) => [r.name, r.id]));
}

/**
 * Settings singleton: inserted only when the org has none (ON CONFLICT DO
 * NOTHING), stamped with the demo marker so delete can recognise it.
 * Body logging was switched on 14 days ago in the story.
 */
export async function insertGuardrailSettings(
  organizationId: number,
  now: Date,
  transaction: Transaction,
): Promise<void> {
  const s = GUARDRAIL_SETTINGS;
  const createdAt = markedTs(new Date(now.getTime() - 80 * DAY_MS));
  const updatedAt = new Date(now.getTime() - 14 * DAY_MS).toISOString();
  await batchInsert(
    "ai_gateway_guardrail_settings",
    [
      "organization_id",
      "pii_on_error",
      "content_filter_on_error",
      "pii_replacement_format",
      "content_filter_replacement",
      "log_retention_days",
      "log_request_body",
      "log_response_body",
      "cache_global_enabled",
      "cache_default_ttl_seconds",
      "cache_max_entries_per_org",
      "created_at",
      "updated_at",
    ],
    [
      [
        organizationId,
        s.pii_on_error,
        s.content_filter_on_error,
        s.pii_replacement_format,
        s.content_filter_replacement,
        s.log_retention_days,
        s.log_request_body,
        s.log_response_body,
        s.cache_global_enabled,
        s.cache_default_ttl_seconds,
        s.cache_max_entries_per_org,
        createdAt,
        updatedAt,
      ],
    ],
    transaction,
    { onConflict: "ON CONFLICT (organization_id) DO NOTHING" },
  );
}

export async function insertGuardrailLogs(
  organizationId: number,
  rows: GuardrailLogRow[],
  guardrailIdByName: Map<string, number>,
  endpointIdBySlug: Map<string, number>,
  transaction: Transaction,
): Promise<void> {
  await batchInsert(
    "ai_gateway_guardrail_logs",
    [
      "organization_id",
      "guardrail_id",
      "endpoint_id",
      "user_id",
      "guardrail_type",
      "action_taken",
      "matched_text",
      "entity_type",
      "execution_time_ms",
      "created_at",
    ],
    rows.map((r) => [
      organizationId,
      guardrailIdByName.get(r.guardrailName) ?? null,
      endpointIdBySlug.get(r.endpointSlug) ?? null,
      null,
      r.guardrailType,
      r.actionTaken,
      r.matchedText,
      r.entityType,
      r.executionTimeMs,
      r.createdAt,
    ]),
    transaction,
  );
}
