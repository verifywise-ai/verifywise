import { generateReport } from "./index";
import { resolveReportRequest } from "./reportTemplateResolver";
import { deliverReport } from "./reportDeliveryService";
import { createRunQuery, updateRunStatusQuery } from "../../utils/reportRun.utils";
import { gapsMessage } from "./noticeText";
import { persistAnalyses } from "./analyzers/persistAnalyses";
import { rollingPeriod } from "./scheduleCalculator";
import type {
  ReportParameters,
  ReportParametersConfig,
} from "../../domain.layer/interfaces/i.reportTemplate";

const PERIOD_KEYS = ["periodStart", "periodEnd"];

/**
 * The parameters a run uses. A schedule stores every answer except the
 * period, so a run of a schedule (scheduler tick or the schedule's run-now)
 * gets the rolling period ending the day before its run date. Template
 * run-now has no schedule (id null) and keeps the dates the user sent.
 */
function runParameters(sched: any, opts: { scheduledFor?: Date }): ReportParameters {
  const params: ReportParameters = { ...(sched.report_parameters ?? {}) };
  const config: ReportParametersConfig = sched.parameters_config ?? {};
  const declaresPeriod = (config.fields ?? []).some((f) => PERIOD_KEYS.includes(f.key));
  const frequency = sched.schedule_config?.frequency;
  if (sched.id != null && declaresPeriod && frequency) {
    Object.assign(params, rollingPeriod(frequency, opts.scheduledFor ?? new Date()));
  }
  return params;
}

// The run status vocabulary is fixed at: queued, running, success, partial_success, failed.
// partial_success means "generated, but a delivery channel failed or part of a section could
// not be read" — it is downloadable and callers must not treat it as an error.
export type ReportRunOutcome = {
  runId: number;
  status: "success" | "partial_success" | "failed";
  error?: string;
};

// Runs one scheduled report end-to-end: create run (running) -> resolve request
// -> generateReport -> deliver -> compute final status -> update run. An AI
// failure inside generateReport must NOT fail the run (handled there); a
// generation failure marks the run failed, delivery channel failures downgrade
// the run to partial_success.
//
// Returns the run id and final status so a synchronous caller (e.g. "run
// template now") can report success/failure and let the user look the run
// up. Existing callers (the scheduler, "run scheduled report now") already
// ignore the return value, so this is purely additive.
export async function runScheduledReport(
  sched: any,
  opts: { triggeredBy: "scheduler" | "manual"; userId?: number; scheduledFor?: Date },
): Promise<ReportRunOutcome> {
  const startedAt = Date.now();
  const reportParameters = runParameters(sched, opts);
  const run = await createRunQuery({
    organization_id: sched.organization_id,
    scheduled_report_id: sched.id ?? null,
    template_id: sched.template_id,
    template_version_id: sched.template_version_id,
    triggered_by: opts.triggeredBy,
    triggered_by_user_id: opts.userId ?? null,
    // project_id is part of the snapshot because report_runs has no project
    // column and a run-now report has no scheduled_reports row to fall back on
    // (scheduled_report_id is NULL). listRunsQuery reads it to decide who may
    // see the run: the legacy Generate list showed a non-Admin only the reports
    // of projects they own or are a member of. NULL means organization scope.
    // scope and framework_ids are snapshotted alongside project_id because
    // together they are what selects the run's data — they decide which
    // projects_frameworks pairings the report covered. Without them a run's
    // own record cannot say what it looked at, and two runs of one schedule
    // either side of a PATCH that changed frameworkIds are indistinguishable
    // in report_runs. scope is derived when absent, the same way
    // resolveReportRequest derives it; framework_ids is null-tolerant by
    // design — null (like []) means every framework in scope.
    config_snapshot: {
      project_id: sched.project_id ?? null,
      scope: sched.scope ?? (sched.project_id ? "project" : "organization"),
      framework_ids: sched.framework_ids ?? null,
      sections_config: sched.sections_config,
      ai_blocks_config: sched.ai_blocks_config,
      delivery_config: sched.delivery_config,
      // What the run was made with, period included. The run history reads
      // isFinal from here, and last-parameters prefills the next run from it.
      report_parameters: reportParameters,
    },
    scheduled_for: opts.scheduledFor ?? null,
  });

  try {
    // The schedule id is what makes a prior-run comparison possible: this run's
    // predecessor is the last run of the same schedule. Attached here rather
    // than in resolveReportRequest, which maps template config and knows
    // nothing about runs.
    const request = {
      ...resolveReportRequest({ ...sched, report_parameters: reportParameters }, sched.llm_key_id),
      scheduledReportId: sched.id ?? undefined,
    };
    const result = await generateReport(
      request,
      sched.owner_id ?? sched.created_by,
      sched.organization_id,
    );
    if (!result.success) {
      const error = result.error ?? "generation failed";
      await updateRunStatusQuery(run.id, sched.organization_id, {
        status: "failed",
        error_message: error,
        duration_ms: Date.now() - startedAt,
      });
      return { runId: run.id, status: "failed", error };
    }
    const delivery = await deliverReport(
      sched.delivery_config,
      { content: result.content, filename: result.filename, mimeType: result.mimeType },
      {
        organizationId: sched.organization_id,
        userId: sched.owner_id ?? sched.created_by,
        runId: run.id,
      },
    );
    const channels = [delivery.storage, delivery.emailLink, delivery.attachment];
    const anyFailed = channels.some((c: any) => c?.status === "failed");
    const gaps = result.collectionFailures ?? [];
    const status = anyFailed || gaps.length > 0 ? "partial_success" : "success";
    const aiStatus = await persistAnalyses(
      run.id,
      sched.organization_id,
      sched.owner_id ?? sched.created_by ?? null,
      result.analyses,
      result.factsSnapshot,
    );
    await updateRunStatusQuery(run.id, sched.organization_id, {
      status,
      file_id: delivery.fileId,
      output_filename: result.filename,
      output_mime_type: result.mimeType,
      delivery_status: delivery,
      ...(gaps.length > 0 && {
        error_message: gapsMessage(gaps),
      }),
      ai_status: aiStatus ?? undefined,
      duration_ms: Date.now() - startedAt,
      // An E-23 run keeps its "at a glance" figures on the run, so the next
      // run of the same schedule or template can show the change (spec 8.10).
      ...(result.e23Glance && { configSnapshotPatch: { e23_glance: result.e23Glance } }),
    });
    return { runId: run.id, status };
  } catch (e: any) {
    await updateRunStatusQuery(run.id, sched.organization_id, {
      status: "failed",
      error_message: e.message,
      duration_ms: Date.now() - startedAt,
    });
    return { runId: run.id, status: "failed", error: e.message };
  }
}
