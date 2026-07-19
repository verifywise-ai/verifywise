import { upsertRunAnalysisQuery } from "../../../utils/reportRunAnalysis.utils";
import { trackAIContent } from "../../../middleware/aiContentTracker.middleware";
import logger from "../../../utils/logger/fileLogger";
import { ANALYZER_VERSION } from "./registry";
import type { ReportGenerationResult } from "../../../domain.layer/interfaces/i.reportGeneration";

/**
 * Persist one row per analyzed section and return a compact per-section status
 * map for report_runs.ai_status.
 *
 * Never throws: a report that generated successfully must not be marked failed
 * because its audit sidecar could not be written.
 */
export async function persistAnalyses(
  runId: number,
  organizationId: number,
  userId: number | null,
  analyses: ReportGenerationResult["analyses"],
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
