// Servers/controllers/__tests__/intakeForm.routingDecisions.test.ts
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// intakeForm.ctrl.ts throws at import without a signing secret.
process.env.JWT_SECRET = process.env.JWT_SECRET || "intake-routing-decisions-test-secret";

jest.mock("../../utils/intakeForm.utils", () => ({
  getIntakeFormByIdQuery: jest.fn(),
  getSubmissionByIdQuery: jest.fn(),
  approveSubmissionQuery: jest.fn(),
  rejectSubmissionQuery: jest.fn(),
  getTenantSlugById: jest.fn<any>().mockResolvedValue("t"),
  updateSubmissionRiskOverrideQuery: jest.fn<any>().mockResolvedValue(undefined),
  updateSubmissionAssessmentV2Query: jest.fn<any>().mockResolvedValue(undefined),
  updateSubmissionSuggestionsQuery: jest.fn<any>().mockResolvedValue(undefined),
  setDecisionRecordQuery: jest.fn<any>().mockResolvedValue(undefined),
  updateSubmissionRoutingQuery: jest.fn<any>().mockResolvedValue(true),
  getEligibleReviewersQuery: jest.fn<any>().mockResolvedValue([]),
  getEligibleReviewerIdsQuery: jest.fn<any>().mockResolvedValue([]),
  getPendingSubmissionsQuery: jest.fn(),
}));
jest.mock("../../utils/euAiActClassification.utils", () => ({
  insertClassificationRunQuery: jest.fn<any>().mockResolvedValue({ id: 4 }),
  getLatestRunForSubmissionQuery: jest.fn(),
}));
jest.mock("../../utils/intakeSubmissionData.utils", () => ({
  ...(jest.requireActual("../../utils/intakeSubmissionData.utils") as object),
  rescoreStoredRun: jest.fn(),
}));
jest.mock("../../utils/project.utils", () => ({ createNewProjectQuery: jest.fn() }));
jest.mock("../../utils/eu.utils", () => ({ createEUFrameworkQuery: jest.fn() }));
jest.mock("../../utils/modelInventory.utils", () => ({ createNewModelInventoryQuery: jest.fn() }));
jest.mock("../../domain.layer/models/modelInventory/modelInventory.model", () => ({
  ModelInventoryModel: { createNewModelInventory: jest.fn((x: unknown) => x) },
}));
jest.mock("../../utils/useCaseChangeHistory.utils", () => ({
  recordMultipleFieldChanges: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../services/risk.service", () => ({ createRiskService: jest.fn() }));
jest.mock("../../utils/modelRisk.utils", () => ({ createNewModelRiskQuery: jest.fn() }));
jest.mock("../../services/intakeFormEmail.service", () => ({
  sendSubmissionReceivedEmail: jest.fn(),
  sendNewSubmissionAdminNotification: jest.fn(),
  sendSubmissionApprovedEmail: jest.fn<any>().mockResolvedValue(undefined),
  sendSubmissionRejectedEmail: jest.fn<any>().mockResolvedValue(undefined),
  sendSecondReviewRequestEmail: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../services/intakeScoring/enqueue", () => ({ enqueueIntakeAssessment: jest.fn() }));
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
    400: (d: any) => ({ message: "Bad Request", data: d }),
    403: (d: any) => ({ message: "Forbidden", data: d }),
    404: (d: any) => ({ message: "Not Found", data: d }),
    409: (d: any) => ({ message: "Conflict", data: d }),
    500: (d: any) => ({ message: "Internal Server Error", data: d }),
  },
}));
const tx = { commit: jest.fn(), rollback: jest.fn() };
jest.mock("../../database/db", () => ({
  sequelize: { transaction: jest.fn<any>().mockImplementation(async () => tx) },
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const ctrl = require("../intakeForm.ctrl") as typeof import("../intakeForm.ctrl");
const intake = require("../../utils/intakeForm.utils");
const emails = require("../../services/intakeFormEmail.service");
const runs = require("../../utils/euAiActClassification.utils");
const data = require("../../utils/intakeSubmissionData.utils");
const projects = require("../../utils/project.utils");
const { logSuccess } = require("../../utils/logger/logHelper");
/* eslint-enable @typescript-eslint/no-require-imports */

const ORG = 5;
const SENIOR = 1;
const STANDARD = 2;
const OTHER = 9;

const routingCfg = (overrides: object = {}) => ({
  enabled: true,
  seniorReviewerIds: [SENIOR],
  standardReviewerIds: [STANDARD],
  threshold: 50,
  closeCallMargin: 10,
  secondReviewRate: 0,
  ...overrides,
});
const STANDARD_LANE = {
  lane: "standard",
  reason: "below_threshold",
  score: 20,
  threshold: 50,
  closeCallMargin: 10,
  routedAt: "2026-10-22T00:00:00.000Z",
};
const SENIOR_LANE = {
  ...STANDARD_LANE,
  lane: "senior",
  reason: "at_or_above_threshold",
  score: 80,
};

const v2 = (overrides: object = {}) => ({
  version: 2,
  status: "complete",
  notRuleChecked: false,
  classificationLevel: "Minimal risk",
  ruleMinimum: 0,
  ai: { runs: [], failedRuns: 0, validRuns: 5, median: 20, min: 15, max: 25, reasons: [] },
  finalScore: 20,
  source: "ai",
  rulesOnly: false,
  overallScore: 20,
  tier: "Low",
  stageStartedAt: "x",
  scoredAt: "y",
  ...overrides,
});
const submission = (overrides: object = {}) => ({
  id: 11,
  status: "pending",
  formId: 1,
  entityType: "use_case",
  data: {},
  submitterEmail: null,
  riskAssessment: v2(),
  riskOverride: null,
  suggestedRisks: { status: "complete", items: [], droppedCount: 0 },
  routing: STANDARD_LANE,
  ...overrides,
});
const form = (routing: object | null = routingCfg()) => ({
  id: 1,
  name: "F",
  schema: { version: "1.0", fields: [] },
  routing,
});
const rescoredAs = (level: string) => ({
  run: { questionnaireVersion: 1, answers: {}, result: { level, roles: [] }, createdAt: "z" },
  questionnaire: {},
  result: { level, role: null, roles: [], reasons: [], obligations: [] },
});

const res = () => {
  const r: any = {};
  r.status = jest.fn<any>().mockReturnValue(r);
  r.json = jest.fn<any>().mockReturnValue(r);
  return r;
};
const interpolate = (k: string, vars?: Record<string, string>) =>
  k.replace(/\{(\w+)\}/g, (_, v) => vars?.[v] ?? `{${v}}`);
const request = (userId: number, body: object = {}, role = "Editor") => ({
  userId,
  role,
  organizationId: ORG,
  lang: "en",
  t: interpolate,
  params: { id: "11" },
  body: { confirmedEntityData: { project_title: "P" }, ...body },
});
const call = async (fn: (req: any, res: any) => Promise<unknown>, req: object) => {
  const r = res();
  await fn(req, r);
  return { status: r.status.mock.calls[0]?.[0], body: r.json.mock.calls[0]?.[0] };
};
const approve = (userId: number, body: object = {}, role?: string) =>
  call(ctrl.approveSubmission, request(userId, body, role));
const reject = (userId: number, role?: string) =>
  call(ctrl.rejectSubmission, request(userId, { rejectionReason: "Not now" }, role));
const escalate = (userId: number, reason: unknown = "Needs a closer look", role?: string) =>
  call(ctrl.escalateSubmission, request(userId, { reason }, role));
const PROHIBITED = {
  euAiActOverride: { level: "Prohibited", justification: "social scoring of applicants" },
};

beforeEach(() => {
  jest.clearAllMocks();
  intake.getSubmissionByIdQuery.mockResolvedValue(submission());
  intake.getIntakeFormByIdQuery.mockResolvedValue(form());
  intake.approveSubmissionQuery.mockResolvedValue({ id: 11 });
  intake.rejectSubmissionQuery.mockResolvedValue({ id: 11 });
  intake.updateSubmissionRoutingQuery.mockResolvedValue(true);
  intake.getEligibleReviewersQuery.mockResolvedValue([]);
  projects.createNewProjectQuery.mockResolvedValue({ id: 50 });
  runs.getLatestRunForSubmissionQuery.mockResolvedValue({ id: 1, questionnaireVersion: 1 });
  data.rescoreStoredRun.mockReturnValue(rescoredAs("Minimal risk"));
});

describe("approve: who may decide", () => {
  it("a standard reviewer can't approve while setting the level to Prohibited", async () => {
    const r = await approve(STANDARD, PROHIBITED);
    expect(r.status).toBe(403);
    expect(r.body.data).toBe("A senior reviewer has to decide this: prohibited practice");
    expect(tx.rollback).toHaveBeenCalled();
    expect(tx.commit).not.toHaveBeenCalled();
    expect(intake.approveSubmissionQuery).not.toHaveBeenCalled();
  });

  it("a standard reviewer can't approve with a band override that crosses the threshold", async () => {
    const r = await approve(STANDARD, {
      riskOverride: { tier: "Critical", justification: "worse than scored" },
    });
    expect(r.status).toBe(403);
    expect(r.body.data).toBe(
      "A senior reviewer has to decide this: the score is at or above the threshold",
    );
  });

  it("a senior reviewer can approve the same", async () => {
    const r = await approve(SENIOR, PROHIBITED);
    expect(r.status).toBe(200);
    expect(tx.commit).toHaveBeenCalled();
    expect(intake.setDecisionRecordQuery.mock.calls[0][1]).toMatchObject({
      level: "Prohibited",
      computedBand: "Critical",
      lane: "senior",
    });
  });

  it("a standard reviewer can't approve a senior-lane submission", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(submission({ routing: SENIOR_LANE }));
    const r = await approve(STANDARD);
    expect(r.status).toBe(403);
    expect(r.body.data).toBe(
      "A senior reviewer has to decide this: the score is at or above the threshold",
    );
  });

  it("an Admin in neither list may decide, logged as outside their lane", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(submission({ routing: SENIOR_LANE }));
    const r = await approve(OTHER, {}, "Admin");
    expect(r.status).toBe(200);
    expect(
      logSuccess.mock.calls.some((c: any[]) =>
        String(c[0].description).includes("decided outside their lane"),
      ),
    ).toBe(true);
  });

  it("a user in neither list can't approve a standard-lane submission", async () => {
    const r = await approve(OTHER);
    expect(r.status).toBe(403);
    expect(r.body.data).toBe("This submission is assigned to the form's reviewers");
  });

  it("routing off: any intakeForm.edit user may approve", async () => {
    intake.getIntakeFormByIdQuery.mockResolvedValue(form(routingCfg({ enabled: false })));
    intake.getSubmissionByIdQuery.mockResolvedValue(submission({ routing: SENIOR_LANE }));
    const r = await approve(OTHER, PROHIBITED);
    expect(r.status).toBe(200);
  });
});

describe("routing on, no lane stored yet", () => {
  const PENDING_SCORE = v2({ status: "pending", ai: null, finalScore: null, tier: null });
  const unrouted = (overrides: object = {}) => submission({ routing: null, ...overrides });

  it("scoring still running: a standard reviewer can't approve", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(unrouted({ riskAssessment: PENDING_SCORE }));
    const r = await approve(STANDARD);
    expect(r.status).toBe(403);
    expect(r.body.data).toBe("A senior reviewer has to decide this: no usable score");
    expect(intake.approveSubmissionQuery).not.toHaveBeenCalled();
  });

  it("scoring still running: a senior reviewer can approve", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(unrouted({ riskAssessment: PENDING_SCORE }));
    const r = await approve(SENIOR);
    expect(r.status).toBe(200);
    expect(intake.setDecisionRecordQuery.mock.calls[0][1].lane).toBe("senior");
  });

  it("scoring still running: a standard reviewer can't reject", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(unrouted({ riskAssessment: PENDING_SCORE }));
    const r = await reject(STANDARD);
    expect(r.status).toBe(403);
    expect(r.body.data).toBe("This submission is assigned to senior reviewers");
    expect(tx.rollback).toHaveBeenCalled();
    expect(intake.rejectSubmissionQuery).not.toHaveBeenCalled();
  });

  it("scoring still running: a senior reviewer can reject", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(unrouted({ riskAssessment: PENDING_SCORE }));
    const r = await reject(SENIOR);
    expect(r.status).toBe(200);
  });

  it("scoring still running: the preview blocks a standard reviewer", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(unrouted({ riskAssessment: PENDING_SCORE }));
    intake.getEligibleReviewersQuery.mockResolvedValue([
      { id: SENIOR, name: "Sam", surname: "Senior", email: "s@x" },
    ]);
    const r = await call(ctrl.getSubmissionPreview, request(STANDARD));
    expect(r.body.data).toMatchObject({
      routing: null,
      canDecide: false,
      decideBlockedReason: "This submission is assigned to senior reviewers",
      laneReviewers: [{ id: SENIOR, name: "Sam Senior" }],
    });
  });

  it("a low settled score: a standard reviewer can approve and reject", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(unrouted());
    expect((await approve(STANDARD)).status).toBe(200);
    expect(intake.setDecisionRecordQuery.mock.calls[0][1].lane).toBe("standard");
    expect((await reject(STANDARD)).status).toBe(200);
    const preview = await call(ctrl.getSubmissionPreview, request(STANDARD));
    expect(preview.body.data.canDecide).toBe(true);
  });

  it("a Prohibited level set in the dialog still needs a senior reviewer", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(unrouted());
    const r = await approve(STANDARD, PROHIBITED);
    expect(r.status).toBe(403);
  });

  it("routing off: anyone may decide while scoring runs", async () => {
    intake.getIntakeFormByIdQuery.mockResolvedValue(form(routingCfg({ enabled: false })));
    intake.getSubmissionByIdQuery.mockResolvedValue(unrouted({ riskAssessment: PENDING_SCORE }));
    expect((await approve(OTHER)).status).toBe(200);
    expect((await reject(OTHER)).status).toBe(200);
  });
});

