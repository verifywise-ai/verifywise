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
 *   - Three provider-repair behaviours sit behind the `extendedRecovery`
 *     opt-in and are OFF by default, so a caller with its own fallback keeps
 *     getting the raw error:
 *       - a `NoObjectGeneratedError` (empty or truncated completion — no
 *         object to validate, so no Zod issues) retried with
 *         `TRUNCATION_DIRECTIVE`. It CONSUMES an attempt and sets `attempts` /
 *         `selfCorrected`, unlike the two transport downgrades, which repair
 *         what we sent and so give the budget back.
 *       - two transport downgrades, each one-shot and budget-neutral: the
 *         json_schema → json_object switch (`isResponseFormatUnsupported`) and
 *         the maxOutputTokens cap (`isMaxOutputTokensRejected`). Both are
 *         provider 400s, never a NoObjectGeneratedError.
 */

import {
  generateObject,
  NoObjectGeneratedError,
  wrapLanguageModel,
  type LanguageModelMiddleware,
} from "ai";
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
   * When set, each attempt gets its OWN AbortSignal.timeout(timeoutMs).
   * When absent, behaviour is unchanged (existing callers keep working).
   */
  timeoutMs?: number;
  /**
   * Opt in to the three provider-repair behaviours: the truncation retry, the
   * json_schema → json_object transport downgrade, and the maxOutputTokens
   * cap-and-retry. Off by default — each one turns an error into a degraded
   * answer, which is the right trade only for a caller with no fallback of its
   * own. The evidence analyzer, control matcher and planner all have one
   * (heuristic grading, empty match list, single-plan) and are better served by
   * the raw error, so they must not get these implicitly.
   *
   * An explicit flag rather than keying off `timeoutMs` (today's only opt-in
   * caller sets both): a timeout is about wall-clock budget and says nothing
   * about whether a caller wants degraded output, and conflating them hands the
   * next caller that just wants a deadline all three behaviours by surprise —
   * which is precisely the regression this flag exists to close.
   */
  extendedRecovery?: boolean;
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
  /**
   * Number of self-correction attempts (1 = succeeded first try). The two
   * transport downgrades re-issue the call without counting, so this can be
   * lower than the number of provider calls actually made.
   */
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
 * The wrapper properties an AI SDK error hangs its underlying cause off — its
 * own `cause` plus the SDK's `error` / `originalError`. A ZodError is only ever
 * reachable through these, so `extractValidationIssues` follows exactly this
 * list.
 */
const ZOD_CHAIN_KEYS = ["cause", "error", "originalError"] as const;

/**
 * The same, plus the `data` / `responseBody` carriers holding a provider's raw
 * HTTP body. Text worth scanning for a message, but never a ZodError — so only
 * `errorMessages` descends into them.
 */
const MESSAGE_SCAN_KEYS = [...ZOD_CHAIN_KEYS, "data", "responseBody"] as const;

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
      for (const k of ZOD_CHAIN_KEYS) {
        if (c[k]) queue.push(c[k]);
      }
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* JSON-object fallback for providers without json_schema support     */
/* ------------------------------------------------------------------ */

/**
 * Every message string reachable from an error, following every
 * `MESSAGE_SCAN_KEYS` carrier. Cycle-safe.
 */
function errorMessages(err: unknown): string {
  const messages: string[] = [];
  const visited = new Set<unknown>();
  const queue: unknown[] = [err];

  while (queue.length > 0) {
    const candidate = queue.shift();
    if (!candidate || visited.has(candidate)) continue;
    visited.add(candidate);

    if (typeof candidate === "string") {
      messages.push(candidate);
      continue;
    }
    if (typeof candidate === "object") {
      const c = candidate as Record<string, unknown>;
      if (typeof c.message === "string") messages.push(c.message);
      for (const k of MESSAGE_SCAN_KEYS) {
        if (c[k]) queue.push(c[k]);
      }
    }
  }

  return messages.join(" ");
}

/* ------------------------------------------------------------------ */
/* Salvaging a complete object the provider wrapped in prose          */
/* ------------------------------------------------------------------ */

/**
 * Every `{...}` span in `text` that is balanced, in source order.
 *
 * Brace counting alone is not enough: a brace inside a string literal, or an
 * escaped quote inside one, throws the count off and yields a span that either
 * ends early or never closes. So the scan tracks whether it is inside a string
 * and whether the previous character was a backslash.
 */
function* balancedObjectSpans(text: string): Generator<string> {
  for (let start = 0; start < text.length; start++) {
    if (text[start] !== "{") continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
      const ch = text[i];

      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }

      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          yield text.slice(start, i + 1);
          break;
        }
      }
    }
  }
}

