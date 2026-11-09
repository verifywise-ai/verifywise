// Servers/controllers/__tests__/intakeLiveChecks.ctrl.test.ts
// The public live-check and prefill endpoints, driven through the real intake
// router so the form resolver, the visitor limiters and multer all run.
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import request from "supertest";
import express from "express";

// signedToken.utils throws at import without a signing secret.
process.env.JWT_SECRET = process.env.JWT_SECRET || "intake-live-checks-test-secret";

jest.mock("../../utils/intakeForm.utils", () => ({
  getTenantByPublicId: jest.fn(),
  getTenantHashBySlug: jest.fn(),
  checkRateLimitQuery: jest.fn(),
  getFormByPublicIdQuery: jest.fn(),
  getActivePublicFormQuery: jest.fn(),
  getIntakeFormByIdQuery: jest.fn(),
  getSubmissionByIdQuery: jest.fn(),
}));
jest.mock("../../utils/llmKey.utils", () => ({
  llmKeyExistsQuery: jest.fn(),
  getLLMKeyWithKeyByIdQuery: jest.fn(),
}));
jest.mock("../../advisor/llmModelFactory", () => ({
  createModelFromKey: jest.fn(() => ({ fake: "model" })),
}));
jest.mock("../../database/redis", () => {
  const client = {
    status: "ready",
    incr: jest.fn(),
    expire: jest.fn(),
    // A MULTI of incr + expire, reported as ioredis does: [error, result] per command.
    multi: () => {
      const ops: Array<() => Promise<unknown>> = [];
      const chain = {
        incr: (key: string) => (ops.push(() => client.incr(key)), chain),
        expire: (key: string, s: number) => (ops.push(() => client.expire(key, s)), chain),
        exec: async () => {
          const replies: Array<[unknown, unknown]> = [];
          for (const op of ops) {
            try {
              replies.push([null, await op()]);
            } catch (error) {
              replies.push([error, null]);
            }
          }
          return replies;
        },
      };
      return chain;
    },
  };
  return { __esModule: true, default: client };
});
jest.mock("../../services/fileIngestion/textExtractor", () => ({
  ...(jest.requireActual("../../services/fileIngestion/textExtractor") as object),
  extractText: jest.fn(),
}));
// The real services run with a test-controlled model call.
let generate: jest.Mock<any> = jest.fn();
jest.mock("../../services/intakeLiveChecks", () => {
  const actual = jest.requireActual("../../services/intakeLiveChecks") as any;
  return {
    ...actual,
    runAiChecks: jest.fn((params: any) => actual.runAiChecks({ ...params, generate })),
    runPrefill: jest.fn((params: any) => actual.runPrefill({ ...params, generate })),
  };
});
jest.mock("../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (_req: any, _res: any, next: any) => next(),
}));
jest.mock("../../middleware/accessControl.middleware", () => ({
  __esModule: true,
  default: () => (_req: any, _res: any, next: any) => next(),
}));
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
  sendSubmissionReceivedEmail: jest.fn(),
  sendNewSubmissionAdminNotification: jest.fn(),
  sendSubmissionApprovedEmail: jest.fn(),
  sendSubmissionRejectedEmail: jest.fn(),
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
  logSuccess: jest.fn(),
  logFailure: jest.fn(),
}));
jest.mock("../../database/db", () => ({
  sequelize: { transaction: jest.fn(), query: jest.fn() },
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const intakeRoutes = require("../../routes/intakeForm.route").default;
const intake = require("../../utils/intakeForm.utils");
const llmKeys = require("../../utils/llmKey.utils");
const redis = require("../../database/redis").default;
const { extractText } = require("../../services/fileIngestion/textExtractor");
const liveChecks = require("../../services/intakeLiveChecks");
const { verifySignedToken } = require("../../utils/signedToken.utils");
/* eslint-enable @typescript-eslint/no-require-imports */

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use((req: any, _res, next) => {
  req.t = (key: string) => key;
  next();
});
app.use("/api/intake", intakeRoutes);

const SCHEMA = {
  version: "1",
  fields: [
    { id: "purpose", type: "textarea", label: "What does the system do?", order: 0 },
    { id: "users", type: "textarea", label: "Who uses it?", order: 1 },
    { id: "personal", type: "checkbox", label: "Uses personal data", order: 2 },
    {
      id: "dpo",
      type: "textarea",
      label: "Data protection notes",
      order: 3,
      visibility: { match: "all", conditions: [{ fieldId: "personal", operator: "is_checked" }] },
    },
    { id: "vendor", type: "text", label: "Vendor name", order: 4 },
  ],
};

// Each test gets its own form id so the in-memory visitor limiters, which
// key on IP and form, never carry counts from one test into another.
let nextFormId = 100;
let formId = 0;

function setForm(overrides: Record<string, unknown> = {}) {
  formId = nextFormId++;
  const full = {
    id: formId,
    name: "Vendor intake",
    slug: "vendor-intake",
    schema: SCHEMA,
    status: "active",
    publicId: "pub-1",
    llmKeyId: 5,
    liveChecksEnabled: true,
    euAiActRiskStepEnabled: false,
    designSettings: null,
    ...overrides,
  };
  intake.getTenantByPublicId.mockResolvedValue({ tenantHash: "1", orgId: 1 });
  intake.getTenantHashBySlug.mockResolvedValue({ id: 1, hash: "" });
  const publicForm = full.status === "active" ? { ...full } : null;
  intake.getFormByPublicIdQuery.mockResolvedValue(publicForm);
  intake.getActivePublicFormQuery.mockResolvedValue(publicForm);
  intake.getIntakeFormByIdQuery.mockResolvedValue(full);
  return full;
}

const checks = (body: unknown, path = "/api/intake/public/by-id/pub-1/live-checks") =>
  request(app)
    .post(path)
    .send(body as object);

const PDF_HEAD = Buffer.from("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n", "latin1");
const DOC_TEXT =
  "Acme overview. Section 2: Product. The platform scores inbound support tickets by urgency.";

const prefill = (
  file: { buffer: Buffer; name: string; type: string } | null,
  fields: Record<string, string> = {},
  path = "/api/intake/public/by-id/pub-1/prefill",
) => {
  let req = request(app).post(path);
  for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
  if (file) req = req.attach("file", file.buffer, { filename: file.name, contentType: file.type });
  return req;
};
const pdf = (buffer: Buffer = PDF_HEAD, name = "vendor.pdf") => ({
  buffer,
  name,
  type: "application/pdf",
});

const budget = new Map<string, number>();

beforeEach(() => {
  jest.clearAllMocks();
  budget.clear();
  redis.incr.mockImplementation(async (key: string) => {
    const n = (budget.get(key) ?? 0) + 1;
    budget.set(key, n);
    return n;
  });
  redis.expire.mockResolvedValue(1);
  llmKeys.llmKeyExistsQuery.mockResolvedValue(true);
  llmKeys.getLLMKeyWithKeyByIdQuery.mockResolvedValue({ id: 5, name: "OpenAI", key: "sk-x" });
  extractText.mockResolvedValue(DOC_TEXT);
  generate = jest.fn<any>().mockResolvedValue({ object: { hints: [] } });
  setForm();
});

describe("POST live-checks", () => {
  const data = { purpose: "We use it for some things sometimes", users: "Staff" };

  it("answers aiAvailable false and makes no model call when the form has no key", async () => {
    setForm({ llmKeyId: null });
    const res = await checks({ data, language: "en" });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ aiAvailable: false, hints: [] });
    expect(liveChecks.runAiChecks).not.toHaveBeenCalled();
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it("answers aiAvailable false when live checks are off", async () => {
    setForm({ liveChecksEnabled: false });
    const res = await checks({ data });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ aiAvailable: false, hints: [] });
    expect(liveChecks.runAiChecks).not.toHaveBeenCalled();
  });

  it("answers aiAvailable false when the key was deleted", async () => {
    llmKeys.getLLMKeyWithKeyByIdQuery.mockResolvedValue(null);
    const res = await checks({ data });
    expect(res.body.data).toEqual({ aiAvailable: false, hints: [] });
    expect(liveChecks.runAiChecks).not.toHaveBeenCalled();
  });

  it("returns the hints the model gave, on the slug URL too", async () => {
    generate.mockResolvedValue({
      object: {
        hints: [
          {
            kind: "vague",
            questionId: "purpose",
            title: "Say what it does",
            text: "This answer may be too general.",
            excerpt: "use it for some things",
          },
        ],
      },
    });
    const res = await checks(
      { data, language: "de-DE" },
      "/api/intake/public/acme/vendor-intake/live-checks",
    );
    expect(res.status).toBe(200);
    expect(res.body.data.aiAvailable).toBe(true);
    expect(res.body.data.hints).toHaveLength(1);
    expect(res.body.data.hints[0]).toMatchObject({ kind: "vague", questionId: "purpose" });
    expect((liveChecks.runAiChecks as jest.Mock).mock.calls[0][0]).toMatchObject({
      language: "de",
      timeoutMs: liveChecks.LIVE_CHECK_TIMEOUT_MS,
    });
    expect(intake.getActivePublicFormQuery).toHaveBeenCalledWith("vendor-intake", 1);
  });

  it("answers 429 when the form's hourly budget is spent", async () => {
    redis.incr.mockResolvedValue(301);
    const res = await checks({ data });
    expect(res.status).toBe(429);
    expect(liveChecks.runAiChecks).not.toHaveBeenCalled();
  });

  it("answers 429 when Redis is down", async () => {
    redis.incr.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await checks({ data });
    expect(res.status).toBe(429);
    expect(liveChecks.runAiChecks).not.toHaveBeenCalled();
  });

  it("answers 200 with error unavailable when the model fails, never the raw error", async () => {
    generate.mockRejectedValue(new Error("401 invalid api key sk-secret"));
    const res = await checks({ data });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ aiAvailable: true, hints: [], error: "unavailable" });
    expect(JSON.stringify(res.body)).not.toContain("sk-secret");
  });

  it.each([["a string"], [["an", "array"]], [null], [undefined]])(
    "answers 400 when data is %p",
    async (bad) => {
      const res = await checks({ data: bad });
      expect(res.status).toBe(400);
      expect(liveChecks.runAiChecks).not.toHaveBeenCalled();
    },
  );

  it("never sends a hidden field's answer to the model", async () => {
    await checks({
      data: { purpose: "Scores tickets by urgency", dpo: "HIDDEN SECRET NOTES" },
    });
    const { answers } = (liveChecks.runAiChecks as jest.Mock).mock.calls[0][0] as any;
    expect(answers.map((a: any) => a.questionId)).toEqual(["purpose"]);
    expect(JSON.stringify(answers)).not.toContain("HIDDEN SECRET");
  });

  it("sends a shown conditional field", async () => {
    await checks({ data: { purpose: "Scores tickets", personal: true, dpo: "Shown notes" } });
    const { answers } = (liveChecks.runAiChecks as jest.Mock).mock.calls[0][0] as any;
    expect(answers.map((a: any) => a.questionId)).toEqual(["purpose", "personal", "dpo"]);
  });

  it("does not spend budget when no answer has text", async () => {
    const res = await checks({ data: {} });
    expect(res.body.data).toEqual({ aiAvailable: true, hints: [] });
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it("caps 10,000 keys and a 5 MB answer at 24,000 answer characters", async () => {
    const hostile: Record<string, string> = {};
    for (let i = 0; i < 10_000; i++) hostile[`k${i}`] = "x".repeat(10);
    hostile.purpose = "y".repeat(5 * 1024 * 1024);
    hostile.users = "z".repeat(5000);
    hostile.vendor = "v".repeat(30_000);
    const res = await checks({ data: hostile });
    expect(res.status).toBe(200);
    const { answers } = (liveChecks.runAiChecks as jest.Mock).mock.calls[0][0] as any;
    const total = answers.reduce((n: number, a: any) => n + a.text.length, 0);
    expect(total).toBeLessThanOrEqual(24_000);
    expect(answers.every((a: any) => a.text.length <= 2_000)).toBe(true);
    expect(answers.some((a: any) => a.questionId.startsWith("k"))).toBe(false);
  });

  it("answers 404 for an inactive form", async () => {
    setForm({ status: "draft" });
    const res = await checks({ data });
    expect(res.status).toBe(404);
  });

  it("answers 404 when the full form is no longer active", async () => {
    const full = setForm();
    intake.getIntakeFormByIdQuery.mockResolvedValue({ ...full, status: "archived" });
    const res = await checks({ data });
    expect(res.status).toBe(404);
  });

  it("answers 404 for an unknown organisation", async () => {
    intake.getTenantByPublicId.mockResolvedValue(null);
    const res = await checks({ data });
    expect(res.status).toBe(404);
  });

  it("refuses the 11th call in a minute from one visitor", async () => {
    for (let i = 0; i < 10; i++) {
      const ok = await checks({ data });
      expect(ok.status).toBe(200);
    }
    const res = await checks({ data });
    expect(res.status).toBe(429);
  });
});

describe("POST prefill", () => {
  const suggestion = {
    questionId: "purpose",
    value: "It scores inbound support tickets by urgency.",
    excerpt: "the platform scores inbound support tickets",
    location: "Section 2",
  };

  it("answers 404 when the form has no key", async () => {
    setForm({ llmKeyId: null });
    const res = await prefill(pdf());
    expect(res.status).toBe(404);
    expect(liveChecks.runPrefill).not.toHaveBeenCalled();
  });

  it("answers 404 when live checks are off", async () => {
    setForm({ liveChecksEnabled: false });
    const res = await prefill(pdf());
    expect(res.status).toBe(404);
  });

  it("answers 400 when no file is attached", async () => {
    const res = await prefill(null, { data: "{}" });
    expect(res.status).toBe(400);
  });

  it("answers 415 for a wrong file type", async () => {
    const res = await prefill({
      buffer: Buffer.from("hello"),
      name: "notes.txt",
      type: "text/plain",
    });
    expect(res.status).toBe(415);
    expect(liveChecks.runPrefill).not.toHaveBeenCalled();
  });

  it("answers 415 for an MZ executable named .pdf", async () => {
    const mz = Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.alloc(200)]);
    const res = await prefill(pdf(mz, "invoice.pdf"));
    expect(res.status).toBe(415);
  });

  it("answers 422 with a plain message for an empty PDF", async () => {
    extractText.mockResolvedValue("");
    const res = await prefill(pdf());
    expect(res.status).toBe(422);
    expect(typeof res.body.data).toBe("string");
    expect(res.body.data).toMatch(/couldn't find any text/i);
    expect(generate).not.toHaveBeenCalled();
  });

  it("answers 422 for a zero-byte PDF", async () => {
    const res = await prefill(pdf(Buffer.alloc(0)));
    expect(res.status).toBe(422);
  });

  it("answers 413 for an 11 MB file", async () => {
    const big = Buffer.concat([PDF_HEAD, Buffer.alloc(11 * 1024 * 1024)]);
    const res = await prefill(pdf(big));
    expect(res.status).toBe(413);
    expect(liveChecks.runPrefill).not.toHaveBeenCalled();
  });

  it("accepts answers up to the JSON body limit in the data field", async () => {
    generate.mockResolvedValue({ object: { suggestions: [] } });
    const data = JSON.stringify({ users: "x".repeat(3_000_000) });
    const res = await prefill(pdf(), { data });
    expect(res.status).toBe(200);
  });

  it("answers 400 when data is not a JSON object", async () => {
    const res = await prefill(pdf(), { data: "[1,2]" });
    expect(res.status).toBe(400);
    const res2 = await prefill(pdf(), { data: "{not json" });
    expect(res2.status).toBe(400);
  });

  it("answers 502 with the spec message when the model fails", async () => {
    generate.mockRejectedValue(new Error("upstream 500"));
    const res = await prefill(pdf(), { data: "{}" });
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).toContain(
      "We couldn't read answers from this document. You can fill in the form as usual.",
    );
    expect(JSON.stringify(res.body)).not.toContain("upstream 500");
  });

  it("answers 429 when the form's hourly prefill budget is spent", async () => {
    redis.incr.mockResolvedValue(21);
    const res = await prefill(pdf());
    expect(res.status).toBe(429);
    expect(liveChecks.runPrefill).not.toHaveBeenCalled();
  });

  it("returns suggestions with signed tokens, on the slug URL too", async () => {
    generate.mockResolvedValue({ object: { suggestions: [suggestion] } });
    const res = await prefill(
      pdf(),
      { data: JSON.stringify({ users: "Staff" }), language: "fr" },
      "/api/intake/public/acme/vendor-intake/prefill",
    );
    expect(res.status).toBe(200);
    expect(res.body.data.fileName).toBe("vendor.pdf");
    expect(res.body.data.suggestions).toHaveLength(1);
    const [s] = res.body.data.suggestions;
    expect(s).toMatchObject({ questionId: "purpose", value: suggestion.value });
    const decoded = verifySignedToken(s.token);
    expect(decoded).toMatchObject({ formId, questionId: "purpose" });
    expect((liveChecks.runPrefill as jest.Mock).mock.calls[0][0]).toMatchObject({
      formId,
      language: "fr",
      data: { users: "Staff" },
    });
    expect(JSON.stringify(res.body)).not.toContain("sk-x");
  });

  it("refuses the 4th upload in 10 minutes from one visitor", async () => {
    generate.mockResolvedValue({ object: { suggestions: [] } });
    for (let i = 0; i < 3; i++) expect((await prefill(pdf())).status).toBe(200);
    expect((await prefill(pdf())).status).toBe(429);
  });
});

