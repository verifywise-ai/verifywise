/**
 * Status sync (spec §6.2, §6.3): for every link whose incident still exists
 * and is not archived, compare both sides with the last snapshot and apply the
 * decision table. Jira changes reach the incident through updateIncident as
 * the system (so the reopen rule applies); VerifyWise changes become Jira
 * transitions; when both changed, the later change wins and the link shows a
 * conflict. Per-link problems mark only that link and keep its snapshot, so
 * the change is retried next run.
 */
import type { Transaction } from "sequelize";
import { sequelize } from "../../database/db";
import {
  IncidentUpdateValidationError,
  updateIncident,
} from "../../services/incidentManagement.service";
import logger from "../../utils/logger/fileLogger";
import { decideStatusAction, pickTransition, type Decision } from "./decide";
import { STATUS_BATCH_SIZE, type LinkState } from "./jiraIncidents.constants";
import {
  JiraAuthError,
  JiraHttpError,
  JiraNotFoundError,
  JiraRateLimitError,
  JiraUnreachableError,
} from "./jiraIncidents.errors";
import { STOP_DEADLINE, STOP_RATE_LIMIT, type RunState } from "./jiraIncidents.run";
import {
  insertEvent,
  latestVwStatusChangeAt,
  listSyncableLinks,
  lockIncidentStatus,
  lockLink,
  setLinkState,
  updateLinkSnapshot,
  type LinkRow,
} from "./jiraIncidents.store";
import { buildIdsJql } from "./jql";

type SyncLink = LinkRow & { vw_status: string; linked_at: Date };
interface JiraSide {
  statusId: string;
  statusName: string;
  key: string;
}

/** Thrown inside a link's processing to end the run early, keeping completed work. */
class StopRun extends Error {
  constructor(public readonly reason: string) {
    super(reason);
  }
}

/** The link or its incident changed after the batch read; roll back and leave it to the next run. */
class LinkChanged extends Error {}

/**
 * Re-checks, under row locks, that the link snapshot and the incident still
 * hold what the decision was made on. A user edit between the batch read and
 * this write would otherwise be overwritten instead of seen as a change.
 */
async function stillAsRead(state: RunState, link: SyncLink, t: Transaction): Promise<boolean> {
  const locked = await lockLink(state.orgId, link.id, t);
  if (
    !locked ||
    locked.incident_id !== link.incident_id ||
    locked.state !== link.state ||
    locked.last_jira_status_id !== link.last_jira_status_id ||
    locked.last_vw_status !== link.last_vw_status
  ) {
    return false;
  }
  const incident = await lockIncidentStatus(state.orgId, link.incident_id!, t);
  return !!incident && !incident.archived && incident.status === link.vw_status;
}

export async function runStatusSync(state: RunState): Promise<void> {
  try {
    let afterId = 0;
    for (;;) {
      const links = await listSyncableLinks(
        state.orgId,
        afterId,
        STATUS_BATCH_SIZE,
        state.recheckSettled ?? false,
      );
      if (links.length === 0) return;
      afterId = links[links.length - 1].id;
      // A deleted issue fails the whole search, so links already known to be
      // deleted are left to syncLink's direct check.
      const found = await readJiraStatuses(
        state,
        links.filter((l) => l.state !== "deleted_in_jira"),
      );
      for (const link of links) {
        if (state.deadline.aborted) throw new StopRun(STOP_DEADLINE);
        await syncLink(state, link, found.get(link.jira_issue_id) ?? null);
      }
      await state.heartbeat();
    }
  } catch (err) {
    if (err instanceof StopRun) {
      state.stopReason = err.reason;
      return;
    }
    if (err instanceof JiraRateLimitError) {
      state.stopReason = STOP_RATE_LIMIT;
      return;
    }
    if (state.deadline.aborted && err instanceof JiraUnreachableError) {
      state.stopReason = STOP_DEADLINE;
      return;
    }
    throw err;
  }
}

