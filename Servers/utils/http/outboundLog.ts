/**
 * Outbound HTTP call logging + X-Request-Id forwarding.
 *
 * Wraps the global `fetch` and adds axios interceptors so every outbound HTTP
 * call from the backend (to AI Gateway, EvalServer, third-party APIs) emits a
 * structured log line with url, method, status, duration. Also stamps the
 * current request_id (from AsyncLocalStorage) onto outgoing X-Request-Id
 * headers so a single trace ID propagates across service boundaries.
 *
 * Self-calls and Loki push traffic are filtered to avoid amplification loops.
 */

import logger from "../logger/fileLogger";
import { asyncLocalStorage } from "../context/context";

const currentRequestId = (): string | undefined => asyncLocalStorage.getStore()?.requestId;

let initialized = false;

const LOKI_URL = process.env.LOKI_URL;

const shouldSkipUrl = (url: string): boolean => {
  if (LOKI_URL && url.startsWith(LOKI_URL)) return true;
  if (url.includes("/loki/api/v1/push")) return true;
  return false;
};

const normalizeUrl = (input: RequestInfo | URL | string): string => {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  return String(input);
};

// Cap response-body capture at 2KB so a single bad call can't blow up log volume.
const MAX_BODY_CAPTURE_BYTES = 2048;

const isTextualContentType = (contentType: string | null | undefined): boolean => {
  if (!contentType) return false;
  const ct = contentType.toLowerCase();
  return (
    ct.includes("json") ||
    ct.includes("text/") ||
    ct.includes("xml") ||
    ct.includes("x-www-form-urlencoded")
  );
};

const truncate = (s: string, max: number): string =>
  s.length <= max ? s : `${s.slice(0, max)}…[truncated ${s.length - max} bytes]`;

const logCall = (params: {
  url: string;
  method: string;
  status?: number;
  durationMs: number;
  error?: string;
  responseBody?: string;
  responseSize?: number;
}): void => {
  const { url, method, status, durationMs, error, responseBody, responseSize } = params;
  if (shouldSkipUrl(url)) return;

  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return "unknown";
    }
  })();

  const level = error || (status && status >= 500) ? "error" : status && status >= 400 ? "warn" : "info";

  logger.log(level, `${method} ${host} ${status ?? "ERR"}`, {
    kind: "http_outbound",
    method,
    url,
    host,
    status,
    duration_ms: Math.round(durationMs * 100) / 100,
    error,
    response_body: responseBody,
    response_size: responseSize,
  });
};

function patchFetch(): void {
  const originalFetch = globalThis.fetch?.bind(globalThis);
  if (!originalFetch) return;

  globalThis.fetch = async (input, init) => {
    const url = normalizeUrl(input);
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const start = process.hrtime.bigint();

    // Stamp X-Request-Id on outbound calls so the trace ID propagates downstream.
    // Skip when input is a Request (headers are baked into the immutable object).
    let nextInit = init;
    const isRequestObject = typeof Request !== "undefined" && input instanceof Request;
    if (!isRequestObject) {
      const requestId = currentRequestId();
      if (requestId) {
        const headers = new Headers(init?.headers || {});
        if (!headers.has("x-request-id")) {
          headers.set("X-Request-Id", requestId);
          nextInit = { ...(init || {}), headers };
        }
      }
    }

    try {
      const res = await originalFetch(input, nextInit);
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;

      // Capture response body for non-2xx responses to surface API error
      // messages (e.g. Resend's "domain not verified") directly in Loki.
      // Use res.clone() so the caller can still consume the body.
      let responseBody: string | undefined;
      let responseSize: number | undefined;
      if (res.status >= 400 && isTextualContentType(res.headers.get("content-type"))) {
        try {
          const text = await res.clone().text();
          responseSize = text.length;
          responseBody = truncate(text, MAX_BODY_CAPTURE_BYTES);
        } catch {
          // Body read failed — log without it rather than failing the request.
        }
      }

      logCall({ url, method, status: res.status, durationMs, responseBody, responseSize });
      return res;
    } catch (err) {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      logCall({ url, method, durationMs, error: (err as Error).message });
      throw err;
    }
  };
}

function patchAxios(): void {
  type AxiosLike = {
    interceptors: {
      request: { use: (fn: (config: Record<string, unknown>) => Record<string, unknown>) => void };
      response: {
        use: (
          onSuccess: (response: Record<string, unknown>) => Record<string, unknown>,
          onError: (error: Record<string, unknown>) => Promise<never>,
        ) => void;
      };
    };
  };

  let axios: AxiosLike | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("axios");
    axios = (mod.default || mod) as AxiosLike;
  } catch {
    return;
  }
  if (!axios) return;

  axios.interceptors.request.use((config) => {
    (config as { _startNs?: bigint })._startNs = process.hrtime.bigint();
    const requestId = currentRequestId();
    if (requestId) {
      const headers = (config.headers || {}) as Record<string, unknown>;
      const hasIt = Object.keys(headers).some((k) => k.toLowerCase() === "x-request-id");
      if (!hasIt) {
        headers["X-Request-Id"] = requestId;
        config.headers = headers;
      }
    }
    return config;
  });

  axios.interceptors.response.use(
    (response) => {
      const cfg = (response.config || {}) as Record<string, unknown>;
      const start = (cfg as { _startNs?: bigint })._startNs;
      const durationMs = start ? Number(process.hrtime.bigint() - start) / 1e6 : 0;
      logCall({
        url: `${(cfg.baseURL as string) || ""}${(cfg.url as string) || ""}`,
        method: String(cfg.method || "GET").toUpperCase(),
        status: response.status as number,
        durationMs,
      });
      return response;
    },
    (error) => {
      const cfg = ((error?.config as Record<string, unknown>) || {}) as Record<string, unknown>;
      const start = (cfg as { _startNs?: bigint })._startNs;
      const durationMs = start ? Number(process.hrtime.bigint() - start) / 1e6 : 0;

      // axios already parses response.data — stringify and cap so the upstream
      // error body lands in the log alongside status.
      const resp = error?.response as { status?: number; data?: unknown } | undefined;
      let responseBody: string | undefined;
      let responseSize: number | undefined;
      if (resp && resp.status !== undefined && resp.status >= 400 && resp.data !== undefined) {
        try {
          const asString = typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data);
          responseSize = asString.length;
          responseBody = truncate(asString, MAX_BODY_CAPTURE_BYTES);
        } catch {
          // Body serialization failed — log without it.
        }
      }

      logCall({
        url: `${(cfg.baseURL as string) || ""}${(cfg.url as string) || ""}`,
        method: String(cfg.method || "GET").toUpperCase(),
        status: resp?.status,
        durationMs,
        error: (error?.message as string) || "request failed",
        responseBody,
        responseSize,
      });
      return Promise.reject(error);
    },
  );
}

export function installOutboundHttpLogging(): void {
  if (initialized) return;
  initialized = true;
  patchFetch();
  patchAxios();
}
