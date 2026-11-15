/**
 * Slack connection routes (/api/extensions/slack/oauth/workspaces): who may
 * call them, where the owner and organization come from, and how another
 * organization's id and malformed PATCH bodies are answered. The SQL filters
 * are covered in utils/__tests__/slackWebhook.utils.test.ts and against a real
 * database in tests/integration/tenant-isolation/slack-webhooks.isolation.test.ts.
 */
import request from "supertest";
import express from "express";

jest.mock("../../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, _res: any, next: any) => {
    req.userId = 9;
    req.organizationId = 42;
    req.role = req.headers["x-test-role"] ?? "Admin";
    req.t = (key: string) => key;
    next();
  },
}));
jest.mock("../../../middleware/requireExtensionEnabled.middleware", () => ({
  requireExtensionEnabled: () => (_req: any, _res: any, next: any) => next(),
}));
jest.mock("../../../middleware/rateLimit.middleware", () => ({
  slackWorkspaceCreateLimiter: (_req: any, _res: any, next: any) => next(),
}));
// The real authorize() over the static built-in role matrix (no database).
jest.mock("../../../utils/rolePermissions.utils", () => {
  const { BUILTIN_ROLE_PERMISSIONS } = jest.requireActual("../../../config/rolePermissions.config");
  return {
    requestHasPermission: jest.fn(
      async (req: any, key: string) => BUILTIN_ROLE_PERMISSIONS[req.role]?.has(key) ?? false,
    ),
  };
});
jest.mock("../../../database/db", () => ({ sequelize: {} }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  logStructured: jest.fn(),
}));
jest.mock("../../../utils/logger/dbLogger", () => ({ logEvent: jest.fn() }));
jest.mock("../../../services/slack/slackNotificationService", () => ({
  inviteBotToChannel: jest.fn(async () => ({ success: true })),
  sendImmediateMessage: jest.fn(async () => ({ success: true, messageId: "1", channel: "C1" })),
}));
jest.mock("../../../domain.layer/models/slackNotification/slackWebhook.model", () => ({
  SlackWebhookModel: {
    createNewSlackWebhook: jest.fn(async (...args: unknown[]) => ({
      user_id: args[8],
      validateSlackWebhookData: jest.fn(),
    })),
  },
}));
jest.mock("../../../utils/slackWebhook.utils", () => ({
  getSlackWebhooksByOrganizationQuery: jest.fn(async () => []),
  getSlackWebhookByIdAndOrganizationQuery: jest.fn(async () => null),
  createNewSlackWebhookQuery: jest.fn(async (data: any) => ({ id: 1, ...data })),
  updateSlackWebhookByIdQuery: jest.fn(async () => null),
  deleteSlackWebhookByIdQuery: jest.fn(async () => false),
  // The managed, organization-bound transaction: runs the work with a fake one.
  withOrganizationScope: jest.fn(async (_org: number, work: (t: unknown) => unknown) =>
    work({ id: "txn" }),
  ),
}));

import * as queries from "../../../utils/slackWebhook.utils";
import { SlackWebhookModel } from "../../../domain.layer/models/slackNotification/slackWebhook.model";
import { sendImmediateMessage } from "../../../services/slack/slackNotificationService";
import slackRoutes from "../slack.route";

const q = queries as jest.Mocked<typeof queries>;

const app = express();
app.use(express.json());
app.use("/api/extensions/slack", slackRoutes);

const BASE = "/api/extensions/slack/oauth/workspaces";
const ROUTING = "Membership and roles";

const connection = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 5,
    organization_id: 42,
    is_active: true,
    channel: "#general",
    toJSON() {
      return { id: 5, channel: "#general" };
    },
    ...overrides,
  }) as any;

const call = (method: "get" | "post" | "patch" | "delete", path: string, role?: string) => {
  const req = request(app)[method](path);
  return role ? req.set("x-test-role", role) : req;
};

const oauthResponse = {
  ok: true,
  access_token: "xoxb-token",
  scope: "incoming-webhook,chat:write",
  team: { name: "Acme", id: "T1" },
  incoming_webhook: {
    channel: "#general",
    channel_id: "C1",
    configuration_url: "https://acme.slack.com/config",
    url: "https://hooks.slack.com/services/x",
  },
  authed_user: { access_token: "xoxp-user" },
  bot_user_id: "B1",
};

