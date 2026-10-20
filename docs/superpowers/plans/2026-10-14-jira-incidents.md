# Jira incidents extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A built-in `jira-incidents` extension that imports new Jira Cloud issues as VerifyWise incidents and keeps their status in step both ways, on the shared extension sync engine.

**Architecture:** A new extension folder `Servers/extensions/jira-incidents/` holds pure helpers (ADF → text, JQL, mappings, the status decision table, transition choice), a Jira Cloud REST client, config/link/event data access, the import and status-sync steps, and a sync-engine provider. Incident creation gains a system path (`createIncidentForImport`) and the `incident_added` automation moves after commit. A standalone simulated Jira Cloud server under `Servers/tests/mocks/jiraCloud/` drives the integration tests. The client gets an admin settings page and a Jira chip on imported incidents.

**Tech Stack:** Node 22, Express 4, TypeScript, Sequelize 6 (raw SQL), PostgreSQL 16, BullMQ (via the sync engine), Jest; React 19, MUI 7, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-14-jira-incidents-design.md` (approved). Read it before any task; this plan argues from it and cites its sections as `§n`.

## Global Constraints

- Extension key `jira-incidents`; catalog category `data_management`; `requires_configuration` true; icon `/assets/extensions/jira-incidents.svg`.
- Jira Cloud only; classic API token sent as Basic `email:token` to the site URL. Scoped tokens (`api.atlassian.com/ex/jira/<cloudId>`) are out of scope (confirmed against Atlassian docs while planning).
- Site URL rule: `https:` and a host ending in `.atlassian.net`; normalised to lower-case host, no path, no trailing slash. Override `JIRA_INCIDENTS_ALLOW_LOCAL_SITE_URL=true` allows `http(s)://localhost` / `127.0.0.1` **only when `NODE_ENV` is `development` or `test`**; otherwise ignored with a startup warning.
- Permission keys checked at connection test: `BROWSE_PROJECTS`, `TRANSITION_ISSUES`, `LINK_ISSUES` via `GET /rest/api/3/mypermissions?projectId=<id>&permissions=...` (response `{ permissions: { KEY: { havePermission } } }`, confirmed in Atlassian's REST v3 reference while planning).
- Sync interval: hours only, 1–168, default 1 for this extension (engine unchanged). Run deadline 10 minutes.
- Incident description: min 5, max 32,767 characters. VerifyWise statuses: Open, Investigating, Mitigated, Closed, Suspended, Emergency action. Severities: Minor, Serious, Very serious. Seven incident types from `IncidentType`.
- JQL cut-off: `max(import_from, last_checked_at − 10 minutes)`, formatted `yyyy-MM-dd HH:mm` in the service account's time zone, rounded down to the minute; plus an in-code `created >= import_from` check.
- Rate limit: 429, or 503 with `Retry-After`: one in-run wait only if `Retry-After` ≤ 10 seconds, then stop the run early ("Rate limited by Jira") and return normally.
- Every route Admin-only (`authorize("extension.admin")`) except `GET /links`, which any authenticated member may call and which returns `[]` when the extension is disabled.
- Every query filters `organization_id`; unqualified table names; tables carry `organization_id`.
- Sync activity table is an audit record (`AUDIT_RECORD_TABLES`); no new retention setting.
- Never delete an incident from a sync. Never create Jira issues.
- UI: sentence case; border `#d0d5dd`; radius 4px; primary `#13715B`; 30px control height; VerifyWise components (`VWField`, `VWSelect`, `CustomizableButton`, `ExtensionSyncPanel`, `VWTooltip`); pixel-string spacing (`gap: "8px"`), never MUI numeric multipliers. Every new UI string gets de/fr/es in `Clients/src/i18n/translations.ts`.
- Git: work only in `/Users/gorkemcetin/verifywise-jira-incidents` on `feature/jira-incidents`. Commit format `type(scope): description` with a body. Never `git stash`. Push with `run_in_background`. No PR without explicit permission.
- No competitor names anywhere. No `console.log` in shipped code (use `logger` from `Servers/utils/logger/fileLogger`).

## Review Focus

1. **Lost Jira project access during a status sync** — the run must fail with "VerifyWise can no longer read Jira project SEC" and change no link. Pinned in Task 10 (`project access lost changes no link`).
2. **An incident deleted in VerifyWise whose Jira issue still matches the import JQL** — must never be re-imported. Pinned in Task 2 (`delete marks the link`) and Task 8 (`deleted_in_verifywise is never re-imported`).
3. **Service account in a far time zone (e.g. `Pacific/Kiritimati`, UTC+14) and an issue created one minute before `import_from`** — the JQL window may include it; the in-code check must drop it. Pinned in Task 3 (`formatJqlDate`) and Task 8 (`issue created just before the cut-off`).
4. **A lasting per-link error (unmapped status, refused transition)** — retried every run, but only one `error` event until the reason changes; and once fixed, the link returns to `ok`. Pinned in Task 9 (`lasting error writes one event`, `unmapped then mapped`).
5. **Rate limit in the middle of an import page** — completed imports stay, `last_checked_at` does not move, the next run re-searches and skips what exists. Pinned in Task 8 (`rate limit mid-run`).

---

## Task 0: Worktree setup (no commit)

**Files:** none tracked.

- [ ] **Step 1: Link dependencies and env files**

```bash
cd /Users/gorkemcetin/verifywise-jira-incidents
git status --short && git log --oneline -1   # expect clean, 7f2745d6d or later
ln -s /Users/gorkemcetin/verifywise/Servers/node_modules Servers/node_modules
ln -s /Users/gorkemcetin/verifywise/Clients/node_modules Clients/node_modules
cp /Users/gorkemcetin/verifywise/Servers/.env Servers/.env
cp /Users/gorkemcetin/verifywise/Servers/.env.test Servers/.env.test
```

If either `node_modules` symlink makes `npm run build` resolve the wrong package versions (the main checkout is on another branch), delete the symlink and run `npm install` in that package instead.

- [ ] **Step 2: Confirm the gates run before changing anything**

```bash
cd Servers && npm run build && npx jest extensions/sync-engine/__tests__/registry.test.ts
cd ../Clients && npm run typecheck
```

Expected: all pass. If the integration DB in `Servers/.env.test` does not exist, stop and ask the user (it is `verifywise_mrm_test` on :5432 per the handover).

- [ ] **Step 3: Note the auto-mode trap.** Running migrations against any DB and dispatching subagents may be refused by auto mode's classifier. If refused, do not work around it; ask the user to leave auto mode.

---

## Task 1: Migration — catalog row, three tables, audit registration

**Files:**
- Create: `Servers/database/migrations/<ts>-jira-incidents-extension.js` (`<ts>` from `date +%Y%m%d%H%M%S`)
- Create: `Clients/public/assets/extensions/jira-incidents.svg`
- Modify: `Servers/scripts/auditTenantIsolationCoverage.ts` (deferred list, next to the `jira_assets_*` entries near line 135)
- Modify: `Servers/utils/dataRetention.utils.ts:27-50` (`AUDIT_RECORD_TABLES`)
- Test: `Servers/tests/integration/jira-incidents/schema.test.ts`

**Interfaces:**
- Produces tables `jira_incidents_config`, `jira_incident_links`, `jira_incident_sync_events` (columns exactly as in Step 3), unique index `ai_incident_managements_id_organization_id_key`, catalog row `extensions.key = 'jira-incidents'`.

- [ ] **Step 1: Write the failing schema test**

```ts
// Servers/tests/integration/jira-incidents/schema.test.ts
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
    const [row] = await sequelize.query<{ category: string; requires_configuration: boolean; icon_path: string }>(
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
    await expect(insertLink(orgA, null, "10001")).rejects.toThrow(/unique/i);
    await expect(insertLink(orgA, incident, "10002")).rejects.toThrow(/unique/i);
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd Servers && npx jest --config jest.config.js --globalSetup="<rootDir>/tests/integration/globalSetup.js" --runInBand tests/integration/jira-incidents/schema.test.ts`
Expected: FAIL — `relation "jira_incident_links" does not exist` and the catalog row is `undefined`.

- [ ] **Step 3: Write the migration**

```js
// Servers/database/migrations/<ts>-jira-incidents-extension.js
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
    { name: "Two-way status sync", description: "Status changes reach the other side", displayOrder: 2 },
    { name: "Status and severity mapping", description: "Admin-defined mappings", displayOrder: 3 },
  ],
  tags: ["jira", "incidents", "import", "sync", "integration"],
};

function toPgTextArray(values) {
  return `{${values.map((v) => `"${String(v).replace(/(["\\])/g, "\\$1")}"`).join(",")}}`;
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
        { ...EXTENSION, features: JSON.stringify(EXTENSION.features), tags: toPgTextArray(EXTENSION.tags) },
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
      await run(`DELETE FROM verifywise.extension_sync_runs WHERE extension_key = 'jira-incidents';`);
      await run(`DELETE FROM verifywise.extension_sync_settings WHERE extension_key = 'jira-incidents';`);
      await run(`DELETE FROM verifywise.extensions WHERE key = 'jira-incidents';`);
    });
  },
};
```

Before running, open `20260811102307-extensions-migration.js` and confirm the `extensions` column list and the `features`/`tags` column types match the INSERT above (`features` JSONB, `tags` TEXT[]); adjust the casts if the seed used a different form. If `projects (id, organization_id)` has no unique index named `projects_id_organization_id_key` in the test DB, the config FK fails; it is created by `20261012165625-jira-assets-link-same-org-fk.js`, which runs earlier.

- [ ] **Step 4: Add the icon**

Create `Clients/public/assets/extensions/jira-incidents.svg`: copy `jira-assets.svg` and change its fill to `#13715B` so the two catalog cards differ. Keep it a plain SVG (no scripts, no external refs).

- [ ] **Step 5: Register the tables**

In `Servers/utils/dataRetention.utils.ts`, append to `AUDIT_RECORD_TABLES`:

```ts
  { table: "jira_incident_sync_events", timestampColumn: "created_at" },
```

In `Servers/scripts/auditTenantIsolationCoverage.ts`, next to the `jira_assets_config` entry, add three entries in the same shape:

```ts
  {
    name: "jira_incidents_config",
    justification:
      "Extension-owned table (jira-incidents). Every query in Servers/extensions/jira-incidents/ filters by organization_id; UNIQUE(organization_id). Route coverage: tests/integration/tenant-isolation/jiraIncidents.isolation.test.ts.",
  },
  {
    name: "jira_incident_links",
    justification:
      "Extension-owned table (jira-incidents). Every query filters by organization_id; a composite FK (incident_id, organization_id) keeps a link in its incident's organization. Route coverage: tests/integration/tenant-isolation/jiraIncidents.isolation.test.ts.",
  },
  {
    name: "jira_incident_sync_events",
    justification:
      "Extension-owned audit table (jira-incidents sync activity). Every query filters by organization_id. Route coverage: tests/integration/tenant-isolation/jiraIncidents.isolation.test.ts.",
  },
```

`Servers/scripts/migrationConfig.ts` is not changed: it orders the one-off tenant-schema → shared-schema data copy, and no extension or sync-engine table is listed there (Jira Assets and `extension_sync_*` precedent). Say so in the commit body.

- [ ] **Step 6: Run the test to verify it passes**

Run the Step 2 command. `globalSetup.js` migrates the test DB. Expected: PASS (6 tests). Then run `cd Servers && npx ts-node --transpile-only scripts/auditTenantIsolationCoverage.ts` and expect no unknown-table failure.

- [ ] **Step 7: Commit**

```bash
git add Servers/database/migrations/*-jira-incidents-extension.js Clients/public/assets/extensions/jira-incidents.svg \
  Servers/scripts/auditTenantIsolationCoverage.ts Servers/utils/dataRetention.utils.ts \
  Servers/tests/integration/jira-incidents/schema.test.ts
git commit -m "feat(jira-incidents): add the catalog row and the extension tables" -m "Config, link and sync activity tables, each organization-scoped. Links reach incidents through a composite FK that nulls only incident_id on delete, so a deleted incident is never re-imported. Sync activity joins the audit record tables. migrationConfig.ts is unchanged: no extension table is in the tenant-schema copy order."
```

---

## Task 2: Incident system creation path and after-commit automation

**Files:**
- Modify: `Servers/utils/changeHistory.base.utils.ts:436-460` (`recordEntityCreation`)
- Modify: `Servers/utils/incidentManagement.utils.ts:101-207` (`createNewIncidentQuery`), `:361-420` (`deleteIncidentByIdQuery`)
- Create: `Servers/services/incidentImport.service.ts`
- Test: `Servers/tests/integration/jira-incidents/incidentImport.test.ts`

**Interfaces:**
- Produces: `recordEntityCreation(entityType, entityId, changedByUserId: number | null, organizationId, entityData, transaction?, changedBySystem = false)`.
- Produces: `createIncidentForImport(organizationId: number, input: ImportedIncidentInput, transaction: Transaction): Promise<AIIncidentManagementModel>` with

```ts
export interface ImportedIncidentInput {
  projectId: number;
  aiProject: string;
  type: string;
  severity: string;
  status: string;
  reporter: string;
  description: string;
  occurredAt: Date;
}
```

- Changes: `createNewIncidentQuery` enqueues `incident_added` in `transaction.afterCommit`, for every caller. `deleteIncidentByIdQuery` sets the incident's link to `deleted_in_verifywise` in the same transaction.

- [ ] **Step 1: Write the failing tests**

```ts
// Servers/tests/integration/jira-incidents/incidentImport.test.ts
jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { cleanupDatabase, seedTwoOrgsAndUsers } from "../helpers";
import * as producer from "../../../services/automations/automationProducer";
import * as workflowTriggers from "../../../services/workflows/triggers";
import { createIncidentForImport } from "../../../services/incidentImport.service";
import { deleteIncidentByIdQuery } from "../../../utils/incidentManagement.utils";

async function insertProject(orgId: number, ownerId: number): Promise<number> {
  const rows = await sequelize.query<{ id: number }>(
    `INSERT INTO projects (project_title, owner, start_date, ai_risk_classification, high_risk_roles,
       goal, last_updated, last_updated_by, organization_id)
     VALUES ('Fraud model', :ownerId, NOW(), 'High risk', '{Deployer}', 'goal', NOW(), :ownerId, :orgId)
     RETURNING id`,
    { replacements: { orgId, ownerId }, type: QueryTypes.SELECT },
  );
  return rows[0].id;
}

async function addIncidentAddedAutomation(orgId: number): Promise<void> {
  await sequelize.query(
    `WITH a AS (
       INSERT INTO automations (organization_id, name, trigger_id, is_active)
       SELECT :orgId, 'Incident email', t.id, TRUE FROM automation_triggers t WHERE t.key = 'incident_added'
       RETURNING id)
     INSERT INTO automation_actions_data (organization_id, automation_id, action_type_id, params, "order")
     SELECT :orgId, a.id, act.id, '{"to": ["a@b.co"], "subject": "New", "body": "x"}'::jsonb, 1
       FROM a, automation_actions act WHERE act.key = 'send_email'`,
    { replacements: { orgId } },
  );
}

const input = (projectId: number, severity = "Serious") => ({
  projectId,
  aiProject: "Fraud model",
  type: "Malfunction",
  severity,
  status: "Open",
  reporter: "Jira sync",
  description: "Model flagged everyone\n\nDetails",
  occurredAt: new Date("2026-10-14T10:00:00Z"),
});

describe("createIncidentForImport", () => {
  let enqueue: jest.SpyInstance;
  let trigger: jest.SpyInstance;
  beforeEach(() => {
    enqueue = jest.spyOn(producer, "enqueueAutomationAction").mockResolvedValue(undefined as any);
    trigger = jest.spyOn(workflowTriggers, "triggerIncidentResponse").mockResolvedValue();
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await cleanupDatabase();
  });

  it("creates the incident with system history", async () => {
    const { orgA, userA } = await seedTwoOrgsAndUsers();
    const projectId = await insertProject(orgA, userA);
    const created = await sequelize.transaction((t) =>
      createIncidentForImport(orgA, input(projectId), t),
    );
    const history = await sequelize.query<{ changed_by_user_id: number | null; changed_by_system: boolean }>(
      `SELECT changed_by_user_id, changed_by_system FROM incident_change_history
        WHERE organization_id = :orgA AND incident_id = :id`,
      { replacements: { orgA, id: created.id }, type: QueryTypes.SELECT },
    );
    expect(history.length).toBeGreaterThan(0);
    expect(history.every((h) => h.changed_by_user_id === null && h.changed_by_system)).toBe(true);
  });

  it("enqueues incident_added only after commit", async () => {
    const { orgA, userA } = await seedTwoOrgsAndUsers();
    await addIncidentAddedAutomation(orgA);
    const projectId = await insertProject(orgA, userA);

    await expect(
      sequelize.transaction(async (t) => {
        await createIncidentForImport(orgA, input(projectId), t);
        throw new Error("roll back");
      }),
    ).rejects.toThrow("roll back");
    expect(enqueue).not.toHaveBeenCalled();

    await sequelize.transaction((t) => createIncidentForImport(orgA, input(projectId), t));
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("starts the incident response workflow for Very serious, after commit", async () => {
    const { orgA, userA } = await seedTwoOrgsAndUsers();
    const projectId = await insertProject(orgA, userA);
    const created = await sequelize.transaction(async (t) => {
      const incident = await createIncidentForImport(orgA, input(projectId, "Very serious"), t);
      expect(trigger).not.toHaveBeenCalled();
      return incident;
    });
    expect(trigger).toHaveBeenCalledWith(orgA, created.id, "Very serious");
  });

  it("delete marks the link deleted_in_verifywise and keeps it", async () => {
    const { orgA, userA } = await seedTwoOrgsAndUsers();
    const projectId = await insertProject(orgA, userA);
    const created = await sequelize.transaction((t) =>
      createIncidentForImport(orgA, input(projectId), t),
    );
    await sequelize.query(
      `INSERT INTO jira_incident_links (organization_id, incident_id, jira_issue_id, jira_issue_key, jira_url, state)
       VALUES (:orgA, :id, '10001', 'SEC-1', 'u', 'ok')`,
      { replacements: { orgA, id: created.id } },
    );
    await sequelize.transaction((t) => deleteIncidentByIdQuery(created.id!, orgA, t));
    const [link] = await sequelize.query<{ incident_id: number | null; state: string }>(
      `SELECT incident_id, state FROM jira_incident_links WHERE organization_id = :orgA`,
      { replacements: { orgA }, type: QueryTypes.SELECT },
    );
    expect(link).toEqual({ incident_id: null, state: "deleted_in_verifywise" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd Servers && npx jest --config jest.config.js --globalSetup="<rootDir>/tests/integration/globalSetup.js" --runInBand tests/integration/jira-incidents/incidentImport.test.ts`
Expected: FAIL — `Cannot find module '../../../services/incidentImport.service'`.

If `jest.spyOn` on `triggerIncidentResponse` reports "Cannot redefine property", `triggers.ts` exports through `export { ... }` with a non-configurable binding; in that case change the service to import the module as a namespace (`import * as workflowTriggers from "./workflows/triggers"`) and call `workflowTriggers.triggerIncidentResponse(...)`, which ts-jest resolves through the spied object.

- [ ] **Step 3: Implement**

`changeHistory.base.utils.ts` — `recordEntityCreation` gains the system flag, mirroring `recordEntityChange`:

```ts
export const recordEntityCreation = async (
  entityType: EntityType,
  entityId: number,
  changedByUserId: number | null,
  organizationId: number,
  entityData: any,
  transaction?: Transaction,
  changedBySystem = false,
): Promise<void> => {
  const config = getEntityConfig(entityType);

  // Record initial field values as changes
  for (const field of config.fieldsToTrack) {
    const value = entityData[field];
    if (value !== undefined && value !== null && value !== "") {
      await recordEntityChange(
        entityType,
        entityId,
        "created",
        changedByUserId,
        organizationId,
        getFieldLabel(entityType, field),
        "-",
        // Tenant-scoped name lookups, on the creating transaction.
        await formatFieldValue(entityType, field, value, { organizationId, transaction }),
        transaction,
        changedBySystem,
      );
    }
  }
};
```

Update the JSDoc `@param changedByUserId` to "ID of the user creating the entity; null with `changedBySystem`" and add `@param changedBySystem`.

`incidentManagement.utils.ts` — in `createNewIncidentQuery`, keep the automation SELECT on the transaction, and move only the enqueue into `transaction.afterCommit`:

```ts
    if (automations[0].length > 0) {
      const automation = automations[0][0];
      if (automation["trigger_key"] === "incident_added") {
        const params = automation.params!;
        const replacements = buildIncidentReplacements(createdIncident);
        const processedParams = {
          ...params,
          subject: replaceTemplateVariables(params.subject || "", replacements),
          body: replaceTemplateVariables(params.body || "", replacements),
          automation_id: automation.automation_id,
        };
        // After commit: a rolled-back create (an import that failed later in
        // its transaction) must not send an "incident added" email.
        transaction.afterCommit(() => {
          enqueueAutomationAction(automation.action_key, { ...processedParams, organizationId }).catch(
            (error) => logger.error(`[incident] incident_added enqueue failed: ${error}`),
          );
        });
      } else {
        console.warn(`No matching trigger found for key: ${automation["trigger_key"]}`);
      }
    }
```

Keep whatever name the current code uses for the replacements builder (read lines 159-201 first; the snippet above shows the shape, not new names). Import `logger` from `./logger/fileLogger` if the file does not already.

In `deleteIncidentByIdQuery`, before the `DELETE`:

```ts
    // A Jira-imported incident keeps its link row, marked so the issue is
    // never imported again (the FK then nulls incident_id).
    await sequelize.query(
      `UPDATE jira_incident_links
          SET state = 'deleted_in_verifywise', state_reason = NULL, updated_at = now()
        WHERE organization_id = :organizationId AND incident_id = :id`,
      { replacements: { organizationId, id }, transaction },
    );
```

`Servers/services/incidentImport.service.ts`:

```ts
/**
 * Creates an incident on behalf of an integration (Jira incidents import),
 * without the HTTP controller: the insert, change history recorded as the
 * system, and — after the caller's transaction commits — the incident
 * response workflow for Very serious incidents. `incident_added`
 * automations are enqueued after commit by createNewIncidentQuery itself.
 */
import { Transaction } from "sequelize";
import { AIIncidentManagementModel } from "../domain.layer/models/incidentManagement/incidemtManagement.model";
import { createNewIncidentQuery } from "../utils/incidentManagement.utils";
import { recordEntityCreation } from "../utils/changeHistory.base.utils";
import * as workflowTriggers from "./workflows/triggers";
import logger from "../utils/logger/fileLogger";

export interface ImportedIncidentInput {
  projectId: number;
  aiProject: string;
  type: string;
  severity: string;
  status: string;
  reporter: string;
  description: string;
  occurredAt: Date;
}

const CRITICAL_SEVERITIES = new Set(["very serious", "critical"]);

export async function createIncidentForImport(
  organizationId: number,
  input: ImportedIncidentInput,
  transaction: Transaction,
): Promise<AIIncidentManagementModel> {
  const now = new Date();
  const fields = {
    ai_project: input.aiProject,
    project_id: input.projectId,
    model_inventory_id: null,
    assignee_id: null,
    type: input.type,
    severity: input.severity,
    status: input.status,
    occurred_date: input.occurredAt,
    date_detected: input.occurredAt,
    reporter: input.reporter,
    approval_status: "Pending",
    categories_of_harm: [],
    description: input.description,
    archived: false,
    created_at: now,
    updated_at: now,
  };
  const created = await createNewIncidentQuery(
    new AIIncidentManagementModel(fields as any),
    organizationId,
    transaction,
  );
  await recordEntityCreation("incident", created.id!, null, organizationId, fields, transaction, true);

  if (CRITICAL_SEVERITIES.has(input.severity.toLowerCase())) {
    transaction.afterCommit(() => {
      workflowTriggers
        .triggerIncidentResponse(organizationId, created.id!, input.severity)
        .catch((err) => logger.error(`[incident] incident_response trigger failed: ${err}`));
    });
  }
  return created;
}
```

If `logger` is a named export in this codebase (`import logger, { logStructured } from ...` in `extension.ctrl.ts` shows default), keep default.

- [ ] **Step 4: Run tests**

Run the Step 2 command. Expected: PASS (4). Then run the existing incident suites to catch callers affected by the after-commit move:

```bash
cd Servers && npx jest --config jest.config.js --globalSetup="<rootDir>/tests/integration/globalSetup.js" --runInBand tests/integration/incidentUpdate.concurrency.test.ts tests/integration/tenant-isolation/incidents.isolation.test.ts
npx jest controllers utils/__tests__ --testPathPatterns=incident
```

Expected: PASS. A unit test that asserted `enqueueAutomationAction` is called synchronously during `createNewIncidentQuery` must be updated to commit (or invoke the afterCommit callback) first; change the assertion, not the behaviour.

- [ ] **Step 5: Commit**

```bash
git add Servers/utils/changeHistory.base.utils.ts Servers/utils/incidentManagement.utils.ts \
  Servers/services/incidentImport.service.ts Servers/tests/integration/jira-incidents/incidentImport.test.ts
git commit -m "feat(incidents): add a system creation path and send incident_added after commit" -m "createIncidentForImport creates an incident without the HTTP controller: history recorded as the system and the incident response workflow started after commit for Very serious. createNewIncidentQuery now enqueues the incident_added automation after commit for every caller, so a rolled-back create sends no email. Deleting an incident marks its Jira link deleted_in_verifywise."
```

---

## Task 3: Pure helpers — ADF, description, JQL, site URL

**Files:**
- Create: `Servers/extensions/jira-incidents/jiraIncidents.constants.ts`
- Create: `Servers/extensions/jira-incidents/adf.ts`
- Create: `Servers/extensions/jira-incidents/jql.ts`
- Create: `Servers/extensions/jira-incidents/siteUrl.ts`
- Test: `Servers/extensions/jira-incidents/__tests__/adf.test.ts`, `jql.test.ts`, `siteUrl.test.ts`

**Interfaces:**
- Produces (constants):

```ts
export const JIRA_INCIDENTS_KEY = "jira-incidents";
export const JIRA_INCIDENTS_RUN_KINDS = ["manual", "scheduled"] as const;
export const RUN_DEADLINE_MS = 10 * 60 * 1000;
export const REQUEST_TIMEOUT_SECONDS = 30;
export const IMPORT_OVERLAP_MINUTES = 10;
export const MAX_RETRY_AFTER_SECONDS = 10;
export const SEARCH_PAGE_SIZE = 50;
export const STATUS_BATCH_SIZE = 50;
export const EVENTS_DEFAULT_LIMIT = 50;
export const EVENTS_MAX_LIMIT = 200;
export const REQUIRED_PERMISSIONS = ["BROWSE_PROJECTS", "TRANSITION_ISSUES", "LINK_ISSUES"] as const;
export const VW_STATUSES = Object.values(AIIncidentManagementStatus) as string[];
export const VW_SEVERITIES = Object.values(Severity) as string[];
export const INCIDENT_TYPES = Object.values(IncidentType) as string[];
export type LinkState = "ok" | "error" | "conflict" | "deleted_in_jira" | "deleted_in_verifywise";
export type EventKind = "imported" | "status_from_jira" | "status_to_jira" | "conflict" | "error" | "deleted_in_jira";
export const DESCRIPTION_MIN = 5;
export const DESCRIPTION_MAX = 32767;
export const TOKEN_REJECTED_MESSAGE = "Jira rejected the API token. It may have expired or been revoked.";
```

- Produces: `adfToText(doc: unknown): string`; `buildIncidentDescription(summary: string, adfDescription: unknown, issueKey: string): string`.
- Produces: `escapeJqlString(value: string): string`; `formatJqlDate(at: Date, timeZone: string): string`; `importCutoff(importFrom: Date, lastCheckedAt: Date | null): Date`; `buildImportJql(p: { projectId: string; issueTypeId: string; label: string | null; cutoff: string }): string`; `buildIdsJql(ids: string[]): string`.
- Produces: `class JiraIncidentsValidationError extends Error`; `normalizeSiteUrl(raw: unknown, env?: NodeJS.ProcessEnv): string`; `localSiteUrlAllowed(env?: NodeJS.ProcessEnv): boolean`; `warnIfLocalOverrideIgnored(env?: NodeJS.ProcessEnv, warn?: (m: string) => void): void`.

- [ ] **Step 1: Write the failing tests**

```ts
// Servers/extensions/jira-incidents/__tests__/adf.test.ts
import { adfToText, buildIncidentDescription } from "../adf";

const doc = (...content: unknown[]) => ({ type: "doc", version: 1, content });
const p = (...content: unknown[]) => ({ type: "paragraph", content });
const text = (t: string) => ({ type: "text", text: t });

describe("adfToText", () => {
  it("joins paragraphs with blank lines", () => {
    expect(adfToText(doc(p(text("One")), p(text("Two"))))).toBe("One\n\nTwo");
  });
  it("renders headings, bullet and ordered lists, code and mentions", () => {
    const value = doc(
      { type: "heading", attrs: { level: 2 }, content: [text("Impact")] },
      { type: "bulletList", content: [
        { type: "listItem", content: [p(text("a"))] },
        { type: "listItem", content: [p(text("b"))] },
      ] },
      { type: "orderedList", content: [{ type: "listItem", content: [p(text("first"))] }] },
      { type: "codeBlock", content: [text("x = 1")] },
      p(text("ping "), { type: "mention", attrs: { text: "@Ada" } }, { type: "hardBreak" }, text("bye")),
    );
    expect(adfToText(value)).toBe("Impact\n\n- a\n- b\n\n1. first\n\nx = 1\n\nping @Ada\nbye");
  });
  it("returns empty text for null, a plain string description or an empty doc", () => {
    expect(adfToText(null)).toBe("");
    expect(adfToText(doc())).toBe("");
    expect(adfToText("legacy text")).toBe("legacy text");
  });
});

describe("buildIncidentDescription", () => {
  it("puts the summary first, then a blank line and the body", () => {
    expect(buildIncidentDescription("Bot leaked data", doc(p(text("Body"))), "SEC-1")).toBe(
      "Bot leaked data\n\nBody",
    );
  });
  it("uses the summary alone when the body is empty", () => {
    expect(buildIncidentDescription("Bot leaked data", null, "SEC-1")).toBe("Bot leaked data");
  });
  it("pads a result shorter than 5 characters with the issue key", () => {
    expect(buildIncidentDescription("Bug", null, "SEC-42")).toBe("Bug (SEC-42)");
    expect(buildIncidentDescription("", null, "SEC-42")).toBe("SEC-42");
  });
  it("cuts to 32,767 characters", () => {
    const out = buildIncidentDescription("S", doc(p(text("x".repeat(40000)))), "SEC-1");
    expect(out).toHaveLength(32767);
  });
});
```

```ts
// Servers/extensions/jira-incidents/__tests__/jql.test.ts
import { buildIdsJql, buildImportJql, escapeJqlString, formatJqlDate, importCutoff } from "../jql";

describe("jql", () => {
  it("escapes quotes and backslashes in a label", () => {
    expect(escapeJqlString('ai "risk"\\x')).toBe('ai \\"risk\\"\\\\x');
  });
  it("formats the cut-off in the service account's time zone, rounded down", () => {
    const at = new Date("2026-10-14T10:05:59Z");
    expect(formatJqlDate(at, "UTC")).toBe("2026-10-14 10:05");
    expect(formatJqlDate(at, "Pacific/Kiritimati")).toBe("2026-10-15 00:05");
    expect(formatJqlDate(at, "America/Los_Angeles")).toBe("2026-10-14 03:05");
  });
  it("falls back to UTC for an unknown time zone", () => {
    expect(formatJqlDate(new Date("2026-10-14T10:05:00Z"), "Mars/Base")).toBe("2026-10-14 10:05");
  });
  it("cuts off at import_from or ten minutes before the last check, whichever is later", () => {
    const importFrom = new Date("2026-10-14T09:00:00Z");
    expect(importCutoff(importFrom, null)).toEqual(importFrom);
    expect(importCutoff(importFrom, new Date("2026-10-14T09:05:00Z"))).toEqual(importFrom);
    expect(importCutoff(importFrom, new Date("2026-10-14T12:00:00Z"))).toEqual(
      new Date("2026-10-14T11:50:00Z"),
    );
  });
  it("builds the import query from ids, with an optional quoted label", () => {
    expect(
      buildImportJql({ projectId: "10000", issueTypeId: "10001", label: null, cutoff: "2026-10-14 10:05" }),
    ).toBe('project = 10000 AND issuetype = 10001 AND created >= "2026-10-14 10:05" ORDER BY created ASC');
    expect(
      buildImportJql({ projectId: "10000", issueTypeId: "10001", label: 'ai "x"', cutoff: "2026-10-14 10:05" }),
    ).toBe(
      'project = 10000 AND issuetype = 10001 AND labels = "ai \\"x\\"" AND created >= "2026-10-14 10:05" ORDER BY created ASC',
    );
  });
  it("refuses non-numeric project or issue type ids", () => {
    expect(() =>
      buildImportJql({ projectId: "1 OR 1=1", issueTypeId: "1", label: null, cutoff: "2026-10-14 10:05" }),
    ).toThrow(/project/);
  });
  it("builds an id list query and refuses non-numeric ids", () => {
    expect(buildIdsJql(["1", "22"])).toBe("id in (1,22)");
    expect(() => buildIdsJql(["1)"])).toThrow();
  });
});
```

```ts
// Servers/extensions/jira-incidents/__tests__/siteUrl.test.ts
import { localSiteUrlAllowed, normalizeSiteUrl, warnIfLocalOverrideIgnored } from "../siteUrl";

const prod = { NODE_ENV: "production", JIRA_INCIDENTS_ALLOW_LOCAL_SITE_URL: "true" } as NodeJS.ProcessEnv;
const dev = { NODE_ENV: "development", JIRA_INCIDENTS_ALLOW_LOCAL_SITE_URL: "true" } as NodeJS.ProcessEnv;
const test = { NODE_ENV: "test", JIRA_INCIDENTS_ALLOW_LOCAL_SITE_URL: "true" } as NodeJS.ProcessEnv;
const plain = { NODE_ENV: "development" } as NodeJS.ProcessEnv;

describe("normalizeSiteUrl", () => {
  it("normalises an Atlassian site URL", () => {
    expect(normalizeSiteUrl(" https://ACME.atlassian.net/jira/your-work/ ", plain)).toBe(
      "https://acme.atlassian.net",
    );
  });
  it.each([
    "http://acme.atlassian.net",
    "https://acme.atlassian.net.evil.com",
    "https://atlassian.net",
    "https://evil.com/acme.atlassian.net",
    "https://user:pw@acme.atlassian.net",
    "ftp://acme.atlassian.net",
    "",
    42,
  ])("rejects %p", (raw) => {
    expect(() => normalizeSiteUrl(raw, plain)).toThrow(/atlassian\.net/);
  });
  it("allows localhost only with the override in development or test", () => {
    expect(normalizeSiteUrl("http://localhost:4010", dev)).toBe("http://localhost:4010");
    expect(normalizeSiteUrl("http://127.0.0.1:4010/", test)).toBe("http://127.0.0.1:4010");
    expect(() => normalizeSiteUrl("http://localhost:4010", prod)).toThrow();
    expect(() => normalizeSiteUrl("http://localhost:4010", plain)).toThrow();
    expect(() => normalizeSiteUrl("http://10.0.0.5:4010", dev)).toThrow();
  });
  it("reports whether the override is active", () => {
    expect(localSiteUrlAllowed(dev)).toBe(true);
    expect(localSiteUrlAllowed(test)).toBe(true);
    expect(localSiteUrlAllowed(prod)).toBe(false);
    expect(localSiteUrlAllowed({ NODE_ENV: "development", JIRA_INCIDENTS_ALLOW_LOCAL_SITE_URL: "1" } as any)).toBe(false);
  });
  it("warns when the override is set outside development and test", () => {
    const warn = jest.fn();
    warnIfLocalOverrideIgnored(prod, warn);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("JIRA_INCIDENTS_ALLOW_LOCAL_SITE_URL"));
    warn.mockClear();
    warnIfLocalOverrideIgnored(dev, warn);
    expect(warn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd Servers && npx jest extensions/jira-incidents/__tests__/adf.test.ts extensions/jira-incidents/__tests__/jql.test.ts extensions/jira-incidents/__tests__/siteUrl.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`jiraIncidents.constants.ts`: the constants block from **Interfaces**, with

```ts
import {
  AIIncidentManagementStatus,
  IncidentType,
  Severity,
} from "../../domain.layer/enums/ai-incident-management.enum";
```

`adf.ts`:

```ts
import { DESCRIPTION_MAX, DESCRIPTION_MIN } from "./jiraIncidents.constants";

type AdfNode = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: AdfNode[] };

