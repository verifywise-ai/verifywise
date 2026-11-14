import {
  calculateRiskLevel,
  normalizeCurrentRiskLevel,
  effectiveRiskLevelSql,
  riskLevelRankSql,
} from "../riskLevel.utils";

const LIKELIHOODS = ["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"];
const SEVERITIES = ["Negligible", "Minor", "Moderate", "Major", "Catastrophic"];

const expectedLabel = (score: number): string => {
  if (score <= 4) return "No risk";
  if (score <= 8) return "Low risk";
  if (score <= 12) return "Medium risk";
  if (score <= 16) return "High risk";
  return "Very high risk";
};

describe("calculateRiskLevel", () => {
  it("labels every likelihood x severity pair by score (1*L + 3*S)", () => {
    const seen = new Set<number>();
    LIKELIHOODS.forEach((l, li) => {
      SEVERITIES.forEach((s, si) => {
        const score = li + 1 + 3 * (si + 1);
        seen.add(score);
        expect(calculateRiskLevel(l, s)).toBe(expectedLabel(score));
      });
    });
    expect(Math.min(...seen)).toBe(4);
    expect(Math.max(...seen)).toBe(20);
  });

  it("gives No risk for Rare x Negligible", () => {
    expect(calculateRiskLevel("Rare", "Negligible")).toBe("No risk");
  });

  it("never produces Very low risk", () => {
    for (const l of LIKELIHOODS)
      for (const s of SEVERITIES) expect(calculateRiskLevel(l, s)).not.toBe("Very low risk");
  });

  it("accepts Critical as an alias of Catastrophic", () => {
    expect(calculateRiskLevel("Rare", "Critical")).toBe(calculateRiskLevel("Rare", "Catastrophic"));
    expect(calculateRiskLevel("Almost Certain", "Critical")).toBe("Very high risk");
  });

  it("accepts labels case-insensitively", () => {
    expect(calculateRiskLevel("almost certain", "MAJOR")).toBe("Very high risk");
    expect(calculateRiskLevel("Almost certain", "Major")).toBe("Very high risk");
  });

  it("returns null for missing or unknown input", () => {
    expect(calculateRiskLevel(null, "Minor")).toBeNull();
    expect(calculateRiskLevel("Rare", undefined)).toBeNull();
    expect(calculateRiskLevel("", "Minor")).toBeNull();
    expect(calculateRiskLevel("Sometimes", "Minor")).toBeNull();
    expect(calculateRiskLevel("Rare", "Huge")).toBeNull();
  });
});

describe("normalizeCurrentRiskLevel", () => {
  it("rewrites the legacy spelling", () => {
    expect(normalizeCurrentRiskLevel("Very Low risk")).toBe("Very low risk");
  });
  it("leaves other values unchanged", () => {
    expect(normalizeCurrentRiskLevel("Very low risk")).toBe("Very low risk");
    expect(normalizeCurrentRiskLevel("High risk")).toBe("High risk");
    expect(normalizeCurrentRiskLevel(undefined)).toBeUndefined();
    expect(normalizeCurrentRiskLevel(null)).toBeNull();
  });
});

describe("SQL helpers", () => {
  it("effectiveRiskLevelSql coalesces current over inherent", () => {
    expect(effectiveRiskLevelSql("pr")).toBe(
      "COALESCE(pr.current_risk_level::text, pr.risk_level_autocalculated::text)",
    );
  });

  it("riskLevelRankSql ranks levels case-insensitively", () => {
    const sql = riskLevelRankSql("x.lvl");
    expect(sql).toContain("lower(x.lvl)");
    expect(sql).toMatch(/'no risk' THEN 0/);
    expect(sql).toMatch(/'very low risk' THEN 1/);
    expect(sql).toMatch(/'low risk' THEN 2/);
    expect(sql).toMatch(/'medium risk' THEN 3/);
    expect(sql).toMatch(/'high risk' THEN 4/);
    expect(sql).toMatch(/'very high risk' THEN 5/);
  });
});
