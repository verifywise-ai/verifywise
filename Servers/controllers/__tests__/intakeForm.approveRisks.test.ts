// Servers/controllers/__tests__/intakeForm.approveRisks.test.ts
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// intakeForm.ctrl.ts throws at import without a signing secret.
process.env.JWT_SECRET = process.env.JWT_SECRET || "intake-approve-risks-test-secret";

jest.mock("../../utils/intakeForm.utils", () => ({
  getIntakeFormByIdQuery: jest.fn(),
  getSubmissionByIdQuery: jest.fn(),
  approveSubmissionQuery: jest.fn(),
  setDecisionRecordQuery: jest.fn<any>().mockResolvedValue(undefined),
  rejectSubmissionQuery: jest.fn(),
  getTenantSlugById: jest.fn<any>().mockResolvedValue("t"),
  updateSubmissionRiskOverrideQuery: jest.fn<any>().mockResolvedValue(undefined),
  updateSubmissionAssessmentV2Query: jest.fn<any>().mockResolvedValue(undefined),
  updateSubmissionSuggestionsQuery: jest.fn<any>().mockResolvedValue(undefined),
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
    404: (d: any) => ({ message: "Not Found", data: d }),
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
const runs = require("../../utils/euAiActClassification.utils");
const data = require("../../utils/intakeSubmissionData.utils");
const projects = require("../../utils/project.utils");
const models = require("../../utils/modelInventory.utils");
const { createRiskService } = require("../../services/risk.service");
const { createNewModelRiskQuery } = require("../../utils/modelRisk.utils");
/* eslint-enable @typescript-eslint/no-require-imports */

const ORG = 5;
const item = (id: string, state: string, overrides: object = {}) => ({
  id,
  source: "ai",
  name: `Risk ${id}`,
  description: "d",
  categories: ["Data privacy risk"],
  likelihood: "Possible",
  severity: "Major",
  impact: "i",
  mitigationPlan: "m",
  implementationStrategy: "s",
  deadline: null,
  state,
  ...overrides,
});
const ITEMS = [item("a", "accepted"), item("b", "accepted"), item("c", "dismissed")];
const v2 = (overrides: object = {}) => ({
  version: 2,
  status: "complete",
  notRuleChecked: false,
  classificationLevel: "High risk",
  ruleMinimum: 70,
  ai: { runs: [], failedRuns: 0, validRuns: 5, median: 75, min: 70, max: 80, reasons: [] },
  finalScore: 75,
  source: "ai",
  rulesOnly: false,
  overallScore: 75,
  tier: "High",
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
  suggestedRisks: { status: "complete", items: ITEMS, droppedCount: 0 },
  ...overrides,
});
const rescoredAs = (level: string) => ({
  run: {
    questionnaireVersion: 1,
    answers: {},
    result: { level, roles: [] },
  },
  questionnaire: {},
  result: { level, role: null, roles: [], reasons: [], obligations: [] },
});

const res = () => {
  const r: any = {};
  r.status = jest.fn<any>().mockReturnValue(r);
  r.json = jest.fn<any>().mockReturnValue(r);
  return r;
};
const request = (body: object = {}) => ({
  userId: 7,
  organizationId: ORG,
  lang: "en",
  t: (k: string) => k,
  params: { id: "11" },
  body: { confirmedEntityData: { project_title: "P", name: "M" }, ...body },
});
const approve = async (body: object = {}) => {
  const r = res();
  await ctrl.approveSubmission(request(body) as any, r);
  return { status: r.status.mock.calls[0]?.[0], body: r.json.mock.calls[0]?.[0] };
};

beforeEach(() => {
  jest.clearAllMocks();
  intake.getSubmissionByIdQuery.mockResolvedValue(submission());
  intake.getIntakeFormByIdQuery.mockResolvedValue({
    id: 1,
    name: "F",
    schema: { version: "1.0", fields: [] },
  });
  intake.approveSubmissionQuery.mockResolvedValue({ id: 11 });
  intake.rejectSubmissionQuery.mockResolvedValue({ id: 11 });
  projects.createNewProjectQuery.mockResolvedValue({ id: 50 });
  models.createNewModelInventoryQuery.mockResolvedValue({ id: 60 });
  runs.getLatestRunForSubmissionQuery.mockResolvedValue({ id: 1, questionnaireVersion: 1 });
  data.rescoreStoredRun.mockReturnValue(rescoredAs("High risk"));
  createRiskService.mockResolvedValue({ id: 1 });
  createNewModelRiskQuery.mockResolvedValue({ id: 1 });
});

describe("approveSubmission with suggested risks", () => {
  it("creates one use-case risk per accepted suggestion, in the transaction", async () => {
    const r = await approve();
    expect(r.status).toBe(200);
    expect(createRiskService).toHaveBeenCalledTimes(2);
    for (const [input, ctx, transaction] of createRiskService.mock.calls) {
      expect(input.projects).toEqual([50]);
      expect(input.risk_owner).toBe(7);
      expect(ctx).toEqual({ userId: 7, organizationId: ORG });
      expect(transaction).toBe(tx);
    }
    expect(createRiskService.mock.calls.map((c: any[]) => c[0].risk_name)).toEqual([
      "Risk a",
      "Risk b",
    ]);
    expect(tx.commit).toHaveBeenCalled();
  });

  it("creates model risks for a model submission", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(submission({ entityType: "model" }));
    runs.getLatestRunForSubmissionQuery.mockResolvedValue(null);
    const r = await approve();
    expect(r.status).toBe(200);
    expect(createNewModelRiskQuery).toHaveBeenCalledTimes(2);
    for (const [input, org, transaction] of createNewModelRiskQuery.mock.calls) {
      expect(input).toMatchObject({ model_id: 60, owner: "7", status: "Open" });
      expect(org).toBe(ORG);
      expect(transaction).toBe(tx);
    }
    expect(createRiskService).not.toHaveBeenCalled();
  });

  it("rolls the approval back when a risk can't be created", async () => {
    createRiskService.mockRejectedValueOnce(new Error("insert failed"));
    const r = await approve();
    expect(r.status).toBe(500);
    expect(tx.rollback).toHaveBeenCalled();
    expect(tx.commit).not.toHaveBeenCalled();
    expect(intake.approveSubmissionQuery).not.toHaveBeenCalled();
  });

  it("rejecting closes a stage still running", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(
      submission({
        riskAssessment: v2({ status: "pending", ai: null, finalScore: null }),
        suggestedRisks: { status: "pending", items: [], droppedCount: 0 },
      }),
    );
    const r = res();
    await ctrl.rejectSubmission({ ...request(), body: { rejectionReason: "Not now" } } as any, r);
    expect(r.status).toHaveBeenCalledWith(200);
    expect(intake.updateSubmissionAssessmentV2Query.mock.calls[0][1]).toMatchObject({
      status: "ai_failed",
      finalScore: 70,
    });
    expect(intake.updateSubmissionSuggestionsQuery.mock.calls[0][1].status).toBe("ai_failed");
  });

  it("rejecting creates no risks", async () => {
    const r = res();
    await ctrl.rejectSubmission({ ...request(), body: { rejectionReason: "No" } } as any, r);
    expect(r.status).toHaveBeenCalledWith(200);
    expect(createRiskService).not.toHaveBeenCalled();
    expect(createNewModelRiskQuery).not.toHaveBeenCalled();
  });

  it("approving while the assessment runs closes both stages, rules-only", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(
      submission({
        riskAssessment: v2({ status: "pending", ai: null, finalScore: null }),
        suggestedRisks: { status: "pending", items: [], droppedCount: 0 },
      }),
    );
    const r = await approve();
    expect(r.status).toBe(200);
    expect(createRiskService).not.toHaveBeenCalled();
    const saved = intake.updateSubmissionAssessmentV2Query.mock.calls[0][1];
    expect(saved).toMatchObject({ status: "ai_failed", finalScore: 70, rulesOnly: true });
    const block = intake.updateSubmissionSuggestionsQuery.mock.calls[0][1];
    expect(block.status).toBe("ai_failed");
    expect(intake.updateSubmissionSuggestionsQuery.mock.calls[0][3]).toBe(tx);
  });
});