describe("public form GET", () => {
  it.each([["/api/intake/public/by-id/pub-1"], ["/api/intake/public/acme/vendor-intake"]])(
    "%s reports live checks without the key id",
    async (path) => {
      setForm({ llmKeyId: null });
      const res = await request(app).get(path);
      expect(res.status).toBe(200);
      expect(res.body.data.liveChecks).toEqual({ enabled: true, aiAvailable: false });
      expect(JSON.stringify(res.body)).not.toContain("llmKeyId");
    },
  );

  it("reports AI available when the key still exists", async () => {
    const res = await request(app).get("/api/intake/public/by-id/pub-1");
    expect(res.body.data.liveChecks).toEqual({ enabled: true, aiAvailable: true });
    expect(llmKeys.llmKeyExistsQuery).toHaveBeenCalledWith(5, 1);
  });

  it("reports AI unavailable when the key was deleted, and off when live checks are off", async () => {
    llmKeys.llmKeyExistsQuery.mockResolvedValue(false);
    let res = await request(app).get("/api/intake/public/by-id/pub-1");
    expect(res.body.data.liveChecks).toEqual({ enabled: true, aiAvailable: false });
    setForm({ liveChecksEnabled: false });
    llmKeys.llmKeyExistsQuery.mockResolvedValue(true);
    res = await request(app).get("/api/intake/public/by-id/pub-1");
    expect(res.body.data.liveChecks).toEqual({ enabled: false, aiAvailable: false });
  });
});
