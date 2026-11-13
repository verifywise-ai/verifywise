import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/aiDetectionRepository.utils", () => ({
  getRepositoriesForWebhookQuery: jest.fn(),
  recordWebhookDeliveryQuery: jest.fn(),
}));

jest.mock("../../services/webhook.service", () => ({
  verifyGitHubSignature: jest.fn(),
  handlePushEvent: jest.fn(),
  handlePullRequestEvent: jest.fn(),
}));

jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
  logStructured: jest.fn(),
}));

jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (data: any) => ({ message: "OK", data }),
    400: (data: any) => ({ message: "Bad Request", data }),
    401: (data: any) => ({ message: "Unauthorized", data }),
  },
}));

import { githubWebhookController } from "../webhook.ctrl";
import {
  getRepositoriesForWebhookQuery,
  recordWebhookDeliveryQuery,
} from "../../utils/aiDetectionRepository.utils";
import {
  verifyGitHubSignature,
  handlePushEvent,
  handlePullRequestEvent,
} from "../../services/webhook.service";

const mockGetRepo = getRepositoriesForWebhookQuery as jest.MockedFunction<
  typeof getRepositoriesForWebhookQuery
>;
const mockRecordDelivery = recordWebhookDeliveryQuery as jest.MockedFunction<
  typeof recordWebhookDeliveryQuery
>;
const mockVerifySig = verifyGitHubSignature as jest.MockedFunction<typeof verifyGitHubSignature>;
const mockHandlePush = handlePushEvent as jest.MockedFunction<typeof handlePushEvent>;
const mockHandlePR = handlePullRequestEvent as jest.MockedFunction<typeof handlePullRequestEvent>;

function createReq(overrides?: Partial<Request>): any {
  return {
    userId: 1,
    organizationId: 1,
    role: "Admin",
    t: (k: string) => k,
    body: {},
    params: {},
    query: {},
    headers: {},
    ...overrides,
  };
}

