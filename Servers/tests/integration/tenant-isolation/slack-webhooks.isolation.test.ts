jest.setTimeout(60000);
// Creating a connection encrypts the Slack token, and tools/createSecureValue
// reads the algorithm when it loads. Every deployment sets it (Helm, Ansible,
// install.sh); the integration environment does not, so use the same default.
process.env.ENCRYPTION_ALGORITHM ??= "aes-256-cbc";

import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { cleanupDatabase, createTestUser } from "../helpers";
import { createTestApp, testRequest } from "../setup";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { getDeliverableSlackWebhooksQuery } from "../../../utils/slackWebhook.utils";
import { SlackNotificationRoutingType } from "../../../domain.layer/enums/slack.enum";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const unlinkedCleanup = require("../../../database/migrations/20261115100000-slack-webhooks-unlinked-cleanup.js");

const BASE = "/api/extensions/slack/oauth/workspaces";
const UNLINKED = "/api/extensions/slack/oauth/unlinked";
const ROUTING = SlackNotificationRoutingType.MEMBERSHIP_AND_ROLES;

/**
 * slack_webhooks and the /api/extensions/slack routes, plus the delivery
 * query. Every connection belongs to an organization: management routes are
 * Admin-only and answer 404 for another organization's id, and delivery never
 * reads another organization's connection.
 *
 * setup.ts mocks slackNotificationService with sendSlackNotification only, so
 * delivery is checked on getDeliverableSlackWebhooksQuery directly, and the
 * two service functions the routes call are stubbed on that mock here.
 */
const slackService = jest.requireMock("../../../services/slack/slackNotificationService");

async function enableSlack(orgId: number, userId: number): Promise<void> {
  await sequelize.query(
    `INSERT INTO extension_enablements (organization_id, extension_id, enabled, enabled_at, enabled_by)
     SELECT :orgId, e.id, TRUE, now(), :userId FROM extensions e WHERE e.key = 'slack'
     ON CONFLICT (organization_id, extension_id) DO UPDATE SET enabled = TRUE, enabled_at = now();`,
    { replacements: { orgId, userId } },
  );
}

async function insertConnection(options: {
  orgId: number | null;
  userId: number | null;
  scope: "user" | "organization";
  channel?: string;
}): Promise<number> {
  const [rows] = await sequelize.query(
    `INSERT INTO slack_webhooks
       (organization_id, user_id, delivery_scope, access_token, access_token_iv, scope,
        team_name, team_id, channel, channel_id, configuration_url, url, url_iv,
        is_active, routing_type)
     VALUES (:orgId, :userId, :scope, 'token', 'iv', 'incoming-webhook', 'Acme', 'T1',
             :channel, 'C1', 'https://acme.slack.com/config', 'url', 'iv', TRUE,
             CAST(:routing AS text[]))
     RETURNING id`,
    {
      replacements: {
        orgId: options.orgId,
        userId: options.userId,
        scope: options.scope,
        channel: options.channel ?? "#general",
        routing: `{"${ROUTING}"}`,
      },
    },
  );
  return (rows as Array<{ id: number }>)[0].id;
}

async function connectionRow(id: number) {
  const rows = await sequelize.query<{
    id: number;
    organization_id: number | null;
    user_id: number | null;
    delivery_scope: string;
    is_active: boolean;
  }>(
    `SELECT id, organization_id, user_id, delivery_scope, is_active
       FROM slack_webhooks WHERE id = :id`,
    { replacements: { id }, type: QueryTypes.SELECT },
  );
  return rows[0];
}

/** An Editor of `orgId`, as a request agent. */
async function editorOf(orgId: number) {
  const userId = await createTestUser(
    orgId,
    3,
    `slack-editor-${Date.now()}@test.com`,
    "Password123!",
  );
  const app = await createTestApp({
    bypassAuth: true,
    mockUser: { userId, organizationId: orgId, role: "Editor" },
  });
  return testRequest(app);
}

