/**
 * suggestRisksWithAI controller unit tests (POST /api/projectRisks/suggest-ai).
 *
 * Explicit factory mocks throughout: the controller transitively pulls a large
 * module graph (DB, BullMQ, LLM providers), and factories keep the suite
 * hermetic. The risk-suggestion service is replaced by a jest.fn plus a real
 * RiskSuggestionError class, so instanceof checks in the controller work
 * against the same class the tests throw.
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Request, Response } from "express";
import { validationResult } from "express-validator";

jest.mock("../../utils/risk.utils", () => ({
  getAllRisksQuery: jest.fn(),
  getRiskByIdQuery: jest.fn(),
  getRisksByFrameworkQuery: jest.fn(),
  getRisksByProjectQuery: jest.fn(),
  updateRiskByIdQuery: jest.fn(),
  deleteRiskByIdQuery: jest.fn(),
  bulkSetProjectRisksOwnerQuery: jest.fn(),
  bulkSetProjectRisksCategoryQuery: jest.fn(),
  bulkArchiveProjectRisksQuery: jest.fn(),
  PROJECT_RISK_CATEGORIES_SET: new Set(["Operational risk"]),
}));
jest.mock("../../utils/project.utils", () => ({
  getProjectByIdQuery: jest.fn(),
}));
jest.mock("../../utils/llmKey.utils", () => ({
  getLLMKeysWithKeyQuery: jest.fn(),
  getLLMProviderUrl: jest.fn().mockReturnValue("https://api.openai.com/v1/"),
}));
jest.mock("../../advisor/llmModelFactory", () => ({
  createModelFromKey: jest.fn().mockReturnValue("fake-ai-sdk-model"),
}));
jest.mock("../../services/riskSuggestions/riskSuggestions.service", () => ({
  suggestRisksForUseCase: jest.fn(),
  RiskSuggestionError: class RiskSuggestionError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
      super(message);
      this.name = "RiskSuggestionError";
      if (options && "cause" in options) (this as any).cause = options.cause;
    }
  },
}));
jest.mock("../../domain.layer/models/risks/risk.model", () => ({
  RiskModel: jest.fn(),
}));
jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn().mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() }),
    query: jest.fn().mockResolvedValue([[]]),
  },
}));
jest.mock("../../domain.layer/exceptions/custom.exception", () => ({
  ValidationException: class ValidationException extends Error {},
  BusinessLogicException: class BusinessLogicException extends Error {},
  ForbiddenException: class ForbiddenException extends Error {},
}));
jest.mock("../../utils/bulkAction.utils", () => ({
  parseBulkIds: jest.fn((ids: number[]) => ids),
  assertOrgOwnsIds: jest.fn(),
  withBulkTransaction: jest.fn(),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  logStructured: jest.fn(),
}));
jest.mock("../../utils/logger/dbLogger", () => ({
  logEvent: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/projectRiskChangeHistory.utils", () => ({
  recordMultipleFieldChanges: jest.fn(),
  trackProjectRiskChanges: jest.fn(),
  recordProjectRiskDeletion: jest.fn(),
}));
jest.mock("../../services/inAppNotification.service", () => ({
  notifyUserAssigned: jest.fn(),
}));
jest.mock("../../utils/quantitativeRisk.utils", () => ({
  computeDerivedFields: jest.fn(),
  recordPortfolioSnapshot: jest.fn(),
}));
jest.mock("../../utils/validations/quantitativeRiskValidation.utils", () => ({
  validateQuantitativeRiskFields: jest.fn().mockReturnValue([]),
}));
jest.mock("../../services/risk.service", () => ({
  createRiskService: jest.fn(),
}));
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueRiskLinkRecompute: jest.fn(),
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (d: any) => ({ message: "OK", data: d }),
    201: (d: any) => ({ message: "Created", data: d }),
    204: (d: any) => ({ message: "No Content", data: d }),
    400: (d: any) => ({ message: "Bad Request", data: d }),
    403: (d: any) => ({ message: "Forbidden", data: d }),
    404: (d: any) => ({ message: "Not Found", data: d }),
    500: (d: any) => ({ message: "Internal Server Error", data: d }),
    502: (d: any) => ({ message: "Bad Gateway", data: d }),
  },
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_, err) => (err as Error).message),
}));

import { suggestRisksWithAI } from "../risks.ctrl";
import { validateSuggestRisksWithAI } from "../../middleware/validators/risks.validator";
import { getRisksByProjectQuery } from "../../utils/risk.utils";
import { getProjectByIdQuery } from "../../utils/project.utils";
import { getLLMKeysWithKeyQuery } from "../../utils/llmKey.utils";
import { createModelFromKey } from "../../advisor/llmModelFactory";
import {
  RiskSuggestionError,
  suggestRisksForUseCase,
} from "../../services/riskSuggestions/riskSuggestions.service";
import logger from "../../utils/logger/fileLogger";
import { createMockReq, createMockRes } from "./helpers/test-helper";

const mockGetProjectById = getProjectByIdQuery as jest.Mock;
const mockGetLLMKeys = getLLMKeysWithKeyQuery as jest.Mock;
const mockGetRisksByProject = getRisksByProjectQuery as jest.Mock;
const mockCreateModel = createModelFromKey as jest.Mock;
const mockSuggest = suggestRisksForUseCase as jest.Mock;
const mockLogger = logger as unknown as { [k: string]: jest.Mock };

const PROJECT = {
  id: 5,
  project_title: "Customer support assistant",
  goal: "Deflect support tickets",
  description: "A chatbot for the help centre.",
  use_case_purpose: null,
  deployment_context: "SaaS help centre",
  use_case_category: null,
};

const LLM_KEYS = [
  { id: 1, name: "OpenAI", key: "sk-one", url: "https://api.openai.com/v1/", model: "gpt-4o-mini" },
  { id: 2, name: "Anthropic", key: "sk-two", url: null, model: "claude-sonnet-4-20250514" },
];

const SERVICE_RESULT = {
  matched: [
    {
      source: "ibm",
      id: 3,
      summary: "Sharing IP or confidential information with tools",
      description: "External tools or APIs may receive sensitive data unintentionally.",
      risk_category: ["Third-party/vendor risk", "Cybersecurity risk"],
      likelihood: "Likely",
      severity: "Major",
      reason: "Tool integrations can pass confidential context outward.",
      ai_lifecycle_phase: "Deployment & integration",
    },
  ],
  suggested: [
    {
      risk_name: "Hallucinated pricing in customer quotes",
      risk_description: "The assistant may invent prices or discounts in drafted answers.",
      risk_category: ["Operational risk"],
      ai_lifecycle_phase: "Deployment & integration",
      likelihood: 3,
      severity: 4,
      impact: "Customers hold the organization to quotes it never approved.",
      mitigation_plan: "Route pricing content through a validated lookup before sending.",
    },
  ],
  suppressed_count: 1,
};

const setupHappyPath = () => {
  mockGetProjectById.mockResolvedValue(PROJECT);
  mockGetLLMKeys.mockResolvedValue(LLM_KEYS);
  mockGetRisksByProject.mockResolvedValue([
    { id: 11, risk_name: "Existing data leak risk" },
    { id: 12, risk_name: "Existing outage risk" },
  ]);
  mockSuggest.mockResolvedValue(SERVICE_RESULT);
};

describe("suggestRisksWithAI", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 404 when the project does not exist in this organization", async () => {
    mockGetProjectById.mockResolvedValue(null);

    const req = createMockReq({ body: { projectId: 999 } }) as Request;
    const res = createMockRes() as Response;
    await suggestRisksWithAI(req, res);

    expect(mockGetProjectById).toHaveBeenCalledWith(999, 1);
    expect((res as any).status).toHaveBeenCalledWith(404);
    expect((res as any).json).toHaveBeenCalledWith({
      message: "Not Found",
      data: "Project not found",
    });
    expect(mockSuggest).not.toHaveBeenCalled();
  });

  it("returns 400 when the organization has no LLM keys configured", async () => {
    mockGetProjectById.mockResolvedValue(PROJECT);
    mockGetLLMKeys.mockResolvedValue([]);

    const req = createMockReq({ body: { projectId: 5 } }) as Request;
    const res = createMockRes() as Response;
    await suggestRisksWithAI(req, res);

    expect((res as any).status).toHaveBeenCalledWith(400);
    expect((res as any).json).toHaveBeenCalledWith({
      message: "Bad Request",
      data: "No LLM keys configured for this organization.",
    });
    expect(mockSuggest).not.toHaveBeenCalled();
  });

  it("returns 200 with the service result verbatim and builds the use case from project fields", async () => {
    setupHappyPath();

    const req = createMockReq({ body: { projectId: 5 } }) as Request;
    const res = createMockRes() as Response;
    await suggestRisksWithAI(req, res);

    expect(mockSuggest).toHaveBeenCalledWith({
      model: "fake-ai-sdk-model",
      useCase: {
        name: "Customer support assistant",
        purpose: "Deflect support tickets",
        technology: "SaaS help centre",
      },
      existingRiskNames: ["Existing data leak risk", "Existing outage risk"],
    });
    expect((res as any).status).toHaveBeenCalledWith(200);
    expect((res as any).json).toHaveBeenCalledWith({ message: "OK", data: SERVICE_RESULT });
    expect((res as any).json.mock.calls[0][0].data.suppressed_count).toBe(1);
  });

  it("prefers a request technologySummary over the project's deployment context", async () => {
    setupHappyPath();

    const req = createMockReq({
      body: { projectId: 5, technologySummary: "  GPT-4o with CRM tool access  " },
    }) as Request;
    const res = createMockRes() as Response;
    await suggestRisksWithAI(req, res);

    expect(mockSuggest.mock.calls[0][0].useCase.technology).toBe("GPT-4o with CRM tool access");
  });

  it("honours llmKeyId when selecting the LLM key", async () => {
    setupHappyPath();

    const req = createMockReq({ body: { projectId: 5, llmKeyId: 2 } }) as Request;
    const res = createMockRes() as Response;
    await suggestRisksWithAI(req, res);

    expect(mockCreateModel).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Anthropic", key: "sk-two" }),
    );
  });

  it("falls back to the first LLM key when llmKeyId is absent", async () => {
    setupHappyPath();

    const req = createMockReq({ body: { projectId: 5 } }) as Request;
    const res = createMockRes() as Response;
    await suggestRisksWithAI(req, res);

    expect(mockCreateModel).toHaveBeenCalledWith(
      expect.objectContaining({ name: "OpenAI", key: "sk-one" }),
    );
  });

  it("maps a rejected provider key to 502 without echoing provider details", async () => {
    setupHappyPath();
    const providerError = Object.assign(
      new Error("401 invalid x-api-key: sk-two in request body dump"),
      { statusCode: 401 },
    );
    mockSuggest.mockRejectedValue(
      new RiskSuggestionError("Risk suggestion generation failed", { cause: providerError }),
    );

    const req = createMockReq({ body: { projectId: 5 } }) as Request;
    const res = createMockRes() as Response;
    await suggestRisksWithAI(req, res);

    expect((res as any).status).toHaveBeenCalledWith(502);
    const payload = JSON.stringify((res as any).json.mock.calls[0][0]);
    expect(payload).toContain("API key was rejected");
    expect(payload).not.toContain("sk-two");
    expect(payload).not.toContain("body dump");

    for (const call of mockLogger.error.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("sk-two");
      expect(JSON.stringify(call)).not.toContain("body dump");
    }
  });

  it("maps provider rate limiting to 502 with a retry hint", async () => {
    setupHappyPath();
    mockSuggest.mockRejectedValue(
      new RiskSuggestionError("Risk suggestion generation failed", {
        cause: Object.assign(new Error("429 Too Many Requests"), { statusCode: 429 }),
      }),
    );

    const req = createMockReq({ body: { projectId: 5 } }) as Request;
    const res = createMockRes() as Response;
    await suggestRisksWithAI(req, res);

    expect((res as any).status).toHaveBeenCalledWith(502);
    expect((res as any).json.mock.calls[0][0].data).toContain("rate-limiting");
  });

  it("maps a provider outage to 502", async () => {
    setupHappyPath();
    mockSuggest.mockRejectedValue(
      new RiskSuggestionError("Risk suggestion generation failed", {
        cause: Object.assign(new Error("503 Service Unavailable"), { statusCode: 503 }),
      }),
    );

    const req = createMockReq({ body: { projectId: 5 } }) as Request;
    const res = createMockRes() as Response;
    await suggestRisksWithAI(req, res);

    expect((res as any).status).toHaveBeenCalledWith(502);
    expect((res as any).json.mock.calls[0][0].data).toContain("currently unavailable");
  });

  it("maps a RiskSuggestionError without provider status to a generic 502", async () => {
    setupHappyPath();
    mockSuggest.mockRejectedValue(new RiskSuggestionError("Risk suggestion generation failed"));

    const req = createMockReq({ body: { projectId: 5 } }) as Request;
    const res = createMockRes() as Response;
    await suggestRisksWithAI(req, res);

    expect((res as any).status).toHaveBeenCalledWith(502);
    expect((res as any).json.mock.calls[0][0].data).toContain(
      "Failed to generate risk suggestions",
    );
  });

  it("maps internal failures to 500", async () => {
    mockGetProjectById.mockResolvedValue(PROJECT);
    mockGetLLMKeys.mockResolvedValue(LLM_KEYS);
    mockGetRisksByProject.mockRejectedValue(new Error("connection reset"));

    const req = createMockReq({ body: { projectId: 5 } }) as Request;
    const res = createMockRes() as Response;
    await suggestRisksWithAI(req, res);

    expect((res as any).status).toHaveBeenCalledWith(500);
  });
});

describe("validateSuggestRisksWithAI", () => {
  // Every chain except the trailing handleValidationErrors.
  const chains = validateSuggestRisksWithAI.slice(0, -1) as any[];

  const runChains = async (body: any) => {
    const req = createMockReq({ body }) as Request;
    for (const chain of chains) {
      await chain.run(req);
    }
    return validationResult(req);
  };

  it("accepts a minimal valid body", async () => {
    const result = await runChains({ projectId: 5 });
    expect(result.isEmpty()).toBe(true);
  });

  it("accepts the full body", async () => {
    const result = await runChains({
      projectId: 5,
      technologySummary: "GPT-4o with tool access",
      llmKeyId: 2,
    });
    expect(result.isEmpty()).toBe(true);
  });

  it("rejects a missing projectId", async () => {
    const result = await runChains({});
    expect(result.isEmpty()).toBe(false);
    expect(result.array()[0].msg).toContain("projectId");
  });

  it("rejects a non-positive projectId", async () => {
    expect((await runChains({ projectId: 0 })).isEmpty()).toBe(false);
    expect((await runChains({ projectId: "abc" })).isEmpty()).toBe(false);
  });

  it("rejects a technologySummary over 2000 characters", async () => {
    const result = await runChains({ projectId: 5, technologySummary: "x".repeat(2001) });
    expect(result.isEmpty()).toBe(false);
    expect(result.array()[0].msg).toContain("technologySummary");
  });

  it("rejects a non-positive llmKeyId", async () => {
    expect((await runChains({ projectId: 5, llmKeyId: 0 })).isEmpty()).toBe(false);
    expect((await runChains({ projectId: 5, llmKeyId: -3 })).isEmpty()).toBe(false);
  });
});
