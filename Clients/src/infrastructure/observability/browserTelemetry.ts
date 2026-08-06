/**
 * Lightweight browser telemetry.
 *
 * Reports JS errors and page-load time to the backend telemetry sink
 * (`POST /api/telemetry`), which re-emits them with the deployment name. The
 * backend no-ops when monitoring is disabled, so this is safe to always run.
 *
 * Dependency-free and intentionally minimal: buffer events, flush on page hide.
 */
import { ENV_VARs } from "../../../env.vars";

interface TelemetryEvent {
  type: "error" | "web-vital";
  name?: string;
  value?: number;
  message?: string;
  level?: string;
  route?: string;
}

const ENDPOINT = `${ENV_VARs.URL}/api/telemetry`;
const MAX_BUFFER = 20;

let buffer: TelemetryEvent[] = [];
let initialized = false;

function enqueue(event: TelemetryEvent): void {
  buffer.push({ route: window.location.pathname, ...event });
  if (buffer.length >= MAX_BUFFER) flush();
}

function flush(): void {
  if (buffer.length === 0) return;
  const payload = JSON.stringify({ events: buffer });
  buffer = [];
  try {
    navigator.sendBeacon?.(ENDPOINT, new Blob([payload], { type: "application/json" }));
  } catch {
    /* telemetry is best-effort */
  }
}

/** Initialize browser telemetry once. Safe no-op if called again. */
export function initBrowserTelemetry(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  window.addEventListener("error", (e) => {
    enqueue({ type: "error", level: "error", message: e.message || "window error" });
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason = (e as PromiseRejectionEvent).reason;
    enqueue({
      type: "error",
      level: "error",
      message: typeof reason === "string" ? reason : reason?.message || "unhandled rejection",
    });
  });

  window.addEventListener("load", () => {
    const nav = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (nav && nav.loadEventEnd > 0) {
      enqueue({ type: "web-vital", name: "page_load", value: Math.round(nav.loadEventEnd) });
    }
  });

  // Flush when the user leaves / backgrounds the tab.
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}
