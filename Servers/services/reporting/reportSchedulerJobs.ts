import {
  findDueScheduledReportsQuery,
  markRunEnqueuedQuery,
} from "../../utils/scheduledReport.utils";
import { runScheduledReport } from "./reportRunOrchestrator";
import { computeNextRun } from "./scheduleCalculator";

// Single repeatable BullMQ tick: find scheduled reports whose next_run_at is due
// and run each. next_run is advanced BEFORE running so a slow run cannot be
// double-picked on the next tick; the orchestrator records its own failures.
export async function handleReportSchedulerTick(): Promise<void> {
  const now = new Date();
  const due = await findDueScheduledReportsQuery(now);
  for (const sched of due) {
    const scheduledFor = sched.next_run_at ? new Date(sched.next_run_at) : now;
    // advance next_run BEFORE running so a slow run cannot be double-picked next tick
    const next = computeNextRun(sched.schedule_config, now);
    await markRunEnqueuedQuery(sched.id, now, next);
    try {
      await runScheduledReport(sched, { triggeredBy: "scheduler", scheduledFor });
    } catch {
      /* orchestrator records its own failure; tick continues */
    }
  }
}
