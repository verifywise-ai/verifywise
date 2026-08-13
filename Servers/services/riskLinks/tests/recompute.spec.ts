jest.mock("../../../utils/riskLink.utils");
jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn() },
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { sequelize } from "../../../database/db";
import * as utils from "../../../utils/riskLink.utils";
import { recomputeRiskLinks, LINK_SCORE_THRESHOLD, MAX_LINKS_PER_RISK } from "../recompute";
import { RiskLinkRow, RiskScoringRow } from "../types";

const mockUtils = utils as jest.Mocked<typeof utils>;
const commit = jest.fn();
const rollback = jest.fn();

const risk = (id: number, overrides: Partial<RiskScoringRow> = {}): RiskScoringRow => ({
  id,
  risk_category: null,
  controls_mapping: null,
  assessment_mapping: null,
  ai_lifecycle_phase: null,
  projects: [],
  ...overrides,
});

const link = (overrides: Partial<RiskLinkRow>): RiskLinkRow => ({
  id: 100,
  organization_id: 1,
  source_risk_id: 3,
  target_risk_id: 7,
  relation_type: "related_to",
  status: "suggested",
  source: "derived",
  score: 0,
  reasons: [],
  decided_at: null,
  last_computed_at: null,
  ...overrides,
});

const CAT = { risk_category: ["Strategic risk"] };

// resetAllMocks, not clearAllMocks: clearAllMocks wipes call history but keeps
// implementations, so a mockRejectedValue set in one test leaks into the next.
// The two mocks every test needs are re-established right here.
beforeEach(() => {
  jest.resetAllMocks();
  (sequelize.transaction as jest.Mock).mockResolvedValue({ commit, rollback });
  mockUtils.getIncidentLinksQuery.mockResolvedValue([]);
  // Registering tier 1 makes this a dependency of every test in this file: the
  // automock returns undefined, and a provider that throws now aborts the run.
  mockUtils.getStructuralNeighboursQuery.mockResolvedValue([]);
});