describe("approve: a use case without a stored EU AI Act run", () => {
  const prohibitedEntity = {
    confirmedEntityData: { project_title: "P", ai_risk_classification: "Prohibited" },
  };
  beforeEach(() => {
    runs.getLatestRunForSubmissionQuery.mockResolvedValue(null);
  });

  it("a standard reviewer can't create it at Prohibited on the standard lane", async () => {
    const r = await approve(STANDARD, prohibitedEntity);
    expect(r.status).toBe(403);
    expect(r.body.data).toBe("A senior reviewer has to decide this: prohibited practice");
    expect(projects.createNewProjectQuery).not.toHaveBeenCalled();
  });

  it("the form's own option value counts too", async () => {
    const r = await approve(STANDARD, {
      confirmedEntityData: { project_title: "P", ai_risk_classification: "unacceptable" },
    });
    expect(r.status).toBe(403);
  });

  it("a senior reviewer can, and the record carries the level", async () => {
    const r = await approve(SENIOR, prohibitedEntity);
    expect(r.status).toBe(200);
    expect(intake.setDecisionRecordQuery.mock.calls[0][1]).toMatchObject({
      level: "Prohibited",
      lane: "senior",
    });
  });

  it("a lower mapped level stays standard", async () => {
    const r = await approve(STANDARD, {
      confirmedEntityData: { project_title: "P", ai_risk_classification: "Minimal risk" },
    });
    expect(r.status).toBe(200);
  });
});