const BLOCK_SEPARATOR = "\n\n";

function inline(nodes: AdfNode[] | undefined): string {
  return (nodes ?? [])
    .map((n) => {
      if (n.type === "text") return n.text ?? "";
      if (n.type === "hardBreak") return "\n";
      if (n.type === "mention") return String(n.attrs?.text ?? "");
      if (n.type === "emoji") return String(n.attrs?.text ?? n.attrs?.shortName ?? "");
      if (n.type === "inlineCard") return String(n.attrs?.url ?? "");
      return inline(n.content);
    })
    .join("");
}

function block(node: AdfNode): string {
  switch (node.type) {
    case "paragraph":
    case "heading":
    case "codeBlock":
      return inline(node.content);
    case "bulletList":
      return (node.content ?? []).map((item) => `- ${listItem(item)}`).join("\n");
    case "orderedList":
      return (node.content ?? []).map((item, i) => `${i + 1}. ${listItem(item)}`).join("\n");
    case "blockquote":
    case "panel":
      return blocks(node.content);
    case "rule":
      return "";
    default:
      return node.content ? blocks(node.content) : inline([node]);
  }
}

function listItem(item: AdfNode): string {
  return (item.content ?? []).map(block).filter(Boolean).join(" ");
}

function blocks(nodes: AdfNode[] | undefined): string {
  return (nodes ?? []).map(block).filter((s) => s.trim() !== "").join(BLOCK_SEPARATOR);
}

/** Plain text from an Atlassian Document Format value; a plain string passes through. */
export function adfToText(doc: unknown): string {
  if (typeof doc === "string") return doc;
  if (!doc || typeof doc !== "object") return "";
  return blocks((doc as AdfNode).content).trim();
}

/** Summary, a blank line, then the body; padded with the key below 5 characters; cut to 32,767. */
export function buildIncidentDescription(summary: string, adfDescription: unknown, issueKey: string): string {
  const head = (summary ?? "").trim();
  const body = adfToText(adfDescription);
  let text = [head, body].filter(Boolean).join(BLOCK_SEPARATOR);
  if (text.trim().length < DESCRIPTION_MIN) text = text.trim() ? `${text.trim()} (${issueKey})` : issueKey;
  return text.slice(0, DESCRIPTION_MAX);
}
```

`jql.ts`:

```ts
import { IMPORT_OVERLAP_MINUTES } from "./jiraIncidents.constants";

const NUMERIC_ID = /^\d{1,18}$/;

export function escapeJqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** `yyyy-MM-dd HH:mm` in `timeZone` (Jira reads JQL dates in the searcher's zone), rounded down. */
export function formatJqlDate(at: Date, timeZone: string): string {
  const format = (zone: string) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(at);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
    return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
  };
  try {
    return format(timeZone);
  } catch {
    return format("UTC");
  }
}

export function importCutoff(importFrom: Date, lastCheckedAt: Date | null): Date {
  if (!lastCheckedAt) return importFrom;
  const overlap = new Date(lastCheckedAt.getTime() - IMPORT_OVERLAP_MINUTES * 60_000);
  return overlap > importFrom ? overlap : importFrom;
}

export function buildImportJql(p: {
  projectId: string;
  issueTypeId: string;
  label: string | null;
  cutoff: string;
}): string {
  if (!NUMERIC_ID.test(p.projectId)) throw new Error("Invalid Jira project id");
  if (!NUMERIC_ID.test(p.issueTypeId)) throw new Error("Invalid Jira issue type id");
  const label = p.label?.trim() ? ` AND labels = "${escapeJqlString(p.label.trim())}"` : "";
  return `project = ${p.projectId} AND issuetype = ${p.issueTypeId}${label} AND created >= "${p.cutoff}" ORDER BY created ASC`;
}

export function buildIdsJql(ids: string[]): string {
  if (ids.length === 0 || ids.some((id) => !NUMERIC_ID.test(id))) throw new Error("Invalid Jira issue ids");
  return `id in (${ids.join(",")})`;
}
```

`siteUrl.ts`:

```ts
export class JiraIncidentsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JiraIncidentsValidationError";
  }
}

const OVERRIDE_VAR = "JIRA_INCIDENTS_ALLOW_LOCAL_SITE_URL";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const SITE_URL_MESSAGE = "Enter your Jira Cloud site URL, for example https://your-company.atlassian.net";

/** The local-URL override counts only in development and test. */
export function localSiteUrlAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[OVERRIDE_VAR] === "true" && (env.NODE_ENV === "development" || env.NODE_ENV === "test");
}

export function warnIfLocalOverrideIgnored(
  env: NodeJS.ProcessEnv = process.env,
  warn: (message: string) => void = console.warn,
): void {
  if (env[OVERRIDE_VAR] === "true" && !localSiteUrlAllowed(env)) {
    warn(`${OVERRIDE_VAR} is ignored outside development and test (NODE_ENV=${env.NODE_ENV ?? "unset"}).`);
  }
}

export function normalizeSiteUrl(raw: unknown, env: NodeJS.ProcessEnv = process.env): string {
  if (typeof raw !== "string" || raw.trim() === "") throw new JiraIncidentsValidationError(SITE_URL_MESSAGE);
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new JiraIncidentsValidationError(SITE_URL_MESSAGE);
  }
  if (url.username || url.password) throw new JiraIncidentsValidationError(SITE_URL_MESSAGE);
  const host = url.hostname.toLowerCase();
  const isLocal = LOCAL_HOSTS.has(host) && localSiteUrlAllowed(env);
  if (isLocal) {
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new JiraIncidentsValidationError(SITE_URL_MESSAGE);
    return `${url.protocol}//${host}${url.port ? `:${url.port}` : ""}`;
  }
  const label = host.endsWith(".atlassian.net") ? host.slice(0, -".atlassian.net".length) : "";
  if (url.protocol !== "https:" || !/^[a-z0-9][a-z0-9-]*$/.test(label) || url.port) {
    throw new JiraIncidentsValidationError(SITE_URL_MESSAGE);
  }
  return `https://${host}`;
}
```

The `warn` default is `console.warn` only as a fallback signature; Task 11 calls it with `logger.warn` at startup.

- [ ] **Step 4: Run tests** — Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Servers/extensions/jira-incidents/
git commit -m "feat(jira-incidents): add ADF, JQL and site URL helpers" -m "ADF to plain text and the incident description rule (summary first, 5 to 32,767 characters); JQL built from numeric ids with a quoted label and a cut-off formatted in the service account's time zone; site URL validation with a development-only localhost override."
```

---

## Task 4: Pure helpers — mappings, decision table, transition choice

**Files:**
- Create: `Servers/extensions/jira-incidents/mapping.ts`
- Create: `Servers/extensions/jira-incidents/decide.ts`
- Test: `Servers/extensions/jira-incidents/__tests__/mapping.test.ts`, `decide.test.ts`

**Interfaces:**
- Consumes: `VW_STATUSES`, `VW_SEVERITIES` (Task 3).
- Produces:

```ts
export interface JiraStatus { id: string; name: string; categoryKey: "new" | "indeterminate" | "done" | string }
export interface JiraPriority { id: string; name: string }
export type StatusMapIn = Record<string, string>;          // Jira status id -> VW status
export type StatusMapOut = Record<string, string | null>;  // VW status -> Jira status id, null = don't change Jira
export type SeverityMap = Record<string, string>;          // Jira priority id -> VW severity
export function defaultStatusMapIn(statuses: JiraStatus[]): StatusMapIn;
export function defaultStatusMapOut(statuses: JiraStatus[]): StatusMapOut;
export function defaultSeverityFor(priorityName: string): string;
export function defaultSeverityMap(priorities: JiraPriority[]): SeverityMap;
export function severityForPriority(map: SeverityMap, priorityId: string | null | undefined): string;
export function unmappedStatuses(statuses: JiraStatus[], map: StatusMapIn): JiraStatus[];
export function validateMaps(maps: { statusMapIn: unknown; statusMapOut: unknown; severityMap: unknown }): string | null;
```

```ts
// decide.ts
export interface DecideInput {
  lastJiraStatusId: string | null; lastVwStatus: string | null;
  jiraStatusId: string; vwStatus: string;
  jiraChangedAt: Date | null; vwChangedAt: Date | null;
  statusMapIn: StatusMapIn; statusMapOut: StatusMapOut;
}
export type Decision =
  | { action: "none" }
  | { action: "to_vw"; vwStatus: string; conflict: boolean }
  | { action: "to_jira"; jiraStatusId: string | null; conflict: boolean }
  | { action: "unmapped"; jiraStatusId: string };
export function decideStatusAction(input: DecideInput): Decision;
export interface JiraTransition { id: string; name: string; toStatusId: string; requiredFields: string[] }
export function pickTransition(transitions: JiraTransition[], targetStatusId: string, names: { from: string; to: string }):
  { ok: true; transitionId: string } | { ok: false; reason: string };
```

Rules, from §5.3, §5.4, §6.2, §6.3: Jira changed = `jiraStatusId !== lastJiraStatusId`; VW changed = `vwStatus !== lastVwStatus`. Neither → none. Jira only → if unmapped, `unmapped`; if mapped value equals `vwStatus`, none; else `to_vw`. VW only → `to_jira` with `statusMapOut[vwStatus] ?? null` (null = "Don't change Jira"); if the mapped Jira id equals `jiraStatusId`, none. Both → if the sides already agree (`statusMapIn[jiraStatusId] === vwStatus`, e.g. an admin made the refused move by hand in Jira), none — not a conflict; otherwise the later change wins; a missing time counts as oldest; a tie goes to Jira. The winner's action carries `conflict: true` even when its value then equals the other side (still a conflict to report).

- [ ] **Step 1: Write the failing tests**

```ts
// Servers/extensions/jira-incidents/__tests__/mapping.test.ts
import {
  defaultSeverityFor, defaultSeverityMap, defaultStatusMapIn, defaultStatusMapOut,
  severityForPriority, unmappedStatuses, validateMaps,
} from "../mapping";

const statuses = [
  { id: "1", name: "To Do", categoryKey: "new" },
  { id: "2", name: "Backlog", categoryKey: "new" },
  { id: "3", name: "In Progress", categoryKey: "indeterminate" },
  { id: "4", name: "Done", categoryKey: "done" },
  { id: "5", name: "Weird", categoryKey: "undefined" },
];

describe("default mappings", () => {
  it("maps Jira statuses in by category", () => {
    expect(defaultStatusMapIn(statuses)).toEqual({
      "1": "Open", "2": "Open", "3": "Investigating", "4": "Closed", "5": "Open",
    });
  });
  it("maps VerifyWise statuses out to the first status of each category", () => {
    expect(defaultStatusMapOut(statuses)).toEqual({
      Open: "1", Investigating: "3", Closed: "4",
      Mitigated: null, Suspended: null, "Emergency action": null,
    });
  });
  it("leaves an out mapping empty when the workflow lacks the category", () => {
    expect(defaultStatusMapOut([{ id: "1", name: "To Do", categoryKey: "new" }]).Closed).toBeNull();
  });
  it("maps priorities by name", () => {
    expect(["Highest", "High", "Medium", "Low", "Lowest", "P1"].map(defaultSeverityFor)).toEqual([
      "Very serious", "Very serious", "Serious", "Minor", "Minor", "Serious",
    ]);
    expect(defaultSeverityMap([{ id: "9", name: "High" }])).toEqual({ "9": "Very serious" });
  });
  it("gives Serious for no priority or an unmapped one", () => {
    expect(severityForPriority({ "9": "Minor" }, null)).toBe("Serious");
    expect(severityForPriority({ "9": "Minor" }, "7")).toBe("Serious");
    expect(severityForPriority({ "9": "Minor" }, "9")).toBe("Minor");
  });
  it("lists statuses with no in mapping", () => {
    expect(unmappedStatuses(statuses, { "1": "Open" }).map((s) => s.id)).toEqual(["2", "3", "4", "5"]);
  });
  it("validates map shapes and values", () => {
    expect(validateMaps({ statusMapIn: { "1": "Open" }, statusMapOut: { Open: "1", Closed: null }, severityMap: { "9": "Minor" } })).toBeNull();
    expect(validateMaps({ statusMapIn: { "1": "Done" }, statusMapOut: {}, severityMap: {} })).toMatch(/status/i);
    expect(validateMaps({ statusMapIn: {}, statusMapOut: { Nope: "1" }, severityMap: {} })).toMatch(/status/i);
    expect(validateMaps({ statusMapIn: {}, statusMapOut: {}, severityMap: { "9": "Huge" } })).toMatch(/severity/i);
    expect(validateMaps({ statusMapIn: [], statusMapOut: {}, severityMap: {} })).not.toBeNull();
  });
});
```