beforeEach(() => {
  jest.clearAllMocks();
  // Defaults: the organization has no row with the requested id.
  q.getSlackWebhooksByOrganizationQuery.mockResolvedValue([]);
  q.getSlackWebhookByIdAndOrganizationQuery.mockResolvedValue(null);
  q.updateSlackWebhookByIdQuery.mockResolvedValue(null);
  q.deleteSlackWebhookByIdQuery.mockResolvedValue(false);
  q.withOrganizationScope.mockImplementation(async (_org, work) => work({ id: "txn" } as any));
  process.env.SLACK_API_URL = "https://slack.test/api/oauth.v2.access";
  global.fetch = jest.fn(async () => ({ json: async () => oauthResponse })) as any;
});

describe("role matrix: every route needs extension.admin", () => {
  const routes: Array<["get" | "post" | "patch" | "delete", string, object | undefined]> = [
    ["get", BASE, undefined],
    ["get", `${BASE}/5`, undefined],
    ["post", BASE, { code: "abc" }],
    ["patch", `${BASE}/5`, { is_active: false }],
    ["delete", `${BASE}/5`, undefined],
    ["post", `${BASE}/5/send`, { title: "t", message: "m" }],
  ];

  it.each(
    ["Editor", "Reviewer", "Auditor"].flatMap((role) =>
      routes.map(([method, path, body]) => [role, method, path, body] as const),
    ),
  )("%s gets 403 on %s %s and nothing is read or written", async (role, method, path, body) => {
    const res = await call(method, path, role).send(body);

    expect(res.status).toBe(403);
    for (const fn of [
      q.getSlackWebhooksByOrganizationQuery,
      q.getSlackWebhookByIdAndOrganizationQuery,
      q.createNewSlackWebhookQuery,
      q.updateSlackWebhookByIdQuery,
      q.deleteSlackWebhookByIdQuery,
    ]) {
      expect(fn).not.toHaveBeenCalled();
    }
    expect(sendImmediateMessage).not.toHaveBeenCalled();
  });

  it.each(routes)("Admin passes the gate on %s %s", async (method, path, body) => {
    q.getSlackWebhookByIdAndOrganizationQuery.mockResolvedValue(connection());
    q.updateSlackWebhookByIdQuery.mockResolvedValue(connection());
    q.deleteSlackWebhookByIdQuery.mockResolvedValue(true);

    const res = await call(method, path, "Admin").send(body);

    expect(res.status).not.toBe(403);
    expect(res.status).toBeLessThan(300);
  });
});

describe("owner and organization come from the token", () => {
  it("create stores the caller as owner and the caller's organization, ignoring the body", async () => {
    const res = await call("post", BASE).send({ code: "abc", userId: 999, organizationId: 7 });

    expect(res.status).toBe(201);
    const args = (SlackWebhookModel.createNewSlackWebhook as jest.Mock).mock.calls[0];
    expect(args[8]).toBe(9);
    const stored = q.createNewSlackWebhookQuery.mock.calls[0][0];
    expect(stored).toMatchObject({ user_id: 9, organization_id: 42 });
  });

  it("list reads the caller's organization, ignoring a userId in the query", async () => {
    const res = await call("get", `${BASE}?userId=999`);

    expect(res.status).toBe(200);
    expect(q.getSlackWebhooksByOrganizationQuery).toHaveBeenCalledWith(42, undefined);
  });

  it("list passes a channel filter through", async () => {
    await call("get", `${BASE}?channel=%23general`);
    expect(q.getSlackWebhooksByOrganizationQuery).toHaveBeenCalledWith(42, "#general");
  });
});

describe("another organization's id answers 404 like a missing one", () => {
  // The org-scoped queries return null/false for another organization's row.
  it("get", async () => {
    const res = await call("get", `${BASE}/5`);
    expect(res.status).toBe(404);
    expect(q.getSlackWebhookByIdAndOrganizationQuery).toHaveBeenCalledWith(5, 42);
  });

  it("patch", async () => {
    const res = await call("patch", `${BASE}/5`).send({ is_active: false });
    expect(res.status).toBe(404);
    expect(q.updateSlackWebhookByIdQuery).toHaveBeenCalledWith(
      5,
      42,
      { is_active: false },
      expect.anything(),
    );
  });

  it("delete", async () => {
    const res = await call("delete", `${BASE}/5`);
    expect(res.status).toBe(404);
    expect(q.deleteSlackWebhookByIdQuery).toHaveBeenCalledWith(5, 42, expect.anything());
  });

  it("send, without posting anything", async () => {
    const res = await call("post", `${BASE}/5/send`).send({ title: "t", message: "m" });
    expect(res.status).toBe(404);
    expect(q.getSlackWebhookByIdAndOrganizationQuery).toHaveBeenCalledWith(5, 42);
    expect(sendImmediateMessage).not.toHaveBeenCalled();
  });
});