describe("approve: second review", () => {
  it("a standard reviewer's standard-lane approval at rate 100 opens a second review", async () => {
    intake.getIntakeFormByIdQuery.mockResolvedValue(form(routingCfg({ secondReviewRate: 100 })));
    const r = await approve(STANDARD);
    expect(r.status).toBe(200);
    const [id, routing, org, transaction, expected] =
      intake.updateSubmissionRoutingQuery.mock.calls[0];
    expect([id, org, transaction, expected]).toEqual([11, ORG, tx, STANDARD_LANE]);
    expect(routing).toEqual({
      ...STANDARD_LANE,
      secondReview: { status: "open", selectedAt: expect.any(String) },
    });
    expect(intake.updateSubmissionRoutingQuery.mock.invocationCallOrder[0]).toBeLessThan(
      intake.approveSubmissionQuery.mock.invocationCallOrder[0],
    );
    expect(emails.sendSecondReviewRequestEmail).toHaveBeenCalledWith(ORG, 11, [SENIOR], "en");
    expect(emails.sendSecondReviewRequestEmail.mock.invocationCallOrder[0]).toBeGreaterThan(
      tx.commit.mock.invocationCallOrder[0],
    );
  });

  it("a failing second-review email doesn't fail the approval", async () => {
    intake.getIntakeFormByIdQuery.mockResolvedValue(form(routingCfg({ secondReviewRate: 100 })));
    emails.sendSecondReviewRequestEmail.mockRejectedValueOnce(new Error("smtp down"));
    const r = await approve(STANDARD);
    expect(r.status).toBe(200);
  });

  it("a senior reviewer's standard-lane approval is never picked", async () => {
    intake.getIntakeFormByIdQuery.mockResolvedValue(form(routingCfg({ secondReviewRate: 100 })));
    const r = await approve(SENIOR);
    expect(r.status).toBe(200);
    expect(intake.updateSubmissionRoutingQuery).not.toHaveBeenCalled();
    expect(emails.sendSecondReviewRequestEmail).not.toHaveBeenCalled();
  });

  it("rate 0 never picks", async () => {
    const r = await approve(STANDARD);
    expect(r.status).toBe(200);
    expect(intake.updateSubmissionRoutingQuery).not.toHaveBeenCalled();
    expect(emails.sendSecondReviewRequestEmail).not.toHaveBeenCalled();
  });

  it("409 and rollback when the routing changed underneath", async () => {
    intake.getIntakeFormByIdQuery.mockResolvedValue(form(routingCfg({ secondReviewRate: 100 })));
    intake.updateSubmissionRoutingQuery.mockResolvedValue(false);
    const r = await approve(STANDARD);
    expect(r.status).toBe(409);
    expect(tx.rollback).toHaveBeenCalled();
    expect(tx.commit).not.toHaveBeenCalled();
    expect(intake.approveSubmissionQuery).not.toHaveBeenCalled();
    expect(emails.sendSecondReviewRequestEmail).not.toHaveBeenCalled();
  });
});

