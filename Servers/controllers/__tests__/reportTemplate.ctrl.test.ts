jest.mock("../../utils/reportTemplate.utils", () => ({
  getTemplatesQuery: jest.fn(),
  getTemplateByIdQuery: jest.fn(),
  getLatestVersionQuery: jest.fn(),
  createTemplateQuery: jest.fn(),
  updateTemplateQuery: jest.fn(),
  archiveTemplateQuery: jest.fn(),
  createTemplateVersionQuery: jest.fn(),
  getVersionByIdQuery: jest.fn(),
}));
jest.mock("../../services/reporting/reportRunOrchestrator", () => ({
  runScheduledReport: jest.fn(),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(),
  logFailure: jest.fn(),
}));
// createTemplate wraps both INSERTs in a transaction. The mock runs the
// callback immediately with a sentinel so the handler's logic is exercised
// without a database.
jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn(async (cb: any) => cb("TX")),
    query: jest.fn(),
  },
}));

import {
  createTemplate,
  updateTemplate,
  archiveTemplate,
  listSections,
  runTemplateNow,
} from "../reportTemplate.ctrl";
import {
  createTemplateQuery,
  updateTemplateQuery,
  archiveTemplateQuery,
  createTemplateVersionQuery,
  getTemplateByIdQuery,
  getVersionByIdQuery,
} from "../../utils/reportTemplate.utils";
import { runScheduledReport } from "../../services/reporting/reportRunOrchestrator";
import { ValidationException } from "../../domain.layer/exceptions/custom.exception";

function mockRes() {
  const r: any = {};
  r.status = jest.fn(() => r);
  r.json = jest.fn(() => r);
  return r;
}
const mockReq = (over: any = {}) => ({
  organizationId: 42,
  userId: 9,
  params: {},
  body: {},
  t: (s: string) => s,
  ...over,
});

beforeEach(() => jest.clearAllMocks());

