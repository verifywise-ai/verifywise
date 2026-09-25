import { describe, it, expect } from "vitest";
import { DEFAULT_VALUES } from "../types";

// Regression guard: the backend project-risk validator requires
// `assessment_mapping` and `controls_mapping` to be strings
// (Servers/middleware/validators/risks.validator.ts). Sending numeric 0
// caused POST /api/projectRisks to fail with 400 Bad Request, blocking all
// manual/imported risk creation. These defaults must stay strings.
describe("RiskDatabaseModal DEFAULT_VALUES", () => {
  it("uses string defaults for assessment and controls mapping", () => {
    expect(typeof DEFAULT_VALUES.ASSESSMENT_MAPPING).toBe("string");
    expect(typeof DEFAULT_VALUES.CONTROLS_MAPPING).toBe("string");
  });
});
