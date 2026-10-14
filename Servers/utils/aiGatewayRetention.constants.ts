import { isGatewayInternalKeyConfigured } from "./aiGatewayConfig";

/**
 * The AI Gateway's retention values for an organization that has not saved
 * its own settings (they match the gateway's _SETTINGS_DEFAULTS).
 */
export const GATEWAY_DEFAULTS = {
  log_retention_days: 90,
  spend_log_retention_days: 90,
  auto_purge_enabled: false,
  /** null: the deployment default (MCP_AUDIT_RETENTION_DAYS) applies. */
  mcp_audit_retention_days: null,
} as const;

/**
 * Why the AI Gateway refused a retention purge, and the error recorded on the
 * failed run. The gateway's retention routes fail closed and say why with a
 * machine code: "internal_key_not_configured" (503) or
 * "internal_key_rejected" (401).
 */
export const GATEWAY_PURGE_REFUSALS = {
  internal_key_not_configured: "Purge refused: internal key not configured",
  internal_key_rejected: "Purge refused: internal key rejected",
} as const;

export type GatewayPurgeRefusal = keyof typeof GATEWAY_PURGE_REFUSALS;

function isRefusalCode(value: unknown): value is GatewayPurgeRefusal {
  return (
    typeof value === "string" && Object.prototype.hasOwnProperty.call(GATEWAY_PURGE_REFUSALS, value)
  );
}

/**
 * The exact detail strings a gateway released before the machine codes
 * returned for the same refusals. Accepted so a rolling deploy (new backend,
 * old gateway) still explains the refusal.
 */
const LEGACY_REFUSAL_DETAILS: Record<number, { detail: string; code: GatewayPurgeRefusal }> = {
  503: { detail: "Internal key not configured", code: "internal_key_not_configured" },
  401: { detail: "Invalid internal key", code: "internal_key_rejected" },
};

/**
 * The machine code in a gateway error body: { detail: { code } } or { code },
 * or for an older gateway the code its exact legacy detail string stands for.
 */
function gatewayErrorCode(status: number, body: unknown): unknown {
  if (!body || typeof body !== "object") return undefined;
  const { code, detail } = body as { code?: unknown; detail?: unknown };
  if (code !== undefined) return code;
  if (detail && typeof detail === "object") return (detail as { code?: unknown }).code;
  const legacy = LEGACY_REFUSAL_DETAILS[status];
  return legacy && detail === legacy.detail ? legacy.code : undefined;
}

/**
 * The refusal behind a failed gateway call, or null when it failed for any
 * other reason (including a 503 or 401 from a proxy or load balancer while the
 * gateway is down, which carries no gateway code). Without a key here the
 * gateway can only refuse, so a 401 is then "not configured".
 */
export function gatewayPurgeRefusalFor(error: unknown): GatewayPurgeRefusal | null {
  const { status, body } = (error ?? {}) as { status?: unknown; body?: unknown };
  if (status !== 401 && status !== 503) return null;
  const code = gatewayErrorCode(status, body);
  if (status === 503) return code === "internal_key_not_configured" ? code : null;
  if (!isGatewayInternalKeyConfigured()) return "internal_key_not_configured";
  return code === "internal_key_rejected" ? code : null;
}

/**
 * The refusal recorded on a run: its error_code, or for runs recorded before
 * that column existed, a match on the stored error text.
 */
export function gatewayPurgeRefusalFromRun(run: {
  error_code?: string | null;
  error?: string | null;
}): GatewayPurgeRefusal | null {
  if (isRefusalCode(run.error_code)) return run.error_code;
  if (!run.error) return null;
  const entry = Object.entries(GATEWAY_PURGE_REFUSALS).find(([, text]) => text === run.error);
  return entry ? (entry[0] as GatewayPurgeRefusal) : null;
}
