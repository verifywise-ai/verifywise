// Servers/controllers/__tests__/intakeForm.review.test.ts
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// intakeForm.ctrl.ts throws at import without a signing secret.
process.env.JWT_SECRET = process.env.JWT_SECRET || "intake-review-test-secret";

jest.mock("../../utils/intakeForm.utils", () => ({
  getIntakeFormByIdQuery: jest.fn(),
  getSubmissionByIdQuery: jest.fn(),
  updateSubmissionRiskOverrideQuery: jest.fn<any>().mockResolvedValue(undefined),
  updateSubmissionRoutingQuery: jest.fn<any>().mockResolvedValue(true),
  updateSuggestedRiskItemQuery: jest.fn(),
  setAllSuggestionStatesQuery: jest.fn(),
  claimSubmissionNotificationQuery: jest.fn(),
}));
jest.mock("../../utils/euAiActClassification.utils", () => ({
  insertClassificationRunQuery: jest.fn(),
  getLatestRunForSubmissionQuery: jest.fn(),
}));
jest.mock("../../utils/intakeSubmissionData.utils", () => ({
  ...(jest.requireActual("../../utils/intakeSubmissionData.utils") as object),
  rescoreStoredRun: jest.fn(),
}));
jest.mock("../../utils/project.utils", () => ({ createNewProjectQuery: jest.fn() }));
jest.mock("../../utils/eu.utils", () => ({ createEUFrameworkQuery: jest.fn() }));
jest.mock("../../utils/modelInventory.utils", () => ({ createNewModelInventoryQuery: jest.fn() }));
jest.mock("../../utils/useCaseChangeHistory.utils", () => ({
  recordMultipleFieldChanges: jest.fn(),
}));
jest.mock("../../services/intakeFormEmail.service", () => ({
  sendSubmissionReceivedEmail: jest.fn(),
  sendNewSubmissionAdminNotification: jest.fn(),
  sendSubmissionApprovedEmail: jest.fn(),
  sendSubmissionRejectedEmail: jest.fn(),
}));
jest.mock("../../services/intakeScoring/enqueue", () => ({
  enqueueIntakeAssessment: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../services/intakeLLM.service", () => ({
  generateSuggestedQuestions: jest.fn(),
  generateFieldGuidance: jest.fn(),
}));
jest.mock("../../utils/aiTrustCentre.utils", () => ({ getCompanyLogoQuery: jest.fn() }));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn<any>().mockResolvedValue(undefined),
  logFailure: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_, err) => (err as Error).message),
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (d: any) => ({ message: "OK", data: d }),
    202: (d: any) => ({ message: "Accepted", data: d }),
    400: (d: any) => ({ message: "Bad Request", data: d }),
    404: (d: any) => ({ message: "Not Found", data: d }),
    409: (d: any) => ({ message: "Conflict", data: d }),
    500: (d: any) => ({ message: "Internal Server Error", data: d }),
  },
}));
jest.mock("../../database/db", () => ({
  sequelize: { transaction: jest.fn() },
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const ctrl = require("../intakeForm.ctrl") as typeof import("../intakeForm.ctrl");
const intake = require("../../utils/intakeForm.utils");
const runs = require("../../utils/euAiActClassification.utils");
const data = require("../../utils/intakeSubmissionData.utils");
const { enqueueIntakeAssessment } = require("../../services/intakeScoring/enqueue");
/* eslint-enable @typescript-eslint/no-require-imports */

const ORG = 5;
const NOW = Date.now();
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

const req = (overrides: any = {}) => ({
  userId: 7,
  organizationId: ORG,
  lang: "en",
  t: (k: string, vars?: Record<string, string>) =>
    vars ? k.replace(/\{(\w+)\}/g, (_, v) => vars[v]) : k,
  params: { id: "11" },
  body: {},
  ...overrides,
});
const res = () => {
  const r: any = {};
  r.status = jest.fn<any>().mockReturnValue(r);
  r.json = jest.fn<any>().mockReturnValue(r);
  return r;
};
const call = async (handler: (rq: any, rs: any) => Promise<unknown>, rq: any) => {
  const r = res();
  await handler(rq, r);
  return { status: r.status.mock.calls[0]?.[0], body: r.json.mock.calls[0]?.[0] };
};

const v2 = (overrides: object = {}) => ({
  version: 2,
  status: "complete",
  notRuleChecked: false,
  classificationLevel: "High risk",
  ruleMinimum: 70,
  ai: null,
  finalScore: 70,
  source: "rule_minimum",
  rulesOnly: false,
  overallScore: 70,
  tier: "High",
  stageStartedAt: minutesAgo(30),
  scoredAt: minutesAgo(29),
  ...overrides,
});
const item = (overrides: object = {}) => ({
  id: "s1",
  source: "ai",
  name: "Biased ranking",
  description: "d",
  categories: [],
  likelihood: "Possible",
  severity: "Major",
  impact: "i",
  mitigationPlan: "Audit rankings",
  implementationStrategy: "HR runs it",
  deadline: null,
  state: "suggested",
  ...overrides,
});
const block = (items: object[] = [item()], overrides: object = {}) => ({
  status: "complete",
  items,
  droppedCount: 0,
  stageStartedAt: minutesAgo(30),
  generatedAt: minutesAgo(29),
  ...overrides,
});
const submission = (overrides: object = {}) => ({
  id: 11,
  formId: 1,
  status: "pending",
  entityType: "use_case",
  data: {},
  riskAssessment: v2(),
  suggestedRisks: block(),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  intake.getSubmissionByIdQuery.mockResolvedValue(submission());
  intake.getIntakeFormByIdQuery.mockResolvedValue({
    id: 1,
    name: "F",
    entityType: "use_case",
    schema: { fields: [] },
    riskTierSystem: "eu_ai_act",
  });
  runs.getLatestRunForSubmissionQuery.mockResolvedValue({ id: 1, questionnaireVersion: 1 });
  data.rescoreStoredRun.mockReturnValue({
    run: { answers: {}, result: { level: "High risk", roles: [] }, createdAt: "x" },
    questionnaire: {},
    result: { level: "High risk", role: null, roles: [], reasons: [], obligations: [] },
  });
});

describe("retrySubmissionAssessment", () => {
  it("retries a stage pending for 15 minutes", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(
      submission({ riskAssessment: v2({ status: "pending", stageStartedAt: minutesAgo(15) }) }),
    );
    const r = await call(ctrl.retrySubmissionAssessment, req());
    expect(r.status).toBe(202);
    expect(r.body.data).toEqual({ stages: ["scoring"] });
    expect(enqueueIntakeAssessment).toHaveBeenCalledWith({
      organizationId: ORG,
      submissionId: 11,
      stages: ["scoring"],
      notify: false,
      lang: "en",
    });
  });

  it("409 when a pending stage is only 2 minutes old", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(
      submission({ riskAssessment: v2({ status: "pending", stageStartedAt: minutesAgo(2) }) }),
    );
    const r = await call(ctrl.retrySubmissionAssessment, req());
    expect(r.status).toBe(409);
    expect(r.body.data).toBe("Nothing to retry");
    expect(enqueueIntakeAssessment).not.toHaveBeenCalled();
  });

  it("only failed suggestions are retried, keeping the finished score", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(
      submission({ suggestedRisks: block([], { status: "ai_failed" }) }),
    );
    const r = await call(ctrl.retrySubmissionAssessment, req());
    expect(r.body.data).toEqual({ stages: ["suggestions"] });
  });

  it("409 for a submission that is not pending", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(
      submission({ status: "approved", riskAssessment: v2({ status: "ai_failed" }) }),
    );
    expect((await call(ctrl.retrySubmissionAssessment, req())).status).toBe(409);
  });

  it("404 for another organization's submission", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(null);
    expect((await call(ctrl.retrySubmissionAssessment, req())).status).toBe(404);
    expect(intake.getSubmissionByIdQuery).toHaveBeenCalledWith(11, ORG);
  });
});

