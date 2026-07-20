jest.mock("../../utils/reportTemplate.utils", () => ({
  getTemplatesQuery: jest.fn(),
  getTemplateByIdQuery: jest.fn(),
  getLatestVersionQuery: jest.fn(),
  createTemplateQuery: jest.fn(),
  updateTemplateQuery: jest.fn(),
  archiveTemplateQuery: jest.fn(),
  createTemplateVersionQuery: jest.fn(),
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
} from "../reportTemplate.ctrl";
import {
  createTemplateQuery,
  updateTemplateQuery,
  archiveTemplateQuery,
  createTemplateVersionQuery,
} from "../../utils/reportTemplate.utils";
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
      mockReq({ body: { name: "Board pack", category: "governance", default_scope: "organization", sections_config: { sections: [] } } }) as any,
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
      mockReq({ body: { name: "Board pack", category: "governance", default_scope: "project" } }) as any,
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
      mockReq({ params: { id: "7" }, body: { ai_blocks_config: { executiveSummary: true } } }) as any,
      res,
    );
    expect(createTemplateVersionQuery).toHaveBeenCalledWith(7, 42, expect.any(Object), 9);
    expect(res.status).toHaveBeenCalledWith(200);
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
