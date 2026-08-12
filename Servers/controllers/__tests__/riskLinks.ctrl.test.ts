jest.mock("../../utils/riskLink.utils");
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueRiskLinkRecompute: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(),
  logFailure: jest.fn(),
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (data: any) => ({ message: "OK", data }),
    202: (data: any) => ({ message: "Accepted", data }),
    400: (data: any) => ({ message: "Bad request", data }),
    404: (data: any) => ({ message: "Not found", data }),
    500: (error: any) => ({ message: "Internal server error", error }),
  },
}));

import * as utils from "../../utils/riskLink.utils";
import { enqueueRiskLinkRecompute } from "../../services/automations/automationProducer";
import { getRiskLinks, updateRiskLinkStatus, recomputeAllRiskLinks } from "../riskLinks.ctrl";

const mockUtils = utils as jest.Mocked<typeof utils>;

const res = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

const req = (overrides: any = {}) => ({
  params: {},
  query: {},
  body: {},
  userId: 5,
  organizationId: 7,
  ...overrides,
});
// resetAllMocks, not clearAllMocks — see the note in recompute.spec.ts: a
// rejected implementation set in an error-path test must not leak forward.
beforeEach(() => jest.resetAllMocks());

describe("getRiskLinks", () => {
  it("defaults to suggested and confirmed", async () => {
    mockUtils.getRiskLinksForRiskQuery.mockResolvedValue([]);
    await getRiskLinks(req({ params: { riskId: "42" } }) as any, res() as any);
    expect(mockUtils.getRiskLinksForRiskQuery).toHaveBeenCalledWith(7, 42, [
      "suggested",
      "confirmed",
    ]);
  });

  it("honours ?status=dismissed", async () => {
    mockUtils.getRiskLinksForRiskQuery.mockResolvedValue([]);
    await getRiskLinks(
      req({ params: { riskId: "42" }, query: { status: "dismissed" } }) as any,
      res() as any,
    );
    expect(mockUtils.getRiskLinksForRiskQuery).toHaveBeenCalledWith(7, 42, ["dismissed"]);
  });

  it("rejects an unknown status with 400", async () => {
    const r = res();
    await getRiskLinks(
      req({ params: { riskId: "42" }, query: { status: "banana" } }) as any,
      r as any,
    );
    expect(r.status).toHaveBeenCalledWith(400);
    expect(mockUtils.getRiskLinksForRiskQuery).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric riskId with 400", async () => {
    const r = res();
    await getRiskLinks(req({ params: { riskId: "abc" } }) as any, r as any);
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it("normalises an undirected edge to the caller's perspective", async () => {
    mockUtils.getRiskLinksForRiskQuery.mockResolvedValue([
      {
        id: 100, organization_id: 7, source_risk_id: 3, target_risk_id: 42,
        relation_type: "related_to", status: "suggested", source: "derived",
        score: 5, reasons: [{ signal: "shared_category", weight: 3 }],
        decided_at: null, last_computed_at: null,
        related_id: 3, related_risk_name: "Model drift",
        related_risk_level: "High risk", related_risk_owner: 9,
      },
    ] as any);
    const r = res();
    await getRiskLinks(req({ params: { riskId: "42" } }) as any, r as any);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            id: 100,
            direction: "undirected",
            score: 5,
            relatedRisk: { id: 3, name: "Model drift", riskLevel: "High risk", ownerId: 9 },
          }),
        ],
      }),
    );
  });
});

describe("updateRiskLinkStatus", () => {
  const suggested = {
    id: 100, organization_id: 7, source_risk_id: 3, target_risk_id: 42,
    relation_type: "related_to" as const, status: "suggested" as const,
    source: "derived" as const, score: 5, reasons: [],
    decided_at: null, last_computed_at: null,
  };

  it("confirms a suggestion and records who decided", async () => {
    mockUtils.getRiskLinkByIdQuery.mockResolvedValue(suggested);
    const r = res();
    await updateRiskLinkStatus(
      req({ params: { id: "100" }, body: { status: "confirmed" } }) as any,
      r as any,
    );
    expect(mockUtils.updateRiskLinkStatusQuery).toHaveBeenCalledWith(100, 7, "confirmed", 5);
    expect(r.status).toHaveBeenCalledWith(200);
  });

  it("clears the decision fields on an explicit undo (dismissed -> suggested)", async () => {
    mockUtils.getRiskLinkByIdQuery.mockResolvedValue({ ...suggested, status: "dismissed" });
    await updateRiskLinkStatus(
      req({ params: { id: "100" }, body: { status: "suggested" } }) as any,
      res() as any,
    );
    expect(mockUtils.updateRiskLinkStatusQuery).toHaveBeenCalledWith(100, 7, "suggested", null);
  });

  it("rejects confirmed -> suggested with 400 (R6)", async () => {
    mockUtils.getRiskLinkByIdQuery.mockResolvedValue({ ...suggested, status: "confirmed" });
    const r = res();
    await updateRiskLinkStatus(
      req({ params: { id: "100" }, body: { status: "suggested" } }) as any,
      r as any,
    );
    expect(r.status).toHaveBeenCalledWith(400);
    expect(mockUtils.updateRiskLinkStatusQuery).not.toHaveBeenCalled();
  });

  it("404s on a link belonging to another org", async () => {
    mockUtils.getRiskLinkByIdQuery.mockResolvedValue(null);
    const r = res();
    await updateRiskLinkStatus(
      req({ params: { id: "100" }, body: { status: "confirmed" } }) as any,
      r as any,
    );
    expect(r.status).toHaveBeenCalledWith(404);
  });

  it("rejects an unknown target status with 400", async () => {
    mockUtils.getRiskLinkByIdQuery.mockResolvedValue(suggested);
    const r = res();
    await updateRiskLinkStatus(
      req({ params: { id: "100" }, body: { status: "banana" } }) as any,
      r as any,
    );
    expect(r.status).toHaveBeenCalledWith(400);
  });
});

describe("recomputeAllRiskLinks", () => {
  it("enqueues one job per active risk and answers 202", async () => {
    mockUtils.getActiveRiskIdsQuery.mockResolvedValue([3, 7, 42]);
    const r = res();
    await recomputeAllRiskLinks(req() as any, r as any);
    expect(enqueueRiskLinkRecompute).toHaveBeenCalledTimes(3);
    expect(enqueueRiskLinkRecompute).toHaveBeenCalledWith(7, 42);
    expect(r.status).toHaveBeenCalledWith(202);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ data: { enqueued: 3 } }));
  });
});
