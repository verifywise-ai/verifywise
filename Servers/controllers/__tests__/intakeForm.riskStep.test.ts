// Servers/controllers/__tests__/intakeForm.riskStep.test.ts
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { createHmac } from "crypto";

// intakeForm.ctrl.ts throws at import without a signing secret (CI's coverage
// job sets none), so set one before the controller is required below.
process.env.JWT_SECRET = process.env.JWT_SECRET || "intake-risk-step-test-secret";

jest.mock("../../utils/intakeForm.utils", () => ({
  getTenantByPublicId: jest.fn(),
  getTenantHashBySlug: jest.fn(),
  checkRateLimitQuery: jest.fn(),
  getFormByPublicIdQuery: jest.fn(),
  getActivePublicFormQuery: jest.fn(),
  getIntakeFormByIdQuery: jest.fn(),
  createSubmissionQuery: jest.fn(),
  getSubmissionByIdQuery: jest.fn(),
  approveSubmissionQuery: jest.fn(),
  updateSubmissionRiskQuery: jest.fn<any>().mockResolvedValue(undefined),
  updateSubmissionRiskOverrideQuery: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/euAiActClassification.utils", () => ({
  insertClassificationRunQuery: jest.fn(),
  getLatestRunForSubmissionQuery: jest.fn(),
}));
jest.mock("../../utils/project.utils", () => ({ createNewProjectQuery: jest.fn() }));
jest.mock("../../utils/modelInventory.utils", () => ({ createNewModelInventoryQuery: jest.fn() }));
jest.mock("../../utils/useCaseChangeHistory.utils", () => ({
  recordMultipleFieldChanges: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../services/intakeFormEmail.service", () => ({
  sendSubmissionReceivedEmail: jest.fn<any>().mockResolvedValue(undefined),
  sendNewSubmissionAdminNotification: jest.fn<any>().mockResolvedValue(undefined),
  sendSubmissionApprovedEmail: jest.fn<any>().mockResolvedValue(undefined),
  sendSubmissionRejectedEmail: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../services/intakeRiskScoring.service", () => ({
  calculateSubmissionRisk: jest.fn<any>().mockResolvedValue({}),
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
    201: (d: any) => ({ message: "Created", data: d }),
    400: (d: any) => ({ message: "Bad Request", data: d }),
    404: (d: any) => ({ message: "Not Found", data: d }),
    429: (d: any) => ({ message: "Too Many Requests", data: d }),
    500: (d: any) => ({ message: "Internal Server Error", data: d }),
  },
}));
jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn<any>().mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() }),
  },
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const ctrl = require("../intakeForm.ctrl") as typeof import("../intakeForm.ctrl");
const intake = require("../../utils/intakeForm.utils");
const runs = require("../../utils/euAiActClassification.utils");
/* eslint-enable @typescript-eslint/no-require-imports */

/** Same format as the controller's private createSignedToken. */
const sign = (payload: object) => {
  const data = JSON.stringify(payload);
  const secret = (process.env.JWT_SECRET || process.env.ENCRYPTION_KEY)!;
  const signature = createHmac("sha256", secret).update(data).digest("hex");
  return Buffer.from(JSON.stringify({ data, signature })).toString("base64");
};
const req = (overrides: any = {}) => ({
  userId: 7,
  organizationId: 5,
  ip: "127.0.0.1",
  headers: {},
  lang: "en",
  t: (k: string) => k,
  params: {},
  body: {},
  ...overrides,
});
const res = () => {
  const r: any = {};
  r.status = jest.fn<any>().mockReturnValue(r);
  r.json = jest.fn<any>().mockReturnValue(r);
  return r;
};
const ANSWERS = {
  scope: "in_scope",
  role: "deployer",
  art5_practices: ["none"],
  rbi_law_enforcement: "no",
  intimate_content: "no",
  safety_function: "no",
  annex_iii_areas: ["none"],
  transparency: ["interacts"],
};
const FORM = {
  id: 1,
  name: "F",
  entityType: "use_case",
  euAiActRiskStepEnabled: true,
  publicId: "abc",
};

const ROUTES = {
  byId: { handler: ctrl.submitPublicFormByPublicId, params: { publicId: "abc" } },
  bySlug: { handler: ctrl.submitPublicForm, params: { tenantSlug: "t", formSlug: "f" } },
};
const submitBody = (extra: object = {}) => ({
  submitterEmail: "a@b.co",
  formData: {},
  captchaToken: sign({ answer: 4, timestamp: Date.now() }),
  captchaAnswer: 4,
  ...extra,
});
const submit = async (route: keyof typeof ROUTES, body: object) => {
  const r = res();
  await ROUTES[route].handler(req({ params: ROUTES[route].params, body }) as any, r);
  return r;
};

describe("public submit with the EU AI Act step", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    intake.getTenantByPublicId.mockResolvedValue({ orgId: 5 });
    intake.getTenantHashBySlug.mockResolvedValue({ id: 5 });
    intake.checkRateLimitQuery.mockResolvedValue(true);
    intake.getFormByPublicIdQuery.mockResolvedValue(FORM);
    intake.getActivePublicFormQuery.mockResolvedValue(FORM);
    intake.getIntakeFormByIdQuery.mockResolvedValue({
      ...FORM,
      schema: { version: "1.0", fields: [] },
      recipients: [],
      riskTierSystem: "eu_ai_act",
      llmKeyId: null,
    });
    intake.createSubmissionQuery.mockResolvedValue({ id: 99 });
    runs.insertClassificationRunQuery.mockResolvedValue({ id: 1 });
  });

  it.each(["byId", "bySlug"] as const)(
    "%s: 400 when the step is on and answers are missing",
    async (route) => {
      const r = await submit(route, submitBody());
      expect(r.status).toHaveBeenCalledWith(400);
      expect(intake.createSubmissionQuery).not.toHaveBeenCalled();
    },
  );

  it.each(["byId", "bySlug"] as const)("%s: 400 for tampered answers", async (route) => {
    const r = await submit(
      route,
      submitBody({ euAiActRiskAnswers: { ...ANSWERS, level: "Minimal risk" } }),
    );
    expect(r.status).toHaveBeenCalledWith(400);
    expect(runs.insertClassificationRunQuery).not.toHaveBeenCalled();
  });

  it.each(["byId", "bySlug"] as const)(
    "%s: stores a server-scored run and returns no classification",
    async (route) => {
      const r = await submit(
        route,
        submitBody({ euAiActRiskAnswers: ANSWERS, level: "Minimal risk" }),
      );
      expect(r.status).toHaveBeenCalledWith(201);
      const run = runs.insertClassificationRunQuery.mock.calls[0][0];
      expect(run).toMatchObject({
        intakeSubmissionId: 99,
        useCaseId: null,
        source: "intake",
        createdBy: null,
      });
      expect(run.result.level).toBe("Limited risk");
      const data = r.json.mock.calls[0][0].data;
      expect(data).not.toHaveProperty("result");
      expect(data).not.toHaveProperty("level");
    },
  );

  it.each(["byId", "bySlug"] as const)(
    "%s: stores nothing when the form has no step",
    async (route) => {
      intake.getFormByPublicIdQuery.mockResolvedValue({ ...FORM, euAiActRiskStepEnabled: false });
      intake.getActivePublicFormQuery.mockResolvedValue({ ...FORM, euAiActRiskStepEnabled: false });
      const r = await submit(route, submitBody());
      expect(r.status).toHaveBeenCalledWith(201);
      expect(runs.insertClassificationRunQuery).not.toHaveBeenCalled();
    },
  );
});
