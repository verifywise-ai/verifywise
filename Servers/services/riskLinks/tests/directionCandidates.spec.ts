jest.mock("../../../utils/riskLink.utils");
jest.mock("../../../database/db", () => ({ sequelize: { transaction: jest.fn() } }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock("../../../utils/llmKey.utils");
jest.mock("../../../advisor/llmSelfCorrect");

import { generateObjectWithSelfCorrection } from "../../../advisor/llmSelfCorrect";
import { getLLMKeysWithKeyQuery } from "../../../utils/llmKey.utils";
import * as utils from "../../../utils/riskLink.utils";
import { suggestDirectionForComponent } from "../direction/direction.service";

const risk = (id: number) => ({
  id,
  risk_name: `Risk ${id}`,
  risk_description: null,
  risk_category: null,
  ai_lifecycle_phase: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  (getLLMKeysWithKeyQuery as jest.Mock).mockResolvedValue([
    { name: "openai", key: "sk-test", model: "gpt-4o-mini", url: null },
  ]);
  (utils.getRiskPromptRowsQuery as jest.Mock).mockResolvedValue([risk(3), risk(4)]);
  (utils.getHierarchyPairsQuery as jest.Mock).mockResolvedValue([]);
  (utils.createAgentHierarchyLinkQuery as jest.Mock).mockResolvedValue(1);
  (generateObjectWithSelfCorrection as jest.Mock).mockResolvedValue({
    object: { groups: [] },
  });
});

const promptSentToModel = () =>
  (generateObjectWithSelfCorrection as jest.Mock).mock.calls[0][0].prompt;

describe("suggestDirectionForComponent candidate gathering", () => {
  it("offers a candidate only to the risks it shares a project with", async () => {
    (utils.getSharedProjectCandidatesQuery as jest.Mock).mockImplementation(
      async (_org: number, riskId: number) =>
        riskId === 3
          ? [{ entityType: "vendor_risk", id: 9, name: "Drift", projects: ["Acme"] }]
          : [],
    );

    await suggestDirectionForComponent(1, [3, 4]);

    expect(promptSentToModel()).toContain("shares a project with risks: 3");
    expect(promptSentToModel()).not.toContain("shares a project with risks: 3, 4");
  });

  it("merges the same candidate reached from two risks into one entry", async () => {
    (utils.getSharedProjectCandidatesQuery as jest.Mock).mockResolvedValue([
      { entityType: "vendor_risk", id: 9, name: "Drift", projects: ["Acme"] },
    ]);

    await suggestDirectionForComponent(1, [3, 4]);

    const prompt = promptSentToModel();
    expect(prompt).toContain("shares a project with risks: 3, 4");
    expect(prompt.match(/vendor_risk 9:/g)).toHaveLength(1);
  });

  // Every candidate shares a project by construction, so there is no ranking to
  // truncate on. Cutting at 25 by id order would pick winners for no reason.
  it("drops the whole candidate block past the cap and still groups the risks", async () => {
    (utils.getSharedProjectCandidatesQuery as jest.Mock).mockResolvedValue(
      Array.from({ length: 26 }, (_, i) => ({
        entityType: "vendor_risk",
        id: i + 1,
        name: `Candidate ${i + 1}`,
        projects: ["Acme"],
      })),
    );
    (generateObjectWithSelfCorrection as jest.Mock).mockResolvedValue({
      object: {
        groups: [
          {
            parent_risk_id: 3,
            parent_entity_type: "risk",
            child_risk_ids: [4],
            reason: "Both describe the same scoring failure.",
          },
        ],
      },
    });

    const written = await suggestDirectionForComponent(1, [3, 4]);

    expect(promptSentToModel()).not.toContain("shares a project");
    expect(written).toBe(1);
  });

  it("writes a vendor parent to the cross-entity column", async () => {
    (utils.getSharedProjectCandidatesQuery as jest.Mock).mockImplementation(
      async (_org: number, riskId: number) =>
        riskId === 4
          ? [{ entityType: "vendor_risk", id: 9, name: "Drift", projects: ["Acme"] }]
          : [],
    );
    (generateObjectWithSelfCorrection as jest.Mock).mockResolvedValue({
      object: {
        groups: [
          {
            parent_risk_id: 9,
            parent_entity_type: "vendor_risk",
            child_risk_ids: [4],
            reason: "The vendor's drift is the umbrella over this rejection risk.",
          },
        ],
      },
    });

    expect(await suggestDirectionForComponent(1, [3, 4])).toBe(1);
    expect(utils.createAgentHierarchyLinkQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        childRiskId: 4,
        parent: { id: 9, entityType: "vendor_risk" },
      }),
    );
  });
});