describe("decision record", () => {
  it("is written on approve with routing off", async () => {
    intake.getIntakeFormByIdQuery.mockResolvedValue(form(null));
    const r = await approve(OTHER);
    expect(r.status).toBe(200);
    expect(intake.setDecisionRecordQuery).toHaveBeenCalledWith(
      11,
      {
        level: "Minimal risk",
        computedBand: "Low",
        bandInForce: "Low",
        bandChanged: false,
        overriddenBy: null,
        lane: null,
      },
      ORG,
      tx,
    );
  });

  it("records the band override in force on approve", async () => {
    intake.getIntakeFormByIdQuery.mockResolvedValue(form(null));
    await approve(OTHER, { riskOverride: { tier: "Medium", justification: "agreed" } });
    expect(intake.setDecisionRecordQuery.mock.calls[0][1]).toMatchObject({
      computedBand: "Low",
      bandInForce: "Medium",
      bandChanged: true,
      overriddenBy: OTHER,
    });
  });

  it("is written on reject with routing off, with a saved override", async () => {
    intake.getIntakeFormByIdQuery.mockResolvedValue(form(null));
    intake.getSubmissionByIdQuery.mockResolvedValue(
      submission({ riskOverride: { tier: "High", justification: "earlier", overriddenBy: 3 } }),
    );
    const r = await reject(OTHER);
    expect(r.status).toBe(200);
    expect(intake.setDecisionRecordQuery).toHaveBeenCalledWith(
      11,
      {
        level: "Minimal risk",
        computedBand: "Low",
        bandInForce: "High",
        bandChanged: true,
        overriddenBy: 3,
        lane: null,
      },
      ORG,
      tx,
    );
  });
});

