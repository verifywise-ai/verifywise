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
import { parseDocument } from "../../advisor/parsers";
import { analyzeEvidence, type AnalyzerResult } from "../../advisor/evidenceAnalyzer/analyzer.service";

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

  it("returns 200 and persists the analyzer result when a key is configured", async () => {
    (getLLMKeysWithKeyQuery as jest.Mock).mockResolvedValue([
      { key: "sk-test", url: "https://api.anthropic.com", model: "claude-3-opus", name: "Anthropic" },
    ]);

    (sequelize.query as jest.Mock)
      .mockResolvedValueOnce([[{ id: 42, filename: "policy.pdf", type: "application/pdf" }], {}]) // file metadata
      .mockResolvedValueOnce([
        [{ content: Buffer.from("some evidence text"), size_bytes: 100, upload_date: "2026-01-01" }],
        {},
      ]) // file content
      .mockResolvedValueOnce([[], {}]); // evidence expiry (none linked)

    (parseDocument as jest.Mock).mockResolvedValue({ text: "some evidence text" });

    const analyzerResult: AnalyzerResult = {
      summary: "Test summary",
      key_findings: ["Finding one"],
      compliance_areas: ["GDPR"],
      quality_score: {
        relevance: "A",
        completeness: "A",
        recency: "A",
        reliability: "A",
        specificity: "A",
      },
      overall_quality_grade: "A",
      quality_rationale: {
        relevance: "r",
        completeness: "c",
        recency: "rc",
        reliability: "rl",
        specificity: "s",
        overall: "o",
      },
      suggested_control_links: [],
      analysis_model: "claude-3-opus",
      audit: {
        analyzer_version: "v1",
        abstain_reason: null,
        char_count: 100,
        truncated: false,
        findings_with_quotes: [],
        filename_check: null,
      },
    };
    (analyzeEvidence as jest.Mock).mockResolvedValue(analyzerResult);

    const persisted = { id: 1, file_id: 42, summary: "Test summary" };
    (upsertAnalysisQuery as jest.Mock).mockResolvedValue(persisted);

    const req = createReq();
    const res = createRes();

    await analyzeFile(req, res);

    expect(analyzeEvidence).toHaveBeenCalledTimes(1);
    expect(upsertAnalysisQuery).toHaveBeenCalledWith(
      42,
      1,
      expect.objectContaining({
        summary: "Test summary",
        overall_quality_grade: "A",
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      STATUS_CODE[200]({ ...persisted, quality_rationale: analyzerResult.quality_rationale }),
    );
  });
  it("names the real reason when the LLM fails, instead of claiming there is no key", async () => {
    // This path is only ever reached WITH a key -- an organization without one
    // is turned away with a 400 above. Reporting "no LLM key" here sent a user
    // who had just configured one back to re-enter it, which is exactly the
    // complaint that surfaced this bug on 2026-07-29.
    (getLLMKeysWithKeyQuery as jest.Mock).mockResolvedValue([
      { key: "sk-test", url: "https://integrate.api.nvidia.com/v1", model: "deepseek", name: "Custom" },
    ]);

    (sequelize.query as jest.Mock)
      .mockResolvedValueOnce([[{ id: 42, filename: "policy.pdf", type: "application/pdf" }], {}])
      .mockResolvedValueOnce([
        [{ content: Buffer.from("some evidence text"), size_bytes: 100, upload_date: "2026-01-01" }],
        {},
      ])
      .mockResolvedValueOnce([[], {}]);

    (parseDocument as jest.Mock).mockResolvedValue({ text: "some evidence text" });
    (analyzeEvidence as jest.Mock).mockRejectedValue(
      new Error("No object generated: could not parse the response."),
    );
    (upsertAnalysisQuery as jest.Mock).mockResolvedValue({ id: 1, file_id: 42 });

    const res = createRes();
    await analyzeFile(createReq(), res);

    const payload = res.json.mock.calls[0][0].data;
    expect(payload.message).toContain("No object generated");
    expect(payload.message).not.toContain("no LLM key");
  });
});
