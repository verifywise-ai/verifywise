// Servers/controllers/__tests__/intakeForm.formLogic.test.ts
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { createHmac } from "crypto";

// intakeForm.ctrl.ts throws at import without a signing secret, so set one first.
process.env.JWT_SECRET = process.env.JWT_SECRET || "intake-form-logic-test-secret";

jest.mock("../../utils/intakeForm.utils", () => ({
  getTenantByPublicId: jest.fn(),
  getTenantHashBySlug: jest.fn(),
  checkRateLimitQuery: jest.fn(),
  getFormByPublicIdQuery: jest.fn(),
  getActivePublicFormQuery: jest.fn(),
  getIntakeFormByIdQuery: jest.fn(),
  createSubmissionQuery: jest.fn(),
  getSubmissionByIdQuery: jest.fn(),
  getSubmissionByEntityQuery: jest.fn(),
  approveSubmissionQuery: jest.fn(),
  setDecisionRecordQuery: jest.fn<any>().mockResolvedValue(undefined),
  updateSubmissionRiskQuery: jest.fn<any>().mockResolvedValue(undefined),
  updateSubmissionRiskOverrideQuery: jest.fn<any>().mockResolvedValue(undefined),
  updateIntakeFormQuery: jest.fn<any>().mockResolvedValue({ id: 1 }),
}));
jest.mock("../../utils/euAiActClassification.utils", () => ({
  insertClassificationRunQuery: jest.fn(),
  getLatestRunForSubmissionQuery: jest.fn(),
}));
jest.mock("../../utils/project.utils", () => ({ createNewProjectQuery: jest.fn() }));
jest.mock("../../utils/eu.utils", () => ({ createEUFrameworkQuery: jest.fn() }));
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
const enqueue = require("../../services/intakeScoring/enqueue");
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

const LOGIC_FIELDS = [
  {
    id: "q",
    type: "select",
    label: "Personal data?",
    order: 0,
    required: false,
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
  },
  {
    id: "d",
    type: "text",
    label: "Describe the data",
    order: 1,
    required: false,
    validation: { required: true },
    visibility: { match: "all", conditions: [{ fieldId: "q", operator: "equals", value: "yes" }] },
  },
  { id: "cost", type: "number", label: "Monthly cost", order: 2, required: false },
  {
    id: "total",
    type: "calculated",
    label: "Annual cost",
    order: 3,
    required: false,
    formula: "{cost} * 12",
  },
];

const FORM = {
  id: 1,
  name: "F",
  entityType: "use_case",
  euAiActRiskStepEnabled: false,
  publicId: "abc",
};

const ROUTES = {
  byId: { handler: ctrl.submitPublicFormByPublicId, params: { publicId: "abc" } },
  bySlug: { handler: ctrl.submitPublicForm, params: { tenantSlug: "t", formSlug: "f" } },
};

const submit = async (route: keyof typeof ROUTES, formData: object) => {
  const r = res();
  await ROUTES[route].handler(
    req({
      params: ROUTES[route].params,
      body: {
        submitterEmail: "a@b.co",
        formData,
        captchaToken: sign({ answer: 4, timestamp: Date.now() }),
        captchaAnswer: 4,
      },
    }) as any,
    r,
  );
  return r;
};

const useSchema = (fields: object[]) => {
  intake.getIntakeFormByIdQuery.mockResolvedValue({
    ...FORM,
    schema: { version: "1.0", fields },
    recipients: [],
    riskTierSystem: "eu_ai_act",
    llmKeyId: null,
  });
};