describe("reject: who may decide", () => {
  it("a standard reviewer can't reject a senior-lane submission", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(submission({ routing: SENIOR_LANE }));
    const r = await reject(STANDARD);
    expect(r.status).toBe(403);
    expect(r.body.data).toBe("This submission is assigned to senior reviewers");
    expect(tx.rollback).toHaveBeenCalled();
    expect(intake.rejectSubmissionQuery).not.toHaveBeenCalled();
  });

  it("checks the stored lane only", async () => {
    // A Prohibited run doesn't move a standard-lane rejection to senior.
    data.rescoreStoredRun.mockReturnValue(rescoredAs("Prohibited"));
    const r = await reject(STANDARD);
    expect(r.status).toBe(200);
    expect(intake.setDecisionRecordQuery.mock.calls[0][1].lane).toBe("standard");
  });

  it("an Admin may reject outside their lane, and it is logged", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(submission({ routing: SENIOR_LANE }));
    const r = await reject(OTHER, "Admin");
    expect(r.status).toBe(200);
    expect(
      logSuccess.mock.calls.some((c: any[]) =>
        String(c[0].description).includes("decided outside their lane"),
      ),
    ).toBe(true);
  });
});

describe("getSubmissionPreview: lane", () => {
  const preview = (userId: number, role?: string) =>
    call(ctrl.getSubmissionPreview, request(userId, {}, role));

  it("a standard-only user on a senior submission can't decide and sees the senior reviewers", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(submission({ routing: SENIOR_LANE }));
    intake.getEligibleReviewersQuery.mockResolvedValue([
      { id: SENIOR, name: "Sam", surname: "Senior", email: "s@x" },
    ]);
    const r = await preview(STANDARD);
    expect(r.status).toBe(200);
    expect(intake.getEligibleReviewersQuery).toHaveBeenCalledWith(ORG, [SENIOR]);
    expect(r.body.data).toMatchObject({
      routing: SENIOR_LANE,
      canDecide: false,
      decideBlockedReason: "This submission is assigned to senior reviewers",
      laneReviewers: [{ id: SENIOR, name: "Sam Senior" }],
      isSeniorReviewer: false,
    });
  });

  it("a senior reviewer can decide", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(submission({ routing: SENIOR_LANE }));
    const r = await preview(SENIOR);
    expect(r.body.data).toMatchObject({
      canDecide: true,
      decideBlockedReason: null,
      isSeniorReviewer: true,
    });
  });

  it("reports whether routing is on", async () => {
    expect((await preview(SENIOR)).body.data.routingEnabled).toBe(true);
    intake.getIntakeFormByIdQuery.mockResolvedValue(form(routingCfg({ enabled: false })));
    expect((await preview(SENIOR)).body.data.routingEnabled).toBe(false);
  });

  it("routing off: anyone can decide, no reviewer lookup", async () => {
    intake.getIntakeFormByIdQuery.mockResolvedValue(form(null));
    const r = await preview(OTHER);
    expect(r.body.data).toMatchObject({
      canDecide: true,
      decideBlockedReason: null,
      laneReviewers: [],
      isSeniorReviewer: false,
    });
    expect(intake.getEligibleReviewersQuery).not.toHaveBeenCalled();
  });
});