describe("recomputeRiskLinks", () => {
  it("exits quietly when the subject risk is gone (R7)", async () => {
    mockUtils.getRiskScoringRowsQuery.mockResolvedValue([risk(3, CAT)]);
    await recomputeRiskLinks(1, 999);
    expect(sequelize.transaction).not.toHaveBeenCalled();
    expect(mockUtils.deleteRiskLinksQuery).not.toHaveBeenCalled();
  });

  it("creates a canonical edge for a pair at or above the threshold", async () => {
    mockUtils.getRiskScoringRowsQuery.mockResolvedValue([risk(7, CAT), risk(3, CAT)]);
    await recomputeRiskLinks(1, 7);
    expect(mockUtils.upsertRiskLinkQuery).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 1, sourceRiskId: 3, targetRiskId: 7, score: 3 }),
      expect.anything(),
    );
    expect(commit).toHaveBeenCalled();
  });

  it("does not create an edge below the threshold (R2)", async () => {
    // shared project only = 1 point
    mockUtils.getRiskScoringRowsQuery.mockResolvedValue([
      risk(7, { projects: [4] }),
      risk(3, { projects: [4] }),
    ]);
    await recomputeRiskLinks(1, 7);
    expect(mockUtils.upsertRiskLinkQuery).not.toHaveBeenCalled();
  });

  it("keeps a dismissed edge dismissed when its score rises (R1)", async () => {
    mockUtils.getRiskScoringRowsQuery.mockResolvedValue([
      risk(7, { ...CAT, ai_lifecycle_phase: "Deployment" }),
      risk(3, { ...CAT, ai_lifecycle_phase: "Deployment" }),
    ]);
    mockUtils.getIncidentLinksQuery.mockResolvedValue([
      link({ id: 100, status: "dismissed", score: 3 }),
    ]);
    await recomputeRiskLinks(1, 7);
    // The keeper path refreshes score via upsert, which never touches status.
    expect(mockUtils.upsertRiskLinkQuery).toHaveBeenCalledWith(
      expect.objectContaining({ sourceRiskId: 3, targetRiskId: 7, score: 5 }),
      expect.anything(),
    );
    expect(mockUtils.deleteRiskLinksQuery).not.toHaveBeenCalled();
  });

  it("never prunes a confirmed edge, and zeroes its score honestly (R3, R2)", async () => {
    mockUtils.getRiskScoringRowsQuery.mockResolvedValue([risk(7), risk(3)]);
    mockUtils.getIncidentLinksQuery.mockResolvedValue([
      link({ id: 100, status: "confirmed", score: 5 }),
    ]);
    await recomputeRiskLinks(1, 7);
    expect(mockUtils.updateRiskLinkScoreQuery).toHaveBeenCalledWith(
      100, 1, 0, [], expect.anything(),
    );
    expect(mockUtils.deleteRiskLinksQuery).not.toHaveBeenCalled();
  });

  it("prunes a derived suggestion that fell below the threshold", async () => {
    mockUtils.getRiskScoringRowsQuery.mockResolvedValue([risk(7), risk(3)]);
    mockUtils.getIncidentLinksQuery.mockResolvedValue([
      link({ id: 100, status: "suggested", source: "derived", score: 3 }),
    ]);
    await recomputeRiskLinks(1, 7);
    expect(mockUtils.deleteRiskLinksQuery).toHaveBeenCalledWith([100], 1, expect.anything());
  });

  // Amendment A. This is the anti-thrash rule; deleting this test reintroduces the bug.
  it("does NOT prune an at-threshold edge merely because the cap excluded it", async () => {
    // 25 candidates all scoring 5; risk 3 scores 3, so it sorts last and is cut by the cap.
    const strong = Array.from({ length: 25 }, (_, i) =>
      risk(i + 100, { ...CAT, ai_lifecycle_phase: "Deployment" }),
    );
    mockUtils.getRiskScoringRowsQuery.mockResolvedValue([
      risk(7, { ...CAT, ai_lifecycle_phase: "Deployment" }),
      risk(3, CAT),
      ...strong,
    ]);
    mockUtils.getIncidentLinksQuery.mockResolvedValue([
      link({ id: 100, source_risk_id: 3, target_risk_id: 7, status: "suggested", source: "derived" }),
    ]);
    await recomputeRiskLinks(1, 7);
    expect(mockUtils.deleteRiskLinksQuery).not.toHaveBeenCalled();
    expect(mockUtils.updateRiskLinkScoreQuery).toHaveBeenCalledWith(
      100, 1, 3, expect.any(Array), expect.anything(),
    );
  });

  it("caps creation at 20 edges, best score first", async () => {
    const strong = Array.from({ length: 25 }, (_, i) =>
      risk(i + 100, { ...CAT, ai_lifecycle_phase: "Deployment" }),
    );
    mockUtils.getRiskScoringRowsQuery.mockResolvedValue([
      risk(7, { ...CAT, ai_lifecycle_phase: "Deployment" }),
      ...strong,
    ]);
    await recomputeRiskLinks(1, 7);
    expect(mockUtils.upsertRiskLinkQuery).toHaveBeenCalledTimes(MAX_LINKS_PER_RISK);
  });

  it("breaks ties on target risk id ascending, not on risk level", async () => {
    mockUtils.getRiskScoringRowsQuery.mockResolvedValue([
      risk(7, CAT), risk(50, CAT), risk(3, CAT), risk(20, CAT),
    ]);
    await recomputeRiskLinks(1, 7);
    const order = mockUtils.upsertRiskLinkQuery.mock.calls.map(([input]) =>
      input.sourceRiskId === 7 ? input.targetRiskId : input.sourceRiskId,
    );
    expect(order).toEqual([3, 20, 50]);
  });

  it("aborts the run and rethrows when a provider throws", async () => {
    mockUtils.getRiskScoringRowsQuery.mockResolvedValue([risk(7, CAT), risk(3, CAT)]);
    mockUtils.getIncidentLinksQuery.mockResolvedValue([link({ id: 100 })]);
    const provider = require("../providers/fieldOverlap");
    const spy = jest
      .spyOn(provider.fieldOverlapProvider, "score")
      .mockRejectedValue(new Error("boom"));

    await expect(recomputeRiskLinks(1, 7)).rejects.toThrow("boom");

    expect(sequelize.transaction).not.toHaveBeenCalled();
    expect(mockUtils.deleteRiskLinksQuery).not.toHaveBeenCalled();
    expect(mockUtils.upsertRiskLinkQuery).not.toHaveBeenCalled();

    // Neither clearAllMocks nor resetAllMocks undoes a spy — restore it, or the
    // next test gets a provider that still throws.
    spy.mockRestore();
  });

  // Spec §5. Partial knowledge is not knowledge: tier 0 alone would strip every
  // pair's tier-1 points and prune the suggestions that fell below the threshold.
  it("aborts even though the other provider succeeded", async () => {
    mockUtils.getRiskScoringRowsQuery.mockResolvedValue([risk(7, CAT), risk(3, CAT)]);
    mockUtils.getIncidentLinksQuery.mockResolvedValue([link({ id: 100 })]);
    const provider = require("../providers/structuralGraph");
    const spy = jest
      .spyOn(provider.structuralGraphProvider, "score")
      .mockRejectedValue(new Error("graph down"));

    // fieldOverlap succeeds on the shared category and would have scored 3.
    await expect(recomputeRiskLinks(1, 7)).rejects.toThrow("graph down");

    expect(mockUtils.upsertRiskLinkQuery).not.toHaveBeenCalled();
    expect(mockUtils.deleteRiskLinksQuery).not.toHaveBeenCalled();
    expect(mockUtils.updateRiskLinkScoreQuery).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  it("rolls back and rethrows when a write fails", async () => {
    mockUtils.getRiskScoringRowsQuery.mockResolvedValue([risk(7, CAT), risk(3, CAT)]);
    mockUtils.upsertRiskLinkQuery.mockRejectedValue(new Error("db down"));
    await expect(recomputeRiskLinks(1, 7)).rejects.toThrow("db down");
    expect(rollback).toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it("exports the spec's threshold and cap", () => {
    expect(LINK_SCORE_THRESHOLD).toBe(3);
    expect(MAX_LINKS_PER_RISK).toBe(20);
  });

  // Spec §6, second layer. Tier 1 issues its own SQL; if that SQL ever loses an
  // organization filter, the merge must not turn a foreign id into an edge.
  it("ignores a tier-1 target that is not an active risk in this org", async () => {
    mockUtils.getRiskScoringRowsQuery.mockResolvedValue([risk(7), risk(3)]);
    const provider = require("../providers/structuralGraph");
    const spy = jest
      .spyOn(provider.structuralGraphProvider, "score")
      .mockResolvedValue([{ targetRiskId: 999, score: 5, reasons: [] }]);

    await recomputeRiskLinks(1, 7);

    expect(mockUtils.upsertRiskLinkQuery).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
