// Servers/services/intakeScoring/aiScoring.ts
// Five independent LLM scoring runs over a submission's answers. Pure service
// code: no DB, no routes. Reasons are kept only when they quote the answer.
import { z } from "zod";
import { generateObjectWithSelfCorrection, GenerateObjectImpl } from "../../advisor/llmSelfCorrect";
import type { createModelFromKey } from "../../advisor/llmModelFactory";
import logger from "../../utils/logger/fileLogger";
import { median } from "./scoreMath";
import type { ClassificationLevel } from "./scoreMath";
import type { ScoringAnswer } from "./scoringInput";
import { buildScoringSystemPrompt, buildScoringUserPrompt, newDelimiterNonce } from "./prompts";

export interface AiReason {
  text: string;
  questionId: string;
  excerpt: string;
}

export interface ClassificationContext {
  level: ClassificationLevel;
  reasons: Array<{ article: string; text: string }>;
}

export interface AiScoringResult {
  ok: boolean;
  runs: number[];
  failedRuns: number;
  validRuns: number;
  median: number | null;
  min: number | null;
  max: number | null;
  reasons: AiReason[];
  error?: string;
}

export const AI_SCORING_RUNS = 5;
export const MIN_VALID_RUNS = 3;

const scoringOutputSchema = z
  .object({
    score: z.number().int().min(0).max(100),
    reasons: z
      .array(
        z
          .object({
            text: z.string().max(400),
            questionId: z.string(),
            excerpt: z.string().max(300),
          })
          .strict(),
      )
      .max(6),
  })
  .strict();

type ScoringOutput = z.infer<typeof scoringOutputSchema>;

const normalise = (value: string): string => value.replace(/\s+/g, " ").trim().toLowerCase();

function validReasons(output: ScoringOutput, answers: ScoringAnswer[]): AiReason[] {
  const textById = new Map(answers.map((a) => [a.questionId, normalise(a.text)]));
  const seen = new Set<string>();
  const kept: AiReason[] = [];
  for (const reason of output.reasons) {
    const excerpt = normalise(reason.excerpt);
    const source = textById.get(reason.questionId);
    if (!excerpt || source === undefined || !source.includes(excerpt)) continue;
    if (seen.has(reason.text)) continue;
    seen.add(reason.text);
    kept.push(reason);
  }
  return kept;
}

export async function runAiScoring(params: {
  model: ReturnType<typeof createModelFromKey>;
  answers: ScoringAnswer[];
  classification: ClassificationContext | null;
  generateImpl?: GenerateObjectImpl;
}): Promise<AiScoringResult> {
  const { model, answers, classification, generateImpl } = params;
  const nonce = newDelimiterNonce();
  const system = buildScoringSystemPrompt(nonce);
  const prompt = buildScoringUserPrompt(answers, classification, nonce);

  const settled = await Promise.allSettled(
    Array.from({ length: AI_SCORING_RUNS }, () =>
      generateObjectWithSelfCorrection(
        {
          model,
          schema: scoringOutputSchema,
          system,
          prompt,
          temperature: 0.7,
          innerMaxRetries: 1,
          maxSelfCorrectionAttempts: 1,
        },
        generateImpl,
      ),
    ),
  );

  const outputs: ScoringOutput[] = [];
  let lastError = "";
  for (const run of settled) {
    if (run.status === "fulfilled") outputs.push(run.value.object);
    else {
      lastError = run.reason instanceof Error ? run.reason.message : String(run.reason);
      // The message only: never the prompt, the answers or the key.
      logger.warn(`intake AI scoring: run failed: ${lastError}`);
    }
  }

  const failedRuns = AI_SCORING_RUNS - outputs.length;
  const runs = outputs.map((o) => o.score);
  if (outputs.length < MIN_VALID_RUNS) {
    return {
      ok: false,
      runs,
      failedRuns,
      validRuns: outputs.length,
      median: null,
      min: null,
      max: null,
      reasons: [],
      error: `Only ${outputs.length} of ${AI_SCORING_RUNS} scoring runs succeeded${lastError ? `: ${lastError}` : ""}`,
    };
  }

  const med = median(runs);
  const closest = outputs.reduce((best, o) =>
    Math.abs(o.score - med) < Math.abs(best.score - med) ? o : best,
  );
  return {
    ok: true,
    runs,
    failedRuns,
    validRuns: outputs.length,
    median: med,
    min: Math.min(...runs),
    max: Math.max(...runs),
    reasons: validReasons(closest, answers),
  };
}
