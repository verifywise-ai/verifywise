import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Request, Response } from "express";

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
jest.mock("../../utils/files/bulkFiles.utils", () => ({
  bulkUpdateFileTagsQuery: jest.fn(),
}));
jest.mock("../../utils/eu.utils", () => ({
  addFileToAnswerEU: jest.fn(),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn<any>().mockResolvedValue(undefined),
  logFailure: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (d: any) => ({ message: "OK", data: d }),
    201: (d: any) => ({ message: "Created", data: d }),
    204: (d: any) => ({ message: "No Content", data: d }),
    400: (d: any) => ({ message: "Bad Request", data: d }),
    401: (d: any) => ({ message: "Unauthorized", data: d }),
    403: (d: any) => ({ message: "Forbidden", data: d }),
    404: (d: any) => ({ message: "Not Found", data: d }),
    500: (d: any) => ({ message: "Internal Server Error", data: d }),
  },
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_, err) => (err as Error).message),
}));
jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn().mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() }),
  },
}));
jest.mock("../../repositories/file.repository", () => ({
  createFileEntityLink: jest.fn(),
  deleteFileEntityLink: jest.fn(),
  getFilesWithMetadataForEntity: jest.fn(),
  FrameworkType: {},
  EntityType: {},
  LinkType: {},
}));
jest.mock("../../utils/bulkAction.utils", () => ({
  parseBulkIds: jest.fn((ids: number[]) => ids),
  assertOrgOwnsIds: jest.fn().mockResolvedValue(undefined),
  withBulkTransaction: jest.fn().mockImplementation(async (_opts: any, fn: any) => {
    const transaction = { commit: jest.fn(), rollback: jest.fn() };
    await fn(transaction);
  }),
}));
jest.mock("../../domain.layer/exceptions/custom.exception", () => ({
  ForbiddenException: class ForbiddenException extends Error {},
  ValidationException: class ValidationException extends Error {},
}));

import {
  getFileContentById,
  getFileMetaByProjectId,
  getUserFilesMetaData,
  postFileContent,
  attachFileToEntity,
  detachFileFromEntity,
} from "../file.ctrl";
import {
  getFileById,
  getFileMetadataByProjectId,
  canUserAccessFile,
  uploadFile,
  deleteFileById,
} from "../../utils/fileUpload.utils";
import getUserFilesMetaDataQuery from "../../utils/files/getUserFilesMetaData.utils";
import { addFileToAnswerEU } from "../../utils/eu.utils";
import { createFileEntityLink, deleteFileEntityLink } from "../../repositories/file.repository";

const mockGetFile = getFileById as jest.MockedFunction<typeof getFileById>;
const mockGetFileMeta = getFileMetadataByProjectId as jest.MockedFunction<
  typeof getFileMetadataByProjectId
>;
const mockCanAccess = canUserAccessFile as jest.MockedFunction<typeof canUserAccessFile>;
const mockUpload = uploadFile as jest.MockedFunction<typeof uploadFile>;
const mockDeleteFile = deleteFileById as jest.MockedFunction<typeof deleteFileById>;
const mockGetUserFiles = getUserFilesMetaDataQuery as jest.MockedFunction<
  typeof getUserFilesMetaDataQuery
>;
const mockAddFile = addFileToAnswerEU as jest.MockedFunction<typeof addFileToAnswerEU>;
const mockCreateLink = createFileEntityLink as jest.MockedFunction<typeof createFileEntityLink>;
const mockDeleteLink = deleteFileEntityLink as jest.MockedFunction<typeof deleteFileEntityLink>;

function createReq(overrides?: Partial<Request>): any {
  return {
    userId: 1,
    organizationId: 1,
    role: "Admin",
    t: (k: string) => k,
    body: {},
    params: {},
    query: {},
    files: [],
    ...overrides,
  };
}
function createRes(): any {
  const res: any = {};
  res.status = jest.fn<any>().mockReturnValue(res);
  res.json = jest.fn<any>().mockReturnValue(res);
  res.send = jest.fn<any>().mockReturnValue(res);
  res.setHeader = jest.fn<any>().mockReturnValue(res);
  res.end = jest.fn<any>().mockReturnValue(res);
  return res;
}