describe("getPendingSubmissions: lane reviewers", () => {
  const list = () => call(ctrl.getPendingSubmissions, { ...request(SENIOR), query: {} });

  it("returns the routing and the assigned lane's reviewer ids, not the form's settings", async () => {
    intake.getPendingSubmissionsQuery.mockResolvedValue([
      { id: 1, routing: SENIOR_LANE, formRouting: routingCfg() },
      { id: 2, routing: STANDARD_LANE, formRouting: routingCfg() },
      { id: 3, routing: null, formRouting: routingCfg() },
      { id: 4, routing: null, formRouting: null },
    ]);
    const r = await list();
    expect(r.status).toBe(200);
    expect(intake.getPendingSubmissionsQuery).toHaveBeenCalledWith(ORG, undefined);
    expect(r.body.data).toEqual([
      {
        id: 1,
        routing: SENIOR_LANE,
        routingEnabled: true,
        laneReviewerIds: [SENIOR],
        secondReviewerIds: [],
      },
      {
        id: 2,
        routing: STANDARD_LANE,
        routingEnabled: true,
        laneReviewerIds: [STANDARD, SENIOR],
        secondReviewerIds: [],
      },
      { id: 3, routing: null, routingEnabled: true, laneReviewerIds: [], secondReviewerIds: [] },
      { id: 4, routing: null, routingEnabled: false, laneReviewerIds: [], secondReviewerIds: [] },
    ]);
  });

  it("a disabled form keeps its stored lane but has no lane reviewers", async () => {
    intake.getPendingSubmissionsQuery.mockResolvedValue([
      { id: 5, routing: STANDARD_LANE, formRouting: routingCfg({ enabled: false }) },
    ]);
    const r = await list();
    expect(r.body.data).toEqual([
      {
        id: 5,
        routing: STANDARD_LANE,
        routingEnabled: false,
        laneReviewerIds: [],
        secondReviewerIds: [],
      },
    ]);
  });
});