describe("createTemplate", () => {
  it("201s and persists an initial version when config is supplied", async () => {
    (createTemplateQuery as jest.Mock).mockResolvedValue({ id: 7, name: "Board pack" });
    (createTemplateVersionQuery as jest.Mock).mockResolvedValue({ id: 30, version: 1 });
    const res = mockRes();
    await createTemplate(
      mockReq({
        body: {
          name: "Board pack",
          category: "governance",
          default_scope: "organization",
          sections_config: { sections: [] },
        },
      }) as any,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(201);
    // Both writes must receive the same transaction handle, or the rollback
    // guarantee this test exists to protect is not actually in place.
    expect(createTemplateQuery).toHaveBeenCalledWith(expect.any(Object), 42, 9, "TX");
    expect(createTemplateVersionQuery).toHaveBeenCalledWith(7, 42, expect.any(Object), 9, "TX");
  });

  it("maps a ValidationException to 400, not 500", async () => {
    (createTemplateQuery as jest.Mock).mockRejectedValue(
      new ValidationException("name is required", "name", undefined),
    );
    const res = mockRes();
    await createTemplate(mockReq({ body: {} }) as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("maps a unique-violation to 409", async () => {
    const dup: any = new Error("duplicate key value violates unique constraint");
    dup.parent = { code: "23505" };
    (createTemplateQuery as jest.Mock).mockRejectedValue(dup);
    const res = mockRes();
    await createTemplate(
      mockReq({
        body: { name: "Board pack", category: "governance", default_scope: "project" },
      }) as any,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(409);
  });
});

describe("updateTemplate", () => {
  it("404s when the row does not match the org (or is a system template)", async () => {
    (updateTemplateQuery as jest.Mock).mockResolvedValue(null);
    const res = mockRes();
    await updateTemplate(mockReq({ params: { id: "1" }, body: { name: "x" } }) as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("appends a new version when config fields change", async () => {
    (updateTemplateQuery as jest.Mock).mockResolvedValue({ id: 7 });
    (createTemplateVersionQuery as jest.Mock).mockResolvedValue({ id: 31, version: 2 });
    const res = mockRes();
    await updateTemplate(
      mockReq({
        params: { id: "7" },
        body: { ai_blocks_config: { executiveSummary: true } },
      }) as any,
      res,
    );
    expect(createTemplateVersionQuery).toHaveBeenCalledWith(7, 42, expect.any(Object), 9, "TX");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("runs the metadata update and the version insert on the SAME transaction", async () => {
    // These mocks are shared across the whole file; without an explicit clear
    // an earlier test's call satisfies the mock.calls[0] assertions below and
    // this test passes for the wrong reason.
    (updateTemplateQuery as jest.Mock).mockClear();
    (createTemplateVersionQuery as jest.Mock).mockClear();
    (updateTemplateQuery as jest.Mock).mockResolvedValue({ id: 7 });
    (createTemplateVersionQuery as jest.Mock).mockResolvedValue({ id: 31, version: 2 });
    const res = mockRes();
    await updateTemplate(
      mockReq({
        params: { id: "7" },
        body: { name: "Renamed", sections_config: { sections: [] } },
      }) as any,
      res,
    );
    const metadataTx = (updateTemplateQuery as jest.Mock).mock.calls[0][3];
    const versionTx = (createTemplateVersionQuery as jest.Mock).mock.calls[0][4];
    expect(metadataTx).toBe("TX");
    expect(versionTx).toBe(metadataTx);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("rolls back the metadata update when the version insert finds no row", async () => {
    (updateTemplateQuery as jest.Mock).mockResolvedValue({ id: 7 });
    // WHERE EXISTS tenant guard matched nothing.
    (createTemplateVersionQuery as jest.Mock).mockResolvedValue(undefined);
    const res = mockRes();
    await updateTemplate(
      mockReq({
        params: { id: "7" },
        body: { name: "Renamed", sections_config: { sections: [] } },
      }) as any,
      res,
    );
    // Throwing out of the transaction callback is what triggers the rollback;
    // a plain `return res.status(404)` would have committed the rename.
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("400s when neither metadata nor config fields are supplied", async () => {
    const res = mockRes();
    await updateTemplate(mockReq({ params: { id: "7" }, body: {} }) as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("does not append a version for a metadata-only change", async () => {
    (updateTemplateQuery as jest.Mock).mockResolvedValue({ id: 7 });
    const res = mockRes();
    await updateTemplate(mockReq({ params: { id: "7" }, body: { name: "Renamed" } }) as any, res);
    expect(createTemplateVersionQuery).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("archiveTemplate", () => {
  it("404s when nothing matched", async () => {
    (archiveTemplateQuery as jest.Mock).mockResolvedValue(null);
    const res = mockRes();
    await archiveTemplate(mockReq({ params: { id: "1" } }) as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("200s on success", async () => {
    (archiveTemplateQuery as jest.Mock).mockResolvedValue({ id: 7, is_active: false });
    const res = mockRes();
    await archiveTemplate(mockReq({ params: { id: "7" } }) as any, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("listSections", () => {
  it("returns the 12-entry catalog", async () => {
    const res = mockRes();
    await listSections(mockReq() as any, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.data).toHaveLength(12);
  });
});

describe("runTemplateNow framework selection", () => {
  beforeEach(() => {
    (getTemplateByIdQuery as jest.Mock).mockResolvedValue({ id: 7, name: "Board pack" });
    (getVersionByIdQuery as jest.Mock).mockResolvedValue({ id: 30, template_id: 7 });
    (runScheduledReport as jest.Mock).mockResolvedValue({ runId: 1, status: "success" });
  });

  it("400s rather than running with a widened selection when an entry is unparseable", async () => {
    const res = mockRes();
    await runTemplateNow(
      mockReq({
        params: { id: "7" },
        body: {
          templateVersionId: 30,
          scope: "organization",
          frameworkIds: ["native:2", "iso42001"],
        },
      }) as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(JSON.stringify(res.json.mock.calls[0][0])).toContain("iso42001");
    // The point of the 400: an empty/partial selection means EVERY framework,
    // so the run must not have started at all.
    expect(runScheduledReport).not.toHaveBeenCalled();
  });

  it("passes a valid selection through as framework_ids", async () => {
    const res = mockRes();
    await runTemplateNow(
      mockReq({
        params: { id: "7" },
        body: { templateVersionId: 30, scope: "organization", frameworkIds: ["native:2"] },
      }) as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect((runScheduledReport as jest.Mock).mock.calls[0][0].framework_ids).toEqual(["native:2"]);
  });

  it("sends null, not [], when no selection was made", async () => {
    const res = mockRes();
    await runTemplateNow(
      mockReq({
        params: { id: "7" },
        body: { templateVersionId: 30, scope: "organization" },
      }) as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect((runScheduledReport as jest.Mock).mock.calls[0][0].framework_ids).toBeNull();
  });
});

describe("runTemplateNow rejects a non-array selection", () => {
  it("400s on a bare string instead of collapsing it to every framework", async () => {
    (getTemplateByIdQuery as jest.Mock).mockResolvedValue({ id: 7, name: "Board pack" });
    (getVersionByIdQuery as jest.Mock).mockResolvedValue({ id: 30, template_id: 7 });
    (runScheduledReport as jest.Mock).mockResolvedValue({ runId: 1, status: "success" });
    const res = mockRes();

    await runTemplateNow(
      mockReq({
        params: { id: "7" },
        // The routine client bug: one id sent unwrapped.
        body: { templateVersionId: 30, scope: "organization", frameworkIds: "native:2" },
      }) as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(runScheduledReport).not.toHaveBeenCalled();
  });
});
