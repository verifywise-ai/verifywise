import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn().mockResolvedValue([]) },
}));
jest.mock("../../utils/reportRun.utils", () => ({
  listRunsQuery: jest.fn(),
  getRunQuery: jest.fn(),
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

import { archiveRun, restoreRun, deleteRun, listRuns, getRun, downloadRun, getRunAnalyses } from "../reportRun.ctrl";
import { getRunQuery, listRunsQuery, setRunArchivedQuery, deleteRunQuery } from "../../utils/reportRun.utils";
import { getFileById } from "../../utils/fileUpload.utils";
import { getRunAnalysesQuery } from "../../utils/reportRunAnalysis.utils";

const mockGetRun = getRunQuery as jest.MockedFunction<typeof getRunQuery>;
const mockGetFile = getFileById as jest.MockedFunction<typeof getFileById>;
const mockGetAnalyses = getRunAnalysesQuery as jest.MockedFunction<typeof getRunAnalysesQuery>;

// req.organizationId is the authed tenant (5). params.id/body carry an
// attacker-supplied value; the handler must scope by the authed org, never trust input.
function createMockReq(params: any = {}): Partial<Request> {
  return { params, query: {}, organizationId: 5, userId: 3 } as Partial<Request>;
}
function createMockRes(): Partial<Response> {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
}

describe("reportRun.ctrl tenant isolation", () => {
  beforeEach(() => jest.clearAllMocks());

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
    mockGetRun.mockResolvedValue({ id: 77, organization_id: 5, file_id: 9, output_filename: "r.pdf", output_mime_type: "application/pdf" } as any);
    mockGetFile.mockResolvedValue({ content: Buffer.from("x") } as any);

    const req = createMockReq({ id: "77" });
    const res = createMockRes();

    await downloadRun(req as Request, res as Response);

    expect(mockGetRun).toHaveBeenCalledWith(77, 5);
    expect(mockGetFile).toHaveBeenCalledWith(9, 5);
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

      expect(mockList).toHaveBeenCalledWith(5, expect.objectContaining({ archived: false }));
    });

    it("passes archived=true through as the boolean true", async () => {
      const req = { ...createMockReq(), query: { archived: "true" } } as any;
      const res = createMockRes() as Response;

      await listRuns(req, res);

      expect(mockList).toHaveBeenCalledWith(5, expect.objectContaining({ archived: true }));
    });

    it("omits archived entirely when the parameter is absent", async () => {
      const req = { ...createMockReq(), query: {} } as any;
      const res = createMockRes() as Response;

      await listRuns(req, res);

      expect(mockList.mock.calls[0][1].archived).toBeUndefined();
    });
  });
});

describe("archiveRun / restoreRun / deleteRun", () => {
  const mockSetArchived = setRunArchivedQuery as jest.MockedFunction<typeof setRunArchivedQuery>;
  const mockDelete = deleteRunQuery as jest.MockedFunction<typeof deleteRunQuery>;

  beforeEach(() => jest.clearAllMocks());

  it("archives with the authed organization and user, never the request body", async () => {
    mockSetArchived.mockResolvedValue({ id: 1, archived_at: "2026-07-28" });
    const req = { params: { id: "1" }, body: { organizationId: 999 }, organizationId: 5, userId: 3 } as any;
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
});
