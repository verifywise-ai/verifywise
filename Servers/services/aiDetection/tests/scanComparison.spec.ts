/**
 * @fileoverview Unit tests for scan comparison logic.
 *
 * Tests the categorisation of findings into new / fixed / unchanged buckets
 * and the score delta calculation without hitting the database.
 */

import { IFinding } from "../../../domain.layer/interfaces/i.aiDetection";

// ============================================================================
// Pure comparison logic extracted for unit testing
// ============================================================================

type FindingKey = string;

function buildKey(f: Pick<IFinding, "finding_type" | "name" | "provider">): FindingKey {
  return `${f.finding_type}::${f.name}::${f.provider || "unknown"}`;
}

function compareFindings(
  currentFindings: IFinding[],
  baselineFindings: IFinding[],
  currentRiskScore: number | null,
  baselineRiskScore: number | null,
) {
  const baselineMap = new Map<FindingKey, IFinding>();
  for (const f of baselineFindings) baselineMap.set(buildKey(f), f);

  const currentMap = new Map<FindingKey, IFinding>();
  for (const f of currentFindings) currentMap.set(buildKey(f), f);

  const newFindings: IFinding[] = [];
  const unchangedFindings: IFinding[] = [];

  for (const f of currentFindings) {
    if (baselineMap.has(buildKey(f))) {
      unchangedFindings.push(f);
    } else {
      newFindings.push(f);
    }
  }

  const fixedFindings: IFinding[] = [];
  for (const f of baselineFindings) {
    if (!currentMap.has(buildKey(f))) fixedFindings.push(f);
  }

  const scoreDelta =
    currentRiskScore != null && baselineRiskScore != null
      ? currentRiskScore - baselineRiskScore
      : null;

  return {
    new: newFindings,
    fixed: fixedFindings,
    unchanged: unchangedFindings,
    summary: {
      new_count: newFindings.length,
      fixed_count: fixedFindings.length,
      unchanged_count: unchangedFindings.length,
      score_delta: scoreDelta,
    },
  };
}

// ============================================================================
// Helpers
// ============================================================================

function makeFinding(overrides: Partial<IFinding> & Pick<IFinding, "name">): IFinding {
  return {
    scan_id: 1,
    finding_type: "library",
    category: "ml-framework",
    provider: "openai",
    confidence: "high",
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("scan comparison logic", () => {
  describe("finding categorisation", () => {
    it("marks a finding as new when it appears in current but not baseline", () => {
      const current = [makeFinding({ name: "new-lib" })];
      const baseline: IFinding[] = [];

      const result = compareFindings(current, baseline, null, null);

      expect(result.new).toHaveLength(1);
      expect(result.new[0].name).toBe("new-lib");
      expect(result.fixed).toHaveLength(0);
      expect(result.unchanged).toHaveLength(0);
    });

    it("marks a finding as fixed when it existed in baseline but not current", () => {
      const current: IFinding[] = [];
      const baseline = [makeFinding({ name: "old-lib" })];

      const result = compareFindings(current, baseline, null, null);

      expect(result.fixed).toHaveLength(1);
      expect(result.fixed[0].name).toBe("old-lib");
      expect(result.new).toHaveLength(0);
      expect(result.unchanged).toHaveLength(0);
    });

    it("marks a finding as unchanged when it exists in both scans", () => {
      const finding = makeFinding({ name: "stable-lib" });
      const result = compareFindings([finding], [finding], null, null);

      expect(result.unchanged).toHaveLength(1);
      expect(result.new).toHaveLength(0);
      expect(result.fixed).toHaveLength(0);
    });

    it("handles all three categories simultaneously", () => {
      const shared = makeFinding({ name: "shared-lib" });
      const added = makeFinding({ name: "added-lib" });
      const removed = makeFinding({ name: "removed-lib" });

      const current = [shared, added];
      const baseline = [shared, removed];

      const result = compareFindings(current, baseline, null, null);

      expect(result.new).toHaveLength(1);
      expect(result.fixed).toHaveLength(1);
      expect(result.unchanged).toHaveLength(1);
    });

    it("distinguishes findings by (finding_type, name, provider) tuple", () => {
      const libOpenAI = makeFinding({ name: "gpt", finding_type: "library", provider: "openai" });
      const libAnthropic = makeFinding({ name: "gpt", finding_type: "library", provider: "anthropic" });

      const result = compareFindings([libOpenAI], [libAnthropic], null, null);

      expect(result.new).toHaveLength(1);
      expect(result.fixed).toHaveLength(1);
      expect(result.unchanged).toHaveLength(0);
    });

    it("treats undefined provider as 'unknown' for matching", () => {
      const withoutProvider = makeFinding({ name: "mylib", provider: undefined });
      const alsoWithoutProvider = makeFinding({ name: "mylib", provider: undefined });

      const result = compareFindings([withoutProvider], [alsoWithoutProvider], null, null);

      expect(result.unchanged).toHaveLength(1);
    });
  });

  describe("score delta", () => {
    it("returns positive delta when risk worsened", () => {
      const result = compareFindings([], [], 75, 50);
      expect(result.summary.score_delta).toBe(25);
    });

    it("returns negative delta when risk improved", () => {
      const result = compareFindings([], [], 30, 60);
      expect(result.summary.score_delta).toBe(-30);
    });

    it("returns zero delta when scores are equal", () => {
      const result = compareFindings([], [], 55, 55);
      expect(result.summary.score_delta).toBe(0);
    });

    it("returns null when current scan has no risk score", () => {
      const result = compareFindings([], [], null, 50);
      expect(result.summary.score_delta).toBeNull();
    });

    it("returns null when baseline scan has no risk score", () => {
      const result = compareFindings([], [], 50, null);
      expect(result.summary.score_delta).toBeNull();
    });

    it("returns null when both scans have no risk score", () => {
      const result = compareFindings([], [], null, null);
      expect(result.summary.score_delta).toBeNull();
    });
  });

  describe("summary counts", () => {
    it("produces correct summary counts", () => {
      const shared = makeFinding({ name: "s" });
      const added = makeFinding({ name: "a" });
      const removed = makeFinding({ name: "r" });

      const result = compareFindings([shared, added], [shared, removed], 80, 70);

      expect(result.summary.new_count).toBe(1);
      expect(result.summary.fixed_count).toBe(1);
      expect(result.summary.unchanged_count).toBe(1);
      expect(result.summary.score_delta).toBe(10);
    });
  });
});
