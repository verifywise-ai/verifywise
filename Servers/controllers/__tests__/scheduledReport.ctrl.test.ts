jest.mock("../../services/reporting/scheduledReportService", () => ({
  validateScheduledReportInput: jest.fn(() => []),
  validateTemplateVersionOwnership: jest.fn(async () => []),
}));
jest.mock("../../utils/scheduledReport.utils", () => ({
  createScheduledReportQuery: jest.fn(async () => ({ id: 1 })),
  listScheduledReportsQuery: jest.fn(async () => []),
  updateScheduledReportQuery: jest.fn(),
  UPDATABLE_FIELDS: jest.requireActual("../../utils/scheduledReport.utils").UPDATABLE_FIELDS,
}));
import { createScheduledReport, updateScheduledReport } from "../scheduledReport.ctrl";

function mockRes() {
  const r: any = {};
  r.status = jest.fn(() => r);
  r.json = jest.fn(() => r);
  return r;
}

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
    await createScheduledReport(
      { body: { scope: "project", projectId: 5 }, organizationId: 1, userId: 2 } as any,
      res,
    );
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

describe("updateScheduledReport", () => {
  it("404s when the row is not in the caller's org", async () => {
    const utils = require("../../utils/scheduledReport.utils");
    utils.updateScheduledReportQuery.mockResolvedValueOnce(null);
    const res = mockRes();
    await updateScheduledReport(
      { params: { id: "7" }, body: { name: "Renamed" }, organizationId: 42, userId: 9 } as any,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("200s and passes only allowlisted fields", async () => {
    const utils = require("../../utils/scheduledReport.utils");
    // Without the clear, calls[0] is the previous test's call — whose body has
    // no organization_id, so the allowlist assertions below pass vacuously.
    utils.updateScheduledReportQuery.mockClear();
    utils.updateScheduledReportQuery.mockResolvedValueOnce({ id: 7 });
    const res = mockRes();
    await updateScheduledReport(
      {
        params: { id: "7" },
        body: { name: "Renamed", organization_id: 999, template_id: 123 },
        organizationId: 42,
        userId: 9,
      } as any,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    const [id, org, input] = utils.updateScheduledReportQuery.mock.calls[0];
    expect(id).toBe(7);
    expect(org).toBe(42);
    // Tenancy and identity columns are never client-writable.
    expect(input).not.toHaveProperty("organization_id");
    expect(input).not.toHaveProperty("template_id");
  });

  it("400s on an empty body", async () => {
    const res = mockRes();
    await updateScheduledReport(
      { params: { id: "7" }, body: {}, organizationId: 42, userId: 9 } as any,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // PATCH is the third write path into framework_ids. An unrecognised entry is
  // dropped by parseFrameworkSelection, and an empty selection means EVERY
  // framework in scope — so an ungated typo silently widens the schedule.
  it("400s on an unrecognised framework selection and does not update the row", async () => {
    const utils = require("../../utils/scheduledReport.utils");
    utils.updateScheduledReportQuery.mockClear();
    const res = mockRes();
    await updateScheduledReport(
      {
        params: { id: "7" },
        // `name` is here so the 400 cannot be the "no updatable fields
        // supplied" branch — that branch would make this test pass even if the
        // guard were absent.
        body: { name: "Renamed", frameworkIds: ["native:2", "iso42001"] },
        organizationId: 42,
        userId: 9,
      } as any,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    // Assert on the payload, so the 400 is provably this guard's and not
    // another branch's.
    expect(JSON.stringify(res.json.mock.calls[0][0])).toContain("iso42001");
    expect(utils.updateScheduledReportQuery).not.toHaveBeenCalled();
  });

  it("400s when frameworkIds is not an array and does not update the row", async () => {
    const utils = require("../../utils/scheduledReport.utils");
    utils.updateScheduledReportQuery.mockClear();
    const res = mockRes();
    await updateScheduledReport(
      {
        params: { id: "7" },
        // A single id sent unwrapped: parseFrameworkSelection returns no
        // `invalid` entries for a non-array, so this needs its own guard.
        body: { name: "Renamed", frameworkIds: "native:2" },
        organizationId: 42,
        userId: 9,
      } as any,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(JSON.stringify(res.json.mock.calls[0][0])).toContain("must be an array");
    expect(utils.updateScheduledReportQuery).not.toHaveBeenCalled();
  });

  it("200s on a valid framework selection", async () => {
    const utils = require("../../utils/scheduledReport.utils");
    utils.updateScheduledReportQuery.mockClear();
    utils.updateScheduledReportQuery.mockResolvedValueOnce({ id: 7 });
    const res = mockRes();
    await updateScheduledReport(
      {
        params: { id: "7" },
        body: { frameworkIds: ["native:2", "plugin:soc2"] },
        organizationId: 42,
        userId: 9,
      } as any,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(utils.updateScheduledReportQuery.mock.calls[0][2]).toEqual({
      frameworkIds: ["native:2", "plugin:soc2"],
    });
  });

  it("400s when the new delivery config has a malformed recipient", async () => {
    const svc = require("../../services/reporting/scheduledReportService");
    svc.validateScheduledReportInput.mockReturnValueOnce(["invalid recipient address: nope"]);
    const res = mockRes();
    await updateScheduledReport(
      {
        params: { id: "7" },
        body: { deliveryConfig: { sendEmailLink: true, recipients: ["nope"] } },
        organizationId: 42,
        userId: 9,
      } as any,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
