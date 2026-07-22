# MRM Alerts (Email Delivery + Alerts Config) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close MRM gaps #2+#3 — optional email delivery for breach and overdue-validation alerts, a real alerts settings config (email toggle, auto-open-finding toggle, org-wide extra recipients), and auto-opened findings on hard breaches with race-safe dedup.

**Architecture:** Org-wide config lives in `mrm_org_settings` (extended) plus a new `mrm_alert_recipients` join table. All alert logic lives in a new `Servers/utils/mrmAlerts.utils.ts`; the breach controller (`handleBreaches`) and the revalidation sweep call it. Email rides the existing dual-dispatch entry point `sendInAppNotification(orgId, notification, emailEnabled, emailConfig)` with two new MJML templates. The overdue alert fires once per validation lifecycle via an atomic claim column `mrm_validations.overdue_notified_at` (spec amendment 2026-07-11 — the original `created_validation === true` condition is unreachable because the sweep's due query only returns models that already have an open `not_started` validation).

**Tech Stack:** Node 22 / Express 4 / Sequelize 6 raw queries / Jest (+ live-Postgres integration harness), React 19 / MUI 7 / React Query, MJML email templates.

**Spec:** `docs/superpowers/specs/2026-07-10-mrm-alerts-design.md` (incl. the 2026-07-11 amendment in §4).

## Global Constraints

- Branch: `feat/mrm-alerts` (STACKED on `feat/mrm-retention` / PR #4252 — merge order: #4252 first). Never commit to develop.
- Backend gates per task: `cd Servers && npm run build && npm run test:unit`. Integration suite (live Postgres via `.env.test`): `cd Servers && npm run test:integration` — or narrowed: `cd Servers && npx jest --config jest.config.js --globalSetup="<rootDir>/tests/integration/globalSetup.js" --runInBand tests/integration/tenant-isolation/mrm-alerts.isolation.test.ts`.
- Frontend gates per frontend task: `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check && npm run build`.
- After any change to the `/api/mrm/settings` payload: `cd Servers && npm run generate:swagger && npm run generate:endpoints && npm run check:api-drift` — commit regenerated files.
- Migrations: explicit `verifywise.` schema prefix in DDL, transactional up/down, idempotent (`IF NOT EXISTS`/`IF EXISTS`). Runtime utils use UNQUALIFIED table names + `WHERE organization_id = :organizationId`.
- Frontend i18n: English is the KEY (no `en` block). Every new user-facing string gets an entry in the `de`, `fr`, and `es` blocks of `Clients/src/i18n/translations.ts` under the `// Model risk management (MRM) module` banner, or `i18n:audit:strict` fails.
- Backend 400 messages: `req.t!("English text")` with no locale entries (falls back to the key — same precedent as the retention 400 message).
- UI: sentence case; exact pixel strings (`gap: "8px"`, never numeric multipliers); `CustomizableButton` uses `text=` (never `label=`); Lucide icons 14-16px strokeWidth 1.5.
- No competitor names anywhere (grep the staged set for the two known competitor names — pattern lives in local memory, deliberately not in this repo — before committing). No `console.log` in new backend code — use `logger` (`utils/logger/fileLogger`).
- Email default OFF per org; in-app notifications always on. Email failures must never affect ingestion or the sweep.
- Commits: `type(mrm): description` with a body. Do NOT commit the untracked session artifacts in the repo root (screenshots, research dirs — pre-existing noise).
- NO PR without an explicit user ask.

---

### Task 1: Migrations + notification-type enum value

**Files:**
- Create: `Servers/database/migrations/20260711090000-mrm-alerts-config.js`
- Create: `Servers/database/migrations/20260711090100-add-mrm-revalidation-due-notification-type.js`
- Modify: `Servers/domain.layer/interfaces/i.notification.ts` (~line 44, after `MRM_METRIC_BREACH`)

**Interfaces:**
- Consumes: existing tables `mrm_org_settings`, `mrm_findings`, `mrm_validations`, Postgres enum `verifywise.enum_notification_type`.
- Produces: columns `mrm_org_settings.alert_email_enabled` / `.breach_auto_open_finding` (BOOLEAN NOT NULL DEFAULT false), table `mrm_alert_recipients(organization_id, user_id)`, `mrm_findings.auto_metric VARCHAR(100)` + partial index, `mrm_validations.overdue_notified_at TIMESTAMPTZ`, enum value + TS enum member `NotificationType.MRM_REVALIDATION_DUE = "mrm_revalidation_due"`.

- [ ] **Step 1: Write the schema migration**

`Servers/database/migrations/20260711090000-mrm-alerts-config.js`:

```js
"use strict";

/**
 * MRM (Model Risk Management) — alerts email + config (gaps #2+#3).
 *
 * - mrm_org_settings.alert_email_enabled / breach_auto_open_finding: org-wide
 *   alert config (spec: email OFF by default, in-app always on).
 * - mrm_alert_recipients: org-wide extra alert recipients, notified for every
 *   model on top of the model's MRM roles. Join table (not INTEGER[]) so a
 *   deleted user disappears from the list automatically via FK CASCADE.
 * - mrm_findings.auto_metric: set ONLY by the breach auto-open path; the dedup
 *   key and audit marker for "system-opened". Human findings keep it NULL.
 * - mrm_validations.overdue_notified_at: once-per-lifecycle claim for the
 *   overdue-validation alert (spec §4 amendment 2026-07-11) — the sweep
 *   notifies only when it atomically stamps this from NULL.
 *
 * Tenant-scoped by organization_id throughout.
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.mrm_org_settings
           ADD COLUMN IF NOT EXISTS alert_email_enabled BOOLEAN NOT NULL DEFAULT false,
           ADD COLUMN IF NOT EXISTS breach_auto_open_finding BOOLEAN NOT NULL DEFAULT false;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE TABLE IF NOT EXISTS verifywise.mrm_alert_recipients (
           organization_id INTEGER NOT NULL
             REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
           user_id INTEGER NOT NULL
             REFERENCES verifywise.users(id) ON DELETE CASCADE,
           created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
           PRIMARY KEY (organization_id, user_id)
         );`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.mrm_findings
           ADD COLUMN IF NOT EXISTS auto_metric VARCHAR(100);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_mrm_findings_auto_metric
           ON verifywise.mrm_findings(organization_id, model_inventory_id, auto_metric)
           WHERE auto_metric IS NOT NULL;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.mrm_validations
           ADD COLUMN IF NOT EXISTS overdue_notified_at TIMESTAMP WITH TIME ZONE;`,
        { transaction },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.mrm_validations DROP COLUMN IF EXISTS overdue_notified_at;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `DROP INDEX IF EXISTS verifywise.idx_mrm_findings_auto_metric;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.mrm_findings DROP COLUMN IF EXISTS auto_metric;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `DROP TABLE IF EXISTS verifywise.mrm_alert_recipients CASCADE;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.mrm_org_settings
           DROP COLUMN IF EXISTS alert_email_enabled,
           DROP COLUMN IF EXISTS breach_auto_open_finding;`,
        { transaction },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
```

- [ ] **Step 2: Write the enum migration**

`Servers/database/migrations/20260711090100-add-mrm-revalidation-due-notification-type.js` (mirrors `20260703110600-add-mrm-breach-notification-type.js`; NOT wrapped in a transaction — `ALTER TYPE ... ADD VALUE` and transactions don't mix):

```js
"use strict";

/**
 * MRM alerts (gaps #2+#3) — extend enum_notification_type with the
 * overdue-validation value so the revalidation sweep can deliver an in-app
 * notification when a periodic validation is overdue and idle.
 *
 * Reuses entity_type = 'model' (already present), so no entity-type change.
 * Down is a no-op: removing a Postgres enum value requires recreating the type
 * and migrating every column that uses it — risky for a fix-forward migration.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE verifywise.enum_notification_type ADD VALUE IF NOT EXISTS 'mrm_revalidation_due';`,
    );
  },

  async down() {
    // No-op. See header comment.
  },
};
```

- [ ] **Step 3: Add the TS enum member**

In `Servers/domain.layer/interfaces/i.notification.ts`, change:

```ts
  // MRM (Model Risk Management) monitoring notifications
  MRM_METRIC_BREACH = "mrm_metric_breach",
```

to:

```ts
  // MRM (Model Risk Management) monitoring notifications
  MRM_METRIC_BREACH = "mrm_metric_breach",
  MRM_REVALIDATION_DUE = "mrm_revalidation_due",
```

- [ ] **Step 4: Build + migrate + verify**

Run: `cd Servers && npm run build && npx sequelize db:migrate`
Expected: both migrations apply cleanly.

Run: `psql "$DATABASE_URL" -c "\d verifywise.mrm_alert_recipients" -c "SELECT column_name FROM information_schema.columns WHERE table_schema='verifywise' AND table_name='mrm_org_settings';"` (or the local psql invocation used for the retention branch)
Expected: table exists; columns include `alert_email_enabled`, `breach_auto_open_finding`.

Run: `npx sequelize db:migrate:undo && npx sequelize db:migrate:undo && npx sequelize db:migrate`
Expected: down of both migrations is clean (enum down is a no-op), then re-apply succeeds.

- [ ] **Step 5: Commit**

```bash
git add Servers/database/migrations/20260711090000-mrm-alerts-config.js \
        Servers/database/migrations/20260711090100-add-mrm-revalidation-due-notification-type.js \
        Servers/domain.layer/interfaces/i.notification.ts
git commit -m "feat(mrm): alerts schema — config columns, extra recipients, auto_metric, overdue claim

## Changes
- mrm_org_settings: alert_email_enabled + breach_auto_open_finding (default false)
- mrm_alert_recipients join table (org-wide extra recipients, FK CASCADE)
- mrm_findings.auto_metric + partial dedup index
- mrm_validations.overdue_notified_at (once-per-lifecycle overdue-alert claim)
- enum_notification_type + NotificationType: mrm_revalidation_due"
```

---

### Task 2: Settings utils — partial upsert

**Files:**
- Modify: `Servers/utils/mrmSettings.utils.ts` (whole file shown below)
- Modify: `Servers/controllers/mrmSettings.ctrl.ts:49` (adapt the one `upsertMrmOrgSettings` call site to the new signature; full partial-PUT semantics come in Task 4)
- Modify: `Servers/tests/integration/tenant-isolation/mrm-retention.isolation.test.ts:59` (call-site update)

**Interfaces:**
- Consumes: `mrm_org_settings` columns from Task 1.
- Produces (used by Tasks 4, 7, 8):
  - `interface MrmOrgSettings { organization_id: number; retention_months: number; alert_email_enabled: boolean; breach_auto_open_finding: boolean; }`
  - `interface MrmOrgSettingsUpdate { retention_months?: number; alert_email_enabled?: boolean; breach_auto_open_finding?: boolean; }`
  - `getMrmOrgSettings(organizationId: number): Promise<MrmOrgSettings>` (missing row → defaults `25/false/false`)
  - `upsertMrmOrgSettings(organizationId: number, update: MrmOrgSettingsUpdate, transaction?: Transaction): Promise<MrmOrgSettings>` — COALESCE-style: only provided fields change.

- [ ] **Step 1: Rewrite `Servers/utils/mrmSettings.utils.ts`**

```ts
import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";

/**
 * MRM org-wide settings (mrm_org_settings). One row per org, lazily created —
 * a missing row means defaults. Holds the metric-retention window and the
 * alert configuration (email delivery, breach auto-open-finding).
 */

export const DEFAULT_RETENTION_MONTHS = 25;
// Floor: never below a one-year examiner cycle + margin (SR 26-2 / SS1/23 / OSFI E-23).
export const MIN_RETENTION_MONTHS = 13;

export interface MrmOrgSettings {
  organization_id: number;
  retention_months: number;
  alert_email_enabled: boolean;
  breach_auto_open_finding: boolean;
}

export interface MrmOrgSettingsUpdate {
  retention_months?: number;
  alert_email_enabled?: boolean;
  breach_auto_open_finding?: boolean;
}

/** Read the org's MRM settings; a missing row resolves to defaults. */
export const getMrmOrgSettings = async (organizationId: number): Promise<MrmOrgSettings> => {
  const rows = (await sequelize.query(
    `SELECT organization_id, retention_months, alert_email_enabled, breach_auto_open_finding
       FROM mrm_org_settings
      WHERE organization_id = :organizationId
      LIMIT 1`,
    {
      replacements: { organizationId },
      type: QueryTypes.SELECT,
    },
  )) as MrmOrgSettings[];
  return (
    rows[0] ?? {
      organization_id: organizationId,
      retention_months: DEFAULT_RETENTION_MONTHS,
      alert_email_enabled: false,
      breach_auto_open_finding: false,
    }
  );
};

/**
 * Create-or-update the org's MRM settings row with PARTIAL semantics: only the
 * fields present in `update` change; absent fields keep their current value
 * (or the column default on first insert). Caller validates the values.
 */
export const upsertMrmOrgSettings = async (
  organizationId: number,
  update: MrmOrgSettingsUpdate,
  transaction?: Transaction,
): Promise<MrmOrgSettings> => {
  const rows = (await sequelize.query(
    `INSERT INTO mrm_org_settings
       (organization_id, retention_months, alert_email_enabled, breach_auto_open_finding)
     VALUES
       (:organizationId,
        COALESCE(:retentionMonths, ${DEFAULT_RETENTION_MONTHS}),
        COALESCE(:alertEmailEnabled, false),
        COALESCE(:breachAutoOpenFinding, false))
     ON CONFLICT (organization_id)
     DO UPDATE SET
       retention_months = COALESCE(:retentionMonths, mrm_org_settings.retention_months),
       alert_email_enabled = COALESCE(:alertEmailEnabled, mrm_org_settings.alert_email_enabled),
       breach_auto_open_finding = COALESCE(:breachAutoOpenFinding, mrm_org_settings.breach_auto_open_finding),
       updated_at = now()
     RETURNING organization_id, retention_months, alert_email_enabled, breach_auto_open_finding`,
    {
      replacements: {
        organizationId,
        retentionMonths: update.retention_months ?? null,
        alertEmailEnabled: update.alert_email_enabled ?? null,
        breachAutoOpenFinding: update.breach_auto_open_finding ?? null,
      },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as MrmOrgSettings[];
  return rows[0];
};
```

- [ ] **Step 2: Adapt the two existing call sites**

In `Servers/controllers/mrmSettings.ctrl.ts` (line ~49), change:

```ts
    const settings = await upsertMrmOrgSettings(req.organizationId!, retention_months);
```

to:

```ts
    const settings = await upsertMrmOrgSettings(req.organizationId!, { retention_months });
```

In `Servers/tests/integration/tenant-isolation/mrm-retention.isolation.test.ts` (line ~59), change:

```ts
    await upsertMrmOrgSettings(owner.orgId, 36);
```

to:

```ts
    await upsertMrmOrgSettings(owner.orgId, { retention_months: 36 });
```

- [ ] **Step 3: Add partial-semantics assertions to the retention isolation test**

In the same test file, inside the `it("returns defaults when no settings row exists and scopes upserts per org", ...)` test, after the existing `attackerView` assertion, append:

```ts
    // New alert columns: defaults are false and a partial retention update
    // never touches them (and vice versa).
    expect(before.alert_email_enabled).toBe(false);
    expect(before.breach_auto_open_finding).toBe(false);
    await upsertMrmOrgSettings(owner.orgId, { alert_email_enabled: true });
    const partial = await getMrmOrgSettings(owner.orgId);
    expect(partial.retention_months).toBe(36); // untouched by the boolean-only update
    expect(partial.alert_email_enabled).toBe(true);
    expect(partial.breach_auto_open_finding).toBe(false);
```

- [ ] **Step 4: Run gates**

Run: `cd Servers && npm run build && npm run test:unit`
Expected: PASS (the retention unit test mocks `getMrmOrgSettings`, so the interface change is invisible to it).

Run: `cd Servers && npx jest --config jest.config.js --globalSetup="<rootDir>/tests/integration/globalSetup.js" --runInBand tests/integration/tenant-isolation/mrm-retention.isolation.test.ts`
Expected: PASS including the new assertions.

- [ ] **Step 5: Commit**

```bash
git add Servers/utils/mrmSettings.utils.ts Servers/controllers/mrmSettings.ctrl.ts \
        Servers/tests/integration/tenant-isolation/mrm-retention.isolation.test.ts
git commit -m "feat(mrm): partial-upsert org settings with alert config columns

## Changes
- MrmOrgSettings gains alert_email_enabled + breach_auto_open_finding
- upsertMrmOrgSettings takes a partial update object (+ optional transaction);
  COALESCE keeps absent fields untouched — RetentionSection's
  retention-only PUT stays safe once the API goes partial (Task 4)"
```

---

### Task 3: Alert recipients storage + recipient union (`mrmAlerts.utils.ts` part 1)

**Files:**
- Create: `Servers/utils/mrmAlerts.utils.ts`
- Create: `Servers/utils/__tests__/mrmAlerts.utils.test.ts`
- Create: `Servers/tests/integration/tenant-isolation/mrm-alerts.isolation.test.ts`

**Interfaces:**
- Consumes: `mrm_alert_recipients` (Task 1), `getBreachNotificationRecipientsQuery(organizationId, modelInventoryId): Promise<number[]>` from `Servers/utils/mrmMonitoring.utils.ts`.
- Produces (used by Tasks 4, 7, 8):
  - `getAlertExtraRecipientsQuery(organizationId: number): Promise<number[]>`
  - `replaceAlertRecipientsQuery(organizationId: number, userIds: number[], transaction?: Transaction): Promise<void>` (wholesale DELETE + INSERT)
  - `getOrgMemberIdsQuery(organizationId: number, userIds: number[]): Promise<number[]>` (which of the ids exist in this org)
  - `unionRecipients(roleRecipients: number[], extraRecipients: number[]): number[]` (pure, deduped, role order first)
  - `getAlertRecipientsUnion(organizationId: number, modelInventoryId: number): Promise<number[]>`

- [ ] **Step 1: Write the failing unit test**

`Servers/utils/__tests__/mrmAlerts.utils.test.ts`:

```ts
import { unionRecipients } from "../mrmAlerts.utils";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock("../../services/inAppNotification.service", () => ({
  sendInAppNotification: jest.fn(),
}));
jest.mock("../../utils/mrmMonitoring.utils", () => ({
  getBreachNotificationRecipientsQuery: jest.fn(),
  getModelLabelQuery: jest.fn(),
}));
jest.mock("../../utils/mrmRevalidation.utils", () => ({
  getOpenValidationForModelQuery: jest.fn(),
}));
jest.mock("../../utils/mrmSettings.utils", () => ({
  getMrmOrgSettings: jest.fn(),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
}));

describe("unionRecipients", () => {
  it("dedups overlapping role and extra recipients, roles first", () => {
    expect(unionRecipients([3, 5], [5, 9, 3, 12])).toEqual([3, 5, 9, 12]);
  });

  it("handles empty sides", () => {
    expect(unionRecipients([], [7])).toEqual([7]);
    expect(unionRecipients([7], [])).toEqual([7]);
    expect(unionRecipients([], [])).toEqual([]);
  });
});
```

> The `jest.mock` calls up top cover every module `mrmAlerts.utils.ts` will import across ALL tasks (db, in-app notification service — which pulls in Redis at import time — monitoring/revalidation/settings utils, logger). They stay in place as later tasks extend this test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Servers && npx jest utils/__tests__/mrmAlerts.utils.test.ts`
Expected: FAIL — `Cannot find module '../mrmAlerts.utils'`.

- [ ] **Step 3: Create `Servers/utils/mrmAlerts.utils.ts`**

```ts
import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { getBreachNotificationRecipientsQuery } from "./mrmMonitoring.utils";

/**
 * MRM alerts (gaps #2+#3): recipient resolution, breach auto-finding, and
 * notification dispatch. The breach controller (handleBreaches) and the
 * revalidation sweep both call into this module so the logic stays
 * unit-testable without HTTP.
 */

/** Org-wide extra alert recipients (mrm_alert_recipients), sorted by user id. */
export const getAlertExtraRecipientsQuery = async (
  organizationId: number,
): Promise<number[]> => {
  const rows = (await sequelize.query(
    `SELECT user_id FROM mrm_alert_recipients
      WHERE organization_id = :organizationId
      ORDER BY user_id ASC`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as { user_id: number }[];
  return rows.map((r) => r.user_id);
};

/** Replace the org's extra-recipient list wholesale (DELETE + INSERT). */
export const replaceAlertRecipientsQuery = async (
  organizationId: number,
  userIds: number[],
  transaction?: Transaction,
): Promise<void> => {
  await sequelize.query(
    `DELETE FROM mrm_alert_recipients WHERE organization_id = :organizationId`,
    { replacements: { organizationId }, type: QueryTypes.DELETE, transaction },
  );
  if (userIds.length === 0) return;
  const values = userIds.map((_, i) => `(:organizationId, :userId_${i})`).join(", ");
  const replacements: Record<string, number> = { organizationId };
  userIds.forEach((id, i) => {
    replacements[`userId_${i}`] = id;
  });
  await sequelize.query(
    `INSERT INTO mrm_alert_recipients (organization_id, user_id) VALUES ${values}`,
    { replacements, type: QueryTypes.INSERT, transaction },
  );
};

/** Which of the given user ids belong to this org (for PUT validation). */
export const getOrgMemberIdsQuery = async (
  organizationId: number,
  userIds: number[],
): Promise<number[]> => {
  if (userIds.length === 0) return [];
  const rows = (await sequelize.query(
    `SELECT id FROM users
      WHERE organization_id = :organizationId AND id IN (:userIds)`,
    { replacements: { organizationId, userIds }, type: QueryTypes.SELECT },
  )) as { id: number }[];
  return rows.map((r) => r.id);
};

/** Role-derived recipients ∪ org-wide extras, deduped (roles first). */
export const unionRecipients = (
  roleRecipients: number[],
  extraRecipients: number[],
): number[] => Array.from(new Set([...roleRecipients, ...extraRecipients]));

/** The full alert audience for a model's breach/overdue notifications. */
export const getAlertRecipientsUnion = async (
  organizationId: number,
  modelInventoryId: number,
): Promise<number[]> => {
  const [roleRecipients, extraRecipients] = await Promise.all([
    getBreachNotificationRecipientsQuery(organizationId, modelInventoryId),
    getAlertExtraRecipientsQuery(organizationId),
  ]);
  return unionRecipients(roleRecipients, extraRecipients);
};
```

- [ ] **Step 4: Run unit test to verify it passes**

Run: `cd Servers && npx jest utils/__tests__/mrmAlerts.utils.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the isolation tests (storage + union scoping)**

`Servers/tests/integration/tenant-isolation/mrm-alerts.isolation.test.ts`:

```ts
jest.setTimeout(60000);

import { cleanupDatabase, createTestUser } from "../helpers";
import { sequelize } from "../../../database/db";
import { QueryTypes } from "sequelize";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { createTestModelInventory, createTestMrmModelRole } from "../../factories";
import {
  getAlertExtraRecipientsQuery,
  getAlertRecipientsUnion,
  getOrgMemberIdsQuery,
  replaceAlertRecipientsQuery,
} from "../../../utils/mrmAlerts.utils";

/**
 * MRM alerts — tenant isolation for recipient storage, the recipient union,
 * the settings API partial semantics (Task 4 section), the breach auto-finding
 * dedup contract (Task 5 section), and the overdue-alert claim (Task 8 section).
 */

describe("MRM alert recipients tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("stores, replaces and scopes extra recipients per org", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const extraA = await createTestUser(owner.orgId, 3, `extra-a-${Date.now()}@test.com`, "Password123!");

    await replaceAlertRecipientsQuery(owner.orgId, [extraA, owner.userId]);
    expect(await getAlertExtraRecipientsQuery(owner.orgId)).toEqual(
      [extraA, owner.userId].sort((a, b) => a - b),
    );
    // The other org sees nothing.
    expect(await getAlertExtraRecipientsQuery(attacker.orgId)).toEqual([]);

    // Wholesale replace, including down to empty.
    await replaceAlertRecipientsQuery(owner.orgId, [owner.userId]);
    expect(await getAlertExtraRecipientsQuery(owner.orgId)).toEqual([owner.userId]);
    await replaceAlertRecipientsQuery(owner.orgId, []);
    expect(await getAlertExtraRecipientsQuery(owner.orgId)).toEqual([]);
  });

  it("getOrgMemberIdsQuery only returns ids belonging to the org", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const members = await getOrgMemberIdsQuery(owner.orgId, [owner.userId, attacker.userId]);
    expect(members).toEqual([owner.userId]);
    expect(await getOrgMemberIdsQuery(owner.orgId, [])).toEqual([]);
  });

  it("unions model-role recipients with org extras, deduped", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    await createTestMrmModelRole(owner.orgId, modelId, owner.userId, { role: "owner" });
    const extra = await createTestUser(owner.orgId, 3, `extra-u-${Date.now()}@test.com`, "Password123!");
    // Overlap: the owner is ALSO an extra recipient — must appear once.
    await replaceAlertRecipientsQuery(owner.orgId, [owner.userId, extra]);

    const union = await getAlertRecipientsUnion(owner.orgId, modelId);
    expect([...union].sort((a, b) => a - b)).toEqual(
      [owner.userId, extra].sort((a, b) => a - b),
    );
  });
});
```

- [ ] **Step 6: Run the isolation tests**

Run: `cd Servers && npx jest --config jest.config.js --globalSetup="<rootDir>/tests/integration/globalSetup.js" --runInBand tests/integration/tenant-isolation/mrm-alerts.isolation.test.ts`
Expected: PASS (3 tests). (If `createTestUser` is not exported from `../helpers`, it is — see `helpers.ts:28`.)

- [ ] **Step 7: Run full unit suite + build, commit**

Run: `cd Servers && npm run build && npm run test:unit`
Expected: PASS.

```bash
git add Servers/utils/mrmAlerts.utils.ts Servers/utils/__tests__/mrmAlerts.utils.test.ts \
        Servers/tests/integration/tenant-isolation/mrm-alerts.isolation.test.ts