async function readJiraStatuses(
  state: RunState,
  links: SyncLink[],
): Promise<Map<string, JiraSide>> {
  const found = new Map<string, JiraSide>();
  if (links.length === 0) return found;
  const jql = buildIdsJql(links.map((l) => l.jira_issue_id));
  let token: string | null = null;
  try {
    do {
      const page = await state.client.searchPage(jql, ["status"], token);
      for (const issue of page.issues) {
        found.set(issue.id, {
          statusId: issue.statusId,
          statusName: issue.statusName,
          key: issue.key,
        });
      }
      token = page.nextPageToken;
    } while (token);
  } catch (err) {
    // Jira rejects an `id in (...)` search that names a deleted issue. Read
    // this batch one issue at a time instead; that finds the deleted one.
    if (err instanceof JiraHttpError && err.status === 400) return new Map();
    throw err;
  }
  return found;
}

async function syncLink(state: RunState, link: SyncLink, searched: JiraSide | null): Promise<void> {
  let jira = searched;
  try {
    if (!jira) {
      // Missing from the search: only a direct 404 (the project is still
      // readable; the run checked that first) marks the issue deleted.
      try {
        const issue = await state.client.getIssue(link.jira_issue_id);
        jira = { statusId: issue.statusId, statusName: issue.statusName, key: issue.key };
      } catch (err) {
        if (!(err instanceof JiraNotFoundError)) throw err;
        await markDeletedInJira(state, link);
        return;
      }
    }

    if (link.state === "deleted_in_jira") {
      // Restored or access regained: resume from what both sides hold now,
      // writing no status on this run.
      await updateLinkSnapshot(state.orgId, link.id, {
        jiraStatusId: jira.statusId,
        vwStatus: link.vw_status,
        jiraIssueKey: jira.key,
        state: "ok",
        stateReason: null,
      });
      return;
    }

    const decision = await decide(state, link, jira);
    await apply(state, link, jira, decision);
  } catch (err) {
    // A rejected token (401) fails the run. A 403 here concerns this one issue
    // (issue security, a transition the account may not use): the project was
    // readable at the start of the run, so only this link is marked.
    if (
      err instanceof StopRun ||
      err instanceof JiraRateLimitError ||
      (err instanceof JiraAuthError && err.status !== 403)
    ) {
      throw err;
    }
    // Past the deadline any failure is the deadline's doing: stop cleanly.
    if (state.deadline.aborted) throw new StopRun(STOP_DEADLINE);
    if (err instanceof JiraHttpError || err instanceof JiraUnreachableError) {
      await failLink(state, link, err.message, jira?.key);
      return;
    }
    throw err;
  }
}

async function decide(state: RunState, link: SyncLink, jira: JiraSide): Promise<Decision> {
  const { statusMapIn, statusMapOut } = state.config;
  const bothChanged =
    link.last_jira_status_id !== null &&
    link.last_vw_status !== null &&
    jira.statusId !== link.last_jira_status_id &&
    link.vw_status !== link.last_vw_status;
  const [jiraChangedAt, vwChangedAt] = bothChanged
    ? await Promise.all([
        state.client.latestStatusChangeAt(link.jira_issue_id),
        latestVwStatusChangeAt(state.orgId, link.incident_id!),
      ])
    : [null, null];
  return decideStatusAction({
    lastJiraStatusId: link.last_jira_status_id,
    lastVwStatus: link.last_vw_status,
    jiraStatusId: jira.statusId,
    vwStatus: link.vw_status,
    jiraChangedAt,
    vwChangedAt,
    linkedAt: link.linked_at,
    statusMapIn,
    statusMapOut,
  });
}

async function apply(
  state: RunState,
  link: SyncLink,
  jira: JiraSide,
  decision: Decision,
): Promise<void> {
  switch (decision.action) {
    case "none":
      await updateLinkSnapshot(state.orgId, link.id, {
        jiraStatusId: jira.statusId,
        vwStatus: link.vw_status,
        jiraIssueKey: jira.key,
        // A no-change run is not "clean": a conflict badge stays until one
        // side changes alone (§6.2 step 4). An error with nothing left to
        // retry is cleared.
        state: link.state === "conflict" ? "conflict" : "ok",
        stateReason: link.state === "conflict" ? link.state_reason : null,
      });
      return;
    case "unmapped":
      await failLink(state, link, `Jira status '${jira.statusName}' isn't mapped`, jira.key);
      return;
    case "to_vw":
      await applyToVerifyWise(state, link, jira, decision.vwStatus, decision.conflict);
      return;
    case "to_jira":
      await applyToJira(state, link, jira, decision.jiraStatusId, decision.conflict);
      return;
  }
}

