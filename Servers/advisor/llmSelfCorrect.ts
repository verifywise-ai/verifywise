/**
 * Self-correcting wrapper around Vercel AI SDK's `generateObject`.
 *
 * Why a wrapper? `generateObject` already retries on transport errors via its
 * `maxRetries` knob, but it does NOT feed schema-validation failures back to
 * the LLM. When the model emits JSON that's almost-but-not-quite valid (a
 * stale enum, a missing required field, a string that's too short), the SDK
 * throws and the caller has to handle it.
 *
 * This module catches Zod validation failures, builds a structured corrective
 * prompt that pinpoints what was wrong, and retries up to N times. Most
 * model providers fix their output on the first self-correction pass — what
 * was previously a hard error becomes silent, observable resilience.
 *
 * Design decisions:
 *   - Pure additive wrapper. The return type carries telemetry
 *     (`attempts`, `selfCorrected`) but the success-case payload is
 *     identical to `generateObject`'s `{ object }`.
 *   - Dependency-injectable `generateImpl` for unit tests — avoids
 *     module mocking which is brittle.
 *   - Transport-level retries delegated to the SDK via the inner call's
 *     `maxRetries`. Self-correction is a separate axis.
 *   - Only Zod validation errors trigger self-correction. Other errors
 *     (auth, network, rate-limit) bubble up unchanged so the existing
 *     error mapping in advisor.ctrl.ts continues to work.
 */

import { generateObject } from "ai";
import { z, ZodError } from "zod";
import logger from "../utils/logger/fileLogger";

type GenerateObjectParams = Parameters<typeof generateObject>[0];
type GenerateObjectResult = Awaited<ReturnType<typeof generateObject>>;

/**
 * Subset of `generateObject` params that callers usually want plus a
 * `maxSelfCorrectionAttempts` knob. We keep `system` / `prompt` separate so
 * we can append the corrective directive to `system` only — the user prompt
 * stays untouched.
 */
export interface SelfCorrectingParams<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  temperature?: number;
  /**
   * How many self-correction attempts to make AFTER the first failure.
   * Default 2 → up to 3 total LLM calls. Set to 0 to disable self-correction
   * entirely (behaves like raw generateObject).
   */
  maxSelfCorrectionAttempts?: number;
  /**
   * Forwarded to the underlying SDK for transport-level retries
   * (network / rate-limit). Independent from self-correction.
   */
  innerMaxRetries?: number;
  /**
   * Pass-through for any other generateObject params we don't surface
   * directly (e.g., `maxOutputTokens`, `seed`, `mode`). Merged into the
   * inner call without further validation — caller is responsible for
   * supplying valid SDK params.
   */
  extra?: Record<string, unknown>;
}

export interface SelfCorrectingResult<T> {
  object: T;
  /** Total number of LLM calls made (1 = succeeded first try). */
  attempts: number;
  /** True iff at least one retry was a self-correction (not the first call). */
  selfCorrected: boolean;
  /** Validation issues from the prior failed attempt, if any. */
  lastValidationIssues?: ValidationIssue[];
}

export interface ValidationIssue {
  path: string;
  message: string;
}

/* ------------------------------------------------------------------ */
/* Validation-error detection                                         */
/* ------------------------------------------------------------------ */

/**
 * Walk the error chain (and AI-SDK-specific `cause` properties) looking for
 * a ZodError. Returns the issue list or null when the error isn't a schema
 * validation failure.
 */
