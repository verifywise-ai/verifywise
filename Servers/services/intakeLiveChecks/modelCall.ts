// Servers/services/intakeLiveChecks/modelCall.ts
// Shared by the AI checks and the document prefill: exactly one model call
// under a hard deadline, with the output re-validated, plus the excerpt
// normalisation both use to check that a quote is really in its source.
import type { z } from "zod";
import { generateObjectWithSelfCorrection, GenerateObjectImpl } from "../../advisor/llmSelfCorrect";
import logger from "../../utils/logger/fileLogger";

export type ModelCallResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Whitespace-collapsed and lower-cased, for verbatim-quote checks. */
export const normaliseForMatch = (value: string): string =>
  value.replace(/\s+/g, " ").trim().toLowerCase();

/** Shortest verbatim quote a hint or suggestion may give; a shorter one matches almost anything. */
export const MIN_EXCERPT_CHARS = 15;

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export async function callModelOnce<T>(params: {
  model: unknown;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  timeoutMs: number;
  generate?: GenerateObjectImpl;
  /** Prefix for log lines, such as "intake live checks". */
  logLabel: string;
}): Promise<ModelCallResult<T>> {
  const { model, schema, system, prompt, timeoutMs, generate, logLabel } = params;

  let timer: NodeJS.Timeout | undefined;
  // The abort signal stops a well-behaved provider; this race also bounds a
  // call that ignores it.
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Timed out waiting for the model")), timeoutMs);
  });

  try {
    const { object } = await Promise.race([
      generateObjectWithSelfCorrection(
        {
          model,
          schema,
          system,
          prompt,
          temperature: 0,
          // Exactly one model call per run.
          innerMaxRetries: 0,
          maxSelfCorrectionAttempts: 0,
          timeoutMs,
        },
        generate,
      ),
      deadline,
    ]);
    // The real SDK validates already; an injected generate may not.
    const parsed = schema.safeParse(object);
    if (!parsed.success) {
      logger.warn(`${logLabel}: model output did not match the schema`);
      return { ok: false, error: "Model output did not match the schema" };
    }
    return { ok: true, data: parsed.data };
  } catch (err) {
    const message = errorMessage(err);
    // The message only: never the prompt, the answers, the document or the key.
    logger.warn(`${logLabel}: model call failed: ${message}`);
    return { ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}
