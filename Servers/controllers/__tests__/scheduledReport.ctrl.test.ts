jest.mock("../../services/reporting/scheduledReportService", () => ({ validateScheduledReportInput: jest.fn(() => []) }));
jest.mock("../../utils/scheduledReport.utils", () => ({ createScheduledReportQuery: jest.fn(async () => ({ id: 1 })), listScheduledReportsQuery: jest.fn(async () => []) }));
import { createScheduledReport } from "../scheduledReport.ctrl";

function mockRes() { const r: any = {}; r.status = jest.fn(() => r); r.json = jest.fn(() => r); return r; }

describe("createScheduledReport", () => {
  it("400 when validation fails", async () => {
    const svc = require("../../services/reporting/scheduledReportService");
    svc.validateScheduledReportInput.mockReturnValueOnce(["at least one section is required"]);
    const res = mockRes();
    await createScheduledReport({ body: {}, organizationId: 1, userId: 2 } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it("201 on success", async () => {
    const res = mockRes();
    await createScheduledReport({ body: { scope: "project", projectId: 5 }, organizationId: 1, userId: 2 } as any, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
