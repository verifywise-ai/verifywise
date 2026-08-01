import {
  findDueScheduledReportsQuery,
  markRunEnqueuedQuery,
} from "../../utils/scheduledReport.utils";
import { runScheduledReport } from "./reportRunOrchestrator";
import { computeNextRun } from "./scheduleCalculator";
import logger from "../../utils/logger/fileLogger";
import { assertReportScopeAllowed } from "./reportAuthorization";

// Single repeatable BullMQ tick: find scheduled reports whose next_run_at is due
// and run each. next_run is advanced via an atomic compare-and-swap claim BEFORE
// running, so neither the next sequential tick nor a concurrent overlapping tick
// (a tick that exceeds its 15-minute slot) can double-pick the same slot — only
// the tick that wins the claim runs the report. The orchestrator records its own
// failures.
export async function handleReportSchedulerTick(): Promise<void> {
  const now = new Date();
  const due = await findDueScheduledReportsQuery(now);
  for (const sched of due) {
    const scheduledFor = sched.next_run_at ? new Date(sched.next_run_at) : now;
    const next = computeNextRun(sched.schedule_config, now);
    // Atomically claim by advancing next_run_at from the value we just read.
    // A concurrent tick that already advanced it matches zero rows and we skip,
    // so the slot is delivered exactly once.
    const claimed = await markRunEnqueuedQuery(
      sched.id,
      now,
      next,
      sched.next_run_at ? new Date(sched.next_run_at) : null,
    );
    if (!claimed) continue;
    // Report-only. The scope rule gates creation and editing; a schedule that
    // predates it keeps delivering so nothing silently stops working on
    // deploy. Naming it here is what turns "we tightened the rule" into an
    // actionable cleanup list. The claim above is already consumed, so a
    // failure to *check* (e.g. a DB blip in the membership lookup) must never
    // cost the schedule its run — catch and move on to runScheduledReport.
    if (sched.owner_id) {
      try {
        const scopeErrors = await assertReportScopeAllowed({
          // findDueScheduledReportsQuery joins the owner's role in as
          // owner_role. Without it, every org-scope schedule looked
          // owner-less to the Admin/SuperAdmin bypass — including ones an
          // Admin created and that are fully permitted — so this warning
          // fired on every legitimate org-scope schedule, not just the ones
          // that predate the rule.
          role: sched.owner_role ?? null,
          userId: sched.owner_id,
          organizationId: sched.organization_id,
          scope: sched.scope,
          projectId: sched.project_id,
        });
        if (scopeErrors.length) {
          logger.warn(
            `[report-scheduler] schedule ${sched.id} (org ${sched.organization_id}, owner ${sched.owner_id}) would no longer be permitted: ${scopeErrors.join("; ")}. Running it anyway.`,
          );
        }
      } catch (err) {
        logger.warn(
          `[report-scheduler] schedule ${sched.id} (org ${sched.organization_id}, owner ${sched.owner_id}) scope check failed, skipping the check and running anyway: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    try {
      await runScheduledReport(sched, { triggeredBy: "scheduler", scheduledFor });
    } catch {
      /* orchestrator records its own failure; tick continues */
    }
  }
}
