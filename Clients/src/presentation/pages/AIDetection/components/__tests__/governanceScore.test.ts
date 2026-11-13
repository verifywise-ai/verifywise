import { hasNoModelFiles, partialScoreLabel } from "../governanceScore";

describe("hasNoModelFiles", () => {
  const summary = {
    total: 0,
    by_severity: { critical: 0, high: 0, medium: 0, low: 0 },
    by_threat_type: {},
    model_files_scanned: 0,
  };

  it("is true only when no model files were scanned and nothing was found", () => {
    expect(hasNoModelFiles(summary)).toBe(true);
    expect(hasNoModelFiles({ ...summary, model_files_scanned: 2 })).toBe(false);
    expect(hasNoModelFiles({ ...summary, total: 1 })).toBe(false);
  });

  it("is false while the summary hasn't loaded", () => {
    expect(hasNoModelFiles(null)).toBe(false);
    expect(hasNoModelFiles(undefined)).toBe(false);
  });
});

describe("partialScoreLabel", () => {
  it("names why the score is partial", () => {
    expect(partialScoreLabel("off")).toBe("Partial: vulnerability checks off");
    expect(partialScoreLabel("failed")).toBe("Partial: vulnerability checks didn't finish");
    expect(partialScoreLabel("incremental")).toBe(
      "Partial: changed files not checked for vulnerabilities",
    );
    expect(partialScoreLabel("ran")).toBeNull();
  });
});
