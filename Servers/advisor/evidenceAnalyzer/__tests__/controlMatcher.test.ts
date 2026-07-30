/**
 * @fileoverview Control matcher — candidate resolution.
 *
 * The candidate list mixes two frameworks whose id spaces are independent and
 * overlapping: controls_struct_eu runs 1-103, annexcategories_struct_iso runs
 * 1-46, and ids 1-46 name completely different controls in each. A match is
 * only resolvable by framework AND id together.
 *
 * @module advisor/evidenceAnalyzer/__tests__/controlMatcher
 */

const mockSelfCorrect = jest.fn();
jest.mock("../../llmSelfCorrect", () => ({
  generateObjectWithSelfCorrection: (...a: any[]) => mockSelfCorrect(...a),
}));

const mockQuery = jest.fn();
jest.mock("../../../database/db", () => ({
  sequelize: { query: (...a: any[]) => mockQuery(...a) },
}));

jest.mock("../embeddingMatcher", () => ({
  rankControlsByEmbedding: jest.fn().mockResolvedValue(null),
  buildQueryTextForEmbedding: jest.fn().mockReturnValue("q"),
}));

jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import { matchControlsSemantic } from "../controlMatcher";

/** id 5 exists in BOTH catalogues and names unrelated controls. */
const EU_ROWS = [
  {
    id: 5,
    control_title: "No emotion recognition at work",
    control_description: "risk management",
  },
  {
    id: 48,
    control_title: "Bias and Fairness Evaluation",
    control_description: "bias and fairness",
  },
];
const ISO_ROWS = [
  { id: 5, control_title: "Accountability for AI systems", control_description: "risk management" },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery
    .mockResolvedValueOnce([EU_ROWS, {}]) // controls_struct_eu
    .mockResolvedValueOnce([ISO_ROWS, {}]); // annexcategories_struct_iso
});

const params = {
  model: {} as any,
  summary: "s",
  keyFindings: ["f"],
  complianceAreas: ["Risk management", "Bias and fairness"],
};

describe("matchControlsSemantic — resolving a match back to its candidate", () => {
  it("resolves an id shared by both frameworks to the one the model named", async () => {
    // Keyed by id alone, the later-inserted ISO candidate won every collision,
    // so an EU match was stored with an ISO title and framework — and
    // applySuggestionsQuery persists that into file_entity_links as evidence
    // against a control the document has nothing to do with.
    mockSelfCorrect.mockResolvedValue({
      object: {
        matches: [
          {
            control_id: 5,
            framework_type: "eu_ai_act",
            match_score: 80,
            matched_areas: ["Risk management"],
            rationale: "r",
          },
        ],
      },
      attempts: 1,
      selfCorrected: false,
    });

    const out = await matchControlsSemantic(params);

    expect(out).toHaveLength(1);
    expect(out[0].framework_type).toBe("eu_ai_act");
    expect(out[0].control_title).toBe("No emotion recognition at work");
  });

  it("resolves the same id to the ISO control when the model names ISO", async () => {
    mockSelfCorrect.mockResolvedValue({
      object: {
        matches: [
          {
            control_id: 5,
            framework_type: "iso_42001",
            match_score: 80,
            matched_areas: ["Risk management"],
            rationale: "r",
          },
        ],
      },
      attempts: 1,
      selfCorrected: false,
    });

    const out = await matchControlsSemantic(params);

    expect(out[0].framework_type).toBe("iso_42001");
    expect(out[0].control_title).toBe("Accountability for AI systems");
  });

  it("drops a match naming a framework that id does not exist in", async () => {
    // id 48 is EU-only. Claiming it for ISO is a hallucinated pairing, and
    // guessing which one was meant would write the wrong evidence link.
    mockSelfCorrect.mockResolvedValue({
      object: {
        matches: [
          {
            control_id: 48,
            framework_type: "iso_42001",
            match_score: 90,
            matched_areas: ["Bias and fairness"],
            rationale: "r",
          },
        ],
      },
      attempts: 1,
      selfCorrected: false,
    });

    expect(await matchControlsSemantic(params)).toEqual([]);
  });

  it("still drops matches scoring below the keep threshold", async () => {
    mockSelfCorrect.mockResolvedValue({
      object: {
        matches: [
          {
            control_id: 48,
            framework_type: "eu_ai_act",
            match_score: 49,
            matched_areas: ["Bias and fairness"],
            rationale: "r",
          },
        ],
      },
      attempts: 1,
      selfCorrected: false,
    });

    expect(await matchControlsSemantic(params)).toEqual([]);
  });
});
