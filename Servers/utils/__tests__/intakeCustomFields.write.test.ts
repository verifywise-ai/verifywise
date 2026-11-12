// writeIntakeCustomFields: which exceptions count as a removed field.
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// intakeForm.ctrl.ts throws at import without a signing secret.
process.env.JWT_SECRET = process.env.JWT_SECRET || "intake-custom-field-test-secret";

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
const cf = require("../../utils/customField.utils");
/* eslint-enable @typescript-eslint/no-require-imports */
const {
  NotFoundException,
  ForbiddenException,
} = require("../../domain.layer/exceptions/custom.exception");

const schema = {
  fields: [{ id: "q1", type: "text", label: "Owner", entityFieldMapping: "custom_field:owner" }],
} as any;

describe("writeIntakeCustomFields skip reasons", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .spyOn(cf, "listCustomFieldDefinitionsQuery")
      .mockResolvedValue([
        { id: 9, field_key: "owner", label: "Owner", field_type: "text", options: null },
      ]);
  });

  const run = () => ctrl.writeIntakeCustomFields("ai_app", { q1: "x" }, schema, 5, 7, tx as any);

  it("maps a missing definition to field_removed", async () => {
    jest
      .spyOn(cf, "setCustomFieldValueQuery")
      .mockRejectedValue(
        new NotFoundException("Custom field definition not found", "custom_field_definition", 9),
      );
    const skips = await run();
    expect(skips.map((s: any) => s.reason)).toEqual(["field_removed"]);
  });

  it("maps any other not found to invalid_value", async () => {
    jest
      .spyOn(cf, "setCustomFieldValueQuery")
      .mockRejectedValue(new NotFoundException("Entity not found", "ai_app", 5));
    const skips = await run();
    expect(skips.map((s: any) => s.reason)).toEqual(["invalid_value"]);
  });

  it("maps a forbidden entity to invalid_value", async () => {
    jest
      .spyOn(cf, "setCustomFieldValueQuery")
      .mockRejectedValue(new ForbiddenException("Target entity not found", "ai_app", "5"));
    const skips = await run();
    expect(skips.map((s: any) => s.reason)).toEqual(["invalid_value"]);
  });
});
