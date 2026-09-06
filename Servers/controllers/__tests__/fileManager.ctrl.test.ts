import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../repositories/file.repository", () => ({
  uploadOrganizationFile: jest.fn(),
  getFileById: jest.fn(),
  getOrganizationFiles: jest.fn(),
  getOrganizationFilesWithMetadata: jest.fn(),
  logFileAccess: jest.fn(),
  deleteFileById: jest.fn(),
  updateFileMetadata: jest.fn(),
  getFileWithMetadata: jest.fn(),
  getFilePreview: jest.fn(),
  getFileVersionHistory: jest.fn(),
  searchFilesByContent: jest.fn(),
}));
jest.mock("../../utils/approvalRequest.utils", () => ({
  createApprovalRequestQuery: jest.fn(),
  rejectApprovalRequestOnEntityDelete: jest.fn(),
}));
jest.mock("../../services/notification.service", () => ({
  notifyStepApprovers: jest.fn<any>().mockResolvedValue(undefined),
  notifyRequesterRejected: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/validations/fileManagerValidation.utils", () => ({
  validateFileUpload: jest.fn(),
  formatFileSize: jest.fn(),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn<any>().mockResolvedValue(undefined),
  logFailure: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/user.utils", () => ({
  getUserProjects: jest.fn(),
}));
jest.mock("../../utils/project.utils", () => ({
  getProjectByIdQuery: jest.fn(),
}));
jest.mock("../../utils/changeHistory.base.utils", () => ({
  trackEntityChanges: jest.fn<any>().mockResolvedValue([]),
  recordMultipleFieldChanges: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../services/fileIngestion/textExtractor", () => ({
  extractText: jest.fn<any>().mockResolvedValue(""),
  normalizeText: jest.fn(),
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (d: any) => ({ message: "OK", data: d }),
    201: (d: any) => ({ message: "Created", data: d }),
    400: (d: any) => ({ message: "Bad Request", data: d }),
    403: (d: any) => ({ message: "Forbidden", data: d }),
    404: (d: any) => ({ message: "Not Found", data: d }),
    413: (d: any) => ({ message: "Payload Too Large", data: d }),
    500: (d: any) => ({ message: "Internal Server Error", data: d }),
  },
}));
jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn<any>().mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() }),
    query: jest.fn<any>().mockResolvedValue([[]]),
  },
}));

import { sequelize } from "../../database/db";
import {
  deleteFileById,
  getFileById,
  getFilePreview,
  getFileVersionHistory as getFileVersionHistoryRepo,
  getFileWithMetadata,
  getOrganizationFiles,
  getOrganizationFilesWithMetadata,
  searchFilesByContent,
  updateFileMetadata,
  uploadOrganizationFile,
} from "../../repositories/file.repository";
import { extractText, normalizeText } from "../../services/fileIngestion/textExtractor";
import { notifyRequesterRejected } from "../../services/notification.service";
import {
  createApprovalRequestQuery,
  rejectApprovalRequestOnEntityDelete,
} from "../../utils/approvalRequest.utils";
import { getProjectByIdQuery } from "../../utils/project.utils";
import { getUserProjects } from "../../utils/user.utils";
import { logFailure } from "../../utils/logger/logHelper";
import {
  recordMultipleFieldChanges,
  trackEntityChanges,
} from "../../utils/changeHistory.base.utils";
import {
  formatFileSize,
  validateFileUpload,
} from "../../utils/validations/fileManagerValidation.utils";
import {
  downloadFile,
  getFileMetadata,
  getFileVersionHistory,
  listFiles,
  listFilesWithMetadata,
  previewFile,
  removeFile,
  searchFiles,
  updateMetadata,
  uploadFile,
} from "../fileManager.ctrl";

const mockUploadOrgFile = uploadOrganizationFile as jest.MockedFunction<
  typeof uploadOrganizationFile
>;
const mockGetFileById = getFileById as jest.MockedFunction<typeof getFileById>;
const mockGetOrgFiles = getOrganizationFiles as jest.MockedFunction<typeof getOrganizationFiles>;
const mockGetOrgFilesMeta = getOrganizationFilesWithMetadata as jest.MockedFunction<
  typeof getOrganizationFilesWithMetadata