describe("approveSubmission holds the floor", () => {
  it("400 for a band below the approved level's minimum", async () => {
    const r = await approve({ riskOverride: { tier: "Medium", justification: "lower" } });
    expect(r.status).toBe(400);
    expect(r.body.data).toBe("The band can't be lower than the rule minimum allows");
    expect(tx.rollback).toHaveBeenCalled();
    expect(createRiskService).not.toHaveBeenCalled();
  });

  it("400 when an override saved earlier sits below the approved level's minimum", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(
      submission({ riskOverride: { tier: "Low", justification: "earlier", overriddenBy: 3 } }),
    );
    const r = await approve();
    expect(r.status).toBe(400);
    expect(r.body.data).toBe("The band can't be lower than the rule minimum allows");
    expect(tx.rollback).toHaveBeenCalled();
  });

  it("an override saved earlier at or above the minimum is kept", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(
      submission({ riskOverride: { tier: "Critical", justification: "earlier", overriddenBy: 3 } }),
    );
    const r = await approve();
    expect(r.status).toBe(200);
    expect(intake.updateSubmissionRiskOverrideQuery).not.toHaveBeenCalled();
  });

  it("a saved pre-v2 tier passes as its band and is stored as it", async () => {
    const saved = { tier: "Unacceptable", justification: "earlier", overriddenBy: 3 };
    intake.getSubmissionByIdQuery.mockResolvedValue(submission({ riskOverride: saved }));
    const r = await approve();
    expect(r.status).toBe(200);
    expect(intake.updateSubmissionRiskOverrideQuery).toHaveBeenCalledWith(
      11,
      { ...saved, tier: "Critical" },
      ORG,
      tx,
    );
  });

  it("a v1-scored submission's saved pre-v2 tier is stored as its band too", async () => {
    const saved = { tier: "Unacceptable", justification: "earlier", overriddenBy: 3 };
    intake.getSubmissionByIdQuery.mockResolvedValue(
      submission({
        riskAssessment: { overallScore: 90, tier: "Unacceptable" },
        riskOverride: saved,
      }),
    );
    const r = await approve();
    expect(r.status).toBe(200);
    expect(intake.updateSubmissionRiskOverrideQuery).toHaveBeenCalledWith(
      11,
      { ...saved, tier: "Critical" },
      ORG,
      tx,
    );
  });

  it("saves an allowed override from whitelisted fields only", async () => {
    const r = await approve({
      riskOverride: {
        tier: "Critical",
        justification: "worse than scored",
        dimensionOverrides: { bias: 5 },
        overriddenBy: 999,
      },
    });
    expect(r.status).toBe(200);
    const saved = intake.updateSubmissionRiskOverrideQuery.mock.calls[0][1];
    expect(saved).toEqual({
      tier: "Critical",
      dimensionOverrides: {},
      justification: "worse than scored",
      overriddenBy: 7,
      overriddenAt: expect.any(String),
    });
  });

  it("an EU AI Act override to Prohibited re-floors the stored score at 90", async () => {
    const r = await approve({
      euAiActOverride: { level: "Prohibited", justification: "social scoring of applicants" },
    });
    expect(r.status).toBe(200);
    const [id, saved, org, transaction] = intake.updateSubmissionAssessmentV2Query.mock.calls[0];
    expect([id, org, transaction]).toEqual([11, ORG, tx]);
    expect(saved.classificationLevel).toBe("Prohibited");
    expect(saved.finalScore).toBeGreaterThanOrEqual(90);
    expect(saved.tier).toBe("Critical");
  });

  it("the floor follows the approved level, not the stored one", async () => {
    // Lowered to Minimal risk with a justification: "Low" is now allowed.
    const r = await approve({
      euAiActOverride: { level: "Minimal risk", justification: "internal tool, no users" },
      riskOverride: { tier: "Low", justification: "agreed" },
    });
    expect(r.status).toBe(200);
  });

  it("a v1 assessment keeps its dimension overrides and has no floor", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(
      submission({ riskAssessment: { overallScore: 20, tier: "Minimal" } }),
    );
    const r = await approve({
      riskOverride: { tier: "Minimal", justification: "fine", dimensionOverrides: { bias: 2 } },
    });
    expect(r.status).toBe(200);
    expect(intake.updateSubmissionRiskOverrideQuery.mock.calls[0][1].dimensionOverrides).toEqual({
      bias: 2,
    });
    expect(intake.updateSubmissionAssessmentV2Query).not.toHaveBeenCalled();
  });
});