describe("public submit with form logic", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    intake.getTenantByPublicId.mockResolvedValue({ orgId: 5 });
    intake.getTenantHashBySlug.mockResolvedValue({ id: 5 });
    intake.checkRateLimitQuery.mockResolvedValue(true);
    intake.getFormByPublicIdQuery.mockResolvedValue(FORM);
    intake.getActivePublicFormQuery.mockResolvedValue(FORM);
    intake.createSubmissionQuery.mockResolvedValue({ id: 99 });
    useSchema(LOGIC_FIELDS);
  });

  it.each(["byId", "bySlug"] as const)(
    "%s: drops hidden answers, skips their required check and stores server calculated values",
    async (route) => {
      const r = await submit(route, { q: "no", d: "", cost: "10", total: 5, junk: "x" });
      expect(r.status).toHaveBeenCalledWith(201);
      const stored = intake.createSubmissionQuery.mock.calls[0][0].data;
      expect({ ...stored }).toEqual({ q: "no", cost: "10", total: 120 });
      // The assessment job scores what was stored, so it sees the same data.
      expect(enqueue.enqueueIntakeAssessment).toHaveBeenCalledWith(
        expect.objectContaining({ submissionId: 99 }),
      );
    },
  );

  it.each(["byId", "bySlug"] as const)(
    "%s: a visible required field still blocks the submit",
    async (route) => {
      const r = await submit(route, { q: "yes", cost: "10" });
      expect(r.status).toHaveBeenCalledWith(400);
      expect(intake.createSubmissionQuery).not.toHaveBeenCalled();
    },
  );

  it.each(["byId", "bySlug"] as const)(
    "%s: a required field answered with only spaces counts as blank, as the rules see it",
    async (route) => {
      const r = await submit(route, { q: "yes", d: "   ", cost: "10" });
      expect(r.status).toHaveBeenCalledWith(400);
      expect(intake.createSubmissionQuery).not.toHaveBeenCalled();
    },
  );

  it.each(["byId", "bySlug"] as const)(
    "%s: a required checkbox sent unchecked is rejected, as the public form enforces",
    async (route) => {
      useSchema([{ id: "consent", type: "checkbox", label: "I agree", order: 0, required: true }]);
      const r = await submit(route, { consent: false });
      expect(r.status).toHaveBeenCalledWith(400);
      expect(JSON.stringify(r.json.mock.calls[0][0])).toContain('\\"I agree\\" is required');
      expect(intake.createSubmissionQuery).not.toHaveBeenCalled();
    },
  );

  it.each(["byId", "bySlug"] as const)(
    "%s: a form without logic stores its answers unchanged",
    async (route) => {
      useSchema([
        { id: "a", type: "text", label: "A", order: 0, required: false },
        { id: "b", type: "number", label: "B", order: 1, required: false },
      ]);
      const r = await submit(route, { a: "x", b: "3" });
      expect(r.status).toHaveBeenCalledWith(201);
      expect({ ...intake.createSubmissionQuery.mock.calls[0][0].data }).toEqual({ a: "x", b: "3" });
    },
  );
});

describe("public form payload", () => {
  it("leaves out risk dimension tags", async () => {
    jest.clearAllMocks();
    intake.getTenantByPublicId.mockResolvedValue({ orgId: 5 });
    intake.getFormByPublicIdQuery.mockResolvedValue({
      ...FORM,
      schema: {
        version: "1.0",
        fields: [
          { id: "t", type: "text", label: "Purpose", order: 0, riskDimension: "data_sensitivity" },
        ],
      },
    });
    const r = res();
    await ctrl.getPublicFormByPublicId(req({ params: { publicId: "abc" }, query: {} }) as any, r);
    expect(r.status).toHaveBeenCalledWith(200);
    const field = r.json.mock.calls[0][0].data.form.schema.fields[0];
    expect(field).toMatchObject({ id: "t", label: "Purpose" });
    expect(field).not.toHaveProperty("riskDimension");
  });
});

