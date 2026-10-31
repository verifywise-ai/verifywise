/**
 * Startup check for a missing AI_GATEWAY_INTERNAL_KEY, shared by the API
 * server and the worker.
 *
 * Rule: warn when the key is missing AND the gateway is evidently in use:
 * AI_GATEWAY_URL is set explicitly, or a GET of the gateway's /health at the
 * resolved URL succeeds within GATEWAY_HEALTH_TIMEOUT_MS. The warning is
 * logged at most once per process; a failed or slow health probe stays quiet.
 * Organizations with automatic log deletion are covered by the daily purge,
 * which logs a refusal once per run.
 */

import {
  getGatewayUrl,
  isGatewayInternalKeyConfigured,
  isGatewayUrlConfigured,
  missingGatewayKeyWarning,
} from "./aiGatewayConfig";

export const GATEWAY_HEALTH_TIMEOUT_MS = 2_000;

let warned = false;

/** Test hook: allow the warning again. */
export function resetGatewayKeyWarning(): void {
  warned = false;
}

async function gatewayAnswersHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${getGatewayUrl()}/health`, {
      signal: AbortSignal.timeout(GATEWAY_HEALTH_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function warnIfGatewayKeyMissing(log: {
  warn: (message: string) => unknown;
}): Promise<boolean> {
  if (warned || isGatewayInternalKeyConfigured()) return false;
  let reason: string | null = null;
  if (isGatewayUrlConfigured()) {
    reason = "AI_GATEWAY_URL is set";
  } else if (await gatewayAnswersHealth()) {
    reason = "an AI Gateway answers at the default address";
  }
  if (!reason || warned) return false;
  warned = true;
  log.warn(missingGatewayKeyWarning(reason));
  return true;
}
