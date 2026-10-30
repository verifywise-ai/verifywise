// Servers/controllers/__tests__/intakeForm.assessmentEnqueue.test.ts
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { createHmac } from "crypto";

// intakeForm.ctrl.ts throws at import without a signing secret.
process.env.JWT_SECRET = process.env.JWT_SECRET || "intake-assessment-enqueue-test-secret";

jest.mock("../../utils/intakeForm.utils", () => ({
  getTenantByPublicId: jest.fn(),
  getTenantHashBySlug: jest.fn(),
  checkRateLimitQuery: jest.fn(),
  getFormByPublicIdQuery: jest.fn(),
  getActivePublicFormQuery: jest.fn(),
  getIntakeFormByIdQuery: jest.fn(),
  createSubmissionQuery: jest.fn(),
  getSubmissionByIdQuery: jest.fn(),
  claimSubmissionNotificationQuery: jest.fn(),
  getEligibleReviewerIdsQuery: jest.fn(),
  updateLiveChecksQuery: jest.fn(),
}));
jest.mock("../../utils/llmKey.utils", () => ({ llmKeyExistsQuery: jest.fn() }));
jest.mock("../../utils/euAiActClassification.utils", () => ({
  insertClassificationRunQuery: jest.fn(),
  getLatestRunForSubmissionQuery: jest.fn(),
}));
jest.mock("../../utils/project.utils", () => ({ createNewProjectQuery: jest.fn() }));
jest.mock("../../utils/eu.utils", () => ({ createEUFrameworkQuery: jest.fn() }));
jest.mock("../../utils/modelInventory.utils", () => ({ createNewModelInventoryQuery: jest.fn() }));
jest.mock("../../utils/useCaseChangeHistory.utils", () => ({
  recordMultipleFieldChanges: jest.fn(),
}));
jest.mock("../../services/intakeFormEmail.service", () => ({
  sendSubmissionReceivedEmail: jest.fn<any>().mockResolvedValue(undefined),
  sendNewSubmissionAdminNotification: jest.fn<any>().mockResolvedValue(undefined),
  sendSubmissionApprovedEmail: jest.fn<any>().mockResolvedValue(undefined),
  sendSubmissionRejectedEmail: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../services/intakeScoring/enqueue", () => ({
  enqueueIntakeAssessment: jest.fn(),
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
  translate: jest.fn((_: unknown, text: string) => text),
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
const emails = require("../../services/intakeFormEmail.service");
const { enqueueIntakeAssessment } = require("../../services/intakeScoring/enqueue");
const { llmKeyExistsQuery } = require("../../utils/llmKey.utils");
const { createSignedToken } = require("../../utils/signedToken.utils");
/* eslint-enable @typescript-eslint/no-require-imports */

const sign = (payload: object) => {
  const data = JSON.stringify(payload);
  const secret = (process.env.JWT_SECRET || process.env.ENCRYPTION_KEY)!;
  const signature = createHmac("sha256", secret).update(data).digest("hex");
  return Buffer.from(JSON.stringify({ data, signature })).toString("base64");
};
const res = () => {
  const r: any = {};
  r.status = jest.fn<any>().mockReturnValue(r);
  r.json = jest.fn<any>().mockReturnValue(r);
  return r;
};
const FORM = { id: 1, name: "F", entityType: "use_case", euAiActRiskStepEnabled: false };
const ROUTES = {
  byId: {
    handler: ctrl.submitPublicFormByPublicId,
    params: { publicId: "abc" },
    adminFallback: false,
  },
  bySlug: {
    handler: ctrl.submitPublicForm,
    params: { tenantSlug: "t", formSlug: "f" },
    adminFallback: true,
  },
};
const submit = async (route: keyof typeof ROUTES, body: Record<string, unknown> = {}) => {
  const r = res();
  await ROUTES[route].handler(
    {
      ip: "127.0.0.1",
      headers: {},
      lang: "de",
      t: (k: string) => k,
      params: ROUTES[route].params,
      body: {
        submitterEmail: "a@b.co",
        formData: {},
        captchaToken: sign({ answer: 4, timestamp: Date.now() }),
        captchaAnswer: 4,
        ...body,
      },
    } as any,
    r,
  );
  // let the un-awaited enqueue and its fallback settle
  for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setImmediate(resolve));
  return r;
};

describe("public submit queues the assessment", () => {
  let recipients: number[];
  let routing: any;
  beforeEach(() => {
    jest.clearAllMocks();
    recipients = [3];
    routing = null;
    intake.getTenantByPublicId.mockResolvedValue({ orgId: 5 });
    intake.getTenantHashBySlug.mockResolvedValue({ id: 5 });
    intake.checkRateLimitQuery.mockResolvedValue(true);
    intake.getFormByPublicIdQuery.mockResolvedValue(FORM);
    intake.getActivePublicFormQuery.mockResolvedValue(FORM);
    intake.getIntakeFormByIdQuery.mockImplementation(async () => ({
      ...FORM,
      schema: { version: "1.0", fields: [] },
      recipients,
      routing,
      llmKeyId: 2,
    }));
    intake.createSubmissionQuery.mockResolvedValue({ id: 99 });
    intake.claimSubmissionNotificationQuery.mockResolvedValue(true);
    enqueueIntakeAssessment.mockResolvedValue(undefined);
  });

  it.each(["byId", "bySlug"] as const)(
    "%s: enqueues both stages with notify and does not email directly",
    async (route) => {
      const r = await submit(route);
      expect(r.status).toHaveBeenCalledWith(201);
      expect(enqueueIntakeAssessment).toHaveBeenCalledWith({
        organizationId: 5,
        submissionId: 99,
        stages: ["scoring", "suggestions"],
        notify: true,
        lang: "de",
        adminFallback: ROUTES[route].adminFallback,
      });
      expect(emails.sendNewSubmissionAdminNotification).not.toHaveBeenCalled();
      expect(emails.sendSubmissionReceivedEmail).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["byId", "bySlug"] as const)(
    "%s: emails reviewers at once, without results, when the queue fails",
    async (route) => {
      enqueueIntakeAssessment.mockRejectedValue(new Error("redis down"));
      const r = await submit(route);
      expect(r.status).toHaveBeenCalledWith(201);
      expect(intake.claimSubmissionNotificationQuery).toHaveBeenCalledWith(99, 5);
      expect(emails.sendNewSubmissionAdminNotification).toHaveBeenCalledTimes(1);
      const args = emails.sendNewSubmissionAdminNotification.mock.calls[0];
      expect(args[0]).toEqual([3]);
      expect(args[4]).toBe(99);
      expect(args[7]).toBeUndefined(); // no results
    },
  );

  it("fallback also emails the eligible routing lane reviewers", async () => {
    enqueueIntakeAssessment.mockRejectedValue(new Error("redis down"));
    routing = { enabled: true, seniorReviewerIds: [7, 8], standardReviewerIds: [9] };
    intake.getEligibleReviewerIdsQuery.mockResolvedValue([7, 9]);
    await submit("byId");
    expect(intake.getEligibleReviewerIdsQuery).toHaveBeenCalledWith(5, [7, 8, 9]);
    expect(emails.sendNewSubmissionAdminNotification.mock.calls[0][0]).toEqual([3, 7, 9]);
  });

  it("fallback still emails the form's recipients when the reviewer lookup fails", async () => {
    enqueueIntakeAssessment.mockRejectedValue(new Error("redis down"));
    routing = { enabled: true, seniorReviewerIds: [7], standardReviewerIds: [] };
    intake.getEligibleReviewerIdsQuery.mockRejectedValue(new Error("db down"));
    await submit("byId");
    expect(emails.sendNewSubmissionAdminNotification.mock.calls[0][0]).toEqual([3]);
  });

  it("does not send the fallback email when it was already claimed", async () => {
    enqueueIntakeAssessment.mockRejectedValue(new Error("redis down"));
    intake.claimSubmissionNotificationQuery.mockResolvedValue(false);
    await submit("byId");
    expect(emails.sendNewSubmissionAdminNotification).not.toHaveBeenCalled();
  });

  it("without recipients the fallback goes to org admins only on the legacy route", async () => {
    enqueueIntakeAssessment.mockRejectedValue(new Error("redis down"));
    recipients = [];

    await submit("byId");
    expect(emails.sendNewSubmissionAdminNotification).not.toHaveBeenCalled();

    await submit("bySlug");
    expect(emails.sendNewSubmissionAdminNotification.mock.calls[0][0]).toBe(5);
  });
});

describe("public submit stores live checks", () => {
  const LIVE_SCHEMA = {
    version: "1.0",
    fields: [
      { id: "desc", type: "textarea", label: "Description", order: 0 },
      { id: "vendor", type: "text", label: "Vendor", order: 1 },
    ],
  };
  const DESC = "scores video interviews for enthusiasm and confidence of job candidates";
  let liveChecksEnabled: boolean;
  let llmKeyId: number | null;

  beforeEach(() => {
    jest.clearAllMocks();
    liveChecksEnabled = true;
    llmKeyId = 2;
    intake.getTenantByPublicId.mockResolvedValue({ orgId: 5 });
    intake.getTenantHashBySlug.mockResolvedValue({ id: 5 });
    intake.checkRateLimitQuery.mockResolvedValue(true);
    intake.getFormByPublicIdQuery.mockResolvedValue(FORM);
    intake.getActivePublicFormQuery.mockResolvedValue(FORM);
    intake.getIntakeFormByIdQuery.mockImplementation(async () => ({
      ...FORM,
      schema: LIVE_SCHEMA,
      recipients: [3],
      routing: null,
      llmKeyId,
      liveChecksEnabled,
    }));
    intake.createSubmissionQuery.mockResolvedValue({ id: 99 });
    intake.claimSubmissionNotificationQuery.mockResolvedValue(true);
    intake.updateLiveChecksQuery.mockResolvedValue(undefined);
    llmKeyExistsQuery.mockResolvedValue(true);
    enqueueIntakeAssessment.mockResolvedValue(undefined);
  });

  const stored = () => intake.updateLiveChecksQuery.mock.calls[0];
  const queuedStages = () => enqueueIntakeAssessment.mock.calls[0][0].stages;

  it.each(["byId", "bySlug"] as const)(
    "%s: stores rule hints and queues the AI checks stage when the form has a key",
    async (route) => {
      const r = await submit(route, { formData: { desc: DESC, vendor: "Acme" } });
      expect(r.status).toHaveBeenCalledWith(201);
      const [submissionId, orgId, liveChecks] = stored();
      expect([submissionId, orgId]).toEqual([99, 5]);
      expect(liveChecks.rules.map((h: { ruleId: string }) => h.ruleId)).toContain(
        "art5_emotion_workplace_education",
      );
      expect(liveChecks.ai).toMatchObject({ status: "pending", hints: [], language: "de" });
      expect(queuedStages()).toEqual(["scoring", "suggestions", "liveChecks"]);
      expect(llmKeyExistsQuery).toHaveBeenCalledWith(2, 5);
    },
  );

  it("without a key stores the AI checks as skipped and queues only the usual stages", async () => {
    llmKeyId = null;
    await submit("byId", { formData: { desc: DESC } });
    expect(stored()[2].ai).toEqual({ status: "skipped", hints: [] });
    expect(queuedStages()).toEqual(["scoring", "suggestions"]);
  });

  it("with live checks off stores nothing and queues only the usual stages", async () => {
    liveChecksEnabled = false;
    await submit("byId", { formData: { desc: DESC } });
    expect(intake.updateLiveChecksQuery).not.toHaveBeenCalled();
    expect(queuedStages()).toEqual(["scoring", "suggestions"]);
  });

  it("keeps a verified prefill entry and drops a forged one", async () => {
    const token = createSignedToken({
      kind: "intake_prefill",
      formId: FORM.id,
      questionId: "vendor",
      value: "Acme",
      fileName: "vendor.pdf",
      location: "Page 1",
      excerpt: "Acme provides",
      issuedAt: Date.now(),
    });
    await submit("bySlug", {
      formData: { desc: "Routes support tickets", vendor: "Acme" },
      prefill: {
        vendor: { token, confirmed: false },
        desc: { fileName: "forged.pdf", excerpt: "x", confirmed: true },
      },
    });
    expect(stored()[2].prefill).toEqual({
      vendor: {
        fileName: "vendor.pdf",
        location: "Page 1",
        excerpt: "Acme provides",
        confirmed: false,
      },
    });
  });

  it.each(["byId", "bySlug"] as const)(
    "%s: still returns 201 when the live checks write, the key lookup and Redis all fail",
    async (route) => {
      intake.updateLiveChecksQuery.mockRejectedValue(new Error("db down"));
      enqueueIntakeAssessment.mockRejectedValue(new Error("redis down"));
      const r = await submit(route, { formData: { desc: DESC } });
      expect(r.status).toHaveBeenCalledWith(201);
      // The write failed, so the AI stage is not queued.
      expect(queuedStages()).toEqual(["scoring", "suggestions"]);
      expect(emails.sendNewSubmissionAdminNotification).toHaveBeenCalledTimes(1);

      jest.clearAllMocks();
      llmKeyExistsQuery.mockRejectedValue(new Error("db down"));
      const again = await submit(route, { formData: { desc: DESC } });
      expect(again.status).toHaveBeenCalledWith(201);
      expect(intake.updateLiveChecksQuery).not.toHaveBeenCalled();
    },
  );
});
