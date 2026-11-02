// Servers/services/intakeLiveChecks/formBudget.ts
// Per-form hourly caps on the public AI endpoints, counted in Redis so they
// hold across replicas and restarts. They are the real ceiling on a customer's
// LLM key, so every failure refuses: a Redis error or a Redis that does not
// answer within REDIS_TIMEOUT_MS counts as over the limit.
import redisClient from "../../database/redis";
import logger from "../../utils/logger/fileLogger";
import { TIMED_OUT, withDeadline } from "./deadline";

export type FormBudgetEndpoint = "checks" | "prefill" | "explain";

/** Calls per form per hour, across all visitors. */
export const FORM_BUDGET_PER_HOUR: Readonly<Record<FormBudgetEndpoint, number>> = {
  checks: 300,
  prefill: 20,
  // Plain-language risk tier explanations, only on request (#5190).
  explain: 100,
};

/**
 * The shared client sets maxRetriesPerRequest: null, so a command sent while
 * Redis is down waits forever. Each call is raced against this limit instead.
 */
export const REDIS_TIMEOUT_MS = 300;

const HOUR_SECONDS = 3600;

/** `intake:livechecks:<endpoint>:<formId>:<yyyymmddhh>`, the hour in UTC. */
export function formBudgetKey(formId: number, endpoint: FormBudgetEndpoint, now: Date): string {
  const hour = now.toISOString().slice(0, 13).replace(/[-T]/g, "");
  return `intake:livechecks:${endpoint}:${formId}:${hour}`;
}

/**
 * Counts one call against the form's hourly budget. True while the count is
 * within `limit`; false when it is over, when Redis errors, when Redis is not
 * connected, or when Redis does not answer in time.
 */
export async function consumeFormBudget(
  formId: number,
  endpoint: FormBudgetEndpoint,
  limit: number,
  now: Date = new Date(),
): Promise<boolean> {
  // The client queues commands while disconnected and replays them on
  // reconnect, which would charge refused calls to the form's budget.
  if (redisClient.status !== "ready") {
    logger.warn(`Intake ${endpoint} budget: Redis not connected, refusing AI for form ${formId}`);
    return false;
  }
  const key = formBudgetKey(formId, endpoint, now);
  try {
    // One transaction, so the key never outlives the hour without an expiry.
    const replies = await withDeadline(
      redisClient.multi().incr(key).expire(key, HOUR_SECONDS).exec(),
      REDIS_TIMEOUT_MS,
    );
    if (replies === TIMED_OUT) {
      logger.warn(
        `Intake ${endpoint} budget: Redis did not answer, refusing AI for form ${formId}`,
      );
      return false;
    }
    const [incrReply, expireReply] = replies ?? [];
    if (!incrReply || incrReply[0]) throw incrReply?.[0] ?? new Error("no reply to INCR");
    if (expireReply?.[0]) logger.warn(`Intake ${endpoint} budget: expiry not set`);
    return Number(incrReply[1]) <= limit;
  } catch (error) {
    logger.warn(
      `Intake ${endpoint} budget: Redis error, refusing AI for form ${formId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return false;
  }
}