git commit -m "feat(mrm): alert recipient storage + role∪extra recipient union

## Changes
- mrmAlerts.utils: extra-recipient queries (wholesale replace), org-membership
  check for PUT validation, deduped role∪extra union
- unit tests (pure union) + tenant-isolation tests (storage, scoping, union)"
```

---

### Task 4: Settings API partial semantics + swagger

**Files:**
- Modify: `Servers/controllers/mrmSettings.ctrl.ts` (both handlers)
- Modify: `Servers/tests/integration/tenant-isolation/mrm-alerts.isolation.test.ts` (new describe block)
- Regenerate: swagger + endpoints (`npm run generate:swagger && npm run generate:endpoints`)

**Interfaces:**
- Consumes: Task 2 (`upsertMrmOrgSettings(orgId, update, tx)`, `getMrmOrgSettings`, `MIN_RETENTION_MONTHS`), Task 3 (`getAlertExtraRecipientsQuery`, `replaceAlertRecipientsQuery`, `getOrgMemberIdsQuery`).
- Produces: `GET /api/mrm/settings` → `{ organization_id, retention_months, alert_email_enabled, breach_auto_open_finding, alert_recipients: number[] }`; `PUT /api/mrm/settings` with PARTIAL body semantics (only present fields validated/updated). The frontend (Task 9) consumes exactly this payload.

- [ ] **Step 1: Write the failing isolation tests**

Append to `mrm-alerts.isolation.test.ts`:

```ts
describe("MRM settings API partial semantics", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("GET returns defaults incl. empty recipients; org B never sees org A's config", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();

    const res = await owner.request.get("/api/mrm/settings");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      organization_id: owner.orgId,
      retention_months: 25,
      alert_email_enabled: false,
      breach_auto_open_finding: false,
      alert_recipients: [],
    });

    const put = await owner.request.put("/api/mrm/settings").send({
      alert_email_enabled: true,
      breach_auto_open_finding: true,
      alert_recipients: [owner.userId],
    });
    expect(put.status).toBe(200);
    expect(put.body.data.alert_email_enabled).toBe(true);
    expect(put.body.data.alert_recipients).toEqual([owner.userId]);

    const attackerView = await attacker.request.get("/api/mrm/settings");
    expect(attackerView.status).toBe(200);
    expect(attackerView.body.data.alert_email_enabled).toBe(false);
    expect(attackerView.body.data.alert_recipients).toEqual([]);
  });

  it("PUT is partial: a retention-only body never touches alert fields", async () => {
    const { owner } = await seedTwoTenantContexts();
    await owner.request.put("/api/mrm/settings").send({ alert_email_enabled: true });

    const res = await owner.request.put("/api/mrm/settings").send({ retention_months: 36 });
    expect(res.status).toBe(200);
    expect(res.body.data.retention_months).toBe(36);
    expect(res.body.data.alert_email_enabled).toBe(true); // untouched
  });

  it("PUT rejects invalid bodies with 400", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();

    expect((await owner.request.put("/api/mrm/settings").send({})).status).toBe(400);
    expect(
      (await owner.request.put("/api/mrm/settings").send({ retention_months: 6 })).status,
    ).toBe(400);
    expect(
      (await owner.request.put("/api/mrm/settings").send({ alert_email_enabled: "yes" }))
        .status,
    ).toBe(400);
    expect(
      (await owner.request.put("/api/mrm/settings").send({ alert_recipients: [1.5] })).status,
    ).toBe(400);
    // A user id from another org is rejected — and nothing was stored.
    expect(
      (
        await owner.request
          .put("/api/mrm/settings")
          .send({ alert_recipients: [attacker.userId] })
      ).status,
    ).toBe(400);
    expect(await getAlertExtraRecipientsQuery(owner.orgId)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify the new block fails**

Run: `cd Servers && npx jest --config jest.config.js --globalSetup="<rootDir>/tests/integration/globalSetup.js" --runInBand tests/integration/tenant-isolation/mrm-alerts.isolation.test.ts -t "partial semantics"`
Expected: FAIL — GET body lacks `alert_email_enabled`/`alert_recipients`; PUT `{}` currently 400s for the wrong reason and boolean-only PUTs 400 (old handler requires `retention_months`).

- [ ] **Step 3: Rewrite the two handlers in `Servers/controllers/mrmSettings.ctrl.ts`**

Add imports at the top of the file:

```ts
import { sequelize } from "../database/db";
import {
  getAlertExtraRecipientsQuery,
  getOrgMemberIdsQuery,
  replaceAlertRecipientsQuery,
} from "../utils/mrmAlerts.utils";
```

Replace both handler bodies:

```ts
export async function getMrmSettingsHandler(req: Request, res: Response) {
  const fn = "getMrmSettingsHandler";
  logStructured("processing", "fetching MRM settings", fn, FILE);
  try {
    const settings = await getMrmOrgSettings(req.organizationId!);
    const alert_recipients = await getAlertExtraRecipientsQuery(req.organizationId!);
    logStructured("successful", "MRM settings retrieved", fn, FILE);
    return res.status(200).json(STATUS_CODE[200]({ ...settings, alert_recipients }));
  } catch (error) {
    return fail(req, res, fn, "failed to retrieve MRM settings", error);
  }
}

export async function updateMrmSettingsHandler(req: Request, res: Response) {
  const fn = "updateMrmSettingsHandler";
  logStructured("processing", "updating MRM settings", fn, FILE);
  try {
    const body = req.body ?? {};
    const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);

    // PARTIAL semantics: only fields present in the body are validated and
    // updated (RetentionSection PUTs only retention_months; AlertsSection
    // PUTs only its three fields).
    if (
      !has("retention_months") &&
      !has("alert_email_enabled") &&
      !has("breach_auto_open_finding") &&
      !has("alert_recipients")
    ) {
      return res.status(400).json(STATUS_CODE[400](req.t!("No settings provided")));
    }

    if (
      has("retention_months") &&
      (!Number.isInteger(body.retention_months) || body.retention_months < MIN_RETENTION_MONTHS)
    ) {
      return res
        .status(400)
        .json(STATUS_CODE[400](req.t!("Retention must be an integer of at least 13 months")));
    }
    if (has("alert_email_enabled") && typeof body.alert_email_enabled !== "boolean") {
      return res
        .status(400)
        .json(STATUS_CODE[400](req.t!("Email alerts must be true or false")));
    }
    if (has("breach_auto_open_finding") && typeof body.breach_auto_open_finding !== "boolean") {
      return res
        .status(400)
        .json(STATUS_CODE[400](req.t!("Auto-open finding must be true or false")));
    }

    let recipientIds: number[] | undefined;
    if (has("alert_recipients")) {
      if (
        !Array.isArray(body.alert_recipients) ||
        body.alert_recipients.some((id: unknown) => !Number.isInteger(id))
      ) {
        return res
          .status(400)
          .json(STATUS_CODE[400](req.t!("Alert recipients must be a list of user ids")));
      }
      recipientIds = Array.from(new Set(body.alert_recipients as number[]));
      const members = await getOrgMemberIdsQuery(req.organizationId!, recipientIds);
      if (members.length !== recipientIds.length) {
        return res
          .status(400)
          .json(
            STATUS_CODE[400](req.t!("Alert recipients must be users in your organization")),
          );
      }
    }

    const transaction = await sequelize.transaction();
    let settings;
    try {
      settings = await upsertMrmOrgSettings(
        req.organizationId!,
        {
          retention_months: has("retention_months") ? body.retention_months : undefined,
          alert_email_enabled: has("alert_email_enabled") ? body.alert_email_enabled : undefined,
          breach_auto_open_finding: has("breach_auto_open_finding")
            ? body.breach_auto_open_finding
            : undefined,
        },
        transaction,
      );
      if (recipientIds !== undefined) {
        await replaceAlertRecipientsQuery(req.organizationId!, recipientIds, transaction);
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
    const alert_recipients = await getAlertExtraRecipientsQuery(req.organizationId!);
    logStructured("successful", "MRM settings updated", fn, FILE);
    return res.status(200).json(STATUS_CODE[200]({ ...settings, alert_recipients }));
  } catch (error) {
    return fail(req, res, fn, "failed to update MRM settings", error);
  }
}
```

(Keep the existing `fail()` helper, `FILE` constant, and existing imports — `getMrmOrgSettings`, `upsertMrmOrgSettings`, `MIN_RETENTION_MONTHS` are already imported from `../utils/mrmSettings.utils`.)

- [ ] **Step 4: Run the isolation tests to verify they pass**

Run: `cd Servers && npx jest --config jest.config.js --globalSetup="<rootDir>/tests/integration/globalSetup.js" --runInBand tests/integration/tenant-isolation/mrm-alerts.isolation.test.ts`
Expected: PASS (all 6 tests). Also re-run the retention suite (RetentionSection compat path): `... --runInBand tests/integration/tenant-isolation/mrm-retention.isolation.test.ts` — PASS.

- [ ] **Step 5: Regenerate API artifacts + gates**

Run: `cd Servers && npm run build && npm run test:unit && npm run generate:swagger && npm run generate:endpoints && npm run check:api-drift`
Expected: builds and unit suite PASS; drift check reports 0 drift after regeneration.

- [ ] **Step 6: Commit**

```bash
git add Servers/controllers/mrmSettings.ctrl.ts \
        Servers/tests/integration/tenant-isolation/mrm-alerts.isolation.test.ts \
        Servers/swagger.yaml
git add -A Servers/  # pick up regenerated endpoint artifacts only; verify with git status first
git commit -m "feat(mrm): settings API — partial PUT with alert config + recipients

## Changes
- GET/PUT /api/mrm/settings payload gains alert_email_enabled,
  breach_auto_open_finding, alert_recipients
- PUT is PARTIAL: only present fields validated/updated; recipients replaced
  wholesale in one transaction; cross-org user ids rejected with 400
- swagger + endpoints regenerated"
```

---

### Task 5: Auto-open finding on hard breach (lock + dedup + create)

**Files:**
- Modify: `Servers/utils/mrmAlerts.utils.ts` (append)
- Modify: `Servers/utils/__tests__/mrmAlerts.utils.test.ts` (append)
- Modify: `Servers/tests/integration/tenant-isolation/mrm-alerts.isolation.test.ts` (append)

**Interfaces:**
- Consumes: `getOpenValidationForModelQuery(organizationId, modelInventoryId, transaction)` from `Servers/utils/mrmRevalidation.utils.ts`; enums `MrmEvalStatus` (`ok|warn|breach|no_threshold`), `MrmThresholdSeverity` (`warn|high|critical`) from `Servers/domain.layer/enums/mrmMonitoring.enum.ts`; `MrmFindingSeverity` (`critical|high|medium|low`) from `Servers/domain.layer/enums/mrm.enum.ts`.
- Produces (used by Task 7):
  - `severityToFindingSeverity(severity: MrmThresholdSeverity): MrmFindingSeverity | null` (critical→critical, high→high, warn→null)
  - `isAutoFindingEligible(status: MrmEvalStatus, autoOpenEnabled: boolean): boolean` (true only for `breach` + enabled)
  - `maybeAutoOpenFindingForBreach(organizationId: number, modelInventoryId: number, metric: string, status: MrmEvalStatus, thresholdSeverity: MrmThresholdSeverity, autoOpenEnabled: boolean): Promise<number | null>` — returns the new finding id, or null when skipped (ineligible, model missing, or an in-flight auto-finding exists). Throws on DB errors (caller catches).

- [ ] **Step 1: Append the failing unit tests**

Append to `Servers/utils/__tests__/mrmAlerts.utils.test.ts` (extend the first import line to `import { isAutoFindingEligible, severityToFindingSeverity, unionRecipients } from "../mrmAlerts.utils";` and add the enum imports):

```ts
import { MrmEvalStatus, MrmThresholdSeverity } from "../../domain.layer/enums/mrmMonitoring.enum";
import { MrmFindingSeverity } from "../../domain.layer/enums/mrm.enum";

describe("severityToFindingSeverity", () => {
  it("maps critical→critical, high→high, warn→null", () => {
    expect(severityToFindingSeverity(MrmThresholdSeverity.CRITICAL)).toBe(
      MrmFindingSeverity.CRITICAL,
    );
    expect(severityToFindingSeverity(MrmThresholdSeverity.HIGH)).toBe(MrmFindingSeverity.HIGH);
    expect(severityToFindingSeverity(MrmThresholdSeverity.WARN)).toBeNull();
  });
});

describe("isAutoFindingEligible", () => {
  it("fires only for a hard breach with the toggle on", () => {
    expect(isAutoFindingEligible(MrmEvalStatus.BREACH, true)).toBe(true);
    expect(isAutoFindingEligible(MrmEvalStatus.WARN, true)).toBe(false);
    expect(isAutoFindingEligible(MrmEvalStatus.OK, true)).toBe(false);
    expect(isAutoFindingEligible(MrmEvalStatus.NO_THRESHOLD, true)).toBe(false);
    expect(isAutoFindingEligible(MrmEvalStatus.BREACH, false)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd Servers && npx jest utils/__tests__/mrmAlerts.utils.test.ts`
Expected: FAIL — the two functions don't exist.

- [ ] **Step 3: Append the implementation to `mrmAlerts.utils.ts`**

Add imports at the top:

```ts
import { getOpenValidationForModelQuery } from "./mrmRevalidation.utils";
import { MrmEvalStatus, MrmThresholdSeverity } from "../domain.layer/enums/mrmMonitoring.enum";
import { MrmFindingSeverity } from "../domain.layer/enums/mrm.enum";
```

Append:

```ts
/** Threshold severity → finding severity. warn never opens a finding. */
export const severityToFindingSeverity = (
  severity: MrmThresholdSeverity,
): MrmFindingSeverity | null => {
  if (severity === MrmThresholdSeverity.CRITICAL) return MrmFindingSeverity.CRITICAL;
  if (severity === MrmThresholdSeverity.HIGH) return MrmFindingSeverity.HIGH;
  return null;
};

/** Auto-finding trigger predicate: hard breaches only, and only when enabled. */
export const isAutoFindingEligible = (
  status: MrmEvalStatus,
  autoOpenEnabled: boolean,
): boolean => autoOpenEnabled && status === MrmEvalStatus.BREACH;

/** The model's assigned owner role user, or null. Lowest id wins if duplicated. */
const getModelOwnerUserIdQuery = async (
  organizationId: number,
  modelInventoryId: number,
  transaction?: Transaction,
): Promise<number | null> => {
  const rows = (await sequelize.query(
    `SELECT user_id FROM mrm_model_roles
      WHERE organization_id = :organizationId
        AND model_inventory_id = :modelInventoryId
        AND role = 'owner'
        AND user_id IS NOT NULL
      ORDER BY id ASC
      LIMIT 1`,
    {
      replacements: { organizationId, modelInventoryId },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as { user_id: number }[];
  return rows[0]?.user_id ?? null;
};

/**
 * Auto-open a finding for a hard metric breach, once per (model, metric) while
 * an auto-finding is still in flight (stage <> 'closed'). Deliberately
 * segment-coarse: per-segment detail lives in the evaluation audit.
 *
 * Concurrency: the dedup check + INSERT run in one short transaction that
 * first locks the model row FOR UPDATE — findings are permanent (no hard
 * delete), so two racing ingestions must not both create one. A partial
 * UNIQUE index was rejected in the spec: it would leak a DB error into a
 * human reopening an old closed auto-finding.
 *
 * Returns the new finding id, or null when skipped. Throws on DB errors —
 * the caller logs and swallows so ingestion is never poisoned.
 */
export const maybeAutoOpenFindingForBreach = async (
  organizationId: number,
  modelInventoryId: number,
  metric: string,
  status: MrmEvalStatus,
  thresholdSeverity: MrmThresholdSeverity,
  autoOpenEnabled: boolean,
): Promise<number | null> => {
  if (!isAutoFindingEligible(status, autoOpenEnabled)) return null;
  const severity = severityToFindingSeverity(thresholdSeverity);
  if (!severity) return null;

  const transaction = await sequelize.transaction();
  try {
    const lock = (await sequelize.query(
      `SELECT id FROM model_inventories
        WHERE id = :modelInventoryId AND organization_id = :organizationId
        FOR UPDATE`,
      {
        replacements: { organizationId, modelInventoryId },
        type: QueryTypes.SELECT,
        transaction,
      },
    )) as { id: number }[];
    if (lock.length === 0) {
      await transaction.rollback();
      return null;
    }

    const inFlight = (await sequelize.query(
      `SELECT id FROM mrm_findings
        WHERE organization_id = :organizationId
          AND model_inventory_id = :modelInventoryId
          AND auto_metric = :metric
          AND stage <> 'closed'
        LIMIT 1`,
      {
        replacements: { organizationId, modelInventoryId, metric },
        type: QueryTypes.SELECT,
        transaction,
      },
    )) as { id: number }[];
    if (inFlight.length > 0) {
      await transaction.rollback();
      return null;
    }

    const openValidation = await getOpenValidationForModelQuery(
      organizationId,
      modelInventoryId,
      transaction,
    );
    const ownerId = await getModelOwnerUserIdQuery(organizationId, modelInventoryId, transaction);

    const rows = (await sequelize.query(
      `INSERT INTO mrm_findings
         (organization_id, model_inventory_id, validation_id, title, severity,
          stage, owner_id, auto_metric, closed_verified, created_at, updated_at)
       VALUES
         (:organizationId, :modelInventoryId, :validationId, :title, :severity,
          'open', :ownerId, :metric, false, now(), now())
       RETURNING id`,
      {
        replacements: {
          organizationId,
          modelInventoryId,
          validationId: openValidation?.id ?? null,
          title: `Metric breach: ${metric}`,
          severity,
          ownerId,
          metric,
        },
        type: QueryTypes.SELECT,
        transaction,
      },
    )) as { id: number }[];

    await transaction.commit();
    return rows[0].id;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};
```

- [ ] **Step 4: Run unit tests to verify they pass**

Run: `cd Servers && npx jest utils/__tests__/mrmAlerts.utils.test.ts`
Expected: PASS.

- [ ] **Step 5: Append the auto-finding isolation tests**

Append to `mrm-alerts.isolation.test.ts` (add `maybeAutoOpenFindingForBreach` to the utils import; add `import { MrmEvalStatus, MrmThresholdSeverity } from "../../../domain.layer/enums/mrmMonitoring.enum";` and `createTestMrmValidation, createTestMrmFinding` to the factories import):

```ts
const findingRows = async (
  orgId: number,
): Promise<{ id: number; auto_metric: string | null; stage: string }[]> =>
  (await sequelize.query(
    `SELECT id, auto_metric, stage FROM mrm_findings
      WHERE organization_id = :orgId ORDER BY id ASC`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  )) as { id: number; auto_metric: string | null; stage: string }[];

describe("MRM breach auto-open finding", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("skips when the toggle is off or the status is only a warning", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);

    expect(
      await maybeAutoOpenFindingForBreach(
        owner.orgId, modelId, "psi", MrmEvalStatus.BREACH, MrmThresholdSeverity.CRITICAL, false,
      ),
    ).toBeNull();
    expect(
      await maybeAutoOpenFindingForBreach(
        owner.orgId, modelId, "psi", MrmEvalStatus.WARN, MrmThresholdSeverity.WARN, true,
      ),
    ).toBeNull();
    expect(await findingRows(owner.orgId)).toEqual([]);
  });

  it("opens one finding with auto_metric, mapped severity, validation link and owner", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    await createTestMrmModelRole(owner.orgId, modelId, owner.userId, { role: "owner" });
    const validationId = await createTestMrmValidation(owner.orgId, modelId);

    const findingId = await maybeAutoOpenFindingForBreach(
      owner.orgId, modelId, "psi", MrmEvalStatus.BREACH, MrmThresholdSeverity.CRITICAL, true,
    );
    expect(findingId).not.toBeNull();

    const rows = (await sequelize.query(
      `SELECT title, severity, stage, auto_metric, validation_id, owner_id
         FROM mrm_findings WHERE id = :id`,
      { replacements: { id: findingId }, type: QueryTypes.SELECT },
    )) as any[];
    expect(rows[0]).toMatchObject({
      title: "Metric breach: psi",
      severity: "critical",
      stage: "open",
      auto_metric: "psi",
      validation_id: validationId,
      owner_id: owner.userId,
    });
  });

  it("dedups repeats of the same metric while in flight (incl. within-batch)", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);

    const first = await maybeAutoOpenFindingForBreach(
      owner.orgId, modelId, "psi", MrmEvalStatus.BREACH, MrmThresholdSeverity.HIGH, true,
    );
    // A batch with two breaching points of the same metric runs serially —
    // the second call hits the just-created in-flight finding and skips.
    const second = await maybeAutoOpenFindingForBreach(
      owner.orgId, modelId, "psi", MrmEvalStatus.BREACH, MrmThresholdSeverity.HIGH, true,
    );
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    // A different metric opens its own finding.
    const other = await maybeAutoOpenFindingForBreach(
      owner.orgId, modelId, "auc", MrmEvalStatus.BREACH, MrmThresholdSeverity.HIGH, true,
    );
    expect(other).not.toBeNull();
    expect((await findingRows(owner.orgId)).length).toBe(2);
  });

  it("re-opens after the auto-finding is closed; human findings never block dedup", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    // A HUMAN finding on the same model (auto_metric NULL) must not block.
    await createTestMrmFinding(owner.orgId, modelId, { title: "Human finding" });

    const first = await maybeAutoOpenFindingForBreach(
      owner.orgId, modelId, "psi", MrmEvalStatus.BREACH, MrmThresholdSeverity.HIGH, true,
    );
    expect(first).not.toBeNull();

    await sequelize.query(`UPDATE mrm_findings SET stage = 'closed' WHERE id = :id`, {
      replacements: { id: first },
    });
    const reopened = await maybeAutoOpenFindingForBreach(
      owner.orgId, modelId, "psi", MrmEvalStatus.BREACH, MrmThresholdSeverity.HIGH, true,
    );
    expect(reopened).not.toBeNull();
    expect(reopened).not.toBe(first);
  });

  it("dedup is org-scoped: org B opens its own finding for the same metric", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const modelA = await createTestModelInventory(owner.orgId);
    const modelB = await createTestModelInventory(attacker.orgId);

    await maybeAutoOpenFindingForBreach(
      owner.orgId, modelA, "psi", MrmEvalStatus.BREACH, MrmThresholdSeverity.HIGH, true,
    );
    const bFinding = await maybeAutoOpenFindingForBreach(
      attacker.orgId, modelB, "psi", MrmEvalStatus.BREACH, MrmThresholdSeverity.HIGH, true,
    );
    expect(bFinding).not.toBeNull();
    expect((await findingRows(owner.orgId)).length).toBe(1);
    expect((await findingRows(attacker.orgId)).length).toBe(1);
  });
});
```

- [ ] **Step 6: Run the isolation suite**

Run: `cd Servers && npx jest --config jest.config.js --globalSetup="<rootDir>/tests/integration/globalSetup.js" --runInBand tests/integration/tenant-isolation/mrm-alerts.isolation.test.ts`
Expected: PASS (all sections so far).

- [ ] **Step 7: Build + unit suite, commit**

Run: `cd Servers && npm run build && npm run test:unit`
Expected: PASS.

```bash
git add Servers/utils/mrmAlerts.utils.ts Servers/utils/__tests__/mrmAlerts.utils.test.ts \
        Servers/tests/integration/tenant-isolation/mrm-alerts.isolation.test.ts
git commit -m "feat(mrm): auto-open finding on hard breach — lock + segment-coarse dedup

## Changes
- maybeAutoOpenFindingForBreach: FOR UPDATE on the model row serializes
  creation; dedup on (org, model, auto_metric) while stage <> 'closed';
  links the open validation and the owner-role user when present
- warn never opens; closed auto-findings re-open on re-breach;
  human findings (auto_metric NULL) never block dedup"
```

---

### Task 6: Email templates + dispatch helper

**Files:**
- Create: `Servers/templates/mrm-breach-alert.mjml`
- Create: `Servers/templates/mrm-revalidation-due.mjml`
- Modify: `Servers/constants/emailTemplates.ts` (two registry keys)
- Modify: `Servers/utils/mrmAlerts.utils.ts` (append `dispatchAlerts`)
- Modify: `Servers/utils/__tests__/mrmAlerts.utils.test.ts` (append dispatch tests)
- Create: `Servers/services/tests/mrmAlertTemplates.spec.ts`

**Interfaces:**
- Consumes: `sendInAppNotification(organizationId, notification: ICreateNotification, sendEmailNotification?: boolean, emailConfig?: IEmailNotificationConfig)` from `Servers/services/inAppNotification.service.ts`; `ICreateNotification`, `IEmailNotificationConfig` from `Servers/domain.layer/interfaces/i.notification.ts`.
- Produces (used by Tasks 7, 8):
  - `EMAIL_TEMPLATES.MRM_BREACH_ALERT = "mrm-breach-alert.mjml"` with placeholders `{{model_label}} {{metric}} {{value}} {{severity}} {{model_url}}`
  - `EMAIL_TEMPLATES.MRM_REVALIDATION_DUE = "mrm-revalidation-due.mjml"` with placeholders `{{model_label}} {{due_date}} {{validation_url}}`
  - `dispatchAlerts(organizationId: number, recipients: number[], notification: Omit<ICreateNotification, "user_id">, emailEnabled: boolean, email: IEmailNotificationConfig): Promise<void>` — per-recipient try/catch; never throws.

- [ ] **Step 1: Create the two MJML templates**

Copy the house template as the base for each, then replace ONLY the inner `<mj-text>` block of the card:

```bash
cd Servers/templates
cp policy-due-soon.mjml mrm-breach-alert.mjml
cp policy-due-soon.mjml mrm-revalidation-due.mjml
```

In `mrm-breach-alert.mjml`, replace the `<mj-text>...</mj-text>` content inside the `email-card` wrapper with:

```html
<h2 class="email-heading">Monitoring alert: {{metric}}</h2><p class="email-body">The metric <strong>{{metric}}</strong> on <strong>{{model_label}}</strong> recorded <strong>{{value}}</strong>, breaching its <strong>{{severity}}</strong> threshold.</p><p class="email-body">The point-by-point evidence is recorded in the model&#8217;s monitoring evaluation audit.</p><p style="margin: 28px 0 24px 0;"><a href="{{model_url}}" class="btn btn-info">View model</a></p>
```

In `mrm-revalidation-due.mjml`, replace the same block with:

```html
<h2 class="email-heading">Validation overdue for {{model_label}}</h2><p class="email-body">The periodic revalidation for <strong>{{model_label}}</strong> was due on <strong>{{due_date}}</strong> and has not been started.</p><p style="margin: 28px 0 24px 0;"><a href="{{validation_url}}" class="btn btn-info">Open validations</a></p>
```

- [ ] **Step 2: Register the templates**

In `Servers/constants/emailTemplates.ts`, add to `EMAIL_TEMPLATES` (after `SHADOW_AI_ALERT`):

```ts
  MRM_BREACH_ALERT: "mrm-breach-alert.mjml",
  MRM_REVALIDATION_DUE: "mrm-revalidation-due.mjml",
```

- [ ] **Step 3: Write the template compile test**

`Servers/services/tests/mrmAlertTemplates.spec.ts`:

```ts
import fs from "fs";
import path from "path";
import { compileMjmlToHtml } from "../../tools/mjmlCompiler";
import { EMAIL_TEMPLATES, TEMPLATES_DIR } from "../../constants/emailTemplates";

describe("MRM alert email templates", () => {
  it("compiles the breach template with all placeholders substituted", async () => {
    const raw = fs.readFileSync(
      path.join(TEMPLATES_DIR, EMAIL_TEMPLATES.MRM_BREACH_ALERT),
      "utf8",
    );
    const html = await compileMjmlToHtml(raw, {
      model_label: "Acme PD v2",
      metric: "psi",
      value: "0.31",
      severity: "critical",
      model_url: "https://app.example.com/model-inventory/models/7",
    });
    for (const expected of [
      "Acme PD v2",
      "psi",
      "0.31",
      "critical",
      "https://app.example.com/model-inventory/models/7",
    ]) {
      expect(html).toContain(expected);
    }
    expect(html).not.toContain("{{");
  });

  it("compiles the revalidation-due template with all placeholders substituted", async () => {
    const raw = fs.readFileSync(
      path.join(TEMPLATES_DIR, EMAIL_TEMPLATES.MRM_REVALIDATION_DUE),
      "utf8",
    );
    const html = await compileMjmlToHtml(raw, {
      model_label: "Acme PD v2",
      due_date: "2026-07-01",
      validation_url: "https://app.example.com/model-inventory/model-risk-management/validation",
    });
    expect(html).toContain("Acme PD v2");
    expect(html).toContain("2026-07-01");
    expect(html).toContain(
      "https://app.example.com/model-inventory/model-risk-management/validation",
    );
    expect(html).not.toContain("{{");
  });
});
```

Run: `cd Servers && npx jest services/tests/mrmAlertTemplates.spec.ts`
Expected: PASS. (If it fails with leftover `{{policy_name}}`-style placeholders, the `<mj-text>` replacement in Step 1 was incomplete.)

- [ ] **Step 4: Append the failing dispatch unit tests**

Append to `Servers/utils/__tests__/mrmAlerts.utils.test.ts` (extend the utils import with `dispatchAlerts`; add `import { sendInAppNotification } from "../../services/inAppNotification.service";` and `import { NotificationType, NotificationEntityType } from "../../domain.layer/interfaces/i.notification";` — the service module is already mocked at the top of this file):

```ts
describe("dispatchAlerts", () => {
  const mockSend = sendInAppNotification as jest.Mock;
  const baseNotification = {
    type: NotificationType.MRM_METRIC_BREACH,
    title: "Metric breach: psi",
    message: "Model X breached",
    entity_type: NotificationEntityType.MODEL,
    entity_id: 7,
    entity_name: "Model X",
  };
  const email = {
    template: "mrm-breach-alert.mjml",
    subject: "Metric breach: psi",
    variables: { metric: "psi" },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue(undefined);
  });

  it("sends one dual-dispatch notification per recipient with the email flag", async () => {
    await dispatchAlerts(1, [10, 20], baseNotification, true, email);
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend).toHaveBeenCalledWith(1, { ...baseNotification, user_id: 10 }, true, email);
    expect(mockSend).toHaveBeenCalledWith(1, { ...baseNotification, user_id: 20 }, true, email);
  });

  it("passes emailEnabled=false through (in-app only)", async () => {
    await dispatchAlerts(1, [10], baseNotification, false, email);
    expect(mockSend).toHaveBeenCalledWith(1, { ...baseNotification, user_id: 10 }, false, email);
  });

  it("one failing recipient never blocks the rest and never throws", async () => {
    mockSend.mockRejectedValueOnce(new Error("smtp down"));
    await expect(dispatchAlerts(1, [10, 20], baseNotification, true, email)).resolves.toBeUndefined();
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it("does nothing for an empty recipient list", async () => {
    await dispatchAlerts(1, [], baseNotification, true, email);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
```

Run: `cd Servers && npx jest utils/__tests__/mrmAlerts.utils.test.ts`
Expected: FAIL — `dispatchAlerts` doesn't exist.

- [ ] **Step 5: Append `dispatchAlerts` to `mrmAlerts.utils.ts`**

Add imports:

```ts
import { sendInAppNotification } from "../services/inAppNotification.service";
import {
  ICreateNotification,
  IEmailNotificationConfig,
} from "../domain.layer/interfaces/i.notification";
import logger from "./logger/fileLogger";
```

Append:

```ts
/**
 * Fan an alert out to every recipient via the standard dual-dispatch entry
 * point (in-app always; email when the org enabled it — sendInAppNotification
 * gates and swallows email failures itself). Per-recipient try/catch so one
 * failing recipient never blocks the rest; never throws.
 */
export const dispatchAlerts = async (
  organizationId: number,
  recipients: number[],
  notification: Omit<ICreateNotification, "user_id">,
  emailEnabled: boolean,
  email: IEmailNotificationConfig,
): Promise<void> => {
  for (const userId of recipients) {
    try {
      await sendInAppNotification(
        organizationId,
        { ...notification, user_id: userId },
        emailEnabled,
        email,
      );
    } catch (error) {
      logger.error("❌ Failed to dispatch MRM alert notification:", error);
    }
  }
};
```

- [ ] **Step 6: Run gates + commit**

Run: `cd Servers && npm run build && npm run test:unit`
Expected: PASS (incl. the new dispatch + template tests).

```bash
git add Servers/templates/mrm-breach-alert.mjml Servers/templates/mrm-revalidation-due.mjml \
        Servers/constants/emailTemplates.ts Servers/utils/mrmAlerts.utils.ts \
        Servers/utils/__tests__/mrmAlerts.utils.test.ts Servers/services/tests/mrmAlertTemplates.spec.ts
git commit -m "feat(mrm): alert email templates + per-recipient dual-dispatch helper

## Changes
- mrm-breach-alert + mrm-revalidation-due MJML templates (house style),
  registered in EMAIL_TEMPLATES, compile-tested with no leftover placeholders
- dispatchAlerts: in-app always, email behind the org toggle, per-recipient
  isolation, never throws"
```

---

### Task 7: Breach path wiring in `handleBreaches`

**Files:**
- Modify: `Servers/controllers/mrmMonitoring.ctrl.ts` (export `handleBreaches`; replace its notify block; drop the now-unused direct imports)
- Create: `Servers/controllers/__tests__/mrmMonitoring.breachAlerts.test.ts`

**Interfaces:**
- Consumes: Task 2 (`getMrmOrgSettings`), Task 3 (`getAlertRecipientsUnion`), Task 5 (`maybeAutoOpenFindingForBreach`), Task 6 (`dispatchAlerts`, `EMAIL_TEMPLATES.MRM_BREACH_ALERT`), existing `getModelLabelQuery`, `flagModelForRevalidationQuery`, `triggerRevalidation`.
- Produces: exported `handleBreaches(organizationId, modelInventoryId, outcomes)` (same signature as today, now exported for unit testing). Behavior: settings read once; auto-finding attempted per warn/breach outcome (only hard breaches create — the predicate is inside the util); recipients = role∪extra union; each breach dispatched in-app (+email when enabled); every failure logged and swallowed.

- [ ] **Step 1: Write the failing unit test**

`Servers/controllers/__tests__/mrmMonitoring.breachAlerts.test.ts`:

```ts
import { handleBreaches } from "../mrmMonitoring.ctrl";
import { getMrmOrgSettings } from "../../utils/mrmSettings.utils";
import {
  dispatchAlerts,
  getAlertRecipientsUnion,
  maybeAutoOpenFindingForBreach,
} from "../../utils/mrmAlerts.utils";
import { getModelLabelQuery } from "../../utils/mrmMonitoring.utils";
import {
  MrmBreachAction,
  MrmEvalStatus,
  MrmThresholdSeverity,
} from "../../domain.layer/enums/mrmMonitoring.enum";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock("../../utils/mrmSettings.utils", () => ({
  getMrmOrgSettings: jest.fn(),
  MIN_RETENTION_MONTHS: 13,
}));
jest.mock("../../utils/mrmAlerts.utils", () => ({
  dispatchAlerts: jest.fn(),
  getAlertRecipientsUnion: jest.fn(),
  maybeAutoOpenFindingForBreach: jest.fn(),
}));
jest.mock("../../utils/mrmMonitoring.utils");
jest.mock("../../utils/mrmRevalidation.utils");
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
}));

const mockSettings = getMrmOrgSettings as jest.Mock;
const mockUnion = getAlertRecipientsUnion as jest.Mock;
const mockDispatch = dispatchAlerts as jest.Mock;
const mockAutoFinding = maybeAutoOpenFindingForBreach as jest.Mock;
const mockLabel = getModelLabelQuery as jest.Mock;

const outcome = (metric: string, status: MrmEvalStatus, severity: MrmThresholdSeverity) => ({
  point: { metric, value: 0.5, at: new Date("2026-07-01T00:00:00Z"), segment: "overall", window: "" },
  duplicate: false,
  metricId: 1,
  evaluation: {
    status,
    breached: true,
    threshold: {
      id: 1,
      metric,
      segment: null,
      window: null,
      op: "gt" as never,
      value_num: 0.25,
      value_lo: null,
      value_hi: null,
      severity,
      breach_action: MrmBreachAction.NOTIFY,
      active: true,
    },
    snapshot: null,
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSettings.mockResolvedValue({
    organization_id: 1,
    retention_months: 25,
    alert_email_enabled: true,
    breach_auto_open_finding: true,
  });
  mockUnion.mockResolvedValue([10, 20]);
  mockAutoFinding.mockResolvedValue(null);
  mockLabel.mockResolvedValue("Provider Model 1.0");
  mockDispatch.mockResolvedValue(undefined);
});

describe("handleBreaches alert dispatch", () => {
  it("returns early with no warn/breach outcomes", async () => {
    await handleBreaches(1, 7, [
      { ...outcome("psi", MrmEvalStatus.OK, MrmThresholdSeverity.HIGH) },
      { ...outcome("psi", MrmEvalStatus.BREACH, MrmThresholdSeverity.HIGH), duplicate: true },
    ]);
    expect(mockSettings).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("dispatches per breach with title, email config and the recipient union", async () => {
    await handleBreaches(1, 7, [
      outcome("psi", MrmEvalStatus.WARN, MrmThresholdSeverity.WARN),
      outcome("auc", MrmEvalStatus.BREACH, MrmThresholdSeverity.CRITICAL),
    ]);
    expect(mockSettings).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledTimes(2);
    const [orgId, recipients, notification, emailEnabled, email] = mockDispatch.mock.calls[0];
    expect(orgId).toBe(1);
    expect(recipients).toEqual([10, 20]);
    expect(notification.title).toBe("Metric warning: psi");
    expect(emailEnabled).toBe(true);
    expect(email.template).toBe("mrm-breach-alert.mjml");
    expect(email.variables.severity).toBe("warn");
    expect(mockDispatch.mock.calls[1][2].title).toBe("Metric breach: auc");
  });

  it("attempts the auto-finding for every breach outcome with the org toggle", async () => {
    await handleBreaches(1, 7, [
      outcome("psi", MrmEvalStatus.WARN, MrmThresholdSeverity.WARN),
      outcome("auc", MrmEvalStatus.BREACH, MrmThresholdSeverity.HIGH),
    ]);
    expect(mockAutoFinding).toHaveBeenCalledTimes(2);
    expect(mockAutoFinding).toHaveBeenCalledWith(
      1, 7, "auc", MrmEvalStatus.BREACH, MrmThresholdSeverity.HIGH, true,
    );
  });

  it("still auto-opens findings when there is nobody to notify", async () => {
    mockUnion.mockResolvedValue([]);
    await handleBreaches(1, 7, [outcome("psi", MrmEvalStatus.BREACH, MrmThresholdSeverity.HIGH)]);
    expect(mockAutoFinding).toHaveBeenCalledTimes(1);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("swallows recipient-resolution and auto-finding failures", async () => {
    mockAutoFinding.mockRejectedValue(new Error("db down"));
    mockUnion.mockRejectedValue(new Error("db down"));
    await expect(
      handleBreaches(1, 7, [outcome("psi", MrmEvalStatus.BREACH, MrmThresholdSeverity.HIGH)]),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd Servers && npx jest controllers/__tests__/mrmMonitoring.breachAlerts.test.ts`
Expected: FAIL — `handleBreaches` is not exported.

- [ ] **Step 3: Rewire `handleBreaches` in `Servers/controllers/mrmMonitoring.ctrl.ts`**

1. Change `async function handleBreaches(` to `export async function handleBreaches(` and update its doc comment to mention email + auto-findings.
2. Add imports:

```ts
import { getMrmOrgSettings } from "../utils/mrmSettings.utils";
import {
  dispatchAlerts,
  getAlertRecipientsUnion,
  maybeAutoOpenFindingForBreach,
} from "../utils/mrmAlerts.utils";
import { EMAIL_TEMPLATES } from "../constants/emailTemplates";
import { MrmThresholdSeverity } from "../domain.layer/enums/mrmMonitoring.enum";
```

3. Remove the now-unused imports `sendInAppNotification` (from `../services/inAppNotification.service`) and `getBreachNotificationRecipientsQuery` (from the `../utils/mrmMonitoring.utils` import list) — the union util replaces them. Keep `getModelLabelQuery` and `flagModelForRevalidationQuery`. Also remove `NotificationType`/`NotificationEntityType` from the ctrl's imports ONLY if no other code in the file uses them (the dispatch below still needs them — keep).
4. Replace the final notify block (everything from `// Notify the model's MRM stakeholders.` through the closing `catch`) with:

```ts
  // Alert side effects: auto-open findings (hard breaches, org toggle), then
  // notify the model's MRM stakeholders (roles ∪ org-wide extra recipients),
  // in-app always and by email when the org enabled it.
  try {
    const settings = await getMrmOrgSettings(organizationId);

    // Auto-findings run BEFORE recipient resolution and regardless of it —
    // and AFTER the triggerRevalidation block above, so a just-opened
    // validation is available for the finding to link to.
    for (const breach of breaches) {
      try {
        await maybeAutoOpenFindingForBreach(
          organizationId,
          modelInventoryId,
          breach.point.metric,
          breach.evaluation!.status,
          breach.evaluation!.threshold?.severity ?? MrmThresholdSeverity.HIGH,
          settings.breach_auto_open_finding,
        );
      } catch (error) {
        logger.error("❌ Failed to auto-open MRM finding after breach:", error);
      }
    }

    const recipients = await getAlertRecipientsUnion(organizationId, modelInventoryId);
    if (recipients.length === 0) return; // recorded, but no one assigned to notify

    const label = (await getModelLabelQuery(organizationId, modelInventoryId)) ?? "a model";
    const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    for (const breach of breaches) {
      const isHard = breach.evaluation!.status === MrmEvalStatus.BREACH;
      const title = isHard
        ? `Metric breach: ${breach.point.metric}`
        : `Metric warning: ${breach.point.metric}`;
      const message = `${label} — "${breach.point.metric}" = ${breach.point.value} breached its monitoring threshold.`;
      await dispatchAlerts(
        organizationId,
        recipients,
        {
          type: NotificationType.MRM_METRIC_BREACH,
          title,
          message,
          entity_type: NotificationEntityType.MODEL,
          entity_id: modelInventoryId,
          entity_name: label,
        },
        settings.alert_email_enabled,
        {
          template: EMAIL_TEMPLATES.MRM_BREACH_ALERT,
          subject: title,
          variables: {
            model_label: label,
            metric: breach.point.metric,
            value: String(breach.point.value),
            severity: breach.evaluation!.threshold?.severity ?? "high",
            model_url: `${baseUrl}/model-inventory/models/${modelInventoryId}`,
          },
        },
      );
    }
  } catch (error) {
    logger.error("❌ Failed to dispatch MRM breach alerts:", error);
  }
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `cd Servers && npx jest controllers/__tests__/mrmMonitoring.breachAlerts.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Full gates + commit**

Run: `cd Servers && npm run build && npm run test:unit`
Expected: PASS.

```bash
git add Servers/controllers/mrmMonitoring.ctrl.ts \
        Servers/controllers/__tests__/mrmMonitoring.breachAlerts.test.ts
git commit -m "feat(mrm): breach alerts — email delivery + auto-finding wiring

## Changes
- handleBreaches now reads org alert settings once, auto-opens findings on
  hard breaches (after triggerRevalidation so the validation link resolves),
  and dispatches to the role∪extra recipient union via dual dispatch
- email rides EMAIL_TEMPLATES.MRM_BREACH_ALERT behind alert_email_enabled;
  every side effect stays best-effort post-commit"
```

---

### Task 8: Overdue-validation alert in the sweep (once-per-lifecycle claim)

**Files:**
- Modify: `Servers/utils/mrmAlerts.utils.ts` (append claim + notify)
- Modify: `Servers/services/automations/actions/mrmRevalidationSweep.ts` (wire after `triggerRevalidation`)
- Create: `Servers/services/automations/actions/__tests__/mrmRevalidationSweep.test.ts`
- Modify: `Servers/tests/factories/test-entities.factory.ts` (`createTestMrmValidation` gains `next_due`)
- Modify: `Servers/tests/integration/setup.ts` (extend the in-app service mock)
- Modify: `Servers/tests/integration/tenant-isolation/mrm-alerts.isolation.test.ts` (append)

**Interfaces:**
- Consumes: Tasks 2/3/6 utils; `runRevalidationSweep(organizationId, now?)`, `RevalidationSweepSummary`, `triggerRevalidation` result `{ created_validation: boolean; validation_id: number | null }`; `getModelLabelQuery`; `NotificationType.MRM_REVALIDATION_DUE` (Task 1); `EMAIL_TEMPLATES.MRM_REVALIDATION_DUE` (Task 6).
- Produces:
  - `claimOverdueNotificationQuery(organizationId: number, validationId: number): Promise<boolean>` — atomic `UPDATE ... SET overdue_notified_at = now() WHERE ... overdue_notified_at IS NULL RETURNING id`; true when this caller won the claim.
  - `notifyRevalidationDue(organizationId: number, modelInventoryId: number, validationId: number, nextDue: Date | null): Promise<void>` — claim first, then recipients/settings/dispatch.

- [ ] **Step 1: Append claim + notify to `mrmAlerts.utils.ts`**

Add imports:

```ts
import { getModelLabelQuery } from "./mrmMonitoring.utils";
import { getMrmOrgSettings } from "./mrmSettings.utils";
import { EMAIL_TEMPLATES } from "../constants/emailTemplates";
import {
  NotificationEntityType,
  NotificationType,
} from "../domain.layer/interfaces/i.notification";
```

(merge with the existing import from `./mrmMonitoring.utils` and `../domain.layer/interfaces/i.notification` — one import statement per module.)

Append:

```ts
/**
 * Atomically claim the ONE overdue nudge a validation lifecycle gets. Returns
 * true only for the caller that flips overdue_notified_at from NULL — every
 * later daily sweep finds the claim taken and stays silent. A new validation
 * row (next cycle) starts at NULL and notifies once again.
 */
export const claimOverdueNotificationQuery = async (
  organizationId: number,
  validationId: number,
): Promise<boolean> => {
  const rows = (await sequelize.query(
    `UPDATE mrm_validations
        SET overdue_notified_at = now()
      WHERE id = :validationId
        AND organization_id = :organizationId
        AND overdue_notified_at IS NULL
      RETURNING id`,
    {
      replacements: { organizationId, validationId },
      type: QueryTypes.SELECT,
    },
  )) as { id: number }[];
  return rows.length > 0;
};

/**
 * Overdue-validation alert (spec §4, amended 2026-07-11): fired by the
 * revalidation sweep — BOTH the daily BullMQ job and the on-demand endpoint
 * call the same sweep function. Claim first: the lifecycle's single nudge is
 * consumed even when nobody is assigned to hear it (consistent with the
 * breach path's "recorded, but no one assigned to notify").
 */
export const notifyRevalidationDue = async (
  organizationId: number,
  modelInventoryId: number,
  validationId: number,
  nextDue: Date | null,
): Promise<void> => {
  const claimed = await claimOverdueNotificationQuery(organizationId, validationId);
  if (!claimed) return;

  const recipients = await getAlertRecipientsUnion(organizationId, modelInventoryId);
  if (recipients.length === 0) return;

  const settings = await getMrmOrgSettings(organizationId);
  const label = (await getModelLabelQuery(organizationId, modelInventoryId)) ?? "a model";
  const dueDate = nextDue ? new Date(nextDue).toISOString().slice(0, 10) : "unknown";
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const validationPath = "/model-inventory/model-risk-management/validation";

  await dispatchAlerts(
    organizationId,
    recipients,
    {
      type: NotificationType.MRM_REVALIDATION_DUE,
      title: `Validation overdue: ${label}`,
      message: `${label} — periodic revalidation was due on ${dueDate} and has not been started.`,
      entity_type: NotificationEntityType.MODEL,
      entity_id: modelInventoryId,
      entity_name: label,
      action_url: validationPath,
    },
    settings.alert_email_enabled,
    {
      template: EMAIL_TEMPLATES.MRM_REVALIDATION_DUE,
      subject: `Validation overdue: ${label}`,
      variables: {
        model_label: label,
        due_date: dueDate,
        validation_url: `${baseUrl}${validationPath}`,
      },
    },
  );
};
```

- [ ] **Step 2: Write the failing sweep unit test**

`Servers/services/automations/actions/__tests__/mrmRevalidationSweep.test.ts`:

```ts
import { runRevalidationSweep } from "../mrmRevalidationSweep";
import {
  getDueRevalidationsQuery,
  triggerRevalidation,
} from "../../../../utils/mrmRevalidation.utils";
import { notifyRevalidationDue } from "../../../../utils/mrmAlerts.utils";

jest.mock("../../../../utils/mrmRevalidation.utils", () => ({
  getDueRevalidationsQuery: jest.fn(),
  triggerRevalidation: jest.fn(),
  MrmRevalidationTriggerSource: { SCHEDULED: "scheduled" },
}));
jest.mock("../../../../utils/mrmAlerts.utils", () => ({
  notifyRevalidationDue: jest.fn(),
}));
jest.mock("../../../../utils/organization.utils", () => ({
  getAllOrganizationsQuery: jest.fn(),
}));
jest.mock("../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
}));

const mockDue = getDueRevalidationsQuery as jest.Mock;
const mockTrigger = triggerRevalidation as jest.Mock;
const mockNotify = notifyRevalidationDue as jest.Mock;

const NEXT_DUE = new Date("2026-06-01T00:00:00Z");

beforeEach(() => {
  jest.clearAllMocks();
  mockNotify.mockResolvedValue(undefined);
});

describe("runRevalidationSweep overdue alerts", () => {
  it("notifies for every swept validation (annotate AND create paths)", async () => {
    mockDue.mockResolvedValue([
      { model_inventory_id: 7, next_due: NEXT_DUE },
      { model_inventory_id: 8, next_due: NEXT_DUE },
    ]);
    mockTrigger
      .mockResolvedValueOnce({ created_validation: false, validation_id: 71 })
      .mockResolvedValueOnce({ created_validation: true, validation_id: 81 });

    const summary = await runRevalidationSweep(1);

    expect(summary).toEqual({ organization_id: 1, due: 2, opened: 1, annotated: 1 });
    expect(mockNotify).toHaveBeenCalledTimes(2);
    expect(mockNotify).toHaveBeenCalledWith(1, 7, 71, NEXT_DUE);
    expect(mockNotify).toHaveBeenCalledWith(1, 8, 81, NEXT_DUE);
  });

  it("a notify failure never fails the sweep or skews the counters", async () => {
    mockDue.mockResolvedValue([{ model_inventory_id: 7, next_due: NEXT_DUE }]);
    mockTrigger.mockResolvedValue({ created_validation: false, validation_id: 71 });
    mockNotify.mockRejectedValue(new Error("boom"));

    const summary = await runRevalidationSweep(1);
    expect(summary.annotated).toBe(1);
  });

  it("skips the notify when the trigger returned no validation id", async () => {
    mockDue.mockResolvedValue([{ model_inventory_id: 7, next_due: NEXT_DUE }]);
    mockTrigger.mockResolvedValue({ created_validation: false, validation_id: null });

    await runRevalidationSweep(1);
    expect(mockNotify).not.toHaveBeenCalled();
  });
});
```

Run: `cd Servers && npx jest services/automations/actions/__tests__/mrmRevalidationSweep.test.ts`
Expected: FAIL — `notifyRevalidationDue` is never called by the sweep.

- [ ] **Step 3: Wire the sweep**

In `Servers/services/automations/actions/mrmRevalidationSweep.ts`, add the import:

```ts
import { notifyRevalidationDue } from "../../../utils/mrmAlerts.utils";
```

and inside the `for (const row of due)` loop, immediately after the `if (result.created_validation) { ... } else { ... }` counter block, add:

```ts
      // Once-per-lifecycle overdue nudge (claimed via overdue_notified_at) —
      // its failure must never fail the sweep for the remaining models.
      if (result.validation_id != null) {
        try {
          await notifyRevalidationDue(
            organizationId,
            row.model_inventory_id,
            result.validation_id,
            row.next_due,
          );
        } catch (error) {
          logger.error(
            `❌ Overdue-validation alert failed for org ${organizationId} model ${row.model_inventory_id}:`,
            error,
          );
        }
      }
```

Run: `cd Servers && npx jest services/automations/actions/__tests__/mrmRevalidationSweep.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 4: Extend the validation factory and the integration mock**

In `Servers/tests/factories/test-entities.factory.ts`, change `CreateTestMrmValidationOptions` and the INSERT:

```ts
export interface CreateTestMrmValidationOptions {
  model_inventory_id?: number;
  validator_id?: number;
  next_due?: string | null;
}

export async function createTestMrmValidation(
  orgId: number,
  modelInventoryId: number,
  options: CreateTestMrmValidationOptions = {},
): Promise<number> {
  const [result] = await sequelize.query(
    `INSERT INTO mrm_validations (organization_id, model_inventory_id, stage, validator_id, next_due, report, created_at, updated_at)
     VALUES (:orgId, :modelInventoryId, 'not_started', :validatorId, :nextDue, '{}'::jsonb, NOW(), NOW()) RETURNING id`,
    {
      replacements: {
        orgId,
        modelInventoryId: options.model_inventory_id ?? modelInventoryId,
        validatorId: options.validator_id ?? null,
        nextDue: options.next_due ?? null,
      },
    },
  );
  return (result as any[])[0].id;
}
```

In `Servers/tests/integration/setup.ts`, extend the in-app service mock factory with the dispatch entry point:

```ts
jest.mock("../../services/inAppNotification.service", () => ({
  sendInAppNotification: jest.fn().mockResolvedValue(undefined),
  notifyUserAssigned: jest.fn().mockResolvedValue(undefined),
  notifyTaskAssigned: jest.fn().mockResolvedValue(undefined),
  notifyTaskUpdated: jest.fn().mockResolvedValue(undefined),
  ITaskEntityLinkForEmail: {},
}));
```

- [ ] **Step 5: Append the overdue-alert isolation tests**

Append to `mrm-alerts.isolation.test.ts` (add imports: `import { runRevalidationSweep } from "../../../services/automations/actions/mrmRevalidationSweep";` and `import { sendInAppNotification } from "../../../services/inAppNotification.service";`):

```ts
describe("MRM overdue-validation alert (once-per-lifecycle claim)", () => {
  const mockSend = sendInAppNotification as jest.Mock;
  const PAST_DUE = "2026-01-01T00:00:00Z";

  beforeEach(() => {
    jest.clearAllMocks();
  });
  afterEach(async () => {
    await cleanupDatabase();
  });

  const overdueNotifiedAt = async (validationId: number): Promise<Date | null> => {
    const rows = (await sequelize.query(
      `SELECT overdue_notified_at FROM mrm_validations WHERE id = :validationId`,
      { replacements: { validationId }, type: QueryTypes.SELECT },
    )) as { overdue_notified_at: Date | null }[];
    return rows[0].overdue_notified_at;
  };

  it("notifies once on the first sweep, then stays silent on daily re-runs", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    await createTestMrmModelRole(owner.orgId, modelId, owner.userId, { role: "owner" });
    const validationId = await createTestMrmValidation(owner.orgId, modelId, {
      next_due: PAST_DUE,
    });

    const summary = await runRevalidationSweep(owner.orgId);
    expect(summary.due).toBe(1);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const [orgArg, notificationArg] = mockSend.mock.calls[0];
    expect(orgArg).toBe(owner.orgId);
    expect(notificationArg.type).toBe("mrm_revalidation_due");
    expect(notificationArg.user_id).toBe(owner.userId);
    expect(await overdueNotifiedAt(validationId)).not.toBeNull();

    // Tomorrow's sweep: same overdue validation, claim already taken — silent.
    jest.clearAllMocks();
    await runRevalidationSweep(owner.orgId);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("consumes the claim even with no recipients (no spam when roles arrive later)", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    const validationId = await createTestMrmValidation(owner.orgId, modelId, {
      next_due: PAST_DUE,
    });

    await runRevalidationSweep(owner.orgId);
    expect(mockSend).not.toHaveBeenCalled();
    expect(await overdueNotifiedAt(validationId)).not.toBeNull();
  });

  it("org A's sweep never consumes org B's claim", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const modelB = await createTestModelInventory(attacker.orgId);
    const validationB = await createTestMrmValidation(attacker.orgId, modelB, {
      next_due: PAST_DUE,
    });

    await runRevalidationSweep(owner.orgId);
    expect(await overdueNotifiedAt(validationB)).toBeNull();
  });
});
```

- [ ] **Step 6: Run both suites + commit**

Run: `cd Servers && npm run build && npm run test:unit`
Expected: PASS.
Run: `cd Servers && npx jest --config jest.config.js --globalSetup="<rootDir>/tests/integration/globalSetup.js" --runInBand tests/integration/tenant-isolation/mrm-alerts.isolation.test.ts`
Expected: PASS (all sections).
Also run the sibling suites that share touched fixtures: `... --runInBand tests/integration/tenant-isolation/mrm-retention.isolation.test.ts` — PASS.

```bash
git add Servers/utils/mrmAlerts.utils.ts \
        Servers/services/automations/actions/mrmRevalidationSweep.ts \
        Servers/services/automations/actions/__tests__/mrmRevalidationSweep.test.ts \
        Servers/tests/factories/test-entities.factory.ts \
        Servers/tests/integration/setup.ts \
        Servers/tests/integration/tenant-isolation/mrm-alerts.isolation.test.ts
git commit -m "feat(mrm): overdue-validation alert — once-per-lifecycle claim in the sweep

## Changes
- overdue_notified_at atomic claim (UPDATE ... WHERE NULL RETURNING) replaces
  the spec's unreachable created_validation condition (spec §4 amendment)
- notifyRevalidationDue: claim → role∪extra recipients → dual dispatch with
  the mrm-revalidation-due template; wired into runRevalidationSweep so the
  daily job AND the on-demand endpoint both notify
- factory next_due option + integration mock for sendInAppNotification"
```

---

### Task 9: Frontend data layer (types, repository, hook, RetentionSection call site)

**Files:**
- Modify: `Clients/src/domain/interfaces/i.mrm.ts` (~line 359)
- Modify: `Clients/src/application/repository/mrm.repository.ts` (~line 293)
- Modify: `Clients/src/application/hooks/useMrm.ts` (~line 424)
- Modify: `Clients/src/presentation/pages/ModelInventory/mrm/RetentionSection.tsx:33`

**Interfaces:**
- Consumes: Task 4's API payload.
- Produces (used by Task 10):
  - `interface IMrmOrgSettings { organization_id: number; retention_months: number; alert_email_enabled: boolean; breach_auto_open_finding: boolean; alert_recipients: number[]; }`
  - `interface IMrmOrgSettingsUpdate { retention_months?: number; alert_email_enabled?: boolean; breach_auto_open_finding?: boolean; alert_recipients?: number[]; }`
  - `updateMrmSettings(update: IMrmOrgSettingsUpdate): Promise<IMrmOrgSettings>`
  - `useUpdateMrmSettings()` mutation whose `mutateAsync` takes `IMrmOrgSettingsUpdate`.

- [ ] **Step 1: Extend the types**

In `Clients/src/domain/interfaces/i.mrm.ts`, replace the `IMrmOrgSettings` block with:

```ts
// ---- Org-wide MRM settings ----

export interface IMrmOrgSettings {
  organization_id: number;
  retention_months: number;
  alert_email_enabled: boolean;
  breach_auto_open_finding: boolean;
  alert_recipients: number[];
}

export interface IMrmOrgSettingsUpdate {
  retention_months?: number;
  alert_email_enabled?: boolean;
  breach_auto_open_finding?: boolean;
  alert_recipients?: number[];
}
```

- [ ] **Step 2: Repository takes a partial update object**

In `Clients/src/application/repository/mrm.repository.ts`, replace `updateMrmSettings` with (and add `IMrmOrgSettingsUpdate` to the existing i.mrm import):

```ts
export async function updateMrmSettings(
  update: IMrmOrgSettingsUpdate,
): Promise<IMrmOrgSettings> {
  const response = await apiServices.put("/mrm/settings", update);
  return (response.data as { data: IMrmOrgSettings }).data;
}
```

- [ ] **Step 3: Hook mutation takes the update object**

In `Clients/src/application/hooks/useMrm.ts`, replace `useUpdateMrmSettings` with (and add `IMrmOrgSettingsUpdate` to the existing i.mrm import):

```ts
export const useUpdateMrmSettings = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (update: IMrmOrgSettingsUpdate) => await updateMrmSettings(update),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mrmQueryKeys.settings() });
    },
  });
};
```

- [ ] **Step 4: Update the RetentionSection call site**

In `Clients/src/presentation/pages/ModelInventory/mrm/RetentionSection.tsx` line 33, change:

```ts
      await updateSettings.mutateAsync(parsed);
