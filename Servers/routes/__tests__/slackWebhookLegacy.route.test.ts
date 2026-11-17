/**
 * The deprecated legacy alias /api/slackWebhooks (routes/slackWebhook.route.ts)
 * must be gated exactly like /api/extensions/slack/oauth/workspaces: the Slack
 * extension enabled, "extension.admin" (Admin), and the create rate limiter.
 * Handler behaviour itself is covered in
 * extensions/slack/__tests__/slack.route.test.ts.
 */
import request from "supertest";
import express from "express";

const gateKeys: string[] = [];
let extensionEnabled = true;

jest.mock("../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, _res: any, next: any) => {
    req.userId = 9;
    req.organizationId = 42;
    req.role = req.headers["x-test-role"] ?? "Admin";
    req.t = (key: string) => key;
    next();
  },
}));
jest.mock("../../middleware/requireExtensionEnabled.middleware", () => ({
  requireExtensionEnabled: (key: string) => {
    gateKeys.push(key);
    return (_req: any, res: any, next: any) =>
      extensionEnabled ? next() : res.status(403).json({ message: "disabled" });
  },
}));
const mockCreateLimiter = jest.fn((_req: any, _res: any, next: any) => next());
jest.mock("../../middleware/rateLimit.middleware", () => ({
  slackWorkspaceCreateLimiter: (req: any, res: any, next: any) => mockCreateLimiter(req, res, next),
}));
// The real authorize() over the static built-in role matrix (no database).
jest.mock("../../utils/rolePermissions.utils", () => {
  const { BUILTIN_ROLE_PERMISSIONS } = jest.requireActual("../../config/rolePermissions.config");
  return {
    requestHasPermission: jest.fn(
      async (req: any, key: string) => BUILTIN_ROLE_PERMISSIONS[req.role]?.has(key) ?? false,
    ),
  };
});
jest.mock("../../controllers/slackWebhook.ctrl", () => {
  const reached = (name: string) => (_req: any, res: any) =>
    res.status(200).json({ handler: name });
  return {
    getAllSlackWebhooks: reached("getAllSlackWebhooks"),
    getSlackWebhookById: reached("getSlackWebhookById"),
    createNewSlackWebhook: reached("createNewSlackWebhook"),
    updateSlackWebhookById: reached("updateSlackWebhookById"),
    deleteSlackWebhookById: reached("deleteSlackWebhookById"),
    sendSlackMessage: reached("sendSlackMessage"),
  };
});

import slackWebhookRoutes from "../slackWebhook.route";

const app = express();
app.use(express.json());
app.use("/api/slackWebhooks", slackWebhookRoutes);

const BASE = "/api/slackWebhooks";

const routes: Array<["get" | "post" | "patch" | "delete", string, string]> = [
  ["get", BASE, "getAllSlackWebhooks"],
  ["get", `${BASE}/5`, "getSlackWebhookById"],
  ["post", BASE, "createNewSlackWebhook"],
  ["patch", `${BASE}/5`, "updateSlackWebhookById"],
  ["delete", `${BASE}/5`, "deleteSlackWebhookById"],
  ["post", `${BASE}/5/send`, "sendSlackMessage"],
];

const call = (method: "get" | "post" | "patch" | "delete", path: string, role: string) =>
  request(app)[method](path).set("x-test-role", role).send({});

beforeEach(() => {
  extensionEnabled = true;
  mockCreateLimiter.mockClear();
});

describe("legacy /api/slackWebhooks alias", () => {
  it("is gated on the slack extension", () => {
    expect(gateKeys).toEqual(["slack"]);
  });

  it.each(
    ["Editor", "Reviewer", "Auditor"].flatMap((role) =>
      routes.map(([method, path]) => [role, method, path] as const),
    ),
  )("%s gets 403 on %s %s", async (role, method, path) => {
    const res = await call(method, path, role);

    expect(res.status).toBe(403);
    expect(res.body.handler).toBeUndefined();
  });

  it.each(routes)("Admin reaches the handler on %s %s", async (method, path, handler) => {
    const res = await call(method, path, "Admin");

    expect(res.status).toBe(200);
    expect(res.body.handler).toBe(handler);
  });

  it.each(routes)("a disabled extension blocks %s %s", async (method, path) => {
    extensionEnabled = false;

    const res = await call(method, path, "Admin");

    expect(res.status).toBe(403);
    expect(res.body.handler).toBeUndefined();
  });

  it("create goes through the Slack workspace create limiter", async () => {
    await call("post", BASE, "Admin");
    expect(mockCreateLimiter).toHaveBeenCalledTimes(1);

    await call("patch", `${BASE}/5`, "Admin");
    expect(mockCreateLimiter).toHaveBeenCalledTimes(1);
  });
});
