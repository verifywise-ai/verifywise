/* eslint-disable @typescript-eslint/no-explicit-any */
import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  attachFileToEntity,
  attachFilesToEntity,
  deleteFileFromManager,
  deleteQuestionEvidenceFiles,
  detachFileFromEntity,
  downloadFileFromManager,
  getEntityFiles,
  getFileById,
  getFileMetadata,
  getFilePreview,
  getFileVersionHistory,
  getFilesWithMetadata,
  getUserFilesMetaData,
  updateFileMetadata,
  uploadFileToManager,
} from "../file.repository";

vi.mock("../../../infrastructure/api/networkServices", () => {
  return {
    apiServices: {
      get: vi.fn() as any,
      post: vi.fn() as any,
      patch: vi.fn() as any,
      delete: vi.fn() as any,
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ------------------------------------------------------------------
// Shared mock file metadata (raw API shape)
// ------------------------------------------------------------------
const rawFileMock = {
  id: 42,
  filename: "report.pdf",
  size: 1024,
  mimetype: "application/pdf",
  upload_date: "2026-03-05T00:00:00.000Z",
  uploaded_by: 7,
  uploader_name: "Jane",
  uploader_surname: "Doe",
  source: "policy_editor",
  project_title: "Project Alpha",
  project_id: "10",
  parent_id: 1,
  sub_id: 2,
  meta_id: 3,
  is_evidence: true,
  tags: ["tag1"],
  review_status: "approved" as const,
  version: "1.0",
  expiry_date: "2027-01-01",
  last_modified_by: 8,
  last_modifier_name: "John",
  last_modifier_surname: "Smith",
  description: "A report",
  file_group_id: "grp-1",
  approval_workflow_id: 5,
  approval_workflow_name: "Default Workflow",
};

const mappedFileMock = {
  id: "42",
  filename: "report.pdf",
  size: 1024,
  mimetype: "application/pdf",
  upload_date: "2026-03-05T00:00:00.000Z",
  uploaded_by: "7",
  uploader_name: "Jane",
  uploader_surname: "Doe",
  source: "policy_editor",
  project_title: "Project Alpha",
  project_id: "10",
  parent_id: 1,
  sub_id: 2,
  meta_id: 3,
  is_evidence: true,
  tags: ["tag1"],
  review_status: "approved",
  version: "1.0",
  expiry_date: "2027-01-01",
  description: "A report",
  file_group_id: "grp-1",
  approval_workflow_id: 5,
  approval_workflow_name: "Default Workflow",
};

// ------------------------------------------------------------------

describe("Test File Repository", () => {
  describe("getFileById", () => {
    it("should call get with default responseType and return response.data", async () => {
      const id = "abc-123";
      const signal: AbortSignal = new AbortController().signal;
      const mockData = new Blob(["content"], { type: "application/pdf" });

      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: mockData,
      });

      const response = await getFileById({ id, signal });

      expect(apiServices.get).toHaveBeenCalledWith("/files/abc-123", {
        signal,
        responseType: "json",
      });
      expect(response).toEqual(mockData);
    });

    it("should call get with custom responseType", async () => {
      const id = "abc-123";
      const signal: AbortSignal = new AbortController().signal;
      const mockData = new Blob(["content"], { type: "application/pdf" });

      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: mockData,
      });

      const response = await getFileById({ id, signal, responseType: "blob" });

      expect(apiServices.get).toHaveBeenCalledWith("/files/abc-123", {
        signal,
        responseType: "blob",
      });
      expect(response).toEqual(mockData);
    });

    it("should call get with undefined signal when omitted", async () => {
      const id = "abc-123";

      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: "file-content",
      });

      await getFileById({ id });

      expect(apiServices.get).toHaveBeenCalledWith("/files/abc-123", {
        signal: undefined,
        responseType: "json",
      });
    });
  });

  describe("getUserFilesMetaData", () => {
    it("should call get for /file-manager and /files, merge and map results", async () => {
      const signal: AbortSignal = new AbortController().signal;

      vi.mocked(apiServices.get)
        .mockResolvedValueOnce({
          status: 200,
          statusText: "OK",
          data: { data: { files: [rawFileMock] } },
        })
        .mockResolvedValueOnce({
          status: 200,
          statusText: "OK",
          data: [],
        });

      const response = await getUserFilesMetaData({ signal });

      expect(apiServices.get).toHaveBeenCalledWith("/file-manager", { signal });
      expect(apiServices.get).toHaveBeenCalledWith("/files", { signal });
      expect(response).toHaveLength(1);
      expect(response[0]).toMatchObject(mappedFileMock);
    });

    it("should merge files from both endpoints", async () => {
      const fileFromFiles = {
        ...rawFileMock,
        id: 99,
        uploaded_time: "2026-01-01T00:00:00.000Z",
        upload_date: undefined,
      };

      vi.mocked(apiServices.get)
        .mockResolvedValueOnce({
          status: 200,
          statusText: "OK",
          data: { data: { files: [rawFileMock] } },
        })
        .mockResolvedValueOnce({
          status: 200,
          statusText: "OK",
          data: [fileFromFiles],
        });

      const response = await getUserFilesMetaData();

      expect(response).toHaveLength(2);
      expect(response[0].id).toBe("42");
      expect(response[1].id).toBe("99");
      expect(response[1].upload_date).toBe("2026-01-01T00:00:00.000Z");
    });

    it("should handle empty responses gracefully", async () => {
      vi.mocked(apiServices.get)
        .mockResolvedValueOnce({ status: 200, statusText: "OK", data: {} })
        .mockResolvedValueOnce({ status: 200, statusText: "OK", data: null });

      const response = await getUserFilesMetaData();

      expect(response).toEqual([]);
    });

    it("should default tags to empty array when tags field is absent", async () => {
      const fileWithoutTags = { ...rawFileMock, tags: undefined };

      vi.mocked(apiServices.get)
        .mockResolvedValueOnce({
          status: 200,
          statusText: "OK",
          data: { data: { files: [fileWithoutTags] } },
        })
        .mockResolvedValueOnce({ status: 200, statusText: "OK", data: [] });

      const response = await getUserFilesMetaData();

      expect(response[0].tags).toEqual([]);
    });
  });

  describe("uploadFileToManager", () => {
    it("should call post with FormData and return response.data", async () => {
      const file = new File(["content"], "test.pdf", {
        type: "application/pdf",
      });
      const signal: AbortSignal = new AbortController().signal;
      const mockResponse = {
        status: 201,
        statusText: "Created",
        data: {
          message: "File uploaded",
          data: {
            id: 1,
            filename: "test.pdf",
            size: 7,
            mimetype: "application/pdf",
            upload_date: "2026-03-05T00:00:00.000Z",
            uploaded_by: 3,
          },
        },
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const response = await uploadFileToManager({ file, signal });

      expect(apiServices.post).toHaveBeenCalledWith(
        "/file-manager",
        expect.any(FormData),
        expect.objectContaining({
          signal,
          headers: { "Content-Type": undefined },
        }),
      );
      expect(response).toEqual(mockResponse.data);
    });

    it("should include source and approval_workflow_id in FormData when provided", async () => {
      const file = new File(["content"], "test.pdf", {
        type: "application/pdf",
      });
      const mockResponse = {
        status: 200,
        statusText: "OK",
        data: {
          message: "File uploaded",
          data: {
            id: 2,
            filename: "test.pdf",
            size: 7,
            mimetype: "application/pdf",
            upload_date: "2026-03-05T00:00:00.000Z",
            uploaded_by: 1,
          },
        },
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await uploadFileToManager({
        file,
        model_id: "model-1",
        source: "evidence",
        approval_workflow_id: 10,
      });

      const formData = vi.mocked(apiServices.post).mock.calls[0][1] as FormData;
      expect(formData.get("source")).toBe("evidence");
      expect(formData.get("approval_workflow_id")).toBe("10");
      expect(formData.get("model_id")).toBe("model-1");
    });
  });

  describe("downloadFileFromManager", () => {
    it("should call get with responseType blob and return response.data", async () => {
      const id = "file-1";
      const signal: AbortSignal = new AbortController().signal;
      const mockBlob = new Blob(["pdf-data"], { type: "application/pdf" });

      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: mockBlob,
      });

      const response = await downloadFileFromManager({ id, signal });

      expect(apiServices.get).toHaveBeenCalledWith("/file-manager/file-1", {
        signal,
        responseType: "blob",
      });
      expect(response).toEqual(mockBlob);
    });

    it("should call get with undefined signal when omitted", async () => {
      const id = "file-2";

      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: new Blob(),
      });

      await downloadFileFromManager({ id });

      expect(apiServices.get).toHaveBeenCalledWith("/file-manager/file-2", {
        signal: undefined,
        responseType: "blob",
      });
    });
  });

  describe("deleteFileFromManager", () => {
    it("should call delete and return response.data", async () => {
      const id = "file-1";
      const signal: AbortSignal = new AbortController().signal;
      const mockResponse = {
        status: 200,
        statusText: "OK",
        data: { deleted: true },
      };

      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      const response = await deleteFileFromManager({ id, signal });

      expect(apiServices.delete).toHaveBeenCalledWith("/file-manager/file-1", {
        signal,
      });
      expect(response).toEqual({ deleted: true });
    });

    it("should call delete with undefined signal when omitted", async () => {
      vi.mocked(apiServices.delete).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: {},
      });

      await deleteFileFromManager({ id: "file-2" });

      expect(apiServices.delete).toHaveBeenCalledWith("/file-manager/file-2", {
        signal: undefined,
      });
    });
  });

  describe("deleteQuestionEvidenceFiles", () => {
    it("should call post with FormData containing required fields and return full response", async () => {
      const deleteFileIds = [1, 2, 3];
      const questionId = "q-10";
      const userId = "u-5";
      const projectId = "p-7";
      const mockResponse = {
        status: 200,
        statusText: "OK",
        data: { deleted: true },
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const response = await deleteQuestionEvidenceFiles({
        deleteFileIds,
        questionId,
        userId,
        projectId,
      });

      expect(apiServices.post).toHaveBeenCalledWith("/files", expect.any(FormData), {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const formData = vi.mocked(apiServices.post).mock.calls[0][1] as FormData;
      expect(formData.get("delete")).toBe(JSON.stringify(deleteFileIds));
      expect(formData.get("question_id")).toBe(questionId);
      expect(formData.get("user_id")).toBe(userId);
      expect(formData.get("project_id")).toBe(projectId);
      expect(response).toEqual(mockResponse);
    });

    it("should not include project_id in FormData when not provided", async () => {
      vi.mocked(apiServices.post).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: {},
      });

      await deleteQuestionEvidenceFiles({
        deleteFileIds: [1],
        questionId: "q-1",
        userId: "u-1",
      });

      const formData = vi.mocked(apiServices.post).mock.calls[0][1] as FormData;
      expect(formData.get("project_id")).toBeNull();
    });
  });

  describe("getFilesWithMetadata", () => {
    it("should call get with no query params when none provided and map results", async () => {
      const signal: AbortSignal = new AbortController().signal;

      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: {
          data: {
            files: [rawFileMock],
            pagination: { page: 1, limit: 10, total: 1 },
          },
        },
      });

      const response = await getFilesWithMetadata({ signal });

      expect(apiServices.get).toHaveBeenCalledWith("/file-manager/with-metadata", { signal });
      expect(response.files).toHaveLength(1);
      expect(response.files[0].id).toBe("42");
      expect(response.pagination).toEqual({ page: 1, limit: 10, total: 1 });
    });

    it("should include page and pageSize query params when provided", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: {
          data: { files: [], pagination: { page: 2, limit: 5, total: 0 } },
        },
      });

      await getFilesWithMetadata({ page: 2, pageSize: 5 });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/file-manager/with-metadata?page=2&pageSize=5",
        { signal: undefined },
      );
    });

    it("should handle response.data without nested data property", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: { files: [rawFileMock], pagination: null },
      });

      const response = await getFilesWithMetadata();

      expect(response.files).toHaveLength(1);
      expect(response.pagination).toBeNull();
    });

    it("should return empty files array when files is absent", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: { data: {} },
      });

      const response = await getFilesWithMetadata();

      expect(response.files).toEqual([]);
    });

    it("should default tags to empty array when tags field is absent", async () => {
      const fileWithoutTags = { ...rawFileMock, tags: undefined };

      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: { data: { files: [fileWithoutTags], pagination: null } },
      });

      const response = await getFilesWithMetadata();

      expect(response.files[0].tags).toEqual([]);
    });
  });

  describe("getFileMetadata", () => {
    it("should call get and return mapped FileMetadata", async () => {
      const id = "42";
      const signal: AbortSignal = new AbortController().signal;

      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: { data: rawFileMock },
      });

      const response = await getFileMetadata({ id, signal });

      expect(apiServices.get).toHaveBeenCalledWith("/file-manager/42/metadata", { signal });
      expect(response.id).toBe("42");
      expect(response.filename).toBe("report.pdf");
      expect(response.tags).toEqual(["tag1"]);
      expect(response.review_status).toBe("approved");
    });

    it("should handle response.data without nested data property", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: rawFileMock,
      });

      const response = await getFileMetadata({ id: "42" });

      expect(response.id).toBe("42");
    });

    it("should default tags to empty array when tags field is absent", async () => {
      const fileWithoutTags = { ...rawFileMock, tags: undefined };

      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: { data: fileWithoutTags },
      });

      const response = await getFileMetadata({ id: "42" });

      expect(response.tags).toEqual([]);
    });
  });

  describe("updateFileMetadata", () => {
    it("should call patch and return mapped FileMetadata", async () => {
      const id = "42";
      const updates = {
        tags: ["updated"],
        review_status: "pending_review" as const,
      };
      const signal: AbortSignal = new AbortController().signal;

      vi.mocked(apiServices.patch).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: { data: { ...rawFileMock, ...updates } },
      });

      const response = await updateFileMetadata({ id, updates, signal });

      expect(apiServices.patch).toHaveBeenCalledWith("/file-manager/42/metadata", updates, {
        signal,
      });
      expect(response.id).toBe("42");
      expect(response.tags).toEqual(["updated"]);
      expect(response.review_status).toBe("pending_review");
    });

    it("should call patch with undefined signal when omitted", async () => {
      vi.mocked(apiServices.patch).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: { data: rawFileMock },
      });

      await updateFileMetadata({
        id: "42",
        updates: { description: "new desc" },
      });

      expect(apiServices.patch).toHaveBeenCalledWith(
        "/file-manager/42/metadata",
        { description: "new desc" },
        { signal: undefined },
      );
    });

    it("should handle flat response.data without nested data property", async () => {
      vi.mocked(apiServices.patch).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: rawFileMock,
      });

      const response = await updateFileMetadata({
        id: "42",
        updates: { version: "2.0" },
      });

      expect(response.id).toBe("42");
      expect(response.version).toBe("1.0");
    });

    it("should default tags to empty array when tags field is absent", async () => {
      const fileWithoutTags = { ...rawFileMock, tags: undefined };

      vi.mocked(apiServices.patch).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: { data: fileWithoutTags },
      });

      const response = await updateFileMetadata({
        id: "42",
        updates: { description: "no tags" },
      });

      expect(response.tags).toEqual([]);
    });
  });

  describe("getFilePreview", () => {
    it("should call get with responseType blob and return response.data", async () => {
      const id = "file-1";
      const signal: AbortSignal = new AbortController().signal;
      const mockBlob = new Blob(["preview-data"], { type: "image/png" });

      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: mockBlob,
      });

      const response = await getFilePreview({ id, signal });

      expect(apiServices.get).toHaveBeenCalledWith("/file-manager/file-1/preview", {
        signal,
        responseType: "blob",
      });
      expect(response).toEqual(mockBlob);
    });

    it("should call get with undefined signal when omitted", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: new Blob(),
      });

      await getFilePreview({ id: "file-2" });

      expect(apiServices.get).toHaveBeenCalledWith("/file-manager/file-2/preview", {
        signal: undefined,
        responseType: "blob",
      });
    });
  });

  describe("getFileVersionHistory", () => {
    it("should call get and return mapped versions with pagination envelope", async () => {
      const id = "42";
      const signal: AbortSignal = new AbortController().signal;

      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: {
          data: {
            versions: [rawFileMock, { ...rawFileMock, id: 43, version: "2.0" }],
            pagination: { total: 2, page: 1, pageSize: 20, totalPages: 1 },
          },
        },
      });

      const response = await getFileVersionHistory({ id, signal });

      expect(apiServices.get).toHaveBeenCalledWith("/file-manager/42/versions", { signal });
      expect(response.versions).toHaveLength(2);
      expect(response.versions[0].id).toBe("42");
      expect(response.versions[1].id).toBe("43");
      expect(response.versions[1].version).toBe("2.0");
      expect(response.pagination).toEqual({ total: 2, page: 1, pageSize: 20, totalPages: 1 });
    });

    it("should forward page and pageSize as query params", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: {
          data: {
            versions: [],
            pagination: { total: 0, page: 3, pageSize: 5, totalPages: 0 },
          },
        },
      });

      await getFileVersionHistory({ id: "42", page: 3, pageSize: 5 });

      expect(apiServices.get).toHaveBeenCalledWith("/file-manager/42/versions?page=3&pageSize=5", {
        signal: undefined,
      });
    });

    it("should return empty versions and zeroed pagination when versions are absent", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: { data: {} },
      });

      const response = await getFileVersionHistory({ id: "42" });

      expect(response.versions).toEqual([]);
      expect(response.pagination.total).toBe(0);
    });

    it("should handle response.data without nested data property", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: { versions: [rawFileMock] },
      });

      const response = await getFileVersionHistory({ id: "42" });

      expect(response.versions).toHaveLength(1);
    });

    it("should default tags to empty array when tags field is absent", async () => {
      const fileWithoutTags = { ...rawFileMock, tags: undefined };

      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: { data: { versions: [fileWithoutTags] } },
      });

      const response = await getFileVersionHistory({ id: "42" });

      expect(response.versions[0].tags).toEqual([]);
    });
  });

  describe("attachFileToEntity", () => {
    it("should call post and return response.data", async () => {
      const params = {
        file_id: 42,
        framework_type: "eu_ai_act" as const,
        entity_type: "subcontrol" as const,
        entity_id: 10,
        project_id: 5,
        link_type: "evidence" as const,
      };
      const signal: AbortSignal = new AbortController().signal;
      const mockData = { message: "File attached", link: { id: 1, ...params } };

      vi.mocked(apiServices.post).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: mockData,
      });

      const response = await attachFileToEntity(params, signal);

      expect(apiServices.post).toHaveBeenCalledWith("/files/attach", params, {
        signal,
      });
      expect(response).toEqual(mockData);
    });

    it("should call post with undefined signal when omitted", async () => {
      const params = {
        file_id: 1,
        framework_type: "nist_ai" as const,
        entity_type: "assessment" as const,
        entity_id: 5,
      };

      vi.mocked(apiServices.post).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: { message: "ok" },
      });

      await attachFileToEntity(params);

      expect(apiServices.post).toHaveBeenCalledWith("/files/attach", params, {
        signal: undefined,
      });
    });
  });

  describe("attachFilesToEntity", () => {
    it("should call post to bulk endpoint and return response.data", async () => {
      const params = {
        file_ids: [1, 2, 3],
        framework_type: "iso_27001" as const,
        entity_type: "annex_control" as const,
        entity_id: 20,
      };
      const mockData = {
        message: "Files attached",
        results: [
          { file_id: 1, success: true, message: "ok" },
          { file_id: 2, success: true, message: "ok" },
          { file_id: 3, success: false, message: "already attached" },
        ],
      };

      vi.mocked(apiServices.post).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: mockData,
      });

      const response = await attachFilesToEntity(params);

      expect(apiServices.post).toHaveBeenCalledWith("/files/attach-bulk", params, {
        signal: undefined,
      });
      expect(response).toEqual(mockData);
    });

    it("should call post with signal when provided", async () => {
      const params = {
        file_ids: [4, 5],
        framework_type: "iso_42001" as const,
        entity_type: "subclause" as const,
        entity_id: 8,
        project_id: 2,
        link_type: "attachment" as const,
      };
      const signal: AbortSignal = new AbortController().signal;
      const mockData = {
        message: "Files attached",
        results: [{ file_id: 4, success: true, message: "ok" }],
      };

      vi.mocked(apiServices.post).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: mockData,
      });

      const response = await attachFilesToEntity(params, signal);

      expect(apiServices.post).toHaveBeenCalledWith("/files/attach-bulk", params, { signal });
      expect(response).toEqual(mockData);
    });
  });

  describe("detachFileFromEntity", () => {
    it("should call delete with data in body and return response.data", async () => {
      const params = {
        file_id: 42,
        framework_type: "eu_ai_act" as const,
        entity_type: "subcontrol" as const,
        entity_id: 10,
      };
      const signal: AbortSignal = new AbortController().signal;
      const mockData = { message: "File detached" };

      vi.mocked(apiServices.delete).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: mockData,
      });

      const response = await detachFileFromEntity(params, signal);

      expect(apiServices.delete).toHaveBeenCalledWith("/files/detach", {
        data: params,
        signal,
      });
      expect(response).toEqual(mockData);
    });

    it("should call delete with undefined signal when omitted", async () => {
      const params = {
        file_id: 1,
        framework_type: "nist_ai" as const,
        entity_type: "assessment" as const,
        entity_id: 5,
      };

      vi.mocked(apiServices.delete).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: { message: "ok" },
      });

      await detachFileFromEntity(params);

      expect(apiServices.delete).toHaveBeenCalledWith("/files/detach", {
        data: params,
        signal: undefined,
      });
    });
  });

  describe("getEntityFiles", () => {
    it("should call get and return paginated EntityFilesPage envelope", async () => {
      const signal: AbortSignal = new AbortController().signal;

      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: {
          files: [rawFileMock],
          pagination: { total: 1, page: 1, pageSize: 50, totalPages: 1 },
        },
      });

      const response = await getEntityFiles("eu_ai_act", "subcontrol", 10, signal);

      expect(apiServices.get).toHaveBeenCalledWith("/files/entity/eu_ai_act/subcontrol/10", {
        signal,
      });
      expect(response.files).toHaveLength(1);
      expect(response.files[0].id).toBe("42");
      expect(response.files[0].filename).toBe("report.pdf");
      expect(response.files[0].tags).toEqual(["tag1"]);
      expect(response.pagination).toEqual({ total: 1, page: 1, pageSize: 50, totalPages: 1 });
    });

    it("should still accept the legacy raw-array response shape", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: [rawFileMock],
      });

      const response = await getEntityFiles("eu_ai_act", "subcontrol", 10);

      expect(response.files).toHaveLength(1);
      expect(response.files[0].id).toBe("42");
      expect(response.pagination.total).toBe(1);
    });

    it("should forward page and pageSize as query params", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: {
          files: [],
          pagination: { total: 0, page: 2, pageSize: 25, totalPages: 0 },
        },
      });

      await getEntityFiles("eu_ai_act", "subcontrol", 10, { page: 2, pageSize: 25 });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/files/entity/eu_ai_act/subcontrol/10?page=2&pageSize=25",
        { signal: undefined },
      );
    });

    it("should return empty files when response.data is empty", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: [],
      });

      const response = await getEntityFiles("nist_ai", "assessment", 5);

      expect(apiServices.get).toHaveBeenCalledWith("/files/entity/nist_ai/assessment/5", {
        signal: undefined,
      });
      expect(response.files).toEqual([]);
      expect(response.pagination.total).toBe(0);
    });

    it("should return empty files when response.data is null", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: null,
      });

      const response = await getEntityFiles("eu_ai_act", "subcontrol", 7);

      expect(response.files).toEqual([]);
      expect(response.pagination.total).toBe(0);
    });

    it("should default tags to empty array when tags field is absent", async () => {
      const fileWithoutTags = { ...rawFileMock, tags: undefined };

      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: {
          files: [fileWithoutTags],
          pagination: { total: 1, page: 1, pageSize: 50, totalPages: 1 },
        },
      });

      const response = await getEntityFiles("eu_ai_act", "subcontrol", 10);

      expect(response.files[0].tags).toEqual([]);
    });
  });
});
