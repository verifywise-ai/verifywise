import { describe, it, expect, jest, beforeEach } from "@jest/globals";

process.env.JWT_SECRET = process.env.JWT_SECRET || "intake-oversight-test-secret";

jest.mock("../../utils/intakeForm.utils", () => ({
  getIntakeFormByIdQuery: jest.fn<any>(),
}));
jest.mock("../../services/intakeRouting/oversight", () => ({
  OVERSIGHT_WEEKS: [4, 8, 12],
  getIntakeOversightQuery: jest.fn<any>(),
}));
jest.mock("../../utils/project.utils", () => ({ createNewProjectQuery: jest.fn() }));
jest.mock("../../utils/eu.utils", () => ({ createEUFrameworkQuery: jest.fn() }));
jest.mock("../../utils/modelInventory.utils", () => ({ createNewModelInventoryQuery: jest.fn() }));
jest.mock("../../utils/useCaseChangeHistory.utils", () => ({
  recordMultipleFieldChanges: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../services/intakeFormEmail.service", () => ({}));
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
    400: (d: any) => ({ message: "Bad Request", data: d }),
    404: (d: any) => ({ message: "Not Found", data: d }),
    500: (d: any) => ({ message: "Internal Server Error", data: d }),
  },
}));
jest.mock("../../database/db", () => ({
  sequelize: { transaction: jest.fn<any>() },
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const ctrl = require("../intakeForm.ctrl") as typeof import("../intakeForm.ctrl");
const intake = require("../../utils/intakeForm.utils");
const { getIntakeOversightQuery } = require("../../services/intakeRouting/oversight");
/* eslint-enable @typescript-eslint/no-require-imports */

const req = (query: any = {}) =>
  ({ userId: 7, organizationId: 5, headers: {}, t: (k: string) => k, query }) as any;
const res = () => {
  const r: any = {};
  r.status = jest.fn<any>().mockReturnValue(r);
  r.json = jest.fn<any>().mockReturnValue(r);
  return r;
};

describe("getIntakeOversight", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getIntakeOversightQuery.mockResolvedValue({ weeks: 8 });
  });

  it("rejects weeks outside 4, 8 and 12", async () => {
    const r = res();
    await ctrl.getIntakeOversight(req({ weeks: "5" }), r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(getIntakeOversightQuery).not.toHaveBeenCalled();
  });

  it("defaults to 8 weeks and passes the caller's organisation id", async () => {
    const r = res();
    await ctrl.getIntakeOversight(req(), r);
    expect(r.status).toHaveBeenCalledWith(200);
    expect(getIntakeOversightQuery).toHaveBeenCalledWith(5, 8, undefined);
  });

  it("returns 404 when the form is not in the organisation", async () => {
    intake.getIntakeFormByIdQuery.mockResolvedValue(null);
    const r = res();
    await ctrl.getIntakeOversight(req({ weeks: "4", formId: "99" }), r);
    expect(intake.getIntakeFormByIdQuery).toHaveBeenCalledWith(99, 5);
    expect(r.status).toHaveBeenCalledWith(404);
    expect(getIntakeOversightQuery).not.toHaveBeenCalled();
  });

  it("filters by an existing form", async () => {
    intake.getIntakeFormByIdQuery.mockResolvedValue({ id: 3 });
    const r = res();
    await ctrl.getIntakeOversight(req({ weeks: "12", formId: "3" }), r);
    expect(getIntakeOversightQuery).toHaveBeenCalledWith(5, 12, 3);
    expect(r.status).toHaveBeenCalledWith(200);
  });

  it("rejects a malformed form id", async () => {
    const r = res();
    await ctrl.getIntakeOversight(req({ formId: "abc" }), r);
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it("returns 500 when the query fails", async () => {
    getIntakeOversightQuery.mockRejectedValue(new Error("boom"));
    const r = res();
    await ctrl.getIntakeOversight(req(), r);
    expect(r.status).toHaveBeenCalledWith(500);
  });
});