describe("saving a form with invalid logic", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    intake.getIntakeFormByIdQuery.mockResolvedValue({
      id: 1,
      entityType: "use_case",
      status: "active",
      euAiActRiskStepEnabled: false,
      schema: { version: "1.0", fields: [] },
    });
  });

  const UNFINISHED = {
    version: "1.0",
    fields: [{ id: "total", type: "calculated", label: "Total", order: 0, formula: "" }],
  };

  it("saves a draft whose logic is unfinished", async () => {
    intake.getIntakeFormByIdQuery.mockResolvedValue({
      id: 1,
      entityType: "use_case",
      status: "draft",
      euAiActRiskStepEnabled: false,
      schema: { version: "1.0", fields: [] },
    });
    const r = res();
    await ctrl.updateIntakeForm(
      req({ params: { id: "1" }, body: { schema: UNFINISHED } }) as any,
      r,
    );
    expect(intake.updateIntakeFormQuery).toHaveBeenCalled();
  });

  it("rejects publishing a draft whose logic is unfinished", async () => {
    intake.getIntakeFormByIdQuery.mockResolvedValue({
      id: 1,
      entityType: "use_case",
      status: "draft",
      euAiActRiskStepEnabled: false,
      schema: { version: "1.0", fields: [] },
    });
    const r = res();
    await ctrl.updateIntakeForm(
      req({ params: { id: "1" }, body: { schema: UNFINISHED, status: "active" } }) as any,
      r,
    );
    expect(r.status).toHaveBeenCalledWith(400);
    expect(intake.updateIntakeFormQuery).not.toHaveBeenCalled();
  });

  it("rejects a formula that uses a later field and does not save", async () => {
    const r = res();
    await ctrl.updateIntakeForm(
      req({
        params: { id: "1" },
        body: {
          schema: {
            version: "1.0",
            fields: [
              {
                id: "total",
                type: "calculated",
                label: "Total",
                order: 0,
                required: false,
                formula: "{n} + 1",
              },
              { id: "n", type: "number", label: "N", order: 1, required: false },
            ],
          },
        },
      }) as any,
      r,
    );
    expect(r.status).toHaveBeenCalledWith(400);
    expect(String(r.json.mock.calls[0][0].data)).toContain('Field "Total"');
    expect(intake.updateIntakeFormQuery).not.toHaveBeenCalled();
  });

  it("does not block an update that leaves the schema, entity type and status alone", async () => {
    intake.getIntakeFormByIdQuery.mockResolvedValue({
      id: 1,
      entityType: "use_case",
      status: "active",
      euAiActRiskStepEnabled: false,
      schema: {
        version: "1.0",
        fields: [
          { id: "x", type: "text", label: "A", order: 0 },
          { id: "x", type: "text", label: "B", order: 1 },
        ],
      },
    });
    const r = res();
    await ctrl.updateIntakeForm(
      req({ params: { id: "1" }, body: { description: "New text" } }) as any,
      r,
    );
    expect(intake.updateIntakeFormQuery).toHaveBeenCalled();
  });

  it("checks the stored schema when only the entity type changes", async () => {
    intake.getIntakeFormByIdQuery.mockResolvedValue({
      id: 1,
      entityType: "use_case",
      status: "active",
      euAiActRiskStepEnabled: false,
      schema: {
        version: "1.0",
        fields: [
          { id: "t", type: "text", label: "T", order: 0, required: false },
          {
            id: "name",
            type: "text",
            label: "Model name",
            order: 1,
            required: false,
            entityFieldMapping: "name",
            visibility: { match: "all", conditions: [{ fieldId: "t", operator: "is_empty" }] },
          },
        ],
      },
    });
    const r = res();
    await ctrl.updateIntakeForm(
      req({ params: { id: "1" }, body: { entityType: "model" } }) as any,
      r,
    );
    expect(r.status).toHaveBeenCalledWith(400);
    expect(intake.updateIntakeFormQuery).not.toHaveBeenCalled();
  });
});

describe("submission fields for an entity", () => {
  beforeEach(() => jest.clearAllMocks());

  it("marks which fields the submission stored and passes calculated display settings", async () => {
    intake.getSubmissionByEntityQuery.mockResolvedValue({
      submission: { id: 3, data: { cost: "10", total: null }, createdAt: new Date() },
      formName: "F",
      formSchema: {
        fields: [
          { id: "cost", type: "number", label: "Monthly cost", order: 0 },
          {
            id: "total",
            type: "calculated",
            label: "Annual cost",
            order: 1,
            decimals: 0,
            prefix: "€",
          },
          { id: "old", type: "calculated", label: "Old", order: 2 },
        ],
      },
    });
    const r = res();
    await ctrl.getSubmissionByEntity(
      req({ params: { entityType: "use_case", entityId: "4" } }) as any,
      r,
    );
    expect(r.status).toHaveBeenCalledWith(200);
    const fields = r.json.mock.calls[0][0].data.fields;
    expect(fields.find((f: any) => f.fieldId === "total")).toMatchObject({
      answered: true,
      value: null,
      decimals: 0,
      prefix: "€",
    });
    expect(fields.find((f: any) => f.fieldId === "old").answered).toBe(false);
  });
});
