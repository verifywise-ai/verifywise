import {
  executiveSummarySchema,
  keyFindingsSchema,
  recommendedActionsSchema,
  riskAnalysisSchema,
  complianceGapSchema,
  vendorRiskSchema,
} from "../schemas";

/**
 * The frontend hand-mirrors these shapes in
 * Clients/src/domain/interfaces/i.reporting.ts because there is no shared
 * types package across the Servers/Clients boundary.
 *
 * If this test fails, the analyzer payload changed and that file must change
 * with it. EvidenceAnalysisPanel is what happens when it does not: it declares
 * `rationales` and `document_signals`, neither of which the backend has ever
 * produced, so one renders empty forever and the other gates dead UI.
 */
const EXPECTED_TOP_LEVEL_KEYS: Record<string, string[]> = {
  executiveSummary: ["summary", "abstain_reason"],
  keyFindings: ["findings", "abstain_reason"],
  recommendedActions: ["actions", "abstain_reason"],
  riskAnalysis: ["narrative", "top_risks", "abstain_reason"],
  complianceGap: ["narrative", "gaps", "scores_caveat", "abstain_reason"],
  vendorRisk: ["narrative", "concerns", "abstain_reason"],
};

const SCHEMAS: Record<string, any> = {
  executiveSummary: executiveSummarySchema,
  keyFindings: keyFindingsSchema,
  recommendedActions: recommendedActionsSchema,
  riskAnalysis: riskAnalysisSchema,
  complianceGap: complianceGapSchema,
  vendorRisk: vendorRiskSchema,
};

describe("analyzer payload shapes (frontend type contract)", () => {
  for (const [name, expected] of Object.entries(EXPECTED_TOP_LEVEL_KEYS)) {
    it(`${name} exposes exactly ${expected.join(", ")}`, () => {
      expect(Object.keys(SCHEMAS[name].shape).sort()).toEqual([...expected].sort());
    });
  }
});
