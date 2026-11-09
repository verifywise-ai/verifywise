/**
 * One Jira incidents sync run (spec §6): readiness, a project access check,
 * import, then status sync. Throwing fails the run so the engine's backoff
 * applies (rejected token, lost project access); a rate limit or the deadline
 * ends the run early but successfully, keeping what it did.
 */
import type { RunContext, RunResult } from "../sync-engine/types";
import { clientFor, loadConfig, readinessOf } from "./jiraIncidents.config";
import { JiraAuthError, JiraNotFoundError } from "./jiraIncidents.errors";
import { retryRemoteLinks, runImport } from "./jiraIncidents.import";
import { newCounts, STOP_DEADLINE, type CountKey, type RunState } from "./jiraIncidents.run";
import { runStatusSync } from "./jiraIncidents.statusSync";

const SUMMARY_PARTS: Array<{ key: CountKey; label: (n: number) => string }> = [
  { key: "imported", label: (n) => `Imported ${n}` },
  { key: "status_from_jira", label: (n) => `${n} ${n === 1 ? "status" : "statuses"} from Jira` },
  { key: "status_to_jira", label: (n) => `${n} ${n === 1 ? "status" : "statuses"} to Jira` },
  { key: "conflicts", label: (n) => `${n} ${n === 1 ? "conflict" : "conflicts"}` },
  { key: "errors", label: (n) => `${n} ${n === 1 ? "error" : "errors"}` },
  { key: "deleted_in_jira", label: (n) => `${n} deleted in Jira` },
];

/** "Imported 2, 1 conflict." — non-zero counts only; a stop reason follows as its own sentence. */
export function summarizeRun(counts: Record<CountKey, number>, stopReason: string | null): string {
  const parts = SUMMARY_PARTS.filter((p) => counts[p.key] > 0).map((p) => p.label(counts[p.key]));
  const summary = parts.length > 0 ? `${parts.join(", ")}.` : "No changes.";
  return stopReason ? `${summary} ${stopReason}` : summary;
}

export async function runJiraIncidentsSync(ctx: RunContext): Promise<RunResult> {
  const config = await loadConfig(ctx.orgId);
  const readiness = readinessOf(config);
  if (!readiness.ready) return { counts: newCounts(), message: readiness.reason };

  const counts = newCounts();
  if (ctx.signal.aborted) return { counts, message: summarizeRun(counts, STOP_DEADLINE) };

  const state: RunState = {
    orgId: ctx.orgId,
    runId: ctx.runId,
    startedAt: new Date(),
    config: config!,
    client: clientFor(config!, ctx.signal),
    counts,
    stopReason: null,
    heartbeat: () => ctx.heartbeat(),
    deadline: ctx.signal,
    warnedNoFrontendUrl: false,
    recheckSettled: ctx.kind === "manual",
  };

  // Before touching any link: if the project is unreadable, every issue would
  // look deleted, so fail the run instead (§6.2 step 0).
  try {
    await state.client.getProject(config!.projectId!);
  } catch (err) {
    if (err instanceof JiraNotFoundError || (err instanceof JiraAuthError && err.status === 403)) {
      throw new Error(`VerifyWise can no longer read Jira project ${config!.projectKey}`);
    }
    throw err;
  }

  await runImport(state);
  if (!state.stopReason) await runStatusSync(state);
  if (!state.stopReason) await retryRemoteLinks(state);
  return { counts: state.counts, message: summarizeRun(state.counts, state.stopReason) };
}
