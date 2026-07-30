import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn().mockResolvedValue([]) },
}));
jest.mock("../../utils/reportRun.utils", () => ({
  listRunsQuery: jest.fn(),
  getRunQuery: jest.fn(),
  canViewRunQuery: jest.fn(),
  setRunArchivedQuery: jest.fn(),
  deleteRunQuery: jest.fn(),
}));
jest.mock("../../utils/fileUpload.utils", () => ({ getFileById: jest.fn() }));
jest.mock("../../utils/reportRunAnalysis.utils", () => ({
  getRunAnalysesQuery: jest.fn(),
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (d: any) => ({ message: "OK", data: d }),
    404: (d: any) => ({ message: "Not Found", data: d }),
    500: (d: any) => ({ message: "Internal Server Error", data: d }),
  },
}));

import {
  archiveRun,
  restoreRun,
  deleteRun,
  listRuns,
  getRun,
  downloadRun,
  getRunAnalyses,
} from "../reportRun.ctrl";
import {
  getRunQuery,
  canViewRunQuery,
  listRunsQuery,
  setRunArchivedQuery,
  deleteRunQuery,
} from "../../utils/reportRun.utils";
import { getFileById } from "../../utils/fileUpload.utils";
import { getRunAnalysesQuery } from "../../utils/reportRunAnalysis.utils";

const mockGetRun = getRunQuery as jest.MockedFunction<typeof getRunQuery>;
const mockCanView = canViewRunQuery as jest.MockedFunction<typeof canViewRunQuery>;
const mockGetFile = getFileById as jest.MockedFunction<typeof getFileById>;
const mockGetAnalyses = getRunAnalysesQuery as jest.MockedFunction<typeof getRunAnalysesQuery>;

// req.organizationId is the authed tenant (5). params.id/body carry an
// attacker-supplied value; the handler must scope by the authed org, never trust input.
function createMockReq(params: any = {}, role?: string): Partial<Request> {
  return {
    params,
    query: {},
    organizationId: 5,
    userId: 3,
    ...(role ? { role } : {}),
  } as Partial<Request>;
}
function createMockRes(): Partial<Response> {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  // downloadRun writes the file buffer with res.end, like the file-manager
  // download path, so the body never goes through res.send.
  res.end = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
}

