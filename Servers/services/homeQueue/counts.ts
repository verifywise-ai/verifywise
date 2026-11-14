import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { IntakeSubmissionStatus } from "../../domain.layer/enums/intake-submission-status.enum";
import logger from "../../utils/logger/fileLogger";
import { aiGatewayRequest } from "../../utils/aiGatewayInternal.utils";
import { isGatewayInternalKeyConfigured } from "../../utils/aiGatewayConfig";
import { getAgentStatsQuery } from "../../utils/agentDiscovery.utils";
import {
  POLICY_REVIEW_DUE_CONDITION,
  policyReviewDueReplacements,
} from "./sources/policyReviews.source";
import {
  RISK_NEEDS_ATTENTION_CONDITION,
  riskNeedsAttentionReplacements,
} from "./sources/risks.source";
import {
  VENDOR_REVIEW_DUE_CONDITION,
  vendorReviewDueReplacements,
} from "./sources/vendorReviews.source";
import type {
  HomeQueueContext,
  HomeQueueCountId,
  HomeQueueResponse,
} from "../../domain.layer/interfaces/i.homeQueue";

/**
 * A slow gateway must not hold the Home page: the call gives up after this
 * long and the count is reported as null (shown as a dash).
 */
export const GATEWAY_COUNT_TIMEOUT_MS = 2000;

const GATEWAY_STATS_PATH = "/internal/guardrails/stats?period=24h";

type CountLoader = (ctx: HomeQueueContext) => Promise<number | null>;

const sqlCount = async (sql: string, replacements: Record<string, unknown>): Promise<number> => {
  const rows = await sequelize.query<{ total: number | string }>(sql, {
    replacements,
    type: QueryTypes.SELECT,
  });
  return Number(rows[0]?.total ?? 0);
};

/** Submissions waiting for a first decision, org-wide. */
const intakeWaiting: CountLoader = (ctx) =>
  sqlCount(
    `SELECT COUNT(*)::int AS total
     FROM intake_submissions s
     WHERE s.organization_id = :organizationId
       AND s.status = :pending`,
    { organizationId: ctx.organizationId, pending: IntakeSubmissionStatus.PENDING },
  );

/** Agents nobody has confirmed or rejected yet (the Agent discovery stats card). */
const agentsToReview: CountLoader = async (ctx) =>
  (await getAgentStatsQuery(ctx.organizationId)).unreviewed;

/** Use cases (not the organizational project) + models + AI apps + agents. */
const aiOnRecord: CountLoader = async (ctx) => {
  const rows = await sequelize.query<Record<"use_cases" | "models" | "ai_apps" | "agents", string>>(
    `SELECT
       (SELECT COUNT(*) FROM projects
         WHERE organization_id = :organizationId AND is_organizational IS NOT TRUE) AS use_cases,
       (SELECT COUNT(*) FROM model_inventories WHERE organization_id = :organizationId) AS models,
       (SELECT COUNT(*) FROM ai_apps WHERE organization_id = :organizationId) AS ai_apps,
       (SELECT COUNT(*) FROM agent_primitives WHERE organization_id = :organizationId) AS agents`,
    { replacements: { organizationId: ctx.organizationId }, type: QueryTypes.SELECT },
  );
  const row = rows[0];
  return Number(row.use_cases) + Number(row.models) + Number(row.ai_apps) + Number(row.agents);
};

const untreatedRisks: CountLoader = (ctx) =>
  sqlCount(
    `SELECT COUNT(*)::int AS total FROM risks r WHERE ${RISK_NEEDS_ATTENTION_CONDITION}`,
    riskNeedsAttentionReplacements(ctx.organizationId, ctx.today),
  );

const vendorReviewsDue: CountLoader = (ctx) =>
  sqlCount(
    `SELECT COUNT(*)::int AS total FROM vendors v WHERE ${VENDOR_REVIEW_DUE_CONDITION}`,
    vendorReviewDueReplacements(ctx.organizationId, ctx.today),
  );

const policyReviewsDue: CountLoader = (ctx) =>
  sqlCount(
    `SELECT COUNT(*)::int AS total FROM policy_manager p WHERE ${POLICY_REVIEW_DUE_CONDITION}`,
    policyReviewDueReplacements(ctx.organizationId, ctx.today),
  );

/** Prompts the guardrails blocked or masked in the last 24 hours. */
const promptsBlockedMasked24h: CountLoader = async (ctx) => {
  // No internal key means the gateway is not wired up here: skip the call (and
  // its error log on every Home load) and show a dash.
  if (!isGatewayInternalKeyConfigured()) return null;
  const stats = await aiGatewayRequest("GET", GATEWAY_STATS_PATH, {
    organizationId: ctx.organizationId,
    timeoutMs: GATEWAY_COUNT_TIMEOUT_MS,
  });
  const blocked = stats?.summary?.blocked;
  const masked = stats?.summary?.masked;
  if (typeof blocked !== "number" || typeof masked !== "number") {
    throw new Error("AI Gateway guardrail stats had no blocked/masked summary");
  }
  return blocked + masked;
};

interface CountDefinition {
  id: HomeQueueCountId;
  /** A count the user may not see is left out entirely, not zeroed. */
  isVisible: (ctx: HomeQueueContext) => boolean;
  load: CountLoader;
}

const COUNTS: CountDefinition[] = [
  { id: "intakeWaiting", isVisible: (ctx) => ctx.can("intakeForm.edit"), load: intakeWaiting },
  { id: "agentsToReview", isVisible: () => true, load: agentsToReview },
  { id: "aiOnRecord", isVisible: () => true, load: aiOnRecord },
  { id: "untreatedRisks", isVisible: () => true, load: untreatedRisks },
  { id: "vendorReviewsDue", isVisible: () => true, load: vendorReviewsDue },
  { id: "policyReviewsDue", isVisible: () => true, load: policyReviewsDue },
  { id: "promptsBlockedMasked24h", isVisible: () => true, load: promptsBlockedMasked24h },
];

/**
 * The counts strip: org-wide counts the user may see. Each count loads on its
 * own, so one failure becomes null for that count and never 0 or a failed
 * response.
 */
export async function loadHomeCounts(ctx: HomeQueueContext): Promise<HomeQueueResponse["counts"]> {
  const visible = COUNTS.filter((count) => count.isVisible(ctx));
  // Promise.resolve().then() turns a synchronous throw into a rejection.
  const settled = await Promise.allSettled(
    visible.map((count) => Promise.resolve().then(() => count.load(ctx))),
  );

  const counts: HomeQueueResponse["counts"] = {};
  settled.forEach((result, i) => {
    const { id } = visible[i];
    if (result.status === "fulfilled") {
      counts[id] = result.value;
    } else {
      logger.error(`Home queue count ${id} failed:`, result.reason);
      counts[id] = null;
    }
  });
  return counts;
}
