/**
 * AI Advisor evidence functions (#4912, #4913).
 *
 * detect_evidence_gaps honours framework_type/project_id, covers both
 * frameworks, and is uncapped. analyze_document routes to the real evidence
 * analyzer instead of the retired keyword stub.
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockQuery = jest.fn();
jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));

jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));

jest.mock("../../utils/evidenceAi.utils", () => ({
  getEvidenceGapsQuery: jest.fn(),
  upsertAnalysisQuery: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../parsers", () => ({
  parseDocument: jest.fn().mockResolvedValue({ text: "parsed pdf text" }),
  isSupportedMimeType: jest.fn().mockReturnValue(true),
}));

jest.mock("../evidenceAnalyzer/analyzer.service", () => ({
  analyzeEvidence: jest.fn(),
}));

jest.mock("../../utils/llmKey.utils", () => ({
  getLLMKeysWithKeyQuery: jest.fn(),
  getLLMProviderUrl: jest.fn((name: string) => `https://${name}.example`),
}));

import { availableEvidenceAiTools } from "./evidenceAiFunctions";
import { getEvidenceGapsQuery, upsertAnalysisQuery } from "../../utils/evidenceAi.utils";
import { analyzeEvidence } from "../evidenceAnalyzer/analyzer.service";
import { parseDocument } from "../parsers";
import { getLLMKeysWithKeyQuery } from "../../utils/llmKey.utils";

const detectEvidenceGaps = availableEvidenceAiTools.detect_evidence_gaps as any;
const analyzeDocument = availableEvidenceAiTools.analyze_document as any;

describe("detect_evidence_gaps (#4912)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("honours framework_type and project_id and reports no truncation", async () => {
    (getEvidenceGapsQuery as jest.Mock).mockResolvedValue([
      {
        framework_type: "iso_42001",
        control_id: 3,
        control_title: "A.2",
        evidence_count: 0,
        adequate_count: 0,
        gap_type: "no_evidence",
      },
    ]);

    const result = await detectEvidenceGaps({ framework_type: "iso_42001", project_id: 9 }, 1);

    expect(getEvidenceGapsQuery).toHaveBeenCalledWith(1, "iso_42001", ["D", "F"], 9);
    expect(result.framework_type).toBe("iso_42001");
    expect(result.project_id).toBe(9);
    expect(result.truncated).toBe(false);
    expect(result.controls_without_evidence).toBe(1);
    expect(result.gaps).toHaveLength(1);
  });

  it("defaults to both frameworks when framework_type is missing or unknown", async () => {
    (getEvidenceGapsQuery as jest.Mock).mockResolvedValue([]);

    const result = await detectEvidenceGaps({ framework_type: "nist" }, 1);

    expect(getEvidenceGapsQuery).toHaveBeenCalledWith(1, undefined, ["D", "F"], undefined);
    expect(result.framework_type).toBe("all");
    expect(result.truncated).toBe(false);
  });
});

describe("analyze_document (#4913)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("routes to the real analyzer with the parsed stored content and persists it", async () => {
    mockQuery.mockResolvedValue([
      [
        {
          id: 4,
          filename: "policy.pdf",
          type: "application/pdf",
          content: Buffer.from("%PDF-1.7 binary"),
          uploaded_time: "2026-01-01T00:00:00Z",
        },
      ],
    ]);
    (getLLMKeysWithKeyQuery as jest.Mock).mockResolvedValue([
      { key: "k", url: "", name: "OpenAI", model: "gpt-4", custom_headers: null },
    ]);
    (analyzeEvidence as jest.Mock).mockResolvedValue({
      summary: "S",
      overall_quality_grade: "B",
      audit: { analyzer_version: "evidence-analyzer-v3" },
    });

    // Stored content exists: the parsed file text wins, caller text is ignored.
    const result = await analyzeDocument({ file_id: 4, document_text: "invented text" }, 1);

    expect(parseDocument).toHaveBeenCalled();
    expect(analyzeEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: "policy.pdf",
        documentText: "parsed pdf text",
      }),
    );
    expect(upsertAnalysisQuery).toHaveBeenCalledWith(
      4,
      1,
      expect.objectContaining({ overall_quality_grade: "B" }),
    );
    expect(result.file_id).toBe(4);
    expect(result.overall_quality_grade).toBe("B");
    expect(result.persisted).toBe(true);
  });

  // Review: a private analysis is visible only to its author. The advisor
  // must not overwrite it as a public one.
  it("does not overwrite an existing private analysis", async () => {
    const fileRow = {
      id: 4,
      filename: "policy.pdf",
      type: "application/pdf",
      content: Buffer.from("%PDF-1.7 binary"),
      uploaded_time: "2026-01-01T00:00:00Z",
    };
    mockQuery
      .mockResolvedValueOnce([[fileRow]])
      .mockResolvedValueOnce([[{ visibility: "private", analyzed_by: 7 }]]);
    (getLLMKeysWithKeyQuery as jest.Mock).mockResolvedValue([
      { key: "k", url: "", name: "OpenAI", model: "gpt-4", custom_headers: null },
    ]);
    (analyzeEvidence as jest.Mock).mockResolvedValue({ overall_quality_grade: "B" });

    const result = await analyzeDocument({ file_id: 4 }, 1);

    expect(upsertAnalysisQuery).not.toHaveBeenCalled();
    expect(result.persisted).toBe(false);
    expect(result.not_persisted_reason).toMatch(/private/i);
  });

  it("falls back to document_text only when the file has no content", async () => {
    mockQuery.mockResolvedValue([
      [
        {
          id: 4,
          filename: "notes.txt",
          type: "text/plain",
          content: null,
          uploaded_time: "2026-01-01T00:00:00Z",
        },
      ],
    ]);
    (getLLMKeysWithKeyQuery as jest.Mock).mockResolvedValue([
      { key: "k", url: "", name: "OpenAI", model: "gpt-4", custom_headers: null },
    ]);
    (analyzeEvidence as jest.Mock).mockResolvedValue({ overall_quality_grade: "C" });

    await analyzeDocument({ file_id: 4, document_text: "caller supplied text" }, 1);

    expect(analyzeEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ documentText: "caller supplied text" }),
    );
  });

  // Review: text the model supplied is not the file. Grading it is fine as an
  // answer in the conversation, but storing it as the file's analysis would
  // let the gaps view count a control as covered by text never in the file.
  it("does not store an analysis graded from caller-supplied text", async () => {
    mockQuery.mockResolvedValue([
      [{ id: 4, filename: "notes.txt", type: "text/plain", content: null, uploaded_time: null }],
    ]);
    (getLLMKeysWithKeyQuery as jest.Mock).mockResolvedValue([
      { key: "k", url: "", name: "OpenAI", model: "gpt-4", custom_headers: null },
    ]);
    (analyzeEvidence as jest.Mock).mockResolvedValue({ overall_quality_grade: "A" });

    const result = await analyzeDocument({ file_id: 4, document_text: "caller supplied text" }, 1);

    expect(upsertAnalysisQuery).not.toHaveBeenCalled();
    expect(result.persisted).toBe(false);
    expect(result.not_persisted_reason).toMatch(/stored content/i);
  });

  it("fails clearly when the file does not exist", async () => {
    mockQuery.mockResolvedValue([[]]);

    await expect(analyzeDocument({ file_id: 99 }, 1)).rejects.toThrow(/not found/);
    expect(analyzeEvidence).not.toHaveBeenCalled();
  });
});
