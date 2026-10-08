import { describe, it, expect } from "vitest";
import { mapRiskClassification } from "../project.mapper";
import { AiRiskClassification } from "../../../domain/enums/aiRiskClassification.enum";

describe("AI risk classification mapping", () => {
  it("keeps Out of scope instead of falling back to Minimal risk", () => {
    expect(mapRiskClassification("Out of scope")).toBe(AiRiskClassification.OUT_OF_SCOPE);
  });
});