describe("reportRun.ctrl tenant isolation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Visible by default; the visibility tests below override this.
    mockCanView.mockResolvedValue(true);
  });

  it("getRun returns 404 and leaks no data when the run is not in the caller's org", async () => {
    mockGetRun.mockResolvedValue(null as any); // run belongs to another org / absent

    const req = createMockReq({ id: "77" });
    const res = createMockRes();

    await getRun(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
    // No run body handed back.
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Not Found" }));
  });

  it("getRun scopes the lookup by the authed organizationId, not a client value", async () => {
    mockGetRun.mockResolvedValue({ id: 77, organization_id: 5 } as any);

    const req = createMockReq({ id: "77" });
    const res = createMockRes();

    await getRun(req as Request, res as Response);

    expect(mockGetRun).toHaveBeenCalledWith(77, 5);
  });

  it("downloadRun returns 404 and never fetches a file when the run is not in the caller's org", async () => {
    mockGetRun.mockResolvedValue(null as any);

    const req = createMockReq({ id: "77" });
    const res = createMockRes();

    await downloadRun(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockGetFile).not.toHaveBeenCalled();
  });

  it("downloadRun scopes both the run and the file fetch by the authed organizationId", async () => {
    mockGetRun.mockResolvedValue({
      id: 77,
      organization_id: 5,
      file_id: 9,
      output_filename: "r.pdf",
      output_mime_type: "application/pdf",
    } as any);
    mockGetFile.mockResolvedValue({ content: Buffer.from("x") } as any);

    const req = createMockReq({ id: "77" });
    const res = createMockRes();

    await downloadRun(req as Request, res as Response);

    expect(mockGetRun).toHaveBeenCalledWith(77, 5);
    expect(mockGetFile).toHaveBeenCalledWith(9, 5);
  });

  it("downloadRun keeps a hostile output_filename out of the Content-Disposition header", async () => {
    // output_filename is written by the generator, but it is derived from
    // template and project names, so a quote would close the header's quoted
    // string early and a CRLF would start a header of the attacker's choosing.
    mockGetRun.mockResolvedValue({
      id: 77,
      organization_id: 5,
      file_id: 9,
      output_filename: 'evil".pdf\r\nX-Injected: yes\r\n\r\n<script>ünïcode',
      output_mime_type: "application/pdf",
    } as any);
    mockGetFile.mockResolvedValue({ content: Buffer.from("x") } as any);

    const res = createMockRes();
    await downloadRun(createMockReq({ id: "77" }) as Request, res as Response);

    const disposition = (res.setHeader as jest.Mock).mock.calls.find(
      (c) => c[0] === "Content-Disposition",
    )![1] as string;

    expect(disposition).not.toMatch(/[\r\n]/);
    // One opening and one closing quote, both ours.
    expect(disposition.match(/"/g)).toHaveLength(2);
    // Quotes and CRLF are dropped, non-ASCII collapses to underscores, so the
    // hostile parts survive only as inert text inside our own quoted string.
    expect(disposition).toBe('attachment; filename="evil.pdfX-Injected: yes<script>_n_code"');
    expect(res.setHeader).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff");
  });

  it("downloadRun falls back to a run-derived filename when output_filename is null", async () => {
    mockGetRun.mockResolvedValue({
      id: 77,
      organization_id: 5,
      file_id: 9,
      output_filename: null,
      output_mime_type: null,
    } as any);
    mockGetFile.mockResolvedValue({ content: Buffer.from("x") } as any);

    const res = createMockRes();
    await downloadRun(createMockReq({ id: "77" }) as Request, res as Response);

    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      'attachment; filename="report-77"',
    );
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/octet-stream");
  });

  it("getRunAnalyses returns 404 and never queries analyses when the run is not in the caller's org", async () => {
    mockGetRun.mockResolvedValue(null as any);

    const req = createMockReq({ id: "77" });
    const res = createMockRes();

    await getRunAnalyses(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockGetAnalyses).not.toHaveBeenCalled();
  });

  it("getRunAnalyses scopes both the run and the analyses by the authed organizationId", async () => {
    mockGetRun.mockResolvedValue({ id: 77, organization_id: 5 } as any);
    mockGetAnalyses.mockResolvedValue([
      { section_key: "executiveSummary", payload: { summary: "x" } },
    ] as any);

    const req = createMockReq({ id: "77" });
    const res = createMockRes();

    await getRunAnalyses(req as Request, res as Response);

    expect(mockGetRun).toHaveBeenCalledWith(77, 5);
    expect(mockGetAnalyses).toHaveBeenCalledWith(77, 5);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("getRunAnalyses returns an empty array for a run with no analyses", async () => {
    mockGetRun.mockResolvedValue({ id: 77, organization_id: 5 } as any);
    mockGetAnalyses.mockResolvedValue([] as any);

    const req = createMockReq({ id: "77" });
    const res = createMockRes();

    await getRunAnalyses(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [] }));
  });

  it("listRuns passes limit and offset through to the query", async () => {
    (listRunsQuery as jest.Mock).mockResolvedValue({ rows: [], total: 0 } as never);

    const req = { query: { limit: "25", offset: "50" }, organizationId: 5 } as any;
    const res = createMockRes();
    await listRuns(req, res as Response);

    const [org, opts] = (listRunsQuery as jest.Mock).mock.calls[0] as any[];
    expect(org).toBe(5);
    expect(opts.limit).toBe(25);
    expect(opts.offset).toBe(50);
  });

  it("listRuns clamps an absurd limit rather than trusting the client", async () => {
    (listRunsQuery as jest.Mock).mockResolvedValue({ rows: [], total: 0 } as never);

    const req = { query: { limit: "100000" }, organizationId: 5 } as any;
    const res = createMockRes();
    await listRuns(req, res as Response);

    expect(((listRunsQuery as jest.Mock).mock.calls[0] as any[])[1].limit).toBe(200);
  });

  it("listRuns defaults to the pre-pagination behaviour when given nothing", async () => {
    (listRunsQuery as jest.Mock).mockResolvedValue({ rows: [], total: 0 } as never);

    const req = { query: {}, organizationId: 5 } as any;
    const res = createMockRes();
    await listRuns(req, res as Response);

    const opts = ((listRunsQuery as jest.Mock).mock.calls[0] as any[])[1];
    expect(opts.limit).toBe(200);
    expect(opts.offset).toBe(0);
  });

  describe("listRuns archived query parameter", () => {
    const mockList = listRunsQuery as jest.MockedFunction<typeof listRunsQuery>;

    beforeEach(() => {
      jest.clearAllMocks();
      mockList.mockResolvedValue({ rows: [], total: 0 });
    });

    it("passes archived=false through as the boolean false", async () => {
      const req = { ...createMockReq(), query: { archived: "false" } } as any;
      const res = createMockRes() as Response;

      await listRuns(req, res);

      expect(mockList).toHaveBeenCalledWith(
        5,
        expect.objectContaining({ archived: false }),
        expect.anything(),
      );
    });

    it("passes archived=true through as the boolean true", async () => {
      const req = { ...createMockReq(), query: { archived: "true" } } as any;
      const res = createMockRes() as Response;

      await listRuns(req, res);

      expect(mockList).toHaveBeenCalledWith(
        5,
        expect.objectContaining({ archived: true }),
        expect.anything(),
      );
    });

    it("omits archived entirely when the parameter is absent", async () => {
      const req = { ...createMockReq(), query: {} } as any;
      const res = createMockRes() as Response;

      await listRuns(req, res);

      expect(mockList.mock.calls[0][1].archived).toBeUndefined();
    });
  });

  // The list is narrowed by project membership for non-Admins (listRunsQuery).
  // The controller's job is to hand it the authed viewer — an auditor whose
  // role never reached the query would be listed everything in the org.
  describe("listRuns viewer", () => {
    const mockList = listRunsQuery as jest.MockedFunction<typeof listRunsQuery>;

    beforeEach(() => {
      jest.clearAllMocks();
      mockList.mockResolvedValue({ rows: [], total: 0 });
    });

    it("passes the authed user id and role, not anything from the request body", async () => {
      const req = {
        params: {},
        query: {},
        body: { userId: 999, role: "Admin" },
        organizationId: 5,
        userId: 3,
        role: "Auditor",
      } as any;

      await listRuns(req, createMockRes() as Response);

      expect(mockList.mock.calls[0][2]).toEqual({ userId: 3, role: "Auditor" });
    });

    it("passes nulls rather than undefined when the request carries no identity", async () => {
      const req = { params: {}, query: {}, organizationId: 5 } as any;

      await listRuns(req, createMockRes() as Response);

      // null is the fail-closed value: it matches no project owner and no
      // membership row, so the caller sees organization-scoped runs only.
      expect(mockList.mock.calls[0][2]).toEqual({ userId: null, role: null });
    });
  });
});

