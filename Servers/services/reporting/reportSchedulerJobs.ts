import {
  findDueScheduledReportsQuery,
  markRunEnqueuedQuery,
} from "../../utils/scheduledReport.utils";
import { runScheduledReport } from "./reportRunOrchestrator";
import { computeNextRun } from "./scheduleCalculator";

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
    try {
      await runScheduledReport(sched, { triggeredBy: "scheduler", scheduledFor });
    } catch {
      /* orchestrator records its own failure; tick continues */
    }
  }
}
