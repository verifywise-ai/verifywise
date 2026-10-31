"use strict";

/**
 * Jira incidents extension (spec docs/superpowers/specs/2026-10-14-jira-incidents-design.md).
 *
 * - catalog row `jira-incidents` (data_management, requires configuration, own icon);
 * - jira_incidents_config: one row per organization (connection, selection,
 *   mappings, defaults, import cut-off);
 * - jira_incident_links: one row per imported Jira issue. A composite FK keeps
 *   the incident in the link's organization; deleting the incident nulls only
 *   incident_id (PostgreSQL 15+ column list), so the row stays and the issue
 *   is never imported again;
 * - jira_incident_sync_events: sync activity, an audit record that follows the
 *   organization's audit retention period.
 *
 * ai_incident_managements gets a unique (id, organization_id) index as the
 * composite FK target. down() drops the three tables and the catalog row,
 * and leaves that index (shared infrastructure, like projects_id_organization_id_key).
 */

const EXTENSION = {
  key: "jira-incidents",
  name: "Jira incidents",
  display_name: "Jira incidents",
  description: "Import AI incidents logged in Jira and keep their status in sync.",
  long_description:
    "Jira incidents imports new issues from a Jira Cloud project as VerifyWise incidents, copying the summary, description and priority. After import, status stays in sync in both directions on a schedule. VerifyWise never creates Jira issues.",
  version: "1.0.0",
  author: "VerifyWise",
  category: "data_management",
  icon_path: "/assets/extensions/jira-incidents.svg",
  documentation_url: "https://docs.verifywise.com/integrations/jira-incidents",
  support_url: "https://support.verifywise.com",
  requires_configuration: true,
  features: [
    { name: "Import new issues", description: "New Jira issues become incidents", displayOrder: 1 },
    {
      name: "Two-way status sync",
      description: "Status changes reach the other side",
      displayOrder: 2,
    },
    { name: "Status and severity mapping", description: "Admin-defined mappings", displayOrder: 3 },
  ],
  tags: ["jira", "incidents", "import", "sync", "integration"],
};

// Same literal form as the extensions seed, so CAST(:tags AS TEXT[]) stays one bound value.
function toPgTextArray(values) {
  return `{${values.map((v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
}

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const run = (sql, replacements) =>
        queryInterface.sequelize.query(sql, { transaction, replacements });

      await run(
        `INSERT INTO verifywise.extensions
           (key, name, display_name, description, long_description, version, author, category,
            icon_path, documentation_url, support_url, requires_configuration, features, tags,
            created_at, updated_at)
         VALUES (:key, :name, :display_name, :description, :long_description, :version, :author,
            :category, :icon_path, :documentation_url, :support_url, :requires_configuration,
            CAST(:features AS JSONB), CAST(:tags AS TEXT[]), NOW(), NOW())
         ON CONFLICT (key) DO NOTHING;`,
        {
          ...EXTENSION,
          features: JSON.stringify(EXTENSION.features),
          tags: toPgTextArray(EXTENSION.tags),
        },
      );

      await run(`
        CREATE UNIQUE INDEX IF NOT EXISTS ai_incident_managements_id_organization_id_key
          ON verifywise.ai_incident_managements (id, organization_id);
      `);

      await run(`
        CREATE TABLE IF NOT EXISTS verifywise.jira_incidents_config (
          id                        SERIAL PRIMARY KEY,
          organization_id           INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          site_url                  VARCHAR(255),
          email                     VARCHAR(255),
          api_token_encrypted       TEXT,
          service_account_id        VARCHAR(128),
          service_account_time_zone VARCHAR(64),
          project_id                VARCHAR(32),
          project_key               VARCHAR(64),
          issue_type_id             VARCHAR(32),
          label                     VARCHAR(255),
          status_map_in             JSONB NOT NULL DEFAULT '{}'::jsonb,
          status_map_out            JSONB NOT NULL DEFAULT '{}'::jsonb,
          severity_map              JSONB NOT NULL DEFAULT '{}'::jsonb,
          default_project_id        INTEGER,
          default_type              VARCHAR(64),
          default_reporter          VARCHAR(255),
          import_from               TIMESTAMPTZ,
          last_checked_at           TIMESTAMPTZ,
          created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_by                INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          CONSTRAINT jira_incidents_config_org_unique UNIQUE (organization_id),
          CONSTRAINT jira_incidents_config_maps_are_objects_chk CHECK (
            jsonb_typeof(status_map_in) = 'object' AND jsonb_typeof(status_map_out) = 'object'
            AND jsonb_typeof(severity_map) = 'object'),
          CONSTRAINT jira_incidents_config_default_project_fk
            FOREIGN KEY (default_project_id, organization_id)
            REFERENCES verifywise.projects (id, organization_id) ON DELETE SET NULL (default_project_id)
        );
      `);

      await run(`
        CREATE TABLE IF NOT EXISTS verifywise.jira_incident_links (
          id                  SERIAL PRIMARY KEY,
          organization_id     INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          incident_id         INTEGER,
          jira_issue_id       VARCHAR(32) NOT NULL,
          jira_issue_key      VARCHAR(64) NOT NULL,
          jira_url            TEXT NOT NULL,
          last_jira_status_id VARCHAR(32),
          last_vw_status      VARCHAR(20),
          last_synced_at      TIMESTAMPTZ,
          state               VARCHAR(32) NOT NULL DEFAULT 'ok',
          state_reason        TEXT,
          created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT jira_incident_links_org_issue_unique UNIQUE (organization_id, jira_issue_id),
          CONSTRAINT jira_incident_links_state_chk CHECK (state IN
            ('ok', 'error', 'conflict', 'deleted_in_jira', 'deleted_in_verifywise')),
          CONSTRAINT jira_incident_links_incident_fk
            FOREIGN KEY (incident_id, organization_id)
            REFERENCES verifywise.ai_incident_managements (id, organization_id)
            ON DELETE SET NULL (incident_id)
        );
        CREATE UNIQUE INDEX IF NOT EXISTS uq_jira_incident_links_org_incident
          ON verifywise.jira_incident_links (organization_id, incident_id)
          WHERE incident_id IS NOT NULL;
      `);

      await run(`
        CREATE TABLE IF NOT EXISTS verifywise.jira_incident_sync_events (
          id              SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          link_id         INTEGER REFERENCES verifywise.jira_incident_links(id) ON DELETE SET NULL,
          run_id          INTEGER REFERENCES verifywise.extension_sync_runs(id) ON DELETE SET NULL,
          kind            VARCHAR(32) NOT NULL,
          detail          JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT jira_incident_sync_events_kind_chk CHECK (kind IN
            ('imported', 'status_from_jira', 'status_to_jira', 'conflict', 'error', 'deleted_in_jira'))
        );
        CREATE INDEX IF NOT EXISTS idx_jira_incident_sync_events_recent
          ON verifywise.jira_incident_sync_events (organization_id, created_at DESC);
      `);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const run = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await run(`DROP TABLE IF EXISTS verifywise.jira_incident_sync_events;`);
      await run(`DROP TABLE IF EXISTS verifywise.jira_incident_links;`);
      await run(`DROP TABLE IF EXISTS verifywise.jira_incidents_config;`);
      await run(
        `DELETE FROM verifywise.extension_sync_runs WHERE extension_key = 'jira-incidents';`,
      );
      await run(
        `DELETE FROM verifywise.extension_sync_settings WHERE extension_key = 'jira-incidents';`,
      );
      await run(`DELETE FROM verifywise.extensions WHERE key = 'jira-incidents';`);
    });
  },
};