export function extractValidationIssues(err: unknown): ValidationIssue[] | null {
  const visited = new Set<unknown>();
  const queue: unknown[] = [err];

  while (queue.length > 0) {
    const candidate = queue.shift();
    if (!candidate || visited.has(candidate)) continue;
    visited.add(candidate);

    if (candidate instanceof ZodError) {
      return candidate.issues.map((i) => ({
        path: Array.isArray(i.path) ? i.path.join(".") : String(i.path ?? ""),
        message: i.message,
      }));
    }

    // The AI SDK frequently wraps the underlying ZodError as `cause` (one or
    // two levels deep, depending on the version). Walk all relevant props
    // defensively.
    if (typeof candidate === "object" && candidate !== null) {
      const c = candidate as Record<string, unknown>;
      if (c.cause) queue.push(c.cause);
      if (c.error) queue.push(c.error);
      if (c.originalError) queue.push(c.originalError);
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Corrective prompt                                                  */
/* ------------------------------------------------------------------ */

/**
 * Build a directive appended to the system prompt for the next attempt.
 * Quotes each Zod issue with its dotted path so the LLM can locate the
 * field, plus generic guidance on how to fix common mistakes.
 */
export function buildCorrectionDirective(issues: ValidationIssue[]): string {
  if (issues.length === 0) return "";
  const numbered = issues
    .slice(0, 8) // truncate runaway issue lists
    .map((i, n) => `${n + 1}. path \`${i.path || "(root)"}\` — ${i.message}`)
    .join("\n");

  return [
    "",
    "",
    "## SELF-CORRECTION REQUIRED",
    "Your previous response failed schema validation. Fix these issues and re-emit the JSON:",
    "",
    numbered,
    "",
    "Reminders:",
    "- Required fields must be present and non-null.",
    "- String fields must respect minimum and maximum lengths.",
    "- Number fields must respect range bounds.",
    "- Enum fields must match one of the listed values exactly.",
    "- Arrays must respect length constraints (min/max items).",
    "- Do NOT add fields the schema does not declare.",
    "Output JSON only, no prose, no code fences.",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Public entry                                                       */
/* ------------------------------------------------------------------ */

/**
 * Inject a different generateObject impl for tests.
 * The signature mirrors the AI SDK's; parameters are passed through.
 */
export type GenerateObjectImpl = (params: GenerateObjectParams) => Promise<GenerateObjectResult>;

export async function generateObjectWithSelfCorrection<T>(
  params: SelfCorrectingParams<T>,
  generateImpl?: GenerateObjectImpl,
): Promise<SelfCorrectingResult<T>> {
  const gen = generateImpl ?? (generateObject as unknown as GenerateObjectImpl);
  const maxAttempts = Math.max(0, params.maxSelfCorrectionAttempts ?? 2);
  const innerMaxRetries = params.innerMaxRetries ?? 2;

  let augmentedSystem = params.system;
  let lastIssues: ValidationIssue[] | undefined;

  for (let attempt = 1; attempt <= maxAttempts + 1; attempt++) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const callParams: any = {
        ...(params.extra ?? {}),
        model: params.model,
        // The runtime SDK accepts Zod schemas directly; the type is
        // intentionally loose here to avoid pinning to one SDK version.
        schema: params.schema,
        system: augmentedSystem,
        prompt: params.prompt,
        temperature: params.temperature ?? 0,
        maxRetries: innerMaxRetries,
      };
      const { object } = await gen(callParams);

      return {
        object: object as unknown as T,
        attempts: attempt,
        selfCorrected: attempt > 1,
        lastValidationIssues: lastIssues,
      };
    } catch (err) {
      const issues = extractValidationIssues(err);
      const isLastAttempt = attempt > maxAttempts;

      if (!issues) {
        // Not a validation error — let auth/rate-limit/network bubble up.
        throw err;
      }

      lastIssues = issues;

      if (isLastAttempt) {
        logger.warn(
          `[llmSelfCorrect] exhausted self-correction budget after ${attempt} attempts; rethrowing. Issues: ${JSON.stringify(issues.slice(0, 3))}`,
        );
        throw err;
      }

      logger.debug(
        `[llmSelfCorrect] attempt ${attempt} failed validation; retrying with corrective prompt (${issues.length} issues)`,
      );
      augmentedSystem = params.system + buildCorrectionDirective(issues);
    }
  }

  // Defensive fallback — the loop above always returns or throws.
  throw new Error("[llmSelfCorrect] reached unreachable path — please file a bug");
}
