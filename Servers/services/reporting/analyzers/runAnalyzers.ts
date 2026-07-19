import type { ReportData } from "../../../domain.layer/interfaces/i.reportGeneration";
import { createModelFromKey, resolveModelId, type LLMKeyRow } from "../../../advisor/llmModelFactory";
import { generateObjectWithSelfCorrection } from "../../../advisor/llmSelfCorrect";
import logger from "../../../utils/logger/fileLogger";
import { ANALYZERS, ANALYZER_VERSION, type AnalysisSectionKey, type AnalyzerExtras } from "./registry";
import { runSectionSummaries } from "./sectionSummaries";

/**
 * Every key that can be gated or produce a result.
 *
 * `sectionSummaries` is deliberately NOT in the ANALYZERS registry — its output
 * is Record<string,string> rather than a schema-validated object, so it does not
 * fit AnalyzerDefinition. But it IS a gateable block and it DOES produce a
 * result, so both types below must admit it. Task 6a fills in the runtime side;
 * the types are declared here, once, so the two never drift.
 */
export type AnalyzedKey = AnalysisSectionKey | "sectionSummaries";

export type AiBlocks = Record<AnalyzedKey, boolean>;

export interface AnalyzerRunResult {
  payload: any;
  abstained: boolean;
  abstain_reason: string | null;
  model: string | null;
  attempts: number;
}

export type AnalyzerResults = Partial<Record<AnalyzedKey, AnalyzerRunResult>>;

export interface RunAnalyzersInput {
  reportData: ReportData;
  llmKey: (LLMKeyRow & { id?: number }) | null;
  blocks: AiBlocks;
  extras?: AnalyzerExtras;
  /**
   * Names/emails/roles that may legitimately appear as a suggestedOwner.
   * Anything else the model produces is nulled — never attribute an action to
   * somebody who is not in the organization.
   */
  allowedOwners?: string[];
}

function abstain(reason: string, model: string | null = null): AnalyzerRunResult {
  return { payload: null, abstained: true, abstain_reason: reason, model, attempts: 0 };
}

/**
 * Ported from aiSummarizer.sanitizeRecommendedActions (which was never wired
 * into anything). Drops any suggestedOwner that is not a known org member.
 */
export function sanitizeOwners(actions: any[] | undefined, allowedOwners: string[]): any[] {
  const allow = new Set(allowedOwners.map((s) => String(s).toLowerCase()));
  return (actions ?? []).map((a) => ({
    ...a,
    suggestedOwner:
      a.suggestedOwner && allow.has(String(a.suggestedOwner).toLowerCase()) ? a.suggestedOwner : null,
  }));
}

/** Analyzers that consume per-section summaries rather than raw section data. */
const SUMMARY_CONSUMERS: AnalysisSectionKey[] = [
  "executiveSummary",
  "keyFindings",
  "recommendedActions",
];

/** Matches aiSummarizer's per-call budget (aiSummarizer.ts:20) — bounds a stalled provider. */
const LLM_TIMEOUT_MS = 30_000;

/**
 * Run every enabled analyzer. Pure: no DB, no req/res.
 *
 * TWO STAGES, and the ordering is load-bearing. `aiSummarizer` (the shipped
 * code this replaces) fed the executive summary, key findings and recommended
 * actions from already-compressed per-section summaries, not from raw section
 * JSON — see aiSummarizer.ts:215-254 and :260-310. Feeding them raw sections
 * instead measured ~38k tokens per prompt against ~6k, sent three times per
 * report, which can exceed a tenant's context window and lose all three
 * sections at once. So:
 *
 *   Stage 1 — sectionSummaries (fans out per section, concurrency 3) plus
 *             riskAnalysis / complianceGap / vendorRisk, which read raw
 *             sections and readiness and have no such dependency.
 *   Stage 2 — the three summary consumers, fed Stage 1's summaries.
 *
 * Promise.allSettled within each stage, never Promise.all — analyzers must not
 * become ways to lose a report. A failure abstains that one section.
 */
