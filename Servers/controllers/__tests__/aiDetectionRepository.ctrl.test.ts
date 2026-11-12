import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/aiDetectionRepository.utils", () => ({
  createRepositoryQuery: jest.fn(),
  getRepositoryByIdQuery: jest.fn(),
  getRepositoryByOwnerNameQuery: jest.fn(),
  getRepositoriesListQuery: jest.fn(),
  updateRepositoryQuery: jest.fn(),
  deleteRepositoryQuery: jest.fn(),
  updateRepositoryNextScanAtQuery: jest.fn(),
  computeNextScanAt: jest.fn(),
}));
jest.mock("../../utils/aiDetection.utils", () => ({
  getScansListQuery: jest.fn(),
  getActiveScanForRepoQuery: jest.fn(),
}));
jest.mock("../../services/aiDetection.service", () => ({ startScan: jest.fn() }));
jest.mock("../../services/webhook.service", () => ({
  generateWebhookSecret: jest.fn(() => "generated-secret"),
  buildGitHubWebhookUrl: jest.fn(() => ({
    webhook_url: "https://vw.example.com/api/webhooks/github",
    is_public: true,
  })),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(),
  logFailure: jest.fn(),
}));
jest.mock("../../utils/i18n.utils", () => ({ translateError: jest.fn(() => "error") }));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (data: any) => ({ message: "OK", data }),
    201: (data: any) => ({ message: "Created", data }),
    400: (data: any) => ({ message: "Bad Request", data }),
    404: (data: any) => ({ message: "Not Found", data }),
    409: (data: any) => ({ message: "Conflict", data }),
    500: (data: any) => ({ message: "Error", data }),
  },
}));

import {
  createRepository,
  updateRepository,
  getWebhookConfigController,
  validateCiSettings,
} from "../aiDetectionRepository.ctrl";
import {
  createRepositoryQuery,
  getRepositoryByIdQuery,
  getRepositoryByOwnerNameQuery,
  updateRepositoryQuery,
} from "../../utils/aiDetectionRepository.utils";
import { buildGitHubWebhookUrl } from "../../services/webhook.service";

const mockCreate = createRepositoryQuery as jest.MockedFunction<typeof createRepositoryQuery>;
const mockGetById = getRepositoryByIdQuery as jest.MockedFunction<typeof getRepositoryByIdQuery>;
const mockGetByOwner = getRepositoryByOwnerNameQuery as jest.MockedFunction<
  typeof getRepositoryByOwnerNameQuery
>;
const mockUpdate = updateRepositoryQuery as jest.MockedFunction<typeof updateRepositoryQuery>;

function createReq(overrides?: Partial<Request>): any {
  return {
    userId: 3,
    organizationId: 5,
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

describe("validateCiSettings", () => {
  it("accepts valid and absent fields", () => {
    expect(validateCiSettings({})).toBeNull();
    expect(
      validateCiSettings({
        ci_enabled: true,
        ci_min_score: 0,
        ci_max_critical: 0,
        ci_post_comments: false,
        ci_status_checks: true,
      }),
    ).toBeNull();
    expect(validateCiSettings({ ci_min_score: 100 })).toBeNull();
  });

  it.each([
    [{ ci_min_score: -1 }],
    [{ ci_min_score: 101 }],
    [{ ci_min_score: 70.5 }],
    [{ ci_min_score: "70" }],
    [{ ci_max_critical: -1 }],
    [{ ci_max_critical: 1.5 }],
    [{ ci_enabled: "yes" }],
  ])("rejects %p", (body) => {
    expect(validateCiSettings(body)).not.toBeNull();
  });
});

describe("createRepository", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetByOwner.mockResolvedValue(null);
    mockCreate.mockImplementation(async (input) => ({ id: 1, ...input }) as any);
  });

  it("saves the CI/CD settings and generates a webhook secret when CI/CD is on", async () => {
    const req = createReq({
      body: {
        repository_url: "https://github.com/acme/widgets",
        ci_enabled: true,
        ci_min_score: 80,
        ci_max_critical: 2,
        ci_post_comments: false,
        ci_status_checks: true,
      },
    });
    const res = createRes();

    await createRepository(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        ci_enabled: true,
        ci_min_score: 80,
        ci_max_critical: 2,
        ci_post_comments: false,
        ci_status_checks: true,
        webhook_secret: "generated-secret",
      }),
      5,
    );
  });

  it("does not generate a secret when CI/CD is off", async () => {
    const req = createReq({ body: { repository_url: "https://github.com/acme/widgets" } });
    const res = createRes();

    await createRepository(req as Request, res as Response);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ ci_enabled: false, webhook_secret: null }),
      5,
    );
  });

  it("rejects an out-of-range minimum governance score", async () => {
    const req = createReq({
      body: { repository_url: "https://github.com/acme/widgets", ci_min_score: 150 },
    });
    const res = createRes();

    await createRepository(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("updateRepository", () => {
  const existing = {
    id: 1,
    repository_owner: "acme",
    repository_name: "widgets",
    schedule_enabled: false,
    schedule_frequency: null,
    webhook_secret: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockImplementation(async (_id, input) => ({ ...existing, ...input }) as any);
  });

  it("generates a secret when CI/CD is turned on for a repository without one", async () => {
    mockGetById.mockResolvedValue(existing as any);
    const req = createReq({ params: { id: "1" }, body: { ci_enabled: true } });
    const res = createRes();

    await updateRepository(req as Request, res as Response);

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ ci_enabled: true, webhook_secret: "generated-secret" }),
      5,
    );
  });

  it("keeps the existing secret", async () => {
    mockGetById.mockResolvedValue({ ...existing, webhook_secret: "kept" } as any);
    const req = createReq({ params: { id: "1" }, body: { ci_enabled: true } });
    const res = createRes();

    await updateRepository(req as Request, res as Response);

    expect(mockUpdate.mock.calls[0][1]).not.toHaveProperty("webhook_secret");
  });

  it("rejects a negative critical findings limit", async () => {
    mockGetById.mockResolvedValue(existing as any);
    const req = createReq({ params: { id: "1" }, body: { ci_max_critical: -3 } });
    const res = createRes();

    await updateRepository(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("getWebhookConfigController", () => {
  it("returns the webhook URL built from FRONTEND_URL", async () => {
    const previous = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = "https://vw.example.com";
    const res = createRes();

    await getWebhookConfigController(createReq() as Request, res as Response);

    expect(buildGitHubWebhookUrl).toHaveBeenCalledWith("https://vw.example.com");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "OK",
      data: { webhook_url: "https://vw.example.com/api/webhooks/github", is_public: true },
    });
    process.env.FRONTEND_URL = previous;
  });
});
