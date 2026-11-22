import { Request, Response } from "express";
import { STATUS_CODE } from "../../utils/statusCode.utils";
import { getTranslator } from "../../utils/i18n.utils";

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
  isAnalysisReplaceBlocked: jest.requireActual("../../utils/evidenceAi.utils")
    .isAnalysisReplaceBlocked,
  upsertAnalysisQuery: jest.fn(),
  getAnalysisByFileIdQuery: jest.fn(),
  getQualityScoresQuery: jest.fn(),
  getEvidenceGapsQuery: jest.fn(),
  getAdoptedEvidenceFrameworksQuery: jest.fn(),
  getAnalysisAuthorQuery: jest.fn(),
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

jest.mock("../../utils/rolePermissions.utils", () => ({
  requestHasPermission: jest.fn().mockResolvedValue(false),
}));

jest.mock("../../utils/llmKey.utils", () => ({
  getLLMKeysWithKeyQuery: jest.fn(),
  getLLMProviderUrl: jest.fn(),
}));

import { analyzeFile, getGaps, getQualityScores, getSuggestions } from "../evidenceAi.ctrl";
import { requestHasPermission } from "../../utils/rolePermissions.utils";
import { sequelize } from "../../database/db";
import { getLLMKeysWithKeyQuery } from "../../utils/llmKey.utils";
import {
  getAdoptedEvidenceFrameworksQuery,
  getAnalysisAuthorQuery,
  getEvidenceGapsQuery,
  getQualityScoresQuery,
  getSuggestionsQuery,
  applySuggestionsQuery,
  upsertAnalysisQuery,
} from "../../utils/evidenceAi.utils";
import { parseDocument } from "../../advisor/parsers";
import {
  analyzeEvidence,
  type AnalyzerResult,
} from "../../advisor/evidenceAnalyzer/analyzer.service";

