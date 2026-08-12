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

/**
 * The row objects are the half of the contract the top-level pin above never
 * saw. Phase 3 adds basis / what_would_close_this / related_sections here, and
 * the same hand-mirrored frontend interface has to follow (Task 51).
 */
const EXPECTED_ROW_KEYS: Record<string, { list: string; keys: string[] }> = {
  keyFindings: {
    list: "findings",
    keys: ["text", "section", "severity", "basis", "what_would_close_this", "related_sections"],
  },
  recommendedActions: {
    list: "actions",
    keys: ["action", "suggestedOwner", "priority", "rationale", "basis"],
  },
  riskAnalysis: { list: "top_risks", keys: ["name", "level", "why"] },
  complianceGap: {
    list: "gaps",
    keys: ["control", "gap", "priority", "basis", "what_would_close_this"],
  },
  vendorRisk: { list: "concerns", keys: ["vendor", "concern", "severity", "basis"] },
};

describe("analyzer row shapes (frontend type contract)", () => {
  for (const [name, { list, keys }] of Object.entries(EXPECTED_ROW_KEYS)) {
    it(`${name}.${list}[] exposes exactly ${keys.join(", ")}`, () => {
      const element = (SCHEMAS[name].shape[list] as any).element;
      expect(Object.keys(element.shape).sort()).toEqual([...keys].sort());
    });
  }
});
