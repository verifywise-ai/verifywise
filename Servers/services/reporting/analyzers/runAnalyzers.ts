import type { ReportData } from "../../../domain.layer/interfaces/i.reportGeneration";
import {
  createModelFromKey,
  resolveModelId,
  type LLMKeyRow,
} from "../../../advisor/llmModelFactory";
import { generateObjectWithSelfCorrection } from "../../../advisor/llmSelfCorrect";
import logger from "../../../utils/logger/fileLogger";
import {
  INSUFFICIENT_DATA,
  LLM_CALL_FAILED,
  NO_LLM_KEY,
  NO_SUMMARIES_AVAILABLE,
  NO_SUMMARY_PRODUCED,
} from "./abstainReasons";
import { isRestatement } from "./novelty";
import {
  ANALYZERS,
  ANALYZER_VERSION,
  type AnalysisSectionKey,
  type AnalyzerExtras,
} from "./registry";
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
  /** True when the shallowness gate fired and the call was re-issued (§6).
   *  Optional so abstain() and sectionSummaries need not carry it. Persisted
   *  into audit_metadata by persistAnalyses — that is what makes the gate's
   *  firing observable after the run rather than only in the log. */
  restatementRetried?: boolean;
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
      a.suggestedOwner && allow.has(String(a.suggestedOwner).toLowerCase())
        ? a.suggestedOwner
        : null,
  }));
}

/**
 * Fields whose .describe() promises the value is "copied verbatim from the
 * input". zod validates SHAPE, not ORIGIN: an invented control id or vendor
 * name satisfies .strict() cleanly and lands in a formal compliance artifact.
 * So the check lives here, post-parse, against the exact prompt text the
 * analyzer was actually handed.
 *
 * DROP the item, never null the field, for all three — unlike suggestedOwner:
 *  - all three are non-nullable strings in schemas.ts, so nulling produces a
 *    payload that no longer validates against its own schema, and
 *  - each names the SUBJECT of its row. A gap with no control, a concern with
 *    no vendor and a risk with no name are content-free; a recommended action
 *    with no owner is still a usable action, which is why suggestedOwner is
 *    nullable and gets nulled instead.
 */
const VERBATIM_FIELDS: Partial<Record<AnalysisSectionKey, { list: string; field: string }>> = {
  complianceGap: { list: "gaps", field: "control" },
  vendorRisk: { list: "concerns", field: "vendor" },
  riskAnalysis: { list: "top_risks", field: "name" },
};

/**
 * Case-insensitive, whitespace-collapsed. Tolerates the model re-casing a name
 * or reflowing the JSON whitespace it was given, and nothing looser — matching
 * on tokens or prefixes would let a plausible-looking fabrication through,
 * which is the entire thing this guard exists to stop.
 */
const normalizeForProvenance = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Drop rows whose verbatim-marked identifier does not appear in this
 * analyzer's own prompt. Never throws: a fabricated row must cost that row,
 * not the report ("six analyzers must not become six ways to lose a report").
 *
 * ponytail: substring match against the whole prompt, which includes the
 * fixed instruction text. A 1-2 character or very generic value ("1",
 * "framework") can therefore collide with boilerplate and survive. Narrowing
 * that means having the registry hand back the data block separately from the
 * boilerplate — do it if a collision is ever observed in practice.
 */
export function sanitizeProvenance(key: AnalysisSectionKey, payload: any, rawInput: string): any {
  const spec = VERBATIM_FIELDS[key];
  const items = spec ? payload?.[spec.list] : undefined;
  if (!spec || !Array.isArray(items)) return payload;

  const haystack = normalizeForProvenance(rawInput);
  const kept = items.filter((item: any) => {
    const value = item?.[spec.field];
    if (typeof value !== "string" || !value.trim()) return false;
    return haystack.includes(normalizeForProvenance(value));
  });

  if (kept.length !== items.length) {
    const dropped = items
      .filter((i: any) => !kept.includes(i))
      .map((i: any) => JSON.stringify(i?.[spec.field]))
      .join(", ");
    logger.warn(
      `Report analyzer "${key}" (${ANALYZER_VERSION}) produced ${
        items.length - kept.length
      } ${spec.list} entr${items.length - kept.length === 1 ? "y" : "ies"} whose ${
        spec.field
      } is absent from its input; dropped: ${dropped}`,
    );
  }

  return { ...payload, [spec.list]: kept };
}

