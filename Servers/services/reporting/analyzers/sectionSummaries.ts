import { generateText } from "ai";
import type { ReportData } from "../../../domain.layer/interfaces/i.reportGeneration";
import logger from "../../../utils/logger/fileLogger";
import { referenceDay } from "./facts";
import {
  GENERIC_SECTION_INSTRUCTION,
  hasContent,
  MAX_PROMPT_CHARS,
  prepareSectionData,
  SECTION_INSTRUCTIONS,
  SECTION_LABELS,
} from "./prompts";

/**
 * One section's budget. Sized independently of runAnalyzers.ts's
 * LLM_TIMEOUT_MS: this path calls generateText directly, not
 * generateObjectWithSelfCorrection, so there is no per-attempt retry to budget
 * for — and an abort here is unrecoverable, `summariseSection` catches it into
 * an empty string and the section is dropped from the three Stage-2 analyzers
 * that consume it.
 *
 * Sized from wall clock, not from tokens. It was 30s on the reasoning that the
 * ask (300-450 words plus a reasoning pass, ~1.3k tokens) sits well under
 * SECTION_SUMMARY_MAX_TOKENS. The token arithmetic was right and the budget was
 * still wrong: a slow endpoint spends far longer on those tokens than a fast
 * one. Measured 2026-07-29 against NVIDIA NIM serving deepseek-v4-flash — an
 * 8.3k-char compliance section took 56.7s for 608 output tokens, a 37.8k-char
 * assessment section 75.3s for 935, BOTH finishReason "stop". Nothing was
 * truncated and nothing was over-generating; 30s simply cut off answers the
 * model was producing correctly. Extrapolating to a section clamped at
 * MAX_PROMPT_CHARS (60k) gives roughly 120s.
 *
 * So: raise this when the slowest endpoint a tenant may point at gets slower,
 * or when the ask grows — not because the token ceiling moved.
 */
export const SECTION_SUMMARY_TIMEOUT_MS = 120_000;

/**
 * The whole stage's budget, and the reason the per-section one above can be
 * this large.
 *
 * POST /reporting/templates/:id/run runs the report synchronously, and Node
 * kills a request at its 300s `requestTimeout` default (nothing in this app
 * overrides it). A per-section budget alone does not bound the stage: twelve
 * sections at MAX_CONCURRENT is four waves, and four waves of 120s is 480s —
 * the request would die with the run still marked running. The old 30s
 * per-section budget was what kept the stage under that ceiling, so raising it
 * has to put the protection back explicitly.
 *
 * 150s leaves room for Stage 2, which runs its consumers concurrently at
 * runAnalyzers.ts's 60s per attempt, plus rendering and delivery — about 210s
 * for a run whose Stage 2 succeeds first try. A section that cannot start
 * before the deadline is skipped, and one that starts late gets only the
 * remainder: an empty string, dropped from the output, exactly as a per-section
 * timeout already produces.
 *
 * Residual, unchanged by this file: a Stage-2 analyzer that spends its full
 * two self-corrections costs 180s, and 150 + 180 overruns the 300s ceiling. It
 * needs a twelve-section report AND a triple-retry to happen, and the real fix
 * is moving run-now onto BullMQ with a 202/poll response — already on record as
 * its own piece of work. Sizing this stage smaller would not close it, only
 * trade a rare overrun for routinely dropped summaries.
 */
export const SECTION_SUMMARY_STAGE_BUDGET_MS = 150_000;

/**
 * Was an inline 500 against a "150-250 words" ask. Run 2 hit that ceiling and
 * was cut off at 997 characters mid-sentence, and because nothing looked at
 * finishReason the executive summary silently finished the sentence for it.
 *
 * 900 was the next guess, and it sized the VISIBLE answer only. Run 4 hit the
 * cap on all eight sections and returned empty text on seven of them: the
 * configured model (`deepseek-v4-flash`) is a reasoning model, and a provider
 * bills reasoning tokens against `maxOutputTokens` before the first character
 * of the answer is emitted. Measured directly against the API on a 2.5k-token
 * section prompt: 660 reasoning + 659 answer tokens. So the budget has to hold
 * BOTH, and the reasoning half is the part that varies with input size.
 *
 * 3000 holds the 300-450 word ask below (~600 tokens) plus roughly 2x the
 * measured reasoning. A non-reasoning model simply leaves the rest unspent —
 * this is a ceiling, not a target.
 */
export const SECTION_SUMMARY_MAX_TOKENS = 3000;

export const MAX_CONCURRENT = 3;

/** Ported from aiSummarizer.ts:150-167. No third-party dependency. */
async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  });
  await Promise.all(workers);
  return results;
}

