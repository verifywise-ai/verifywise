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
// The real middleware checks the role's permission; here a header stands in
// for a role without aiDetection.edit (an Auditor or Reviewer).
jest.mock("../../../middleware/accessControl.middleware", () => ({
  __esModule: true,
  default: jest.fn(
    (permission: string) => (req: any, res: any, next: any) =>
      permission === "aiDetection.edit" && req.headers["x-no-edit"]
        ? res.status(403).json({ message: "Forbidden" })
        : next(),
  ),
}));
jest.mock("../../../services/aiDetectionSuggestedRisks.service", () => ({
  listSuggestedRiskActions: jest.fn(),
  recordSuggestedRiskAction: jest.fn(),
  deleteSuggestedRiskAction: jest.fn(),
}));
jest.mock("../../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn().mockResolvedValue(undefined),
  logFailure: jest.fn().mockResolvedValue(undefined),
}));

import routes from "../aiDetectionSuggestedRisks.route";
import {
  deleteSuggestedRiskAction,
  listSuggestedRiskActions,
  recordSuggestedRiskAction,
} from "../../../services/aiDetectionSuggestedRisks.service";
import {
  BusinessLogicException,
  NotFoundException,
} from "../../../domain.layer/exceptions/custom.exception";

const mockList = listSuggestedRiskActions as jest.MockedFunction<typeof listSuggestedRiskActions>;
const mockRecord = recordSuggestedRiskAction as jest.MockedFunction<
  typeof recordSuggestedRiskAction
>;
const mockDelete = deleteSuggestedRiskAction as jest.MockedFunction<
  typeof deleteSuggestedRiskAction
>;

const app = express();
app.use(express.json());
app.use("/api/v1/ai-detection", routes);

const URL = "/api/v1/ai-detection/scans/7/suggested-risks/actions";
const ctx = { userId: 9, role: "Admin", organizationId: 42 };

describe("/api/v1/ai-detection/scans/:scanId/suggested-risks/actions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("answers 401 without a valid token", async () => {
    expect((await request(app).get(URL).set("x-no-auth", "1")).status).toBe(401);
    expect(
      (await request(app).put(URL).set("x-no-auth", "1").send({ risk_name: "A" })).status,
    ).toBe(401);
    expect(mockList).not.toHaveBeenCalled();
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it("lists the scan's actions in the caller's organization, for roles that cannot edit too", async () => {
    mockList.mockResolvedValue([]);
    const res = await request(app).get(URL).set("x-no-edit", "1");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(mockList).toHaveBeenCalledWith(7, ctx);
  });

  it("records an action and returns the scan's actions", async () => {
    mockRecord.mockResolvedValue([]);
    const body = { risk_name: "Prompt injection", action: "added", risk_id: 3 };
    const res = await request(app).put(URL).send(body);
    expect(res.status).toBe(200);
    expect(mockRecord).toHaveBeenCalledWith(7, body, ctx);
  });

  it("needs the permission to edit AI Detection to record or restore", async () => {
    expect(
      (
        await request(app)
          .put(URL)
          .set("x-no-edit", "1")
          .send({ risk_name: "A", action: "ignored", reason: "not_real_risk" })
      ).status,
    ).toBe(403);
    expect((await request(app).delete(`${URL}/5`).set("x-no-edit", "1")).status).toBe(403);
    expect(mockRecord).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("restores an ignored suggestion", async () => {
    mockDelete.mockResolvedValue([]);
    const res = await request(app).delete(`${URL}/5`);
    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith(7, 5, ctx);
  });

  it("maps a double add to 409, an unknown scan to 404 and a bad id to 400", async () => {
    mockRecord.mockRejectedValueOnce(
      new BusinessLogicException("This suggestion is already in the risk register"),
    );
    expect(
      (await request(app).put(URL).send({ risk_name: "A", action: "added", risk_id: 3 })).status,
    ).toBe(409);
    mockList.mockRejectedValueOnce(new NotFoundException("Scan 7 not found"));
    expect((await request(app).get(URL)).status).toBe(404);
    expect(
      (await request(app).get("/api/v1/ai-detection/scans/x/suggested-risks/actions")).status,
    ).toBe(400);
    expect((await request(app).delete(`${URL}/0`)).status).toBe(400);
  });
});