// One rule for runs, applied everywhere: if a run does not appear in your list,
// you cannot fetch, download or read the analyses of it either. Run ids are
// sequential integers, so an org-scoped-only per-run endpoint let any member of
// the organization enumerate ids and read every project's report.
describe("per-run visibility gate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanView.mockResolvedValue(true);
  });

  describe("a non-member is refused, and nothing behind the gate is touched", () => {
    beforeEach(() => mockCanView.mockResolvedValue(false));

    it("getRun 404s without reading the run row", async () => {
      const res = createMockRes();
      await getRun(createMockReq({ id: "77" }, "Auditor") as Request, res as Response);

      // 404, not 403: the rest of this controller hides other-tenant rows the
      // same way, and a 403 would confirm the id exists.
      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockGetRun).not.toHaveBeenCalled();
    });

    it("downloadRun 404s without reading the run row or the file", async () => {
      const res = createMockRes();
      await downloadRun(createMockReq({ id: "77" }, "Auditor") as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockGetRun).not.toHaveBeenCalled();
      expect(mockGetFile).not.toHaveBeenCalled();
      // Both write paths: res.end is the one downloadRun uses for the body, and
      // asserting only on res.send would pass whether or not a body was served.
      expect(res.end).not.toHaveBeenCalled();
      expect(res.send).not.toHaveBeenCalled();
    });

    it("getRunAnalyses 404s without reading the run row or the analyses", async () => {
      const res = createMockRes();
      await getRunAnalyses(createMockReq({ id: "77" }, "Auditor") as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockGetRun).not.toHaveBeenCalled();
      expect(mockGetAnalyses).not.toHaveBeenCalled();
    });
  });

  it("gates on the authed viewer, never on a value from the body or query", async () => {
    const req = {
      params: { id: "77" },
      query: { userId: 999, role: "Admin" },
      body: { userId: 999, role: "Admin" },
      organizationId: 5,
      userId: 3,
      role: "Auditor",
    } as any;
    mockGetRun.mockResolvedValue({ id: 77, organization_id: 5 } as any);

    await getRun(req, createMockRes() as Response);

    expect(mockCanView).toHaveBeenCalledWith(77, 5, { userId: 3, role: "Auditor" });
  });

  it("passes nulls rather than undefined when the request carries no identity", async () => {
    mockGetRun.mockResolvedValue({ id: 77, organization_id: 5 } as any);
    const req = { params: { id: "77" }, query: {}, organizationId: 5 } as any;

    await getRun(req, createMockRes() as Response);

    expect(mockCanView).toHaveBeenCalledWith(77, 5, { userId: null, role: null });
  });

  it.each([
    ["an Admin", "Admin"],
    ["a project member", "Editor"],
  ])("still serves %s the run, the download and the analyses", async (_label, role) => {
    mockGetRun.mockResolvedValue({
      id: 77,
      organization_id: 5,
      file_id: 9,
      output_filename: "r.pdf",
      output_mime_type: "application/pdf",
    } as any);
    mockGetFile.mockResolvedValue({ content: Buffer.from("x") } as any);
    mockGetAnalyses.mockResolvedValue([] as any);

    const getRes = createMockRes();
    await getRun(createMockReq({ id: "77" }, role) as Request, getRes as Response);
    expect(getRes.status).toHaveBeenCalledWith(200);

    const downloadRes = createMockRes();
    await downloadRun(createMockReq({ id: "77" }, role) as Request, downloadRes as Response);
    expect(downloadRes.end).toHaveBeenCalledWith(Buffer.from("x"));
    expect(mockGetFile).toHaveBeenCalledWith(9, 5);

    const analysesRes = createMockRes();
    await getRunAnalyses(createMockReq({ id: "77" }, role) as Request, analysesRes as Response);
    expect(analysesRes.status).toHaveBeenCalledWith(200);
  });
});

