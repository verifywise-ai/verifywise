jest.setTimeout(60000);

import { cleanupDatabase, seedTwoOrgsAndUsers } from "../helpers";
import { JiraCloudMock } from "../../mocks/jiraCloud/server";
import { FULL_MAPS, insertProject, rows, withMock } from "./fixtures";
import {
  getConfigView,
  jiraIncidentsReadiness,
  saveConfig,
  testConnection,
} from "../../../extensions/jira-incidents/jiraIncidents.config";

describe("jira incidents config", () => {
  let mock: JiraCloudMock;
  beforeEach(async () => {
    mock = await withMock();
  });
  afterEach(async () => {
    await mock.close();
    await cleanupDatabase();
  });

  const connection = () => ({ site_url: mock.url, email: "svc@acme.test", api_token: "token-1" });

  it("stores the token encrypted and never returns it", async () => {
    const { orgA, userA } = await seedTwoOrgsAndUsers();
    const view = await saveConfig(orgA, userA, connection());
    expect(view).toMatchObject({
      has_api_token: true,
      service_account_id: "svc-1",
      service_account_time_zone: "UTC",
    });
    expect(JSON.stringify(view)).not.toContain("token-1");
    const [row] = await rows<{ api_token_encrypted: string }>(
      `SELECT api_token_encrypted FROM jira_incidents_config WHERE organization_id = :orgA`,
      { orgA },
    );
    expect(row.api_token_encrypted).not.toContain("token-1");
  });

  it("refuses a non-Atlassian site and a rejected token", async () => {
    const { orgA, userA } = await seedTwoOrgsAndUsers();
    await expect(
      saveConfig(orgA, userA, { ...connection(), site_url: "https://evil.com" }),
    ).rejects.toThrow(/atlassian\.net/);
    await expect(saveConfig(orgA, userA, { ...connection(), api_token: "nope" })).rejects.toThrow(
      /expired or been revoked/,
    );
  });

  it("requires the token again when the site or email changes", async () => {
    const { orgA, userA } = await seedTwoOrgsAndUsers();
    await saveConfig(orgA, userA, connection());
    await expect(saveConfig(orgA, userA, { email: "other@acme.test" })).rejects.toThrow(
      /API token again/,
    );
  });

  it("refuses a status mapping that leaves a Jira status unmapped", async () => {
    const { orgA, userA } = await seedTwoOrgsAndUsers();
    await saveConfig(orgA, userA, connection());
    await expect(
      saveConfig(orgA, userA, {
        project_id: "10000",
        project_key: "SEC",
        issue_type_id: "10001",
        status_map_in: { "1": "Open" },
      }),
    ).rejects.toThrow(/'In Progress', 'Done' aren't mapped/);
  });

  it("refuses another organization's use case", async () => {
    const { orgA, orgB, userA, userB } = await seedTwoOrgsAndUsers();
    const projectB = await insertProject(orgB, userB);
    await expect(saveConfig(orgA, userA, { default_project_id: projectB })).rejects.toThrow(
      /use case/,
    );
  });

  it("names the first missing item until complete, then sets import_from once and creates an hourly schedule", async () => {
    const { orgA, userA } = await seedTwoOrgsAndUsers();
    expect(await jiraIncidentsReadiness(orgA, "scheduled")).toEqual({
      ready: false,
      status: 404,
      reason: "Jira incidents isn't set up yet",
    });
    await saveConfig(orgA, userA, connection());
    expect((await getConfigView(orgA)).readiness).toEqual({
      ready: false,
      reason: "Choose a Jira project",
    });

    const projectId = await insertProject(orgA, userA);
    await saveConfig(orgA, userA, {
      project_id: "10000",
      project_key: "SEC",
      issue_type_id: "10001",
      ...FULL_MAPS,
      default_project_id: projectId,
      default_type: "Malfunction",
      default_reporter: "Jira sync",
    });
    const view = await getConfigView(orgA);
    expect(view.readiness).toEqual({ ready: true, reason: null });
    expect(view.import_from).not.toBeNull();
    const [schedule] = await rows<{ enabled: boolean; interval_hours: number }>(
      `SELECT enabled, interval_hours FROM extension_sync_settings WHERE organization_id = :orgA AND extension_key = 'jira-incidents'`,
      { orgA },
    );
    expect(schedule).toEqual({ enabled: true, interval_hours: 1 });

    await saveConfig(orgA, userA, { default_reporter: "Security team" });
    expect((await getConfigView(orgA)).import_from).toBe(view.import_from);
  });

  it("does not overwrite a schedule the admin already changed", async () => {
    const { orgA, userA } = await seedTwoOrgsAndUsers();
    await rows(
      `INSERT INTO extension_sync_settings (organization_id, extension_key, enabled, interval_hours)
                VALUES (:orgA, 'jira-incidents', FALSE, 12) RETURNING id`,
      { orgA },
    );
    const projectId = await insertProject(orgA, userA);
    await saveConfig(orgA, userA, {
      ...connection(),
      project_id: "10000",
      project_key: "SEC",
      issue_type_id: "10001",
      ...FULL_MAPS,
      default_project_id: projectId,
      default_type: "Malfunction",
      default_reporter: "Jira sync",
    });
    const [schedule] = await rows<{ enabled: boolean; interval_hours: number }>(
      `SELECT enabled, interval_hours FROM extension_sync_settings WHERE organization_id = :orgA`,
      { orgA },
    );
    expect(schedule).toEqual({ enabled: false, interval_hours: 12 });
  });

  it("rejects a blank site or email and ignores a blank token", async () => {
    const { orgA, userA } = await seedTwoOrgsAndUsers();
    await saveConfig(orgA, userA, connection());
    await expect(saveConfig(orgA, userA, { email: "  " })).rejects.toThrow(/service account email/);
    await expect(saveConfig(orgA, userA, { site_url: "" })).rejects.toThrow(/Jira Cloud site URL/);
    const view = await saveConfig(orgA, userA, { api_token: "   ", default_reporter: "Team" });
    expect(view).toMatchObject({ has_api_token: true, default_reporter: "Team" });
  });

  it("tests the connection and names missing permissions", async () => {
    const { orgA } = await seedTwoOrgsAndUsers();
    expect(await testConnection(orgA, { ...connection(), project_id: "10000" })).toMatchObject({
      success: true,
      message: "Connected to Jira as svc-1.",
    });
    mock.state.permissions.LINK_ISSUES = false;
    expect(await testConnection(orgA, { ...connection(), project_id: "10000" })).toMatchObject({
      success: false,
      message: "Connected, but the service account is missing: Link issues",
    });
    expect((await testConnection(orgA, { ...connection(), api_token: "x" })).message).toMatch(
      /expired or been revoked/,
    );
  });
});
