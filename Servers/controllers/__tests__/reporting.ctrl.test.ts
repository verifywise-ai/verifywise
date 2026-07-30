import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn().mockResolvedValue([]) },
}));
// Prevent loading the real reporting engine (Playwright/docx) at import time.
jest.mock("../../services/reporting", () => ({ generateReport: jest.fn() }));
jest.mock("../../utils/reportRun.utils", () => ({
  createRunQuery: jest.fn(),
  updateRunStatusQuery: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));
jest.mock("../../utils/user.utils", () => ({ getUserByIdQuery: jest.fn() }));
jest.mock("../../utils/organization.utils", () => ({ getOrganizationByIdQuery: jest.fn() }));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(),
  logFailure: jest.fn(),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_r, e) => (e as Error).message),
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    202: (d: any) => ({ message: "Accepted", data: d }),
    404: (d: any) => ({ message: "Not Found", data: d }),
    500: (d: any) => ({ message: "Internal Server Error", data: d }),
  },
}));

import { generateReportsV2 } from "../reporting.ctrl";
import { createRunQuery, updateRunStatusQuery } from "../../utils/reportRun.utils";
import { enqueueAutomationAction } from "../../services/automations/automationProducer";
import { getUserByIdQuery } from "../../utils/user.utils";
import { getOrganizationByIdQuery } from "../../utils/organization.utils";
import { logSuccess } from "../../utils/logger/logHelper";

const mockCreateRun = createRunQuery as jest.MockedFunction<typeof createRunQuery>;
const mockUpdate = updateRunStatusQuery as jest.MockedFunction<typeof updateRunStatusQuery>;
const mockEnqueue = enqueueAutomationAction as jest.MockedFunction<typeof enqueueAutomationAction>;
const mockUser = getUserByIdQuery as jest.MockedFunction<typeof getUserByIdQuery>;
const mockOrg = getOrganizationByIdQuery as jest.MockedFunction<typeof getOrganizationByIdQuery>;
const mockLogSuccess = logSuccess as jest.MockedFunction<typeof logSuccess>;

function createMockReq(body: any = {}): Partial<Request> {
  return { body, organizationId: 5, userId: 3, t: (k: string) => k } as Partial<Request>;
}
function createMockRes(): Partial<Response> {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

describe("generateReportsV2 (async)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates a run, enqueues a job, and returns 202 with the run id", async () => {
    mockUser.mockResolvedValue({ id: 3, organization_id: 5 } as any);
    mockOrg.mockResolvedValue({ name: "Acme" } as any);
    mockCreateRun.mockResolvedValue({ id: 77 } as any);

    const req = createMockReq({
      projectId: "7",
      frameworkId: "1",
      projectFrameworkId: "2",
      reportType: "project",
      format: "pdf",
    });
    const res = createMockRes();

    await generateReportsV2(req as Request, res as Response);

    expect(mockCreateRun).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 5,
        triggered_by: "manual",
        triggered_by_user_id: 3,
      }),
    );
    expect(mockEnqueue).toHaveBeenCalledWith(
      "generate_report_manual",
      expect.objectContaining({ runId: 77, userId: 3, organizationId: 5 }),
    );
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { runId: 77 } }));
  });

  it("returns 404 when the user does not exist", async () => {
    mockUser.mockResolvedValue(null as any);
    const req = createMockReq({
      projectId: "7",
      frameworkId: "1",
      projectFrameworkId: "2",
      reportType: "project",
    });
    const res = createMockRes();

    await generateReportsV2(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("marks the run failed and returns 500 when enqueue throws", async () => {
    mockUser.mockResolvedValue({ id: 3, organization_id: 5 } as any);
    mockOrg.mockResolvedValue({ name: "Acme" } as any);
    mockCreateRun.mockResolvedValue({ id: 77 } as any);
    mockEnqueue.mockRejectedValue(new Error("redis down"));

    const req = createMockReq({
      projectId: "7",
      frameworkId: "1",
      projectFrameworkId: "2",
      reportType: "project",
      format: "pdf",
    });
    const res = createMockRes();

    await generateReportsV2(req as Request, res as Response);

    expect(mockUpdate).toHaveBeenCalledWith(77, 5, expect.objectContaining({ status: "failed" }));
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("leaves the run untouched when a post-enqueue step throws (worker owns it)", async () => {
    mockUser.mockResolvedValue({ id: 3, organization_id: 5 } as any);
    mockOrg.mockResolvedValue({ name: "Acme" } as any);
    mockCreateRun.mockResolvedValue({ id: 77 } as any);
    // enqueue succeeds; logSuccess (after enqueue) throws.
    // (clearAllMocks resets calls, not implementations — override the prior test's rejection.)
    mockEnqueue.mockResolvedValue(undefined as any);
    mockLogSuccess.mockRejectedValue(new Error("log sink down") as never);

    const req = createMockReq({
      projectId: "7",
      frameworkId: "1",
      projectFrameworkId: "2",
      reportType: "project",
      format: "pdf",
    });
    const res = createMockRes();

    await generateReportsV2(req as Request, res as Response);

    expect(mockEnqueue).toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