function createRes(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("githubWebhookController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should return 401 when signature header is missing", async () => {
    const req = createReq({
      headers: {
        "x-github-event": "push",
      },
      body: Buffer.from(JSON.stringify({})),
    });
    const res = createRes();

    await githubWebhookController(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: "Unauthorized",
      data: "Missing X-Hub-Signature-256 header",
    });
  });

  it("should return 400 when event header is missing", async () => {
    const req = createReq({
      headers: {
        "x-hub-signature-256": "sha256=abc",
      },
      body: Buffer.from(JSON.stringify({})),
    });
    const res = createRes();

    await githubWebhookController(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Bad Request",
      data: "Missing X-GitHub-Event header",
    });
  });

  it("should return 400 when body is not a buffer", async () => {
    const req = createReq({
      headers: {
        "x-hub-signature-256": "sha256=abc",
        "x-github-event": "push",
      },
      body: "string",
    });
    const res = createRes();

    await githubWebhookController(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Bad Request",
      data: "Request body must be raw buffer",
    });
  });

  it("should return 400 when payload is invalid JSON", async () => {
    const req = createReq({
      headers: {
        "x-hub-signature-256": "sha256=abc",
        "x-github-event": "push",
      },
      body: Buffer.from("not json"),
    });
    const res = createRes();

    await githubWebhookController(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Bad Request",
      data: "Invalid JSON payload",
    });
  });

  it("should return 400 when repository info is missing", async () => {
    const req = createReq({
      headers: {
        "x-hub-signature-256": "sha256=abc",
        "x-github-event": "push",
      },
      body: Buffer.from(JSON.stringify({})),
    });
    const res = createRes();

    await githubWebhookController(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Bad Request",
      data: "Missing repository info in payload",
    });
  });

  it("should return 200 when repository is not registered", async () => {
    mockGetRepo.mockResolvedValue([]);
    const req = createReq({
      headers: {
        "x-hub-signature-256": "sha256=abc",
        "x-github-event": "push",
      },
      body: Buffer.from(
        JSON.stringify({
          repository: {
            owner: { login: "owner" },
            name: "repo",
          },
        }),
      ),
    });
    const res = createRes();

    await githubWebhookController(req as Request, res as Response);

    expect(mockGetRepo).toHaveBeenCalledWith("owner", "repo");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "Repository not registered or CI not enabled",
    });
  });

  it("should return 200 when webhook secret is not configured", async () => {
    mockGetRepo.mockResolvedValue([
      {
        webhook_secret: null,
      },
    ] as any);
    const req = createReq({
      headers: {
        "x-hub-signature-256": "sha256=abc",
        "x-github-event": "push",
      },
      body: Buffer.from(
        JSON.stringify({
          repository: {
            owner: { login: "owner" },
            name: "repo",
          },
        }),
      ),
    });
    const res = createRes();

    await githubWebhookController(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "Webhook secret not configured",
    });
  });

  it("should return 401 when signature is invalid", async () => {
    mockGetRepo.mockResolvedValue([
      {
        webhook_secret: "secret",
      },
    ] as any);
    mockVerifySig.mockReturnValue(false);
    const req = createReq({
      headers: {
        "x-hub-signature-256": "sha256=abc",
        "x-github-event": "push",
      },
      body: Buffer.from(
        JSON.stringify({
          repository: {
            owner: { login: "owner" },
            name: "repo",
          },
        }),
      ),
    });
    const res = createRes();

    await githubWebhookController(req as Request, res as Response);

    expect(mockVerifySig).toHaveBeenCalledWith(req.body, "sha256=abc", "secret");
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: "Unauthorized",
      data: "Invalid signature",
    });
  });

  it("should return 200 for ping event", async () => {
    mockGetRepo.mockResolvedValue([
      {
        webhook_secret: "secret",
      },
    ] as any);
    mockVerifySig.mockReturnValue(true);
    const req = createReq({
      headers: {
        "x-hub-signature-256": "sha256=abc",
        "x-github-event": "ping",
        "x-github-delivery": "delivery-123",
      },
      body: Buffer.from(
        JSON.stringify({
          repository: {
            owner: { login: "owner" },
            name: "repo",
          },
        }),
      ),
    });
    const res = createRes();

    await githubWebhookController(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "pong",
    });
  });

  it("should return 200 for push event", async () => {
    mockGetRepo.mockResolvedValue([
      {
        webhook_secret: "secret",
      },
    ] as any);
    mockVerifySig.mockReturnValue(true);
    mockHandlePush.mockResolvedValue({
      triggered: true,
      reason: "ok",
    });
    const req = createReq({
      headers: {
        "x-hub-signature-256": "sha256=abc",
        "x-github-event": "push",
      },
      body: Buffer.from(
        JSON.stringify({
          repository: {
            owner: { login: "owner" },
            name: "repo",
          },
        }),
      ),
    });
    const res = createRes();

    await githubWebhookController(req as Request, res as Response);

    expect(mockHandlePush).toHaveBeenCalledWith(
      {
        repository: {
          owner: { login: "owner" },
          name: "repo",
        },
      },
      {
        webhook_secret: "secret",
      },
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      triggered: true,
      reason: "ok",
    });
  });

  it("should return 200 for pull_request event", async () => {
    mockGetRepo.mockResolvedValue([
      {
        webhook_secret: "secret",
      },
    ] as any);
    mockVerifySig.mockReturnValue(true);
    mockHandlePR.mockResolvedValue({
      triggered: true,
      reason: "ok",
    });
    const req = createReq({
      headers: {
        "x-hub-signature-256": "sha256=abc",
        "x-github-event": "pull_request",
      },
      body: Buffer.from(
        JSON.stringify({
          repository: {
            owner: { login: "owner" },
            name: "repo",
          },
        }),
      ),
    });
    const res = createRes();

    await githubWebhookController(req as Request, res as Response);

    expect(mockHandlePR).toHaveBeenCalledWith(
      {
        repository: {
          owner: { login: "owner" },
          name: "repo",
        },
      },
      {
        webhook_secret: "secret",
      },
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      triggered: true,
      reason: "ok",
    });
  });

  it("should return 200 for unsupported event", async () => {
    mockGetRepo.mockResolvedValue([
      {
        webhook_secret: "secret",
      },
    ] as any);
    mockVerifySig.mockReturnValue(true);
    const req = createReq({
      headers: {
        "x-hub-signature-256": "sha256=abc",
        "x-github-event": "unknown",
      },
      body: Buffer.from(
        JSON.stringify({
          repository: {
            owner: { login: "owner" },
            name: "repo",
          },
        }),
      ),
    });
    const res = createRes();

    await githubWebhookController(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      triggered: false,
      reason: "Unsupported event type: unknown",
    });
  });

  it("should return 200 on internal error", async () => {
    mockGetRepo.mockRejectedValue(new Error("DB error"));
    const req = createReq({
      headers: {
        "x-hub-signature-256": "sha256=abc",
        "x-github-event": "push",
      },
      body: Buffer.from(
        JSON.stringify({
          repository: {
            owner: { login: "owner" },
            name: "repo",
          },
        }),
      ),
    });
    const res = createRes();

    await githubWebhookController(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "OK",
      data: {
        triggered: false,
        reason: "Internal processing error",
      },
    });
  });

  describe("delivery tracking", () => {
    const repo = { id: 9, organization_id: 4, webhook_secret: "secret" } as any;
    const pushReq = (event = "push") =>
      createReq({
        headers: { "x-hub-signature-256": "sha256=abc", "x-github-event": event },
        body: Buffer.from(
          JSON.stringify({ repository: { owner: { login: "owner" }, name: "repo" } }),
        ),
      });

    it("records an ok delivery for a verified ping", async () => {
      mockGetRepo.mockResolvedValue([repo]);
      mockVerifySig.mockReturnValue(true);

      await githubWebhookController(pushReq("ping") as Request, createRes() as Response);

      expect(mockRecordDelivery).toHaveBeenCalledWith(9, 4, "ok");
    });

    it("records an ok delivery for a handled push", async () => {
      mockGetRepo.mockResolvedValue([repo]);
      mockVerifySig.mockReturnValue(true);
      mockHandlePush.mockResolvedValue({ triggered: true, reason: "ok" });

      await githubWebhookController(pushReq() as Request, createRes() as Response);

      expect(mockRecordDelivery).toHaveBeenCalledWith(9, 4, "ok");
    });

    it("does not write the delivery status for a bad signature", async () => {
      mockGetRepo.mockResolvedValue([repo]);
      mockVerifySig.mockReturnValue(false);
      const res = createRes();

      await githubWebhookController(pushReq() as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(mockRecordDelivery).not.toHaveBeenCalled();
    });

    it("does not write the delivery status for an unsigned request", async () => {
      mockGetRepo.mockResolvedValue([repo]);
      const req = pushReq();
      delete req.headers["x-hub-signature-256"];
      const res = createRes();

      await githubWebhookController(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(mockRecordDelivery).not.toHaveBeenCalled();
    });

    it("does not write the delivery status when no secret is configured", async () => {
      mockGetRepo.mockResolvedValue([{ ...repo, webhook_secret: null }]);

      await githubWebhookController(pushReq() as Request, createRes() as Response);

      expect(mockRecordDelivery).not.toHaveBeenCalled();
    });

    it("records an error when a verified delivery fails to process", async () => {
      mockGetRepo.mockResolvedValue([repo]);
      mockVerifySig.mockReturnValue(true);
      mockHandlePush.mockRejectedValue(new Error("boom"));
      const res = createRes();

      await githubWebhookController(pushReq() as Request, res as Response);

      expect(mockRecordDelivery).toHaveBeenCalledWith(9, 4, "error");
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("still answers GitHub when recording the delivery fails", async () => {
      mockGetRepo.mockResolvedValue([repo]);
      mockVerifySig.mockReturnValue(true);
      mockRecordDelivery.mockRejectedValueOnce(new Error("db down"));
      const res = createRes();

      await githubWebhookController(pushReq("ping") as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: "pong" });
    });

    it("does not record anything for an unregistered repository", async () => {
      mockGetRepo.mockResolvedValue([]);

      await githubWebhookController(pushReq() as Request, createRes() as Response);

      expect(mockRecordDelivery).not.toHaveBeenCalled();
    });
  });

  describe("same repository registered by several organizations", () => {
    const repoA = { id: 1, organization_id: 10, webhook_secret: "secret-a" } as any;
    const repoB = { id: 2, organization_id: 20, webhook_secret: "secret-b" } as any;
    const pushReq = (event = "push", owner = "owner", name = "repo") =>
      createReq({
        headers: { "x-hub-signature-256": "sha256=abc", "x-github-event": event },
        body: Buffer.from(JSON.stringify({ repository: { owner: { login: owner }, name } })),
      });

    it("acts only on the organization whose secret verifies", async () => {
      mockGetRepo.mockResolvedValue([repoA, repoB]);
      mockVerifySig.mockImplementation((_body, _sig, secret) => secret === "secret-b");
      mockHandlePush.mockResolvedValue({ triggered: true, reason: "ok" });
      const res = createRes();

      await githubWebhookController(pushReq() as Request, res as Response);

      expect(mockVerifySig).toHaveBeenCalledTimes(2);
      expect(mockHandlePush).toHaveBeenCalledTimes(1);
      expect(mockHandlePush).toHaveBeenCalledWith(expect.anything(), repoB);
      expect(mockRecordDelivery).toHaveBeenCalledTimes(1);
      expect(mockRecordDelivery).toHaveBeenCalledWith(2, 20, "ok");
      expect(res.json).toHaveBeenCalledWith({ triggered: true, reason: "ok" });
    });

    it("rejects the delivery when no candidate's secret verifies", async () => {
      mockGetRepo.mockResolvedValue([repoA, repoB]);
      mockVerifySig.mockReturnValue(false);
      const res = createRes();

      await githubWebhookController(pushReq() as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(mockHandlePush).not.toHaveBeenCalled();
      expect(mockRecordDelivery).not.toHaveBeenCalled();
    });

    it("skips candidates without a secret and verifies the rest", async () => {
      mockGetRepo.mockResolvedValue([{ ...repoA, webhook_secret: null }, repoB]);
      mockVerifySig.mockReturnValue(true);

      await githubWebhookController(pushReq("ping") as Request, createRes() as Response);

      expect(mockVerifySig).toHaveBeenCalledTimes(1);
      expect(mockVerifySig).toHaveBeenCalledWith(expect.anything(), "sha256=abc", "secret-b");
      expect(mockRecordDelivery).toHaveBeenCalledTimes(1);
      expect(mockRecordDelivery).toHaveBeenCalledWith(2, 20, "ok");
    });

    it("handles every repository whose secret verifies and records each outcome", async () => {
      mockGetRepo.mockResolvedValue([repoA, repoB]);
      mockVerifySig.mockReturnValue(true);
      mockHandlePush
        .mockResolvedValueOnce({ triggered: true, reason: "started" })
        .mockRejectedValueOnce(new Error("boom"));
      const res = createRes();

      await githubWebhookController(pushReq() as Request, res as Response);

      expect(mockRecordDelivery).toHaveBeenCalledWith(1, 10, "ok");
      expect(mockRecordDelivery).toHaveBeenCalledWith(2, 20, "error");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        triggered: true,
        reason: "started; Internal processing error",
      });
    });

    it("looks up the owner and name as GitHub sent them (the query ignores case)", async () => {
      mockGetRepo.mockResolvedValue([]);

      await githubWebhookController(
        pushReq("push", "Acme", "Widgets") as Request,
        createRes() as Response,
      );

      expect(mockGetRepo).toHaveBeenCalledWith("Acme", "Widgets");
    });
  });
});