```ts
// Servers/extensions/jira-incidents/__tests__/decide.test.ts
import { decideStatusAction, pickTransition } from "../decide";

const maps = {
  statusMapIn: { "1": "Open", "3": "Investigating", "4": "Closed" },
  statusMapOut: { Open: "1", Investigating: "3", Closed: "4", Mitigated: null, Suspended: null, "Emergency action": null },
};
const base = { lastJiraStatusId: "1", lastVwStatus: "Open", jiraStatusId: "1", vwStatus: "Open", jiraChangedAt: null, vwChangedAt: null, ...maps };
const t = (iso: string) => new Date(iso);

describe("decideStatusAction", () => {
  it("does nothing when neither side changed", () => {
    expect(decideStatusAction(base)).toEqual({ action: "none" });
  });
  it("applies a Jira change to VerifyWise", () => {
    expect(decideStatusAction({ ...base, jiraStatusId: "3" })).toEqual({ action: "to_vw", vwStatus: "Investigating", conflict: false });
  });
  it("reports an unmapped Jira status", () => {
    expect(decideStatusAction({ ...base, jiraStatusId: "77" })).toEqual({ action: "unmapped", jiraStatusId: "77" });
  });
  it("does nothing when the Jira change maps to the status VerifyWise already has", () => {
    expect(decideStatusAction({ ...base, lastJiraStatusId: "3", jiraStatusId: "1" })).toEqual({ action: "none" });
  });
  it("applies a VerifyWise change to Jira", () => {
    expect(decideStatusAction({ ...base, vwStatus: "Closed" })).toEqual({ action: "to_jira", jiraStatusId: "4", conflict: false });
  });
  it("records Don't change Jira as a to_jira with no target", () => {
    expect(decideStatusAction({ ...base, vwStatus: "Mitigated" })).toEqual({ action: "to_jira", jiraStatusId: null, conflict: false });
  });
  it("lets the later change win when both changed", () => {
    const both = { ...base, jiraStatusId: "3", vwStatus: "Closed" };
    expect(decideStatusAction({ ...both, jiraChangedAt: t("2026-10-14T10:00Z"), vwChangedAt: t("2026-10-14T11:00Z") }))
      .toEqual({ action: "to_jira", jiraStatusId: "4", conflict: true });
    expect(decideStatusAction({ ...both, jiraChangedAt: t("2026-10-14T12:00Z"), vwChangedAt: t("2026-10-14T11:00Z") }))
      .toEqual({ action: "to_vw", vwStatus: "Investigating", conflict: true });
  });
  it("treats a missing time as oldest and gives a tie to Jira", () => {
    const both = { ...base, jiraStatusId: "3", vwStatus: "Closed" };
    expect(decideStatusAction({ ...both, jiraChangedAt: null, vwChangedAt: t("2026-10-14T11:00Z") }).action).toBe("to_jira");
    expect(decideStatusAction({ ...both, jiraChangedAt: t("2026-10-14T11:00Z"), vwChangedAt: t("2026-10-14T11:00Z") }).action).toBe("to_vw");
  });
  it("treats both sides changing to matching statuses as agreement, not a conflict", () => {
    expect(decideStatusAction({ ...base, jiraStatusId: "4", vwStatus: "Closed", jiraChangedAt: t("2026-10-14T12:00Z"), vwChangedAt: t("2026-10-14T11:00Z") }))
      .toEqual({ action: "none" });
  });
  it("reports unmapped when Jira wins a conflict with an unmapped status", () => {
    expect(decideStatusAction({ ...base, jiraStatusId: "77", vwStatus: "Closed", jiraChangedAt: t("2026-10-14T12:00Z"), vwChangedAt: t("2026-10-14T11:00Z") }))
      .toEqual({ action: "unmapped", jiraStatusId: "77" });
  });
  it("treats a link with no snapshot as unchanged on both sides", () => {
    expect(decideStatusAction({ ...base, lastJiraStatusId: null, lastVwStatus: null, jiraStatusId: "3", vwStatus: "Closed" }))
      .toEqual({ action: "none" });
  });
});

describe("pickTransition", () => {
  const names = { from: "Done", to: "In Progress" };
  it("picks the transition whose target is the mapped status", () => {
    expect(pickTransition([{ id: "11", name: "Start", toStatusId: "3", requiredFields: [] }], "3", names))
      .toEqual({ ok: true, transitionId: "11" });
  });
  it("explains when no transition reaches the status", () => {
    expect(pickTransition([], "3", names)).toEqual({ ok: false, reason: "No move from 'Done' to 'In Progress' in this workflow" });
  });
  it("explains when the transition needs fields", () => {
    expect(pickTransition([{ id: "11", name: "Resolve", toStatusId: "3", requiredFields: ["Resolution"] }], "3", names))
      .toEqual({ ok: false, reason: "Moving to 'In Progress' needs a value for Resolution. Change the status in Jira." });
  });
});
```

The "no snapshot" case covers a `deleted_in_jira` link being restored (the caller clears the snapshot first; see Task 9).

- [ ] **Step 2: Run to verify failure**

Run: `cd Servers && npx jest extensions/jira-incidents/__tests__/mapping.test.ts extensions/jira-incidents/__tests__/decide.test.ts` — FAIL, modules not found.

- [ ] **Step 3: Implement**

```ts
// Servers/extensions/jira-incidents/mapping.ts
import { VW_SEVERITIES, VW_STATUSES } from "./jiraIncidents.constants";

export interface JiraStatus { id: string; name: string; categoryKey: string }
export interface JiraPriority { id: string; name: string }
export type StatusMapIn = Record<string, string>;
export type StatusMapOut = Record<string, string | null>;
export type SeverityMap = Record<string, string>;

const CATEGORY_TO_VW: Record<string, string> = { new: "Open", indeterminate: "Investigating", done: "Closed" };
const VW_TO_CATEGORY: Record<string, string> = { Open: "new", Investigating: "indeterminate", Closed: "done" };
const SEVERITY_BY_PRIORITY: Record<string, string> = {
  highest: "Very serious", high: "Very serious", medium: "Serious", low: "Minor", lowest: "Minor",
};
const DEFAULT_SEVERITY = "Serious";

export function defaultStatusMapIn(statuses: JiraStatus[]): StatusMapIn {
  return Object.fromEntries(statuses.map((s) => [s.id, CATEGORY_TO_VW[s.categoryKey] ?? "Open"]));
}

export function defaultStatusMapOut(statuses: JiraStatus[]): StatusMapOut {
  return Object.fromEntries(
    VW_STATUSES.map((vw) => {
      const category = VW_TO_CATEGORY[vw];
      const first = category ? statuses.find((s) => s.categoryKey === category) : undefined;
      return [vw, first ? first.id : null];
    }),
  );
}

export function defaultSeverityFor(priorityName: string): string {
  return SEVERITY_BY_PRIORITY[priorityName.trim().toLowerCase()] ?? DEFAULT_SEVERITY;
}

export function defaultSeverityMap(priorities: JiraPriority[]): SeverityMap {
  return Object.fromEntries(priorities.map((p) => [p.id, defaultSeverityFor(p.name)]));
}

export function severityForPriority(map: SeverityMap, priorityId: string | null | undefined): string {
  return (priorityId && map[priorityId]) || DEFAULT_SEVERITY;
}

export function unmappedStatuses(statuses: JiraStatus[], map: StatusMapIn): JiraStatus[] {
  return statuses.filter((s) => !map[s.id]);
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Null when valid; otherwise the first problem, in plain language. */
export function validateMaps(maps: { statusMapIn: unknown; statusMapOut: unknown; severityMap: unknown }): string | null {
  const { statusMapIn, statusMapOut, severityMap } = maps;
  if (!isPlainObject(statusMapIn) || !isPlainObject(statusMapOut) || !isPlainObject(severityMap)) {
    return "Mappings must be objects";
  }
  for (const value of Object.values(statusMapIn)) {
    if (typeof value !== "string" || !VW_STATUSES.includes(value)) return `Unknown VerifyWise status '${String(value)}'`;
  }
  for (const [vw, jiraId] of Object.entries(statusMapOut)) {
    if (!VW_STATUSES.includes(vw)) return `Unknown VerifyWise status '${vw}'`;
    if (jiraId !== null && (typeof jiraId !== "string" || !/^\d{1,18}$/.test(jiraId))) return `Invalid Jira status for '${vw}'`;
  }
  for (const value of Object.values(severityMap)) {
    if (typeof value !== "string" || !VW_SEVERITIES.includes(value)) return `Unknown severity '${String(value)}'`;
  }
  return null;
}
```

```ts
// Servers/extensions/jira-incidents/decide.ts
import type { StatusMapIn, StatusMapOut } from "./mapping";

export interface DecideInput {
  lastJiraStatusId: string | null;
  lastVwStatus: string | null;
  jiraStatusId: string;
  vwStatus: string;
  jiraChangedAt: Date | null;
  vwChangedAt: Date | null;
  statusMapIn: StatusMapIn;
  statusMapOut: StatusMapOut;
}

export type Decision =
  | { action: "none" }
  | { action: "to_vw"; vwStatus: string; conflict: boolean }
  | { action: "to_jira"; jiraStatusId: string | null; conflict: boolean }
  | { action: "unmapped"; jiraStatusId: string };

function toVw(input: DecideInput, conflict: boolean): Decision {
  const mapped = input.statusMapIn[input.jiraStatusId];
  if (!mapped) return { action: "unmapped", jiraStatusId: input.jiraStatusId };
  if (!conflict && mapped === input.vwStatus) return { action: "none" };
  return { action: "to_vw", vwStatus: mapped, conflict };
}

function toJira(input: DecideInput, conflict: boolean): Decision {
  const target = input.statusMapOut[input.vwStatus] ?? null;
  if (!conflict && target === input.jiraStatusId) return { action: "none" };
  return { action: "to_jira", jiraStatusId: target, conflict };
}

/** The §6.2 table. A link with no snapshot (null last_*) counts as unchanged. */
export function decideStatusAction(input: DecideInput): Decision {
  if (input.lastJiraStatusId === null || input.lastVwStatus === null) return { action: "none" };
  const jiraChanged = input.jiraStatusId !== input.lastJiraStatusId;
  const vwChanged = input.vwStatus !== input.lastVwStatus;
  if (!jiraChanged && !vwChanged) return { action: "none" };
  if (jiraChanged && !vwChanged) return toVw(input, false);
  if (!jiraChanged && vwChanged) return toJira(input, false);
  // Both changed to statuses that already match (for example the admin made
  // a refused move by hand in Jira): nothing to apply, nothing to report.
  if (input.statusMapIn[input.jiraStatusId] === input.vwStatus) return { action: "none" };
  const jiraTime = input.jiraChangedAt?.getTime() ?? 0;
  const vwTime = input.vwChangedAt?.getTime() ?? 0;
  return vwTime > jiraTime ? toJira(input, true) : toVw(input, true);
}

export interface JiraTransition {
  id: string;
  name: string;
  toStatusId: string;
  requiredFields: string[];
}

export function pickTransition(
  transitions: JiraTransition[],
  targetStatusId: string,
  names: { from: string; to: string },
): { ok: true; transitionId: string } | { ok: false; reason: string } {
  const match = transitions.find((tr) => tr.toStatusId === targetStatusId);
  if (!match) return { ok: false, reason: `No move from '${names.from}' to '${names.to}' in this workflow` };
  if (match.requiredFields.length > 0) {
    return {
      ok: false,
      reason: `Moving to '${names.to}' needs a value for ${match.requiredFields.join(", ")}. Change the status in Jira.`,
    };
  }
  return { ok: true, transitionId: match.id };
}
```

Note on the conflict tie-break: `vwTime > jiraTime ? toJira : toVw` gives ties and both-missing to Jira, matching the test.

- [ ] **Step 4: Run tests** — PASS.

- [ ] **Step 5: Commit**

```bash
git add Servers/extensions/jira-incidents/
git commit -m "feat(jira-incidents): add default mappings and the status decision table" -m "Status and severity defaults from Jira categories and priority names; the both-ways status decision (later change wins, missing time is oldest, tie to Jira; Don't change Jira as a null target); transition choice that names a missing move or a required field."
```

---

## Task 5: Simulated Jira Cloud server

**Files:**
- Create: `Servers/tests/mocks/jiraCloud/store.ts`, `server.ts`, `start.ts`, `README.md`
- Test: `Servers/tests/mocks/jiraCloud/__tests__/server.test.ts`

**Interfaces:**
- Produces:

```ts
export interface MockIssue {
  id: string; key: string; projectId: string; issueTypeId: string;
  summary: string; description: unknown; priorityId: string | null; labels: string[];
  statusId: string; created: string;              // ISO with offset, e.g. "2026-10-14T10:00:00.000+0000"
  statusChangedAt: string;                         // ISO; also emitted as the latest changelog entry
  remoteLinks: Array<{ globalId: string; url: string; title: string }>;
  deleted: boolean;
}
export interface MockState {
  account: { accountId: string; emailAddress: string; timeZone: string };
  token: string; email: string;
  permissions: Record<string, boolean>;            // BROWSE_PROJECTS, TRANSITION_ISSUES, LINK_ISSUES
  projectReadable: boolean;
  project: { id: string; key: string; name: string };
  issueTypes: Array<{ id: string; name: string }>;
  statuses: Array<{ id: string; name: string; categoryKey: string }>;
  transitions: Array<{ id: string; name: string; toStatusId: string; requiredFields: string[] }>;
  priorities: Array<{ id: string; name: string }>;
  labels: string[];
  issues: MockIssue[];
  failNext: Array<{ status: 401 | 403 | 429 | 500 | 503; retryAfter?: number; path?: string; afterCalls?: number }>;
  blockedTransitions: string[];
  calls: Array<{ method: string; path: string; body?: unknown }>;
}
export function defaultState(): MockState;
export interface JiraCloudMock {
  url: string;                 // http://127.0.0.1:<port>
  state: MockState;            // live, mutable from tests
  addIssue(partial: Partial<MockIssue> & { summary: string }): MockIssue;
  setStatus(issueId: string, statusId: string, at?: Date): void;
  reset(): void;
  close(): Promise<void>;
}
export function startJiraCloudMock(options?: { port?: number }): Promise<JiraCloudMock>;
```

Endpoints (Basic auth must equal `state.email:state.token`, else 401; `failNext` entries are consumed in order, optionally only for a matching path prefix; an entry with `afterCalls: n` lets the first `n` matching calls through, counting down on each, and fires on the next one):

| Method, path | Behaviour |
|---|---|
| `GET /rest/api/3/myself` | `state.account` |
| `GET /rest/api/3/mypermissions?projectId=&permissions=A,B` | `{ permissions: { A: { key, havePermission } } }` |
| `GET /rest/api/3/project/search?startAt=&maxResults=` | `{ values: [project], isLast: true, startAt, maxResults, total: 1 }` |
| `GET /rest/api/3/project/{id}` | project, or 404 when `!projectReadable` |
| `GET /rest/api/3/issuetype/project?projectId=` | `issueTypes` |
| `GET /rest/api/3/project/{id}/statuses` | `[{ id: issueTypeId, name, statuses: [{ id, name, statusCategory: { key } }] }]` per issue type |
| `GET /rest/api/3/priority/search?startAt=&maxResults=` | `{ values: priorities, isLast: true }` |
| `GET /rest/api/3/label?startAt=&maxResults=` | `{ values: labels, isLast: true }` |
| `POST /rest/api/3/search/jql` | parses the JQL forms this extension builds (`project = N AND issuetype = N [AND labels = "x"] AND created >= "yyyy-MM-dd HH:mm" ORDER BY created ASC` read in `account.timeZone`; or `id in (...)`); returns `{ issues: [{ id, key, fields }], nextPageToken? }` paging by `maxResults` with an opaque token; excludes `deleted` issues and everything when `!projectReadable`; `fields` per requested list: `summary`, `description`, `priority: {id,name} \| null`, `status: {id,name}`, `created` |
| `GET /rest/api/3/issue/{id}` | issue or 404 when deleted |
| `GET /rest/api/3/issue/{id}/changelog?startAt=&maxResults=` | `{ values: [{ id, created: statusChangedAt, items: [{ field: "status", fieldId: "status", to: statusId }] }], startAt, maxResults, total: 1, isLast: true }` |
| `GET /rest/api/3/issue/{id}/transitions?expand=transitions.fields` | `{ transitions: [{ id, name, to: { id, name }, fields: { <name>: { required: true, hasDefaultValue: false, name } } }] }` — every configured transition is available from every status unless its `id` is listed in `state.blockedTransitions` (add `blockedTransitions: string[]` to `MockState`) |
| `POST /rest/api/3/issue/{id}/transitions` | body `{ transition: { id } }`; sets `statusId` and `statusChangedAt = now`; 400 if the transition has required fields; 204 |
| `POST /rest/api/3/issue/{id}/remotelink` | upsert by `globalId`; 201 `{ id, self }` |
| `POST /__mock/issues` | control: `addIssue(body)`; returns the issue |
| `POST /__mock/issues/{id}/status` | control: `{ statusId }` → `setStatus` |
| `POST /__mock/reset` | control: `reset()` |
| `POST /__mock/fail-next` | control: push `{ status, retryAfter?, path? }` |

A 429/503 failure sends `Retry-After: <retryAfter>` when set. Created-date filtering converts `created >= "..."` from `account.timeZone` to an instant with `Intl` (same arithmetic as `formatJqlDate`, inverted: compute the zone offset at that instant and subtract).

`defaultState()` returns: account `{ accountId: "svc-1", emailAddress: "svc@acme.test", timeZone: "UTC" }`, email `svc@acme.test`, token `token-1`, all three permissions true, `projectReadable: true`, project `{ id: "10000", key: "SEC", name: "Security" }`, issue types `[{ id: "10001", name: "Incident" }]`, statuses `To Do(1,new)`, `In Progress(3,indeterminate)`, `Done(4,done)`, transitions `{ id: "11", name: "Start", toStatusId: "3" }`, `{ id: "12", name: "Reopen", toStatusId: "1" }`, `{ id: "13", name: "Close", toStatusId: "4" }` (no required fields), `blockedTransitions: []`, priorities `High(2)`, `Medium(3)`, `Low(4)`, labels `["ai", "ai-risk"]`, no issues.

- [ ] **Step 1: Write the failing self-test**

```ts
// Servers/tests/mocks/jiraCloud/__tests__/server.test.ts
import { startJiraCloudMock, JiraCloudMock } from "../server";

const auth = "Basic " + Buffer.from("svc@acme.test:token-1").toString("base64");
const get = (m: JiraCloudMock, path: string, a = auth) =>
  fetch(`${m.url}${path}`, { headers: { Authorization: a, Accept: "application/json" } });
const post = (m: JiraCloudMock, path: string, body: unknown) =>
  fetch(`${m.url}${path}`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });

describe("simulated Jira Cloud", () => {
  let mock: JiraCloudMock;
  beforeEach(async () => { mock = await startJiraCloudMock(); });
  afterEach(async () => { await mock.close(); });

  it("rejects bad credentials", async () => {
    expect((await get(mock, "/rest/api/3/myself", "Basic eDp5")).status).toBe(401);
    expect((await get(mock, "/rest/api/3/myself")).status).toBe(200);
  });

  it("searches by the import JQL in the account's time zone, with paging", async () => {
    mock.state.account.timeZone = "Pacific/Kiritimati";
    for (let i = 0; i < 3; i++) mock.addIssue({ summary: `I${i}`, created: "2026-10-14T10:00:00.000+0000" });
    mock.addIssue({ summary: "old", created: "2026-10-13T09:00:00.000+0000" });
    // 2026-10-14 10:00 UTC is 2026-10-15 00:00 in Kiritimati.
    const jql = 'project = 10000 AND issuetype = 10001 AND created >= "2026-10-15 00:00" ORDER BY created ASC';
    const page1 = await (await post(mock, "/rest/api/3/search/jql", { jql, maxResults: 2, fields: ["summary"] })).json();
    expect(page1.issues.map((i: any) => i.fields.summary)).toEqual(["I0", "I1"]);
    const page2 = await (await post(mock, "/rest/api/3/search/jql", { jql, maxResults: 2, fields: ["summary"], nextPageToken: page1.nextPageToken })).json();
    expect(page2.issues.map((i: any) => i.fields.summary)).toEqual(["I2"]);
    expect(page2.nextPageToken).toBeUndefined();
  });

  it("transitions an issue and refuses one that needs a field", async () => {
    const issue = mock.addIssue({ summary: "x" });
    mock.state.transitions.push({ id: "99", name: "Resolve", toStatusId: "4", requiredFields: ["Resolution"] });
    expect((await post(mock, `/rest/api/3/issue/${issue.id}/transitions`, { transition: { id: "11" } })).status).toBe(204);
    expect(mock.state.issues[0].statusId).toBe("3");
    expect((await post(mock, `/rest/api/3/issue/${issue.id}/transitions`, { transition: { id: "99" } })).status).toBe(400);
  });

  it("injects failures with Retry-After", async () => {
    await post(mock, "/__mock/fail-next", { status: 429, retryAfter: 30 });
    const res = await get(mock, "/rest/api/3/myself");
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
    expect((await get(mock, "/rest/api/3/myself")).status).toBe(200);
  });

  it("fires a failure after a number of matching calls", async () => {
    await post(mock, "/__mock/fail-next", { status: 500, path: "/rest/api/3/myself", afterCalls: 1 });
    expect((await get(mock, "/rest/api/3/myself")).status).toBe(200);
    expect((await get(mock, "/rest/api/3/myself")).status).toBe(500);
    expect((await get(mock, "/rest/api/3/myself")).status).toBe(200);
  });

  it("hides everything when the project is unreadable and 404s a deleted issue", async () => {
    const issue = mock.addIssue({ summary: "x" });
    issue.deleted = true;
    expect((await get(mock, `/rest/api/3/issue/${issue.id}`)).status).toBe(404);
    mock.state.projectReadable = false;
    expect((await get(mock, "/rest/api/3/project/10000")).status).toBe(404);
  });

  it("upserts remote links by globalId", async () => {
    const issue = mock.addIssue({ summary: "x" });
    const body = { globalId: "verifywise:incident:1:5", object: { url: "u", title: "VerifyWise INC-5" } };
    await post(mock, `/rest/api/3/issue/${issue.id}/remotelink`, body);
    await post(mock, `/rest/api/3/issue/${issue.id}/remotelink`, body);
    expect(mock.state.issues[0].remoteLinks).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd Servers && npx jest tests/mocks/jiraCloud` — FAIL, module not found.

- [ ] **Step 3: Implement**

Build `server.ts` on Node's `http.createServer` (no new dependency). Structure:

