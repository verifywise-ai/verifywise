import { sequelize } from "../../database/db";
import { createIncidentForImport } from "../../services/incidentImport.service";
import logger from "../../utils/logger/fileLogger";
import { buildIncidentDescription } from "./adf";
import type { JiraIssueSummary, SearchPage } from "./jiraIncidents.client";
import { markChecked } from "./jiraIncidents.config";
import { JiraRateLimitError, JiraUnreachableError } from "./jiraIncidents.errors";
import { RunState, STOP_DEADLINE, STOP_RATE_LIMIT } from "./jiraIncidents.run";
import { REMOTE_LINK_RETRY_LIMIT } from "./jiraIncidents.constants";
import {
  insertEvent,
  insertLink,
  linkExists,
  listPendingRemoteLinks,
  setLinkState,
  setRemoteLinkOutcome,
  type PendingRemoteLink,
} from "./jiraIncidents.store";
import { buildImportJql, formatJqlDate, importCutoff } from "./jql";
import { severityForPriority } from "./mapping";

class AlreadyLinked extends Error {}

const SEARCH_FIELDS = ["summary", "description", "priority", "status", "created"];

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export async function runImport(state: RunState): Promise<void> {
  const { config, client } = state;
  const cutoff = importCutoff(config.importFrom!, config.lastCheckedAt);
  const jql = buildImportJql({
    projectId: config.projectId!,
    issueTypeId: config.issueTypeId!,
    label: config.label,
    cutoff: formatJqlDate(cutoff, config.serviceAccountTimeZone ?? "UTC"),
  });

  let token: string | null = null;
  let earliestFailed: Date | null = null;
  do {
    if (state.deadline.aborted) {
      state.stopReason = STOP_DEADLINE;
      return;
    }
    let page: SearchPage;
    try {
      page = await client.searchPage(jql, SEARCH_FIELDS, token);
    } catch (err) {
      if (err instanceof JiraRateLimitError) {
        state.stopReason = STOP_RATE_LIMIT;
        return;
      }
      // The deadline aborts the request in flight: stop cleanly, as status sync does.
      if (state.deadline.aborted && err instanceof JiraUnreachableError) {
        state.stopReason = STOP_DEADLINE;
        return;
      }
      throw err;
    }
    for (const issue of page.issues) {
      if (state.deadline.aborted) {
        state.stopReason = STOP_DEADLINE;
        return;
      }
      if (issue.created < config.importFrom!) continue;
      if (await linkExists(state.orgId, issue.id)) continue;
      const outcome = await importOne(state, issue);
      if (outcome === "stop") return;
      if (outcome === "failed" && (!earliestFailed || issue.created < earliestFailed)) {
        earliestFailed = issue.created;
      }
      await state.heartbeat();
    }
    token = page.nextPageToken;
  } while (token);

  // An issue that failed to import has no link, so keep the window open at it:
  // the next cut-off (last check minus the overlap) still reaches it.
  await markChecked(
    state.orgId,
    earliestFailed && earliestFailed < state.startedAt ? earliestFailed : state.startedAt,
  );
}

/**
 * "stop" when the run must stop (rate limited while adding the remote link),
 * "failed" when the incident could not be created; it is retried next run.
 */
async function importOne(
  state: RunState,
  issue: JiraIssueSummary,
): Promise<"ok" | "failed" | "stop"> {
  const { orgId, config, client } = state;
  let created: PendingRemoteLink;
  try {
    created = await sequelize.transaction(async (t) => {
      const mapped = config.statusMapIn[issue.statusId];
      const status = mapped ?? "Open";
      const incident = await createIncidentForImport(
        orgId,
        {
          projectId: config.defaultProjectId!,
          aiProject: config.defaultProjectName!,
          type: config.defaultType!,
          severity: severityForPriority(config.severityMap, issue.priorityId),
          status,
          reporter: config.defaultReporter!,
          description: buildIncidentDescription(issue.summary, issue.description, issue.key),
          occurredAt: issue.created,
        },
        t,
      );
      const linkId = await insertLink(
        orgId,
        {
          incidentId: incident.id!,
          jiraIssueId: issue.id,
          jiraIssueKey: issue.key,
          jiraUrl: client.browseUrl(issue.key),
          // An empty snapshot makes the next status sync re-check an unmapped status.
          jiraStatusId: mapped ? issue.statusId : "",
          vwStatus: status,
          // Cleared once Jira accepts the link back; until then later runs retry it
          // (also once FRONTEND_URL is set, if it is missing now).
          remoteLinkPending: true,
        },
        t,
      );
      if (linkId === null) throw new AlreadyLinked();
      await insertEvent(
        orgId,
        {
          linkId,
          runId: state.runId,
          kind: "imported",
          detail: {
            jira_issue_key: issue.key,
            incident_id: incident.id,
            incident_code: incident.incident_id,
            severity: incident.severity,
            status,
          },
        },
        t,
      );
      if (!mapped) {
        const reason = `Jira status '${issue.statusName}' isn't mapped`;
        await setLinkState(orgId, linkId, "error", reason, t);
        await insertEvent(
          orgId,
          {
            linkId,
            runId: state.runId,
            kind: "error",
            detail: { jira_issue_key: issue.key, reason },
          },
          t,
        );
        state.counts.errors++;
      }
      return {
        linkId,
        jiraIssueId: issue.id,
        jiraIssueKey: issue.key,
        incidentId: incident.id!,
        incidentCode: incident.incident_id as string,
        triedBefore: false,
      };
    });
  } catch (err) {
    if (err instanceof AlreadyLinked) return "ok";
    logger.error(`jira-incidents: import of ${issue.key} failed: ${messageOf(err)}`);
    await recordError(state, issue.key, messageOf(err), null);
    return "failed";
  }

  state.counts.imported++;
  (state.importedLinkIds ??= []).push(created.linkId);
  const outcome = await addRemoteLink(state, created);
  if (typeof outcome === "object") {
    await recordError(
      state,
      created.jiraIssueKey,
      `Could not add the VerifyWise link to the Jira issue: ${outcome.error}`,
      created.linkId,
    );
  }
  return outcome === "stop" ? "stop" : "ok";
}

