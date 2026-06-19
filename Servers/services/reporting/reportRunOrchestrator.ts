import { generateReport } from "./index";
import { resolveReportRequest } from "./reportTemplateResolver";
import { deliverReport } from "./reportDeliveryService";
import { createRunQuery, updateRunStatusQuery } from "../../utils/reportRun.utils";

// Runs one scheduled report end-to-end: create run (running) -> resolve request
// -> generateReport -> deliver -> compute final status -> update run. An AI
// failure inside generateReport must NOT fail the run (handled there); a
// generation failure marks the run failed, delivery channel failures downgrade
// the run to partial_success.
export async function runScheduledReport(sched: any, opts: { triggeredBy: "scheduler" | "manual"; userId?: number; scheduledFor?: Date }) {
  const startedAt = Date.now();
  const run = await createRunQuery({
    organization_id: sched.organization_id, scheduled_report_id: sched.id ?? null,
    template_id: sched.template_id, template_version_id: sched.template_version_id,
    triggered_by: opts.triggeredBy, triggered_by_user_id: opts.userId ?? null,
    config_snapshot: { sections_config: sched.sections_config, ai_blocks_config: sched.ai_blocks_config, delivery_config: sched.delivery_config },
    scheduled_for: opts.scheduledFor ?? null,
  });

  try {
    const request = resolveReportRequest(sched, sched.llm_key_id);
    const result = await generateReport(request, sched.owner_id ?? sched.created_by, sched.organization_id);
    if (!result.success) {
      await updateRunStatusQuery(run.id, { status: "failed", error_message: result.error ?? "generation failed", duration_ms: Date.now() - startedAt });
      return;
    }
    const delivery = await deliverReport(sched.delivery_config, { content: result.content, filename: result.filename, mimeType: result.mimeType }, { organizationId: sched.organization_id, userId: sched.owner_id ?? sched.created_by, runId: run.id });
    const channels = [delivery.storage, delivery.emailLink, delivery.attachment];
    const anyFailed = channels.some((c: any) => c?.status === "failed");
    const status = anyFailed ? "partial_success" : "success";
    await updateRunStatusQuery(run.id, {
      status, file_id: delivery.fileId, output_filename: result.filename, output_mime_type: result.mimeType,
      delivery_status: delivery, duration_ms: Date.now() - startedAt,
    });
  } catch (e: any) {
    await updateRunStatusQuery(run.id, { status: "failed", error_message: e.message, duration_ms: Date.now() - startedAt });
  }
}
