import { upsertRunAnalysisQuery } from "../../../utils/reportRunAnalysis.utils";
import { trackAIContent } from "../../../middleware/aiContentTracker.middleware";
import logger from "../../../utils/logger/fileLogger";
import { ANALYZER_VERSION } from "./registry";
import type { ReportGenerationResult } from "../../../domain.layer/interfaces/i.reportGeneration";

/**
 * Persist one row per analyzed section and return a compact per-section status
 * map for report_runs.ai_status.
 *
 * `facts` is this run's deterministic facts snapshot. Only the scheduled runner
 * passes one: prior-run comparison is scoped to a schedule, so a manual run's
 * snapshot could never be read back and is not worth the bytes.
 *
 * Never throws: a report that generated successfully must not be marked failed
 * because its audit sidecar could not be written.
 */
export async function persistAnalyses(
  runId: number,
  organizationId: number,
  userId: number | null,
  analyses: ReportGenerationResult["analyses"],
  facts?: unknown,
): Promise<Record<string, string> | null> {
  if (!analyses || Object.keys(analyses).length === 0) return null;

  const aiStatus: Record<string, string> = {};

  await Promise.allSettled(
    Object.entries(analyses).map(async ([sectionKey, result]) => {
      aiStatus[sectionKey] = result?.abstained ? "abstained" : "ok";
      try {
        const written = await upsertRunAnalysisQuery({
          report_run_id: runId,
          section_key: sectionKey,
          organization_id: organizationId,
          payload: result?.payload ?? { abstain_reason: result?.abstain_reason ?? null },
          analysis_model: result?.model ?? null,
          analyzed_by: userId,
          audit_metadata: {
            analyzer_version: ANALYZER_VERSION,
            abstained: !!result?.abstained,
            abstain_reason: result?.abstain_reason ?? null,
            attempts: result?.attempts ?? 0,
            // Design §6, success criterion 4: whether the shallowness gate
            // re-issued the call. Coerced rather than conditional — an analyzer
            // that never runs the gate (sectionSummaries) genuinely did not
            // re-issue, and `false` says so.
            restatement_retried: !!result?.restatementRetried,
            // Design §10: the snapshot this run was built from, so the NEXT run
            // of this schedule can diff against it with no second LLM call.
            // Spread, not `facts: facts ?? null` — getPriorFactsSnapshotQuery
            // filters on SQL NULL, which a stored JSON null would survive.
            //
            // ponytail: written on every section row rather than picking one.
            // ~1-2 KB duplicated per run buys a read that does not depend on a
            // particular section's write succeeding. Narrow it if row size ever
            // matters.
            ...(facts ? { facts } : {}),
          },
        });
        // undefined means the WHERE EXISTS tenant guard rejected the pair —
        // the run does not belong to this org. Never let that read as success.
        if (!written) {
          logger.warn(
            `Analysis "${sectionKey}" rejected: run ${runId} does not belong to org ${organizationId}`,
          );
          aiStatus[sectionKey] = "write_failed";
        }
      } catch (error) {
        logger.warn(`Failed to persist analysis "${sectionKey}" for run ${runId}`, error);
        aiStatus[sectionKey] = "write_failed";
      }
    }),
  );

  // Spec §1: tag genuine LLM output as AI-generated content. Once per run, not
  // once per section — the run is the entity a reviewer sees a badge on.
  // Only when at least one section both produced LLM output AND actually
  // persisted (aiStatus === "ok"): badging a section whose write the tenant
  // guard rejected would insert an ai_content_metadata row scoped to this
  // org for a run that belongs to a different org — the same leak the guard
  // exists to stop, reintroduced in the sibling table.
  const produced = Object.entries(analyses).filter(
    ([sectionKey, r]) => r && !r.abstained && aiStatus[sectionKey] === "ok",
  );
  if (produced.length > 0) {
    await trackAIContent(
      organizationId,
      "report_run",
      runId,
      {
        badgeType: "generated",
        modelUsed: produced[0][1]?.model ?? undefined,
        modelProvider: "llm",
        toolName: "report-analysis",
        promptSummary: `Report analysis (${ANALYZER_VERSION}): ${produced
          .map(([k]) => k)
          .join(", ")}`,
      },
      userId,
    );
  }

  return aiStatus;
}
