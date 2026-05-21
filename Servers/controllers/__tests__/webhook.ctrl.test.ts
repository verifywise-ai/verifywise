import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/aiDetectionRepository.utils", () => ({
  getRepositoryByOwnerNameForWebhook: jest.fn(),
}));

jest.mock("../../services/webhook.service", () => ({
  verifyGitHubSignature: jest.fn(),
  handlePushEvent: jest.fn(),
  handlePullRequestEvent: jest.fn(),
}));

jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
}));

jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (data: any) => ({ message: "OK", data }),
    400: (data: any) => ({ message: "Bad Request", data }),
    401: (data: any) => ({ message: "Unauthorized", data }),
  },
}));

import { githubWebhookController } from "../webhook.ctrl";
import { getRepositoryByOwnerNameForWebhook } from "../../utils/aiDetectionRepository.utils";
import {
  verifyGitHubSignature,
  handlePushEvent,
  handlePullRequestEvent,
} from "../../services/webhook.service";

const mockGetRepo = getRepositoryByOwnerNameForWebhook as jest.MockedFunction<
  typeof getRepositoryByOwnerNameForWebhook
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
    mockGetRepo.mockResolvedValue(null);
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
    mockGetRepo.mockResolvedValue({
      webhook_secret: null,
    } as any);
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
    mockGetRepo.mockResolvedValue({
      webhook_secret: "secret",
    } as any);
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
    mockGetRepo.mockResolvedValue({
      webhook_secret: "secret",
    } as any);
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
    mockGetRepo.mockResolvedValue({
      webhook_secret: "secret",
    } as any);
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
    mockGetRepo.mockResolvedValue({
      webhook_secret: "secret",
    } as any);
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
    mockGetRepo.mockResolvedValue({
      webhook_secret: "secret",
    } as any);
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
      triggered: false,
      reason: "Internal processing error",
    });
  });
});