describe("archiveRun / restoreRun / deleteRun", () => {
  const mockSetArchived = setRunArchivedQuery as jest.MockedFunction<typeof setRunArchivedQuery>;
  const mockDelete = deleteRunQuery as jest.MockedFunction<typeof deleteRunQuery>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCanView.mockResolvedValue(true);
  });

  it("archives with the authed organization and user, never the request body", async () => {
    mockSetArchived.mockResolvedValue({ id: 1, archived_at: "2026-07-28" });
    const req = {
      params: { id: "1" },
      body: { organizationId: 999 },
      organizationId: 5,
      userId: 3,
    } as any;
    const res = createMockRes() as Response;

    await archiveRun(req, res);

    expect(mockSetArchived).toHaveBeenCalledWith(1, 5, true, 3);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("restores with archived false", async () => {
    mockSetArchived.mockResolvedValue({ id: 1, archived_at: null });
    const res = createMockRes() as Response;

    await restoreRun(createMockReq({ id: "1" }) as Request, res);

    expect(mockSetArchived).toHaveBeenCalledWith(1, 5, false, 3);
  });

  it("404s when the run belongs to another organization", async () => {
    mockSetArchived.mockResolvedValue(null);
    const res = createMockRes() as Response;

    await archiveRun(createMockReq({ id: "1" }) as Request, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("404s on delete when nothing matched", async () => {
    mockDelete.mockResolvedValue(false);
    const res = createMockRes() as Response;

    await deleteRun(createMockReq({ id: "1" }) as Request, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("deletes org-scoped and returns 200", async () => {
    mockDelete.mockResolvedValue(true);
    const res = createMockRes() as Response;

    await deleteRun(createMockReq({ id: "1" }) as Request, res);

    expect(mockDelete).toHaveBeenCalledWith(1, 5);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // These are Admin/Editor by route middleware, but an Editor is not
  // necessarily a member of the project a run covers.
  describe("visibility gate", () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockCanView.mockResolvedValue(false);
    });

    it("archiveRun 404s for a non-member and leaves the row alone", async () => {
      const res = createMockRes() as Response;
      await archiveRun(createMockReq({ id: "1" }, "Editor") as Request, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockSetArchived).not.toHaveBeenCalled();
    });

    it("restoreRun 404s for a non-member and leaves the row alone", async () => {
      const res = createMockRes() as Response;
      await restoreRun(createMockReq({ id: "1" }, "Editor") as Request, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockSetArchived).not.toHaveBeenCalled();
    });

    it("deleteRun 404s for a non-member and deletes nothing", async () => {
      const res = createMockRes() as Response;
      await deleteRun(createMockReq({ id: "1" }, "Editor") as Request, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it("still lets an Admin archive", async () => {
      mockCanView.mockResolvedValue(true);
      mockSetArchived.mockResolvedValue({ id: 1, archived_at: "2026-07-28" });
      const res = createMockRes() as Response;

      await archiveRun(createMockReq({ id: "1" }, "Admin") as Request, res);

      expect(mockCanView).toHaveBeenCalledWith(1, 5, { userId: 3, role: "Admin" });
      expect(mockSetArchived).toHaveBeenCalledWith(1, 5, true, 3);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