>;
const mockDeleteFile = deleteFileById as jest.MockedFunction<typeof deleteFileById>;
const mockUpdateMeta = updateFileMetadata as jest.MockedFunction<typeof updateFileMetadata>;
const mockGetFileMeta = getFileWithMetadata as jest.MockedFunction<typeof getFileWithMetadata>;
const mockGetPreview = getFilePreview as jest.MockedFunction<typeof getFilePreview>;
const mockGetVersions = getFileVersionHistoryRepo as jest.MockedFunction<
  typeof getFileVersionHistoryRepo
>;
const mockSearchFiles = searchFilesByContent as jest.MockedFunction<typeof searchFilesByContent>;
const mockValidateUpload = validateFileUpload as jest.MockedFunction<typeof validateFileUpload>;
const mockFormatSize = formatFileSize as jest.MockedFunction<typeof formatFileSize>;
const mockCreateApprovalReq = createApprovalRequestQuery as jest.MockedFunction<
  typeof createApprovalRequestQuery
>;
const mockRejectApproval = rejectApprovalRequestOnEntityDelete as jest.MockedFunction<
  typeof rejectApprovalRequestOnEntityDelete
>;
const mockNotifyRejected = notifyRequesterRejected as jest.MockedFunction<
  typeof notifyRequesterRejected
>;
const mockGetUserProjects = getUserProjects as jest.MockedFunction<typeof getUserProjects>;
const mockGetProject = getProjectByIdQuery as jest.MockedFunction<typeof getProjectByIdQuery>;
const mockLogFailure = logFailure as jest.MockedFunction<typeof logFailure>;
const mockTrackChanges = trackEntityChanges as jest.MockedFunction<typeof trackEntityChanges>;
const mockRecordChanges = recordMultipleFieldChanges as jest.MockedFunction<
  typeof recordMultipleFieldChanges
>;
const mockExtractText = extractText as jest.MockedFunction<typeof extractText>;
const mockNormalizeText = normalizeText as jest.MockedFunction<typeof normalizeText>;