describe("writes run in a transaction bound to the caller's organization (RLS)", () => {
  it("create inserts and invites the bot inside the scope", async () => {
    const res = await call("post", BASE).send({ code: "abc" });

    expect(res.status).toBe(201);
    expect(q.withOrganizationScope).toHaveBeenCalledWith(42, expect.any(Function));
    expect(q.createNewSlackWebhookQuery.mock.calls[0][1]).toEqual({ id: "txn" });
  });

  it("update", async () => {
    q.updateSlackWebhookByIdQuery.mockResolvedValue(connection());

    const res = await call("patch", `${BASE}/5`).send({ is_active: false });

    expect(res.status).toBe(202);
    expect(q.withOrganizationScope).toHaveBeenCalledWith(42, expect.any(Function));
    expect(q.updateSlackWebhookByIdQuery.mock.calls[0][3]).toEqual({ id: "txn" });
  });

  it("delete", async () => {
    q.deleteSlackWebhookByIdQuery.mockResolvedValue(true);

    const res = await call("delete", `${BASE}/5`);

    expect(res.status).toBe(204);
    expect(q.withOrganizationScope).toHaveBeenCalledWith(42, expect.any(Function));
    expect(q.deleteSlackWebhookByIdQuery.mock.calls[0][2]).toEqual({ id: "txn" });
  });

  it("a failing write inside the scope answers 500 (the scope rolls back)", async () => {
    q.updateSlackWebhookByIdQuery.mockRejectedValue(new Error("rls denied"));

    const res = await call("patch", `${BASE}/5`).send({ is_active: false });

    expect(res.status).toBe(500);
  });
});

describe("send", () => {
  it("posts to that connection only", async () => {
    const row = connection();
    q.getSlackWebhookByIdAndOrganizationQuery.mockResolvedValue(row);

    const res = await call("post", `${BASE}/5/send`).send({ title: "t", message: "m" });

    expect(res.status).toBe(200);
    expect(sendImmediateMessage).toHaveBeenCalledTimes(1);
    expect(sendImmediateMessage).toHaveBeenCalledWith(row, { title: "t", message: "m" });
  });

  it("refuses an inactive connection with 400", async () => {
    q.getSlackWebhookByIdAndOrganizationQuery.mockResolvedValue(connection({ is_active: false }));

    const res = await call("post", `${BASE}/5/send`).send({ title: "t", message: "m" });

    expect(res.status).toBe(400);
    expect(sendImmediateMessage).not.toHaveBeenCalled();
  });
});

describe("PATCH body", () => {
  beforeEach(() => q.updateSlackWebhookByIdQuery.mockResolvedValue(connection()));

  it("passes routing_type to the update (which also makes the connection organization-wide)", async () => {
    const res = await call("patch", `${BASE}/5`).send({ routing_type: [ROUTING, ROUTING] });

    expect(res.status).toBe(202);
    expect(q.updateSlackWebhookByIdQuery).toHaveBeenCalledWith(
      5,
      42,
      { routing_type: [ROUTING] },
      expect.anything(),
    );
  });

  it("accepts an empty routing list", async () => {
    const res = await call("patch", `${BASE}/5`).send({ routing_type: [] });
    expect(res.status).toBe(202);
  });

  it("passes is_active alone without routing_type", async () => {
    const res = await call("patch", `${BASE}/5`).send({ is_active: true });

    expect(res.status).toBe(202);
    expect(q.updateSlackWebhookByIdQuery.mock.calls[0][2]).toEqual({ is_active: true });
  });

  it.each([
    ["an empty body", {}],
    ["an unknown field", { is_active: true, user_id: 3 }],
    ["delivery_scope", { delivery_scope: "organization" }],
    ["routing_type as a string", { routing_type: ROUTING }],
    ["an unknown routing type", { routing_type: [ROUTING, "Everything"] }],
    ["a non-string routing type", { routing_type: [1] }],
    ["is_active as a string", { is_active: "false" }],
    ["an array body", [ROUTING]],
  ])("answers 400 for %s and updates nothing", async (_label, body) => {
    const res = await call("patch", `${BASE}/5`).send(body as object);

    expect(res.status).toBe(400);
    expect(q.updateSlackWebhookByIdQuery).not.toHaveBeenCalled();
  });
});

describe("id parameter", () => {
  it.each(["abc", "0", "-1", "2147483648", "1.5"])("answers 400 for %s", async (id) => {
    const res = await call("get", `${BASE}/${id}`);

    expect(res.status).toBe(400);
    expect(q.getSlackWebhookByIdAndOrganizationQuery).not.toHaveBeenCalled();
  });
});