export async function runAnalyzers(input: RunAnalyzersInput): Promise<AnalyzerResults> {
  const { reportData, llmKey, blocks, extras = {}, allowedOwners = [] } = input;
  const enabled = (Object.keys(ANALYZERS) as AnalysisSectionKey[]).filter((k) => blocks?.[k]);
  if (enabled.length === 0 && !blocks?.sectionSummaries) return {};

  const results: AnalyzerResults = {};

  if (!llmKey) {
    const allEnabled: AnalyzedKey[] = blocks?.sectionSummaries
      ? [...enabled, "sectionSummaries"]
      : enabled;
    for (const key of allEnabled) {
      results[key] = abstain("no LLM key is configured for this organization");
    }
    return results;
  }

  const model = createModelFromKey(llmKey);
  // Same id createModelFromKey actually calls out to (row.model, or the
  // provider default it substitutes when row.model is falsy) — never null
  // for a call that used a real model.
  const modelLabel = resolveModelId(llmKey);

  const runOne = async (
    key: AnalysisSectionKey,
    stageExtras: AnalyzerExtras,
  ): Promise<readonly [AnalysisSectionKey, AnalyzerRunResult]> => {
    const def = ANALYZERS[key];
    const userPrompt = def.buildUserPrompt(reportData, stageExtras);
    if (!userPrompt) {
      // Summary consumers' buildUserPrompt returns "" for exactly one reason:
      // extras.sectionSummaries was empty (registry.ts renderSummaries). The
      // raw-section analyzers return "" when their own input data is empty.
      // Saying "insufficient data" for the former would be false — the data
      // may be plentiful; the summaries step just didn't run or produced
      // nothing.
      const reason = SUMMARY_CONSUMERS.includes(key)
        ? "no section summaries were available to summarise"
        : "insufficient data for this section";
      return [key, abstain(reason, modelLabel)] as const;
    }

    const result = await generateObjectWithSelfCorrection({
      model,
      schema: def.schema,
      system: def.buildSystemPrompt(),
      prompt: userPrompt,
      maxSelfCorrectionAttempts: 1,
      extra: { abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS) },
    });

    let payload: any = result.object;
    if (key === "recommendedActions") {
      payload = { ...payload, actions: sanitizeOwners(payload.actions, allowedOwners) };
    }

    return [
      key,
      {
        payload,
        abstained: !!payload?.abstain_reason,
        abstain_reason: payload?.abstain_reason ?? null,
        model: modelLabel,
        attempts: result.attempts,
      },
    ] as const;
  };

  type RunOutcome = readonly [AnalysisSectionKey, AnalyzerRunResult];

  const collect = (settled: PromiseSettledResult<RunOutcome>[], keys: AnalysisSectionKey[]) => {
    settled.forEach((outcome, i) => {
      const key = keys[i];
      if (outcome.status === "fulfilled") {
        const [k, v] = outcome.value;
        results[k] = v;
        return;
      }
      const message = outcome.reason instanceof Error ? outcome.reason.message : "unknown error";
      logger.warn(`Report analyzer "${key}" failed (${ANALYZER_VERSION}): ${message}`);
      // The raw SDK error can carry a custom baseURL, request path or partial
      // key fragment (OpenRouter, vLLM, self-hosted gateways). That detail
      // stays in the log line above; the persisted, regulator-facing field
      // gets a generic, honest sentence instead.
      results[key] = abstain(
        "this analysis could not be produced because the AI service call failed",
        modelLabel,
      );
    });
  };

  // ---- Stage 1: section summaries + the raw-section analyzers -------------
  const stage1Keys = enabled.filter((k) => !SUMMARY_CONSUMERS.includes(k));
  const stage2Keys = enabled.filter((k) => SUMMARY_CONSUMERS.includes(k));

  // Summaries are an input DEPENDENCY of Stage 2, not a peer block. The block
  // flag governs whether they are RECORDED as their own result (and rendered
  // as the 24 sectionSummaries blocks), not whether they are produced. Gating
  // production on that flag alone would make every executiveSummary/
  // keyFindings/recommendedActions call abstain whenever a consumer wants
  // summaries but the sectionSummaries block itself is off.
  const needSummaries = !!blocks.sectionSummaries || stage2Keys.length > 0;

  const [summaries, stage1] = await Promise.all([
    needSummaries
      ? runSectionSummaries(model, reportData).catch((e: unknown) => {
          logger.warn("Section summaries failed wholesale", e);
          return {} as Record<string, string>;
        })
      : Promise.resolve({} as Record<string, string>),
    Promise.allSettled(stage1Keys.map((k) => runOne(k, extras))),
  ]);

  collect(stage1, stage1Keys);

  if (blocks.sectionSummaries) {
    const count = Object.keys(summaries).length;
    // Always record a result when the block was enabled, even if it produced
    // nothing — ai_status silently missing a key it was asked to run reads as
    // "never requested" rather than "produced nothing".
    results.sectionSummaries = {
      payload: count > 0 ? { summaries } : null,
      abstained: count === 0,
      abstain_reason: count === 0 ? "no section produced a summary" : null,
      model: modelLabel,
      attempts: count,
    };
  }

  // ---- Stage 2: the summary consumers ------------------------------------
  // They read extras.sectionSummaries. With no summaries their buildUserPrompt
  // returns "" and they abstain without spending a call — which is exactly the
  // behaviour of the code being replaced (aiSummarizer.ts:227 returns "" when
  // summariesText is empty).
  if (stage2Keys.length > 0) {
    const stage2Extras: AnalyzerExtras = { ...extras, sectionSummaries: summaries };
    collect(
      await Promise.allSettled(stage2Keys.map((k) => runOne(k, stage2Extras))),
      stage2Keys,
    );
  }

  return results;
}