describe("updateSuggestedRisk", () => {
  const patchReq = (body: object, suggestionId = "s1") =>
    req({ params: { id: "11", suggestionId }, body });

  it("accepts and stamps the decision", async () => {
    intake.updateSuggestedRiskItemQuery.mockResolvedValue(item({ state: "accepted" }));
    const r = await call(ctrl.updateSuggestedRisk, patchReq({ state: "accepted" }));
    expect(r.status).toBe(200);
    const [id, sid, patch, org] = intake.updateSuggestedRiskItemQuery.mock.calls[0];
    expect([id, sid, org]).toEqual([11, "s1", ORG]);
    expect(patch).toMatchObject({ state: "accepted", decidedBy: 7 });
    expect(patch.decidedAt).toEqual(expect.any(String));
    expect(patch.editedBy).toBeUndefined();
  });

  it("stamps edits and ignores keys outside the whitelist", async () => {
    intake.updateSuggestedRiskItemQuery.mockResolvedValue(item());
    await call(
      ctrl.updateSuggestedRisk,
      patchReq({ name: "  Renamed  ", id: "evil", source: "mit", decidedBy: 1 }),
    );
    const patch = intake.updateSuggestedRiskItemQuery.mock.calls[0][2];
    expect(patch).toEqual({ name: "Renamed", editedBy: 7, editedAt: expect.any(String) });
  });

  it("400 for a likelihood outside the scale", async () => {
    const r = await call(ctrl.updateSuggestedRisk, patchReq({ likelihood: "Sometimes" }));
    expect(r.status).toBe(400);
    expect(r.body.data).toBe("Invalid value for likelihood");
    expect(intake.updateSuggestedRiskItemQuery).not.toHaveBeenCalled();
  });

  it.each([
    [{ name: "x".repeat(201) }, "name"],
    [{ mitigationPlan: "x".repeat(1001) }, "mitigationPlan"],
    [{ deadline: "2020-01-01" }, "deadline"],
    [{ deadline: "2099-02-30" }, "deadline"],
    [{ modelRiskLevel: "Severe" }, "modelRiskLevel"],
    [{ state: "maybe" }, "state"],
  ])("400 for %j", async (body, field) => {
    const r = await call(ctrl.updateSuggestedRisk, patchReq(body));
    expect(r.status).toBe(400);
    expect(r.body.data).toBe(`Invalid value for ${field}`);
  });

  it("400 when the body changes nothing", async () => {
    const r = await call(ctrl.updateSuggestedRisk, patchReq({ foo: 1 }));
    expect(r.status).toBe(400);
    expect(r.body.data).toBe("Nothing to update");
  });

  it("400 when accepting a risk without a mitigation plan", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(
      submission({ suggestedRisks: block([item({ mitigationPlan: "" })]) }),
    );
    const r = await call(ctrl.updateSuggestedRisk, patchReq({ state: "accepted" }));
    expect(r.status).toBe(400);
    expect(r.body.data).toBe("Add a mitigation plan before accepting this risk");
  });

  it("400 when clearing the mitigation plan of an accepted risk", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(
      submission({ suggestedRisks: block([item({ state: "accepted" })]) }),
    );
    const r = await call(ctrl.updateSuggestedRisk, patchReq({ mitigationPlan: "  " }));
    expect(r.status).toBe(400);
    expect(intake.updateSuggestedRiskItemQuery).not.toHaveBeenCalled();
  });

  it("accepting with a new mitigation plan in the same request is fine", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(
      submission({ suggestedRisks: block([item({ mitigationPlan: "" })]) }),
    );
    intake.updateSuggestedRiskItemQuery.mockResolvedValue(item({ state: "accepted" }));
    const r = await call(
      ctrl.updateSuggestedRisk,
      patchReq({ state: "accepted", mitigationPlan: "Add a review step" }),
    );
    expect(r.status).toBe(200);
  });

  it("404 for another organization's submission", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(null);
    expect((await call(ctrl.updateSuggestedRisk, patchReq({ state: "dismissed" }))).status).toBe(
      404,
    );
  });

  it("404 for an unknown suggestion", async () => {
    const r = await call(ctrl.updateSuggestedRisk, patchReq({ state: "dismissed" }, "nope"));
    expect(r.status).toBe(404);
  });

  it("409 when the submission is no longer pending", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(submission({ status: "approved" }));
    const r = await call(ctrl.updateSuggestedRisk, patchReq({ state: "dismissed" }));
    expect(r.status).toBe(409);
    expect(intake.updateSuggestedRiskItemQuery).not.toHaveBeenCalled();
  });

  it("409 when it changed between the read and the atomic write", async () => {
    intake.updateSuggestedRiskItemQuery.mockResolvedValue(null);
    const r = await call(ctrl.updateSuggestedRisk, patchReq({ state: "dismissed" }));
    expect(r.status).toBe(409);
    expect(r.body.data).toBe("This suggestion changed. Reload and try again.");
  });

  it("409 'only pending' when it was decided between the read and the write", async () => {
    intake.updateSuggestedRiskItemQuery.mockResolvedValue(null);
    intake.getSubmissionByIdQuery
      .mockResolvedValueOnce(submission())
      .mockResolvedValueOnce(submission({ status: "approved" }));
    const r = await call(ctrl.updateSuggestedRisk, patchReq({ state: "dismissed" }));
    expect(r.status).toBe(409);
    expect(r.body.data).toBe("Only pending submissions can be changed");
  });

  it("400 with its own message for a bad suggestion id", async () => {
    const r = await call(
      ctrl.updateSuggestedRisk,
      patchReq({ state: "dismissed" }, "x".repeat(101)),
    );
    expect(r.status).toBe(400);
    expect(r.body.data).toBe("Invalid suggestion ID");
  });
});