/** Another Admin of `orgId`, as a request agent, with their user id. */
async function adminOf(orgId: number) {
  const userId = await createTestUser(
    orgId,
    1,
    `slack-admin-${Date.now()}@test.com`,
    "Password123!",
  );
  const app = await createTestApp({
    bypassAuth: true,
    mockUser: { userId, organizationId: orgId, role: "Admin" },
  });
  return { userId, request: testRequest(app) };
}

const deliverableIds = async (params: Parameters<typeof getDeliverableSlackWebhooksQuery>[0]) =>
  (await getDeliverableSlackWebhooksQuery(params))
    .map((row) => Number(row.id))
    .sort((a, b) => a - b);

describe("slack webhooks tenant isolation", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    slackService.inviteBotToChannel = jest.fn().mockResolvedValue({ success: true });
    slackService.sendImmediateMessage = jest
      .fn()
      .mockResolvedValue({ success: true, messageId: "1", channel: "C1" });
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    await cleanupDatabase();
  });

  it("never lists, shows, changes, deletes or sends to another organization's connection", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    await enableSlack(owner.orgId, owner.userId);
    await enableSlack(attacker.orgId, attacker.userId);
    const id = await insertConnection({
      orgId: owner.orgId,
      userId: owner.userId,
      scope: "organization",
    });

    // The owner's Admin sees it, so the 404s below mean isolation.
    const ownList = await owner.request.get(BASE);
    expect(ownList.status).toBe(200);
    expect(ownList.body.data.map((row: { id: number }) => row.id)).toContain(id);
    expect((await owner.request.get(`${BASE}/${id}`)).status).toBe(200);

    const list = await attacker.request.get(BASE);
    expect(list.status).toBe(200);
    expect(list.body.data.map((row: { id: number }) => row.id)).not.toContain(id);
    expect((await attacker.request.get(`${BASE}/${id}`)).status).toBe(404);
    expect((await attacker.request.patch(`${BASE}/${id}`).send({ is_active: false })).status).toBe(
      404,
    );
    expect((await attacker.request.patch(`${BASE}/${id}`).send({ routing_type: [] })).status).toBe(
      404,
    );
    expect((await attacker.request.delete(`${BASE}/${id}`)).status).toBe(404);
    expect(
      (await attacker.request.post(`${BASE}/${id}/send`).send({ title: "t", message: "m" })).status,
    ).toBe(404);
    expect(slackService.sendImmediateMessage).not.toHaveBeenCalled();

    const row = await connectionRow(id);
    expect(row).toMatchObject({ organization_id: owner.orgId, is_active: true });
  });

  it("hides a connection with no organization from every route", async () => {
    const { owner } = await seedTwoTenantContexts();
    await enableSlack(owner.orgId, owner.userId);
    const orphan = await insertConnection({ orgId: null, userId: owner.userId, scope: "user" });

    const list = await owner.request.get(BASE);
    expect(list.status).toBe(200);
    expect(list.body.data.map((row: { id: number }) => row.id)).not.toContain(orphan);
    expect((await owner.request.get(`${BASE}/${orphan}`)).status).toBe(404);
    expect((await owner.request.delete(`${BASE}/${orphan}`)).status).toBe(404);
    expect(await connectionRow(orphan)).toBeDefined();
  });

  it("refuses an Editor every management route", async () => {
    const { owner } = await seedTwoTenantContexts();
    await enableSlack(owner.orgId, owner.userId);
    const id = await insertConnection({
      orgId: owner.orgId,
      userId: owner.userId,
      scope: "organization",
    });
    const editor = await editorOf(owner.orgId);

    expect((await editor.get(BASE)).status).toBe(403);
    expect((await editor.get(`${BASE}/${id}`)).status).toBe(403);
    expect((await editor.post(BASE).send({ code: "abc" })).status).toBe(403);
    expect((await editor.patch(`${BASE}/${id}`).send({ is_active: false })).status).toBe(403);
    expect((await editor.delete(`${BASE}/${id}`)).status).toBe(403);
    expect(
      (await editor.post(`${BASE}/${id}/send`).send({ title: "t", message: "m" })).status,
    ).toBe(403);
    expect(slackService.sendImmediateMessage).not.toHaveBeenCalled();
    expect(await connectionRow(id)).toMatchObject({ is_active: true });
  });

  it("stores a new connection under the caller's organization and user, whatever the body says", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    await enableSlack(owner.orgId, owner.userId);
    process.env.SLACK_API_URL = "https://slack.test/api/oauth.v2.access";
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({
        ok: true,
        access_token: "xoxb-token",
        scope: "incoming-webhook,chat:write",
        team: { name: "Acme", id: "T1" },
        incoming_webhook: {
          channel: "#alerts",
          channel_id: "C2",
          configuration_url: "https://acme.slack.com/config",
          url: "https://hooks.slack.com/services/x",
        },
        authed_user: { access_token: "xoxp-user" },
        bot_user_id: "B1",
      }),
    }) as unknown as typeof fetch;

    const res = await owner.request
      .post(BASE)
      .send({ code: "abc", userId: attacker.userId, organizationId: attacker.orgId });

    expect(res.status).toBe(201);
    expect(await connectionRow(res.body.data.id)).toMatchObject({
      organization_id: owner.orgId,
      user_id: owner.userId,
      delivery_scope: "organization",
    });
  });

  it("saving routing makes a connection organization-wide; toggling it does not", async () => {
    const { owner } = await seedTwoTenantContexts();
    await enableSlack(owner.orgId, owner.userId);
    const id = await insertConnection({ orgId: owner.orgId, userId: owner.userId, scope: "user" });

    expect((await owner.request.patch(`${BASE}/${id}`).send({ is_active: false })).status).toBe(
      202,
    );
    expect(await connectionRow(id)).toMatchObject({ is_active: false, delivery_scope: "user" });

    expect(
      (await owner.request.patch(`${BASE}/${id}`).send({ routing_type: [ROUTING] })).status,
    ).toBe(202);
    expect(await connectionRow(id)).toMatchObject({ delivery_scope: "organization" });

    expect(
      (await owner.request.patch(`${BASE}/${id}`).send({ routing_type: ["Everything"] })).status,
    ).toBe(400);
  });

  it("delivery never reads another organization's connection", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const colleague = await createTestUser(
      owner.orgId,
      1,
      `slack-colleague-${Date.now()}@test.com`,
      "Password123!",
    );
    const orgWide = await insertConnection({
      orgId: owner.orgId,
      userId: null,
      scope: "organization",
    });
    const ownersOwn = await insertConnection({
      orgId: owner.orgId,
      userId: owner.userId,
      scope: "user",
    });
    const colleaguesOwn = await insertConnection({
      orgId: owner.orgId,
      userId: colleague,
      scope: "user",
    });
    const otherOrg = await insertConnection({
      orgId: attacker.orgId,
      userId: attacker.userId,
      scope: "organization",
    });
    const base = { organizationId: owner.orgId, routingType: ROUTING };

    // No user: organization-wide connections only (one with no owner included).
    expect(await deliverableIds(base)).toEqual([orgWide]);
    // A user: organization-wide plus that user's own user-scope connection.
    expect(await deliverableIds({ ...base, userId: owner.userId })).toEqual([orgWide, ownersOwn]);
    expect(await deliverableIds({ ...base, userId: colleague })).toEqual([orgWide, colleaguesOwn]);
    // Own connections only: the user's user-scope connection, never organization-wide.
    expect(
      await deliverableIds({ ...base, userId: owner.userId, ownConnectionsOnly: true }),
    ).toEqual([ownersOwn]);
    // The other organization's connection is never read, even for its owner's id.
    expect(await deliverableIds({ ...base, userId: attacker.userId })).toEqual([orgWide]);
    expect(await deliverableIds({ organizationId: attacker.orgId, routingType: ROUTING })).toEqual([
      otherOrg,
    ]);
  });

  describe("connections with no organization", () => {
    it("their owner lists and removes them; nobody else can", async () => {
      const { owner, attacker } = await seedTwoTenantContexts();
      await enableSlack(owner.orgId, owner.userId);
      await enableSlack(attacker.orgId, attacker.userId);
      const colleague = await adminOf(owner.orgId);
      const unlinked = await insertConnection({
        orgId: null,
        userId: owner.userId,
        scope: "user",
        channel: "#old",
      });
      const linked = await insertConnection({
        orgId: owner.orgId,
        userId: owner.userId,
        scope: "organization",
      });

      const list = await owner.request.get(UNLINKED);
      expect(list.status).toBe(200);
      expect(list.body.data).toEqual([
        expect.objectContaining({ id: unlinked, team_name: "Acme", channel: "#old" }),
      ]);
      // No token, no webhook URL.
      expect(Object.keys(list.body.data[0]).sort()).toEqual([
        "channel",
        "created_at",
        "id",
        "team_name",
      ]);

      // Another Admin of the same organization and another organization's Admin
      // see nothing and cannot remove it.
      for (const other of [colleague.request, attacker.request]) {
        const otherList = await other.get(UNLINKED);
        expect(otherList.status).toBe(200);
        expect(otherList.body.data).toEqual([]);
        expect((await other.delete(`${UNLINKED}/${unlinked}`)).status).toBe(404);
      }
      expect(await connectionRow(unlinked)).toBeDefined();

      // An organization's connection is not reachable through this route.
      expect((await owner.request.delete(`${UNLINKED}/${linked}`)).status).toBe(404);
      expect(await connectionRow(linked)).toBeDefined();

      expect((await owner.request.delete(`${UNLINKED}/${unlinked}`)).status).toBe(204);
      expect(await connectionRow(unlinked)).toBeUndefined();
      expect((await owner.request.delete(`${UNLINKED}/${unlinked}`)).status).toBe(404);
      expect((await owner.request.get(UNLINKED)).body.data).toEqual([]);
    });

    it("refuses an Editor both routes", async () => {
      const { owner } = await seedTwoTenantContexts();
      await enableSlack(owner.orgId, owner.userId);
      const unlinked = await insertConnection({ orgId: null, userId: owner.userId, scope: "user" });
      const editor = await editorOf(owner.orgId);

      expect((await editor.get(UNLINKED)).status).toBe(403);
      expect((await editor.delete(`${UNLINKED}/${unlinked}`)).status).toBe(403);
      expect(await connectionRow(unlinked)).toBeDefined();
    });

    it("the cleanup migration deletes only rows with neither organization nor owner", async () => {
      const { owner } = await seedTwoTenantContexts();
      const ownerless = await insertConnection({ orgId: null, userId: null, scope: "user" });
      const unlinked = await insertConnection({ orgId: null, userId: owner.userId, scope: "user" });
      const orgWide = await insertConnection({
        orgId: owner.orgId,
        userId: null,
        scope: "organization",
      });

      await unlinkedCleanup.up({ sequelize });

      expect(await connectionRow(ownerless)).toBeUndefined();
      expect(await connectionRow(unlinked)).toBeDefined();
      expect(await connectionRow(orgWide)).toBeDefined();
    });

    it("does not let PUBLIC execute the cross-tenant helpers", async () => {
      for (const fn of [
        "verifywise.slack_unlinked_connections(integer)",
        "verifywise.delete_unlinked_slack_connection(integer, integer)",
      ]) {
        const [row] = await sequelize.query<{ public_can: boolean; app_can: boolean }>(
          `SELECT has_function_privilege('public', :fn, 'EXECUTE') AS public_can,
                  has_function_privilege('verifywise_app', :fn, 'EXECUTE') AS app_can`,
          { replacements: { fn }, type: QueryTypes.SELECT },
        );
        expect(row).toEqual({ public_can: false, app_can: true });
      }
    });
  });
});
