jest.setTimeout(60000);

import { cleanupDatabase, seedTwoOrgsAndUsers } from "../helpers";
import { JiraCloudMock } from "../../mocks/jiraCloud/server";
import { insertProject, rows, seedReadyConfig, withMock } from "./fixtures";
import { clientFor, loadConfig } from "../../../extensions/jira-incidents/jiraIncidents.config";
import { runImport } from "../../../extensions/jira-incidents/jiraIncidents.import";
import { runStatusSync } from "../../../extensions/jira-incidents/jiraIncidents.statusSync";
import {
  newCounts,
  RunState,
  STOP_RATE_LIMIT,
} from "../../../extensions/jira-incidents/jiraIncidents.run";
import { JiraAuthError } from "../../../extensions/jira-incidents/jiraIncidents.errors";
import { updateIncident } from "../../../services/incidentManagement.service";
import { sequelize } from "../../../database/db";

async function stateFor(orgId: number): Promise<RunState> {
  const config = (await loadConfig(orgId))!;
  return {
    orgId,
    runId: null,
    startedAt: new Date(),
    config,
    client: clientFor(config),
    counts: newCounts(),
    stopReason: null,
    heartbeat: async () => {},
    deadline: new AbortController().signal,
    warnedNoFrontendUrl: false,
  };
}

async function sync(orgId: number): Promise<RunState> {
  const s = await stateFor(orgId);
  await runStatusSync(s);
  return s;
}

