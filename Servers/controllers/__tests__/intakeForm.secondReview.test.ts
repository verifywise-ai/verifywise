// Servers/controllers/__tests__/intakeForm.secondReview.test.ts
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// intakeForm.ctrl.ts throws at import without a signing secret.
process.env.JWT_SECRET = process.env.JWT_SECRET || "intake-second-review-test-secret";

jest.mock("../../utils/intakeForm.utils", () => ({
  getIntakeFormByIdQuery: jest.fn(),
  getSubmissionByIdQuery: jest.fn(),
  updateSecondReviewQuery: jest.fn(),
}));
jest.mock("../../services/intakeFormEmail.service", () => ({
  sendSubmissionReceivedEmail: jest.fn(),
  sendNewSubmissionAdminNotification: jest.fn(),
  sendSubmissionApprovedEmail: jest.fn(),
  sendSubmissionRejectedEmail: jest.fn(),
  sendSecondReviewRequestEmail: jest.fn(),
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
jest.mock("../../database/db", () => ({ sequelize: { transaction: jest.fn() } }));

/* eslint-disable @typescript-eslint/no-require-imports */
const ctrl = require("../intakeForm.ctrl") as typeof import("../intakeForm.ctrl");
const intake = require("../../utils/intakeForm.utils");
const { logSuccess } = require("../../utils/logger/logHelper");
/* eslint-enable @typescript-eslint/no-require-imports */

const ORG = 5;
const SENIOR = 1;
const STANDARD = 2;
const APPROVER = 3;
const OTHER = 9;

const cfg = {
  enabled: true,
  seniorReviewerIds: [SENIOR],
  standardReviewerIds: [STANDARD, APPROVER],
  threshold: 50,
  closeCallMargin: 10,
  secondReviewRate: 10,
};
const OPEN = { status: "open", selectedAt: "2026-10-22T00:00:00.000Z" };
const routing = (secondReview: object | undefined = OPEN) => ({
  lane: "standard",
  reason: "below_threshold",
  score: 20,
  threshold: 50,
  closeCallMargin: 10,
  routedAt: "2026-10-22T00:00:00.000Z",
  secondReview,
});
const submission = (overrides: object = {}) => ({
  id: 11,
  formId: 3,
  organizationId: ORG,
  status: "approved",
  entityId: 70,
  reviewedBy: APPROVER,
  routing: routing(),
  ...overrides,
});

const res = () => {
  const r: any = {};
  r.status = jest.fn<any>().mockReturnValue(r);
  r.json = jest.fn<any>().mockReturnValue(r);
  return r;
};
const request = (userId: number, body: object = {}, role = "Editor") => ({
  userId,
  role,
  organizationId: ORG,
  lang: "en",
  t: (k: string) => k,
  params: { id: "11" },
  body,
});
const call = async (fn: (req: any, res: any) => Promise<unknown>, req: object) => {
  const r = res();
  await fn(req, r);
  return { status: r.status.mock.calls[0]?.[0], body: r.json.mock.calls[0]?.[0] };
};
const record = (userId: number, body: object, role?: string) =>
  call(ctrl.recordSecondReview, request(userId, body, role));
const resolve = (userId: number, body: object, role?: string) =>
  call(ctrl.resolveSecondReviewMiss, request(userId, body, role));

beforeEach(() => {
  jest.clearAllMocks();
  intake.getSubmissionByIdQuery.mockResolvedValue(submission());
  intake.getIntakeFormByIdQuery.mockResolvedValue({ id: 3, routing: cfg });
  intake.updateSecondReviewQuery.mockImplementation(
    async (_id: number, _org: number, _expected: unknown, patch: object) =>
      routing({ ...OPEN, ...patch }),
  );
});

describe("recordSecondReview", () => {
  it("a senior reviewer agrees: stores who and when, leaves the approval alone", async () => {
    const r = await record(SENIOR, { outcome: "agreed" });
    expect(r.status).toBe(200);
    const [id, org, expected, patch] = intake.updateSecondReviewQuery.mock.calls[0];
    expect([id, org, expected]).toEqual([11, ORG, { status: "open" }]);
    expect(patch).toEqual({
      status: "agreed",
      reviewedBy: SENIOR,
      reviewedAt: expect.any(String),
    });
    expect(r.body.data.secondReview).toMatchObject({ status: "agreed", reviewedBy: SENIOR });
    expect(logSuccess).toHaveBeenCalled();
  });

  it("a miss stores the note", async () => {
    const r = await record(SENIOR, { outcome: "missed", note: "  Missed a bias risk " });
    expect(r.status).toBe(200);
    expect(intake.updateSecondReviewQuery.mock.calls[0][3]).toMatchObject({
      status: "missed",
      note: "Missed a bias risk",
    });
  });

  it.each([
    ["missing", { outcome: "missed" }],
    ["blank", { outcome: "missed", note: "   " }],
    ["too long", { outcome: "missed", note: "x".repeat(2001) }],
  ])("a miss with a %s note is a 400", async (_n, body) => {
    const r = await record(SENIOR, body);
    expect(r.status).toBe(400);
    expect(intake.updateSecondReviewQuery).not.toHaveBeenCalled();
  });

  it("rejects an unknown outcome and an over-long note on agree", async () => {
    expect((await record(SENIOR, { outcome: "maybe" })).status).toBe(400);
    expect((await record(SENIOR, { outcome: "agreed", note: "x".repeat(2001) })).status).toBe(400);
  });

  it("a senior can't second-review their own approval", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(submission({ reviewedBy: SENIOR }));
    const r = await record(SENIOR, { outcome: "agreed" });
    expect(r.status).toBe(403);
    expect(r.body.data).toBe("You can't second-review your own approval");
    expect(intake.updateSecondReviewQuery).not.toHaveBeenCalled();
  });

  it("a standard reviewer gets a 403", async () => {
    const r = await record(STANDARD, { outcome: "agreed" });
    expect(r.status).toBe(403);
    expect(intake.updateSecondReviewQuery).not.toHaveBeenCalled();
  });

  it("an Admin outside the lists may", async () => {
    const r = await record(OTHER, { outcome: "agreed" }, "Admin");
    expect(r.status).toBe(200);
  });

  it("409 when the review isn't open", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(
      submission({ routing: routing({ ...OPEN, status: "agreed" }) }),
    );
    expect((await record(SENIOR, { outcome: "agreed" })).status).toBe(409);
    intake.getSubmissionByIdQuery.mockResolvedValue(
      submission({ routing: { ...routing(), secondReview: undefined } }),
    );
    expect((await record(SENIOR, { outcome: "agreed" })).status).toBe(409);
    expect(intake.updateSecondReviewQuery).not.toHaveBeenCalled();
  });

  it("409 when another reviewer wins the race", async () => {
    intake.updateSecondReviewQuery.mockResolvedValue(null);
    const r = await record(SENIOR, { outcome: "agreed" });
    expect(r.status).toBe(409);
  });

  it("404 for a missing submission, 403 when the form has routing off", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(null);
    expect((await record(SENIOR, { outcome: "agreed" })).status).toBe(404);
    intake.getSubmissionByIdQuery.mockResolvedValue(submission());
    intake.getIntakeFormByIdQuery.mockResolvedValue({ id: 3, routing: null });
    expect((await record(SENIOR, { outcome: "agreed" })).status).toBe(403);
  });
});

