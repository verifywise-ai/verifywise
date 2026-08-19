import {
  mapCategoryNamesToIds,
  mapPhaseNameToId,
  getRiskLevelLabel,
  mapSuggestionToRiskForm,
  mapSuggestionToMitigationForm,
} from "../suggestedRiskMappers";
import { palette } from "../../../../themes/palette";
import type { SuggestedRisk } from "../../../../../domain/ai-detection/riskScoringTypes";

describe("suggestedRiskMappers", () => {
  describe("mapCategoryNamesToIds", () => {
    it("maps known category names to their ids", () => {
      const ids = mapCategoryNamesToIds(["Strategic risk", "Cybersecurity risk"]);
      expect(ids).toEqual([1, 5]);
    });

    it("filters out unknown category names", () => {
      const ids = mapCategoryNamesToIds(["Strategic risk", "Nonexistent risk"]);
      expect(ids).toEqual([1]);
    });

    it("returns an empty array when given an empty list", () => {
      expect(mapCategoryNamesToIds([])).toEqual([]);
    });
  });

  describe("mapPhaseNameToId", () => {
    it("maps a known phase name to its id", () => {
      expect(mapPhaseNameToId("Problem definition & planning")).toBe(1);
    });

    it("returns 0 for an unknown phase name", () => {
      expect(mapPhaseNameToId("Unknown phase")).toBe(0);
    });
  });

  describe("getRiskLevelLabel", () => {
    it("returns 'Very high risk' for score >= 20", () => {
      expect(getRiskLevelLabel(5, 5)).toEqual({
        text: "Very high risk",
        color: palette.risk.critical.text,
      });
    });

    it("returns 'High risk' for score >= 12 and < 20", () => {
      expect(getRiskLevelLabel(4, 3)).toEqual({
        text: "High risk",
        color: palette.risk.high.text,
      });
    });

    it("returns 'Medium risk' for score >= 6 and < 12", () => {
      expect(getRiskLevelLabel(3, 2)).toEqual({
        text: "Medium risk",
        color: palette.risk.medium.text,
      });
    });

    it("returns 'Low risk' for score >= 3 and < 6", () => {
      expect(getRiskLevelLabel(1, 3)).toEqual({
        text: "Low risk",
        color: palette.risk.low.text,
      });
    });

    it("returns 'Very low risk' for score < 3", () => {
      expect(getRiskLevelLabel(1, 1)).toEqual({
        text: "Very low risk",
        color: palette.status.success.text,
      });
    });
  });

  describe("mapSuggestionToRiskForm", () => {
    const suggestion: SuggestedRisk = {
      risk_name: "Data exposure via cloud LLM",
      risk_description: "Sensitive data may be sent to a third-party LLM provider.",
      risk_category: ["Strategic risk", "Cybersecurity risk"],
      ai_lifecycle_phase: "Deployment & integration",
      likelihood: 4,
      severity: 4,
      impact: "High impact on data confidentiality",
      mitigation_plan: "Add data redaction before sending to the LLM.",
      dimension: "data_sovereignty",
      finding_refs: ["finding-1", "finding-2"],
    };

    it("maps a suggestion into risk form values", () => {
      const form = mapSuggestionToRiskForm(suggestion);

      expect(form.riskName).toBe(suggestion.risk_name);
      expect(form.riskDescription).toBe(suggestion.risk_description);
      expect(form.riskCategory).toEqual([1, 5]);
      expect(form.aiLifecyclePhase).toBe(5);
      expect(form.potentialImpact).toBe(suggestion.impact);
      expect(form.likelihood).toBe(4);
      expect(form.riskSeverity).toBe(4);
      expect(form.actionOwner).toBe(0);
      expect(form.applicableProjects).toEqual([]);
      expect(form.applicableFrameworks).toEqual([]);
    });

    it("includes related findings in review notes when present", () => {
      const form = mapSuggestionToRiskForm(suggestion);
      expect(form.reviewNotes).toBe(
        "Suggested by AI scan analysis. Related findings: finding-1, finding-2",
      );
    });

    it("omits related findings text when finding_refs is empty", () => {
      const form = mapSuggestionToRiskForm({ ...suggestion, finding_refs: [] });
      expect(form.reviewNotes).toBe("Suggested by AI scan analysis.");
    });
  });

  describe("mapSuggestionToMitigationForm", () => {
    it("maps the mitigation plan", () => {
      const suggestion = { mitigation_plan: "Rotate credentials" } as SuggestedRisk;
      expect(mapSuggestionToMitigationForm(suggestion)).toEqual({
        mitigationPlan: "Rotate credentials",
      });
    });
  });
});