describe("acceptAllSuggestedRisks", () => {
  it("accepts suggested items with a mitigation plan and reports the rest", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValueOnce(
      submission({
        suggestedRisks: block([
          item({ id: "a" }),
          item({ id: "b", mitigationPlan: "" }),
          item({ id: "c", state: "dismissed" }),
        ]),
      }),
    );
    const stored = [item({ id: "a", state: "accepted" })];
    intake.getSubmissionByIdQuery.mockResolvedValueOnce(
      submission({ suggestedRisks: block(stored) }),
    );
    intake.setAllSuggestionStatesQuery.mockResolvedValue(1);
    const r = await call(ctrl.acceptAllSuggestedRisks, req());
    expect(r.status).toBe(200);
    // The items come back as stored, for the client to show.
    expect(r.body.data).toEqual({ accepted: 1, skipped: 1, items: stored });
    expect(intake.setAllSuggestionStatesQuery).toHaveBeenCalledWith(
      11,
      "suggested",
      "accepted",
      7,
      ORG,
      { requireMitigationPlan: true },
    );
  });

  it("409 when the submission is not pending", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(submission({ status: "rejected" }));
    expect((await call(ctrl.acceptAllSuggestedRisks, req())).status).toBe(409);
  });

  it("409, not 'skipped', when the submission was decided during the accept", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValueOnce(
      submission({ suggestedRisks: block([item({ id: "a" })]) }),
    );
    intake.getSubmissionByIdQuery.mockResolvedValueOnce(submission({ status: "approved" }));
    intake.setAllSuggestionStatesQuery.mockResolvedValue(0);
    const r = await call(ctrl.acceptAllSuggestedRisks, req());
    expect(r.status).toBe(409);
    expect(r.body.data).toBe("Only pending submissions can be changed");
  });
});