describe("resolveSecondReviewMiss", () => {
  const missed = (extra: object = {}) =>
    submission({
      routing: routing({ ...OPEN, status: "missed", reviewedBy: SENIOR, note: "n", ...extra }),
    });

  it("resolves a miss: approval and entity stay as they are", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(missed());
    const r = await resolve(SENIOR, { note: "Fixed the risk register" });
    expect(r.status).toBe(200);
    const [id, org, expected, patch] = intake.updateSecondReviewQuery.mock.calls[0];
    expect([id, org, expected]).toEqual([11, ORG, { status: "missed", unresolved: true }]);
    expect(patch).toEqual({
      resolvedBy: SENIOR,
      resolvedAt: expect.any(String),
      resolutionNote: "Fixed the risk register",
    });
    expect(r.body.data.secondReview.resolutionNote).toBe("Fixed the risk register");
  });

  it("409 on an agreed review, a resolved miss or a lost race", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(
      submission({ routing: routing({ ...OPEN, status: "agreed" }) }),
    );
    expect((await resolve(SENIOR, { note: "x" })).status).toBe(409);
    intake.getSubmissionByIdQuery.mockResolvedValue(missed({ resolvedAt: "z" }));
    expect((await resolve(SENIOR, { note: "x" })).status).toBe(409);
    intake.getSubmissionByIdQuery.mockResolvedValue(missed());
    intake.updateSecondReviewQuery.mockResolvedValue(null);
    expect((await resolve(SENIOR, { note: "x" })).status).toBe(409);
  });

  it.each([[""], ["  "], [undefined], ["x".repeat(2001)]])("400 for note %p", async (note) => {
    intake.getSubmissionByIdQuery.mockResolvedValue(missed());
    expect((await resolve(SENIOR, { note })).status).toBe(400);
  });

  it("403 for a standard reviewer and for the approver's own approval", async () => {
    intake.getSubmissionByIdQuery.mockResolvedValue(missed());
    expect((await resolve(STANDARD, { note: "x" })).status).toBe(403);
    intake.getSubmissionByIdQuery.mockResolvedValue({ ...missed(), reviewedBy: SENIOR });
    expect((await resolve(SENIOR, { note: "x" })).status).toBe(403);
  });
});
