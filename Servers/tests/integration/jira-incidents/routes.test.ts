jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { buildTenantContext } from "../tenant-isolation/tenantIsolation.harness";
import { JiraCloudMock } from "../../mocks/jiraCloud/server";
import { enableExtension, insertProject, seedReadyConfig, withMock, rows } from "./fixtures";
import { runImport } from "../../../extensions/jira-incidents/jiraIncidents.import";
import { clientFor, loadConfig } from "../../../extensions/jira-incidents/jiraIncidents.config";
import { newCounts } from "../../../extensions/jira-incidents/jiraIncidents.run";

const BASE = "/api/extensions/jira-incidents";

describe("jira incidents routes", () => {
  let mock: JiraCloudMock;
  beforeEach(async () => {
    mock = await withMock();
  });
  afterEach(async () => {
    await mock.close();
    await cleanupDatabase();
  });

  it("is Admin only, except the links read", async () => {
    const editor = await buildTenantContext(3);
    await enableExtension(editor.orgId, editor.userId);
    for (const path of ["/config", "/jira/projects", "/events"]) {
      expect((await editor.request.get(`${BASE}${path}`)).status).toBe(403);
    }
    expect((await editor.request.put(`${BASE}/config`).send({})).status).toBe(403);
    const links = await editor.request.get(`${BASE}/links?incident_ids=1`);
    expect(links.status).toBe(200);
    expect(links.body.data).toEqual([]);
  });

  it("returns no links when the extension is disabled", async () => {
    const admin = await buildTenantContext(1);
    const res = await admin.request.get(`${BASE}/links?incident_ids=1`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect((await admin.request.get(`${BASE}/config`)).status).toBe(403);
  });

  it("validates links and events parameters", async () => {
    const admin = await buildTenantContext(1);
    await enableExtension(admin.orgId, admin.userId);
    expect((await admin.request.get(`${BASE}/links?incident_ids=1,x`)).status).toBe(400);
    expect((await admin.request.get(`${BASE}/links`)).status).toBe(400);
    expect((await admin.request.get(`${BASE}/events?limit=0`)).status).toBe(400);
    expect((await admin.request.get(`${BASE}/events?limit=500`)).status).toBe(400);
    expect((await admin.request.get(`${BASE}/events?limit=1.5`)).status).toBe(400);
  });

  it("saves config, returns no token, and serves pickers with defaults", async () => {
    const admin = await buildTenantContext(1);
    await enableExtension(admin.orgId, admin.userId);
    expect((await admin.request.get(`${BASE}/jira/projects`)).status).toBe(400);
    const put = await admin.request
      .put(`${BASE}/config`)
      .send({ site_url: mock.url, email: "svc@acme.test", api_token: "token-1" });
    expect(put.status).toBe(200);
    expect(put.body.data.has_api_token).toBe(true);
    expect(JSON.stringify(put.body)).not.toContain("token-1");

    const projects = await admin.request.get(`${BASE}/jira/projects`);
    expect(projects.status).toBe(200);
    expect(projects.body.data[0]).toMatchObject({ id: "10000", key: "SEC" });
    expect((await admin.request.get(`${BASE}/jira/statuses?project=abc&issue_type=1`)).status).toBe(
      400,
    );
    const statuses = await admin.request.get(
      `${BASE}/jira/statuses?project=10000&issue_type=10001`,
    );
    expect(statuses.body.data.default_map_out).toMatchObject({ Open: "1", Mitigated: null });
    const priorities = await admin.request.get(`${BASE}/jira/priorities`);
    expect(priorities.body.data.default_severity_map).toEqual({
      "2": "Very serious",
      "3": "Serious",
      "4": "Minor",
    });
    const bad = await admin.request.put(`${BASE}/config`).send({ site_url: "https://evil.com" });
    expect(bad.status).toBe(400);
  });

  it("runs the connection test through the generic route", async () => {
    const admin = await buildTenantContext(1);
    await enableExtension(admin.orgId, admin.userId);
    const res = await admin.request.post(`${BASE}/test-connection`).send({
      configuration: {
        site_url: mock.url,
        email: "svc@acme.test",
        api_token: "token-1",
        project_id: "10000",
      },
    });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain("Connected to Jira as svc-1.");
  });

  it("returns links for the caller's incidents only", async () => {
    const admin = await buildTenantContext(1);
    await enableExtension(admin.orgId, admin.userId);
    await seedReadyConfig(admin.orgId, await insertProject(admin.orgId, admin.userId), mock);
    mock.addIssue({ summary: "Linked issue here" });
    const config = (await loadConfig(admin.orgId))!;
    await runImport({
      orgId: admin.orgId,
      runId: null,
      startedAt: new Date(),
      config,
      client: clientFor(config),
      counts: newCounts(),
      stopReason: null,
      heartbeat: async () => {},
      deadline: new AbortController().signal,
      warnedNoFrontendUrl: false,
    });
    const [incident] = await rows<{ id: number }>(
      `SELECT id FROM ai_incident_managements WHERE organization_id = :o`,
      { o: admin.orgId },
    );
    const res = await admin.request.get(`${BASE}/links?incident_ids=${incident.id}`);
    expect(res.body.data).toEqual([
      {
        incident_id: incident.id,
        jira_issue_key: "SEC-1",
        jira_url: `${mock.url}/browse/SEC-1`,
        state: "ok",
        state_reason: null,
      },
    ]);
    const events = await admin.request.get(`${BASE}/events`);
    expect(events.body.data[0]).toMatchObject({
      kind: "imported",
      jira_issue_key: "SEC-1",
      incident_id: incident.id,
    });
  });
});