/**
 * The caller's object, recovered from a completion the provider wrapped in
 * prose — or null when there is nothing complete and valid in there.
 *
 * NVIDIA NIM serving deepseek-ai/deepseek-v4-flash answers a json_schema
 * request with HTTP 200 and a reasoning fragment glued to the front of the
 * JSON: `We{"summary": ...}`. The object is complete and schema-valid; only
 * `generateObject`'s strict parse fails, and the whole analysis is then thrown
 * away. Observed 2026-07-29 against the live endpoint.
 *
 * Every candidate is parsed AND validated against the caller's schema, and a
 * failure resumes the scan at the next `{` rather than giving up. That is what
 * separates this from a lucky first-brace grab: reasoning that mentions an
 * object of its own ("We need {...} first") cannot hijack the result, and a
 * truncated completion — nothing balanced to find — still throws, which is what
 * keeps the evidence analyzer falling back to heuristic grading.
 */
export function salvageObjectFromText<T>(text: unknown, schema: z.ZodType<T>): T | null {
  if (typeof text !== "string" || text.length === 0) return null;

  for (const span of balancedObjectSpans(text)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(span);
    } catch {
      continue;
    }
    const result = schema.safeParse(parsed);
    if (result.success) return result.data;
  }

  return null;
}

/**
 * True when the error is a provider rejecting the `json_schema` response_format
 * that structured outputs rely on — DeepSeek and many custom / self-hosted
 * OpenAI-compatible endpoints do this ("This response_format type is
 * unavailable now"). Distinct from a schema-validation failure (handled by
 * self-correction) and from auth/network errors (which bubble up).
 */
export function isResponseFormatUnsupported(err: unknown): boolean {
  return /response_format|json[_ ]?schema|structured\s*output/i.test(errorMessages(err));
}

/**
 * The output ceiling every model this product can be pointed at accepts.
 * Anthropic's claude-3 family and OpenAI's gpt-4-turbo hard-cap `max_tokens`
 * here and answer a larger ask with a 400, so it is the value to retry with
 * when a provider rejects ours. Every other call site in the repo asks for
 * exactly this (aiSdkAgent.ts, orchestrator.ts).
 */
export const PROVIDER_SAFE_MAX_OUTPUT_TOKENS = 4096;

/**
 * True when the provider rejected the request because the `maxOutputTokens` we
 * asked for is above that model's ceiling. `llm_keys.model` is free-form tenant
 * text with no allowlist, so a caller sizing its budget for one model cannot
 * know another tenant's model caps lower. Matches Anthropic's "max_tokens: N >
 * M, which is the maximum allowed number of output tokens" and OpenAI's
 * "max_tokens is too large … supports at most M completion tokens".
 */
export function isMaxOutputTokensRejected(err: unknown): boolean {
  return /max_tokens is too large|maximum allowed number of output tokens|supports at most \d+ completion tokens/i.test(
    errorMessages(err),
  );
}

/**
 * Downgrades a structured-output call to plain JSON-object mode. Drops the
 * schema from responseFormat (so the provider receives
 * `response_format: { type: "json_object" }` instead of `json_schema`) and
 * moves the schema into a system message so the model still knows the exact
 * shape. `generateObject` still parses and validates the returned JSON against
 * the caller's zod schema, and `llmSelfCorrect` still repairs violations — only
 * the transport mechanism changes, not the correctness guarantees.
 */
export const jsonObjectFallbackMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  transformParams: async ({ params }) => {
    const rf = params.responseFormat;
    if (!rf || rf.type !== "json" || rf.schema == null) return params;

    const guidance = {
      role: "system" as const,
      content:
        "You must respond with a single JSON object that strictly conforms to " +
        "the following JSON Schema. Output ONLY raw JSON — no prose, no " +
        "explanation, no markdown, no code fences.\n\nJSON Schema:\n" +
        JSON.stringify(rf.schema),
    };

    return {
      ...params,
      prompt: [guidance, ...params.prompt],
      responseFormat: { type: "json" },
    };
  },
};

/* ------------------------------------------------------------------ */
/* Corrective prompt                                                  */
/* ------------------------------------------------------------------ */

/**
 * Appended to the system prompt after a response that produced no parseable
 * object. There are no Zod issues to quote — nothing was validated — so this
 * says what actually went wrong instead.
 *
 * The last line trades depth for completion deliberately: asking for minimum
 * lengths pulls against a caller whose prompt demands substance, and the
 * recovered payload may well be thinner than the first attempt intended. A
 * minimal complete object beats a lost section — but only as a recovery, which
 * is why this is never sent on the first attempt.
 */
