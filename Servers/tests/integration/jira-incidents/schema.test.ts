jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { cleanupDatabase, seedTwoOrgsAndUsers } from "../helpers";
import { AUDIT_RECORD_TABLES } from "../../../utils/dataRetention.utils";

async function insertIncident(orgId: number): Promise<number> {
  const rows = await sequelize.query<{ id: number }>(
    `INSERT INTO ai_incident_managements (
       organization_id, ai_project, type, severity, status, occurred_date, date_detected,
       reporter, approval_status, categories_of_harm, description, created_at, updated_at, archived, is_demo
     ) VALUES (:orgId, 'Chatbot', 'Malfunction', 'Serious', 'Open', NOW(), NOW(),
       'Ada', 'Pending', '[]', 'Model produced unsafe output', NOW(), NOW(), false, false)
     RETURNING id`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  );
  return rows[0].id;
}

async function insertLink(orgId: number, incidentId: number | null, issueId: string) {
  await sequelize.query(
    `INSERT INTO jira_incident_links
       (organization_id, incident_id, jira_issue_id, jira_issue_key, jira_url,
        last_jira_status_id, last_vw_status, state)
     VALUES (:orgId, :incidentId, :issueId, 'SEC-1', 'https://x.atlassian.net/browse/SEC-1',
        '1', 'Open', 'ok')`,
    { replacements: { orgId, incidentId, issueId } },
  );
}

describe("jira incidents schema", () => {
  afterEach(cleanupDatabase);

  it("seeds the catalog row", async () => {
    const [row] = await sequelize.query<{
      category: string;
      requires_configuration: boolean;
      icon_path: string;
    }>(
      `SELECT category, requires_configuration, icon_path FROM extensions WHERE key = 'jira-incidents'`,
      { type: QueryTypes.SELECT },
    );
    expect(row).toEqual({
      category: "data_management",
      requires_configuration: true,
      icon_path: "/assets/extensions/jira-incidents.svg",
    });
  });

  it("refuses a link to another organization's incident", async () => {
    const { orgA, orgB } = await seedTwoOrgsAndUsers();
    const incidentA = await insertIncident(orgA);
    await expect(insertLink(orgB, incidentA, "10001")).rejects.toThrow(/foreign key/i);
  });

  it("refuses a second link for the same issue or the same incident", async () => {
    const { orgA } = await seedTwoOrgsAndUsers();
    const incident = await insertIncident(orgA);
    await insertLink(orgA, incident, "10001");
    // Sequelize wraps unique violations as "Validation error", so match on the error name.
    await expect(insertLink(orgA, null, "10001")).rejects.toMatchObject({
      name: "SequelizeUniqueConstraintError",
    });
    await expect(insertLink(orgA, incident, "10002")).rejects.toMatchObject({
      name: "SequelizeUniqueConstraintError",
    });
  });

  it("keeps the link and nulls incident_id when the incident is deleted", async () => {
    const { orgA } = await seedTwoOrgsAndUsers();
    const incident = await insertIncident(orgA);
    await insertLink(orgA, incident, "10001");
    await sequelize.query(`DELETE FROM ai_incident_managements WHERE id = :incident`, {
      replacements: { incident },
    });
    const [link] = await sequelize.query<{ incident_id: number | null; organization_id: number }>(
      `SELECT incident_id, organization_id FROM jira_incident_links WHERE jira_issue_id = '10001'`,
      { type: QueryTypes.SELECT },
    );
    expect(link).toEqual({ incident_id: null, organization_id: orgA });
  });

  it("rejects an unknown link state and event kind", async () => {
    const { orgA } = await seedTwoOrgsAndUsers();
    await expect(
      sequelize.query(
        `INSERT INTO jira_incident_links (organization_id, jira_issue_id, jira_issue_key, jira_url, state)
         VALUES (:orgA, '9', 'SEC-9', 'u', 'gone')`,
        { replacements: { orgA } },
      ),
    ).rejects.toThrow(/check/i);
    await expect(
      sequelize.query(
        `INSERT INTO jira_incident_sync_events (organization_id, kind) VALUES (:orgA, 'bogus')`,
        { replacements: { orgA } },
      ),
    ).rejects.toThrow(/check/i);
  });

  it("treats sync activity as an audit record", () => {
    expect(AUDIT_RECORD_TABLES).toContainEqual({
      table: "jira_incident_sync_events",
      timestampColumn: "created_at",
    });
  });
});