async function applyToVerifyWise(
  state: RunState,
  link: SyncLink,
  jira: JiraSide,
  vwStatus: string,
  conflict: boolean,
): Promise<void> {
  const reason = conflict ? conflictReason(jira.statusName, link.vw_status, "Jira") : null;
  try {
    await sequelize.transaction(async (t) => {
      if (!(await stillAsRead(state, link, t))) throw new LinkChanged();
      await updateIncident(state.orgId, link.incident_id!, { status: vwStatus }, null, {
        transaction: t,
        changedBySystem: true,
      });
      await updateLinkSnapshot(
        state.orgId,
        link.id,
        {
          jiraStatusId: jira.statusId,
          vwStatus,
          jiraIssueKey: jira.key,
          state: conflict ? "conflict" : "ok",
          stateReason: reason,
        },
        t,
      );
      await insertEvent(
        state.orgId,
        {
          linkId: link.id,
          runId: state.runId,
          kind: "status_from_jira",
          detail: {
            jira_issue_key: jira.key,
            from: link.vw_status,
            to: vwStatus,
            jira_status: jira.statusName,
          },
        },
        t,
      );
      if (conflict) {
        await insertEvent(
          state.orgId,
          {
            linkId: link.id,
            runId: state.runId,
            kind: "conflict",
            detail: {
              jira_issue_key: jira.key,
              winner: "jira",
              jira_status: jira.statusName,
              vw_status: link.vw_status,
              applied: vwStatus,
            },
          },
          t,
        );
      }
    });
  } catch (err) {
    if (err instanceof LinkChanged) return; // the next run decides with fresh values
    if (err instanceof IncidentUpdateValidationError) {
      await failLink(state, link, err.errors[0]?.message ?? err.message, jira.key);
      return;
    }
    throw err;
  }
  state.counts.status_from_jira++;
  if (conflict) state.counts.conflicts++;
}

async function applyToJira(
  state: RunState,
  link: SyncLink,
  jira: JiraSide,
  targetStatusId: string | null,
  conflict: boolean,
): Promise<void> {
  const reason = conflict ? conflictReason(jira.statusName, link.vw_status, "VerifyWise") : null;
  const linkState: LinkState = conflict ? "conflict" : "ok";

  if (targetStatusId === null) {
    // "Don't change Jira": record the VerifyWise status and leave Jira as is.
    const recorded = await sequelize.transaction(async (t) => {
      if (!(await stillAsRead(state, link, t))) return false;
      await updateLinkSnapshot(
        state.orgId,
        link.id,
        {
          jiraStatusId: jira.statusId,
          vwStatus: link.vw_status,
          jiraIssueKey: jira.key,
          state: linkState,
          stateReason: reason,
        },
        t,
      );
      await insertEvent(
        state.orgId,
        {
          linkId: link.id,
          runId: state.runId,
          kind: "status_to_jira",
          detail: {
            jira_issue_key: jira.key,
            vw_status: link.vw_status,
            skipped: "Don't change Jira",
          },
        },
        t,
      );
      if (conflict) await insertConflictEvent(state, link, jira, link.vw_status, t);
      return true;
    });
    if (recorded && conflict) state.counts.conflicts++;
    return;
  }

  // Don't move Jira to a status the incident no longer holds.
  if (!(await sequelize.transaction((t) => stillAsRead(state, link, t)))) return;

  const targetName = (await statusNames(state)).get(targetStatusId) ?? targetStatusId;
  const transitions = await state.client.listTransitions(link.jira_issue_id);
  const choice = pickTransition(transitions, targetStatusId, {
    from: jira.statusName,
    to: targetName,
  });
  if (!choice.ok) {
    await failLink(state, link, choice.reason, jira.key);
    return;
  }
  await state.client.transition(link.jira_issue_id, choice.transitionId);

  // Jira has moved. If recording it fails, the next run sees both sides
  // changed and resolves it as a conflict; say so in the log.
  await recordTransition(
    state,
    link,
    jira,
    targetStatusId,
    targetName,
    linkState,
    reason,
    conflict,
  );
  state.counts.status_to_jira++;
  if (conflict) state.counts.conflicts++;
}

