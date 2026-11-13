import request from "supertest";
import express from "express";

// A header stands in for a request without a valid token.
jest.mock("../../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, res: any, next: any) => {
    if (req.headers["x-no-auth"]) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    req.userId = 9;
    req.role = "Admin";
    req.organizationId = 42;
    req.t = (key: string) => key;
    next();
  },
}));
// The real middleware checks the role's permission; here headers stand in
// for a role without aiDetection.edit (an Auditor or Reviewer) or without
// risks.edit.
jest.mock("../../../middleware/accessControl.middleware", () => ({
  __esModule: true,
  default: jest.fn((permission: string) => (req: any, res: any, next: any) => {
    if (permission === "aiDetection.edit" && req.headers["x-no-edit"]) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (permission === "risks.edit" && req.headers["x-no-risk-edit"]) {
      return res.status(403).json({ message: "Forbidden" });
    }
    return next();
  }),
}));
jest.mock("../../../services/aiDetectionSuggestedRisks.service", () => ({
  listSuggestedRiskActions: jest.fn(),
  recordSuggestedRiskAction: jest.fn(),
  deleteSuggestedRiskAction: jest.fn(),
  addSuggestedRiskToRegister: jest.fn(),
}));
jest.mock("../../../services/aiDetection.service", () => ({
  getScanFindings: jest.fn(),
  updateFindingGovernanceStatus: jest.fn(),
}));
jest.mock("../../../services/aiDetection/riskScoring", () => ({
  calculateAndStoreRiskScore: jest.fn(),
}));
jest.mock("../../../controllers/risks.ctrl", () => ({
  runRiskCreatedSideEffects: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn().mockResolvedValue(undefined),
  logFailure: jest.fn().mockResolvedValue(undefined),
}));

import routes from "../aiDetection.route";
import {
  addSuggestedRiskToRegister,
  deleteSuggestedRiskAction,
  listSuggestedRiskActions,
  recordSuggestedRiskAction,
} from "../../../services/aiDetectionSuggestedRisks.service";
import {
  getScanFindings,
  updateFindingGovernanceStatus,
} from "../../../services/aiDetection.service";
import { runRiskCreatedSideEffects } from "../../../controllers/risks.ctrl";
import {
  BusinessLogicException,
  ConflictException,
  NotFoundException,
} from "../../../domain.layer/exceptions/custom.exception";

const mockList = listSuggestedRiskActions as jest.MockedFunction<typeof listSuggestedRiskActions>;
const mockRecord = recordSuggestedRiskAction as jest.MockedFunction<
  typeof recordSuggestedRiskAction
>;
const mockDelete = deleteSuggestedRiskAction as jest.MockedFunction<
  typeof deleteSuggestedRiskAction
>;
const mockAdd = addSuggestedRiskToRegister as jest.MockedFunction<
  typeof addSuggestedRiskToRegister
>;
const mockFindings = getScanFindings as jest.MockedFunction<typeof getScanFindings>;
const mockGovernance = updateFindingGovernanceStatus as jest.MockedFunction<
  typeof updateFindingGovernanceStatus
>;

const app = express();
app.use(express.json());
app.use("/api/v1/ai-detection", routes);

const URL = "/api/v1/ai-detection/scans/7/suggested-risks/actions";
const RISKS_URL = "/api/v1/ai-detection/scans/7/suggested-risks/risks";
const ctx = { userId: 9, role: "Admin", organizationId: 42 };
const riskBody = {
  risk_name: "Prompt injection",
  risk_owner: 3,
  suggestion_name: "Prompt injection",
};

