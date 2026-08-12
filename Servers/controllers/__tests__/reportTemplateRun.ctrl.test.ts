import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../../utils/reportTemplate.utils", () => ({
  getTemplateByIdQuery: jest.fn(),
  getVersionByIdQuery: jest.fn(),
}));
jest.mock("../../services/reporting/reportRunOrchestrator", () => ({
  runScheduledReport: jest.fn(),
}));
jest.mock("../../services/reporting/reportAuthorization", () => ({
  assertReportScopeAllowed: jest.fn(async () => []),
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (d: any) => ({ message: "OK", data: d }),
    202: (d: any) => ({ message: "Accepted", data: d }),
    400: (d: any) => ({ message: "Bad Request", data: d }),
    404: (d: any) => ({ message: "Not Found", data: d }),
    500: (d: any) => ({ message: "Internal Server Error", data: d }),
  },
}));

import { runTemplateNow } from "../reportTemplate.ctrl";
import { getTemplateByIdQuery, getVersionByIdQuery } from "../../utils/reportTemplate.utils";
import { runScheduledReport } from "../../services/reporting/reportRunOrchestrator";
import { assertReportScopeAllowed } from "../../services/reporting/reportAuthorization";

const mockTemplate = getTemplateByIdQuery as jest.MockedFunction<any>;
const mockVersion = getVersionByIdQuery as jest.MockedFunction<any>;
const mockRun = runScheduledReport as jest.MockedFunction<any>;
const mockAuthz = assertReportScopeAllowed as jest.MockedFunction<any>;

function createMockRes(): Partial<Response> {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const body = {
  templateVersionId: 9,
  name: "Q3 risk review",
  scope: "project",
  projectId: 4,
  sectionsConfig: { sections: [{ reportSectionKey: "risks", defaultEnabled: true }] },
  aiBlocksConfig: { executiveSummary: true },
  format: "pdf",
};

describe("runTemplateNow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTemplate.mockResolvedValue({ id: 2, name: "Risk template", organization_id: null });
    mockVersion.mockResolvedValue({ id: 9, template_id: 2 });
    mockRun.mockResolvedValue({ runId: 77, status: "success" });
    mockAuthz.mockResolvedValue([]);
  });

  it("runs the orchestrator with no schedule id and storage forced on, and reports the run id", async () => {
    const req = { params: { id: "2" }, body, organizationId: 5, userId: 3 } as any;
    const res = createMockRes() as Response;

    await runTemplateNow(req, res);

    const [sched, opts] = mockRun.mock.calls[0];
    expect(sched.id).toBeNull();
    expect(sched.organization_id).toBe(5);
    expect(sched.template_id).toBe(2);
    expect(sched.template_version_id).toBe(9);
    expect(sched.delivery_config).toEqual({ saveToStorage: true });
    expect(sched.sections_config).toEqual(body.sectionsConfig);
    expect(sched.project_id).toBe(4);
    expect(opts).toEqual({ triggeredBy: "manual", userId: 3 });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { started: true, runId: 77, status: "success" } }),
    );
  });

  it("sends no project id for an organization-scoped run", async () => {
    const req = {
      params: { id: "2" },
      body: { ...body, scope: "organization", projectId: 4 },
      organizationId: 5,
      userId: 3,
    } as any;

    await runTemplateNow(req, createMockRes() as Response);

    expect(mockRun.mock.calls[0][0].project_id).toBeNull();
  });

  it("returns 200 with the run id when the run only partially succeeds", async () => {
    mockRun.mockResolvedValue({ runId: 78, status: "partial_success" });
    const req = { params: { id: "2" }, body, organizationId: 5, userId: 3 } as any;
    const res = createMockRes() as Response;

    await runTemplateNow(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { started: true, runId: 78, status: "partial_success" } }),
    );
  });

  it("returns 500 with the run id when the run fails", async () => {
    mockRun.mockResolvedValue({ runId: 79, status: "failed", error: "generation failed" });
    const req = { params: { id: "2" }, body, organizationId: 5, userId: 3 } as any;
    const res = createMockRes() as Response;

    await runTemplateNow(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { runId: 79, status: "failed", error: "generation failed" },
      }),
    );
  });

  // project_id is snapshotted into the run and read back by listRunsQuery to
  // decide who may see the report. A value that is not a number would snapshot
  // as "no project" and publish the report to the whole organization, so it is
  // rejected rather than coerced.
  it.each([undefined, null, "", "not-a-number", {}])(
    "400s on a project-scoped run whose projectId is %p",
    async (projectId) => {
      const res = createMockRes() as Response;

      await runTemplateNow(
        { params: { id: "2" }, body: { ...body, projectId }, organizationId: 5, userId: 3 } as any,
        res,
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockRun).not.toHaveBeenCalled();
    },
  );

  it("accepts a numeric-string projectId", async () => {
    const res = createMockRes() as Response;

    await runTemplateNow(
      {
        params: { id: "2" },
        body: { ...body, projectId: "4" },
        organizationId: 5,
        userId: 3,
      } as any,
      res,
    );

    expect(mockRun.mock.calls[0][0].project_id).toBe(4);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("404s when the template does not belong to the organization", async () => {
    mockTemplate.mockResolvedValue(null);
    const res = createMockRes() as Response;

    await runTemplateNow({ params: { id: "2" }, body, organizationId: 5, userId: 3 } as any, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("404s when the version belongs to a different template", async () => {
    mockVersion.mockResolvedValue({ id: 9, template_id: 77 });
    const res = createMockRes() as Response;

    await runTemplateNow({ params: { id: "2" }, body, organizationId: 5, userId: 3 } as any, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("403s when the scope authorization rule refuses, without starting the run", async () => {
    mockAuthz.mockResolvedValueOnce(["organization-scope reports require the Admin role"]);
    const req = { params: { id: "2" }, body, organizationId: 5, userId: 3 } as any;
    const res = createMockRes() as Response;

    await runTemplateNow(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockRun).not.toHaveBeenCalled();
  });
});