export const TRUNCATION_DIRECTIVE = [
  "",
  "",
  "## PREVIOUS RESPONSE UNUSABLE",
  "Your previous response ended before a complete JSON object was emitted: it was empty, or cut off mid-object.",
  "Emit the JSON object and nothing else — begin with `{` on the first character.",
  "Do not think out loud, restate the schema, or write any prose outside the object.",
  "Keep every string field to the shortest length that still satisfies its minimum, and every array to its minimum item count, so the object completes within the output budget.",
].join("\n");

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
  let model = params.model;
  let fellBackToJsonObject = false;
  let extra = params.extra;
  let cappedOutputTokens = false;

  for (let attempt = 1; attempt <= maxAttempts + 1; attempt++) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const callParams: any = {
        ...(extra ?? {}),
        model,
        // The runtime SDK accepts Zod schemas directly; the type is
        // intentionally loose here to avoid pinning to one SDK version.
        schema: params.schema,
        system: augmentedSystem,
        prompt: params.prompt,
        temperature: params.temperature ?? 0,
        maxRetries: innerMaxRetries,
        // Constructed INSIDE the loop, deliberately: a signal built once by
        // the caller and spread in from `extra` covers the first attempt and
        // every self-correction with one shared budget, so a slow first call
        // leaves the correction no time at all. Spread last so it also wins
        // over any abortSignal a caller left in `extra`.
        ...(params.timeoutMs ? { abortSignal: AbortSignal.timeout(params.timeoutMs) } : {}),
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
        // No parseable object came back at all — an empty completion, or JSON
        // cut off mid-object. That is a failed attempt, not a fatal error, and
        // rethrowing here spends none of the correction budget: the caller gets
        // one shot and a single truncated response loses the whole section.
        // Common with reasoning models, whose reasoning tokens are billed
        // against maxOutputTokens before any answer is emitted. This DOES
        // consume an attempt: a model that cannot finish will not finish on
        // the tenth try either.
        //
        // Handled here and nowhere else — this branch always continues or
        // throws, so the two transport downgrades below can never see a
        // NoObjectGeneratedError. That matters: a truncated completion arrives
        // wrapped around a JSONParseError whose message embeds the whole raw
        // text (`JSON parsing failed: Text: …`), so prose that merely mentions
        // a JSON schema satisfies isResponseFormatUnsupported and would be
        // answered by prepending the entire schema to the system prompt —
        // enlarging the input that overran, and spending an extra provider
        // call once the correction budget is gone.
        if (NoObjectGeneratedError.isInstance(err)) {
          // Before treating this as a failed attempt: the completion may be
          // complete and schema-valid, with only prose in front of it. That is
          // the model's own answer, already paid for — recovering it is not the
          // degraded output the extendedRecovery gate exists to withhold, so it
          // runs for every caller.
          const salvaged = salvageObjectFromText(
            (err as { text?: unknown }).text,
            params.schema,
          );
          if (salvaged !== null) {
            logger.warn(
              `[llmSelfCorrect] provider wrapped the object in prose; salvaged it from the raw completion (${(err as Error).message})`,
            );
            return {
              object: salvaged,
              attempts: attempt,
              selfCorrected: attempt > 1,
              lastValidationIssues: lastIssues,
            };
          }

          if (!params.extendedRecovery || isLastAttempt) throw err;
          logger.warn(
            `[llmSelfCorrect] attempt ${attempt} returned no parseable object (${(err as Error).message}); retrying with a truncation directive`,
          );
          augmentedSystem = params.system + TRUNCATION_DIRECTIVE;
          continue;
        }

        // The model caps max_tokens below what this caller asked for, and the
        // provider answered 400 rather than clamping. `llm_keys.model` is
        // free-form tenant text, so a caller cannot size one budget that every
        // selectable model accepts; re-issue once at the universally-safe
        // ceiling instead of losing the call. Repairs what we sent, so like the
        // transport switch below it must not consume the correction budget.
        if (
          params.extendedRecovery &&
          !cappedOutputTokens &&
          Number(extra?.maxOutputTokens) > PROVIDER_SAFE_MAX_OUTPUT_TOKENS &&
          isMaxOutputTokensRejected(err)
        ) {
          cappedOutputTokens = true;
          extra = { ...extra, maxOutputTokens: PROVIDER_SAFE_MAX_OUTPUT_TOKENS };
          logger.warn(
            `[llmSelfCorrect] provider rejected maxOutputTokens=${params.extra?.maxOutputTokens}; retrying at ${PROVIDER_SAFE_MAX_OUTPUT_TOKENS}`,
          );
          attempt--;
          continue;
        }

        // A provider that rejects the json_schema response_format (DeepSeek and
        // many custom / self-hosted OpenAI-compatible endpoints) is neither a
        // validation error nor fatal: downgrade to JSON-object mode once and
        // retry. The schema still validates the result and self-correction
        // still repairs it, so this only changes transport, not correctness.
        if (params.extendedRecovery && !fellBackToJsonObject && isResponseFormatUnsupported(err)) {
          fellBackToJsonObject = true;
          model = wrapLanguageModel({
            model: params.model,
            middleware: jsonObjectFallbackMiddleware,
          });
          logger.warn(
            "[llmSelfCorrect] provider rejected json_schema response_format; retrying in JSON-object mode",
          );
          attempt--; // the transport switch must not consume the self-correction budget
          continue;
        }

        // Otherwise let auth/rate-limit/network bubble up.
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
