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
    201: (data: any) => ({ message: "Created", data }),
    202: (data: any) => ({ message: "Accepted", data }),
    400: (data: any) => ({ message: "Bad request", data }),
    404: (data: any) => ({ message: "Not found", data }),
    409: (data: any) => ({ message: "Conflict", data }),
    500: (error: any) => ({ message: "Internal server error", error }),
  },
}));

import * as utils from "../../utils/riskLink.utils";
import { enqueueRiskLinkRecompute } from "../../services/automations/automationProducer";
import {
  getRiskLinks,
  updateRiskLinkStatus,
  recomputeAllRiskLinks,
  createRiskLink,
} from "../riskLinks.ctrl";

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

  const suggestedInheritance = {
    ...suggested,
    relation_type: "inherits_from" as const,
    source_risk_id: 3,
    target_risk_id: 42,
  };

  it("409s when confirming a suggestion whose child already has a parent", async () => {
    mockUtils.getRiskLinkByIdQuery.mockResolvedValue(suggestedInheritance);
    mockUtils.getConfirmedHierarchyEdgesQuery.mockResolvedValue([
      { childRiskId: 3, parentRiskId: 99 },
    ]);
    const r = res();
    await updateRiskLinkStatus(
      req({ params: { id: "100" }, body: { status: "confirmed" } }) as any,
      r as any,
    );
    expect(mockUtils.getConfirmedHierarchyEdgesQuery).toHaveBeenCalledWith(7, 3, 42);
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: "This risk already has a parent. Remove it first." }),
    );
    expect(mockUtils.updateRiskLinkStatusQuery).not.toHaveBeenCalled();
  });

  it("runs the rule when restoring a dismissed inheritance link", async () => {
    // dismissed -> confirmed reaches the same end state as a fresh POST, so it
    // must be refusable the same way.
    mockUtils.getRiskLinkByIdQuery.mockResolvedValue({
      ...suggestedInheritance,
      status: "dismissed" as const,
    });
    mockUtils.getConfirmedHierarchyEdgesQuery.mockResolvedValue([
      { childRiskId: 42, parentRiskId: 99 },
    ]);
    const r = res();
    await updateRiskLinkStatus(
      req({ params: { id: "100" }, body: { status: "confirmed" } }) as any,
      r as any,
    );
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: "That risk is already a child of another risk, so it cannot be a parent.",
      }),
    );
  });

  it("confirms an inheritance link when the grouping stays two levels deep", async () => {
    mockUtils.getRiskLinkByIdQuery.mockResolvedValue(suggestedInheritance);
    mockUtils.getConfirmedHierarchyEdgesQuery.mockResolvedValue([]);
    const r = res();
    await updateRiskLinkStatus(
      req({ params: { id: "100" }, body: { status: "confirmed" } }) as any,
      r as any,
    );
    expect(mockUtils.updateRiskLinkStatusQuery).toHaveBeenCalledWith(100, 7, "confirmed", 5);
    expect(r.status).toHaveBeenCalledWith(200);
  });

  it("does not run the rule on a related_to row", async () => {
    mockUtils.getRiskLinkByIdQuery.mockResolvedValue(suggested);
    await updateRiskLinkStatus(
      req({ params: { id: "100" }, body: { status: "confirmed" } }) as any,
      res() as any,
    );
    expect(mockUtils.getConfirmedHierarchyEdgesQuery).not.toHaveBeenCalled();
  });

  it("does not run the rule when dismissing an inheritance link", async () => {
    mockUtils.getRiskLinkByIdQuery.mockResolvedValue({
      ...suggestedInheritance,
      status: "confirmed" as const,
    });
    await updateRiskLinkStatus(
      req({ params: { id: "100" }, body: { status: "dismissed" } }) as any,
      res() as any,
    );
    expect(mockUtils.getConfirmedHierarchyEdgesQuery).not.toHaveBeenCalled();
  });

  it("turns a lost single-parent race into 409, not 500", async () => {
    mockUtils.getRiskLinkByIdQuery.mockResolvedValue(suggestedInheritance);
    mockUtils.getConfirmedHierarchyEdgesQuery.mockResolvedValue([]);
    mockUtils.updateRiskLinkStatusQuery.mockRejectedValue({
      original: { code: "23505", constraint: "risk_links_single_parent_idx" },
    });
    const r = res();
    await updateRiskLinkStatus(
      req({ params: { id: "100" }, body: { status: "confirmed" } }) as any,
      r as any,
    );
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: "This risk already has a parent. Remove it first." }),
    );
  });

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