```ts
// Servers/tests/mocks/jiraCloud/server.ts
/**
 * Simulated Jira Cloud REST v3, for the jira-incidents integration tests and
 * local manual runs (start.ts). Shapes follow Atlassian's published v3
 * reference; it proves our behaviour against our reading of that API, not
 * against Jira itself. Not loaded by the application.
 */
import http from "http";
import { AddressInfo } from "net";
import { defaultState, MockIssue, MockState, parseJql, zonedMinuteToInstant } from "./store";

export interface JiraCloudMock {
  url: string;
  state: MockState;
  addIssue(partial: Partial<MockIssue> & { summary: string }): MockIssue;
  setStatus(issueId: string, statusId: string, at?: Date): void;
  reset(): void;
  close(): Promise<void>;
}

type Handler = (req: http.IncomingMessage, url: URL, body: any) => { status: number; body?: unknown; headers?: Record<string, string> };

export async function startJiraCloudMock(options: { port?: number } = {}): Promise<JiraCloudMock> {
  const mock = {} as JiraCloudMock;
  mock.state = defaultState();
  let nextId = 20000;
  mock.addIssue = (partial) => {
    const id = String(nextId++);
    const now = new Date().toISOString().replace("Z", "+0000");
    const issue: MockIssue = {
      id, key: `${mock.state.project.key}-${Number(id) - 19999}`,
      projectId: mock.state.project.id, issueTypeId: mock.state.issueTypes[0].id,
      description: null, priorityId: "3", labels: [], statusId: mock.state.statuses[0].id,
      created: now, statusChangedAt: now, remoteLinks: [], deleted: false, ...partial,
    };
    mock.state.issues.push(issue);
    return issue;
  };
  mock.setStatus = (issueId, statusId, at = new Date()) => {
    const issue = mock.state.issues.find((i) => i.id === issueId);
    if (!issue) throw new Error(`No mock issue ${issueId}`);
    issue.statusId = statusId;
    issue.statusChangedAt = at.toISOString().replace("Z", "+0000");
  };
  mock.reset = () => { mock.state = defaultState(); };

  const routes: Array<[string, RegExp, Handler]> = [
    // one entry per row of the endpoint table above; handlers read mock.state
  ];

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://mock");
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    const body = raw ? JSON.parse(raw) : undefined;
    mock.state.calls.push({ method: req.method ?? "GET", path: url.pathname, body });
    const send = (status: number, payload?: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "Content-Type": "application/json", ...headers });
      res.end(payload === undefined ? "" : JSON.stringify(payload));
    };
    if (!url.pathname.startsWith("/__mock/")) {
      const expected = "Basic " + Buffer.from(`${mock.state.email}:${mock.state.token}`).toString("base64");
      if (req.headers.authorization !== expected) return send(401, { errorMessages: ["Unauthorized"] });
      const failIndex = mock.state.failNext.findIndex((f) => !f.path || url.pathname.startsWith(f.path));
      const pending = failIndex >= 0 ? mock.state.failNext[failIndex] : null;
      if (pending?.afterCalls) {
        pending.afterCalls -= 1;
      } else if (failIndex >= 0) {
        const [fail] = mock.state.failNext.splice(failIndex, 1);
        return send(fail.status, { errorMessages: [`Injected ${fail.status}`] },
          fail.retryAfter !== undefined ? { "Retry-After": String(fail.retryAfter) } : {});
      }
    }
    for (const [method, pattern, handler] of routes) {
      if (req.method === method && pattern.test(url.pathname)) {
        const out = handler(req, url, body);
        return send(out.status, out.body, out.headers);
      }
    }
    send(404, { errorMessages: ["Not found"] });
  });
  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  mock.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  mock.close = () => new Promise((resolve) => server.close(() => resolve()));
  return mock;
}
```

Fill `routes` with one handler per table row. Put the pure parts in `store.ts`: `defaultState()`, `parseJql(jql)` returning `{ kind: "import"; projectId; issueTypeId; label; createdFrom: string } | { kind: "ids"; ids: string[] }` (throw on anything else so an unexpected query fails the test loudly), and `zonedMinuteToInstant("yyyy-MM-dd HH:mm", timeZone): Date`:

```ts
export function zonedMinuteToInstant(local: string, timeZone: string): Date {
  const [d, t] = local.split(" ");
  const asUtc = new Date(`${d}T${t}:00Z`);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(asUtc);
  const g = (k: string) => parts.find((p) => p.type === k)!.value;
  const zoned = new Date(`${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}:00Z`);
  return new Date(asUtc.getTime() - (zoned.getTime() - asUtc.getTime()));
}
```

Paging token: base64 of the next start index. Search responses include only issues of `projectReadable` projects and not `deleted`.

`start.ts`:

```ts
// Run: cd Servers && npx ts-node --transpile-only tests/mocks/jiraCloud/start.ts --port 4010
import { startJiraCloudMock } from "./server";

const portArg = process.argv.indexOf("--port");
const port = portArg > 0 ? Number(process.argv[portArg + 1]) : 4010;
startJiraCloudMock({ port }).then((mock) => {
  process.stdout.write(
    `Simulated Jira Cloud on ${mock.url}\n` +
      `Credentials: ${mock.state.email} / ${mock.state.token}\n` +
      `Create an issue: curl -X POST ${mock.url}/__mock/issues -H 'Content-Type: application/json' -d '{"summary":"Model leaked data"}'\n`,
  );
});
```

`README.md` (short): what it is, the start command, the control endpoints, and that a local VerifyWise needs `NODE_ENV=development` and `JIRA_INCIDENTS_ALLOW_LOCAL_SITE_URL=true` to accept `http://localhost:4010`.

- [ ] **Step 4: Run tests** — PASS. Also `cd Servers && npm run build` (if `tsconfig` includes `tests/`, the mock must compile; if it excludes them, nothing changes).

- [ ] **Step 5: Commit**

```bash
git add Servers/tests/mocks/jiraCloud/
git commit -m "test(jira-incidents): add a simulated Jira Cloud server" -m "In-memory projects, workflow, priorities and issues behind the REST v3 endpoints the extension calls, with Basic auth, JQL search with token paging in the account's time zone, transitions that can require fields, remote link upsert, and a control API for issues, status changes and injected 401/403/429/500/503 failures. start.ts runs it for manual testing."
```

---

## Task 6: Jira Cloud client

**Files:**
- Create: `Servers/extensions/jira-incidents/jiraIncidents.errors.ts`
- Create: `Servers/extensions/jira-incidents/jiraIncidents.client.ts`
- Test: `Servers/extensions/jira-incidents/__tests__/client.test.ts`

**Interfaces:**
- Consumes: constants (Task 3), `JiraStatus`, `JiraPriority` (Task 4), `JiraTransition` (Task 4), `startJiraCloudMock` (Task 5, tests only).
- Produces:

```ts
export class JiraHttpError extends Error { constructor(public status: number, message: string) }
export class JiraAuthError extends JiraHttpError {}          // 401 / 403
export class JiraNotFoundError extends JiraHttpError {}      // 404
export class JiraRateLimitError extends JiraHttpError { constructor(public retryAfterSeconds: number | null) }
export class JiraUnreachableError extends Error {}           // network / timeout / unreadable body

export interface JiraIssueSummary {
  id: string; key: string; summary: string; description: unknown;
  priorityId: string | null; statusId: string; statusName: string; created: Date;
}
export interface SearchPage { issues: JiraIssueSummary[]; nextPageToken: string | null }

export class JiraIncidentsClient {
  constructor(opts: { siteUrl: string; email: string; apiToken: string; deadline?: AbortSignal; sleep?: (ms: number) => Promise<void> });
  myself(): Promise<{ accountId: string; timeZone: string }>;
  missingPermissions(projectId: string): Promise<string[]>;
  getProject(projectId: string): Promise<{ id: string; key: string; name: string }>;  // JiraNotFoundError / JiraAuthError
  listProjects(): Promise<Array<{ id: string; key: string; name: string }>>;
  listIssueTypes(projectId: string): Promise<Array<{ id: string; name: string }>>;
  listStatuses(projectId: string, issueTypeId: string): Promise<JiraStatus[]>;
  listPriorities(): Promise<JiraPriority[]>;
  listLabels(query: string): Promise<string[]>;
  searchPage(jql: string, fields: string[], nextPageToken: string | null): Promise<SearchPage>;
  getIssue(issueId: string): Promise<JiraIssueSummary>;   // JiraNotFoundError on 404
  latestStatusChangeAt(issueId: string): Promise<Date | null>;
  listTransitions(issueId: string): Promise<JiraTransition[]>;
  transition(issueId: string, transitionId: string): Promise<void>;
  upsertRemoteLink(issueId: string, link: { globalId: string; url: string; title: string }): Promise<void>;
  browseUrl(issueKey: string): string;
}
```

Behaviour: each request uses `safeFetch` with `requestSignal(REQUEST_TIMEOUT_SECONDS, deadline)`; Basic auth; JSON. Status mapping: 401 → `JiraAuthError(401, TOKEN_REJECTED_MESSAGE)`; 403 → `JiraAuthError(403, "Jira refused access for the service account. Check its project permissions.")`; 404 → `JiraNotFoundError`; 429, or 503 with `Retry-After` → if `Retry-After` ≤ `MAX_RETRY_AFTER_SECONDS` and this request has not retried yet, `sleep` that long and retry once, else throw `JiraRateLimitError`; other non-2xx → `JiraHttpError(status, "Jira returned <status>: <first 300 chars>")`; fetch failures → `JiraUnreachableError("Could not reach Jira: " + describeFetchError(...))`. A 204 returns `undefined`. `listProjects` and `listPriorities` page with `startAt` up to 20 pages of 50. `listLabels(query)` reads up to 1000 labels and returns those containing `query` (case-insensitive), first 50. `latestStatusChangeAt` reads the changelog's last page (first call `maxResults=100`; if `total > 100`, a second call at `startAt = total - 100`) and returns the newest `created` among entries with an item `fieldId === "status"` (or `field === "status"`), else null. `listTransitions` uses `?expand=transitions.fields` and reports `requiredFields` = names of fields with `required && !hasDefaultValue`.

- [ ] **Step 1: Write the failing tests**

```ts
// Servers/extensions/jira-incidents/__tests__/client.test.ts
import { startJiraCloudMock, JiraCloudMock } from "../../../tests/mocks/jiraCloud/server";
import { JiraIncidentsClient } from "../jiraIncidents.client";
import { JiraAuthError, JiraNotFoundError, JiraRateLimitError } from "../jiraIncidents.errors";

describe("JiraIncidentsClient", () => {
  let mock: JiraCloudMock;
  let sleeps: number[];
  const client = (token = "token-1") =>
    new JiraIncidentsClient({
      siteUrl: mock.url, email: "svc@acme.test", apiToken: token,
      sleep: async (ms) => { sleeps.push(ms); },
    });
  beforeEach(async () => { mock = await startJiraCloudMock(); sleeps = []; });
  afterEach(() => mock.close());

  it("reads the service account", async () => {
    expect(await client().myself()).toEqual({ accountId: "svc-1", timeZone: "UTC" });
  });

  it("maps a 401 to the token message", async () => {
    await expect(client("wrong").myself()).rejects.toThrow(
      new JiraAuthError(401, "Jira rejected the API token. It may have expired or been revoked."),
    );
  });

  it("names missing permissions", async () => {
    mock.state.permissions.TRANSITION_ISSUES = false;
    expect(await client().missingPermissions("10000")).toEqual(["TRANSITION_ISSUES"]);
  });

  it("retries once after a short Retry-After, then gives up on a long one", async () => {
    mock.state.failNext.push({ status: 429, retryAfter: 2 });
    await expect(client().myself()).resolves.toBeTruthy();
    expect(sleeps).toEqual([2000]);
    mock.state.failNext.push({ status: 429, retryAfter: 60 });
    await expect(client().myself()).rejects.toBeInstanceOf(JiraRateLimitError);
    mock.state.failNext.push({ status: 503, retryAfter: 1 }, { status: 503, retryAfter: 1 });
    await expect(client().myself()).rejects.toBeInstanceOf(JiraRateLimitError);
  });

  it("pages a search and parses issues", async () => {
    mock.addIssue({ summary: "a", priorityId: "2", created: "2026-10-14T10:00:00.000+0000" });
    mock.addIssue({ summary: "b", priorityId: null, created: "2026-10-14T10:01:00.000+0000" });
    const jql = 'project = 10000 AND issuetype = 10001 AND created >= "2026-10-14 00:00" ORDER BY created ASC';
    const c = client();
    const first = await c.searchPage(jql, ["summary", "description", "priority", "status", "created"], null);
    expect(first.issues).toHaveLength(2);
    expect(first.issues[0]).toMatchObject({ summary: "a", priorityId: "2", statusId: "1", statusName: "To Do" });
    expect(first.issues[1].priorityId).toBeNull();
    expect(first.issues[0].created.toISOString()).toBe("2026-10-14T10:00:00.000Z");
    expect(first.nextPageToken).toBeNull();
  });

  it("throws JiraNotFoundError for a deleted issue", async () => {
    const issue = mock.addIssue({ summary: "x" });
    issue.deleted = true;
    await expect(client().getIssue(issue.id)).rejects.toBeInstanceOf(JiraNotFoundError);
  });

  it("reads the latest status change time and transitions", async () => {
    const issue = mock.addIssue({ summary: "x" });
    mock.setStatus(issue.id, "3", new Date("2026-10-14T11:00:00Z"));
    const c = client();
    expect((await c.latestStatusChangeAt(issue.id))?.toISOString()).toBe("2026-10-14T11:00:00.000Z");
    mock.state.transitions.push({ id: "99", name: "Resolve", toStatusId: "4", requiredFields: ["Resolution"] });
    const transitions = await c.listTransitions(issue.id);
    expect(transitions.find((t) => t.id === "99")?.requiredFields).toEqual(["Resolution"]);
    await c.transition(issue.id, "13");
    expect(mock.state.issues[0].statusId).toBe("4");
  });

  it("lists statuses for the chosen issue type with categories", async () => {
    expect(await client().listStatuses("10000", "10001")).toEqual([
      { id: "1", name: "To Do", categoryKey: "new" },
      { id: "3", name: "In Progress", categoryKey: "indeterminate" },
      { id: "4", name: "Done", categoryKey: "done" },
    ]);
  });

  it("filters labels by query", async () => {
    expect(await client().listLabels("RISK")).toEqual(["ai-risk"]);
  });

  it("builds a browse URL", () => {
    expect(client().browseUrl("SEC-1")).toBe(`${mock.url}/browse/SEC-1`);
  });
});
```

Transition ids in `defaultState()`: `Start = "11" → 3`, `Reopen = "12" → 1`, `Close = "13" → 4`. Make sure Task 5's `defaultState()` uses exactly these.

- [ ] **Step 2: Run to verify failure** — `cd Servers && npx jest extensions/jira-incidents/__tests__/client.test.ts` → FAIL.

- [ ] **Step 3: Implement** the errors file and the client per **Interfaces**. Core request method:

```ts
private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await safeFetch(`${this.siteUrl}${path}`, {
        method,
        headers: { Authorization: this.authHeader, Accept: "application/json", "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: requestSignal(REQUEST_TIMEOUT_SECONDS, this.deadline),
      });
    } catch (err) {
      throw new JiraUnreachableError(`Could not reach Jira: ${describeFetchError(err, REQUEST_TIMEOUT_SECONDS)}`);
    }
    if (response.status === 429 || (response.status === 503 && response.headers.has("retry-after"))) {
      const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
      if (attempt === 0 && retryAfter !== null && retryAfter <= MAX_RETRY_AFTER_SECONDS) {
        await this.sleep(retryAfter * 1000);
        continue;
      }
      throw new JiraRateLimitError(retryAfter);
    }
    if (response.status === 401) throw new JiraAuthError(401, TOKEN_REJECTED_MESSAGE);
    if (response.status === 403) throw new JiraAuthError(403, FORBIDDEN_MESSAGE);
    if (response.status === 404) throw new JiraNotFoundError(404, `Jira returned 404 for ${path.split("?")[0]}`);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new JiraHttpError(response.status, `Jira returned ${response.status}: ${text.slice(0, 300) || "no details"}`);
    }
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    try {
      return (text ? JSON.parse(text) : undefined) as T;
    } catch {
      throw new JiraUnreachableError("Could not read Jira's response");
    }
  }
}
```

`parseRetryAfter` accepts an integer number of seconds (or an HTTP date → seconds from now, floored at 0); anything else → null. Constructor: `this.siteUrl = assertSafeOutboundUrl(opts.siteUrl)`, `this.deadline = opts.deadline ?? AbortSignal.timeout(EXTERNAL_SYNC_DEADLINE_MS)`, `this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))`. Issue parsing: `created: new Date(fields.created)`, `priorityId: fields.priority?.id ?? null`, `statusId: fields.status.id`, `statusName: fields.status.name`. `missingPermissions` calls `/rest/api/3/mypermissions?projectId=${encodeURIComponent(id)}&permissions=${REQUIRED_PERMISSIONS.join(",")}` and returns the keys whose `havePermission` is not `true`. `listStatuses` picks the element whose `id === issueTypeId` from `/project/{id}/statuses` (empty list if absent). Path segments built from ids go through `encodeURIComponent`.

- [ ] **Step 4: Run tests** — PASS.

- [ ] **Step 5: Commit**

```bash
git add Servers/extensions/jira-incidents/
git commit -m "feat(jira-incidents): add the Jira Cloud REST client" -m "Basic email:token against the site URL through safeFetch with per-request timeouts. 401 and 403 become plain auth errors, 404 a not-found error, 429 (or 503 with Retry-After) one short wait then a rate-limit error. Covers myself, permissions, project and picker reads, token-paged JQL search, changelog status time, transitions with required fields, and remote link upsert."
```

---

## Task 7: Config, readiness, connection test, links and events data access

**Files:**
- Create: `Servers/extensions/jira-incidents/jiraIncidents.config.ts`
- Create: `Servers/extensions/jira-incidents/jiraIncidents.store.ts`
- Test: `Servers/tests/integration/jira-incidents/config.test.ts`
- Create: `Servers/tests/integration/jira-incidents/fixtures.ts` (shared by Tasks 7–12)

**Interfaces:**
- Consumes: `encrypt`/`decrypt` (`Servers/utils/encryption.utils.ts`), `normalizeSiteUrl`, `JiraIncidentsValidationError` (Task 3), `validateMaps`, `unmappedStatuses` (Task 4), `JiraIncidentsClient` (Task 6), `getSchedule`, `saveSchedule` (`Servers/extensions/sync-engine/schedule.ts`).
- Produces (`jiraIncidents.config.ts`):

```ts
export interface JiraIncidentsConfig {        // decrypted, server-side only
  organizationId: number; siteUrl: string | null; email: string | null; apiToken: string | null;
  serviceAccountId: string | null; serviceAccountTimeZone: string | null;
  projectId: string | null; projectKey: string | null; issueTypeId: string | null; label: string | null;
  statusMapIn: StatusMapIn; statusMapOut: StatusMapOut; severityMap: SeverityMap;
  defaultProjectId: number | null; defaultProjectName: string | null; defaultType: string | null; defaultReporter: string | null;
  importFrom: Date | null; lastCheckedAt: Date | null;
}
export interface ConfigView {                  // GET /config body
  configured: boolean; site_url: string | null; email: string | null; has_api_token: boolean;
  service_account_id: string | null; service_account_time_zone: string | null;
  project_id: string | null; project_key: string | null; issue_type_id: string | null; label: string | null;
  status_map_in: StatusMapIn; status_map_out: StatusMapOut; severity_map: SeverityMap;
  default_project_id: number | null; default_type: string | null; default_reporter: string | null;
  import_from: string | null; last_checked_at: string | null;
  readiness: { ready: boolean; reason: string | null };
}
export interface ConfigInput {                 // PUT /config body (all optional; omitted = unchanged)
  site_url?: string; email?: string; api_token?: string;
  project_id?: string; project_key?: string; issue_type_id?: string; label?: string | null;
  status_map_in?: StatusMapIn; status_map_out?: StatusMapOut; severity_map?: SeverityMap;
  default_project_id?: number; default_type?: string; default_reporter?: string;
}
export async function loadConfig(orgId: number): Promise<JiraIncidentsConfig | null>;
export function readinessOf(config: JiraIncidentsConfig | null): Readiness;   // sync-engine Readiness
export async function jiraIncidentsReadiness(orgId: number, kind: string): Promise<Readiness>;
export function clientFor(config: JiraIncidentsConfig, deadline?: AbortSignal): JiraIncidentsClient;
export async function getConfigView(orgId: number): Promise<ConfigView>;
export async function saveConfig(orgId: number, userId: number, input: ConfigInput, deps?: { clientFactory?: (c: { siteUrl: string; email: string; apiToken: string }) => JiraIncidentsClient }): Promise<ConfigView>;
export async function testConnection(orgId: number, submitted: Record<string, unknown>): Promise<{ success: boolean; message: string; testedAt: string }>;
export async function markChecked(orgId: number, at: Date): Promise<void>;
```

`saveConfig` rules (§5, §7): validate in this order and throw `JiraIncidentsValidationError` with a plain message:
1. Merge input over the stored row. `site_url` through `normalizeSiteUrl`. If site URL or email differs from the stored value and no `api_token` is given → "Enter the API token again after changing the site URL or email".
2. When any connection field changed (or no service account is stored yet and all three are present): `client.myself()` → store `service_account_id`, `service_account_time_zone`. A `JiraAuthError` becomes a validation error with its message.
3. `project_id`/`issue_type_id` must be numeric strings; `default_type` in `INCIDENT_TYPES`; `default_reporter` 1–255 chars after trim; `label` ≤ 255; `default_project_id` must exist in `projects` for this organization (`SELECT project_title ... WHERE id = :id AND organization_id = :orgId`), else "Choose a use case from this organization".
4. `validateMaps(...)`. When the merged config has project, issue type and a non-empty `status_map_in`, and either the project, the issue type or `status_map_in` changed: `client.listStatuses(...)`; if `unmappedStatuses` is non-empty → "Map every Jira status: 'X', 'Y' aren't mapped".
5. In one transaction: upsert the row (`INSERT ... ON CONFLICT (organization_id) DO UPDATE`), token as `encrypt(api_token)` only when given. Then compute `readinessOf(merged)`. If ready and `import_from` is null: `UPDATE ... SET import_from = now()`; and if `getSchedule(KEY, orgId)` is null, `saveSchedule(KEY, orgId, { enabled: true, intervalHours: 1 }, { userId, transaction })`.

`getConfigView` with no row returns `configured: false`, every scalar `null`, `has_api_token: false`, the three maps `{}`, and `readiness: { ready: false, reason: "Jira incidents isn't set up yet" }`; with a row, `configured: true`.

`readinessOf` returns `{ ready: false, status: 400, reason }` with the first missing item, in this order: "Connect to Jira" (site, email, token, service account), "Choose a Jira project", "Choose an issue type", "Map Jira statuses to VerifyWise statuses" (empty `status_map_in`), "Map VerifyWise statuses to Jira" (missing key for any of the six statuses in `status_map_out`), "Map Jira priorities to severities" (empty `severity_map`), "Choose the use case for imported incidents" (null `default_project_id`, which also covers a deleted use case), "Choose the incident type", "Enter the reporter". No config row → `{ ready: false, status: 404, reason: "Jira incidents isn't set up yet" }`.

`testConnection(orgId, submitted)`: candidate = stored config overlaid with submitted `site_url`, `email`, `api_token`, `project_id`. If the token is missing and (site or email differs from stored) → `{ success: false, message: "Enter the API token again after changing the site URL or email" }`. Normalise the URL (a validation error → `success: false` with its message). Then `myself()`; if a `project_id` is known, `missingPermissions(project_id)`; message on success: "Connected to Jira as <accountId>." or, with missing permissions, `success: false` and "Connected, but the service account is missing: Browse projects, Transition issues" (map keys to labels: `BROWSE_PROJECTS` → "Browse projects", `TRANSITION_ISSUES` → "Transition issues", `LINK_ISSUES` → "Link issues"). Any `JiraHttpError`/`JiraUnreachableError` → `success: false` with its message. Never throws.