describe("getPendingSubmissions: second reviewers", () => {
  const list = () => call(ctrl.getPendingSubmissions, { ...request(SENIOR), query: {} });
  const second = (over: any = {}) => ({
    ...STANDARD_LANE,
    secondReview: { status: "open", selectedAt: "2026-10-20T00:00:00Z", ...over },
  });

  it("lists the form's currently eligible senior reviewers on an open second review", async () => {
    intake.getEligibleReviewerIdsQuery.mockResolvedValue([SENIOR]);
    intake.getPendingSubmissionsQuery.mockResolvedValue([
      { id: 1, routing: second(), formRouting: routingCfg({ seniorReviewerIds: [SENIOR, 99] }) },
    ]);
    const r = await list();
    expect(r.body.data[0].secondReviewerIds).toEqual([SENIOR]);
    expect(intake.getEligibleReviewerIdsQuery).toHaveBeenCalledWith(ORG, [SENIOR, 99]);
  });

  it("still lists them when routing has been turned off, and for a missed unresolved review", async () => {
    intake.getEligibleReviewerIdsQuery.mockResolvedValue([SENIOR]);
    intake.getPendingSubmissionsQuery.mockResolvedValue([
      {
        id: 2,
        routing: second({ status: "missed" }),
        formRouting: routingCfg({ enabled: false }),
      },
    ]);
    const r = await list();
    expect(r.body.data[0].secondReviewerIds).toEqual([SENIOR]);
  });

  it("leaves out the senior reviewer who approved the submission", async () => {
    intake.getEligibleReviewerIdsQuery.mockResolvedValue([SENIOR, 99]);
    intake.getPendingSubmissionsQuery.mockResolvedValue([
      {
        id: 5,
        routing: second(),
        reviewedBy: SENIOR,
        formRouting: routingCfg({ seniorReviewerIds: [SENIOR, 99] }),
      },
    ]);
    const r = await list();
    expect(r.body.data[0].secondReviewerIds).toEqual([99]);
  });

  it("is empty for an agreed or resolved review and makes no lookup", async () => {
    intake.getEligibleReviewerIdsQuery.mockClear();
    intake.getPendingSubmissionsQuery.mockResolvedValue([
      { id: 3, routing: second({ status: "agreed" }), formRouting: routingCfg() },
      {
        id: 4,
        routing: second({ status: "missed", resolvedAt: "2026-10-21T00:00:00Z" }),
        formRouting: routingCfg(),
      },
    ]);
    const r = await list();
    expect(r.body.data.map((x: any) => x.secondReviewerIds)).toEqual([[], []]);
    expect(intake.getEligibleReviewerIdsQuery).not.toHaveBeenCalled();
  });
});