/**
 * Retries the link back to VerifyWise on issues imported by earlier runs
 * whose link failed, was cut off by a rate limit, or waited for FRONTEND_URL.
 * A link's first failed attempt records an error event; later ones are
 * logged only, so a broken link does not add an event every run.
 */
export async function retryRemoteLinks(state: RunState): Promise<void> {
  if (!process.env.FRONTEND_URL) return;
  const pending = await listPendingRemoteLinks(
    state.orgId,
    state.importedLinkIds ?? [],
    REMOTE_LINK_RETRY_LIMIT,
  );
  for (const target of pending) {
    if (state.deadline.aborted) {
      state.stopReason = STOP_DEADLINE;
      return;
    }
    const outcome = await addRemoteLink(state, target);
    if (outcome === "stop") return;
    if (typeof outcome === "object" && !target.triedBefore) {
      await recordError(
        state,
        target.jiraIssueKey,
        `Could not add the VerifyWise link to the Jira issue: ${outcome.error}`,
        target.linkId,
      );
    }
    await state.heartbeat();
  }
}

/** "stop" when rate limited or past the deadline (stopReason is set); the link stays pending unless "ok". */
async function addRemoteLink(
  state: RunState,
  target: PendingRemoteLink,
): Promise<"ok" | "stop" | { error: string }> {
  const frontendUrl = process.env.FRONTEND_URL;
  if (!frontendUrl) {
    if (!state.warnedNoFrontendUrl) {
      state.warnedNoFrontendUrl = true;
      logger.warn(
        "jira-incidents: FRONTEND_URL is not set; skipping the VerifyWise link on Jira issues",
      );
    }
    return "ok";
  }
  try {
    await state.client.upsertRemoteLink(target.jiraIssueId, {
      globalId: `verifywise:incident:${state.orgId}:${target.incidentId}`,
      url: `${frontendUrl.replace(/\/+$/, "")}/ai-incident-managements?incidentId=${target.incidentId}`,
      title: `VerifyWise ${target.incidentCode}`,
    });
  } catch (err) {
    if (err instanceof JiraRateLimitError) {
      state.stopReason = STOP_RATE_LIMIT;
      return "stop";
    }
    if (state.deadline.aborted && err instanceof JiraUnreachableError) {
      state.stopReason = STOP_DEADLINE;
      return "stop";
    }
    logger.warn(
      `jira-incidents: could not add the VerifyWise link to ${target.jiraIssueKey}: ${messageOf(err)}`,
    );
    await recordRemoteLinkOutcome(state, target, false);
    return { error: messageOf(err) };
  }
  await recordRemoteLinkOutcome(state, target, true);
  return "ok";
}

/** Bookkeeping only: a failed write leaves the link pending and must not fail the run. */
async function recordRemoteLinkOutcome(
  state: RunState,
  target: PendingRemoteLink,
  added: boolean,
): Promise<void> {
  try {
    await setRemoteLinkOutcome(state.orgId, target.linkId, added);
  } catch (err) {
    logger.error(
      `jira-incidents: could not record the remote link outcome for ${target.jiraIssueKey}: ${messageOf(err)}`,
    );
  }
}

async function recordError(
  state: RunState,
  issueKey: string,
  reason: string,
  linkId: number | null,
): Promise<void> {
  state.counts.errors++;
  try {
    await insertEvent(state.orgId, {
      linkId,
      runId: state.runId,
      kind: "error",
      detail: { jira_issue_key: issueKey, reason },
    });
  } catch (err) {
    logger.error(`jira-incidents: could not record error for ${issueKey}: ${messageOf(err)}`);
  }
}
