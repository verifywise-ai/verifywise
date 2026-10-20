jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import {
  enableExtension,
  insertProject,
  rows,
  seedReadyConfig,
  withMock,
} from "../jira-incidents/fixtures";
import {
  clientFor,
  loadConfig,
  saveConfig,
} from "../../../extensions/jira-incidents/jiraIncidents.config";
import { runImport } from "../../../extensions/jira-incidents/jiraIncidents.import";
import { newCounts } from "../../../extensions/jira-incidents/jiraIncidents.run";

const BASE = "/api/extensions/jira-incidents";

/**
 * jira_incidents_config, jira_incident_links and jira_incident_sync_events, and
 * the /api/extensions/jira-incidents routes. The routes are keyed by the
 * caller's organization, not by row id, so this file covers them by hand.
 */
describe("jira incidents tenant isolation", () => {
  afterEach(cleanupDatabase);

  it("never shows or changes another organization's config, links or events", async () => {
    const mock = await withMock();
    try {
      const { owner, attacker } = await seedTwoTenantContexts();
      await enableExtension(owner.orgId, owner.userId);
      await enableExtension(attacker.orgId, attacker.userId);
      await seedReadyConfig(owner.orgId, await insertProject(owner.orgId, owner.userId), mock);
      mock.addIssue({ summary: "Owner's incident" });
      const config = (await loadConfig(owner.orgId))!;
      await runImport({
        orgId: owner.orgId,
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
        { o: owner.orgId },
      );

      // The owner sees its own link and event, so the empty answers below mean isolation.
      const ownLinks = await owner.request.get(`${BASE}/links?incident_ids=${incident.id}`);
      expect(ownLinks.body.data).toHaveLength(1);

      const cfg = await attacker.request.get(`${BASE}/config`);
      expect(cfg.body.data).toMatchObject({
        configured: false,
        site_url: null,
        has_api_token: false,
      });
      const events = await attacker.request.get(`${BASE}/events`);
      expect(events.body.data).toEqual([]);
      const links = await attacker.request.get(`${BASE}/links?incident_ids=${incident.id}`);
      expect(links.body.data).toEqual([]);

      await attacker.request.put(`${BASE}/config`).send({ default_reporter: "Attacker" });
      expect((await loadConfig(owner.orgId))!.defaultReporter).toBe("Jira sync");

      // A config pointing at the owner's use case is refused.
      const [project] = await rows<{ id: number }>(
        `SELECT id FROM projects WHERE organization_id = :o`,
        { o: owner.orgId },
      );
      await expect(
        saveConfig(attacker.orgId, attacker.userId, { default_project_id: project.id }),
      ).rejects.toThrow(/use case/);
    } finally {
      await mock.close();
    }
  });
});
