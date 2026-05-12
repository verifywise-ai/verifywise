import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/files/bulkFiles.utils", () => ({
  bulkUpdateFileTagsQuery: jest.fn<any>().mockResolvedValue(undefined),
}));

jest.mock("../../utils/bulkAction.utils", () => ({
  parseBulkIds: jest.fn<any>(),
  assertOrgOwnsIds: jest.fn<any>().mockResolvedValue(undefined),
  withBulkTransaction: jest.fn<any>(),
}));

jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn<any>(),
  logSuccess: jest.fn<any>().mockResolvedValue(undefined),
  logFailure: jest.fn<any>().mockResolvedValue(undefined),
}));

jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (data: any) => ({ message: "OK", data }),
    400: (data: any) => ({ message: "Bad Request", data }),
    403: (data: any) => ({ message: "Forbidden", data }),
    500: (data: any) => ({ message: "Internal Server Error", data }),
  },
}));

// Other module-level imports the controller pulls in but tests don't exercise.
jest.mock("../../utils/fileUpload.utils", () => ({
  deleteFileById: jest.fn(),
  getFileById: jest.fn(),
  getFileMetadataByProjectId: jest.fn(),
  uploadFile: jest.fn(),
  canUserAccessFile: jest.fn(),
}));
jest.mock("../../utils/files/getUserFilesMetaData.utils", () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock("../../utils/eu.utils", () => ({
  addFileToAnswerEU: jest.fn(),
}));
jest.mock("../../repositories/file.repository", () => ({
  createFileEntityLink: jest.fn(),
  deleteFileEntityLink: jest.fn(),
  getFilesWithMetadataForEntity: jest.fn(),
  FrameworkType: {},
  EntityType: {},
  LinkType: {},
}));
jest.mock("../../database/db", () => ({
  sequelize: { transaction: jest.fn() },
}));

import { bulkUpdateFileTags } from "../file.ctrl";
import { bulkUpdateFileTagsQuery } from "../../utils/files/bulkFiles.utils";
import { parseBulkIds, assertOrgOwnsIds, withBulkTransaction } from "../../utils/bulkAction.utils";
import {
  ForbiddenException,
  ValidationException,
} from "../../domain.layer/exceptions/custom.exception";

const mockParseBulkIds = parseBulkIds as jest.MockedFunction<typeof parseBulkIds>;
const mockAssertOrgOwnsIds = assertOrgOwnsIds as jest.MockedFunction<typeof assertOrgOwnsIds>;
const mockWithBulkTransaction = withBulkTransaction as jest.MockedFunction<
  typeof withBulkTransaction
>;
const mockBulkUpdateFileTagsQuery = bulkUpdateFileTagsQuery as jest.MockedFunction<
  typeof bulkUpdateFileTagsQuery
>;

function createReq(body: any): Partial<Request> {
  return {
    userId: 9,
    organizationId: 4,
    role: "Editor",
    body,
  } as any;
}

function createRes(): any {
  const res: any = {};
  res.status = jest.fn<any>().mockReturnValue(res);
  res.json = jest.fn<any>().mockReturnValue(res);
  return res;
}

describe("bulkUpdateFileTags", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParseBulkIds.mockImplementation((input: any) => {
      if (!Array.isArray(input) || input.length === 0) {
        throw new ValidationException("ids must be a non-empty array", "ids", input);
      }
      return input.map((n: any) => Number(n));
    });
    mockWithBulkTransaction.mockImplementation(async (_options: any, handler: any) =>
      handler({} as any),
    );
  });

  it("returns 200 and runs the query in 'set' mode for a happy-path call", async () => {
    const req = createReq({ ids: [1, 2], tags: ["audit"], mode: "set" });
    const res = createRes();

    await bulkUpdateFileTags(req as Request, res as Response);

    expect(mockAssertOrgOwnsIds).toHaveBeenCalledWith(
      expect.objectContaining({ table: "files", ids: [1, 2], organizationId: 4 }),
    );
    expect(mockBulkUpdateFileTagsQuery).toHaveBeenCalledWith(
      expect.objectContaining({ ids: [1, 2], tags: ["audit"], mode: "set" }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "OK",
      data: { updated: 2, mode: "set" },
    });
  });

  it("accepts 'add' and 'remove' modes", async () => {
    const req1 = createReq({ ids: [3], tags: ["a"], mode: "add" });
    const res1 = createRes();
    await bulkUpdateFileTags(req1 as Request, res1 as Response);
    expect(res1.status).toHaveBeenCalledWith(200);

    const req2 = createReq({ ids: [3], tags: ["a"], mode: "remove" });
    const res2 = createRes();
    await bulkUpdateFileTags(req2 as Request, res2 as Response);
    expect(res2.status).toHaveBeenCalledWith(200);
  });

  it("allows empty tags only with mode='set' (clearing tags)", async () => {
    const req = createReq({ ids: [1], tags: [], mode: "set" });
    const res = createRes();

    await bulkUpdateFileTags(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockBulkUpdateFileTagsQuery).toHaveBeenCalledWith(
      expect.objectContaining({ tags: [], mode: "set" }),
    );
  });

  it("rejects empty tags with mode='add'", async () => {
    const req = createReq({ ids: [1], tags: [], mode: "add" });
    const res = createRes();

    await bulkUpdateFileTags(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockBulkUpdateFileTagsQuery).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid mode", async () => {
    const req = createReq({ ids: [1], tags: ["a"], mode: "merge" });
    const res = createRes();

    await bulkUpdateFileTags(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockWithBulkTransaction).not.toHaveBeenCalled();
  });

  it("returns 400 when tags is not an array", async () => {
    const req = createReq({ ids: [1], tags: "audit", mode: "set" });
    const res = createRes();

    await bulkUpdateFileTags(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 when a tag exceeds the length limit", async () => {
    const longTag = "x".repeat(60);
    const req = createReq({ ids: [1], tags: [longTag], mode: "set" });
    const res = createRes();

    await bulkUpdateFileTags(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 403 when the tenant guard rejects (cross-org access)", async () => {
    mockAssertOrgOwnsIds.mockRejectedValueOnce(
      new ForbiddenException("Cross-tenant access", "files", "bulk_action"),
    );

    const req = createReq({ ids: [99], tags: ["a"], mode: "add" });
    const res = createRes();

    await bulkUpdateFileTags(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockBulkUpdateFileTagsQuery).not.toHaveBeenCalled();
  });

  it("returns 500 on unexpected errors", async () => {
    mockWithBulkTransaction.mockImplementationOnce(async () => {
      throw new Error("db exploded");
    });

    const req = createReq({ ids: [1], tags: ["a"], mode: "set" });
    const res = createRes();

    await bulkUpdateFileTags(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
