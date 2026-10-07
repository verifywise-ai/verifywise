import {
  mapCategoryNamesToIds,
  mapPhaseNameToId,
  getRiskLevelLabel,
  mapSuggestionToRiskForm,
  mapSuggestionToMitigationForm,
  mapMatchedCatalogEntryToRiskForm,
  mapFreeformSuggestionToRiskForm,
  mapFreeformSuggestionToMitigationForm,
  RISK_SUGGESTION_SOURCE_LABELS,
} from "../riskSuggestionMappers";
import { Likelihood, Severity } from "../../RiskLevel/constants";
import { palette } from "../../../themes/palette";
import type { SuggestedRisk } from "../../../../domain/ai-detection/riskScoringTypes";
import type {
  MatchedCatalogRisk,
  SuggestedFreeformRisk,
} from "../../../../domain/types/riskSuggestion.types";

describe("riskSuggestionMappers", () => {
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

    it("uses a custom source label in review notes when provided", () => {
      const form = mapSuggestionToRiskForm(suggestion, { sourceLabel: "AI assistant" });
      expect(form.reviewNotes).toBe(
        "Suggested by AI assistant. Related findings: finding-1, finding-2",
      );
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

  describe("mapMatchedCatalogEntryToRiskForm", () => {
    const mitEntry: MatchedCatalogRisk = {
      source: "mit",
      id: 125,
      summary: "Unauthorized access to model inference endpoints",
      description: "Attackers may gain unauthorized access to exposed inference endpoints.",
      risk_category: ["Cybersecurity risk", "Compliance risk"],
      likelihood: "Almost certain",
      severity: "Major",
      reason: "The use case exposes LLM endpoints without describing access controls.",
      ai_lifecycle_phase: "Deployment & integration",
    };

    it("maps an MIT entry, converting catalog strings via the MIT scale", () => {
      const form = mapMatchedCatalogEntryToRiskForm(mitEntry);

      expect(form.riskName).toBe(mitEntry.summary);
      expect(form.riskDescription).toBe(mitEntry.description);
      expect(form.riskCategory).toEqual([5, 3]);
      // "Almost certain" is MIT's top likelihood label → Likelihood.AlmostCertain (5)
      expect(form.likelihood).toBe(Likelihood.AlmostCertain);
      // "Major" → Severity.Major (4)
      expect(form.riskSeverity).toBe(Severity.Major);
      expect(form.aiLifecyclePhase).toBe(5);
      // Fields the catalog has no answer for keep the initial-state defaults
      expect(form.actionOwner).toBe(0);
      expect(form.potentialImpact).toBe("");
      expect(form.applicableProjects).toEqual([]);
      expect(form.applicableFrameworks).toEqual([]);
    });

    it("maps an IBM entry, converting catalog strings via the IBM scale", () => {
      const ibmEntry: MatchedCatalogRisk = {
        ...mitEntry,
        source: "ibm",
        likelihood: "Likely",
        severity: "Moderate",
      };
      const form = mapMatchedCatalogEntryToRiskForm(ibmEntry);

      expect(form.likelihood).toBe(Likelihood.Likely);
      expect(form.riskSeverity).toBe(Severity.Moderate);
    });

    it("matches MIT's 'Almost certain' case-insensitively", () => {
      const form = mapMatchedCatalogEntryToRiskForm({ ...mitEntry, likelihood: "ALMOST CERTAIN" });
      expect(form.likelihood).toBe(Likelihood.AlmostCertain);
    });

    it("includes the source label and reason in review notes", () => {
      const form = mapMatchedCatalogEntryToRiskForm(mitEntry);
      expect(form.reviewNotes).toBe(
        `Imported from ${RISK_SUGGESTION_SOURCE_LABELS.mit} — AI suggestion for this use case. ${mitEntry.reason}`,
      );
    });

    it("defaults the lifecycle phase when absent or unknown", () => {
      const { ai_lifecycle_phase: _omitted, ...noPhase } = mitEntry;
      expect(mapMatchedCatalogEntryToRiskForm(noPhase).aiLifecyclePhase).toBe(0);
      expect(
        mapMatchedCatalogEntryToRiskForm({ ...mitEntry, ai_lifecycle_phase: "Unknown phase" })
          .aiLifecyclePhase,
      ).toBe(0);
    });

    it("falls back to the default category when no category matches", () => {
      const form = mapMatchedCatalogEntryToRiskForm({ ...mitEntry, risk_category: [] });
      expect(form.riskCategory).toEqual([1]);
    });
  });

  describe("mapFreeformSuggestionToRiskForm", () => {
    const suggestion: SuggestedFreeformRisk = {
      risk_name: "Vendor model deprecation mid-contract",
      risk_description: "The provider may deprecate the model version before the contract ends.",
      risk_category: ["Third-party/vendor risk"],
      ai_lifecycle_phase: "Monitoring & maintenance",
      likelihood: 3,
      severity: 4,
      impact: "Forced migration effort and potential service degradation.",
      mitigation_plan: "Pin model versions and abstract the provider API.",
    };

    it("passes 1-5 likelihood/severity ints straight through", () => {
      const form = mapFreeformSuggestionToRiskForm(suggestion);

      expect(form.riskName).toBe(suggestion.risk_name);
      expect(form.riskDescription).toBe(suggestion.risk_description);
      expect(form.riskCategory).toEqual([9]);
      expect(form.aiLifecyclePhase).toBe(6);
      expect(form.likelihood).toBe(3);
      expect(form.riskSeverity).toBe(4);
      expect(form.potentialImpact).toBe(suggestion.impact);
      expect(form.reviewNotes).toBe("Suggested by AI based on the use case description.");
    });

    it("defaults the lifecycle phase when absent or unknown", () => {
      const { ai_lifecycle_phase: _omitted, ...noPhase } = suggestion;
      expect(mapFreeformSuggestionToRiskForm(noPhase).aiLifecyclePhase).toBe(0);
      expect(
        mapFreeformSuggestionToRiskForm({ ...suggestion, ai_lifecycle_phase: "Unknown phase" })
          .aiLifecyclePhase,
      ).toBe(0);
    });

    it("falls back to the default category when the list is empty", () => {
      const form = mapFreeformSuggestionToRiskForm({ ...suggestion, risk_category: [] });
      expect(form.riskCategory).toEqual([1]);
    });
  });

  describe("mapFreeformSuggestionToMitigationForm", () => {
    it("maps the mitigation plan and copies likelihood/severity", () => {
      const suggestion = {
        mitigation_plan: "Pin model versions",
        likelihood: 2,
        severity: 5,
      } as SuggestedFreeformRisk;
      expect(mapFreeformSuggestionToMitigationForm(suggestion)).toEqual({
        mitigationPlan: "Pin model versions",
        likelihood: 2,
        riskSeverity: 5,
      });
    });
  });
});