- Produces (`jiraIncidents.store.ts`), all organization-scoped, all accept an optional `transaction`:

```ts
export interface LinkRow {
  id: number; incident_id: number | null; jira_issue_id: string; jira_issue_key: string; jira_url: string;
  last_jira_status_id: string | null; last_vw_status: string | null; state: LinkState; state_reason: string | null;
}
export async function linkExists(orgId: number, jiraIssueId: string, t?: Transaction): Promise<boolean>;
export async function insertLink(orgId: number, link: { incidentId: number; jiraIssueId: string; jiraIssueKey: string; jiraUrl: string; jiraStatusId: string; vwStatus: string }, t: Transaction): Promise<number | null>; // null on conflict
export async function updateLinkSnapshot(orgId: number, linkId: number, s: { jiraStatusId: string; vwStatus: string; jiraIssueKey: string; state: LinkState; stateReason: string | null }, t?: Transaction): Promise<void>;
export async function setLinkState(orgId: number, linkId: number, state: LinkState, reason: string | null, t?: Transaction): Promise<void>;
export async function listSyncableLinks(orgId: number, afterId: number, limit: number): Promise<Array<LinkRow & { vw_status: string }>>;
export async function lockLink(orgId: number, linkId: number, t: Transaction): Promise<LinkRow | null>;  // FOR UPDATE
export async function latestVwStatusChangeAt(orgId: number, incidentId: number): Promise<Date | null>;
export async function insertEvent(orgId: number, e: { linkId: number | null; runId: number | null; kind: EventKind; detail: Record<string, unknown> }, t?: Transaction): Promise<void>;
export async function listEvents(orgId: number, limit: number): Promise<Array<{ id: number; kind: EventKind; detail: Record<string, unknown>; created_at: string; incident_id: number | null; incident_code: string | null; jira_issue_key: string | null; jira_url: string | null }>>;
export async function linksForIncidents(orgId: number, incidentIds: number[]): Promise<Array<{ incident_id: number; jira_issue_key: string; jira_url: string; state: LinkState; state_reason: string | null }>>;
```

`listSyncableLinks` SQL:

```sql
SELECT l.id, l.incident_id, l.jira_issue_id, l.jira_issue_key, l.jira_url, l.last_jira_status_id,
       l.last_vw_status, l.state, l.state_reason, i.status AS vw_status
  FROM jira_incident_links l
  JOIN ai_incident_managements i ON i.id = l.incident_id AND i.organization_id = l.organization_id
 WHERE l.organization_id = :orgId AND l.id > :afterId
   AND l.state IN ('ok', 'error', 'conflict', 'deleted_in_jira')
   AND COALESCE(i.archived, false) = false
 ORDER BY l.id
 LIMIT :limit
```

`latestVwStatusChangeAt`: `SELECT MAX(changed_at) AS at FROM incident_change_history WHERE organization_id = :orgId AND incident_id = :incidentId AND field_name = 'Status'` ("Status" is the configured label in `Servers/config/changeHistory.config.ts:616`). `listEvents` LEFT JOINs links and incidents (both on `organization_id`) for `incident_code` (= `ai_incident_managements.incident_id`), newest first.

- [ ] **Step 1: Write the shared fixtures**

```ts
// Servers/tests/integration/jira-incidents/fixtures.ts
import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { encrypt } from "../../../utils/encryption.utils";
import { startJiraCloudMock, JiraCloudMock } from "../../mocks/jiraCloud/server";

export const FULL_MAPS = {
  status_map_in: { "1": "Open", "3": "Investigating", "4": "Closed" },
  status_map_out: { Open: "1", Investigating: "3", Closed: "4", Mitigated: null, Suspended: null, "Emergency action": null },
  severity_map: { "2": "Very serious", "3": "Serious", "4": "Minor" },
};

export async function insertProject(orgId: number, ownerId: number, title = "Fraud model"): Promise<number> {
  const rows = await sequelize.query<{ id: number }>(
    `INSERT INTO projects (project_title, owner, start_date, ai_risk_classification, high_risk_roles,
       goal, last_updated, last_updated_by, organization_id)
     VALUES (:title, :ownerId, NOW(), 'High risk', '{Deployer}', 'goal', NOW(), :ownerId, :orgId)
     RETURNING id`,
    { replacements: { orgId, ownerId, title }, type: QueryTypes.SELECT },
  );
  return rows[0].id;
}

export async function enableExtension(orgId: number, userId: number, key = "jira-incidents"): Promise<void> {
  await sequelize.query(
    `INSERT INTO extension_enablements (organization_id, extension_id, enabled, enabled_at, enabled_by)
     SELECT :orgId, e.id, TRUE, now(), :userId FROM extensions e WHERE e.key = :key
     ON CONFLICT (organization_id, extension_id) DO UPDATE SET enabled = TRUE, enabled_at = now();`,
    { replacements: { orgId, userId, key } },
  );
}

/** A complete config pointing at `mock`, import_from at `importFrom`. */
export async function seedReadyConfig(
  orgId: number, projectId: number, mock: JiraCloudMock,
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
        orgId, url: mock.url, token: encrypt("token-1"), tz: mock.state.account.timeZone, projectId, importFrom,
        mapIn: JSON.stringify(FULL_MAPS.status_map_in), mapOut: JSON.stringify(FULL_MAPS.status_map_out),
        sev: JSON.stringify(FULL_MAPS.severity_map),
      },
    },
  );
}

export async function withMock(): Promise<JiraCloudMock> {
  process.env.JIRA_INCIDENTS_ALLOW_LOCAL_SITE_URL = "true";
  return startJiraCloudMock();
}

export async function rows<T>(sql: string, replacements: Record<string, unknown> = {}): Promise<T[]> {
  return sequelize.query<T>(sql, { replacements, type: QueryTypes.SELECT }) as Promise<T[]>;
}
```

- [ ] **Step 2: Write the failing config tests**

```ts
// Servers/tests/integration/jira-incidents/config.test.ts
jest.setTimeout(60000);

import { cleanupDatabase, seedTwoOrgsAndUsers } from "../helpers";
import { JiraCloudMock } from "../../mocks/jiraCloud/server";
import { FULL_MAPS, insertProject, rows, withMock } from "./fixtures";
import { getConfigView, jiraIncidentsReadiness, saveConfig, testConnection } from "../../../extensions/jira-incidents/jiraIncidents.config";

describe("jira incidents config", () => {
  let mock: JiraCloudMock;
  beforeEach(async () => { mock = await withMock(); });
  afterEach(async () => { await mock.close(); await cleanupDatabase(); });

  const connection = () => ({ site_url: mock.url, email: "svc@acme.test", api_token: "token-1" });

  it("stores the token encrypted and never returns it", async () => {
    const { orgA, userA } = await seedTwoOrgsAndUsers();
    const view = await saveConfig(orgA, userA, connection());
    expect(view).toMatchObject({ has_api_token: true, service_account_id: "svc-1", service_account_time_zone: "UTC" });
    expect(JSON.stringify(view)).not.toContain("token-1");
    const [row] = await rows<{ api_token_encrypted: string }>(
      `SELECT api_token_encrypted FROM jira_incidents_config WHERE organization_id = :orgA`, { orgA });
    expect(row.api_token_encrypted).not.toContain("token-1");
  });

  it("refuses a non-Atlassian site and a rejected token", async () => {
    const { orgA, userA } = await seedTwoOrgsAndUsers();
    await expect(saveConfig(orgA, userA, { ...connection(), site_url: "https://evil.com" })).rejects.toThrow(/atlassian\.net/);
    await expect(saveConfig(orgA, userA, { ...connection(), api_token: "nope" })).rejects.toThrow(/expired or been revoked/);
  });

  it("requires the token again when the site or email changes", async () => {
    const { orgA, userA } = await seedTwoOrgsAndUsers();
    await saveConfig(orgA, userA, connection());
    await expect(saveConfig(orgA, userA, { email: "other@acme.test" })).rejects.toThrow(/API token again/);
  });

  it("refuses a status mapping that leaves a Jira status unmapped", async () => {
    const { orgA, userA } = await seedTwoOrgsAndUsers();
    await saveConfig(orgA, userA, connection());
    await expect(
      saveConfig(orgA, userA, { project_id: "10000", project_key: "SEC", issue_type_id: "10001", status_map_in: { "1": "Open" } }),
    ).rejects.toThrow(/'In Progress', 'Done' aren't mapped/);
  });

  it("refuses another organization's use case", async () => {
    const { orgA, orgB, userA, userB } = await seedTwoOrgsAndUsers();
    const projectB = await insertProject(orgB, userB);
    await expect(saveConfig(orgA, userA, { default_project_id: projectB })).rejects.toThrow(/use case/);
  });

  it("names the first missing item until complete, then sets import_from once and creates an hourly schedule", async () => {
    const { orgA, userA } = await seedTwoOrgsAndUsers();
    expect(await jiraIncidentsReadiness(orgA, "scheduled")).toEqual({ ready: false, status: 404, reason: "Jira incidents isn't set up yet" });
    await saveConfig(orgA, userA, connection());
    expect((await getConfigView(orgA)).readiness).toEqual({ ready: false, reason: "Choose a Jira project" });

    const projectId = await insertProject(orgA, userA);
    await saveConfig(orgA, userA, {
      project_id: "10000", project_key: "SEC", issue_type_id: "10001", ...FULL_MAPS,
      default_project_id: projectId, default_type: "Malfunction", default_reporter: "Jira sync",
    });
    const view = await getConfigView(orgA);
    expect(view.readiness).toEqual({ ready: true, reason: null });
    expect(view.import_from).not.toBeNull();
    const [schedule] = await rows<{ enabled: boolean; interval_hours: number }>(
      `SELECT enabled, interval_hours FROM extension_sync_settings WHERE organization_id = :orgA AND extension_key = 'jira-incidents'`, { orgA });
    expect(schedule).toEqual({ enabled: true, interval_hours: 1 });

    await saveConfig(orgA, userA, { default_reporter: "Security team" });
    expect((await getConfigView(orgA)).import_from).toBe(view.import_from);
  });

  it("does not overwrite a schedule the admin already changed", async () => {
    const { orgA, userA } = await seedTwoOrgsAndUsers();
    await rows(`INSERT INTO extension_sync_settings (organization_id, extension_key, enabled, interval_hours)
                VALUES (:orgA, 'jira-incidents', FALSE, 12) RETURNING id`, { orgA });
    const projectId = await insertProject(orgA, userA);
    await saveConfig(orgA, userA, {
      ...connection(), project_id: "10000", project_key: "SEC", issue_type_id: "10001", ...FULL_MAPS,
      default_project_id: projectId, default_type: "Malfunction", default_reporter: "Jira sync",
    });
    const [schedule] = await rows<{ enabled: boolean; interval_hours: number }>(
      `SELECT enabled, interval_hours FROM extension_sync_settings WHERE organization_id = :orgA`, { orgA });
    expect(schedule).toEqual({ enabled: false, interval_hours: 12 });
  });

  it("tests the connection and names missing permissions", async () => {
    const { orgA } = await seedTwoOrgsAndUsers();
    expect(await testConnection(orgA, { ...connection(), project_id: "10000" })).toMatchObject({
      success: true, message: "Connected to Jira as svc-1.",
    });
    mock.state.permissions.LINK_ISSUES = false;
    expect(await testConnection(orgA, { ...connection(), project_id: "10000" })).toMatchObject({
      success: false, message: "Connected, but the service account is missing: Link issues",
    });
    expect((await testConnection(orgA, { ...connection(), api_token: "x" })).message).toMatch(/expired or been revoked/);
  });
});
```

- [ ] **Step 3: Run to verify failure** — integration command with `tests/integration/jira-incidents/config.test.ts` → FAIL (module not found).

- [ ] **Step 4: Implement** `jiraIncidents.config.ts` and `jiraIncidents.store.ts` per **Interfaces**. Row → `JiraIncidentsConfig` mapping decrypts with `decrypt(row.api_token_encrypted)` inside try/catch (a decrypt failure yields `apiToken: null`, so readiness says "Connect to Jira" rather than crashing the tick). `defaultProjectName` comes from a LEFT JOIN on `projects` by `(id, organization_id)`. `clientFor` passes `siteUrl` back through `normalizeSiteUrl` (so a stored localhost URL stops working when the override is off). The ConfigView `import_from`/`last_checked_at` are ISO strings.

- [ ] **Step 5: Run tests** — PASS.

- [ ] **Step 6: Commit**

```bash
git add Servers/extensions/jira-incidents/ Servers/tests/integration/jira-incidents/
git commit -m "feat(jira-incidents): store the configuration and report readiness" -m "Saves connection, issue selection, mappings and defaults per organization with the token encrypted (AES-256-GCM) and never returned. Saving checks the token with Jira, refuses unmapped Jira statuses and another organization's use case, and the first time the setup is complete sets the import cut-off and an hourly schedule. Connection test names missing permissions. Organization-scoped link and event queries for the sync steps."
```

---

## Task 8: Import step

**Files:**
- Create: `Servers/extensions/jira-incidents/jiraIncidents.import.ts`
- Create: `Servers/extensions/jira-incidents/jiraIncidents.run.ts` (run-scoped state shared by import and status sync)
- Test: `Servers/tests/integration/jira-incidents/import.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 3, 4, 6, 7.
- Produces:

```ts
// jiraIncidents.run.ts
export type CountKey = "imported" | "status_from_jira" | "status_to_jira" | "conflicts" | "errors" | "deleted_in_jira";
export interface RunState {
  orgId: number; runId: number | null; startedAt: Date;
  config: JiraIncidentsConfig; client: JiraIncidentsClient;
  counts: Record<CountKey, number>;
  stopReason: string | null;              // set when the run stopped early
  heartbeat: () => Promise<void>;
  deadline: AbortSignal;
  warnedNoFrontendUrl: boolean;
}
export function newCounts(): Record<CountKey, number>;
export const STOP_DEADLINE = "Stopped at the time limit. The next sync continues where this one stopped.";
export const STOP_RATE_LIMIT = "Rate limited by Jira. The next sync continues where this one stopped.";

// jiraIncidents.import.ts
export async function runImport(state: RunState): Promise<void>;
```

`runImport` (§6.1):

```ts
export async function runImport(state: RunState): Promise<void> {
  const { config, client } = state;
  const cutoff = importCutoff(config.importFrom!, config.lastCheckedAt);
  const jql = buildImportJql({
    projectId: config.projectId!, issueTypeId: config.issueTypeId!, label: config.label,
    cutoff: formatJqlDate(cutoff, config.serviceAccountTimeZone ?? "UTC"),
  });
  let token: string | null = null;
  do {
    if (state.deadline.aborted) { state.stopReason = STOP_DEADLINE; return; }
    let page: SearchPage;
    try {
      page = await client.searchPage(jql, ["summary", "description", "priority", "status", "created"], token);
    } catch (err) {
      if (err instanceof JiraRateLimitError) { state.stopReason = STOP_RATE_LIMIT; return; }
      throw err;
    }
    for (const issue of page.issues) {
      if (state.deadline.aborted) { state.stopReason = STOP_DEADLINE; return; }
      if (issue.created < config.importFrom!) continue;          // in-code cut-off (§6.1 step 1)
      if (await linkExists(state.orgId, issue.id)) continue;       // any state (§6.1 step 2)
      await importOne(state, issue);
      await state.heartbeat();
    }
    token = page.nextPageToken;
  } while (token);
  await markChecked(state.orgId, state.startedAt);                 // only when the window finished (§6.1 step 5)
}
```

`importOne`: inside `sequelize.transaction(async (t) => { ... })`: map status (`config.statusMapIn[issue.statusId]`; if unmapped — the workflow gained a status after the mapping was saved — use "Open", start the link as `error` with reason `Jira status '<statusName>' isn't mapped`, write an `error` event and count it, and store `last_jira_status_id = ""` instead of the real id. The empty snapshot makes the next status sync see a Jira change, so it re-checks the mapping every run: still unmapped → stays `error` with no new event; mapped → applied and the link returns to `ok`. Storing the real id would make the next run see "no change" and clear the error while the status is still unmapped. Add an import test for this: unmapped status at import → link `error`, `last_jira_status_id` `""`; after adding the mapping, one `runStatusSync` sets the incident to the mapped status and the link to `ok`.), severity `severityForPriority`, `createIncidentForImport(orgId, { projectId: config.defaultProjectId!, aiProject: config.defaultProjectName!, type: config.defaultType!, severity, status, reporter: config.defaultReporter!, description: buildIncidentDescription(issue.summary, issue.description, issue.key), occurredAt: issue.created }, t)`; `insertLink(orgId, { incidentId, jiraIssueId: issue.id, jiraIssueKey: issue.key, jiraUrl: client.browseUrl(issue.key), jiraStatusId: issue.statusId, vwStatus: status }, t)` — if it returns null (a concurrent insert), throw a private `AlreadyLinked` error to roll back and swallow it outside; `insertEvent(kind "imported", detail { jira_issue_key, incident_id, incident_code, severity, status })`. After commit: `counts.imported++`, then the remote link: if `process.env.FRONTEND_URL` is unset, log one warning per run (`state.warnedNoFrontendUrl`) and skip; else `client.upsertRemoteLink(issue.id, { globalId: \`verifywise:incident:${orgId}:${incident.id}\`, url: \`${FRONTEND_URL}/ai-incident-managements?incidentId=${incident.id}\`, title: \`VerifyWise ${incident.incident_id}\` })`. A remote-link failure: `insertEvent(kind "error", detail { jira_issue_key, reason: "Could not add the VerifyWise link to the Jira issue: <message>" })` and `counts.errors++`; a `JiraRateLimitError` here sets `STOP_RATE_LIMIT` and returns from `runImport` without marking checked. Any other failure inside `importOne` (validation, DB) → `insertEvent(kind "error", detail { jira_issue_key, reason })`, `counts.errors++`, continue with the next issue; the issue is retried next run because no link exists.

- [ ] **Step 1: Write the failing tests**