describe("overrideSubmissionRisk", () => {
  const overrideReq = (body: object) => req({ body: { justification: "why", ...body } });

  it("400 for a band below a High risk minimum", async () => {
    const r = await call(ctrl.overrideSubmissionRisk, overrideReq({ tier: "Medium" }));
    expect(r.status).toBe(400);
    expect(r.body.data).toBe("The band can't be lower than the rule minimum allows");
    expect(intake.updateSubmissionRiskOverrideQuery).not.toHaveBeenCalled();
  });

  it("200 for a band at or above it, without dimension overrides", async () => {
    const r = await call(
      ctrl.overrideSubmissionRisk,
      overrideReq({ tier: "Critical", dimensionOverrides: { x: 1 } }),
    );
    expect(r.status).toBe(200);
    expect(intake.updateSubmissionRiskOverrideQuery.mock.calls[0][1]).toMatchObject({
      tier: "Critical",
      dimensionOverrides: {},
    });
  });

  it("400 for a value that is not a band", async () => {
    const r = await call(ctrl.overrideSubmissionRisk, overrideReq({ tier: "Extreme" }));
    expect(r.status).toBe(400);
    expect(r.body.data).toBe("Invalid risk band");
  });

  it("uses the current rules, not the stored level", async () => {
    // Stored as High risk, but the rules now say Minimal risk: no floor.
    data.rescoreStoredRun.mockReturnValue({
      run: {},
      questionnaire: {},
      result: { level: "Minimal risk", role: null, roles: [], reasons: [], obligations: [] },
    });
    const r = await call(ctrl.overrideSubmissionRisk, overrideReq({ tier: "Low" }));
    expect(r.status).toBe(200);
  });

  it("409 for a submission that is not pending", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(submission({ status: "approved" }));
    const r = await call(ctrl.overrideSubmissionRisk, overrideReq({ tier: "Critical" }));
    expect(r.status).toBe(409);
    expect(intake.updateSubmissionRiskOverrideQuery).not.toHaveBeenCalled();
  });

  it("checks bands and the floor before the first score is stored", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(submission({ riskAssessment: null }));
    const bad = await call(ctrl.overrideSubmissionRisk, overrideReq({ tier: "Extreme" }));
    expect(bad.status).toBe(400);
    expect(bad.body.data).toBe("Invalid risk band");
    const low = await call(ctrl.overrideSubmissionRisk, overrideReq({ tier: "Low" }));
    expect(low.status).toBe(400);
    expect(intake.updateSubmissionRiskOverrideQuery).not.toHaveBeenCalled();
  });

  it("stores a pre-v2 tier name as its band", async () => {
    const r = await call(ctrl.overrideSubmissionRisk, overrideReq({ tier: "Unacceptable" }));
    expect(r.status).toBe(200);
    expect(intake.updateSubmissionRiskOverrideQuery.mock.calls[0][1]).toMatchObject({
      tier: "Critical",
    });
  });

  it("keeps dimension overrides for a v1 assessment, storing the tier as its band", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(
      submission({ riskAssessment: { overallScore: 20, tier: "Minimal" } }),
    );
    const r = await call(
      ctrl.overrideSubmissionRisk,
      overrideReq({ tier: "Minimal", dimensionOverrides: { bias: 3 } }),
    );
    expect(r.status).toBe(200);
    expect(intake.updateSubmissionRiskOverrideQuery.mock.calls[0][1]).toMatchObject({
      tier: "Low",
      dimensionOverrides: { bias: 3 },
    });
  });
});

