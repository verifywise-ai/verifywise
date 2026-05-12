import {
  validateMappingInput,
  validateScenarioInput,
  validateRecommendationInput,
} from "../validations/governanceOs.valid";

describe("validateMappingInput", () => {
  it("should pass with valid mapping data", () => {
    const result = validateMappingInput({
      source_framework_id: 1,
      target_framework_id: 2,
      source_control_type: "control_category",
      source_control_identifier: "Art.9",
      target_control_type: "clause",
      target_control_identifier: "Clause 6.1",
      mapping_strength: "direct",
      mapping_direction: "bidirectional",
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should fail when required fields are missing", () => {
    const result = validateMappingInput({});

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors).toContain("source_framework_id is required");
    expect(result.errors).toContain("target_framework_id is required");
  });

  it("should fail with invalid mapping_strength", () => {
    const result = validateMappingInput({
      source_framework_id: 1,
      target_framework_id: 2,
      source_control_type: "control_category",
      source_control_identifier: "Art.9",
      target_control_type: "clause",
      target_control_identifier: "Clause 6.1",
      mapping_strength: "invalid" as any,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("mapping_strength"))).toBe(true);
  });

  it("should fail with confidence_score out of range", () => {
    const result = validateMappingInput({
      source_framework_id: 1,
      target_framework_id: 2,
      source_control_type: "control_category",
      source_control_identifier: "Art.9",
      target_control_type: "clause",
      target_control_identifier: "Clause 6.1",
      confidence_score: 1.5,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("confidence_score"))).toBe(true);
  });
});

describe("validateScenarioInput", () => {
  it("should pass with valid scenario data", () => {
    const result = validateScenarioInput({
      name: "Test Scenario",
      industry: "technology",
      region: "eu",
      use_case_type: "high_risk_ai",
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should fail without name", () => {
    const result = validateScenarioInput({
      industry: "technology",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("name is required (1-255 chars)");
  });

  it("should fail with invalid industry", () => {
    const result = validateScenarioInput({
      name: "Test",
      industry: "invalid_industry",
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("industry"))).toBe(true);
  });

  it("should fail with invalid region", () => {
    const result = validateScenarioInput({
      name: "Test",
      region: "antarctica",
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("region"))).toBe(true);
  });
});

describe("validateRecommendationInput", () => {
  it("should pass with at least one field", () => {
    const result = validateRecommendationInput({
      industry: "healthcare",
    });

    expect(result.valid).toBe(true);
  });

  it("should fail with no fields provided", () => {
    const result = validateRecommendationInput({});

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("At least one"))).toBe(true);
  });

  it("should fail with invalid industry", () => {
    const result = validateRecommendationInput({
      industry: "spacefaring",
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("industry"))).toBe(true);
  });

  it("should pass with region only", () => {
    const result = validateRecommendationInput({
      region: "us",
    });

    expect(result.valid).toBe(true);
  });

  it("should pass with riskLevel only", () => {
    const result = validateRecommendationInput({
      riskLevel: "high",
    });

    expect(result.valid).toBe(true);
  });
});