```

to:

```ts
      await updateSettings.mutateAsync({ retention_months: parsed });
```

- [ ] **Step 5: Run frontend gates + commit**

Run: `cd Clients && npm run typecheck && npm run format-check && npm run build`
Expected: PASS (no new strings yet, so no i18n audit needed — run it anyway for safety: `npm run i18n:audit:strict`).

```bash
git add Clients/src/domain/interfaces/i.mrm.ts \
        Clients/src/application/repository/mrm.repository.ts \
        Clients/src/application/hooks/useMrm.ts \
        Clients/src/presentation/pages/ModelInventory/mrm/RetentionSection.tsx
git commit -m "feat(mrm): settings data layer — partial update payload with alert config"
```

---

### Task 10: Alerts settings UI + i18n

**Files:**
- Modify: `Clients/src/presentation/pages/ModelInventory/mrm/AlertsSection.tsx` (full rewrite below)
- Modify: `Clients/src/presentation/pages/ModelInventory/mrm/SettingsTab.tsx:317`
- Modify: `Clients/src/i18n/translations.ts` (de ~line 146 area, fr ~line 9008 area, es ~line 17825 area — inside the `// Model risk management (MRM) module` banner of each block)

**Interfaces:**
- Consumes: Task 9 hooks/types; `Toggle` (`../../../components/Inputs/Toggle`, plain MUI `SwitchProps`); `VerifyWiseMultiSelect` (default export of `../../../components/VerifyWiseMultiSelect`, options `{ value: string; label: string }[]`); `CustomizableButton` (named export, `text=`/`isDisabled=`/`testId=`); `mrmErrorMessage` from `./constants`.
- Produces: `AlertsSection` with props `{ users: MrmUser[]; onError: (m: string) => void; onSuccess: (m: string) => void }`.

