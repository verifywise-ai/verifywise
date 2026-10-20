import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { encrypt } from "../../../utils/encryption.utils";
import { startJiraCloudMock, JiraCloudMock } from "../../mocks/jiraCloud/server";

export const FULL_MAPS = {
  status_map_in: { "1": "Open", "3": "Investigating", "4": "Closed" },
  status_map_out: {
    Open: "1",
    Investigating: "3",
    Closed: "4",
    Mitigated: null,
    Suspended: null,
    "Emergency action": null,
  },
  severity_map: { "2": "Very serious", "3": "Serious", "4": "Minor" },
};

export async function insertProject(
  orgId: number,
  ownerId: number,
  title = "Fraud model",
): Promise<number> {
  const rows = await sequelize.query<{ id: number }>(
    `INSERT INTO projects (project_title, owner, start_date, ai_risk_classification, high_risk_roles,
       goal, last_updated, last_updated_by, organization_id)
     VALUES (:title, :ownerId, NOW(), 'High risk', '{Deployer}', 'goal', NOW(), :ownerId, :orgId)
     RETURNING id`,
    { replacements: { orgId, ownerId, title }, type: QueryTypes.SELECT },
  );
  return rows[0].id;
}

export async function enableExtension(
  orgId: number,
  userId: number,
  key = "jira-incidents",
): Promise<void> {
  await sequelize.query(
    `INSERT INTO extension_enablements (organization_id, extension_id, enabled, enabled_at, enabled_by)
     SELECT :orgId, e.id, TRUE, now(), :userId FROM extensions e WHERE e.key = :key
     ON CONFLICT (organization_id, extension_id) DO UPDATE SET enabled = TRUE, enabled_at = now();`,
    { replacements: { orgId, userId, key } },
  );
}

/** A complete config pointing at `mock`, import_from at `importFrom`. */
export async function seedReadyConfig(
  orgId: number,
  projectId: number,
  mock: JiraCloudMock,
  importFrom = new Date(Date.now() - 60 * 60_000),
): Promise<void> {
  await sequelize.query(
    `INSERT INTO jira_incidents_config
       (organization_id, site_url, email, api_token_encrypted, service_account_id, service_account_time_zone,
        project_id, project_key, issue_type_id, status_map_in, status_map_out, severity_map,
        default_project_id, default_type, default_reporter, import_from)
     VALUES (:orgId, :url, 'svc@acme.test', :token, 'svc-1', :tz, '10000', 'SEC', '10001',
        CAST(:mapIn AS JSONB), CAST(:mapOut AS JSONB), CAST(:sev AS JSONB), :projectId, 'Malfunction', 'Jira sync', :importFrom)`,
    {
      replacements: {
        orgId,
        url: mock.url,
        token: encrypt("token-1"),
        tz: mock.state.account.timeZone,
        projectId,
        importFrom,
        mapIn: JSON.stringify(FULL_MAPS.status_map_in),
        mapOut: JSON.stringify(FULL_MAPS.status_map_out),
        sev: JSON.stringify(FULL_MAPS.severity_map),
      },
    },
  );
}

export async function withMock(): Promise<JiraCloudMock> {
  process.env.JIRA_INCIDENTS_ALLOW_LOCAL_SITE_URL = "true";
  return startJiraCloudMock();
}

export async function rows<T extends object = Record<string, unknown>>(
  sql: string,
  replacements: Record<string, unknown> = {},
): Promise<T[]> {
  return (await sequelize.query(sql, { replacements, type: QueryTypes.SELECT })) as T[];
}
