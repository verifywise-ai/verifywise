import { Request, Response } from "express";
import { STATUS_CODE } from "../../utils/statusCode.utils";

jest.mock("../../database/db", () => ({
  sequelize: {
    query: jest.fn(),
  },
}));

jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() },
  logStructured: jest.fn(),
}));

jest.mock("../../utils/evidenceAi.utils", () => ({
  upsertAnalysisQuery: jest.fn(),
  getAnalysisByFileIdQuery: jest.fn(),
  getQualityScoresQuery: jest.fn(),
  getEvidenceGapsQuery: jest.fn(),
  getSuggestionsQuery: jest.fn(),
  applySuggestionsQuery: jest.fn(),
}));

jest.mock("../../advisor/parsers", () => ({
  parseDocument: jest.fn(),
  isSupportedMimeType: jest.fn().mockReturnValue(true),
}));

jest.mock("../../middleware/aiContentTracker.middleware", () => ({
  trackAIContent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../advisor/evidenceAnalyzer/analyzer.service", () => ({
  analyzeEvidence: jest.fn(),
}));

jest.mock("../../utils/llmKey.utils", () => ({
  getLLMKeysWithKeyQuery: jest.fn(),
  getLLMProviderUrl: jest.fn(),
}));

import { analyzeFile } from "../evidenceAi.ctrl";
import { sequelize } from "../../database/db";
import { getLLMKeysWithKeyQuery } from "../../utils/llmKey.utils";
import { upsertAnalysisQuery } from "../../utils/evidenceAi.utils";

function createReq(overrides?: Partial<Request>): any {
  return {
    userId: 1,
    organizationId: 1,
    params: { fileId: "42" },
    body: {},
    ...overrides,
  };
}

function createRes(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("analyzeFile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 and never queries file content when no LLM key is configured", async () => {
    (getLLMKeysWithKeyQuery as jest.Mock).mockResolvedValue([]);

    const req = createReq();
    const res = createRes();

    await analyzeFile(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      STATUS_CODE[400]("No LLM keys configured for this organization."),
    );
    expect(sequelize.query).not.toHaveBeenCalled();
    expect(upsertAnalysisQuery).not.toHaveBeenCalled();
  });
});