describe("jira incidents status sync", () => {
  let mock: JiraCloudMock;
  let orgA: number;
  let userA: number;
  let issueId: string;
  let incidentId: number;

  const link = async () =>
    (
      await rows<any>(`SELECT * FROM jira_incident_links WHERE organization_id = :orgA`, { orgA })
    )[0];
  const incident = async () =>
    (
      await rows<any>(`SELECT * FROM ai_incident_managements WHERE id = :incidentId`, {
        incidentId,
      })
    )[0];
  const events = async () =>
    (
      await rows<{ kind: string }>(
        `SELECT kind FROM jira_incident_sync_events WHERE organization_id = :orgA ORDER BY id`,
        { orgA },
      )
    ).map((e) => e.kind);
  const vwSet = (status: string) => updateIncident(orgA, incidentId, { status }, userA);

  beforeEach(async () => {
    mock = await withMock();
    process.env.FRONTEND_URL = "https://app.verifywise.test";
    ({ orgA, userA } = await seedTwoOrgsAndUsers());
    await seedReadyConfig(orgA, await insertProject(orgA, userA), mock);
    issueId = mock.addIssue({ summary: "Model drift alert" }).id;
    await runImport(await stateFor(orgA));
    incidentId = (await link()).incident_id;
  });
  afterEach(async () => {
    await mock.close();
    await cleanupDatabase();
  });

  it("applies a Jira change to the incident as the system", async () => {
    mock.setStatus(issueId, "3");
    const s = await sync(orgA);
    expect((await incident()).status).toBe("Investigating");
    expect(s.counts.status_from_jira).toBe(1);
    const [h] = await rows<any>(
      `SELECT changed_by_system FROM incident_change_history WHERE incident_id = :incidentId AND action = 'updated'`,
      { incidentId },
    );
    expect(h.changed_by_system).toBe(true);
  });

  it("applies a VerifyWise change to Jira, with no echo next run", async () => {
    await vwSet("Closed");
    const s = await sync(orgA);
    expect(mock.state.issues[0].statusId).toBe("4");
    expect(s.counts.status_to_jira).toBe(1);
    const again = await sync(orgA);
    expect(again.counts).toMatchObject({ status_to_jira: 0, status_from_jira: 0 });
  });

  it("re-reads a settled closed link from Jira at most once a day", async () => {
    await vwSet("Closed");
    await sync(orgA);
    expect(await link()).toMatchObject({ state: "ok", last_vw_status: "Closed" });

    // Reopened in Jira: the settled link is not due yet.
    mock.setStatus(issueId, "3");
    mock.state.calls = [];
    await sync(orgA);
    expect((await incident()).status).toBe("Closed");
    expect(mock.state.calls.some((c) => c.path.endsWith("/search/jql"))).toBe(false);

    await sequelize.query(
      `UPDATE jira_incident_links SET last_synced_at = now() - interval '25 hours' WHERE organization_id = :orgA`,
      { replacements: { orgA } },
    );
    await sync(orgA);
    expect((await incident()).status).toBe("Investigating");
  });

  it("re-reads a settled link on a manual run", async () => {
    await vwSet("Closed");
    await sync(orgA);
    mock.setStatus(issueId, "3");
    const manual = await stateFor(orgA);
    manual.recheckSettled = true;
    await runStatusSync(manual);
    expect((await incident()).status).toBe("Investigating");
  });

  it("checks a settled link at once after a VerifyWise change", async () => {
    await vwSet("Closed");
    await sync(orgA);
    await vwSet("Investigating");
    await sync(orgA);
    expect(mock.state.issues[0].statusId).toBe("3");
  });

  it("records Don't change Jira without calling Jira", async () => {
    await vwSet("Mitigated");
    await sync(orgA);
    expect(mock.state.issues[0].statusId).toBe("1");
    expect(
      mock.state.calls.some((c) => c.path.endsWith("/transitions") && c.method === "POST"),
    ).toBe(false);
    expect((await link()).last_vw_status).toBe("Mitigated");
  });

  it("lets the later change win a conflict and shows it", async () => {
    mock.setStatus(issueId, "3", new Date(Date.now() - 60_000));
    await vwSet("Closed");
    const s = await sync(orgA);
    expect(mock.state.issues[0].statusId).toBe("4");
    expect((await incident()).status).toBe("Closed");
    expect((await link()).state).toBe("conflict");
    expect(s.counts.conflicts).toBe(1);
    expect(await events()).toContain("conflict");

    await sync(orgA);
    expect((await link()).state).toBe("conflict"); // a no-change run keeps the badge
    mock.setStatus(issueId, "3");
    await sync(orgA);
    expect((await link()).state).toBe("ok"); // one side changed alone: clean
  });

  it("reports a refused transition and does not change the incident back", async () => {
    mock.state.transitions = mock.state.transitions.filter((t) => t.toStatusId !== "4");
    await vwSet("Closed");
    await sync(orgA);
    expect(await link()).toMatchObject({
      state: "error",
      state_reason: "No move from 'To Do' to 'Done' in this workflow",
    });
    expect((await incident()).status).toBe("Closed");
  });

  it("reports a transition that needs a field", async () => {
    mock.state.transitions = [
      { id: "99", name: "Resolve", toStatusId: "4", requiredFields: ["Resolution"] },
    ];
    await vwSet("Closed");
    await sync(orgA);
    expect((await link()).state_reason).toBe(
      "Moving to 'Done' needs a value for Resolution. Change the status in Jira.",
    );
  });

  it("lasting error writes one event, and a mapped status clears it (unmapped then mapped)", async () => {
    mock.state.statuses.push({ id: "8", name: "Awaiting vendor", categoryKey: "indeterminate" });
    mock.setStatus(issueId, "8");
    await sync(orgA);
    await sync(orgA);
    await sync(orgA);
    expect(await link()).toMatchObject({
      state: "error",
      state_reason: "Jira status 'Awaiting vendor' isn't mapped",
    });
    expect((await events()).filter((k) => k === "error")).toHaveLength(1);
    expect((await incident()).status).toBe("Open");

    await sequelize.query(
      `UPDATE jira_incidents_config SET status_map_in = status_map_in || '{"8": "Investigating"}'::jsonb WHERE organization_id = :orgA`,
      { replacements: { orgA } },
    );
    await sync(orgA);
    expect((await link()).state).toBe("ok");
    expect((await incident()).status).toBe("Investigating");
  });

  it("marks a deleted issue, leaves the incident, and recovers when it returns", async () => {
    mock.state.issues[0].deleted = true;
    await sync(orgA);
    await sync(orgA);
    expect((await link()).state).toBe("deleted_in_jira");
    expect((await events()).filter((k) => k === "deleted_in_jira")).toHaveLength(1);
    expect(await incident()).toBeTruthy();

    mock.state.issues[0].deleted = false;
    mock.setStatus(issueId, "3");
    await sync(orgA);
    expect(await link()).toMatchObject({ state: "ok", last_jira_status_id: "3" });
    expect((await incident()).status).toBe("Open"); // nothing written on the restoring run
  });

  it("reopens a closed, approved incident through the reopen rule", async () => {
    await sequelize.query(
      `UPDATE ai_incident_managements SET status = 'Closed', approval_status = 'Approved' WHERE id = :incidentId`,
      { replacements: { incidentId } },
    );
    await sequelize.query(
      // A settled link is only re-read once a day: make this one due.
      `UPDATE jira_incident_links SET last_vw_status = 'Closed', last_jira_status_id = '4',
              last_synced_at = now() - interval '25 hours' WHERE organization_id = :orgA`,
      { replacements: { orgA } },
    );
    mock.setStatus(issueId, "4");
    mock.setStatus(issueId, "3");
    await sync(orgA);
    expect(await incident()).toMatchObject({ status: "Investigating", approval_status: "Pending" });
  });

  it("does not overwrite a user edit made after the batch read", async () => {
    mock.setStatus(issueId, "3");
    const s = await stateFor(orgA);
    const search = s.client.searchPage.bind(s.client);
    s.client.searchPage = async (...args) => {
      const page = await search(...args);
      // A user changes the incident between the batch read and the write.
      await sequelize.query(
        `UPDATE ai_incident_managements SET status = 'Closed' WHERE id = :incidentId`,
        { replacements: { incidentId } },
      );
      return page;
    };
    await runStatusSync(s);
    expect((await incident()).status).toBe("Closed");
    expect(s.counts.status_from_jira).toBe(0);
    expect((await link()).last_vw_status).toBe("Open"); // snapshot untouched; next run decides
  });

  it("fails the run when Jira rejects the token", async () => {
    mock.state.token = "rotated";
    await expect(sync(orgA)).rejects.toBeInstanceOf(JiraAuthError);
  });

  it("stops cleanly on a rate limit", async () => {
    mock.setStatus(issueId, "3");
    mock.state.failNext.push({ status: 429, retryAfter: 120, path: "/rest/api/3/search/jql" });
    const s = await sync(orgA);
    expect(s.stopReason).toBe(STOP_RATE_LIMIT);
    expect((await incident()).status).toBe("Open");
  });

  it("reports a conflict won by VerifyWise whose status doesn't change Jira", async () => {
    mock.setStatus(issueId, "3", new Date(Date.now() - 60_000));
    await vwSet("Mitigated");
    const s = await sync(orgA);
    expect(mock.state.issues[0].statusId).toBe("3");
    expect(await link()).toMatchObject({ state: "conflict", last_vw_status: "Mitigated" });
    expect(s.counts.conflicts).toBe(1);
    expect(await events()).toEqual(expect.arrayContaining(["status_to_jira", "conflict"]));
  });

  it("skips archived incidents", async () => {
    await sequelize.query(
      `UPDATE ai_incident_managements SET archived = true WHERE id = :incidentId`,
      { replacements: { incidentId } },
    );
    mock.setStatus(issueId, "3");
    await sync(orgA);
    expect((await incident()).status).toBe("Open");
  });
});