describe("createRiskLink", () => {
  const body = (overrides: any = {}) => ({
    sourceRiskId: 4,
    targetRiskId: 9,
    relationType: "related_to",
    ...overrides,
  });

  it("rejects a malformed body with 400", async () => {
    const r = res();
    await createRiskLink(req({ body: { sourceRiskId: "abc", targetRiskId: 9 } }) as any, r as any);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ data: "Invalid request" }));
    expect(mockUtils.createUserRiskLinkQuery).not.toHaveBeenCalled();
  });

  it("rejects an unknown relationType with 400", async () => {
    const r = res();
    await createRiskLink(req({ body: body({ relationType: "banana" }) }) as any, r as any);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(mockUtils.getLiveRiskIdsQuery).not.toHaveBeenCalled();
  });

  it("rejects a self-link with 400", async () => {
    const r = res();
    await createRiskLink(req({ body: body({ targetRiskId: 4 }) }) as any, r as any);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: "A risk cannot link to itself" }),
    );
    expect(mockUtils.getLiveRiskIdsQuery).not.toHaveBeenCalled();
  });

  it("checks both ids against the caller's org in one query", async () => {
    mockUtils.getLiveRiskIdsQuery.mockResolvedValue([4, 9]);
    mockUtils.createUserRiskLinkQuery.mockResolvedValue(77);
    await createRiskLink(req({ body: body() }) as any, res() as any);
    expect(mockUtils.getLiveRiskIdsQuery).toHaveBeenCalledWith([4, 9], 7);
  });

  // Unknown, cross-org and soft-deleted ids are one code path: the store returns
  // fewer than two rows. They are listed separately because the SQL clause behind
  // each differs, and Task 2 pins them against a real database.
  it.each([
    ["an unknown id", [4]],
    ["a cross-org id", [4]],
    ["a soft-deleted id", [4]],
  ])("404s on %s", async (_label, live) => {
    mockUtils.getLiveRiskIdsQuery.mockResolvedValue(live as number[]);
    const r = res();
    await createRiskLink(req({ body: body() }) as any, r as any);
    expect(r.status).toHaveBeenCalledWith(404);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ data: "Risk not found" }));
    expect(mockUtils.createUserRiskLinkQuery).not.toHaveBeenCalled();
  });

  it("409s with the parent message when the child already has a parent", async () => {
    mockUtils.getLiveRiskIdsQuery.mockResolvedValue([4, 9]);
    mockUtils.getConfirmedHierarchyEdgesQuery.mockResolvedValue([
      { childRiskId: 4, parentRiskId: 12 },
    ]);
    const r = res();
    await createRiskLink(req({ body: body({ relationType: "inherits_from" }) }) as any, r as any);
    // source is the child, target is the parent — {source: 4, target: 9}
    expect(mockUtils.getConfirmedHierarchyEdgesQuery).toHaveBeenCalledWith(7, 4, 9);
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: "This risk already has a parent. Remove it first." }),
    );
    expect(mockUtils.createUserRiskLinkQuery).not.toHaveBeenCalled();
  });

  it("409s when the proposed parent is already someone else's child", async () => {
    mockUtils.getLiveRiskIdsQuery.mockResolvedValue([4, 9]);
    mockUtils.getConfirmedHierarchyEdgesQuery.mockResolvedValue([
      { childRiskId: 9, parentRiskId: 12 },
    ]);
    const r = res();
    await createRiskLink(req({ body: body({ relationType: "inherits_from" }) }) as any, r as any);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: "That risk is already a child of another risk, so it cannot be a parent.",
      }),
    );
  });

  it("409s when the proposed child already has children", async () => {
    mockUtils.getLiveRiskIdsQuery.mockResolvedValue([4, 9]);
    mockUtils.getConfirmedHierarchyEdgesQuery.mockResolvedValue([
      { childRiskId: 12, parentRiskId: 4 },
    ]);
    const r = res();
    await createRiskLink(req({ body: body({ relationType: "inherits_from" }) }) as any, r as any);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: "This risk has child risks, so it cannot become a child." }),
    );
  });

  it("refuses the reciprocal edge that the old two-cycle check caught", async () => {
    mockUtils.getLiveRiskIdsQuery.mockResolvedValue([4, 9]);
    // 4 -> 9 already confirmed; the caller proposes 9 -> 4.
    mockUtils.getConfirmedHierarchyEdgesQuery.mockResolvedValue([
      { childRiskId: 4, parentRiskId: 9 },
    ]);
    const r = res();
    await createRiskLink(
      req({ body: { sourceRiskId: 9, targetRiskId: 4, relationType: "inherits_from" } }) as any,
      r as any,
    );
    expect(r.status).toHaveBeenCalledWith(409);
  });

  it("does not load hierarchy edges for related_to", async () => {
    mockUtils.getLiveRiskIdsQuery.mockResolvedValue([4, 9]);
    mockUtils.createUserRiskLinkQuery.mockResolvedValue(77);
    await createRiskLink(req({ body: body() }) as any, res() as any);
    expect(mockUtils.getConfirmedHierarchyEdgesQuery).not.toHaveBeenCalled();
  });

  it("lets a duplicate inherits_from pair reach the store for its own message", async () => {
    mockUtils.getLiveRiskIdsQuery.mockResolvedValue([4, 9]);
    // The identical edge must not be reported as child_already_has_parent — it
    // would name the very parent the user just tried to add.
    mockUtils.getConfirmedHierarchyEdgesQuery.mockResolvedValue([
      { childRiskId: 4, parentRiskId: 9 },
    ]);
    mockUtils.createUserRiskLinkQuery.mockResolvedValue(null);
    const r = res();
    await createRiskLink(req({ body: body({ relationType: "inherits_from" }) }) as any, r as any);
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: 'These risks are already linked. If the link was dismissed, use "Show dismissed" to restore it.',
      }),
    );
  });

  it("turns a lost single-parent race into 409, not 500", async () => {
    mockUtils.getLiveRiskIdsQuery.mockResolvedValue([4, 9]);
    mockUtils.getConfirmedHierarchyEdgesQuery.mockResolvedValue([]);
    // What node-postgres raises when the partial unique index fires, as
    // Sequelize wraps it for a raw query.
    mockUtils.createUserRiskLinkQuery.mockRejectedValue({
      original: { code: "23505", constraint: "risk_links_single_parent_idx" },
    });
    const r = res();
    await createRiskLink(req({ body: body({ relationType: "inherits_from" }) }) as any, r as any);
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: "This risk already has a parent. Remove it first." }),
    );
  });

  it("still 500s on an unrelated store failure", async () => {
    mockUtils.getLiveRiskIdsQuery.mockResolvedValue([4, 9]);
    mockUtils.createUserRiskLinkQuery.mockRejectedValue(new Error("connection lost"));
    const r = res();
    await createRiskLink(req({ body: body() }) as any, r as any);
    expect(r.status).toHaveBeenCalledWith(500);
  });

  it("409s with the dismissed hint when the pair already exists", async () => {
    mockUtils.getLiveRiskIdsQuery.mockResolvedValue([4, 9]);
    mockUtils.createUserRiskLinkQuery.mockResolvedValue(null);
    const r = res();
    await createRiskLink(req({ body: body() }) as any, r as any);
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data:
          'These risks are already linked. If the link was dismissed, use "Show dismissed" to restore it.',
      }),
    );
  });

  // The load-bearing assertion. Identical input, two relation types, two
  // different column placements. Inverting this has no visible symptom until
  // someone reads an inheritance backwards.
  it("canonicalises related_to to smaller-id-first", async () => {
    mockUtils.getLiveRiskIdsQuery.mockResolvedValue([9, 4]);
    mockUtils.createUserRiskLinkQuery.mockResolvedValue(77);
    const r = res();
    await createRiskLink(
      req({ body: { sourceRiskId: 9, targetRiskId: 4, relationType: "related_to" } }) as any,
      r as any,
    );
    expect(mockUtils.createUserRiskLinkQuery).toHaveBeenCalledWith({
      organizationId: 7,
      sourceRiskId: 4,
      targetRiskId: 9,
      relationType: "related_to",
      userId: 5,
    });
    expect(r.status).toHaveBeenCalledWith(201);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ data: { id: 77 } }));
  });

  it("leaves inherits_from in the order the caller sent", async () => {
    mockUtils.getLiveRiskIdsQuery.mockResolvedValue([9, 4]);
    mockUtils.getConfirmedHierarchyEdgesQuery.mockResolvedValue([]);
    mockUtils.createUserRiskLinkQuery.mockResolvedValue(78);
    const r = res();
    await createRiskLink(
      req({ body: { sourceRiskId: 9, targetRiskId: 4, relationType: "inherits_from" } }) as any,
      r as any,
    );
    expect(mockUtils.createUserRiskLinkQuery).toHaveBeenCalledWith({
      organizationId: 7,
      sourceRiskId: 9,
      targetRiskId: 4,
      relationType: "inherits_from",
      userId: 5,
    });
    expect(r.status).toHaveBeenCalledWith(201);
  });

  it("500s when the store throws", async () => {
    mockUtils.getLiveRiskIdsQuery.mockRejectedValue(new Error("boom"));
    const r = res();
    await createRiskLink(req({ body: body() }) as any, r as any);
    expect(r.status).toHaveBeenCalledWith(500);
  });
});
