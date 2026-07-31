/**
 * Phase 3 — Trace Manager
 *
 * Manages Langfuse traces and spans for agent execution tracing.
 * Provides a simple API for starting/ending traces and spans.
 * No-ops gracefully when Langfuse is not configured.
 */

import { getLangfuse } from "./langfuseConfig";
import { logStructured } from "../../utils/logger/fileLogger";

const fileName = "traceManager.ts";

interface TraceHandle {
  traceId: string;
  trace: any;
}

interface SpanHandle {
  spanId: string;
  span: any;
  startTime: number;
}

/**
 * Tag prefix used to bind a Langfuse trace to the organization that produced it.
 * Langfuse traces live in a single shared project, so this tag is the only tenant
 * boundary the observability read APIs can filter/verify against. See
 * observability.ctrl.ts for the read-side enforcement.
 */
export const ORG_TAG_PREFIX = "org:";

/** Build the org-scoping tag for a given organization id. */
export function orgTag(organizationId: number): string {
  return `${ORG_TAG_PREFIX}${organizationId}`;
}

/**
 * Start a new trace for a user interaction.
 *
 * Every trace is tagged with `org:<organizationId>` so the observability read
 * endpoints can scope by tenant — Langfuse has no native org concept and all
 * orgs share one project. When organizationId is omitted the trace carries no
 * org tag and is therefore invisible to every org's scoped reads.
 */
export function startTrace(
  userId: number,
  sessionId: string,
  metadata?: Record<string, unknown>,
  organizationId?: number,
): TraceHandle | null {
  const langfuse = getLangfuse();
  if (!langfuse) return null;

  try {
    const tags = organizationId != null ? [orgTag(organizationId)] : undefined;
    const trace = langfuse.trace({
      name: "agent-interaction",
      userId: String(userId),
      sessionId,
      tags,
      metadata: {
        ...(metadata || {}),
        ...(organizationId != null ? { organization_id: organizationId } : {}),
      },
    });

    return { traceId: trace.id, trace };
  } catch (error) {
    logStructured("error", `start trace failed: ${error}`, "startTrace", fileName);
    return null;
  }
}

/**
 * Start a span within a trace.
 */
export function startSpan(
  traceHandle: TraceHandle | null,
  name: string,
  metadata?: Record<string, unknown>,
): SpanHandle | null {
  if (!traceHandle) return null;

  try {
    const span = traceHandle.trace.span({
      name,
      metadata: metadata || {},
    });

    return { spanId: span.id, span, startTime: Date.now() };
  } catch (error) {
    logStructured("error", `start span failed: ${error}`, "startSpan", fileName);
    return null;
  }
}

/**
 * End a span with results.
 */
export function endSpan(
  spanHandle: SpanHandle | null,
  result?: {
    output?: unknown;
    tokensUsed?: { input: number; output: number; total: number };
    cost?: number;
    status?: "success" | "error";
    error?: string;
  },
): void {
  if (!spanHandle) return;

  try {
    const duration = Date.now() - spanHandle.startTime;
    spanHandle.span.end({
      output: result?.output,
      metadata: {
        duration_ms: duration,
        tokens: result?.tokensUsed,
        cost: result?.cost,
        status: result?.status || "success",
        error: result?.error,
      },
    });
  } catch (error) {
    logStructured("error", `end span failed: ${error}`, "endSpan", fileName);
  }
}

/**
 * End a trace with the final result.
 */
export function endTrace(
  traceHandle: TraceHandle | null,
  result?: {
    output?: string;
    status?: "success" | "error";
    tokensUsed?: { input: number; output: number; total: number };
  },
): void {
  if (!traceHandle) return;

  try {
    traceHandle.trace.update({
      output: result?.output,
      metadata: {
        status: result?.status || "success",
        tokens: result?.tokensUsed,
      },
    });
  } catch (error) {
    logStructured("error", `end trace failed: ${error}`, "endTrace", fileName);
  }
}

/**
 * Log an error event onto a trace. No-ops when Langfuse is unconfigured.
 */
export function logError(
  traceHandle: TraceHandle | null,
  error: unknown,
  metadata?: Record<string, unknown>,
): void {
  if (!traceHandle) return;

  try {
    const message = error instanceof Error ? error.message : String(error);
    traceHandle.trace.event({
      name: "error",
      level: "ERROR",
      statusMessage: message,
      metadata: metadata || {},
    });
  } catch (err) {
    logStructured("error", `log error failed: ${err}`, "logError", fileName);
  }
}

/**
 * Log a generation (LLM call) within a trace.
 */
export function logGeneration(
  traceHandle: TraceHandle | null,
  params: {
    name: string;
    model: string;
    modelProvider: string;
    input: unknown;
    output: unknown;
    tokensInput: number;
    tokensOutput: number;
    cost?: number;
    duration?: number;
  },
): void {
  if (!traceHandle) return;

  try {
    traceHandle.trace.generation({
      name: params.name,
      model: params.model,
      modelParameters: { provider: params.modelProvider },
      input: params.input,
      output: params.output,
      usage: {
        input: params.tokensInput,
        output: params.tokensOutput,
        total: params.tokensInput + params.tokensOutput,
      },
      metadata: {
        cost: params.cost,
        duration_ms: params.duration,
      },
    });
  } catch (error) {
    logStructured("error", `log generation failed: ${error}`, "logGeneration", fileName);
  }
}