describe("jira incidents status sync after an unmapped import", () => {
  let mock: JiraCloudMock;
  let orgA: number;
  let userA: number;

  beforeEach(async () => {
    mock = await withMock();
    process.env.FRONTEND_URL = "https://app.verifywise.test";
    ({ orgA, userA } = await seedTwoOrgsAndUsers());
    await seedReadyConfig(orgA, await insertProject(orgA, userA), mock);
  });
  afterEach(async () => {
    await mock.close();
    await cleanupDatabase();
  });

  it("keeps the error without new events until the status is mapped, then applies it", async () => {
    await sequelize.query(
      `UPDATE jira_incidents_config SET status_map_in = status_map_in - '3' WHERE organization_id = :orgA`,
      { replacements: { orgA } },
    );
    mock.addIssue({ summary: "Unmapped status here", statusId: "3" });
    await runImport(await stateFor(orgA));

    const linkRow = async () =>
      (
        await rows<any>(`SELECT * FROM jira_incident_links WHERE organization_id = :orgA`, { orgA })
      )[0];
    const errorEvents = async () =>
      (
        await rows<{ kind: string }>(
          `SELECT kind FROM jira_incident_sync_events WHERE organization_id = :orgA AND kind = 'error'`,
          { orgA },
        )
      ).length;

    await sync(orgA);
    expect(await linkRow()).toMatchObject({ state: "error", last_jira_status_id: "" });
    expect(await errorEvents()).toBe(1);

    await sequelize.query(
      `UPDATE jira_incidents_config SET status_map_in = status_map_in || '{"3": "Investigating"}'::jsonb WHERE organization_id = :orgA`,
      { replacements: { orgA } },
    );
    await sync(orgA);
    const after = await linkRow();
    expect(after).toMatchObject({
      state: "ok",
      last_jira_status_id: "3",
      last_vw_status: "Investigating",
    });
    const [incident] = await rows<{ status: string }>(
      `SELECT status FROM ai_incident_managements WHERE id = :id`,
      { id: after.incident_id },
    );
    expect(incident.status).toBe("Investigating");
  });

  it("sends a VerifyWise change to Jira without a conflict while Jira hasn't moved", async () => {
    await sequelize.query(
      `UPDATE jira_incidents_config SET status_map_in = status_map_in - '3' WHERE organization_id = :orgA`,
      { replacements: { orgA } },
    );
    const issue = mock.addIssue({ summary: "Unmapped status here", statusId: "3" });
    // Moved to the unmapped status in Jira well before the import.
    mock.setStatus(issue.id, "3", new Date(Date.now() - 10 * 60_000));
    await runImport(await stateFor(orgA));
    const linkRow = async () =>
      (
        await rows<any>(`SELECT * FROM jira_incident_links WHERE organization_id = :orgA`, { orgA })
      )[0];

    await updateIncident(orgA, (await linkRow()).incident_id, { status: "Closed" }, userA);
    const s = await sync(orgA);

    expect(mock.state.issues[0].statusId).toBe("4");
    expect(await linkRow()).toMatchObject({ state: "ok", last_vw_status: "Closed" });
    expect(s.counts.conflicts).toBe(0);
    const kinds = (
      await rows<{ kind: string }>(
        `SELECT kind FROM jira_incident_sync_events WHERE organization_id = :orgA`,
        { orgA },
      )
    ).map((e) => e.kind);
    expect(kinds).toContain("status_to_jira");
    expect(kinds).not.toContain("conflict");
  });
});

