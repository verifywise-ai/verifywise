import { generateText } from "ai";
import type { ReportData } from "../../../domain.layer/interfaces/i.reportGeneration";
import logger from "../../../utils/logger/fileLogger";
import { hasContent, MAX_PROMPT_CHARS, prepareSectionData, SECTION_LABELS } from "./prompts";

const LLM_TIMEOUT_MS = 30_000;
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
  model: any,
): Promise<string> {
  try {
    const label = SECTION_LABELS[key] || key;
    const prompt = `You are an AI governance analyst writing the "${label}" section analysis for a ${frameworkName} compliance report on the project "${projectTitle}".

Analyze the following data and write a concise summary (150-250 words) that:
- Highlights key observations and patterns
- Identifies areas of concern or non-compliance
- Notes strengths and areas of good practice
- Provides context for decision-makers

Write in professional third-person tone. Do not use markdown formatting. Do not include headers or bullet points — write flowing paragraphs only.

Use only the data provided — never introduce a fact that does not appear in it.

Data:
${clampSectionData(key, data)}`;

    const result = await generateText({
      model,
      prompt,
      maxOutputTokens: 500,
      abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });
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
 * Prompt ported verbatim from aiSummarizer.ts:184-195, plus one added
 * grounding sentence ("Use only the data provided..."). Free prose rather
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

  const summaries = await runWithConcurrency(
    entries.map(([key, data]) => () => summariseSection(key, data, frameworkName, projectTitle, model)),
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
