import { runApprovalOverdueSweep, runApprovalOverdueSweepAllOrgs } from "../approvalOverdueSweep";
import {
  getOverdueApprovalStepsQuery,
  markApprovalStepEscalatedQuery,
  OverdueApprovalStepRow,
} from "../../../../utils/approvalRequest.utils";
import { notifyApprovalStepOverdueEscalation } from "../../../inAppNotification.service";
import { getAllOrganizationsQuery } from "../../../../utils/organization.utils";
import logger from "../../../../utils/logger/fileLogger";

jest.mock("../../../../utils/approvalRequest.utils", () => ({
  getOverdueApprovalStepsQuery: jest.fn(),
  markApprovalStepEscalatedQuery: jest.fn(),
}));
jest.mock("../../../inAppNotification.service", () => ({
  notifyApprovalStepOverdueEscalation: jest.fn(),
}));
jest.mock("../../../../utils/organization.utils", () => ({
  getAllOrganizationsQuery: jest.fn(),
}));
jest.mock("../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
  logStructured: jest.fn(),
}));

const mockOverdue = getOverdueApprovalStepsQuery as jest.Mock;
const mockClaim = markApprovalStepEscalatedQuery as jest.Mock;
const mockNotify = notifyApprovalStepOverdueEscalation as jest.Mock;
const mockOrgs = getAllOrganizationsQuery as jest.Mock;
const mockLogger = logger as unknown as { info: jest.Mock; error: jest.Mock };

const BASE_URL = process.env.FRONTEND_URL || "http://localhost:3000";

const overdueRow = (overrides: Partial<OverdueApprovalStepRow> = {}): OverdueApprovalStepRow => ({
  request_step_id: 101,
  request_id: 11,
  step_number: 1,
  step_name: "Legal review",
  due_at: new Date(Date.now() - 3600000),
  escalation_user_id: 7,
  request_name: "Use Case: Lending",
  entity_type: "use_case",
  entity_id: 55,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockOverdue.mockResolvedValue([]);
  mockClaim.mockResolvedValue(true);
  mockNotify.mockResolvedValue(undefined);
});

describe("runApprovalOverdueSweep", () => {
  it("claims an overdue step and notifies its escalation user", async () => {
    const row = overdueRow();
    mockOverdue.mockResolvedValue([row]);

    const summary = await runApprovalOverdueSweep(1);

    expect(mockClaim).toHaveBeenCalledWith(1, 101);
    expect(mockNotify).toHaveBeenCalledWith(
      1,
      7,
      {
        id: 11,
        name: "Use Case: Lending",
        stepName: "Legal review",
        stepNumber: 1,
        dueAt: row.due_at,
      },
      BASE_URL,
    );
    expect(summary).toEqual({ scanned: 1, escalated: 1 });
  });

  it("does not notify when the claim is lost — idempotent under retries and concurrency", async () => {
    mockOverdue.mockResolvedValue([overdueRow()]);
    mockClaim.mockResolvedValue(false); // escalated_at already set by another run

    const summary = await runApprovalOverdueSweep(1);

    expect(mockNotify).not.toHaveBeenCalled();
    expect(summary).toEqual({ scanned: 1, escalated: 0 });
  });

  it("a failed row never aborts the run — later rows are still processed", async () => {
    const failing = overdueRow({ request_step_id: 101 });
    const healthy = overdueRow({ request_step_id: 102, request_id: 12 });
    mockOverdue.mockResolvedValue([failing, healthy]);
    mockNotify.mockRejectedValueOnce(new Error("email down")).mockResolvedValueOnce(undefined);

    const summary = await runApprovalOverdueSweep(1);

    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledTimes(2);
    expect(summary).toEqual({ scanned: 2, escalated: 1 });
  });

  it("does nothing when no steps are overdue", async () => {
    const summary = await runApprovalOverdueSweep(1);

    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
    expect(summary).toEqual({ scanned: 0, escalated: 0 });
  });
});

describe("runApprovalOverdueSweepAllOrgs", () => {
  it("isolates orgs — one org's failure does not block the others", async () => {
    mockOrgs.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    mockOverdue.mockRejectedValueOnce(new Error("db down")).mockResolvedValueOnce([overdueRow()]);

    await runApprovalOverdueSweepAllOrgs();

    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it("skips orgs without an id", async () => {
    mockOrgs.mockResolvedValue([{ id: null }, { id: 3 }]);

    await runApprovalOverdueSweepAllOrgs();

    expect(mockOverdue).toHaveBeenCalledTimes(1);
    expect(mockOverdue).toHaveBeenCalledWith(3);
  });
});