describe("escalateSubmission", () => {
  it("a standard reviewer sends a standard-lane submission to senior review", async () => {
    const r = await escalate(STANDARD, "  Needs a closer look  ");
    expect(r.status).toBe(200);
    const expected = {
      ...STANDARD_LANE,
      lane: "senior",
      reason: "escalated",
      routedAt: expect.any(String),
      escalation: { by: STANDARD, at: expect.any(String), reason: "Needs a closer look" },
    };
    expect(r.body.data).toEqual(expected);
    const [id, routing, org, transaction, prev] = intake.updateSubmissionRoutingQuery.mock.calls[0];
    expect([id, org, transaction, prev]).toEqual([11, ORG, undefined, STANDARD_LANE]);
    expect(routing).toEqual(expected);
  });

  it("an Admin in neither list may escalate", async () => {
    const r = await escalate(OTHER, "Check", "Admin");
    expect(r.status).toBe(200);
  });

  it("403 for a user in neither list", async () => {
    const r = await escalate(OTHER);
    expect(r.status).toBe(403);
    expect(intake.updateSubmissionRoutingQuery).not.toHaveBeenCalled();
  });

  it("409 for a senior-lane, unrouted, decided or routing-off submission", async () => {
    for (const [sub, cfg] of [
      [submission({ routing: SENIOR_LANE }), routingCfg()],
      [submission({ routing: null }), routingCfg()],
      [submission({ status: "approved" }), routingCfg()],
      [submission(), routingCfg({ enabled: false })],
    ]) {
      intake.getSubmissionByIdQuery.mockResolvedValueOnce(sub);
      intake.getIntakeFormByIdQuery.mockResolvedValueOnce(form(cfg));
      const r = await escalate(STANDARD);
      expect(r.status).toBe(409);
    }
    expect(intake.updateSubmissionRoutingQuery).not.toHaveBeenCalled();
  });

  it("409 when the routing changed underneath", async () => {
    intake.updateSubmissionRoutingQuery.mockResolvedValue(false);
    const r = await escalate(STANDARD);
    expect(r.status).toBe(409);
  });

  it("400 without a reason of 1 to 1000 characters", async () => {
    for (const reason of [null, "   ", 5, "x".repeat(1001)]) {
      const r = await escalate(STANDARD, reason);
      expect(r.status).toBe(400);
    }
    const r = await escalate(STANDARD, "x".repeat(1000));
    expect(r.status).toBe(200);
  });

  it("404 for a submission of another organisation", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(null);
    const r = await escalate(STANDARD);
    expect(r.status).toBe(404);
    expect(intake.getSubmissionByIdQuery).toHaveBeenCalledWith(11, ORG);
  });
});