describe("overrideSubmissionRisk lane", () => {
  const routingCfg = {
    enabled: true,
    seniorReviewerIds: [1],
    standardReviewerIds: [2],
    threshold: 50,
    closeCallMargin: 0,
    secondReviewRate: 10,
  };
  const standardRouting = {
    lane: "standard",
    reason: "below_threshold",
    score: 30,
    threshold: 50,
    closeCallMargin: 0,
    routedAt: "x",
  };
  const withRouting = (routing: object | null, cfg: object | null = routingCfg) => {
    intake.getSubmissionByIdQuery.mockResolvedValue(
      submission({ routing, riskAssessment: v2({ classificationLevel: "Limited risk" }) }),
    );
    intake.getIntakeFormByIdQuery.mockResolvedValue({ id: 1, routing: cfg });
    data.rescoreStoredRun.mockReturnValue({
      run: {},
      questionnaire: {},
      result: { level: "Minimal risk", role: null, roles: [], reasons: [], obligations: [] },
    });
  };
  const overrideReq = (tier: string) => req({ body: { justification: "why", tier } });

  it("raises a standard-lane submission to senior when the band reaches the threshold", async () => {
    withRouting(standardRouting);
    const r = await call(ctrl.overrideSubmissionRisk, overrideReq("High"));
    expect(r.status).toBe(200);
    expect(intake.updateSubmissionRoutingQuery).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ lane: "senior", reason: "override_raised", score: 51 }),
      ORG,
      undefined,
      standardRouting,
    );
  });

  it("leaves the lane alone for a band below the threshold", async () => {
    withRouting(standardRouting);
    await call(ctrl.overrideSubmissionRisk, overrideReq("Low"));
    expect(intake.updateSubmissionRoutingQuery).not.toHaveBeenCalled();
  });

  it("never lowers a senior submission", async () => {
    withRouting({ ...standardRouting, lane: "senior", reason: "close_call" });
    await call(ctrl.overrideSubmissionRisk, overrideReq("Low"));
    expect(intake.updateSubmissionRoutingQuery).not.toHaveBeenCalled();
  });

  it("does nothing when routing is off", async () => {
    withRouting(standardRouting, { ...routingCfg, enabled: false });
    const r = await call(ctrl.overrideSubmissionRisk, overrideReq("High"));
    expect(r.status).toBe(200);
    expect(intake.updateSubmissionRoutingQuery).not.toHaveBeenCalled();
  });

  it("still answers 200 when raising the lane fails", async () => {
    withRouting(standardRouting);
    intake.updateSubmissionRoutingQuery.mockRejectedValueOnce(new Error("db down"));
    const r = await call(ctrl.overrideSubmissionRisk, overrideReq("High"));
    expect(r.status).toBe(200);
    expect(intake.updateSubmissionRiskOverrideQuery).toHaveBeenCalled();
  });
});