```ts
// Servers/tests/integration/jira-incidents/import.test.ts
jest.setTimeout(60000);

import { cleanupDatabase, seedTwoOrgsAndUsers } from "../helpers";
import { JiraCloudMock } from "../../mocks/jiraCloud/server";
import { insertProject, rows, seedReadyConfig, withMock } from "./fixtures";
import { loadConfig, clientFor } from "../../../extensions/jira-incidents/jiraIncidents.config";
import { runImport } from "../../../extensions/jira-incidents/jiraIncidents.import";
import { newCounts, RunState } from "../../../extensions/jira-incidents/jiraIncidents.run";
import { sequelize } from "../../../database/db";

async function stateFor(orgId: number): Promise<RunState> {
  const config = (await loadConfig(orgId))!;
  return {
    orgId, runId: null, startedAt: new Date(), config, client: clientFor(config),
    counts: newCounts(), stopReason: null, heartbeat: async () => {},
    deadline: new AbortController().signal, warnedNoFrontendUrl: false,
  };
}
const iso = (d: Date) => d.toISOString().replace("Z", "+0000");

describe("jira incidents import", () => {
  let mock: JiraCloudMock;
  let orgA: number;
  let projectId: number;
  beforeEach(async () => {
    mock = await withMock();
    process.env.FRONTEND_URL = "https://app.verifywise.test";
    const seed = await seedTwoOrgsAndUsers();
    orgA = seed.orgA;
    projectId = await insertProject(orgA, seed.userA);
  });
  afterEach(async () => { await mock.close(); await cleanupDatabase(); });

  it("imports a new issue with summary, description, severity and status", async () => {
    await seedReadyConfig(orgA, projectId, mock);
    const issue = mock.addIssue({
      summary: "Chatbot leaked a phone number", priorityId: "2", statusId: "3",
      description: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "Seen in prod" }] }] },
    });
    const state = await stateFor(orgA);
    await runImport(state);

    const [incident] = await rows<any>(`SELECT * FROM ai_incident_managements WHERE organization_id = :orgA`, { orgA });
    expect(incident).toMatchObject({
      description: "Chatbot leaked a phone number\n\nSeen in prod", severity: "Very serious", status: "Investigating",
      project_id: projectId, ai_project: "Fraud model", type: "Malfunction", reporter: "Jira sync", approval_status: "Pending",
    });
    const [link] = await rows<any>(`SELECT * FROM jira_incident_links WHERE organization_id = :orgA`, { orgA });
    expect(link).toMatchObject({ incident_id: incident.id, jira_issue_id: issue.id, state: "ok", last_jira_status_id: "3", last_vw_status: "Investigating" });
    expect(mock.state.issues[0].remoteLinks[0]).toEqual({
      globalId: `verifywise:incident:${orgA}:${incident.id}`,
      url: `https://app.verifywise.test/ai-incident-managements?incidentId=${incident.id}`,
      title: `VerifyWise ${incident.incident_id}`,
    });
    expect(state.counts.imported).toBe(1);
    expect((await loadConfig(orgA))!.lastCheckedAt).toEqual(state.startedAt);
  });

  it("issue created just before the cut-off is not imported, even in a far time zone", async () => {
    mock.state.account.timeZone = "Pacific/Kiritimati";
    const importFrom = new Date("2026-10-14T10:00:30Z");
    await seedReadyConfig(orgA, projectId, mock, importFrom);
    mock.addIssue({ summary: "before", created: "2026-10-14T10:00:10.000+0000" });
    mock.addIssue({ summary: "after", created: "2026-10-14T10:00:40.000+0000" });
    await runImport(await stateFor(orgA));
    const incidents = await rows<{ description: string }>(`SELECT description FROM ai_incident_managements WHERE organization_id = :orgA`, { orgA });
    expect(incidents.map((i) => i.description)).toEqual(["after"]);
  });

  it("never imports an issue twice, across overlapping windows", async () => {
    await seedReadyConfig(orgA, projectId, mock);
    mock.addIssue({ summary: "Once only please" });
    await runImport(await stateFor(orgA));
    await runImport(await stateFor(orgA));
    expect(await rows(`SELECT id FROM ai_incident_managements WHERE organization_id = :orgA`, { orgA })).toHaveLength(1);
  });

  it("deleted_in_verifywise is never re-imported", async () => {
    await seedReadyConfig(orgA, projectId, mock);
    mock.addIssue({ summary: "Delete me later" });
    await runImport(await stateFor(orgA));
    const [incident] = await rows<{ id: number }>(`SELECT id FROM ai_incident_managements WHERE organization_id = :orgA`, { orgA });
    const { deleteIncidentByIdQuery } = await import("../../../utils/incidentManagement.utils");
    await sequelize.transaction((t) => deleteIncidentByIdQuery(incident.id, orgA, t));
    await sequelize.query(`UPDATE jira_incidents_config SET last_checked_at = NULL WHERE organization_id = :orgA`, { replacements: { orgA } });
    await runImport(await stateFor(orgA));
    expect(await rows(`SELECT id FROM ai_incident_managements WHERE organization_id = :orgA`, { orgA })).toHaveLength(0);
  });

  it("pages across search pages", async () => {
    await seedReadyConfig(orgA, projectId, mock);
    for (let i = 0; i < 120; i++) mock.addIssue({ summary: `Issue number ${i}` });
    await runImport(await stateFor(orgA));
    expect(await rows(`SELECT id FROM ai_incident_managements WHERE organization_id = :orgA`, { orgA })).toHaveLength(120);
  });

  it("rate limit mid-run keeps completed imports and does not advance last_checked_at", async () => {
    await seedReadyConfig(orgA, projectId, mock);
    for (let i = 0; i < 60; i++) mock.addIssue({ summary: `Issue number ${i}` });
    // The first search page (50 issues) succeeds; the second is rate limited.
    mock.state.failNext.push({ status: 429, retryAfter: 120, path: "/rest/api/3/search/jql", afterCalls: 1 });
    const state = await stateFor(orgA);
    await runImport(state);
    expect(state.stopReason).toMatch(/Rate limited/);
    expect(state.counts.imported).toBe(50);
    expect((await loadConfig(orgA))!.lastCheckedAt).toBeNull();

    await runImport(await stateFor(orgA));
    expect(await rows(`SELECT id FROM ai_incident_managements WHERE organization_id = :orgA`, { orgA })).toHaveLength(60);
  });

  it("skips the remote link and warns once without FRONTEND_URL", async () => {
    delete process.env.FRONTEND_URL;
    await seedReadyConfig(orgA, projectId, mock);
    mock.addIssue({ summary: "First issue here" });
    mock.addIssue({ summary: "Second issue here" });
    const state = await stateFor(orgA);
    await runImport(state);
    expect(state.counts.imported).toBe(2);
    expect(mock.state.issues.every((i) => i.remoteLinks.length === 0)).toBe(true);
    expect(state.warnedNoFrontendUrl).toBe(true);
  });

  it("logs a failed remote link as an error without undoing the import", async () => {
    await seedReadyConfig(orgA, projectId, mock);
    mock.addIssue({ summary: "Remote link fails" });
    mock.state.failNext.push({ status: 500, path: "/rest/api/3/issue/" });
    const state = await stateFor(orgA);
    await runImport(state);
    expect(state.counts).toMatchObject({ imported: 1, errors: 1 });
    const events = await rows<{ kind: string }>(`SELECT kind FROM jira_incident_sync_events WHERE organization_id = :orgA ORDER BY id`, { orgA });
    expect(events.map((e) => e.kind)).toEqual(["imported", "error"]);
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL, module not found.

- [ ] **Step 3: Implement** `jiraIncidents.run.ts` and `jiraIncidents.import.ts` as specified. Use `logger.warn` for the FRONTEND_URL warning.

- [ ] **Step 4: Run tests** — PASS. Re-run Task 7's config tests (shared fixtures).

- [ ] **Step 5: Commit**

```bash
git add Servers/extensions/jira-incidents/ Servers/tests/
git commit -m "feat(jira-incidents): import new Jira issues as incidents" -m "Searches new issues since the cut-off (with a 10-minute overlap and an in-code created check), skips any issue that already has a link, and creates each incident and its link in one transaction through the system creation path. Adds a VerifyWise remote link to the issue after commit. A rate limit or the deadline stops the import early without moving last_checked_at, so the next run searches the same window again."
```

---

## Task 9: Status sync step

**Files:**
- Create: `Servers/extensions/jira-incidents/jiraIncidents.statusSync.ts`
- Test: `Servers/tests/integration/jira-incidents/statusSync.test.ts`

**Interfaces:**
- Consumes: `RunState` (Task 8), store (Task 7), `decideStatusAction`, `pickTransition` (Task 4), `updateIncident`, `IncidentUpdateValidationError` (`Servers/services/incidentManagement.service.ts`).
- Produces: `export async function runStatusSync(state: RunState): Promise<void>;`

Algorithm (§6.2, §6.3). Read links with `listSyncableLinks` in pages of `STATUS_BATCH_SIZE`. For each page:

1. `client.searchPage(buildIdsJql(ids), ["status"], token)` until no token → `Map<issueId, { statusId, statusName, key }>`.
2. For each link, in order (check `state.deadline.aborted` → `STOP_DEADLINE`; `JiraRateLimitError` anywhere → `STOP_RATE_LIMIT`, return):
   - **Missing from search:** `client.getIssue(id)`. `JiraNotFoundError` → if `state !== "deleted_in_jira"`: `setLinkState(deleted_in_jira, null)`, event `deleted_in_jira`, `counts.deleted_in_jira++`. Continue. If `getIssue` succeeds, use its status.
   - **Restored:** link `state === "deleted_in_jira"` and the issue is found → `updateLinkSnapshot(current jira status, current vw status, key, state "ok", null)`; continue (no status written this run).
   - Otherwise call `decideStatusAction` with `jiraChangedAt`/`vwChangedAt` fetched **only when both sides changed** (`client.latestStatusChangeAt`, `latestVwStatusChangeAt`).
   - `none` → `updateLinkSnapshot(current, current, key, nextState(link, false), null)` where `nextState` keeps `conflict` (a no-change run is not "clean", §6.2 step 4) and turns `error` into `ok`.
   - `unmapped` → `failLink(state, link, \`Jira status '${statusName}' isn't mapped\`)`; snapshot unchanged.
   - `to_vw` → transaction: `lockLink`; `updateIncident(orgId, incidentId, { status: vwStatus }, null, { transaction: t, changedBySystem: true })`; `updateLinkSnapshot(jira current, vwStatus, key, conflict ? "conflict" : "ok", conflict ? reason : null, t)`; event `status_from_jira` `{ jira_issue_key, from: link.vw_status, to: vwStatus, jira_status: statusName }`; if `conflict`, also event `conflict` `{ winner: "jira", jira_status, vw_status: link.vw_status (the loser), applied: vwStatus }` and `counts.conflicts++`. Commit; `counts.status_from_jira++`. `IncidentUpdateValidationError` → `failLink` with the first error message.
   - `to_jira` with `jiraStatusId === null` → `updateLinkSnapshot(jira current, vw current, ...)`; event `status_to_jira` `{ jira_issue_key, vw_status, skipped: "Don't change Jira" }`; no count. A conflict won by VerifyWise with a null target still writes the `conflict` event.
   - `to_jira` with a target → `client.listTransitions`; `pickTransition(transitions, target, { from: statusName, to: <name of target from listStatuses cache> })`; refusal → `failLink(reason)` (snapshot unchanged, so it retries). Success → `client.transition`, then transaction: `updateLinkSnapshot(target, vw current, ..., conflict ? "conflict" : "ok")`, event `status_to_jira` `{ jira_issue_key, from: statusName, to: targetName, vw_status }`, conflict event as above with `winner: "verifywise"`; `counts.status_to_jira++`. Load the status names once per run via `client.listStatuses(projectId, issueTypeId)` (cache on `state`).
   - `await state.heartbeat()` after each link.

`failLink(state, link, reason)`: `counts.errors++`; if `link.state !== "error" || link.state_reason !== reason` → `setLinkState(error, reason)` + event `error` `{ jira_issue_key, reason }`; else nothing (no new row for a lasting error, §6.2 step 4).

Conflict `state_reason`: `Both sides changed. Jira's '<jira status name>' and VerifyWise's '<vw status>'; the later change (<winner>) was kept.`

- [ ] **Step 1: Write the failing tests**

```ts
// Servers/tests/integration/jira-incidents/statusSync.test.ts
jest.setTimeout(60000);

import { cleanupDatabase, seedTwoOrgsAndUsers } from "../helpers";
import { JiraCloudMock } from "../../mocks/jiraCloud/server";
import { insertProject, rows, seedReadyConfig, withMock } from "./fixtures";
import { clientFor, loadConfig } from "../../../extensions/jira-incidents/jiraIncidents.config";
import { runImport } from "../../../extensions/jira-incidents/jiraIncidents.import";
import { runStatusSync } from "../../../extensions/jira-incidents/jiraIncidents.statusSync";
import { newCounts, RunState } from "../../../extensions/jira-incidents/jiraIncidents.run";
import { updateIncident } from "../../../services/incidentManagement.service";
import { sequelize } from "../../../database/db";

async function stateFor(orgId: number): Promise<RunState> {
  const config = (await loadConfig(orgId))!;
  return { orgId, runId: null, startedAt: new Date(), config, client: clientFor(config), counts: newCounts(),
    stopReason: null, heartbeat: async () => {}, deadline: new AbortController().signal, warnedNoFrontendUrl: false };
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

  const link = async () => (await rows<any>(`SELECT * FROM jira_incident_links WHERE organization_id = :orgA`, { orgA }))[0];
  const incident = async () => (await rows<any>(`SELECT * FROM ai_incident_managements WHERE id = :incidentId`, { incidentId }))[0];
  const events = async () => (await rows<{ kind: string }>(`SELECT kind FROM jira_incident_sync_events WHERE organization_id = :orgA ORDER BY id`, { orgA })).map((e) => e.kind);
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
  afterEach(async () => { await mock.close(); await cleanupDatabase(); });

  it("applies a Jira change to the incident as the system", async () => {
    mock.setStatus(issueId, "3");
    const s = await sync(orgA);
    expect((await incident()).status).toBe("Investigating");
    expect(s.counts.status_from_jira).toBe(1);
    const [h] = await rows<any>(`SELECT changed_by_system FROM incident_change_history WHERE incident_id = :incidentId AND action = 'updated'`, { incidentId });
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

  it("records Don't change Jira without calling Jira", async () => {
    await vwSet("Mitigated");
    await sync(orgA);
    expect(mock.state.issues[0].statusId).toBe("1");
    expect(mock.state.calls.some((c) => c.path.endsWith("/transitions") && c.method === "POST")).toBe(false);
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
    expect((await link()).state).toBe("conflict");          // a no-change run keeps the badge
    mock.setStatus(issueId, "3");
    await sync(orgA);
    expect((await link()).state).toBe("ok");                 // one side changed alone: clean
  });

  it("reports a refused transition and does not change the incident back", async () => {
    mock.state.transitions = mock.state.transitions.filter((t) => t.toStatusId !== "4");
    await vwSet("Closed");
    await sync(orgA);
    expect((await link())).toMatchObject({ state: "error", state_reason: "No move from 'To Do' to 'Done' in this workflow" });
    expect((await incident()).status).toBe("Closed");
  });

  it("reports a transition that needs a field", async () => {
    mock.state.transitions = [{ id: "99", name: "Resolve", toStatusId: "4", requiredFields: ["Resolution"] }];
    await vwSet("Closed");
    await sync(orgA);
    expect((await link()).state_reason).toBe("Moving to 'Done' needs a value for Resolution. Change the status in Jira.");
  });

  it("lasting error writes one event, and a mapped status clears it (unmapped then mapped)", async () => {
    mock.state.statuses.push({ id: "8", name: "Awaiting vendor", categoryKey: "indeterminate" });
    mock.setStatus(issueId, "8");
    await sync(orgA);
    await sync(orgA);
    await sync(orgA);
    expect((await link())).toMatchObject({ state: "error", state_reason: "Jira status 'Awaiting vendor' isn't mapped" });
    expect((await events()).filter((k) => k === "error")).toHaveLength(1);
    expect((await incident()).status).toBe("Open");

    await sequelize.query(
      `UPDATE jira_incidents_config SET status_map_in = status_map_in || '{"8": "Investigating"}'::jsonb WHERE organization_id = :orgA`,
      { replacements: { orgA } });
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
    expect((await link())).toMatchObject({ state: "ok", last_jira_status_id: "3" });
    expect((await incident()).status).toBe("Open");          // nothing written on the restoring run
  });

  it("reopens a closed, approved incident through the reopen rule", async () => {
    await sequelize.query(`UPDATE ai_incident_managements SET status = 'Closed', approval_status = 'Approved' WHERE id = :incidentId`, { replacements: { incidentId } });
    await sequelize.query(`UPDATE jira_incident_links SET last_vw_status = 'Closed', last_jira_status_id = '4' WHERE organization_id = :orgA`, { replacements: { orgA } });
    mock.setStatus(issueId, "4");
    mock.setStatus(issueId, "3");
    await sync(orgA);
    expect(await incident()).toMatchObject({ status: "Investigating", approval_status: "Pending" });
  });

  it("skips archived incidents", async () => {
    await sequelize.query(`UPDATE ai_incident_managements SET archived = true WHERE id = :incidentId`, { replacements: { incidentId } });
    mock.setStatus(issueId, "3");
    await sync(orgA);
    expect((await incident()).status).toBe("Open");
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement** `runStatusSync` as specified.

- [ ] **Step 4: Run tests** — PASS. Re-run `import.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add Servers/extensions/jira-incidents/ Servers/tests/integration/jira-incidents/statusSync.test.ts
git commit -m "feat(jira-incidents): keep status in step both ways" -m "Reads each linked issue's status in batches and applies the decision table: Jira changes go through updateIncident as the system (so the reopen rule applies), VerifyWise changes become Jira transitions, and when both changed the later one wins and the link shows a conflict. A refused transition or an unmapped status marks the link as an error, retried every run with one event per reason. A deleted issue marks the link and leaves the incident; it recovers when the issue returns."
```

---

## Task 10: Run orchestration and sync-engine provider

**Files:**
- Create: `Servers/extensions/jira-incidents/jiraIncidents.sync.ts`
- Create: `Servers/extensions/jira-incidents/jiraIncidents.syncProvider.ts`
- Modify: `Servers/extensions/sync-engine/providers.ts:6`
- Test: `Servers/tests/integration/jira-incidents/run.test.ts`, `Servers/extensions/jira-incidents/__tests__/summary.test.ts`

**Interfaces:**
- Consumes: Tasks 7–9; `RunContext`, `RunResult`, `SyncProvider` (`sync-engine/types.ts`).
- Produces:

```ts
export function summarizeRun(counts: Record<CountKey, number>, stopReason: string | null): string;
export async function runJiraIncidentsSync(ctx: RunContext): Promise<RunResult>;
export const jiraIncidentsSyncProvider: SyncProvider;   // key "jira-incidents", displayName "Jira incidents",
                                                         // kinds ["manual","scheduled"], scheduledKind "scheduled",
                                                         // runDeadlineMs RUN_DEADLINE_MS, readiness jiraIncidentsReadiness
```

`runJiraIncidentsSync(ctx)`:

```ts
export async function runJiraIncidentsSync(ctx: RunContext): Promise<RunResult> {
  const config = await loadConfig(ctx.orgId);
  const readiness = readinessOf(config);
  if (!readiness.ready) return { counts: newCounts(), message: readiness.reason };
  const state: RunState = {
    orgId: ctx.orgId, runId: ctx.runId, startedAt: new Date(), config: config!,
    client: clientFor(config!, ctx.signal), counts: newCounts(), stopReason: null,
    heartbeat: () => ctx.heartbeat(), deadline: ctx.signal, warnedNoFrontendUrl: false,
  };
  try {
    await state.client.getProject(config!.projectId!);
  } catch (err) {
    if (err instanceof JiraNotFoundError || (err instanceof JiraAuthError && err.status === 403)) {
      throw new Error(`VerifyWise can no longer read Jira project ${config!.projectKey}`);
    }
    throw err;                                   // 401 → "Jira rejected the API token…"
  }
  await runImport(state);
  if (!state.stopReason) await runStatusSync(state);
  return { counts: state.counts, message: summarizeRun(state.counts, state.stopReason) };
}
```

`ctx.heartbeat()`'s exact signature is `heartbeat(t?)` in `types.ts:40-58` — call it with no transaction. Thrown errors become a `failed` run with backoff (engine behaviour). `summarizeRun`: `"Imported 2, 1 status from Jira, 1 status to Jira, 1 conflict, 1 error, 1 deleted in Jira."` — list only non-zero parts in that order, singular/plural by count; all zero → `"No changes."`; a stop reason is appended as a second sentence.

- [ ] **Step 1: Write the failing tests**

```ts
// Servers/extensions/jira-incidents/__tests__/summary.test.ts
import { summarizeRun } from "../jiraIncidents.sync";
import { newCounts } from "../jiraIncidents.run";

describe("summarizeRun", () => {
  it("lists only non-zero counts", () => {
    expect(summarizeRun({ ...newCounts(), imported: 2, conflicts: 1 }, null)).toBe("Imported 2, 1 conflict.");
  });
  it("says no changes", () => {
    expect(summarizeRun(newCounts(), null)).toBe("No changes.");
  });
  it("appends the stop reason", () => {
    expect(summarizeRun({ ...newCounts(), errors: 2 }, "Rate limited by Jira. The next sync continues where this one stopped."))
      .toBe("2 errors. Rate limited by Jira. The next sync continues where this one stopped.");
  });
});
```

```ts
// Servers/tests/integration/jira-incidents/run.test.ts
jest.setTimeout(60000);

import { cleanupDatabase, seedTwoOrgsAndUsers } from "../helpers";
import { JiraCloudMock } from "../../mocks/jiraCloud/server";
import { insertProject, rows, seedReadyConfig, withMock } from "./fixtures";
import { runJiraIncidentsSync } from "../../../extensions/jira-incidents/jiraIncidents.sync";
import { SYNC_PROVIDERS } from "../../../extensions/sync-engine/providers";
import type { RunContext } from "../../../extensions/sync-engine/types";

async function fakeContext(orgId: number, signal = new AbortController().signal): Promise<RunContext> {
  const [run] = await rows<{ id: number }>(
    `INSERT INTO extension_sync_runs (organization_id, extension_key, kind, status, run_token)
     VALUES (:orgId, 'jira-incidents', 'manual', 'started', 'tok') RETURNING id`, { orgId });
  return {
    orgId, runId: run.id, kind: "manual", payload: {}, triggeredBy: null, signal,
    heartbeat: async () => {}, sqlOwnsRun: () => "TRUE", assertOwned: async () => {},
    finalize: async () => {}, release: async () => {},
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
  afterEach(async () => { await mock.close(); await cleanupDatabase(); });

  it("is registered on the sync engine", () => {
    const provider = SYNC_PROVIDERS.find((p) => p.key === "jira-incidents");
    expect(provider).toMatchObject({ displayName: "Jira incidents", scheduledKind: "scheduled", runDeadlineMs: 600000 });
    expect(provider!.kinds).toEqual(["manual", "scheduled"]);
  });

  it("imports then syncs, and returns counts and a message", async () => {
    mock.addIssue({ summary: "First imported issue" });
    const result = await runJiraIncidentsSync(await fakeContext(orgA));
    expect(result.counts.imported).toBe(1);
    expect(result.message).toBe("Imported 1.");
    const events = await rows<{ run_id: number }>(`SELECT run_id FROM jira_incident_sync_events WHERE organization_id = :orgA`, { orgA });
    expect(events[0].run_id).not.toBeNull();
  });

  it("project access lost changes no link", async () => {
    const issue = mock.addIssue({ summary: "Will lose access" });
    await runJiraIncidentsSync(await fakeContext(orgA));
    const before = await rows(`SELECT * FROM jira_incident_links WHERE organization_id = :orgA`, { orgA });
    mock.state.projectReadable = false;
    mock.setStatus(issue.id, "3");
    await expect(runJiraIncidentsSync(await fakeContext(orgA))).rejects.toThrow("VerifyWise can no longer read Jira project SEC");
    expect(await rows(`SELECT * FROM jira_incident_links WHERE organization_id = :orgA`, { orgA })).toEqual(before);
  });

  it("fails with the token message on a 401", async () => {
    mock.state.token = "rotated";
    await expect(runJiraIncidentsSync(await fakeContext(orgA))).rejects.toThrow(/expired or been revoked/);
  });

  it("stops at the deadline and reports it", async () => {
    mock.addIssue({ summary: "Never imported" });
    const controller = new AbortController();
    controller.abort();
    const result = await runJiraIncidentsSync(await fakeContext(orgA, controller.signal));
    expect(result.message).toMatch(/time limit/);
  });

  it("returns a not-set-up message rather than failing when the config became incomplete", async () => {
    await rows(`UPDATE jira_incidents_config SET default_project_id = NULL WHERE organization_id = :orgA RETURNING id`, { orgA });
    const result = await runJiraIncidentsSync(await fakeContext(orgA));
    expect(result.message).toBe("Choose the use case for imported incidents");
  });
});
```

Check `RunContext` field names against `Servers/extensions/sync-engine/types.ts:40-58` before running; adjust the fake if a name differs. If `ctx.signal` is already aborted, `clientFor(config, ctx.signal)` makes every request abort; the deadline test relies on `runImport`'s `state.deadline.aborted` check firing before the first search — the project access check runs first, so in `runJiraIncidentsSync` check `ctx.signal.aborted` before `getProject` and return `{ counts, message: summarizeRun(counts, STOP_DEADLINE) }`.

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement** `jiraIncidents.sync.ts`, the provider:

```ts
// Servers/extensions/jira-incidents/jiraIncidents.syncProvider.ts
import type { SyncProvider } from "../sync-engine/types";
import { JIRA_INCIDENTS_KEY, JIRA_INCIDENTS_RUN_KINDS, RUN_DEADLINE_MS } from "./jiraIncidents.constants";
import { jiraIncidentsReadiness } from "./jiraIncidents.config";
import { runJiraIncidentsSync } from "./jiraIncidents.sync";

/** Jira incidents on the sync engine: import new issues, then sync status both ways. */
export const jiraIncidentsSyncProvider: SyncProvider = {
  key: JIRA_INCIDENTS_KEY,
  displayName: "Jira incidents",
  kinds: JIRA_INCIDENTS_RUN_KINDS,
  scheduledKind: "scheduled",
  runDeadlineMs: RUN_DEADLINE_MS,
  readiness: jiraIncidentsReadiness,
  run: runJiraIncidentsSync,
};
```

and register it: `export const SYNC_PROVIDERS: SyncProvider[] = [jiraAssetsSyncProvider, jiraIncidentsSyncProvider];`.

- [ ] **Step 4: Run tests** — PASS. Also `cd Servers && npx jest extensions/sync-engine` (registry tests must accept a second provider).

- [ ] **Step 5: Commit**

```bash
git add Servers/extensions/ Servers/tests/integration/jira-incidents/run.test.ts
git commit -m "feat(jira-incidents): run imports and status sync on the sync engine" -m "Each run checks readiness, confirms the service account can still read the project (so lost access never marks issues deleted), imports, then syncs status, and returns counts with a plain summary. A 401 or lost project access fails the run so the engine's backoff applies; a rate limit or the deadline ends it early but successfully."
```

---

## Task 11: Routes, controller, connection test dispatch, API docs

**Files:**
- Create: `Servers/extensions/jira-incidents/jiraIncidents.ctrl.ts`, `jiraIncidents.route.ts`
- Modify: `Servers/app.ts:46-47` (import), `:338-339` (mount after `jira-assets`)
- Modify: `Servers/controllers/extension.ctrl.ts:299-336` (`TEST_CONNECTION_DISPATCH`)
- Modify: `Servers/swagger.yaml`, `docs/api-docs/src/config/endpoints.ts` (generated)
- Test: `Servers/tests/integration/jira-incidents/routes.test.ts`

**Interfaces:**
- Consumes: Tasks 4, 6, 7.
- Produces routes under `/api/extensions/jira-incidents` (§9), responses in `STATUS_CODE[n](data)` envelopes:
  - `GET /config` → `ConfigView`
  - `PUT /config` → `ConfigView`; `JiraIncidentsValidationError` → 400 with its message
  - `GET /jira/projects` → `[{ id, key, name }]`
  - `GET /jira/issue-types?project=` → `[{ id, name }]`
  - `GET /jira/statuses?project=&issue_type=` → `{ statuses: JiraStatus[], default_map_in: StatusMapIn, default_map_out: StatusMapOut }`
  - `GET /jira/priorities` → `{ priorities: JiraPriority[], default_severity_map: SeverityMap }`
  - `GET /jira/labels?query=` → `string[]`
  - `GET /events?limit=` → events (default 50, max 200; non-integer or < 1 → 400)
  - `GET /links?incident_ids=1,2` → `[{ incident_id, jira_issue_key, jira_url, state, state_reason }]`; ids parsed as positive integers, max 500, invalid → 400; returns `[]` when the extension is disabled for the organization
- Picker routes need a saved connection: no config or no token → 400 "Connect to Jira first". Jira errors → 502 with the error's message (`JiraAuthError` 401 included; it is Jira's answer, not the caller's auth).

- [ ] **Step 1: Write the failing route tests**

```ts
// Servers/tests/integration/jira-incidents/routes.test.ts
jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { buildTenantContext } from "../tenant-isolation/tenantIsolation.harness";
import { JiraCloudMock } from "../../mocks/jiraCloud/server";
import { enableExtension, insertProject, seedReadyConfig, withMock, rows } from "./fixtures";

describe("jira incidents routes", () => {
  let mock: JiraCloudMock;
  beforeEach(async () => { mock = await withMock(); });
  afterEach(async () => { await mock.close(); await cleanupDatabase(); });

  it("is Admin only, except the links read", async () => {
    const editor = await buildTenantContext(3);
    await enableExtension(editor.orgId, editor.userId);
    for (const path of ["/config", "/jira/projects", "/events"]) {
      expect((await editor.request.get(`/api/extensions/jira-incidents${path}`)).status).toBe(403);
    }
    expect((await editor.request.put("/api/extensions/jira-incidents/config").send({})).status).toBe(403);
    const links = await editor.request.get("/api/extensions/jira-incidents/links?incident_ids=1");
    expect(links.status).toBe(200);
    expect(links.body.data).toEqual([]);
  });

  it("returns no links when the extension is disabled", async () => {
    const admin = await buildTenantContext(1);
    const res = await admin.request.get("/api/extensions/jira-incidents/links?incident_ids=1");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect((await admin.request.get("/api/extensions/jira-incidents/config")).status).toBe(403);
  });

  it("validates links and events parameters", async () => {
    const admin = await buildTenantContext(1);
    await enableExtension(admin.orgId, admin.userId);
    expect((await admin.request.get("/api/extensions/jira-incidents/links?incident_ids=1,x")).status).toBe(400);
    expect((await admin.request.get("/api/extensions/jira-incidents/events?limit=0")).status).toBe(400);
    expect((await admin.request.get("/api/extensions/jira-incidents/events?limit=500")).status).toBe(400);
  });

  it("saves config, returns no token, and serves pickers with defaults", async () => {
    const admin = await buildTenantContext(1);
    await enableExtension(admin.orgId, admin.userId);
    expect((await admin.request.get("/api/extensions/jira-incidents/jira/projects")).status).toBe(400);
    const put = await admin.request.put("/api/extensions/jira-incidents/config")
      .send({ site_url: mock.url, email: "svc@acme.test", api_token: "token-1" });
    expect(put.status).toBe(200);
    expect(put.body.data.has_api_token).toBe(true);
    expect(JSON.stringify(put.body)).not.toContain("token-1");

    const statuses = await admin.request.get("/api/extensions/jira-incidents/jira/statuses?project=10000&issue_type=10001");
    expect(statuses.body.data.default_map_out).toMatchObject({ Open: "1", Mitigated: null });
    const priorities = await admin.request.get("/api/extensions/jira-incidents/jira/priorities");
    expect(priorities.body.data.default_severity_map).toEqual({ "2": "Very serious", "3": "Serious", "4": "Minor" });
    const bad = await admin.request.put("/api/extensions/jira-incidents/config").send({ site_url: "https://evil.com" });
    expect(bad.status).toBe(400);
  });

  it("runs the connection test through the generic route", async () => {
    const admin = await buildTenantContext(1);
    await enableExtension(admin.orgId, admin.userId);
    const res = await admin.request.post("/api/extensions/jira-incidents/test-connection")
      .send({ site_url: mock.url, email: "svc@acme.test", api_token: "token-1", project_id: "10000" });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain("Connected to Jira as svc-1.");
  });

  it("returns links for the caller's incidents only", async () => {
    const admin = await buildTenantContext(1);
    await enableExtension(admin.orgId, admin.userId);
    await seedReadyConfig(admin.orgId, await insertProject(admin.orgId, admin.userId), mock);
    mock.addIssue({ summary: "Linked issue here" });
    const { runImport } = await import("../../../extensions/jira-incidents/jiraIncidents.import");
    const { loadConfig, clientFor } = await import("../../../extensions/jira-incidents/jiraIncidents.config");
    const { newCounts } = await import("../../../extensions/jira-incidents/jiraIncidents.run");
    const config = (await loadConfig(admin.orgId))!;
    await runImport({ orgId: admin.orgId, runId: null, startedAt: new Date(), config, client: clientFor(config),
      counts: newCounts(), stopReason: null, heartbeat: async () => {}, deadline: new AbortController().signal, warnedNoFrontendUrl: false });
    const [incident] = await rows<{ id: number }>(`SELECT id FROM ai_incident_managements WHERE organization_id = :o`, { o: admin.orgId });
    const res = await admin.request.get(`/api/extensions/jira-incidents/links?incident_ids=${incident.id}`);
    expect(res.body.data).toEqual([{ incident_id: incident.id, jira_issue_key: "SEC-1", jira_url: `${mock.url}/browse/SEC-1`, state: "ok", state_reason: null }]);
    const events = await admin.request.get("/api/extensions/jira-incidents/events");
    expect(events.body.data[0]).toMatchObject({ kind: "imported", jira_issue_key: "SEC-1", incident_id: incident.id });
  });
});
```

Check how the generic test-connection controller wraps the runner result (`STATUS_CODE[200](result)` or a different envelope) and adapt the assertion's path into `res.body`; the `toContain` on the serialised body keeps it robust.

- [ ] **Step 2: Run to verify failure** → FAIL (404s).

- [ ] **Step 3: Implement**

Route file:

```ts
// Servers/extensions/jira-incidents/jiraIncidents.route.ts
import express from "express";
import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";
import { requireExtensionEnabled } from "../../middleware/requireExtensionEnabled.middleware";
import {
  getConfigCtrl, getEventsCtrl, getIssueTypesCtrl, getLabelsCtrl, getLinksCtrl,
  getPrioritiesCtrl, getProjectsCtrl, getStatusesCtrl, putConfigCtrl,
} from "./jiraIncidents.ctrl";

const router = express.Router();
router.use(authenticateJWT);

// The chips on incidents: any member who can see incidents, and an empty list
// (not 403) when the extension is off. Registered before the extension gate.
router.get("/links", getLinksCtrl);

router.use(requireExtensionEnabled("jira-incidents"));
// Everything else holds connection details and mappings: Admin only, reads included.
// POST /test-connection is served by the generic /api/extensions/:key/test-connection
// route (controllers/extension.ctrl.ts TEST_CONNECTION_DISPATCH); a route here
// would be shadowed by the catalog router mounted first in app.ts.
const admin = authorize("extension.admin");
router.get("/config", admin, getConfigCtrl);
router.put("/config", admin, putConfigCtrl);
router.get("/jira/projects", admin, getProjectsCtrl);
router.get("/jira/issue-types", admin, getIssueTypesCtrl);
router.get("/jira/statuses", admin, getStatusesCtrl);
router.get("/jira/priorities", admin, getPrioritiesCtrl);
router.get("/jira/labels", admin, getLabelsCtrl);
router.get("/events", admin, getEventsCtrl);

export default router;
```

Controller: thin; follow `jiraAssets.ctrl.ts` for logging (`logStructured`) and envelopes. `getLinksCtrl` checks enablement itself with the same models the gate uses:

```ts
const extension = await ExtensionModel.findByKey(JIRA_INCIDENTS_KEY);
const enablement = extension ? await ExtensionEnablementModel.findByExtensionId(extension.id, orgId) : null;
if (!enablement?.enabled) return res.status(200).json(STATUS_CODE[200]([]));
```

`getStatusesCtrl` validates `project` and `issue_type` as numeric (400 otherwise) and returns `{ statuses, default_map_in: defaultStatusMapIn(statuses), default_map_out: defaultStatusMapOut(statuses) }`. Error mapping helper used by every controller: `JiraIncidentsValidationError` → 400; `JiraHttpError`/`JiraUnreachableError`/`JiraRateLimitError` → 502 with `err.message` (rate limit: "Rate limited by Jira. Try again in a minute."); anything else → 500 via `translateError`.

`app.ts`: `import jiraIncidentsExtensionRoutes from "./extensions/jira-incidents/jiraIncidents.route";` and `app.use("/api/extensions/jira-incidents", jiraIncidentsExtensionRoutes);` right after the `jira-assets` mount. Also call `warnIfLocalOverrideIgnored(process.env, (m) => logger.warn(m))` once at startup next to the other startup checks in `app.ts` (find where the app logs its boot config; put it there).

`extension.ctrl.ts` dispatch entry:

```ts
  // Jira incidents keeps its connection in jira_incidents_config; the runner
  // overlays the submitted fields on the stored ones and never throws.
  "jira-incidents": (submitted, organizationId) => jiraIncidentsTestConnection(organizationId, submitted),
```

with `import { testConnection as jiraIncidentsTestConnection } from "../extensions/jira-incidents/jiraIncidents.config";`.

- [ ] **Step 4: Run tests** — PASS.

- [ ] **Step 5: Regenerate API docs**

```bash
cd Servers && npm run generate:swagger && npm run generate:endpoints && npm run check:api-drift
```

Add a one-line `description` to each new `swagger.yaml` entry (Admin only, except `/links`). Expected: drift check clean.

- [ ] **Step 6: Commit**

```bash
git add Servers/extensions/jira-incidents/ Servers/app.ts Servers/controllers/extension.ctrl.ts \
  Servers/swagger.yaml docs/api-docs/src/config/endpoints.ts Servers/tests/integration/jira-incidents/routes.test.ts
git commit -m "feat(jira-incidents): add the settings, picker, activity and links API" -m "Admin-only config, Jira pickers (statuses and priorities come with their default mappings), and sync activity. The links read behind the incident chips is open to any member and returns nothing when the extension is off. The connection test is a TEST_CONNECTION_DISPATCH entry because a per-extension route would be shadowed by the catalog router."
```

---

## Task 12: Tenant isolation coverage

**Files:**
- Create: `Servers/tests/integration/tenant-isolation/jiraIncidents.isolation.test.ts`
- Modify: `Servers/tests/integration/tenant-isolation/tenantIsolation.registry.ts` (after the `extension_sync` entry, ~line 155)
- Modify: `Servers/scripts/auditTenantIsolationCoverage.ts` (move the three tables out of the deferred list if the registry entry makes them covered — follow what the script expects for a registered hand-written file)

**Interfaces:**
- Consumes: fixtures (Task 7), routes (Task 11), `seedTwoTenantContexts`.

- [ ] **Step 1: Write the isolation test**

```ts
// Servers/tests/integration/tenant-isolation/jiraIncidents.isolation.test.ts
jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { enableExtension, insertProject, rows, seedReadyConfig, withMock } from "../jira-incidents/fixtures";
import { clientFor, loadConfig, saveConfig } from "../../../extensions/jira-incidents/jiraIncidents.config";
import { runImport } from "../../../extensions/jira-incidents/jiraIncidents.import";
import { newCounts } from "../../../extensions/jira-incidents/jiraIncidents.run";

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
      await runImport({ orgId: owner.orgId, runId: null, startedAt: new Date(), config, client: clientFor(config),
        counts: newCounts(), stopReason: null, heartbeat: async () => {}, deadline: new AbortController().signal, warnedNoFrontendUrl: false });
      const [incident] = await rows<{ id: number }>(`SELECT id FROM ai_incident_managements WHERE organization_id = :o`, { o: owner.orgId });

      const cfg = await attacker.request.get("/api/extensions/jira-incidents/config");
      expect(cfg.body.data).toMatchObject({ configured: false, site_url: null, has_api_token: false });
      const events = await attacker.request.get("/api/extensions/jira-incidents/events");
      expect(events.body.data).toEqual([]);
      const links = await attacker.request.get(`/api/extensions/jira-incidents/links?incident_ids=${incident.id}`);
      expect(links.body.data).toEqual([]);

      await attacker.request.put("/api/extensions/jira-incidents/config").send({ default_reporter: "Attacker" });
      expect((await loadConfig(owner.orgId))!.defaultReporter).toBe("Jira sync");

      // A config pointing at the owner's use case is refused.
      const [project] = await rows<{ id: number }>(`SELECT id FROM projects WHERE organization_id = :o`, { o: owner.orgId });
      await expect(saveConfig(attacker.orgId, attacker.userId, { default_project_id: project.id })).rejects.toThrow(/use case/);
    } finally {
      await mock.close();
    }
  });
});
```

- [ ] **Step 2: Register it**

```ts
  {
    // Jira incidents extension. Routes are keyed by the caller's organization
    // (/api/extensions/jira-incidents/…), not by row id, so a hand-written file covers them.
    name: "jira_incidents",
    tables: ["jira_incidents_config", "jira_incident_links", "jira_incident_sync_events"],
    baseRoute: "/api/extensions/jira-incidents",
    testFile: "jiraIncidents.isolation.test.ts",
  },
