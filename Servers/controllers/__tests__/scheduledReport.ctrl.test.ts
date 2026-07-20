jest.mock("../../services/reporting/scheduledReportService", () => ({
  validateScheduledReportInput: jest.fn(() => []),
  validateTemplateVersionOwnership: jest.fn(async () => []),
}));
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
  it("400s when the template version is not owned by the caller's org", async () => {
    const svc = require("../../services/reporting/scheduledReportService");
    const utils = require("../../utils/scheduledReport.utils");
    svc.validateScheduledReportInput.mockReturnValueOnce([]);
    svc.validateTemplateVersionOwnership.mockResolvedValueOnce([
      "templateVersionId does not exist or is not accessible to this organization",
    ]);
    utils.createScheduledReportQuery.mockClear();

    const res = mockRes();
    await createScheduledReport(
      { organizationId: 42, userId: 9, body: { templateId: 7, templateVersionId: 30 } } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    // The guard must be awaited: an un-awaited Promise reports .length as
    // undefined, which is falsy, so a dropped await would insert the row
    // anyway. Asserting the insert did NOT happen is what catches that.
    expect(utils.createScheduledReportQuery).not.toHaveBeenCalled();
  });
});