- [ ] **Step 1: Rewrite `AlertsSection.tsx`**

Replace the entire file with:

```tsx
import { useEffect, useMemo, useState } from "react";
import {
  Box,
  FormControlLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import Select from "../../../components/Inputs/Select";
import Toggle from "../../../components/Inputs/Toggle";
import VerifyWiseMultiSelect from "../../../components/VerifyWiseMultiSelect";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { EmptyState } from "../../../components/EmptyState";
import { MrmModelRole } from "../../../../domain/enums/mrm.enum";
import {
  useFleetTiering,
  useModelRoles,
  useMrmSettings,
  useUpdateMrmSettings,
} from "../../../../application/hooks/useMrm";
import { MrmUser } from "./types";
import { fleetModelName, mrmErrorMessage, ROLE_DEFINITIONS } from "./constants";
import {
  mrmCaptionStyle,
  mrmSectionIntroStyle,
  mrmTableCellStyle,
  mrmTableContainerStyle,
  mrmTableHeadCellStyle,
} from "./mrmStyles";

interface AlertsSectionProps {
  users: MrmUser[];
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

const AlertsSection = ({ users, onError, onSuccess }: AlertsSectionProps) => {
  const { data: settings } = useMrmSettings();
  const updateSettings = useUpdateMrmSettings();
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [autoOpenFinding, setAutoOpenFinding] = useState(false);
  const [recipientIds, setRecipientIds] = useState<string[]>([]);

  const { data: fleet = [] } = useFleetTiering();
  const [modelId, setModelId] = useState<number | "">("");
  const { data: roles = [] } = useModelRoles(modelId === "" ? null : Number(modelId));

  // Seed the form from the loaded settings; keep user edits afterwards.
  useEffect(() => {
    if (settings) {
      setEmailEnabled(settings.alert_email_enabled);
      setAutoOpenFinding(settings.breach_auto_open_finding);
      setRecipientIds(settings.alert_recipients.map(String));
    }
  }, [settings]);

  const recipientOptions = useMemo(
    () =>
      users.map((u) => ({
        value: String(u.id),
        label:
          [u.name, u.surname].filter(Boolean).join(" ").trim() || String(u.email ?? u.id),
      })),
    [users],
  );

  const userName = useMemo(() => {
    const byId = new Map(
      users.map((u) => [Number(u.id), [u.name, u.surname].filter(Boolean).join(" ").trim()]),
    );
    return (id: number | null | undefined) =>
      id != null ? byId.get(Number(id)) || "—" : "Unassigned";
  }, [users]);

  const roleUserId = (role: MrmModelRole): number | null =>
    roles.find((r) => r.role === role)?.user_id ?? null;

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync({
        alert_email_enabled: emailEnabled,
        breach_auto_open_finding: autoOpenFinding,
        alert_recipients: recipientIds.map(Number),
      });
      onSuccess("Alert settings saved");
    } catch (error) {
      onError(mrmErrorMessage(error, "Failed to save alert settings"));
    }
  };

  return (
    <Box>
      <Typography sx={mrmSectionIntroStyle}>
        Who hears about a breach. When an ingested metric breaches its threshold, VerifyWise
        notifies the people assigned to the model&apos;s MRM roles, plus any additional
        recipients configured below. Email delivery and automatic findings are off until you
        enable them here.
      </Typography>

      <Box sx={{ maxWidth: "520px", marginBottom: "32px" }}>
        <Box sx={{ marginBottom: "16px" }}>
          <FormControlLabel
            control={
              <Toggle
                checked={emailEnabled}
                onChange={(e) => setEmailEnabled(e.target.checked)}
              />
            }
            label={<Typography sx={{ fontSize: "13px" }}>Send email alerts</Typography>}
          />
          <Typography sx={{ ...mrmCaptionStyle, marginLeft: "46px" }}>
            Applies to breach and overdue-validation alerts. In-app notifications are always
            on.
          </Typography>
        </Box>

        <Box sx={{ marginBottom: "16px" }}>
          <FormControlLabel
            control={
              <Toggle
                checked={autoOpenFinding}
                onChange={(e) => setAutoOpenFinding(e.target.checked)}
              />
            }
            label={
              <Typography sx={{ fontSize: "13px" }}>
                Automatically open a finding on hard breach
              </Typography>
            }
          />
          <Typography sx={{ ...mrmCaptionStyle, marginLeft: "46px" }}>
            One finding per model and metric while it stays open; warnings never open
            findings.
          </Typography>
        </Box>

        <Box sx={{ marginBottom: "16px" }}>
          <Typography sx={{ fontSize: "13px", fontWeight: 500, marginBottom: "4px" }}>
            Additional recipients
          </Typography>
          <VerifyWiseMultiSelect
            options={recipientOptions}
            selectedValues={recipientIds}
            onChange={setRecipientIds}
            placeholder="Select users"
          />
          <Typography sx={{ ...mrmCaptionStyle, marginTop: "4px" }}>
            These people are alerted for every model, on top of the model&apos;s roles.
          </Typography>
        </Box>

        <CustomizableButton
          variant="contained"
          text="Save alert settings"
          onClick={handleSave}
          isDisabled={updateSettings.isPending}
          testId="mrm-save-alerts-btn"
        />
      </Box>

      <Box sx={{ maxWidth: "360px", marginBottom: "24px" }}>
        <Select
          id="mrm-alerts-model"
          label="Model"
          placeholder="Select a model"
          value={modelId}
          items={fleet.map((row) => ({ _id: row.id, name: fleetModelName(row) }))}
          onChange={(e) => setModelId(Number(e.target.value))}
        />
      </Box>

      {modelId === "" ? (
        <EmptyState message="Select a model to see who is notified of its breaches." />
      ) : (
        <>
          <TableContainer sx={mrmTableContainerStyle}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={mrmTableHeadCellStyle}>Role</TableCell>
                  <TableCell sx={mrmTableHeadCellStyle}>Notified on breach</TableCell>
                  <TableCell sx={mrmTableHeadCellStyle}>Assigned to</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {ROLE_DEFINITIONS.map((def) => (
                  <TableRow key={def.role}>
                    <TableCell sx={mrmTableCellStyle}>{def.label}</TableCell>
                    <TableCell sx={mrmTableCellStyle}>Yes</TableCell>
                    <TableCell sx={mrmTableCellStyle}>{userName(roleUserId(def.role))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Typography sx={{ ...mrmCaptionStyle, marginTop: "12px" }}>
            Notifications are delivered in-app, and by email when email alerts are enabled. A
            threshold set to notify and flag for revalidation also marks the model as due for
            a fresh validation.
          </Typography>
        </>
      )}
    </Box>
  );
};

export default AlertsSection;
```

