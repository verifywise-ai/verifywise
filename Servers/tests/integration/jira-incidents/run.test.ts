jest.setTimeout(60000);

import { cleanupDatabase, seedTwoOrgsAndUsers } from "../helpers";
import { JiraCloudMock } from "../../mocks/jiraCloud/server";
import { insertProject, rows, seedReadyConfig, withMock } from "./fixtures";
import { runJiraIncidentsSync } from "../../../extensions/jira-incidents/jiraIncidents.sync";
import { SYNC_PROVIDERS } from "../../../extensions/sync-engine/providers";
import type { RunContext } from "../../../extensions/sync-engine/types";

async function fakeContext(
  orgId: number,
  signal = new AbortController().signal,
): Promise<RunContext> {
  const [run] = await rows<{ id: number }>(
    `INSERT INTO extension_sync_runs (organization_id, extension_key, kind, status, run_token)
     VALUES (:orgId, 'jira-incidents', 'manual', 'started', 'tok-' || floor(random() * 1e9)::text) RETURNING id`,
    { orgId },
  );
  // A run row is closed between tests' runs so the one-started-run index allows the next.
  await rows(
    `UPDATE extension_sync_runs SET status = 'completed', completed_at = now()
      WHERE organization_id = :orgId AND id = :id RETURNING id`,
    { orgId, id: run.id },
  );
  return {
    orgId,
    runId: run.id,
    kind: "manual",
    payload: {},
    triggeredBy: null,
    signal,
    heartbeat: async () => {},
    sqlOwnsRun: () => "TRUE",
    assertOwned: async () => {},
    finalize: async () => {},
    release: async () => {},
  } as unknown as RunContext;
}

describe("jira incidents run", () => {
  let mock: JiraCloudMock;
  let orgA: number;
  beforeEach(async () => {
    mock = await withMock();
    const seed = await seedTwoOrgsAndUsers();
    orgA = seed.orgA;
    await seedReadyConfig(orgA, await insertProject(orgA, seed.userA), mock);
  });
  afterEach(async () => {
    await mock.close();
    await cleanupDatabase();
  });

  it("is registered on the sync engine", () => {
    const provider = SYNC_PROVIDERS.find((p) => p.key === "jira-incidents");
    expect(provider).toMatchObject({
      displayName: "Jira incidents",
      scheduledKind: "scheduled",
      runDeadlineMs: 600000,
    });
    expect(provider!.kinds).toEqual(["manual", "scheduled"]);
  });

  it("imports then syncs, and returns counts and a message", async () => {
    mock.addIssue({ summary: "First imported issue" });
    const result = await runJiraIncidentsSync(await fakeContext(orgA));
    expect(result.counts.imported).toBe(1);
    expect(result.message).toBe("Imported 1.");
    const events = await rows<{ run_id: number }>(
      `SELECT run_id FROM jira_incident_sync_events WHERE organization_id = :orgA`,
      { orgA },
    );
    expect(events[0].run_id).not.toBeNull();
  });

  it("project access lost changes no link", async () => {
    const issue = mock.addIssue({ summary: "Will lose access" });
    await runJiraIncidentsSync(await fakeContext(orgA));
    const before = await rows(`SELECT * FROM jira_incident_links WHERE organization_id = :orgA`, {
      orgA,
    });
    mock.state.projectReadable = false;
    mock.setStatus(issue.id, "3");
    await expect(runJiraIncidentsSync(await fakeContext(orgA))).rejects.toThrow(
      "VerifyWise can no longer read Jira project SEC",
    );
    expect(
      await rows(`SELECT * FROM jira_incident_links WHERE organization_id = :orgA`, { orgA }),
    ).toEqual(before);
  });

  it("fails with the token message on a 401", async () => {
    mock.state.token = "rotated";
    await expect(runJiraIncidentsSync(await fakeContext(orgA))).rejects.toThrow(
      /expired or been revoked/,
    );
  });

  it("stops at the deadline and reports it", async () => {
    mock.addIssue({ summary: "Never imported" });
    const controller = new AbortController();
    controller.abort();
    const result = await runJiraIncidentsSync(await fakeContext(orgA, controller.signal));
    expect(result.message).toMatch(/time limit/);
    expect(result.counts.imported).toBe(0);
  });

  it("returns a not-set-up message rather than failing when the config became incomplete", async () => {
    await rows(
      `UPDATE jira_incidents_config SET default_project_id = NULL WHERE organization_id = :orgA RETURNING id`,
      { orgA },
    );
    const result = await runJiraIncidentsSync(await fakeContext(orgA));
    expect(result.message).toBe("Choose the use case for imported incidents");
  });
});