/** Clamp section data to the shared prompt budget, matching renderSections' marker (Fix 4). */
function clampSectionData(key: string, data: any): string {
  const body = prepareSectionData(key, data);
  return body.length > MAX_PROMPT_CHARS
    ? `${body.slice(0, MAX_PROMPT_CHARS)}\n\n[TRUNCATED: section data exceeded the prompt budget]`
    : body;
}

async function summariseSection(
  key: string,
  data: any,
  frameworkName: string,
  projectTitle: string,
  referenceDate: string,
  model: any,
  /** Epoch ms the whole stage must be finished by. */
  stageDeadline: number,
): Promise<string> {
  try {
    // Whichever runs out first. A section that cannot start at all is skipped
    // without a call rather than opening one the deadline will abort anyway.
    const remaining = stageDeadline - Date.now();
    if (remaining <= 0) {
      logger.warn(`Section summary for "${key}" skipped: the stage time budget was already spent`);
      return "";
    }
    const timeoutMs = Math.min(SECTION_SUMMARY_TIMEOUT_MS, remaining);
    const label = SECTION_LABELS[key] || key;
    const prompt = `You are an AI governance analyst writing the "${label}" section analysis for a ${frameworkName} compliance report on the project "${projectTitle}".

Reference date: ${referenceDate} — treat this as today when comparing any date in the data.

Analyze the following data and write a section analysis (300-450 words) that answers these questions:
${SECTION_INSTRUCTIONS[key] ?? GENERIC_SECTION_INSTRUCTION}

Every claim must carry the value it rests on: a count, a share, a status, a name or a date. A sentence that would read the same for any other organization is not an analysis.

Write in professional third-person tone. Do not use markdown formatting. Do not include headers or bullet points — write flowing paragraphs only.

Use only the data provided — never introduce a fact that does not appear in it. Counting, ranking and computing ratios or differences over the supplied values is expected.

Data:
${clampSectionData(key, data)}`;

    const result = await generateText({
      model,
      prompt,
      maxOutputTokens: SECTION_SUMMARY_MAX_TOKENS,
      abortSignal: AbortSignal.timeout(timeoutMs),
    });
    if (result.finishReason === "length") {
      // These summaries are the INPUT to the executive summary, key findings
      // and recommended actions, so a sentence cut off here propagates into
      // three headline blocks. Keep the text — a truncated summary beats none
      // — but stop it happening silently.
      logger.warn(
        `Section summary for "${key}" was truncated: the model hit the ${SECTION_SUMMARY_MAX_TOKENS}-token output cap`,
      );
    }
    return result.text.trim();
  } catch (error) {
    logger.warn(`Section summary failed for "${key}":`, error);
    return "";
  }
}

/**
 * Per-section AI summaries, keyed by section key — the producer for the 24
 * `sectionSummaries[...]` render blocks across the PDF and DOCX templates.
 *
 * The prompt asks SECTION_INSTRUCTIONS' questions for this section's own key,
 * falling back to GENERIC_SECTION_INSTRUCTION — aiSummarizer.ts:184-195's
 * original four bullets — for an unmapped key. Free prose rather
 * than a structured object, so it stays on generateText; an empty string is
 * dropped so a failed section renders as no box rather than an empty one.
 */
export async function runSectionSummaries(
  model: any,
  reportData: ReportData,
): Promise<Record<string, string>> {
  const entries = Object.entries((reportData?.sections ?? {}) as Record<string, any>).filter(
    ([, data]) => hasContent(data),
  );
  if (entries.length === 0) return {};

  const frameworkName = reportData.metadata?.frameworkName ?? "AI governance";
  const projectTitle = reportData.metadata?.projectTitle ?? "the organization";
  const referenceDate = referenceDay(reportData.metadata?.generatedAt);

  // One deadline for the whole stage, fixed before the first call so a late
  // wave inherits what earlier ones left rather than starting its own clock.
  const stageDeadline = Date.now() + SECTION_SUMMARY_STAGE_BUDGET_MS;

  const summaries = await runWithConcurrency(
    entries.map(
      ([key, data]) => () =>
        summariseSection(
          key,
          data,
          frameworkName,
          projectTitle,
          referenceDate,
          model,
          stageDeadline,
        ),
    ),
    MAX_CONCURRENT,
  );

  const out: Record<string, string> = {};
  entries.forEach(([key], i) => {
    if (summaries[i]) out[key] = summaries[i];
  });

  const failed = entries.length - Object.keys(out).length;
  if (failed > 0) {
    logger.warn(`section summaries: ${failed} of ${entries.length} failed`);
  }

  return out;
}
