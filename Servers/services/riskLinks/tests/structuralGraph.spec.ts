jest.mock("../../../utils/riskLink.utils");

import * as utils from "../../../utils/riskLink.utils";
import { structuralGraphProvider } from "../providers/structuralGraph";
import { RecomputeContext, RiskScoringRow, StructuralNeighbourRow } from "../types";

const mockUtils = utils as jest.Mocked<typeof utils>;

const subject: RiskScoringRow = {
  id: 7,
  risk_category: null,
  controls_mapping: null,
  assessment_mapping: null,
  ai_lifecycle_phase: null,
  projects: [],
};

const ctx: RecomputeContext = { organizationId: 1, subject, candidates: [] };

const shared = (
  targetRiskId: number,
  elementKey: string,
  degree: number,
): StructuralNeighbourRow => ({
  target_risk_id: targetRiskId,
  element_key: elementKey,
  degree,
});

const rows = (...values: StructuralNeighbourRow[]) =>
  mockUtils.getStructuralNeighboursQuery.mockResolvedValue(values);

beforeEach(() => jest.resetAllMocks());

describe("structuralGraphProvider", () => {
  it("scores a single element shared by only these two risks at 1.26", async () => {
    rows(shared(3, "eu_control:412", 2));
    const [candidate] = await structuralGraphProvider.score(ctx);
    expect(candidate).toEqual({
      targetRiskId: 3,
      score: 1.26,
      reasons: [
        { signal: "shared_framework_element", weight: 1.26, detail: "1 EU AI Act control" },
      ],
    });
  });

  it("adds three exclusive elements up past the threshold", async () => {
    rows(
      shared(3, "eu_control:1", 2),
      shared(3, "eu_control:2", 2),
      shared(3, "iso42001_subclause:9", 2),
    );
    const [candidate] = await structuralGraphProvider.score(ctx);
    expect(candidate.score).toBe(3.79);
  });

  it("caps a pair at 4 however many elements it shares", async () => {
    rows(...Array.from({ length: 10 }, (_, i) => shared(3, `eu_control:${i}`, 2)));
    const [candidate] = await structuralGraphProvider.score(ctx);
    expect(candidate.score).toBe(4);
  });

  it("returns a near-ubiquitous element rather than dropping it", async () => {
    rows(shared(3, "eu_control:412", 40));
    const [candidate] = await structuralGraphProvider.score(ctx);
    // The threshold belongs to recompute.ts, not to a provider.
    expect(candidate.score).toBe(0.37);
  });

  it("scores identically read from either endpoint", async () => {
    rows(shared(3, "eu_control:1", 5), shared(3, "nist_subcategory:2", 3));
    const [fromSeven] = await structuralGraphProvider.score(ctx);

    rows(shared(7, "eu_control:1", 5), shared(7, "nist_subcategory:2", 3));
    const [fromThree] = await structuralGraphProvider.score({
      ...ctx,
      subject: { ...subject, id: 3 },
    });

    expect(fromSeven.score).toBe(fromThree.score);
  });

  it("returns an empty array when the risk shares no element", async () => {
    rows();
    await expect(structuralGraphProvider.score(ctx)).resolves.toEqual([]);
  });

  it("orders the breakdown by count descending, then label, and pluralises", async () => {
    rows(
      shared(3, "iso42001_subclause:1", 2),
      shared(3, "eu_control:1", 2),
      shared(3, "eu_control:2", 2),
    );
    const [candidate] = await structuralGraphProvider.score(ctx);
    expect(candidate.reasons[0].detail).toBe("2 EU AI Act controls, 1 ISO 42001 subclause");
  });

  it("counts custom level-2 and level-3 items under one label", async () => {
    rows(shared(3, "custom_l2:1", 2), shared(3, "custom_l3:1", 2));
    const [candidate] = await structuralGraphProvider.score(ctx);
    expect(candidate.reasons[0].detail).toBe("2 custom framework items");
  });

  it("separates two neighbours reached through the same element", async () => {
    rows(shared(3, "eu_control:1", 3), shared(9, "eu_control:1", 3));
    const candidates = await structuralGraphProvider.score(ctx);
    expect(candidates.map((c) => c.targetRiskId).sort()).toEqual([3, 9]);
    expect(candidates.every((c) => c.score === 1)).toBe(true);
  });

  it("propagates a query failure instead of scoring nothing", async () => {
    mockUtils.getStructuralNeighboursQuery.mockRejectedValue(new Error("db down"));
    await expect(structuralGraphProvider.score(ctx)).rejects.toThrow("db down");
  });

  it("declares itself tier 1", () => {
    expect(structuralGraphProvider.name).toBe("structural_graph");
    expect(structuralGraphProvider.tier).toBe(1);
  });
});
