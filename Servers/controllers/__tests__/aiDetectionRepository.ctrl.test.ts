import { describe, it, expect, jest, beforeEach, afterAll } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../database/db", () => ({ sequelize: {} }));
jest.mock("../../utils/aiDetectionRepository.utils", () => {
  // The real response shaper, so the tests prove what leaves the API.
  const actual = jest.requireActual("../../utils/aiDetectionRepository.utils") as Record<
    string,
    unknown
  >;
  return {
    createRepositoryQuery: jest.fn(),
    getRepositoryByIdQuery: jest.fn(),
    getRepositoryByOwnerNameQuery: jest.fn(),
    getRepositoriesListQuery: jest.fn(),
    updateRepositoryQuery: jest.fn(),
    deleteRepositoryQuery: jest.fn(),
    updateRepositoryNextScanAtQuery: jest.fn(),
    computeNextScanAt: jest.fn(),
    toRepositoryResponse: actual.toRepositoryResponse,
  };
});
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
  applyCiDefaults,
  createRepository,
  getRepository,
  listRepositories,
  updateRepository,
  getWebhookConfigController,
  validateCiSettings,
} from "../aiDetectionRepository.ctrl";
import {
  createRepositoryQuery,
  getRepositoriesListQuery,
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
const mockList = getRepositoriesListQuery as jest.MockedFunction<typeof getRepositoriesListQuery>;

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
  const saved = {
    API_PUBLIC_URL: process.env.API_PUBLIC_URL,
    FRONTEND_URL: process.env.FRONTEND_URL,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.API_PUBLIC_URL;
    delete process.env.FRONTEND_URL;
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const run = async (query: Record<string, unknown> = {}) => {
    const res = createRes();
    await getWebhookConfigController(createReq({ query } as any) as Request, res as Response);
    return res;
  };

  it("uses FRONTEND_URL when nothing more specific is set", async () => {
    process.env.FRONTEND_URL = "https://vw.example.com";
    const res = await run();

    expect(buildGitHubWebhookUrl).toHaveBeenCalledWith("https://vw.example.com");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "OK",
      data: { webhook_url: "https://vw.example.com/api/webhooks/github", is_public: true },
    });
  });

  it("prefers API_PUBLIC_URL over everything else", async () => {
    process.env.API_PUBLIC_URL = "https://api.example.com/";
    process.env.FRONTEND_URL = "https://vw.example.com";
    await run({ api_base_url: "https://other.example.com" });

    expect(buildGitHubWebhookUrl).toHaveBeenCalledWith("https://api.example.com");
  });

  it("uses the app's absolute public API address over FRONTEND_URL", async () => {
    process.env.FRONTEND_URL = "https://vw.example.com";
    await run({ api_base_url: "https://api.example.com/api" });

    expect(buildGitHubWebhookUrl).toHaveBeenCalledWith("https://api.example.com/api");
  });

  it("ignores a private or relative app API address while FRONTEND_URL is set", async () => {
    process.env.FRONTEND_URL = "https://vw.example.com";
    await run({ api_base_url: "http://localhost:3000" });
    await run({ api_base_url: "/api" });

    expect(buildGitHubWebhookUrl).toHaveBeenNthCalledWith(1, "https://vw.example.com");
    expect(buildGitHubWebhookUrl).toHaveBeenNthCalledWith(2, "https://vw.example.com");
  });

  it("passes no base when no address is configured", async () => {
    await run();

    expect(buildGitHubWebhookUrl).toHaveBeenCalledWith(undefined);
  });
});