(The old "intentionally descriptive, not a config form" header comment is gone by design — the section IS a config form now.)

- [ ] **Step 2: Wire the new props in `SettingsTab.tsx`**

Line 317, change:

```tsx
          {section === "alerts" && <AlertsSection users={users} />}
```

to:

```tsx
          {section === "alerts" && (
            <AlertsSection users={users} onError={onError} onSuccess={onSuccess} />
          )}
```

- [ ] **Step 3: Add the i18n entries**

In `Clients/src/i18n/translations.ts`, add these English-keyed entries to ALL THREE locale blocks (`de` near line 146, `fr` near line 9008, `es` near line 17825 — keep each block's alphabetical-ish MRM grouping). Also DELETE the two now-unused old keys from all three blocks (the old intro starting `"Who hears about a breach. When an ingested metric breaches its threshold, VerifyWise notifies the people assigned to the model's MRM roles — no separate recipient list..."` and the old caption starting `"Notifications are delivered in-app. A threshold set to notify..."`), plus the old `"Yes, in-app"` entry if present.

`de`:

```ts
    "Who hears about a breach. When an ingested metric breaches its threshold, VerifyWise notifies the people assigned to the model's MRM roles, plus any additional recipients configured below. Email delivery and automatic findings are off until you enable them here.":
      "Wer von einem Verstoß erfährt. Wenn eine erfasste Metrik ihren Schwellenwert verletzt, benachrichtigt VerifyWise die den MRM-Rollen des Modells zugewiesenen Personen sowie alle unten konfigurierten zusätzlichen Empfänger. E-Mail-Versand und automatische Feststellungen sind deaktiviert, bis Sie sie hier aktivieren.",
    "Send email alerts": "E-Mail-Benachrichtigungen senden",
    "Applies to breach and overdue-validation alerts. In-app notifications are always on.":
      "Gilt für Verstoß- und überfällige Validierungsbenachrichtigungen. In-App-Benachrichtigungen sind immer aktiv.",
    "Automatically open a finding on hard breach":
      "Bei hartem Verstoß automatisch eine Feststellung öffnen",
    "One finding per model and metric while it stays open; warnings never open findings.":
      "Eine Feststellung pro Modell und Metrik, solange sie offen ist; Warnungen öffnen nie Feststellungen.",
    "Additional recipients": "Zusätzliche Empfänger",
    "Select users": "Benutzer auswählen",
    "These people are alerted for every model, on top of the model's roles.":
      "Diese Personen werden für jedes Modell benachrichtigt, zusätzlich zu den Rollen des Modells.",
    "Save alert settings": "Benachrichtigungseinstellungen speichern",
    "Alert settings saved": "Benachrichtigungseinstellungen gespeichert",
    "Failed to save alert settings": "Benachrichtigungseinstellungen konnten nicht gespeichert werden",
    "Notifications are delivered in-app, and by email when email alerts are enabled. A threshold set to notify and flag for revalidation also marks the model as due for a fresh validation.":
      "Benachrichtigungen werden in der App zugestellt und per E-Mail, wenn E-Mail-Benachrichtigungen aktiviert sind. Ein Schwellenwert mit Benachrichtigung und Revalidierungs-Kennzeichnung markiert das Modell zusätzlich als fällig für eine neue Validierung.",
    "Yes": "Ja",
```

`fr`:

```ts
    "Who hears about a breach. When an ingested metric breaches its threshold, VerifyWise notifies the people assigned to the model's MRM roles, plus any additional recipients configured below. Email delivery and automatic findings are off until you enable them here.":
      "Qui est informé d'un dépassement. Lorsqu'une métrique ingérée dépasse son seuil, VerifyWise notifie les personnes affectées aux rôles MRM du modèle, ainsi que les destinataires supplémentaires configurés ci-dessous. L'envoi d'e-mails et les constats automatiques sont désactivés tant que vous ne les activez pas ici.",
    "Send email alerts": "Envoyer des alertes par e-mail",
    "Applies to breach and overdue-validation alerts. In-app notifications are always on.":
      "S'applique aux alertes de dépassement et de validation en retard. Les notifications dans l'application sont toujours actives.",
    "Automatically open a finding on hard breach":
      "Ouvrir automatiquement un constat en cas de dépassement critique",
    "One finding per model and metric while it stays open; warnings never open findings.":
      "Un constat par modèle et par métrique tant qu'il reste ouvert ; les avertissements n'ouvrent jamais de constats.",
    "Additional recipients": "Destinataires supplémentaires",
    "Select users": "Sélectionner des utilisateurs",
    "These people are alerted for every model, on top of the model's roles.":
      "Ces personnes sont alertées pour chaque modèle, en plus des rôles du modèle.",
    "Save alert settings": "Enregistrer les paramètres d'alerte",
    "Alert settings saved": "Paramètres d'alerte enregistrés",
    "Failed to save alert settings": "Échec de l'enregistrement des paramètres d'alerte",
    "Notifications are delivered in-app, and by email when email alerts are enabled. A threshold set to notify and flag for revalidation also marks the model as due for a fresh validation.":
      "Les notifications sont envoyées dans l'application, et par e-mail lorsque les alertes par e-mail sont activées. Un seuil configuré pour notifier et signaler une revalidation marque également le modèle comme devant faire l'objet d'une nouvelle validation.",
    "Yes": "Oui",
```

`es`:

```ts
    "Who hears about a breach. When an ingested metric breaches its threshold, VerifyWise notifies the people assigned to the model's MRM roles, plus any additional recipients configured below. Email delivery and automatic findings are off until you enable them here.":
      "Quién se entera de un incumplimiento. Cuando una métrica ingerida supera su umbral, VerifyWise notifica a las personas asignadas a los roles MRM del modelo, además de los destinatarios adicionales configurados abajo. El envío de correos y los hallazgos automáticos están desactivados hasta que los habilite aquí.",
    "Send email alerts": "Enviar alertas por correo electrónico",
    "Applies to breach and overdue-validation alerts. In-app notifications are always on.":
      "Se aplica a las alertas de incumplimiento y de validación vencida. Las notificaciones en la aplicación siempre están activas.",
    "Automatically open a finding on hard breach":
      "Abrir automáticamente un hallazgo ante un incumplimiento grave",
    "One finding per model and metric while it stays open; warnings never open findings.":
      "Un hallazgo por modelo y métrica mientras permanezca abierto; las advertencias nunca abren hallazgos.",
    "Additional recipients": "Destinatarios adicionales",
    "Select users": "Seleccionar usuarios",
    "These people are alerted for every model, on top of the model's roles.":
      "Estas personas reciben alertas de todos los modelos, además de los roles del modelo.",
    "Save alert settings": "Guardar configuración de alertas",
    "Alert settings saved": "Configuración de alertas guardada",
    "Failed to save alert settings": "No se pudo guardar la configuración de alertas",
    "Notifications are delivered in-app, and by email when email alerts are enabled. A threshold set to notify and flag for revalidation also marks the model as due for a fresh validation.":
      "Las notificaciones se entregan en la aplicación y por correo electrónico cuando las alertas por correo están habilitadas. Un umbral configurado para notificar y marcar para revalidación también marca el modelo como pendiente de una nueva validación.",
    "Yes": "Sí",
```

> Before adding `"Yes"`, grep each block — if the key already exists, skip it there. The i18n audit is the arbiter: run it and add exactly what it reports missing / remove what it reports orphaned.

- [ ] **Step 4: Run all frontend gates**

Run: `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check && npm run build`
Expected: all PASS. Fix any missing/orphaned i18n keys the strict audit reports (the intro/caption strings must match the JSX rendering EXACTLY — `&apos;` renders as `'`).

- [ ] **Step 5: Commit**

```bash
git add Clients/src/presentation/pages/ModelInventory/mrm/AlertsSection.tsx \
        Clients/src/presentation/pages/ModelInventory/mrm/SettingsTab.tsx \
        Clients/src/i18n/translations.ts
git commit -m "feat(mrm): alerts settings UI — email toggle, auto-finding toggle, extra recipients

## Changes
- AlertsSection gains a persisted config card (2 toggles + recipients
  multi-select + save) above the role-derived explainer table
- section copy reflects the new reality; stale display-only comment removed
- SettingsTab passes onError/onSuccess; de/fr/es for every new string"
```

---

### Task 11: Docs, full gates, push

**Files:**
- Modify: `docs/technical/domains/mrm.md` (as-built: alerts config, email delivery, auto-findings, overdue claim — add a section mirroring the retention one added by gap #1; update the "Last Updated" date)

**Interfaces:**
- Consumes: everything above.
- Produces: a green, pushed branch.

- [ ] **Step 1: Update the domain doc**

Add an "Alerts: email delivery + configuration (gaps #2+#3)" section to `docs/technical/domains/mrm.md` covering, in the doc's existing as-built style: the `mrm_org_settings` alert columns + `mrm_alert_recipients` + `auto_metric` + `overdue_notified_at` schema; recipient union (roles ∪ extras); dual dispatch via `sendInAppNotification` with the two MJML templates; auto-finding trigger/dedup/lock semantics; the once-per-lifecycle overdue claim (and WHY `created_validation` was not usable); the partial PUT contract of `/api/mrm/settings`. Reference file paths: `Servers/utils/mrmAlerts.utils.ts`, `Servers/controllers/mrmMonitoring.ctrl.ts` (`handleBreaches`), `Servers/services/automations/actions/mrmRevalidationSweep.ts`, `Servers/controllers/mrmSettings.ctrl.ts`. Update the "Last Updated" date to the current date.

- [ ] **Step 2: Full gate sweep**

Run each; ALL must pass:

```bash
cd Servers && npm run build && npm run test:unit && npm run format-check
cd Servers && npm run test:integration
cd Servers && npm run check:api-drift
cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check && npm run build
```

If a format-check fails: `npm run format` in that package, re-run, and fold the fixes into the docs commit.
Also grep the full branch diff (`git diff develop...HEAD`) case-insensitively for the two known competitor names (pattern kept in local memory, not in this repo) — expect no matches.

- [ ] **Step 3: Commit + push (background)**

```bash
git add docs/technical/domains/mrm.md
git commit -m "docs(mrm): alerts email + config as-built (gaps #2+#3)"
git push -u origin feat/mrm-alerts   # run in background
```

Do NOT open a PR — explicit user ask required. Note for the operator: #4252 (`feat/mrm-retention`) must merge first; this branch stays stacked until then.

---

## Self-Review Notes (done at plan time)

- **Spec coverage:** §1 → Task 1; §2 → Tasks 3, 6, 7; §3 → Task 5 (+7 wiring); §4 (as amended) → Task 8; §5 → Tasks 2, 4, 9, 10; §6 unit → Tasks 3/5/6/7/8 unit files (email service never real: unit tests mock `inAppNotification.service`; integration setup mocks it globally); §6 integration → Tasks 3/4/5/8 sections of `mrm-alerts.isolation.test.ts`. Spec's "warn with toggle on / breach with toggle off → no finding" integration bullets are covered in Task 5's first isolation test (the predicate lives INSIDE `maybeAutoOpenFindingForBreach`, so the integration call exercises the real path).
- **Deliberate deviations from the spec, already reflected in the spec file:** the §4 amendment (overdue claim). Additionally, `severity high→high / critical→critical` mapping returns `null` for `warn` (defensive; unreachable through the predicate).
- **Type consistency spot-checks:** `upsertMrmOrgSettings(orgId, update, tx?)` used identically in Tasks 2/4; `maybeAutoOpenFindingForBreach(orgId, modelId, metric, status, thresholdSeverity, enabled)` identical in Tasks 5/7; `dispatchAlerts(orgId, recipients, notification, emailEnabled, email)` identical in Tasks 6/7/8; `notifyRevalidationDue(orgId, modelId, validationId, nextDue)` identical in Task 8's util/sweep/tests; frontend `IMrmOrgSettingsUpdate` identical in Tasks 9/10.