async function recordTransition(
  state: RunState,
  link: SyncLink,
  jira: JiraSide,
  targetStatusId: string,
  targetName: string,
  linkState: LinkState,
  reason: string | null,
  conflict: boolean,
): Promise<void> {
  try {
    await sequelize.transaction(async (t) => {
      await updateLinkSnapshot(
        state.orgId,
        link.id,
        {
          jiraStatusId: targetStatusId,
          vwStatus: link.vw_status,
          jiraIssueKey: jira.key,
          state: linkState,
          stateReason: reason,
        },
        t,
      );
      await insertEvent(
        state.orgId,
        {
          linkId: link.id,
          runId: state.runId,
          kind: "status_to_jira",
          detail: {
            jira_issue_key: jira.key,
            from: jira.statusName,
            to: targetName,
            vw_status: link.vw_status,
          },
        },
        t,
      );
      if (conflict) await insertConflictEvent(state, link, jira, link.vw_status, t);
    });
  } catch (err) {
    logger.error(
      `jira-incidents: ${jira.key} was moved to '${targetName}' in Jira but recording it failed; the next run will treat it as a change on both sides: ${(err as Error).message}`,
    );
    throw err;
  }
}

async function insertConflictEvent(
  state: RunState,
  link: SyncLink,
  jira: JiraSide,
  applied: string,
  t: Parameters<typeof insertEvent>[2],
): Promise<void> {
  await insertEvent(
    state.orgId,
    {
      linkId: link.id,
      runId: state.runId,
      kind: "conflict",
      detail: {
        jira_issue_key: jira.key,
        winner: "verifywise",
        jira_status: jira.statusName,
        vw_status: link.vw_status,
        applied,
      },
    },
    t,
  );
}

async function markDeletedInJira(state: RunState, link: SyncLink): Promise<void> {
  if (link.state === "deleted_in_jira") return;
  await sequelize.transaction(async (t) => {
    await setLinkState(state.orgId, link.id, "deleted_in_jira", null, t);
    await insertEvent(
      state.orgId,
      {
        linkId: link.id,
        runId: state.runId,
        kind: "deleted_in_jira",
        detail: { jira_issue_key: link.jira_issue_key },
      },
      t,
    );
  });
  state.counts.deleted_in_jira++;
}

/**
 * Marks the link as an error and keeps its snapshot, so the change is retried
 * next run. An event is written only when the link first enters error or its
 * reason changes, so a lasting problem adds one row, not one per run.
 */
async function failLink(
  state: RunState,
  link: SyncLink,
  reason: string,
  key?: string,
): Promise<void> {
  state.counts.errors++;
  if (link.state === "error" && link.state_reason === reason) return;
  await sequelize.transaction(async (t) => {
    await setLinkState(state.orgId, link.id, "error", reason, t);
    await insertEvent(
      state.orgId,
      {
        linkId: link.id,
        runId: state.runId,
        kind: "error",
        detail: { jira_issue_key: key ?? link.jira_issue_key, reason },
      },
      t,
    );
  });
  logger.warn(`jira-incidents: ${key ?? link.jira_issue_key}: ${reason}`);
}

async function statusNames(state: RunState): Promise<Map<string, string>> {
  if (!state.statusNames) {
    const statuses = await state.client.listStatuses(
      state.config.projectId!,
      state.config.issueTypeId!,
    );
    state.statusNames = new Map(statuses.map((s) => [s.id, s.name]));
  }
  return state.statusNames;
}

function conflictReason(
  jiraStatusName: string,
  vwStatus: string,
  winner: "Jira" | "VerifyWise",
): string {
  return `Both sides changed. Jira's '${jiraStatusName}' and VerifyWise's '${vwStatus}'; the later change (${winner}) was kept.`;
}
