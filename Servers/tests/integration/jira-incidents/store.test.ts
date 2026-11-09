jest.setTimeout(60000);

import { sequelize } from "../../../database/db";
import { cleanupDatabase, seedTwoOrgsAndUsers } from "../helpers";
import * as producer from "../../../services/automations/automationProducer";
import * as workflowTriggers from "../../../services/workflows/triggers";
import { createIncidentForImport } from "../../../services/incidentImport.service";
import {
  insertEvent,
  insertLink,
  latestVwStatusChangeAt,
  linkExists,
  linksForIncidents,
  listEvents,
  listSyncableLinks,
  lockLink,
  setLinkState,
  updateLinkSnapshot,
} from "../../../extensions/jira-incidents/jiraIncidents.store";
import { insertProject, rows } from "./fixtures";

async function newIncident(orgId: number, projectId: number): Promise<number> {
  const created = await sequelize.transaction((t) =>
    createIncidentForImport(
      orgId,
      {
        projectId,
        aiProject: "Fraud model",
        type: "Malfunction",
        severity: "Serious",
        status: "Open",
        reporter: "Jira sync",
        description: "Model flagged everyone",
        occurredAt: new Date("2026-10-14T10:00:00Z"),
      },
      t,
    ),
  );
  return created.id!;
}

const link = (incidentId: number, issue = "20001") => ({
  incidentId,
  jiraIssueId: issue,
  jiraIssueKey: `SEC-${issue}`,
  jiraUrl: `https://acme.atlassian.net/browse/SEC-${issue}`,
  jiraStatusId: "1",
  vwStatus: "Open",
});

describe("jira incidents store", () => {
  beforeEach(() => {
    jest.spyOn(producer, "enqueueAutomationAction").mockResolvedValue(undefined as any);
    jest.spyOn(workflowTriggers, "triggerIncidentResponse").mockResolvedValue();
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await cleanupDatabase();
  });

  it("links an issue once and keeps links inside their organization", async () => {
    const { orgA, orgB, userA } = await seedTwoOrgsAndUsers();
    const incident = await newIncident(orgA, await insertProject(orgA, userA));
    const id = await sequelize.transaction((t) => insertLink(orgA, link(incident), t));
    expect(id).not.toBeNull();
    expect(await sequelize.transaction((t) => insertLink(orgA, link(incident), t))).toBeNull();
    expect(await linkExists(orgA, "20001")).toBe(true);
    expect(await linkExists(orgB, "20001")).toBe(false);
    expect(await linksForIncidents(orgB, [incident])).toEqual([]);
    expect(await linksForIncidents(orgA, [])).toEqual([]);
    expect(await linksForIncidents(orgA, [incident])).toEqual([
      expect.objectContaining({ incident_id: incident, jira_issue_key: "SEC-20001", state: "ok" }),
    ]);
  });

  it("lists syncable links, skipping archived incidents and finished states", async () => {
    const { orgA, orgB, userA } = await seedTwoOrgsAndUsers();
    const projectId = await insertProject(orgA, userA);
    const [i1, i2, i3] = [
      await newIncident(orgA, projectId),
      await newIncident(orgA, projectId),
      await newIncident(orgA, projectId),
    ];
    const ids: number[] = [];
    for (const [n, i] of [i1, i2, i3].entries()) {
      ids.push((await sequelize.transaction((t) => insertLink(orgA, link(i, `3000${n}`), t)))!);
    }
    await sequelize.query(`UPDATE ai_incident_managements SET archived = true WHERE id = :i2`, {
      replacements: { i2 },
    });
    await setLinkState(orgA, ids[2], "deleted_in_verifywise", "gone");
    const listed = await listSyncableLinks(orgA, 0, 10);
    expect(listed.map((l) => l.id)).toEqual([ids[0]]);
    expect(listed[0].vw_status).toBe("Open");
    expect(await listSyncableLinks(orgA, ids[0], 10)).toEqual([]);
    expect(await listSyncableLinks(orgB, 0, 10)).toEqual([]);
  });

  it("locks and updates a link snapshot", async () => {
    const { orgA, orgB, userA } = await seedTwoOrgsAndUsers();
    const incident = await newIncident(orgA, await insertProject(orgA, userA));
    const id = (await sequelize.transaction((t) => insertLink(orgA, link(incident), t)))!;
    await sequelize.transaction(async (t) => {
      expect(await lockLink(orgB, id, t)).toBeNull();
      expect(await lockLink(orgA, id, t)).toMatchObject({ id, state: "ok" });
      await updateLinkSnapshot(
        orgA,
        id,
        {
          jiraStatusId: "4",
          vwStatus: "Closed",
          jiraIssueKey: "SEC-9",
          state: "conflict",
          stateReason: "both",
        },
        t,
      );
    });
    const [row] = await rows<{
      last_jira_status_id: string;
      last_vw_status: string;
      jira_issue_key: string;
      state: string;
    }>(
      `SELECT last_jira_status_id, last_vw_status, jira_issue_key, state FROM jira_incident_links WHERE id = :id`,
      { id },
    );
    expect(row).toEqual({
      last_jira_status_id: "4",
      last_vw_status: "Closed",
      jira_issue_key: "SEC-9",
      state: "conflict",
    });
  });

  it("finds the latest status change", async () => {
    const { orgA, orgB, userA } = await seedTwoOrgsAndUsers();
    const incident = await newIncident(orgA, await insertProject(orgA, userA));
    await sequelize.query(
      `INSERT INTO incident_change_history (organization_id, incident_id, action, field_name, old_value, new_value, changed_by_system, changed_at)
       VALUES (:orgA, :incident, 'updated', 'Status', 'Open', 'Closed', true, '2099-01-01T09:00:00Z')`,
      { replacements: { orgA, incident } },
    );
    expect((await latestVwStatusChangeAt(orgA, incident))?.toISOString()).toBe(
      "2099-01-01T09:00:00.000Z",
    );
    expect(await latestVwStatusChangeAt(orgB, incident)).toBeNull();
  });

  it("records events with their incident and Jira issue, newest first, per organization", async () => {
    const { orgA, orgB, userA } = await seedTwoOrgsAndUsers();
    const incident = await newIncident(orgA, await insertProject(orgA, userA));
    const id = (await sequelize.transaction((t) => insertLink(orgA, link(incident), t)))!;
    await insertEvent(orgA, { linkId: id, runId: null, kind: "imported", detail: { n: 1 } });
    await insertEvent(orgA, { linkId: null, runId: null, kind: "error", detail: { message: "x" } });
    const events = await listEvents(orgA, 10);
    expect(events.map((e) => e.kind)).toEqual(["error", "imported"]);
    expect(events[1]).toMatchObject({
      incident_id: incident,
      jira_issue_key: "SEC-20001",
      detail: { n: 1 },
    });
    expect(events[1].incident_code).toEqual(expect.any(String));
    expect(await listEvents(orgA, 1)).toHaveLength(1);
    expect(await listEvents(orgB, 10)).toEqual([]);
  });
});