describe("/api/v1/ai-detection suggested risks", () => {
  beforeEach(() => jest.clearAllMocks());

  it("answers 401 without a valid token", async () => {
    expect((await request(app).get(URL).set("x-no-auth", "1")).status).toBe(401);
    expect(
      (await request(app).put(URL).set("x-no-auth", "1").send({ risk_name: "A" })).status,
    ).toBe(401);
    expect((await request(app).post(RISKS_URL).set("x-no-auth", "1").send(riskBody)).status).toBe(
      401,
    );
    expect(mockList).not.toHaveBeenCalled();
    expect(mockRecord).not.toHaveBeenCalled();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("lists the scan's actions in the caller's organization, for roles that cannot edit too", async () => {
    mockList.mockResolvedValue([]);
    const res = await request(app).get(URL).set("x-no-edit", "1");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(mockList).toHaveBeenCalledWith(7, ctx);
  });

  it("records an ignore and returns the scan's actions", async () => {
    mockRecord.mockResolvedValue([]);
    const body = { risk_name: "Prompt injection", action: "ignored", reason: "not_real_risk" };
    const res = await request(app).put(URL).send(body);
    expect(res.status).toBe(200);
    expect(mockRecord).toHaveBeenCalledWith(7, body, ctx);
  });

  it("needs the permission to edit AI Detection to record, restore or add", async () => {
    expect(
      (
        await request(app)
          .put(URL)
          .set("x-no-edit", "1")
          .send({ risk_name: "A", action: "ignored", reason: "not_real_risk" })
      ).status,
    ).toBe(403);
    expect((await request(app).delete(`${URL}/5`).set("x-no-edit", "1")).status).toBe(403);
    expect((await request(app).post(RISKS_URL).set("x-no-edit", "1").send(riskBody)).status).toBe(
      403,
    );
    expect(mockRecord).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("needs the permission to edit risks to add a suggestion to the register", async () => {
    const res = await request(app).post(RISKS_URL).set("x-no-risk-edit", "1").send(riskBody);
    expect(res.status).toBe(403);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("validates the risk like POST /projectRisks", async () => {
    const res = await request(app).post(RISKS_URL).send({ suggestion_name: "A", risk_name: "A" });
    expect(res.status).toBe(400);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("creates and links the risk in one call and runs the risk side effects", async () => {
    const risk = { id: 55, risk_name: "Prompt injection" };
    mockAdd.mockResolvedValue(risk as never);
    const res = await request(app).post(RISKS_URL).send(riskBody);
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual(risk);
    expect(mockAdd).toHaveBeenCalledWith(
      7,
      "Prompt injection",
      { risk_name: "Prompt injection", risk_owner: 3 },
      ctx,
    );
    expect(runRiskCreatedSideEffects).toHaveBeenCalledWith(risk, expect.anything());
  });

  it("answers 409 with the existing risk id when the suggestion is already in the register", async () => {
    mockAdd.mockRejectedValueOnce(
      new ConflictException("This suggestion is already in the risk register", "risk", "key", {
        metadata: { riskId: 12 },
      }),
    );
    const res = await request(app).post(RISKS_URL).send(riskBody);
    expect(res.status).toBe(409);
    expect(res.body.risk_id).toBe(12);
    expect(runRiskCreatedSideEffects).not.toHaveBeenCalled();
  });

  it("restores an ignored suggestion", async () => {
    mockDelete.mockResolvedValue([]);
    const res = await request(app).delete(`${URL}/5`);
    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith(7, 5, ctx);
  });

  it("maps a refused restore to 422, an unknown scan to 404 and a bad id to 400", async () => {
    mockDelete.mockRejectedValueOnce(
      new BusinessLogicException("Only ignored suggestions can be restored"),
    );
    expect((await request(app).delete(`${URL}/5`)).status).toBe(422);
    mockList.mockRejectedValueOnce(new NotFoundException("Scan 7 not found"));
    expect((await request(app).get(URL)).status).toBe(404);
    expect(
      (await request(app).get("/api/v1/ai-detection/scans/x/suggested-risks/actions")).status,
    ).toBe(400);
    expect((await request(app).delete(`${URL}/0`)).status).toBe(400);
  });
});

describe("/api/v1/ai-detection findings and governance", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns findings with the decision details", async () => {
    const data = {
      findings: [],
      pagination: { total: 0, page: 1, limit: 50, total_pages: 0 },
      is_latest_scan: true,
    };
    mockFindings.mockResolvedValue(data);
    const res = await request(app).get("/api/v1/ai-detection/scans/7/findings?finding_type=secret");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(data);
    expect(mockFindings).toHaveBeenCalledWith(7, ctx, 1, 50, undefined, "secret", {
      includeDecisionDetails: true,
    });
  });

  it("answers the full v1 governance result, including where the change applies", async () => {
    const result = {
      id: 3,
      governance_status: null,
      governance_updated_at: null,
      governance_updated_by: null,
      governance_updated_by_name: null,
      decision_scope: "scan" as const,
    };
    mockGovernance.mockResolvedValue(result);
    const res = await request(app)
      .patch("/api/v1/ai-detection/scans/7/findings/3/governance")
      .send({ governance_status: null });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(result);
  });

  it("needs the permission to edit AI Detection to change a status", async () => {
    const res = await request(app)
      .patch("/api/v1/ai-detection/scans/7/findings/3/governance")
      .set("x-no-edit", "1")
      .send({ governance_status: "approved" });
    expect(res.status).toBe(403);
    expect(mockGovernance).not.toHaveBeenCalled();
  });
});

describe("frozen legacy /api/ai-detection response shapes", () => {
  // Imported here so the mocks above apply.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const legacy = require("../../../controllers/aiDetection.ctrl");

  function mockRes() {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  }
  const baseReq = { userId: 9, role: "Admin", organizationId: 42, t: (k: string) => k };

  beforeEach(() => jest.clearAllMocks());

  it("keeps the legacy governance response: no name, no scope, never null", async () => {
    mockGovernance.mockResolvedValue({
      id: 3,
      governance_status: null,
      governance_updated_at: null,
      governance_updated_by: null,
      governance_updated_by_name: null,
      decision_scope: "scan",
    });
    const res = mockRes();
    await legacy.updateGovernanceStatusController(
      { ...baseReq, params: { scanId: "7", findingId: "3" }, body: { governance_status: null } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0].data;
    expect(Object.keys(data).sort()).toEqual([
      "governance_status",
      "governance_updated_at",
      "governance_updated_by",
      "id",
    ]);
    expect(data.governance_updated_by).toBe(9);
    expect(typeof data.governance_updated_at).toBe("string");
  });

  it("asks for legacy findings without the decision details", async () => {
    mockFindings.mockResolvedValue({
      findings: [],
      pagination: { total: 0, page: 1, limit: 50, total_pages: 0 },
    });
    const res = mockRes();
    await legacy.getScanFindingsController({ ...baseReq, params: { scanId: "7" }, query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockFindings).toHaveBeenCalledWith(7, ctx, 1, 50, undefined, undefined, {
      includeDecisionDetails: false,
    });
  });
});
