// Servers/controllers/__tests__/intakeForm.entityLevel.mirror.test.ts
// Runs the entityLevel cases of
// services/intakeRouting/__fixtures__/routingRulesCases.json through
// getSubmissionPreview, since entityLevel is private to the controller. The
// client copy (Clients/src/application/utils/intakeRouting/routingRules.ts)
// runs the same cases directly. A level routes to senior only when it is
// Prohibited, so here each case checks that a standard reviewer of an
// unrouted, low-scored submission is blocked exactly when the expected level
// is Prohibited.
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// intakeForm.ctrl.ts throws at import without a signing secret.
process.env.JWT_SECRET = process.env.JWT_SECRET || "intake-entity-level-test-secret";

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
const runs = require("../../utils/euAiActClassification.utils");
const data = require("../../utils/intakeSubmissionData.utils");
/* eslint-enable @typescript-eslint/no-require-imports */

type LevelCase = {
  entityType: string;
  runLevel: string | null;
  /** The answer to a question mapped to ai_risk_classification; null means no such question. */
  mapped: string | null;
  expected: string | null;
};
const FIXTURE = join(__dirname, "../../services/intakeRouting/__fixtures__/routingRulesCases.json");
const cases = (JSON.parse(readFileSync(FIXTURE, "utf8")) as { entityLevel: LevelCase[] })
  .entityLevel;

const SENIOR = 1;
const STANDARD = 2;
const routing = {
  enabled: true,
  seniorReviewerIds: [SENIOR],
  standardReviewerIds: [STANDARD],
  threshold: 50,
  closeCallMargin: 10,
  secondReviewRate: 0,
};
// A settled score well below the threshold: only the level can send it to senior.
const lowScore = {
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
};

const preview = async () => {
  const r: any = {};
  r.status = jest.fn<any>().mockReturnValue(r);
  r.json = jest.fn<any>().mockReturnValue(r);
  await ctrl.getSubmissionPreview(
    {
      userId: STANDARD,
      role: "Editor",
      organizationId: 5,
      lang: "en",
      t: (k: string) => k,
      params: { id: "11" },
      body: {},
    } as any,
    r,
  );
  return r.json.mock.calls[0]?.[0]?.data;
};

beforeEach(() => {
  jest.clearAllMocks();
  intake.getEligibleReviewersQuery.mockResolvedValue([]);
});

describe("entityLevel shared cases, through getSubmissionPreview", () => {
  it.each(cases)("%#: $entityType, run $runLevel, mapped $mapped", async (c) => {
    const fields =
      c.mapped === null
        ? []
        : [
            {
              id: "q1",
              type: "select",
              label: "Risk",
              entityFieldMapping: "ai_risk_classification",
            },
          ];
    intake.getSubmissionByIdQuery.mockResolvedValue({
      id: 11,
      status: "pending",
      formId: 1,
      entityType: c.entityType,
      data: c.mapped === null ? {} : { q1: c.mapped },
      submitterEmail: null,
      riskAssessment: lowScore,
      riskOverride: null,
      suggestedRisks: { status: "complete", items: [], droppedCount: 0 },
      routing: null,
    });
    intake.getIntakeFormByIdQuery.mockResolvedValue({
      id: 1,
      name: "F",
      entityType: c.entityType,
      schema: { version: "1.0", fields },
      routing,
    });
    if (c.runLevel === null) {
      runs.getLatestRunForSubmissionQuery.mockResolvedValue(null);
    } else {
      runs.getLatestRunForSubmissionQuery.mockResolvedValue({ id: 1, questionnaireVersion: 1 });
      data.rescoreStoredRun.mockReturnValue({
        run: { questionnaireVersion: 1, answers: {}, result: { level: c.runLevel, roles: [] } },
        questionnaire: {},
        result: { level: c.runLevel, role: null, roles: [], reasons: [], obligations: [] },
      });
    }
    const body = await preview();
    const prohibited = c.expected === "Prohibited";
    expect(body.canDecide).toBe(!prohibited);
    expect(body.decideBlockedReason).toBe(
      prohibited ? "This submission is assigned to senior reviewers" : null,
    );
  });
});