```

- [ ] **Step 3: Run**

```bash
cd Servers && npx jest --config jest.config.js --globalSetup="<rootDir>/tests/integration/globalSetup.js" --runInBand tests/integration/tenant-isolation/jiraIncidents.isolation.test.ts tests/integration/tenant-isolation/tenantIsolation.coverage.test.ts
npx ts-node --transpile-only scripts/auditTenantIsolationCoverage.ts
```

Expected: PASS and the audit reports the three tables covered (or deferred with the Task 1 justification, if the script requires one or the other — not both; resolve whichever it reports as a conflict).

- [ ] **Step 4: Commit**

```bash
git add Servers/tests/integration/tenant-isolation/ Servers/scripts/auditTenantIsolationCoverage.ts
git commit -m "test(jira-incidents): cover tenant isolation for the extension tables and routes" -m "Another organization sees an empty config, no events and no links, cannot change the owner's config, and cannot point its own config at the owner's use case."
```

---

## Task 13: Client repository, run description and form state

**Files:**
- Create: `Clients/src/application/repository/jiraIncidents.repository.ts`
- Create: `Clients/src/presentation/pages/Extensions/jira-incidents/runOutcome.ts`
- Create: `Clients/src/presentation/pages/Extensions/jira-incidents/formState.ts`
- Test: `Clients/src/presentation/pages/Extensions/jira-incidents/runOutcome.test.ts`, `formState.test.ts`

**Interfaces:**
- Produces (repository; all via `apiServices`, paths without the `/api` prefix like `jiraAssets`' `"/extensions/jira-assets/config"`):

```ts
export type LinkState = "ok" | "error" | "conflict" | "deleted_in_jira" | "deleted_in_verifywise";
export interface JiraIncidentsConfigView { /* mirror of server ConfigView, snake_case */ }
export interface JiraIncidentsConfigInput { /* mirror of server ConfigInput */ }
export interface JiraStatusOption { id: string; name: string; categoryKey: string }
export interface JiraIncidentLink { incident_id: number; jira_issue_key: string; jira_url: string; state: LinkState; state_reason: string | null }
export interface JiraIncidentEvent { id: number; kind: string; detail: Record<string, unknown>; created_at: string; incident_id: number | null; incident_code: string | null; jira_issue_key: string | null; jira_url: string | null }
export const getJiraIncidentsConfig: () => Promise<JiraIncidentsConfigView>;
export const saveJiraIncidentsConfig: (input: JiraIncidentsConfigInput) => Promise<JiraIncidentsConfigView>;
export const testJiraIncidentsConnection: (input: { site_url?: string; email?: string; api_token?: string; project_id?: string }) => Promise<{ success: boolean; message: string }>;
export const getJiraProjects: () => Promise<Array<{ id: string; key: string; name: string }>>;
export const getJiraIssueTypes: (projectId: string) => Promise<Array<{ id: string; name: string }>>;
export const getJiraStatuses: (projectId: string, issueTypeId: string) => Promise<{ statuses: JiraStatusOption[]; default_map_in: Record<string, string>; default_map_out: Record<string, string | null> }>;
export const getJiraPriorities: () => Promise<{ priorities: Array<{ id: string; name: string }>; default_severity_map: Record<string, string> }>;
export const getJiraLabels: (query: string) => Promise<string[]>;
export const getJiraIncidentEvents: (limit?: number) => Promise<JiraIncidentEvent[]>;
export const getJiraIncidentLinks: (incidentIds: number[]) => Promise<JiraIncidentLink[]>;  // [] for an empty list, no request
```

- Produces (`runOutcome.ts`): `describeJiraIncidentsRun(run: ExtensionRun): string` — "Sync completed: imported 2, 1 status from Jira, 1 conflict" (non-zero counts in the server's order; all zero → "Sync completed: no changes").
- Produces (`formState.ts`):

```ts
export const VW_STATUSES = ["Open", "Investigating", "Mitigated", "Closed", "Suspended", "Emergency action"] as const;
export const SEVERITIES = ["Minor", "Serious", "Very serious"] as const;
export const INCIDENT_TYPES = ["Malfunction", "Unexpected behavior", "Model drift", "Misuse", "Data corruption", "Security breach", "Performance degradation"] as const;
export const DONT_CHANGE_JIRA = "__dont_change__";
export interface FormState {
  site_url: string; email: string; api_token: string;
  project_id: string; project_key: string; issue_type_id: string; label: string;
  status_map_in: Record<string, string>; status_map_out: Record<string, string | null>; severity_map: Record<string, string>;
  default_project_id: number | ""; default_type: string; default_reporter: string;
}
export function fromView(view: JiraIncidentsConfigView): FormState;
export function withStatusDefaults(form: FormState, defaults: { default_map_in: Record<string, string>; default_map_out: Record<string, string | null> }, statusIds: string[]): FormState;
export function withSeverityDefaults(form: FormState, defaults: Record<string, string>, priorityIds: string[]): FormState;
export function validateForm(form: FormState, opts: { hasStoredToken: boolean; storedSiteUrl: string | null; storedEmail: string | null; statusIds: string[] }): Record<string, string>;
export function toInput(form: FormState): JiraIncidentsConfigInput;   // omits api_token when empty
```

`withStatusDefaults` keeps any saved mapping whose key is still a current status, fills the rest from defaults, and drops keys for statuses no longer in the workflow; `status_map_out` keeps saved values for the six statuses when they point at a current status (or null), else the default. Same rule for severities. `validateForm` errors (field → message): `site_url` "Enter your Jira site URL" when empty; `email` "Enter the service account email" when not matching `/^[^\s@]+@[^\s@]+$/`; `api_token` "Enter the API token" when no stored token, or "Enter the API token again after changing the site URL or email" when site/email differ from stored; `project_id` "Choose a project"; `issue_type_id` "Choose an issue type"; `status_map_in` "Map every Jira status" when any `statusIds` lacks a value; `default_project_id` "Choose a use case"; `default_type` "Choose an incident type"; `default_reporter` "Enter the reporter" (trimmed, ≤ 255).

- [ ] **Step 1: Write the failing tests**

```ts
// Clients/src/presentation/pages/Extensions/jira-incidents/runOutcome.test.ts
import { describe, expect, it } from "vitest";
import { describeJiraIncidentsRun } from "./runOutcome";

const run = (counts: Record<string, number>) =>
  ({ id: 1, kind: "manual", status: "completed", code: null, counts, message: null, started_at: "", completed_at: "", is_live: false }) as const;

describe("describeJiraIncidentsRun", () => {
  it("lists non-zero counts in order", () => {
    expect(describeJiraIncidentsRun(run({ imported: 2, status_from_jira: 1, conflicts: 1, errors: 0 }))).toBe(
      "Sync completed: imported 2, 1 status from Jira, 1 conflict",
    );
  });
  it("says no changes", () => {
    expect(describeJiraIncidentsRun(run({}))).toBe("Sync completed: no changes");
  });
  it("pluralises", () => {
    expect(describeJiraIncidentsRun(run({ status_to_jira: 2, errors: 3, deleted_in_jira: 2 }))).toBe(
      "Sync completed: 2 statuses to Jira, 3 errors, 2 deleted in Jira",
    );
  });
});
```

```ts
// Clients/src/presentation/pages/Extensions/jira-incidents/formState.test.ts
import { describe, expect, it } from "vitest";
import { DONT_CHANGE_JIRA, fromView, toInput, validateForm, withSeverityDefaults, withStatusDefaults } from "./formState";

const view = {
  configured: true, site_url: "https://acme.atlassian.net", email: "svc@acme.co", has_api_token: true,
  service_account_id: "svc-1", service_account_time_zone: "UTC", project_id: "10000", project_key: "SEC",
  issue_type_id: "10001", label: null, status_map_in: { "1": "Open", "99": "Closed" }, status_map_out: { Open: "1" },
  severity_map: {}, default_project_id: 7, default_type: "Malfunction", default_reporter: "Jira sync",
  import_from: null, last_checked_at: null, readiness: { ready: false, reason: "x" },
};
const defaults = {
  default_map_in: { "1": "Open", "3": "Investigating", "4": "Closed" },
  default_map_out: { Open: "1", Investigating: "3", Closed: "4", Mitigated: null, Suspended: null, "Emergency action": null },
};

