const mockUpsert = jest.fn();
jest.mock("../../../../utils/reportRunAnalysis.utils", () => ({
  upsertRunAnalysisQuery: (...a: any[]) => mockUpsert(...a),
}));
jest.mock("../../../../middleware/aiContentTracker.middleware", () => ({
  trackAIContent: jest.fn().mockResolvedValue(null),
}));
jest.mock("../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { persistAnalyses } from "../persistAnalyses";

const analyses: any = {
  executiveSummary: {
    payload: { summary: "s" },
    abstained: false,
    abstain_reason: null,
    model: "gpt-4o-mini",
    attempts: 2,
    restatementRetried: true,
  },
  keyFindings: {
    payload: null,
    abstained: true,
    abstain_reason: "insufficient data for this section",
    model: "gpt-4o-mini",
    attempts: 0,
  },
};

const snapshot = {
  generatedAt: "2026-07-01T00:00:00.000Z",
  framework: "EU AI Act",
  subject: "Test Project",
  sections: { projectRisks: { totalRisks: 5 } },
};

describe("persistAnalyses audit_metadata", () => {
  beforeEach(() => {
    mockUpsert.mockReset().mockResolvedValue({ id: 1 });
  });

  it("stores the run's facts snapshot on every section row", async () => {
    // Every row is a valid answer to "what did the last run see", so the read
    // path never has to care which section's write happened to succeed.
    await persistAnalyses(77, 5, 3, analyses, snapshot);

    expect(mockUpsert).toHaveBeenCalledTimes(2);
    mockUpsert.mock.calls.forEach(([input]: any[]) => {
      expect(input.audit_metadata.facts).toEqual(snapshot);
    });
  });

  it("keeps the existing fields and records whether the shallowness gate re-issued", async () => {
    await persistAnalyses(77, 5, 3, analyses, snapshot);

    const rows = mockUpsert.mock.calls.map(([i]: any[]) => i);
    const keyFindings = rows.find((i: any) => i.section_key === "keyFindings");
    expect(keyFindings.audit_metadata).toEqual(
      expect.objectContaining({
        analyzer_version: expect.any(String),
        abstained: true,
        abstain_reason: "insufficient data for this section",
        attempts: 0,
        // §6 / success criterion 4: the gate's firing has to survive the run,
        // not live only in logger.warn.
        restatement_retried: false,
      }),
    );

    const exec = rows.find((i: any) => i.section_key === "executiveSummary");
    expect(exec.audit_metadata.restatement_retried).toBe(true);
  });

  it("omits the facts key entirely when no snapshot is supplied", async () => {
    // Not `facts: null`: the read query filters on SQL NULL, and a stored JSON
    // null would pass that filter and be read back as a prior.
    await persistAnalyses(77, 5, 3, analyses);

    mockUpsert.mock.calls.forEach(([input]: any[]) => {
      expect(Object.keys(input.audit_metadata)).not.toContain("facts");
    });
  });

  it("still reports per-section ai_status with a snapshot present", async () => {
    const status = await persistAnalyses(77, 5, 3, analyses, snapshot);
    expect(status).toEqual({ executiveSummary: "ok", keyFindings: "abstained" });
  });
});