function createReq(overrides?: Record<string, any>): any {
  return {
    userId: 1,
    organizationId: 1,
    role: "Admin",
    t: (k: string) => k,
    body: {},
    params: {},
    query: {},
    file: undefined,
    headers: {},
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

function makeFile(overrides?: any): Express.Multer.File {
  return {
    fieldname: "file",
    originalname: "test.pdf",
    encoding: "7bit",
    mimetype: "application/pdf",
    buffer: Buffer.from("dummy content"),
    size: 1024,
    destination: "",
    filename: "test.pdf",
    path: "/tmp/test.pdf",
    ...overrides,
  };
}

function makeDbFile(overrides?: any) {
  return {
    id: 1,
    filename: "test.pdf",
    type: "application/pdf",
    size: 1024,
    content: Buffer.from("dummy content"),
    org_id: 1,
    organization_id: 1,
    project_id: null,
    uploaded_by: 1,
    upload_date: new Date().toISOString(),
    mimetype: "application/pdf",
    uploader_name: "Test",
    uploader_surname: "User",
    review_status: "draft",
    approval_workflow_id: null,
    approval_request_id: null,
    file_group_id: null,
    tags: null,
    version: null,
    expiry_date: null,
    description: null,
    owner: 1,
    canPreview: true,
    ...overrides,
  };
}

describe("fileManager.ctrl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("uploadFile", () => {
    it("should return 400 when no file is provided", async () => {
      const req = createReq();
      const res = createRes();
      await uploadFile(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 when userId is invalid", async () => {
      const req = createReq({ userId: undefined, file: makeFile() });
      const res = createRes();
      await uploadFile(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 when organizationId is invalid", async () => {
      const req = createReq({ organizationId: undefined, file: makeFile() });
      const res = createRes();
      await uploadFile(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 when file validation fails", async () => {
      mockValidateUpload.mockReturnValue({ valid: false, error: "Invalid file type" });
      const req = createReq({ file: makeFile() });
      const res = createRes();
      await uploadFile(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 201 on successful upload", async () => {
      mockValidateUpload.mockReturnValue({ valid: true });
      mockUploadOrgFile.mockResolvedValue({
        id: 1,
        filename: "test.pdf",
        size: 1024,
        mimetype: "application/pdf",
        upload_date: new Date().toISOString(),
        uploaded_by: 1,
        model_id: null,
      } as any);
      const req = createReq({ file: makeFile() });
      const res = createRes();
      await uploadFile(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    // Full-text indexing is best-effort: it runs after the row is written and
    // must never turn a successful upload into a failure.
    describe("search-text extraction", () => {
      const uploaded = {
        id: 1,
        filename: "test.pdf",
        size: 1024,
        mimetype: "application/pdf",
        upload_date: new Date().toISOString(),
        uploaded_by: 1,
        model_id: null,
      };

      const contentSearchUpdates = () =>
        (sequelize.query as jest.Mock<any>).mock.calls.filter(
          (c: any[]) => typeof c[0] === "string" && c[0].includes("content_search"),
        );

      beforeEach(() => {
        mockValidateUpload.mockReturnValue({ valid: true });
        mockUploadOrgFile.mockResolvedValue(uploaded as any);
      });

      it("indexes the extracted text on a successful extraction", async () => {
        mockExtractText.mockResolvedValue("Some Extracted Text" as any);
        mockNormalizeText.mockReturnValue("some extracted text" as any);

        const req = createReq({ file: makeFile() });
        const res = createRes();
        await uploadFile(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(contentSearchUpdates()).toHaveLength(1);
      });

      it("still returns 201 when extraction throws", async () => {
        mockExtractText.mockRejectedValueOnce(new Error("unreadable pdf"));

        const req = createReq({ file: makeFile() });
        const res = createRes();
        await uploadFile(req, res);

        // The upload itself succeeded; only the indexing side-effect failed.
        expect(res.status).toHaveBeenCalledWith(201);
        expect(contentSearchUpdates()).toHaveLength(0);
      });

      it("skips the index write when extraction yields nothing", async () => {
        mockExtractText.mockResolvedValue("" as any);

        const req = createReq({ file: makeFile() });
        const res = createRes();
        await uploadFile(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(mockNormalizeText).not.toHaveBeenCalled();
        expect(contentSearchUpdates()).toHaveLength(0);
      });
    });

    it("should return 400 when approval workflow ID is invalid", async () => {
      mockValidateUpload.mockReturnValue({ valid: true });
      const req = createReq({
        file: makeFile(),
        body: { approval_workflow_id: "999" },
      });
      const res = createRes();
      const mockQuery = sequelize.query as jest.Mock<any>;
      mockQuery.mockResolvedValue([[null]]);
      await uploadFile(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 when workflow entity_type is not 'file'", async () => {
      mockValidateUpload.mockReturnValue({ valid: true });
      const req = createReq({
        file: makeFile(),
        body: { approval_workflow_id: "1" },
      });
      const res = createRes();
      const mockQuery = sequelize.query as jest.Mock<any>;
      mockQuery.mockResolvedValue([[{ id: 1, workflow_title: "Test", entity_type: "project" }]]);
      await uploadFile(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should create approval request when workflow is valid", async () => {
      mockValidateUpload.mockReturnValue({ valid: true });
      mockUploadOrgFile.mockResolvedValue({
        id: 1,
        filename: "test.pdf",
        size: 1024,
        mimetype: "application/pdf",
        upload_date: new Date().toISOString(),
        uploaded_by: 1,
        model_id: null,
      } as any);
      const mockQuery = sequelize.query as jest.Mock<any>;
      mockQuery
        .mockResolvedValueOnce([{ id: 1, workflow_title: "Test WF", entity_type: "file" }])
        .mockResolvedValueOnce([
          [
            {
              id: 10,
              step_number: 1,
              workflow_id: 1,
              organization_id: 1,
              approvers: [{ approver_id: 2 }],
            },
          ],
        ]);
      mockCreateApprovalReq.mockResolvedValue({ id: 100 } as any);
      const req = createReq({
        file: makeFile(),
        body: { approval_workflow_id: "1" },
      });
      const res = createRes();
      await uploadFile(req, res);
      expect(mockCreateApprovalReq).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("should return 500 on error", async () => {
      // Set explicitly: without this the test only passes when a prior test
      // happens to have left validateFileUpload returning valid.
      mockValidateUpload.mockReturnValue({ valid: true });
      mockUploadOrgFile.mockRejectedValueOnce(new Error("DB error"));
      const req = createReq({ file: makeFile() });
      const res = createRes();
      await uploadFile(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("listFiles", () => {
    it("should return 400 when pagination is invalid", async () => {
      const req = createReq({ query: { page: "-1" } });
      const res = createRes();
      await listFiles(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 200 with files", async () => {
      mockGetOrgFiles.mockResolvedValue({
        files: [makeDbFile()],
        total: 1,
      });
      mockFormatSize.mockReturnValue("1 KB");
      const req = createReq();
      const res = createRes();
      await listFiles(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 400 when userId is invalid", async () => {
      const req = createReq({ userId: undefined });
      const res = createRes();
      await listFiles(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 500 on error", async () => {
      mockGetOrgFiles.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await listFiles(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("searchFiles", () => {
    it("should return 400 when query param is missing", async () => {
      const req = createReq({ query: {} });
      const res = createRes();
      await searchFiles(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 for invalid pagination", async () => {
      const req = createReq({ query: { q: "test", page: "99999" } });
      const res = createRes();
      await searchFiles(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 200 with search results", async () => {
      mockSearchFiles.mockResolvedValue({ files: [makeDbFile()] } as any);
      const req = createReq({ query: { q: "contract" } });
      const res = createRes();
      await searchFiles(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 400 when userId is invalid", async () => {
      const req = createReq({ userId: undefined, query: { q: "test" } });
      const res = createRes();
      await searchFiles(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 500 on error", async () => {
      mockSearchFiles.mockRejectedValue(new Error("DB error"));
      const req = createReq({ query: { q: "test" } });
      const res = createRes();
      await searchFiles(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("downloadFile", () => {
    it("should return 400 for invalid file ID format", async () => {
      const req = createReq({ params: { id: "abc" } });
      const res = createRes();
      await downloadFile(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 when userId is invalid", async () => {
      const req = createReq({ params: { id: "1" }, userId: undefined });
      const res = createRes();
      await downloadFile(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when file is not found", async () => {
      mockGetFileById.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await downloadFile(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 403 when org_id does not match", async () => {
      mockGetFileById.mockResolvedValue(makeDbFile({ organization_id: 2 }) as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await downloadFile(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 403 when user lacks project access", async () => {
      mockGetFileById.mockResolvedValue(makeDbFile({ project_id: 5, uploaded_by: 99 }) as any);
      mockGetUserProjects.mockResolvedValue([]);
      mockGetProject.mockResolvedValue({ id: 5, owner: 99 } as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await downloadFile(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 404 when file has no content", async () => {
      mockGetFileById.mockResolvedValue(makeDbFile({ content: null }) as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await downloadFile(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should stream file content on successful download", async () => {
      mockGetFileById.mockResolvedValue(makeDbFile() as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await downloadFile(req, res);
      expect(res.end).toHaveBeenCalled();
    });

    it("should allow download when user is project member", async () => {
      mockGetFileById.mockResolvedValue(makeDbFile({ project_id: 5 }) as any);
      mockGetUserProjects.mockResolvedValue([{ id: 5 }] as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await downloadFile(req, res);
      expect(res.end).toHaveBeenCalled();
    });

    it("should allow download when user is file owner", async () => {
      mockGetFileById.mockResolvedValue(makeDbFile({ project_id: 5, uploaded_by: 1 }) as any);
      mockGetUserProjects.mockResolvedValue([]);
      mockGetProject.mockResolvedValue({ id: 5, owner: 99 } as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await downloadFile(req, res);
      expect(res.end).toHaveBeenCalled();
    });

    it("should return 500 on error", async () => {
      mockGetFileById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await downloadFile(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("removeFile", () => {
    it("should return 400 for invalid file ID format", async () => {
      const req = createReq({ params: { id: "abc" } });
      const res = createRes();
      await removeFile(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 when userId is invalid", async () => {
      const req = createReq({ params: { id: "1" }, userId: undefined });
      const res = createRes();
      await removeFile(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 403 when role lacks permission", async () => {
      const req = createReq({ params: { id: "1" }, role: "Auditor" });
      const res = createRes();
      await removeFile(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 404 when file is not found", async () => {
      mockGetFileById.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await removeFile(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 403 when org_id does not match", async () => {
      mockGetFileById.mockResolvedValue(makeDbFile({ organization_id: 2 }) as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await removeFile(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    // Project-level files (project_id IS NOT NULL) take a different branch from
    // the organization-file check above. Access is granted by ANY of three
    // independent conditions, so each is exercised in isolation - a test that
    // satisfied two at once could not tell which one actually granted access.
    describe("project-file authorization", () => {
      const projectFile = (overrides?: any) =>
        makeDbFile({ project_id: 9, uploaded_by: 99, ...overrides });

      beforeEach(() => {
        mockDeleteFile.mockResolvedValue(true as any);
      });

      it("allows deletion when the user is only a member of the project", async () => {
        mockGetFileById.mockResolvedValue(projectFile() as any);
        mockGetUserProjects.mockResolvedValue([{ id: 9 }] as any);
        mockGetProject.mockResolvedValue({ id: 9, owner: 99 } as any);

        const req = createReq({ params: { id: "1" } });
        const res = createRes();
        await removeFile(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
      });

      it("allows deletion when the user is only the project owner", async () => {
        mockGetFileById.mockResolvedValue(projectFile() as any);
        mockGetUserProjects.mockResolvedValue([] as any);
        mockGetProject.mockResolvedValue({ id: 9, owner: 1 } as any);

        const req = createReq({ params: { id: "1" } });
        const res = createRes();
        await removeFile(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
      });

      it("allows deletion when the user only uploaded the file", async () => {
        mockGetFileById.mockResolvedValue(projectFile({ uploaded_by: 1 }) as any);
        mockGetUserProjects.mockResolvedValue([] as any);
        mockGetProject.mockResolvedValue({ id: 9, owner: 99 } as any);

        const req = createReq({ params: { id: "1" } });
        const res = createRes();
        await removeFile(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
      });

      it("returns 403 and logs when none of the three conditions hold", async () => {
        mockGetFileById.mockResolvedValue(projectFile() as any);
        mockGetUserProjects.mockResolvedValue([{ id: 42 }] as any);
        mockGetProject.mockResolvedValue({ id: 9, owner: 99 } as any);

        const req = createReq({ params: { id: "1" } });
        const res = createRes();
        await removeFile(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ message: "Forbidden", data: "Access denied" });
        expect(mockDeleteFile).not.toHaveBeenCalled();
        expect(mockLogFailure).toHaveBeenCalledWith(
          expect.objectContaining({ functionName: "removeFile" }),
        );
      });

      it("returns 403 when the project lookup finds nothing", async () => {
        mockGetFileById.mockResolvedValue(projectFile() as any);
        mockGetUserProjects.mockResolvedValue([] as any);
        // A missing project must not be treated as ownership.
        mockGetProject.mockResolvedValue(null as any);

        const req = createReq({ params: { id: "1" } });
        const res = createRes();
        await removeFile(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(mockDeleteFile).not.toHaveBeenCalled();
      });
    });

    it("should reject pending approval on delete and notify requester", async () => {
      mockGetFileById.mockResolvedValue(makeDbFile({ approval_request_id: 50 }) as any);
      mockRejectApproval.mockResolvedValue({
        type: "requester_rejected",
        organizationId: 1,
        requesterId: 3,
        requestId: 50,
        requestName: "File Approval: test.pdf",
      });
      mockDeleteFile.mockResolvedValue(true as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await removeFile(req, res);
      expect(mockRejectApproval).toHaveBeenCalledWith(50, 1, expect.any(String));
      expect(mockNotifyRejected).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 200 on successful deletion", async () => {
      mockGetFileById.mockResolvedValue(makeDbFile() as any);
      mockDeleteFile.mockResolvedValue(true as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await removeFile(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 404 when delete returns false", async () => {
      mockGetFileById.mockResolvedValue(makeDbFile() as any);
      mockDeleteFile.mockResolvedValue(false as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await removeFile(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 500 on error", async () => {
      mockGetFileById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await removeFile(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getFileMetadata", () => {
    // Same three-way project grant as removeFile; here only the deny path is
    // pinned, since the grants are exercised in full in removeFile's matrix.
    it("returns 403 for a project file the user has no claim on", async () => {
      mockGetFileMeta.mockResolvedValue(makeDbFile({ project_id: 9, uploaded_by: 99 }) as any);
      mockGetUserProjects.mockResolvedValue([{ id: 42 }] as any);
      mockGetProject.mockResolvedValue({ id: 9, owner: 99 } as any);

      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getFileMetadata(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: "Forbidden", data: "Access denied" });
    });

    it("should return 400 for invalid file ID", async () => {
      const req = createReq({ params: { id: "abc" } });
      const res = createRes();
      await getFileMetadata(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 when userId is invalid", async () => {
      const req = createReq({ params: { id: "1" }, userId: undefined });
      const res = createRes();
      await getFileMetadata(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when file is not found", async () => {
      mockGetFileMeta.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getFileMetadata(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 403 when org_id does not match", async () => {
      mockGetFileMeta.mockResolvedValue(makeDbFile({ organization_id: 2 }) as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getFileMetadata(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 200 with file metadata", async () => {
      mockGetFileMeta.mockResolvedValue(makeDbFile() as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getFileMetadata(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetFileMeta.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getFileMetadata(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("updateMetadata", () => {
    describe("tag validation", () => {
      const withTags = (tags: unknown) => createReq({ params: { id: "1" }, body: { tags } });

      beforeEach(() => {
        mockGetFileById.mockResolvedValue(makeDbFile() as any);
      });

      it.each([
        ["more than 50 tags", Array.from({ length: 51 }, (_, i) => `t${i}`)],
        ["a non-string tag", ["ok", 5]],
        ["a tag over 100 characters", ["a".repeat(101)]],
        ["a tag with disallowed characters", ["not/allowed"]],
      ])("returns 400 for %s", async (_label, tags) => {
        const res = createRes();
        await updateMetadata(withTags(tags), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(mockUpdateMeta).not.toHaveBeenCalled();
      });

      it("accepts a tag list once blank entries are dropped", async () => {
        mockGetFileMeta.mockResolvedValue(makeDbFile() as any);
        mockUpdateMeta.mockResolvedValue(makeDbFile() as any);

        const res = createRes();
        await updateMetadata(withTags(["  keep  ", "   ", ""]), res);

        // Empty tags are skipped rather than rejected.
        expect(res.status).toHaveBeenCalledWith(200);
        expect(mockUpdateMeta).toHaveBeenCalledWith(
          1,
          expect.objectContaining({ tags: ["keep"] }),
          1,
        );
      });
    });

    it("returns 400 when expiry_date is not in YYYY-MM-DD form", async () => {
      mockGetFileById.mockResolvedValue(makeDbFile() as any);

      const req = createReq({ params: { id: "1" }, body: { expiry_date: "not-a-date" } });
      const res = createRes();
      await updateMetadata(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Bad Request",
        data: "Invalid date format. Use YYYY-MM-DD",
      });
    });

    it("returns 400 when expiry_date is well-formed but not a real date", async () => {
      mockGetFileById.mockResolvedValue(makeDbFile() as any);

      // Passes the shape regex, so this reaches the separate value check.
      const req = createReq({ params: { id: "1" }, body: { expiry_date: "2026-13-45" } });
      const res = createRes();
      await updateMetadata(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Bad Request",
        data: "Invalid date value",
      });
    });

    it("returns 404 when the update matches no row", async () => {
      mockGetFileById.mockResolvedValue(makeDbFile() as any);
      mockGetFileMeta.mockResolvedValue(makeDbFile() as any);
      mockUpdateMeta.mockResolvedValue(null as any);

      const req = createReq({ params: { id: "1" }, body: { description: "x" } });
      const res = createRes();
      await updateMetadata(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("still returns 200 when change-history recording throws", async () => {
      mockGetFileById.mockResolvedValue(makeDbFile() as any);
      mockGetFileMeta.mockResolvedValue(makeDbFile() as any);
      mockUpdateMeta.mockResolvedValue(makeDbFile() as any);
      mockTrackChanges.mockResolvedValue([{ field: "description" }] as any);
      mockRecordChanges.mockRejectedValueOnce(new Error("history down"));

      const req = createReq({ params: { id: "1" }, body: { description: "x" } });
      const res = createRes();
      await updateMetadata(req, res);

      // History is a side-effect; losing it must not fail the update.
      expect(mockRecordChanges).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("returns 403 for a project file the user has no claim on", async () => {
      mockGetFileById.mockResolvedValue(makeDbFile({ project_id: 9, uploaded_by: 99 }) as any);
      mockGetUserProjects.mockResolvedValue([{ id: 42 }] as any);
      mockGetProject.mockResolvedValue({ id: 9, owner: 99 } as any);

      const req = createReq({ params: { id: "1" }, body: { description: "x" } });
      const res = createRes();
      await updateMetadata(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockUpdateMeta).not.toHaveBeenCalled();
    });

    it("should return 400 for invalid file ID", async () => {
      const req = createReq({ params: { id: "abc" } });
      const res = createRes();
      await updateMetadata(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 when userId is invalid", async () => {
      const req = createReq({ params: { id: "1" }, userId: undefined });
      const res = createRes();
      await updateMetadata(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 403 when role lacks permission", async () => {
      const req = createReq({ params: { id: "1" }, role: "Auditor" });
      const res = createRes();
      await updateMetadata(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 404 when file is not found", async () => {
      mockGetFileById.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await updateMetadata(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 403 when org_id does not match", async () => {
      mockGetFileById.mockResolvedValue(makeDbFile({ organization_id: 2 }) as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await updateMetadata(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 400 for invalid review_status", async () => {
      mockGetFileById.mockResolvedValue(makeDbFile() as any);
      const req = createReq({
        params: { id: "1" },
        body: { review_status: "invalid_status" },
      });
      const res = createRes();
      await updateMetadata(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 for invalid version format", async () => {
      mockGetFileById.mockResolvedValue(makeDbFile() as any);
      const req = createReq({
        params: { id: "1" },
        body: { version: "v1" },
      });
      const res = createRes();
      await updateMetadata(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 for invalid tags", async () => {
      mockGetFileById.mockResolvedValue(makeDbFile() as any);
      const req = createReq({
        params: { id: "1" },
        body: { tags: "not-an-array" },
      });
      const res = createRes();
      await updateMetadata(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 for invalid expiry_date format", async () => {
      mockGetFileById.mockResolvedValue(makeDbFile() as any);
      const req = createReq({
        params: { id: "1" },
        body: { expiry_date: "invalid-date" },
      });
      const res = createRes();
      await updateMetadata(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 for non-string description", async () => {
      mockGetFileById.mockResolvedValue(makeDbFile() as any);
      const req = createReq({
        params: { id: "1" },
        body: { description: 123 },
      });
      const res = createRes();
      await updateMetadata(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 for description over 2000 chars", async () => {
      mockGetFileById.mockResolvedValue(makeDbFile() as any);
      const req = createReq({
        params: { id: "1" },
        body: { description: "x".repeat(2001) },
      });
      const res = createRes();
      await updateMetadata(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 200 on successful metadata update", async () => {
      mockGetFileById.mockResolvedValue(makeDbFile() as any);
      mockGetFileMeta.mockResolvedValue(makeDbFile() as any);
      mockUpdateMeta.mockResolvedValue(makeDbFile({ tags: ["tag1"] }) as any);
      const req = createReq({
        params: { id: "1" },
        body: { tags: ["tag1"], version: "2.0" },
      });
      const res = createRes();
      await updateMetadata(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return the full updated file record including tags in the response body", async () => {
      const updatedFile = makeDbFile({
        tags: ["tag1", "tag2"],
        version: "2.0",
        review_status: "approved",
        description: "updated description",
        last_modified_by: 1,
        updated_at: "2026-08-14T00:00:00.000Z",
      });
      mockGetFileById.mockResolvedValue(makeDbFile() as any);
      mockGetFileMeta.mockResolvedValue(makeDbFile() as any);
      mockUpdateMeta.mockResolvedValue(updatedFile as any);
      const req = createReq({
        params: { id: "1" },
        body: { tags: ["tag1", "tag2"], version: "2.0" },
      });
      const res = createRes();
      await updateMetadata(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: expect.objectContaining({
          id: 1,
          filename: "test.pdf",
          tags: ["tag1", "tag2"],
          version: "2.0",
          review_status: "approved",
          updated_at: "2026-08-14T00:00:00.000Z",
        }),
      });
    });

    it("should return 500 on error", async () => {
      mockGetFileById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await updateMetadata(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("listFilesWithMetadata", () => {
    it("should return 400 when userId is invalid", async () => {
      const req = createReq({ userId: undefined });
      const res = createRes();
      await listFilesWithMetadata(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 200 with files", async () => {
      mockGetOrgFilesMeta.mockResolvedValue({ files: [makeDbFile()], total: 1 });
      const req = createReq();
      const res = createRes();
      await listFilesWithMetadata(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 400 for invalid pagination", async () => {
      const req = createReq({ query: { pageSize: "101" } });
      const res = createRes();
      await listFilesWithMetadata(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 500 on error", async () => {
      mockGetOrgFilesMeta.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await listFilesWithMetadata(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("previewFile", () => {
    it("returns 403 for a project file the user has no claim on", async () => {
      mockGetFileById.mockResolvedValue(makeDbFile({ project_id: 9, uploaded_by: 99 }) as any);
      mockGetUserProjects.mockResolvedValue([{ id: 42 }] as any);
      mockGetProject.mockResolvedValue({ id: 9, owner: 99 } as any);

      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await previewFile(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 400 for invalid file ID", async () => {
      const req = createReq({ params: { id: "abc" } });
      const res = createRes();
      await previewFile(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when file is not found", async () => {
      mockGetFileById.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await previewFile(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 403 when org_id does not match", async () => {
      mockGetFileById.mockResolvedValue(makeDbFile({ organization_id: 2 }) as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await previewFile(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 404 when preview has no content", async () => {
      mockGetFileById.mockResolvedValue(makeDbFile() as any);
      mockGetPreview.mockResolvedValue({ canPreview: false, content: "", mimetype: "" } as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await previewFile(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 413 when file is too large for preview", async () => {
      mockGetFileById.mockResolvedValue(makeDbFile() as any);
      mockGetPreview.mockResolvedValue({
        canPreview: false,
        content: "some content that exists but too large",
        mimetype: "application/pdf",
      } as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await previewFile(req, res);
      expect(res.status).toHaveBeenCalledWith(413);
    });

    it("should send preview content with safe headers", async () => {
      mockGetFileById.mockResolvedValue(makeDbFile() as any);
      mockGetPreview.mockResolvedValue({
        canPreview: true,
        content: Buffer.from("preview data"),
        mimetype: "application/pdf",
        filename: "test.pdf",
      } as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await previewFile(req, res);
      expect(res.setHeader).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff");
      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Security-Policy",
        "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      );
      expect(res.send).toHaveBeenCalled();
    });

    it("should return 500 on error", async () => {
      mockGetFileById.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await previewFile(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getFileVersionHistory", () => {
    it("should return 400 for invalid file ID", async () => {
      const req = createReq({ params: { id: "abc" } });
      const res = createRes();
      await getFileVersionHistory(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when file is not found", async () => {
      mockGetFileMeta.mockResolvedValue(null as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getFileVersionHistory(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 200 with single file when no file_group_id", async () => {
      mockGetFileMeta.mockResolvedValue(makeDbFile({ file_group_id: null }) as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getFileVersionHistory(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 200 with versions when file_group_id exists", async () => {
      mockGetFileMeta.mockResolvedValue(makeDbFile({ file_group_id: 10 }) as any);
      mockGetVersions.mockResolvedValue({ versions: [makeDbFile()], total: 1 } as any);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getFileVersionHistory(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetFileMeta.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await getFileVersionHistory(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