describe("jira incidents status sync with several links", () => {
  let mock: JiraCloudMock;
  let orgA: number;
  let userA: number;
  let first: { issueId: string; incidentId: number };
  let second: { issueId: string; incidentId: number };

  const linkOf = async (incidentId: number) =>
    (
      await rows<any>(`SELECT * FROM jira_incident_links WHERE incident_id = :incidentId`, {
        incidentId,
      })
    )[0];
  const statusOf = async (incidentId: number) =>
    (
      await rows<{ status: string }>(`SELECT status FROM ai_incident_managements WHERE id = :id`, {
        id: incidentId,
      })
    )[0].status;

  beforeEach(async () => {
    mock = await withMock();
    process.env.FRONTEND_URL = "https://app.verifywise.test";
    ({ orgA, userA } = await seedTwoOrgsAndUsers());
    await seedReadyConfig(orgA, await insertProject(orgA, userA), mock);
    const a = mock.addIssue({ summary: "First imported issue" }).id;
    const b = mock.addIssue({ summary: "Second imported issue" }).id;
    await runImport(await stateFor(orgA));
    const links = await rows<{ jira_issue_id: string; incident_id: number }>(
      `SELECT jira_issue_id, incident_id FROM jira_incident_links WHERE organization_id = :orgA`,
      { orgA },
    );
    const incidentFor = (issueId: string) =>
      links.find((l) => l.jira_issue_id === issueId)!.incident_id;
    first = { issueId: a, incidentId: incidentFor(a) };
    second = { issueId: b, incidentId: incidentFor(b) };
  });
  afterEach(async () => {
    await mock.close();
    await cleanupDatabase();
  });

  it("keeps syncing the rest of a batch when one issue was deleted in Jira", async () => {
    // Jira rejects an `id in (...)` search naming the deleted issue.
    mock.state.issues.find((i) => i.id === first.issueId)!.deleted = true;
    mock.setStatus(second.issueId, "3");
    const s = await sync(orgA);
    expect(s.stopReason).toBeNull();
    expect((await linkOf(first.incidentId)).state).toBe("deleted_in_jira");
    expect(await statusOf(second.incidentId)).toBe("Investigating");

    // Later runs leave the deleted link out of the batch search.
    mock.setStatus(second.issueId, "4");
    await sync(orgA);
    expect(await statusOf(second.incidentId)).toBe("Closed");
  });

  it("marks only the link when Jira refuses one issue with 403", async () => {
    await updateIncident(orgA, first.incidentId, { status: "Closed" }, userA);
    mock.state.failNext.push({
      status: 403,
      path: `/rest/api/3/issue/${first.issueId}/transitions`,
    });
    mock.setStatus(second.issueId, "3");
    const s = await sync(orgA);
    expect((await linkOf(first.incidentId)).state).toBe("error");
    expect(await statusOf(second.incidentId)).toBe("Investigating");
    expect(s.counts.errors).toBe(1);
  });
});