/** Analyzers that consume per-section summaries rather than raw section data. */
const SUMMARY_CONSUMERS: AnalysisSectionKey[] = [
  "executiveSummary",
  "keyFindings",
  "recommendedActions",
];

/**
 * Per-ATTEMPT budget — llmSelfCorrect builds a fresh AbortSignal.timeout for
 * each attempt from this, rather than one signal shared by the first call and
 * its self-correction. Doubled from aiSummarizer's 30s because an abort here
 * is not a retry, it is a generic abstention in a regulator-facing artifact.
 */
const LLM_TIMEOUT_MS = 60_000;

/**
 * Stated, not inherited. These payloads carry a 3500-character summary, or up
 * to eight findings that each now carry a counterfactual and a related-section
 * list — more than a provider's default ceiling reliably allows, and a silent
 * truncation here reads downstream as a short answer rather than a cut-off one.
 *
 * 2000 sized the JSON alone. A reasoning model (`deepseek-v4-flash`, the key
 * configured here) bills its reasoning tokens against this same ceiling before
 * emitting a character, so run 4 lost all five large-schema analyzers to
 * NoObjectGeneratedError — "the model did not return a response" is a budget
 * spent entirely on reasoning, "could not parse the response" is JSON cut off
 * mid-object. 6000 holds the largest payload plus room for the reasoning pass;
 * a non-reasoning model leaves the remainder unspent.
 *
 * 6000 is ABOVE the ceiling some selectable models enforce: claude-3-opus /
 * -sonnet / -haiku and gpt-4-turbo hard-cap max_tokens at 4096 and answer a
 * larger ask with a 400, and `llm_keys.model` is free-form tenant text with no
 * allowlist, so this file cannot know which. llmSelfCorrect catches that
 * rejection and re-issues once at PROVIDER_SAFE_MAX_OUTPUT_TOKENS without
 * spending the correction budget — asking high here costs those tenants one
 * extra call, not the analysis.
 */
const ANALYZER_MAX_OUTPUT_TOKENS = 6000;

/**
 * Prose fields the shallowness gate checks (§6). keyFindings and
 * recommendedActions have none: structured arrays are not checked.
 */
const PROSE_FIELD: Partial<Record<AnalysisSectionKey, string>> = {
  executiveSummary: "summary",
  riskAnalysis: "narrative",
  complianceGap: "narrative",
  vendorRisk: "narrative",
};