describe("file.ctrl", () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  describe("getFileContentById", () => {
    it("should return 400 for invalid fileId", async () => {
      const req = createReq({ params: { id: "abc" } });
      const res = createRes();
      await getFileContentById(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it("should return 401 when userId is missing", async () => {
      const req = createReq({ params: { id: "1" }, userId: undefined });
      const res = createRes();
      await getFileContentById(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });
    it("should return 400 when organizationId is missing", async () => {
      const req = createReq({ params: { id: "1" }, organizationId: undefined });
      const res = createRes();
      await getFileContentById(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it("should return 403 when access is denied", async () => {
      mockCanAccess.mockResolvedValue(false);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getFileContentById(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });
    it("should return 200 with file content when found", async () => {
      mockCanAccess.mockResolvedValue(true);
      mockGetFile.mockResolvedValue({
        id: 1,
        filename: "test.txt",
        type: "text/plain",
        content: Buffer.from("hello"),
      } as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getFileContentById(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.end).toHaveBeenCalled();
    });
    it("should return 404 when file is not found", async () => {
      mockCanAccess.mockResolvedValue(true);
      mockGetFile.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getFileContentById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 500 on error", async () => {
      mockCanAccess.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getFileContentById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getFileMetaByProjectId", () => {
    it("should return 200 when files exist", async () => {
      mockGetFileMeta.mockResolvedValue([{ id: 1, filename: "test.txt" }] as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getFileMetaByProjectId(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 404 when no files exist", async () => {
      mockGetFileMeta.mockResolvedValue([] as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getFileMetaByProjectId(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 500 on error", async () => {
      mockGetFileMeta.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getFileMetaByProjectId(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getUserFilesMetaData", () => {
    it("should return 200 with files", async () => {
      mockGetUserFiles.mockResolvedValue([{ id: 1 }] as any);
      const req = createReq();
      const res = createRes();
      await getUserFilesMetaData(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 500 on error", async () => {
      mockGetUserFiles.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await getUserFilesMetaData(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("postFileContent", () => {
    it("should return 201 when files are uploaded", async () => {
      mockUpload.mockResolvedValue({
        id: 1,
        filename: "test.txt",
        project_id: 1,
        uploaded_by: 1,
        uploaded_time: new Date(),
        type: "text/plain",
        source: "upload",
      } as any);
      mockAddFile.mockResolvedValue({ evidence_files: [{ id: 1 }] } as any);
      const req = createReq({
        body: { question_id: "1", project_id: 1, user_id: 1, delete: "[]" },
        files: [{ originalname: "test.txt", buffer: Buffer.from("hello") }],
      });
      const res = createRes();
      await postFileContent(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
    });
    it("should return 500 on error", async () => {
      mockUpload.mockRejectedValue(new Error("DB error"));
      const req = createReq({
        body: { question_id: "1", project_id: 1, user_id: 1, delete: "[]" },
        files: [{ originalname: "test.txt", buffer: Buffer.from("hello") }],
      });
      const res = createRes();
      await postFileContent(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("attachFileToEntity", () => {
    it("should return 400 when required fields are missing", async () => {
      const req = createReq({ body: {} });
      const res = createRes();
      await attachFileToEntity(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it("should return 401 when userId is missing", async () => {
      const req = createReq({
        body: { file_id: 1, framework_type: "eu", entity_type: "control", entity_id: 1 },
        userId: undefined,
      });
      const res = createRes();
      await attachFileToEntity(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });
    it("should return 201 when file is attached", async () => {
      mockCreateLink.mockResolvedValue({ id: 1 } as any);
      const req = createReq({
        body: { file_id: 1, framework_type: "eu", entity_type: "control", entity_id: 1 },
      });
      const res = createRes();
      await attachFileToEntity(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
    });
    it("should return 200 when file already attached", async () => {
      mockCreateLink.mockResolvedValue(null as any);
      const req = createReq({
        body: { file_id: 1, framework_type: "eu", entity_type: "control", entity_id: 1 },
      });
      const res = createRes();
      await attachFileToEntity(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 500 on error", async () => {
      mockCreateLink.mockRejectedValue(new Error("DB error"));
      const req = createReq({
        body: { file_id: 1, framework_type: "eu", entity_type: "control", entity_id: 1 },
      });
      const res = createRes();
      await attachFileToEntity(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("detachFileFromEntity", () => {
    it("should return 400 when required fields are missing", async () => {
      const req = createReq({ body: {} });
      const res = createRes();
      await detachFileFromEntity(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it("should return 200 when file is detached", async () => {
      mockDeleteLink.mockResolvedValue(true as any);
      const req = createReq({
        body: { file_id: 1, framework_type: "eu", entity_type: "control", entity_id: 1 },
      });
      const res = createRes();
      await detachFileFromEntity(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("should return 404 when link is not found", async () => {
      mockDeleteLink.mockResolvedValue(false as any);
      const req = createReq({
        body: { file_id: 1, framework_type: "eu", entity_type: "control", entity_id: 1 },
      });
      const res = createRes();
      await detachFileFromEntity(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it("should return 500 on error", async () => {
      mockDeleteLink.mockRejectedValue(new Error("DB error"));
      const req = createReq({
        body: { file_id: 1, framework_type: "eu", entity_type: "control", entity_id: 1 },
      });
      const res = createRes();
      await detachFileFromEntity(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