describe("webhook secret in responses", () => {
  const row = {
    id: 1,
    repository_owner: "acme",
    repository_name: "widgets",
    schedule_enabled: false,
    schedule_frequency: null,
    ci_enabled: true,
    webhook_secret: "stored-secret",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const body = (res: any) => res.json.mock.calls[0][0].data;

  it("never includes the secret in the repository list", async () => {
    mockList.mockResolvedValue({
      repositories: [row as any, { ...row, id: 2, webhook_secret: null } as any],
      total: 2,
    });
    const res = createRes();

    await listRepositories(createReq() as Request, res as Response);

    const repositories = body(res).repositories;
    expect(JSON.stringify(repositories)).not.toContain("stored-secret");
    expect(repositories[0]).not.toHaveProperty("webhook_secret");
    expect(repositories[0].has_webhook_secret).toBe(true);
    expect(repositories[1].has_webhook_secret).toBe(false);
  });

  it("never includes the secret when reading one repository", async () => {
    mockGetById.mockResolvedValue(row as any);
    const res = createRes();

    await getRepository(createReq({ params: { id: "1" } }) as Request, res as Response);

    expect(JSON.stringify(body(res))).not.toContain("stored-secret");
    expect(body(res)).not.toHaveProperty("webhook_secret");
    expect(body(res).has_webhook_secret).toBe(true);
  });

  it("returns the secret once, on the create that generated it", async () => {
    mockGetByOwner.mockResolvedValue(null);
    mockCreate.mockImplementation(async (input) => ({ id: 1, ...input }) as any);
    const res = createRes();

    await createRepository(
      createReq({
        body: { repository_url: "https://github.com/acme/widgets", ci_enabled: true },
      }) as Request,
      res as Response,
    );

    expect(body(res).webhook_secret).toBe("generated-secret");
    expect(body(res).has_webhook_secret).toBe(true);
  });

  it("returns the secret on the update that generated it", async () => {
    mockGetById.mockResolvedValue({ ...row, ci_enabled: false, webhook_secret: null } as any);
    mockUpdate.mockImplementation(async (_id, input) => ({ ...row, ...input }) as any);
    const res = createRes();

    await updateRepository(
      createReq({ params: { id: "1" }, body: { ci_enabled: true } }) as Request,
      res as Response,
    );

    expect(body(res).webhook_secret).toBe("generated-secret");
  });

  it("does not return an existing secret from an update", async () => {
    mockGetById.mockResolvedValue(row as any);
    mockUpdate.mockImplementation(async (_id, input) => ({ ...row, ...input }) as any);
    const res = createRes();

    await updateRepository(
      createReq({ params: { id: "1" }, body: { display_name: "Widgets" } }) as Request,
      res as Response,
    );

    expect(JSON.stringify(body(res))).not.toContain("stored-secret");
    expect(body(res).has_webhook_secret).toBe(true);
  });
});

describe("null CI/CD fields on the legacy routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetByOwner.mockResolvedValue(null);
    mockCreate.mockImplementation(async (input) => ({ id: 1, ...input }) as any);
  });

  it("applyCiDefaults turns null into the default and leaves absent fields out", () => {
    expect(
      applyCiDefaults({
        ci_enabled: null,
        ci_min_score: null,
        ci_max_critical: null,
        ci_post_comments: null,
        ci_status_checks: null,
      }),
    ).toEqual({
      ci_enabled: false,
      ci_min_score: 70,
      ci_max_critical: 0,
      ci_post_comments: true,
      ci_status_checks: true,
    });
    expect(applyCiDefaults({ display_name: "x" } as any)).toEqual({ display_name: "x" });
  });

  it("creates a repository with defaults when CI/CD fields are null", async () => {
    const res = createRes();

    await createRepository(
      createReq({
        body: {
          repository_url: "https://github.com/acme/widgets",
          ci_enabled: null,
          ci_min_score: null,
          ci_max_critical: null,
        },
      }) as Request,
      res as Response,
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        ci_enabled: false,
        ci_min_score: 70,
        ci_max_critical: 0,
        webhook_secret: null,
      }),
      5,
    );
  });

  it("updates a null threshold to its default instead of rejecting it", async () => {
    mockGetById.mockResolvedValue({
      id: 1,
      schedule_enabled: false,
      schedule_frequency: null,
      webhook_secret: "kept",
    } as any);
    mockUpdate.mockImplementation(async (_id, input) => ({ id: 1, ...input }) as any);
    const res = createRes();

    await updateRepository(
      createReq({ params: { id: "1" }, body: { ci_min_score: null } }) as Request,
      res as Response,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpdate).toHaveBeenCalledWith(1, expect.objectContaining({ ci_min_score: 70 }), 5);
  });
});