/** Appended to the system prompt for the one re-issue the gate allows. */
const RESTATEMENT_DIRECTIVE = `

## RESTATEMENT DETECTED
Your previous response reproduced its input rather than analysing it: the prose repeated the supplied text back with only cosmetic edits. Answer again from scratch. Do not reuse the input's sentences, clause order or phrasing. Say what the data implies that it does not state: which values are out of line with which others, which single item is most consequential and why, and what the supplied dates and counts mean when related to each other. If the data genuinely cannot support that, set abstain_reason and say so plainly — an honest abstention is correct and padding is not.`;

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
      results[key] = abstain(NO_LLM_KEY);
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
      const reason = SUMMARY_CONSUMERS.includes(key) ? NO_SUMMARIES_AVAILABLE : INSUFFICIENT_DATA;
      return [key, abstain(reason, modelLabel)] as const;
    }

    const system = def.buildSystemPrompt();
    const call = (systemPrompt: string) =>
      generateObjectWithSelfCorrection({
        model,
        schema: def.schema,
        system: systemPrompt,
        prompt: userPrompt,
        // Two corrections, not one: Task 45 added required keys to four row
        // objects, and a repeat omission must not cost the whole analysis.
        maxSelfCorrectionAttempts: 2,
        timeoutMs: LLM_TIMEOUT_MS,
        // This pipeline has no non-LLM fallback — a lost analyzer is a missing
        // section in the report — and the configured model is a reasoning model
        // whose max_tokens ceiling sits below ANALYZER_MAX_OUTPUT_TOKENS, so the
        // truncation retry and the two transport downgrades are what keep runs
        // whole. Callers that DO have a fallback (evidence grading, control
        // matching, planning) deliberately leave this off.
        extendedRecovery: true,
        extra: { maxOutputTokens: ANALYZER_MAX_OUTPUT_TOKENS },
      });

    // userPrompt is exactly what this analyzer was given, so it is the only
    // honest thing to check "copied verbatim from the input" against.
    const sanitize = (object: any): any => {
      const p = sanitizeProvenance(key, object, userPrompt);
      return key === "recommendedActions"
        ? { ...p, actions: sanitizeOwners(p.actions, allowedOwners) }
        : p;
    };
    const prose = (p: any): string => {
      const field = PROSE_FIELD[key];
      return field && typeof p?.[field] === "string" ? p[field] : "";
    };

    const first = await call(system);
    let payload: any = sanitize(first.object);
    let attempts = first.attempts;
    let restatementRetried = false;

    // Shallowness gate (§6). Skipped on an abstention: its prose is a sentence
    // about what is missing, and re-issuing would turn a cheap honest
    // abstention into a paid one.
    if (!payload?.abstain_reason && isRestatement(prose(payload), userPrompt)) {
      restatementRetried = true;
      logger.warn(
        `Report analyzer "${key}" (${ANALYZER_VERSION}) restated its input instead of analysing it; re-issuing once`,
      );
      // Counted BEFORE the call, so a re-issue that exhausts its budget and
      // rethrows still shows up in the one field that documents what the gate
      // cost. persistAnalyses writing restatement_retried:true beside the
      // attempt count of a run that never re-issued is an audit record
      // contradicting itself.
      //
      // ponytail: a floor of one, not the true count — llmSelfCorrect's
      // rethrow carries no attempt count, so the corrections it spent before
      // giving up are invisible here. Attach the count to that error if the
      // exact figure is ever needed.
      attempts += 1;
      try {
        const retry = await call(system + RESTATEMENT_DIRECTIVE);
        attempts += retry.attempts - 1;
        const retryPayload = sanitize(retry.object);
        // Two ways for the re-issue to produce no new analysis, treated
        // alike. The directive explicitly invites an abstention, and an
        // abstention's prose is far too short to trip isRestatement — so
        // without this the gate would swap a produced payload for an
        // abstention, which mapAnalysesToSummaries then drops out of the
        // report entirely. The gate is only safe to leave enabled because it
        // is strictly non-destructive.
        const retryAbstained = !!retryPayload?.abstain_reason;
        if (retryAbstained || isRestatement(prose(retryPayload), userPrompt)) {
          logger.warn(
            `Report analyzer "${key}" (${ANALYZER_VERSION}) ${
              retryAbstained ? "abstained on re-issue" : "restated its input again"
            }; keeping the first payload`,
          );
        } else {
          payload = retryPayload;
        }
      } catch (e) {
        // The gate must never convert a produced analysis into a lost one.
        logger.warn(
          `Report analyzer "${key}" (${ANALYZER_VERSION}) re-issue failed; keeping the first payload`,
          e,
        );
      }
    }

    return [
      key,
      {
        payload,
        abstained: !!payload?.abstain_reason,
        abstain_reason: payload?.abstain_reason ?? null,
        model: modelLabel,
        attempts,
        restatementRetried,
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
      results[key] = abstain(LLM_CALL_FAILED, modelLabel);
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
      abstain_reason: count === 0 ? NO_SUMMARY_PRODUCED : null,
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
    collect(await Promise.allSettled(stage2Keys.map((k) => runOne(k, stage2Extras))), stage2Keys);
  }

  return results;
}
