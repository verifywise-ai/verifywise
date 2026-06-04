/**
 * Browser RUM transport.
 *
 * Posts errors and Web Vitals to the backend RUM endpoints, which forward
 * errors to Loki and expose vitals as Prometheus histograms. Uses
 * `fetch(..., { keepalive: true })` so reports survive page unload.
 */

import { ENV_VARs } from "../../../env.vars";

const RUM_BASE = `${ENV_VARs.URL.replace(/\/$/, "")}/api/rum`;
const MAX_STACK = 8_000;
const MAX_MESSAGE = 2_000;

const truncate = (s: string | undefined, n: number): string | undefined =>
  typeof s === "string" && s.length > n ? s.slice(0, n) : s;

type ErrorPayload = {
  kind: string;
  message: string;
  stack?: string;
  url?: string;
  org_id?: number;
  user_id?: number;
};

const post = (path: string, body: object): void => {
  try {
    void fetch(`${RUM_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "omit",
      keepalive: true,
    }).catch(() => {
      // Swallow — RUM must never break the page.
    });
  } catch {
    // No-op.
  }
};

export const reportRumError = (
  error: unknown,
  context: { kind?: string; orgId?: number; userId?: number } = {},
): void => {
  const err = error instanceof Error ? error : new Error(String(error));
  const payload: ErrorPayload = {
    kind: context.kind ?? "react",
    message: truncate(err.message, MAX_MESSAGE) ?? "unknown",
    stack: truncate(err.stack, MAX_STACK),
    url: typeof window !== "undefined" ? window.location.href : undefined,
    org_id: context.orgId,
    user_id: context.userId,
  };
  post("/errors", payload);
};

export const reportRumVital = (name: string, value: number): void => {
  if (!Number.isFinite(value) || value < 0) return;
  post("/vitals", { name, value });
};