function createReq(overrides?: Partial<Request>): any {
  return {
    userId: 1,
    role: "Editor",
    organizationId: 1,
    params: { fileId: "42" },
    fileId: 42,
    body: {},
    t: getTranslator("en"),
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
      {
        key: "sk-test",
        url: "https://api.anthropic.com",
        model: "claude-3-opus",
        name: "Anthropic",
      },
    ]);

    (sequelize.query as jest.Mock)
      .mockResolvedValueOnce([[{ id: 42, filename: "policy.pdf", type: "application/pdf" }], {}]) // file metadata
      .mockResolvedValueOnce([
        [
          {
            content: Buffer.from("some evidence text"),
            size_bytes: 100,
            upload_date: "2026-01-01",
          },
        ],
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
      expect.objectContaining({ userId: 1, visibility: "public", canOverride: false }),
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
      {
        key: "sk-test",
        url: "https://integrate.api.nvidia.com/v1",
        model: "deepseek",
        name: "Custom",
      },
    ]);

    (sequelize.query as jest.Mock)
      .mockResolvedValueOnce([[{ id: 42, filename: "policy.pdf", type: "application/pdf" }], {}])
      .mockResolvedValueOnce([
        [
          {
            content: Buffer.from("some evidence text"),
            size_bytes: 100,
            upload_date: "2026-01-01",
          },
        ],
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

describe("getGaps", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("limits an unfiltered request to the frameworks the organization uses", async () => {
    (getAdoptedEvidenceFrameworksQuery as jest.Mock).mockResolvedValue(["iso_42001"] as never);
    (getEvidenceGapsQuery as jest.Mock).mockResolvedValue([] as never);
    const res = createRes();
    await getGaps(createReq({ query: {} } as any), res);
    expect(getAdoptedEvidenceFrameworksQuery).toHaveBeenCalledWith(1);
    expect(getEvidenceGapsQuery).toHaveBeenCalledWith(1, undefined, undefined, undefined, [
      "iso_42001",
    ]);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("honours an explicit framework without looking up adoption", async () => {
    (getEvidenceGapsQuery as jest.Mock).mockResolvedValue([] as never);
    const res = createRes();
    await getGaps(createReq({ query: { framework_type: "eu_ai_act" } } as any), res);
    expect(getAdoptedEvidenceFrameworksQuery).not.toHaveBeenCalled();
    expect(getEvidenceGapsQuery).toHaveBeenCalledWith(1, "eu_ai_act", undefined);
  });
});

describe("analyzeFile visibility and private analyses", () => {
  const withKeyAndFile = () => {
    (getLLMKeysWithKeyQuery as jest.Mock).mockResolvedValue([
      { key: "sk-test", url: "https://api.example", model: "m", name: "Anthropic" },
    ]);
    (sequelize.query as jest.Mock)
      .mockResolvedValueOnce([[{ id: 42, filename: "policy.pdf", type: "application/pdf" }], {}])
      .mockResolvedValueOnce([[{ content: Buffer.from("text"), size_bytes: 4 }], {}])
      .mockResolvedValueOnce([[], {}]);
    (parseDocument as jest.Mock).mockResolvedValue({ text: "some evidence text" });
    (analyzeEvidence as jest.Mock).mockResolvedValue({
      summary: "S",
      key_findings: [],
      compliance_areas: [],
      quality_score: null,
      overall_quality_grade: "B",
      quality_rationale: null,
      suggested_control_links: [],
      analysis_model: "m",
      audit: null,
    });
    (upsertAnalysisQuery as jest.Mock).mockResolvedValue({ id: 1, file_id: 42 });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // A refused request leaves its queued query results unconsumed.
    (sequelize.query as jest.Mock).mockReset();
    (getAnalysisAuthorQuery as jest.Mock).mockReset().mockResolvedValue(null);
    (requestHasPermission as jest.Mock).mockResolvedValue(false);
  });

  // Any string reached the VARCHAR(10) visibility column, and a value other
  // than public/private hid the analysis from everyone.
  it("rejects a visibility other than public or private before any work", async () => {
    const res = createRes();
    await analyzeFile(createReq({ body: { visibility: "secret" } } as any), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(STATUS_CODE[400]("Visibility must be public or private"));
    expect(getLLMKeysWithKeyQuery).not.toHaveBeenCalled();
    expect(upsertAnalysisQuery).not.toHaveBeenCalled();
  });

  it("accepts private and stores it", async () => {
    withKeyAndFile();
    const res = createRes();
    await analyzeFile(createReq({ body: { visibility: "private" } } as any), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(upsertAnalysisQuery).toHaveBeenCalledWith(
      42,
      1,
      expect.objectContaining({ visibility: "private", analyzed_by: 1 }),
      expect.objectContaining({ userId: 1, visibility: "private", canOverride: false }),
    );
  });

  // Re-analyzing overwrote another user's private analysis, which the advisor
  // path already refuses to do.
  it("refuses to overwrite another user's private analysis, before calling the LLM", async () => {
    withKeyAndFile();
    (getAnalysisAuthorQuery as jest.Mock).mockResolvedValue({
      visibility: "private",
      analyzed_by: 9,
      author_is_member: true,
    });
    const res = createRes();
    await analyzeFile(createReq(), res);
    expect(getAnalysisAuthorQuery).toHaveBeenCalledWith(42, 1);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      STATUS_CODE[409]("This file has a private analysis by another user"),
    );
    expect(analyzeEvidence).not.toHaveBeenCalled();
    expect(upsertAnalysisQuery).not.toHaveBeenCalled();
  });

  it("lets the author re-run their own private analysis", async () => {
    withKeyAndFile();
    (getAnalysisAuthorQuery as jest.Mock).mockResolvedValue({
      visibility: "private",
      analyzed_by: 1,
      author_is_member: true,
    });
    const res = createRes();
    await analyzeFile(createReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(upsertAnalysisQuery).toHaveBeenCalled();
  });

  // Nobody but the author could ever replace a private analysis.
  it("lets a caller with file.admin replace another user's private analysis", async () => {
    withKeyAndFile();
    (requestHasPermission as jest.Mock).mockResolvedValue(true);
    (getAnalysisAuthorQuery as jest.Mock).mockResolvedValue({
      visibility: "private",
      analyzed_by: 9,
      author_is_member: true,
    });
    const res = createRes();
    await analyzeFile(createReq(), res);
    expect(requestHasPermission).toHaveBeenCalledWith(expect.anything(), "file.admin");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(upsertAnalysisQuery).toHaveBeenCalledWith(
      42,
      1,
      expect.anything(),
      expect.objectContaining({ canOverride: true, userId: 1 }),
    );
  });

  it("lets anyone replace a private analysis whose author left the organization", async () => {
    withKeyAndFile();
    (getAnalysisAuthorQuery as jest.Mock).mockResolvedValue({
      visibility: "private",
      analyzed_by: 9,
      author_is_member: false,
    });
    const res = createRes();
    await analyzeFile(createReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // A private re-run replaced a colleague's public analysis (one row per file)
  // and hid it from everyone else.
  it("refuses a private re-run over another user's public analysis", async () => {
    withKeyAndFile();
    (getAnalysisAuthorQuery as jest.Mock).mockResolvedValue({
      visibility: "public",
      analyzed_by: 9,
      author_is_member: true,
    });
    const res = createRes();
    await analyzeFile(createReq({ body: { visibility: "private" } } as any), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      STATUS_CODE[409]("A private analysis would replace another user's analysis of this file"),
    );
    expect(analyzeEvidence).not.toHaveBeenCalled();
  });

  it("still lets a public re-run replace another user's public analysis", async () => {
    withKeyAndFile();
    (getAnalysisAuthorQuery as jest.Mock).mockResolvedValue({
      visibility: "public",
      analyzed_by: 9,
      author_is_member: true,
    });
    const res = createRes();
    await analyzeFile(createReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // The early check ran before the slow LLM call and the write did not
  // re-check, so a private analysis saved meanwhile was overwritten.
  it("answers 409 when the guarded write finds the analysis changed meanwhile", async () => {
    withKeyAndFile();
    (upsertAnalysisQuery as jest.Mock).mockResolvedValue(null);
    (getAnalysisAuthorQuery as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ visibility: "private", analyzed_by: 9, author_is_member: true });
    const res = createRes();
    await analyzeFile(createReq(), res);
    expect(analyzeEvidence).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(applySuggestionsQuery).not.toHaveBeenCalled();
  });

  // A private analysis's suggestions became organization-wide control links.
  it("does not auto-apply the suggestions of a private analysis", async () => {
    withKeyAndFile();
    (analyzeEvidence as jest.Mock).mockResolvedValue({
      summary: "S",
      key_findings: [],
      compliance_areas: [],
      quality_score: null,
      overall_quality_grade: "B",
      quality_rationale: null,
      suggested_control_links: [{ control_id: 3, framework_type: "eu_ai_act" }],
      analysis_model: "m",
      audit: null,
    });
    const res = createRes();
    await analyzeFile(createReq({ body: { visibility: "private" } } as any), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(applySuggestionsQuery).not.toHaveBeenCalled();
  });
});

describe("getSuggestions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Without the caller's id only public analyses matched, so the author of a
  // private analysis got 204 for their own suggestions.
  it("passes the caller's id so their own private analysis is found", async () => {
    (getSuggestionsQuery as jest.Mock).mockResolvedValue({ file_id: 42 } as never);
    const res = createRes();
    await getSuggestions(createReq(), res);
    expect(getSuggestionsQuery).toHaveBeenCalledWith(42, 1, 1);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("getQualityScores", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("passes the caller's id and role so the scores are limited to files they can access", async () => {
    (getQualityScoresQuery as jest.Mock).mockResolvedValue([] as never);
    const res = createRes();
    await getQualityScores(createReq({ query: {} } as any), res);
    expect(getQualityScoresQuery).toHaveBeenCalledWith(1, 1, "Editor", undefined);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