describe("formState", () => {
  it("keeps saved mappings for current statuses, fills the rest, drops removed ones", () => {
    const form = withStatusDefaults(fromView(view as any), defaults, ["1", "3", "4"]);
    expect(form.status_map_in).toEqual({ "1": "Open", "3": "Investigating", "4": "Closed" });
    expect(form.status_map_out.Mitigated).toBeNull();
  });
  it("fills severity defaults", () => {
    expect(withSeverityDefaults(fromView(view as any), { "2": "Very serious" }, ["2"]).severity_map).toEqual({ "2": "Very serious" });
  });
  it("requires the token again after the site URL changes", () => {
    const form = { ...fromView(view as any), site_url: "https://other.atlassian.net" };
    const errors = validateForm(form, { hasStoredToken: true, storedSiteUrl: view.site_url, storedEmail: view.email, statusIds: ["1"] });
    expect(errors.api_token).toBe("Enter the API token again after changing the site URL or email");
  });
  it("asks for every Jira status to be mapped", () => {
    const form = fromView(view as any);
    expect(validateForm(form, { hasStoredToken: true, storedSiteUrl: view.site_url, storedEmail: view.email, statusIds: ["1", "3"] }).status_map_in)
      .toBe("Map every Jira status");
  });
  it("omits an empty token and turns Don't change Jira into null", () => {
    const form = { ...fromView(view as any), status_map_out: { Open: "1", Mitigated: DONT_CHANGE_JIRA as any } };
    const input = toInput(form);
    expect(input).not.toHaveProperty("api_token");
    expect(input.status_map_out).toEqual({ Open: "1", Mitigated: null });
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd Clients && npx vitest run src/presentation/pages/Extensions/jira-incidents` → FAIL.

- [ ] **Step 3: Implement** the three files per **Interfaces**. `toInput` maps `DONT_CHANGE_JIRA` → `null`, `label: ""` → `null`, `default_project_id: ""` → omitted. `fromView` maps `null` values to `""` (and `null` `status_map_out` values to `DONT_CHANGE_JIRA` for the select).

- [ ] **Step 4: Run tests** — PASS. `cd Clients && npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add Clients/src/application/repository/jiraIncidents.repository.ts Clients/src/presentation/pages/Extensions/jira-incidents/
git commit -m "feat(jira-incidents): add the client repository and settings form state" -m "Typed calls for config, pickers, activity and links; the sync panel's run description; and pure form state that merges saved mappings with the server's defaults, validates the settings, and requires the token again after the site URL or email changes."
```

---

## Task 14: Settings page

**Files:**
- Create: `Clients/src/presentation/pages/Extensions/jira-incidents/JiraIncidentsConfiguration.tsx`
- Create: `.../jira-incidents/MappingTable.tsx`, `.../jira-incidents/SyncActivity.tsx`
- Modify: `Clients/src/presentation/pages/Extensions/index.tsx:48`, `Clients/src/presentation/pages/Extensions/Settings/index.tsx:22,322`
- Test: `.../jira-incidents/JiraIncidentsConfiguration.test.tsx`

**Interfaces:**
- Consumes: Task 13; `ExtensionSyncPanel` props (`extensionKey`, `canManage`, `showSyncNow`, `persistSchedule`, `describeCompletedRun`, `onRunCompleted`, `scheduleDescription`, `scheduleHelp`); `useAuth`; `getAllProjects` (`application/repository/project.repository.ts`); `VWField`, `VWSelect` (`items: { _id, name }[]`, `onChange(e)` with `e.target.value`), `CustomizableButton` (`text=`), `useFormattedDate`.
- Produces: `export function JiraIncidentsConfiguration(): JSX.Element` (named export, like `JiraAssetsConfiguration`) and a default export.

Layout (§8.1), one column, sections separated by `Divider`, each with a sentence-case `Typography variant="h6"` heading; section bodies use `Stack` with `gap: "16px"`:

1. Help text (three sentences from §8.1) in an `Alert severity="info"`.
2. **Connection:** `VWField` site URL (placeholder `https://your-company.atlassian.net`), email, API token (`type="password"`, placeholder "Stored. Enter a new token to replace it" when `has_api_token`); help caption "Create a classic API token for the service account at id.atlassian.com. Scoped tokens aren't supported." `CustomizableButton` "Test connection" (30px) showing the result in an `Alert` (success/error).
3. **Which issues to import:** `VWSelect` project (loaded after a saved connection), issue type (after project), label `VWField` with a suggestion list (debounced 300ms `getJiraLabels`, shown as clickable `Chip`s under the field, max 10).
4. **Status mapping:** two `MappingTable`s — "Jira to VerifyWise" (row per Jira status → `VWSelect` of the six VW statuses) and "VerifyWise to Jira" (row per VW status → `VWSelect` of Jira statuses plus "Don't change Jira").
5. **Severity mapping:** `MappingTable` of priorities → Minor / Serious / Very serious.
6. **Defaults:** `VWSelect` use case (from `getAllProjects()`, `_id: id`, `name: project_title`), incident type, `VWField` reporter.
7. `CustomizableButton` "Save" (disabled while saving), with field errors from `validateForm` under each control; the server's 400 message in an error `Alert`.
8. **Sync:** `<ExtensionSyncPanel extensionKey="jira-incidents" canManage={isAdmin && configLoaded} showSyncNow={view.readiness.ready} persistSchedule={view.readiness.ready} describeCompletedRun={describeJiraIncidentsRun} onRunCompleted={reloadActivity} scheduleDescription="Import new Jira issues and sync status on a schedule" scheduleHelp="Each sync imports issues created since the last one, then syncs status both ways." />`. Above it, when not ready, a caption with `view.readiness.reason`.
9. **Sync activity:** `SyncActivity` — table (Time, Event, Incident, Jira issue, Details) of `getJiraIncidentEvents(50)`; event labels: imported "Imported", status_from_jira "Status from Jira", status_to_jira "Status to Jira", conflict "Conflict", error "Error", deleted_in_jira "Deleted in Jira"; incident cell links to `/ai-incident-managements?incidentId=<id>`; Jira cell links to `jira_url` in a new tab with `rel="noopener noreferrer"`; details render `detail.reason`, or `from → to`, or for conflicts "Kept <applied>; <loser> was overwritten". Empty state: "No sync activity yet".

When the project or issue type changes, call `getJiraStatuses` and apply `withStatusDefaults`; on load with a saved project/issue type, do the same (so a status added in Jira since the last save shows up unmapped-then-defaulted, and the admin must save to accept it). Load priorities after a saved connection and apply `withSeverityDefaults`.

Admin-only: `const { userRoleName } = useAuth(); if (userRoleName !== "Admin") return null;` (the Settings page already redirects non-Admins; this keeps the component safe if reused).

Extension wiring: `KEYS_WITH_POST_ENABLE_UI = new Set(["slack", "model-lifecycle", "jira-assets", "jira-incidents"])`; in `Settings/index.tsx` import `{ JiraIncidentsConfiguration }` and render `{extension.enabled && extension.key === "jira-incidents" && <JiraIncidentsConfiguration />}` next to the Jira Assets line.

- [ ] **Step 1: Write the failing component test**

```tsx
// Clients/src/presentation/pages/Extensions/jira-incidents/JiraIncidentsConfiguration.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material";
import { light } from "../../../themes";

const panelProps = vi.fn();
vi.mock("../../../components/ExtensionSyncPanel", () => ({
  default: (props: Record<string, unknown>) => { panelProps(props); return <div data-testid="shared-sync-panel" />; },
}));
vi.mock("../../../../application/hooks/useAuth", () => ({ useAuth: () => ({ userRoleName: "Admin" }) }));
vi.mock("../../../../application/hooks/useFormattedDate", () => ({ default: () => () => "14-10-2026" }));
vi.mock("../../../../application/repository/project.repository", () => ({
  getAllProjects: vi.fn().mockResolvedValue({ data: [{ id: 7, project_title: "Fraud model" }] }),
}));
const repo = vi.hoisted(() => ({
  getJiraIncidentsConfig: vi.fn(), saveJiraIncidentsConfig: vi.fn(), testJiraIncidentsConnection: vi.fn(),
  getJiraProjects: vi.fn(), getJiraIssueTypes: vi.fn(), getJiraStatuses: vi.fn(), getJiraPriorities: vi.fn(),
  getJiraLabels: vi.fn(), getJiraIncidentEvents: vi.fn(), getJiraIncidentLinks: vi.fn(),
}));
vi.mock("../../../../application/repository/jiraIncidents.repository", () => repo);

import { JiraIncidentsConfiguration } from "./JiraIncidentsConfiguration";

const SAVED = {
  configured: true, site_url: "https://acme.atlassian.net", email: "svc@acme.co", has_api_token: true,
  service_account_id: "svc-1", service_account_time_zone: "UTC", project_id: "10000", project_key: "SEC",
  issue_type_id: "10001", label: null, status_map_in: {}, status_map_out: {}, severity_map: {},
  default_project_id: 7, default_type: "Malfunction", default_reporter: "Jira sync",
  import_from: null, last_checked_at: null, readiness: { ready: false, reason: "Map Jira statuses to VerifyWise statuses" },
};

const renderPage = () => render(<ThemeProvider theme={light}><JiraIncidentsConfiguration /></ThemeProvider>);

describe("JiraIncidentsConfiguration", () => {
  beforeEach(() => {
    Object.values(repo).forEach((fn) => fn.mockReset());
    panelProps.mockReset();
    repo.getJiraIncidentsConfig.mockResolvedValue(SAVED);
    repo.getJiraProjects.mockResolvedValue([{ id: "10000", key: "SEC", name: "Security" }]);
    repo.getJiraIssueTypes.mockResolvedValue([{ id: "10001", name: "Incident" }]);
    repo.getJiraStatuses.mockResolvedValue({
      statuses: [{ id: "1", name: "To Do", categoryKey: "new" }, { id: "4", name: "Done", categoryKey: "done" }],
      default_map_in: { "1": "Open", "4": "Closed" },
      default_map_out: { Open: "1", Investigating: null, Closed: "4", Mitigated: null, Suspended: null, "Emergency action": null },
    });
    repo.getJiraPriorities.mockResolvedValue({ priorities: [{ id: "2", name: "High" }], default_severity_map: { "2": "Very serious" } });
    repo.getJiraIncidentEvents.mockResolvedValue([]);
    repo.getJiraLabels.mockResolvedValue([]);
  });

  it("shows the help text and the readiness reason", async () => {
    renderPage();
    expect(await screen.findByText(/Only issues created in Jira after this is set up are imported/)).toBeInTheDocument();
    expect(await screen.findByText("Map Jira statuses to VerifyWise statuses")).toBeInTheDocument();
  });

  it("prefills mappings from the server's defaults and saves them without a token", async () => {
    repo.saveJiraIncidentsConfig.mockResolvedValue({ ...SAVED, readiness: { ready: true, reason: null } });
    renderPage();
    await screen.findByText("To Do");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(repo.saveJiraIncidentsConfig).toHaveBeenCalled());
    const input = repo.saveJiraIncidentsConfig.mock.calls[0][0];
    expect(input).not.toHaveProperty("api_token");
    expect(input.status_map_in).toEqual({ "1": "Open", "4": "Closed" });
    expect(input.status_map_out).toMatchObject({ Open: "1", Mitigated: null });
    expect(input.severity_map).toEqual({ "2": "Very serious" });
  });

  it("blocks save and asks for the token after the site URL changes", async () => {
    renderPage();
    const site = await screen.findByDisplayValue("https://acme.atlassian.net");
    fireEvent.change(site, { target: { value: "https://other.atlassian.net" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter the API token again after changing the site URL or email")).toBeInTheDocument();
    expect(repo.saveJiraIncidentsConfig).not.toHaveBeenCalled();
  });

  it("wires the shared sync panel", async () => {
    renderPage();
    await waitFor(() => expect(panelProps).toHaveBeenCalled());
    const props = panelProps.mock.calls.at(-1)![0];
    expect(props).toMatchObject({ extensionKey: "jira-incidents", showSyncNow: false });
    expect(props.describeCompletedRun({ counts: { imported: 1 } })).toBe("Sync completed: imported 1");
  });

  it("shows the empty activity state", async () => {
    renderPage();
    expect(await screen.findByText("No sync activity yet")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL, module not found.

- [ ] **Step 3: Implement** the page, `MappingTable` (props: `rows: { key: string; label: string }[]`, `options: { _id: string; name: string }[]`, `value: Record<string, string>`, `onChange(key, value)`, `idPrefix`, `error?`), `SyncActivity`, and the two wiring edits. Use `gap: "16px"` / `p: "16px"` strings, theme colours, 30px buttons (`sx={{ height: 30, minHeight: 30 }}` as Jira Assets' `CONTROL_HEIGHT_SX`).

- [ ] **Step 4: Run** — `cd Clients && npx vitest run src/presentation/pages/Extensions && npm run typecheck && npm run lint -- --quiet` → PASS.

- [ ] **Step 5: Commit**

```bash
git add Clients/src/presentation/pages/Extensions/
git commit -m "feat(jira-incidents): add the extension settings page" -m "Connection with a connection test, issue selection with label suggestions, both status mapping tables and the severity mapping prefilled from Jira's categories and priorities, defaults, the shared sync panel with its own run description, and the latest sync activity linking to incidents and issues."
```

---

## Task 15: Jira chip on incidents

**Files:**
- Create: `Clients/src/presentation/components/JiraIssueChip/index.tsx`
- Create: `Clients/src/application/hooks/useJiraIncidentLinks.ts`
- Modify: `Clients/src/presentation/pages/IncidentManagement/IncidentTable.tsx:181-191` (incident ID cell), `IncidentTable` props (`Clients/src/presentation/types/interfaces/i.table.ts`, `IncidentTableProps`)
- Modify: `Clients/src/presentation/pages/IncidentManagement/index.tsx` (fetch links, pass to table and modal)
- Modify: `Clients/src/presentation/components/Modals/NewIncident/index.tsx:536-550` (header, edit mode)
- Test: `Clients/src/presentation/components/JiraIssueChip/JiraIssueChip.test.tsx`, `Clients/src/application/hooks/useJiraIncidentLinks.test.ts`

**Interfaces:**
- Consumes: `getJiraIncidentLinks`, `JiraIncidentLink` (Task 13); `useExtensions` from `Clients/src/application/contexts/Extensions.context.tsx` (`isEnabled(key)`); `VWTooltip` (`content`, children).
- Produces:

```ts
export function useJiraIncidentLinks(incidentIds: number[]): Map<number, JiraIncidentLink>;  // empty when disabled or on error
export default function JiraIssueChip(props: { link: JiraIncidentLink }): JSX.Element;
```

Chip: an `<a>` styled as a small chip (height 22px, border `1px solid #d0d5dd`, radius 4px, `px: "6px"`, font 12px) with the key, `href={link.jira_url}`, `target="_blank"`, `rel="noopener noreferrer"`, `aria-label={\`Open ${key} in Jira\`}`. For `error`, `conflict`, `deleted_in_jira`, a small dot badge (8px, colours from the theme's error / warning / text.secondary) and the chip is wrapped in `VWTooltip content={stateLabel + (state_reason ? \`: ${state_reason}\` : "")}`; the anchor is focusable so the tooltip opens on keyboard focus. State labels: error "Sync error", conflict "Conflict", deleted_in_jira "Deleted in Jira". For `deleted_in_verifywise` (only reachable through stale data) render nothing.

Hook: `useQuery` (React Query) keyed `["jira-incident-links", sortedIds]`, `enabled: isEnabled("jira-incidents") && ids.length > 0`, `staleTime: 60_000`; ids chunked by 500 in one `queryFn` (`Promise.all`); returns a `Map` by `incident_id`.

- [ ] **Step 1: Write the failing tests**

```tsx
// Clients/src/presentation/components/JiraIssueChip/JiraIssueChip.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material";
import { light } from "../../themes";
import JiraIssueChip from "./index";

const link = (state: string, state_reason: string | null = null) =>
  ({ incident_id: 1, jira_issue_key: "SEC-42", jira_url: "https://acme.atlassian.net/browse/SEC-42", state, state_reason }) as any;
const renderChip = (l: any) => render(<ThemeProvider theme={light}><JiraIssueChip link={l} /></ThemeProvider>);

describe("JiraIssueChip", () => {
  it("links to the issue in a new tab", () => {
    renderChip(link("ok"));
    const a = screen.getByRole("link", { name: "Open SEC-42 in Jira" });
    expect(a).toHaveAttribute("href", "https://acme.atlassian.net/browse/SEC-42");
    expect(a).toHaveAttribute("target", "_blank");
    expect(a).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByTestId("jira-chip-badge")).toBeNull();
  });
  it("shows a badge and the reason on keyboard focus for errors", async () => {
    renderChip(link("error", "Jira status 'Awaiting vendor' isn't mapped"));
    expect(screen.getByTestId("jira-chip-badge")).toBeInTheDocument();
    fireEvent.focus(screen.getByRole("link"));
    expect(await screen.findByText("Sync error: Jira status 'Awaiting vendor' isn't mapped")).toBeInTheDocument();
  });
  it("renders nothing for deleted_in_verifywise", () => {
    const { container } = renderChip(link("deleted_in_verifywise"));
    expect(container).toBeEmptyDOMElement();
  });
});
```

```ts
// Clients/src/application/hooks/useJiraIncidentLinks.test.ts
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const isEnabled = vi.fn();
vi.mock("../contexts/Extensions.context", () => ({ useExtensions: () => ({ isEnabled }) }));
const getLinks = vi.fn();
vi.mock("../repository/jiraIncidents.repository", () => ({ getJiraIncidentLinks: (ids: number[]) => getLinks(ids) }));
import { useJiraIncidentLinks } from "./useJiraIncidentLinks";

const wrapper = ({ children }: { children: React.ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, children);

describe("useJiraIncidentLinks", () => {
  it("does not call the API when the extension is off", () => {
    isEnabled.mockReturnValue(false);
    const { result } = renderHook(() => useJiraIncidentLinks([1, 2]), { wrapper });
    expect(result.current.size).toBe(0);
    expect(getLinks).not.toHaveBeenCalled();
  });
  it("returns links by incident id", async () => {
    isEnabled.mockReturnValue(true);
    getLinks.mockResolvedValue([{ incident_id: 2, jira_issue_key: "SEC-1", jira_url: "u", state: "ok", state_reason: null }]);
    const { result } = renderHook(() => useJiraIncidentLinks([2, 1]), { wrapper });
    await waitFor(() => expect(result.current.get(2)?.jira_issue_key).toBe("SEC-1"));
  });
});
```

Confirm the React Query package name (`@tanstack/react-query`) and the `useExtensions` export in `Extensions.context.tsx` before running; adjust the imports if they differ.

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement** the chip and hook; then in `IncidentManagement/index.tsx` call `useJiraIncidentLinks(incidents.map((i) => i.id))` and pass `jiraLinks` to `IncidentTable` (new optional prop `jiraLinks?: Map<number, JiraIncidentLink>`) and the selected incident's link to `NewIncident` (new optional prop `jiraLink?: JiraIncidentLink`). In `IncidentTable` render `{jiraLinks?.get(incident.id) && <JiraIssueChip link={...} />}` after the incident ID text in the incident ID cell, inside a `Stack direction="row" gap="8px" alignItems="center"`; stop click propagation on the chip so it does not open the row. In `NewIncident`, render the chip next to the incident ID in the edit header.

- [ ] **Step 4: Run** — `cd Clients && npx vitest run src/presentation/components/JiraIssueChip src/application/hooks/useJiraIncidentLinks.test.ts src/presentation/pages/IncidentManagement src/presentation/components/Modals/NewIncident && npm run typecheck` → PASS (existing incident tests must still pass; if they render without a `QueryClientProvider` or `ExtensionsProvider`, add them via `Clients/src/test/renderWithProviders.tsx`, which already provides extensions).

- [ ] **Step 5: Commit**

```bash
git add Clients/src/
git commit -m "feat(jira-incidents): show the Jira issue on imported incidents" -m "A chip with the Jira key in the incidents table and the incident header opens the issue in a new tab. Links in error, conflict or deleted in Jira show a badge whose tooltip, reachable by keyboard, gives the reason. Links are fetched only when the extension is enabled."
```

---

## Task 16: Translations

**Files:**
- Modify: `Clients/src/i18n/translations.ts` (`de`, `fr`, `es` blocks)

- [ ] **Step 1: Find the missing strings**

```bash
cd Clients && npm run i18n:audit:strict
```

Expected: FAIL listing the new strings from Tasks 14–15 (section headings, field labels, help text, buttons, event labels, chip labels and tooltips, validation messages, empty state).

- [ ] **Step 2: Add translations**

Add one entry per listed string to each of `de`, `fr`, `es`, keyed by the exact English text, in a commented group `// Jira incidents extension`. Use the glossary at the top of the file (incident → Vorfall / incident / incidente, use case → Anwendungsfall / cas d'usage / caso de uso). Keep "Jira" and "VerifyWise" untranslated. Strings built with interpolation (e.g. "Open SEC-42 in Jira", "Sync error: …") are not dictionary keys; make sure the audit does not flag them, and if it does, split the static part into its own element so it can be translated.

- [ ] **Step 3: Run** — `cd Clients && npm run i18n:audit:strict` → PASS.

- [ ] **Step 4: Commit**

```bash
git add Clients/src/i18n/translations.ts
git commit -m "feat(jira-incidents): translate the settings page and incident chip" -m "German, French and Spanish for every new string on the Jira incidents settings page, the sync activity list and the incident chip."
```

---

## Task 17: Documentation

**Files:**
- Modify: `docs/technical/infrastructure/extensions.md` (catalog table, a "Jira incidents" section, the sync-engine section listing the second provider)
- Modify: `docs/technical/domains/incidents.md` (imported incidents, link table, status rules, after-commit `incident_added`, system creation path)
- Modify: `docs/technical/domains/data-retention.md` (sync activity under audit records)
- Modify: `CLAUDE.md` (Frameworks and Extensions table: "7 extensions" → "8 extensions", add "Jira incidents"; update "Last Updated" to the commit date)
- Create: `shared/user-guide-content/content/<extensions dir>/jira-incidents.md` (find the directory holding the Jira Assets article: `grep -ril "jira assets" shared/user-guide-content | head`)
- Mirror (not committed): copy the user guide file to `~/website/verifywise/content/user-guide/content/` at the same relative path

- [ ] **Step 1: Write the technical docs.** `incidents.md` must state: the three tables; `createIncidentForImport`; that `incident_added` is enqueued after commit for every caller; that deleting an incident marks its link `deleted_in_verifywise`; the status decision table (copy §6.2's table); that sync writes go through `updateIncident` with `changedBySystem`. `extensions.md`: what the extension does, its routes (§9), Admin-only rule and the `/links` exception, the dispatch-entry note for test connection, the local mock (`Servers/tests/mocks/jiraCloud/README.md`) and `JIRA_INCIDENTS_ALLOW_LOCAL_SITE_URL`.

- [ ] **Step 2: Write the user guide article.** Sections: what it does and doesn't do (the three help sentences); before you start (a Jira Cloud service account, a classic API token, the three permissions by their Jira names "Browse projects", "Transition issues", "Link issues"); set up (connection → test, issues, mappings, defaults, save); how syncing works (hourly by default, "Sync now", newest change wins, badges); troubleshooting (token expired, unmapped status, transition needs a field, lost project access, deleted issue). Run the copy through the truthfulness rule: every claim must match the code.

- [ ] **Step 3: Mirror** the article to the website checkout and do not commit there.

- [ ] **Step 4: Commit**

```bash
git add docs/ CLAUDE.md shared/user-guide-content/
git commit -m "docs(jira-incidents): document the extension, imported incidents and the user guide" -m "Technical docs for the extension, imported incidents, the status rules and the sync activity audit record; an eighth extension in CLAUDE.md; a user guide article on setup, syncing and troubleshooting."
```

---

## Task 18: Full gates and push

- [ ] **Step 1: Backend gates**

```bash
cd /Users/gorkemcetin/verifywise-jira-incidents/Servers
npm run build && npm run format-check && npm run lint -- --quiet && npm run test
npx jest --config jest.config.js --globalSetup="<rootDir>/tests/integration/globalSetup.js" --runInBand tests/integration/jira-incidents tests/integration/tenant-isolation tests/integration/incidentUpdate.concurrency.test.ts
npm run check:api-drift
```

If `format-check` fails: `npm run format`, review the diff, commit as `style(jira-incidents): format`.

- [ ] **Step 2: Frontend gates**

```bash
cd ../Clients
npm run typecheck && npm run i18n:audit:strict && npm run format-check && npm run lint -- --quiet && npx vitest run && npm run build
```

- [ ] **Step 3: Semgrep** with the CI's pinned version, rulesets and `--baseline-commit origin/develop` (read `.github/workflows/` for the exact invocation). Watch for `text(f"...")`-style findings and secret-like words in log messages (`token`).

- [ ] **Step 4: Competitor-name check**

```bash
cd .. && git diff origin/develop --name-only | xargs grep -il "validmind\|yields" || echo clean
```

- [ ] **Step 5: Manual run against the simulated Jira** (report what happened, do not claim it if skipped): start the mock (`npx ts-node --transpile-only tests/mocks/jiraCloud/start.ts --port 4010`), run the app with `NODE_ENV=development JIRA_INCIDENTS_ALLOW_LOCAL_SITE_URL=true` against a dev DB clone (not the shared `verifywise` DB, which the LL 144 session is migrating), enable the extension, connect to `http://localhost:4010` with `svc@acme.test` / `token-1`, map, save, create an issue through `/__mock/issues`, press "Sync now", change status on both sides, and check the chip and activity list.

- [ ] **Step 6: Push** (background) and run `/code-review` on the branch per the user's standing order. Do not open a PR without explicit permission.

```bash
git push -u origin feature/jira-incidents
```

---

## Self-review notes (done while writing)

- **Spec coverage:** §3 catalog/router/provider/client/frontend → Tasks 1, 10, 11, 6, 14. §4.1–4.3 tables → Task 1. §4.4 system creation, after-commit → Task 2. §5.1 connection, token, permissions, site rule → Tasks 3, 6, 7. §5.2 pickers → Tasks 11, 14. §5.3–5.4 mappings → Tasks 4, 11, 13, 14. §5.5–5.6 defaults, readiness, `import_from` → Task 7. §6.1 import → Task 8. §6.2–6.3 status sync, transitions → Tasks 4, 9. §6.4 result → Tasks 10, 13. §7 failures → Tasks 6, 8, 9, 10. §8.1 settings → Task 14. §8.2 chips, links read → Tasks 11, 15. §9 API → Task 11. §10 mock and override → Tasks 3, 5. §11 tests → every task; frontend → Tasks 13–15; i18n → Task 16. §12 docs → Task 17.
- **Deviations from the spec, with reasons:** `POST /test-connection` is served by the generic `/api/extensions/:key/test-connection` route through `TEST_CONNECTION_DISPATCH` (a per-extension route is shadowed). `migrationConfig.ts` is not changed (no extension tables are in that legacy copy order). The service account id and time zone are captured when the connection is saved, not only at "Test connection", so readiness never depends on an unsaved test. The VerifyWise → Jira status change time and the Jira changelog are read only when both sides changed (the only case that needs them).
- **Second review (2026-10-14):** every caller of `createNewIncidentQuery` (controller, AI Advisor `incidentFunctions.ts:492`, demo `autoDriver.driver.ts`) passes a real transaction, so the after-commit enqueue is safe for all of them; Node parses Jira's `+0000` offsets. Fixed: an unmapped status at import no longer clears its own error on the next run (empty snapshot, Task 8); both sides moving to matching statuses is agreement, not a conflict (Task 4); mock transition ids pinned (Task 5); empty `GET /config` shape specified (Task 7).
- **Type names used across tasks:** `JiraIncidentsConfig`, `ConfigView`, `ConfigInput`, `RunState`, `CountKey`, `LinkRow`, `Decision`, `JiraTransition`, `JiraStatus`, `JiraPriority`, `StatusMapIn`, `StatusMapOut`, `SeverityMap`, `JiraIncidentLink` — each defined once (Tasks 4, 6, 7, 8, 13) and used with the same fields afterwards.