describe("getSubmissionPreview", () => {
  it("returns the v2 assessment, suggestions and both rule levels", async () => {
    data.rescoreStoredRun.mockReturnValue({
      run: { answers: {}, result: { level: "High risk", roles: [] }, createdAt: "x" },
      questionnaire: {},
      result: { level: "Limited risk", role: null, roles: [], reasons: [], obligations: [] },
    });
    const r = await call(ctrl.getSubmissionPreview, req());
    expect(r.status).toBe(200);
    expect(r.body.data.assessment).toMatchObject({ version: 2, finalScore: 70 });
    expect(r.body.data.suggestedRisks.items).toHaveLength(1);
    expect(r.body.data.assessedLevel).toBe("High risk");
    expect(r.body.data.ruleMinimumPreview).toBe(30); // Limited risk under current rules
  });

  it("returns a null assessment for a v1 one", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(
      submission({ riskAssessment: { overallScore: 20 }, suggestedRisks: null }),
    );
    runs.getLatestRunForSubmissionQuery.mockResolvedValue(null);
    const r = await call(ctrl.getSubmissionPreview, req());
    expect(r.body.data.assessment).toBeNull();
    expect(r.body.data.assessedLevel).toBeNull();
    expect(r.body.data.ruleMinimumPreview).toBeNull();
  });
});
