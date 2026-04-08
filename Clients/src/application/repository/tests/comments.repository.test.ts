import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  addReaction,
  createComment,
  deleteComment,
  deleteFile,
  downloadFile,
  getCommentsByTableRow,
  getFilesByTableRow,
  getTableCounts,
  markAsRead,
  removeReaction,
  updateComment,
  uploadFile,
} from "../comments.repository";

vi.mock("../../../infrastructure/api/networkServices", () => {
  return {
    apiServices: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      patch: vi.fn(),
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Test Comments Repository", () => {
  describe("getCommentsByTableRow", () => {
    it("should call get with pagination and signal and return response.data", async () => {
      const signal = new AbortController().signal;
      const mockData = { message: "OK", data: [{ id: 1, message: "hello" }] };

      vi.mocked(apiServices.get).mockResolvedValue({ data: mockData } as any);

      const response = await getCommentsByTableRow({
        tableId: "tasks",
        rowId: 100,
        page: 2,
        limit: 25,
        signal,
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/comments/tasks/100?page=2&limit=25",
        { signal },
      );
      expect(response).toEqual(mockData);
    });

    it("should use default page and limit", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({
        data: { ok: true },
      } as any);

      await getCommentsByTableRow({
        tableId: "vendors",
        rowId: "abc",
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/comments/vendors/abc?page=1&limit=50",
        { signal: undefined },
      );
    });
  });

  describe("createComment", () => {
    it("should call post /comments with payload and return response.data", async () => {
      const mockData = { id: 1, tableId: "tasks", rowId: "1", message: "new" };
      vi.mocked(apiServices.post).mockResolvedValue({ data: mockData } as any);

      const response = await createComment({
        tableId: "tasks",
        rowId: "1",
        message: "new",
      });

      expect(apiServices.post).toHaveBeenCalledWith("/comments", {
        tableId: "tasks",
        rowId: "1",
        message: "new",
      });
      expect(response).toEqual(mockData);
    });
  });

  describe("updateComment", () => {
    it("should call put with comment id and message", async () => {
      const mockData = { id: 22, message: "updated" };
      vi.mocked(apiServices.put).mockResolvedValue({ data: mockData } as any);

      const response = await updateComment({
        commentId: 22,
        message: "updated",
      });

      expect(apiServices.put).toHaveBeenCalledWith("/comments/22", {
        message: "updated",
      });
      expect(response).toEqual(mockData);
    });
  });

  describe("deleteComment", () => {
    it("should call delete with comment id", async () => {
      const mockData = { success: true };
      vi.mocked(apiServices.delete).mockResolvedValue({
        data: mockData,
      } as any);

      const response = await deleteComment({ commentId: 9 });

      expect(apiServices.delete).toHaveBeenCalledWith("/comments/9");
      expect(response).toEqual(mockData);
    });
  });

  describe("getFilesByTableRow", () => {
    it("should call get files endpoint with signal", async () => {
      const signal = new AbortController().signal;
      const mockData = [{ id: "f1" }];
      vi.mocked(apiServices.get).mockResolvedValue({ data: mockData } as any);

      const response = await getFilesByTableRow({
        tableId: "tasks",
        rowId: 10,
        signal,
      });

      expect(apiServices.get).toHaveBeenCalledWith("/comments/tasks/10/files", {
        signal,
      });
      expect(response).toEqual(mockData);
    });
  });

  describe("uploadFile", () => {
    it("should call post with multipart form data and trigger progress callback", async () => {
      const mockData = { id: "file-1" };
      vi.mocked(apiServices.post).mockResolvedValue({ data: mockData } as any);
      const onProgress = vi.fn();
      const file = new File(["content"], "doc.txt", { type: "text/plain" });

      const response = await uploadFile({
        tableId: "tasks",
        rowId: 77,
        file,
        commentId: 5,
        onProgress,
      });

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      const [url, formData, config] = vi.mocked(apiServices.post).mock
        .calls[0] as any;
      expect(url).toBe("/comments/files");
      expect(formData).toBeInstanceOf(FormData);
      expect(formData.get("tableId")).toBe("tasks");
      expect(formData.get("rowId")).toBe("77");
      expect(formData.get("commentId")).toBe("5");
      expect(formData.get("file")).toBe(file);
      expect(config.headers["Content-Type"]).toBe("multipart/form-data");

      config.onUploadProgress({ loaded: 20, total: 40 });
      expect(onProgress).toHaveBeenCalledWith(50);
      expect(response).toEqual(mockData);
    });

    it("should not append commentId when not provided and should ignore progress when total missing", async () => {
      vi.mocked(apiServices.post).mockResolvedValue({
        data: { ok: true },
      } as any);
      const onProgress = vi.fn();
      const file = new File(["content"], "doc.txt", { type: "text/plain" });

      await uploadFile({
        tableId: "risks",
        rowId: "r-1",
        file,
        onProgress,
      });

      const [, formData, config] = vi.mocked(apiServices.post).mock
        .calls[0] as any;
      expect(formData.get("commentId")).toBeNull();

      config.onUploadProgress({ loaded: 20, total: undefined });
      expect(onProgress).not.toHaveBeenCalled();
    });
  });

  describe("downloadFile", () => {
    it("should call get with blob responseType and return blob", async () => {
      const blob = new Blob(["abc"], { type: "text/plain" });
      vi.mocked(apiServices.get).mockResolvedValue({ data: blob } as any);

      const response = await downloadFile({ fileId: "f-22" });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/comments/files/f-22/download",
        { responseType: "blob" },
      );
      expect(response).toBe(blob);
    });
  });

  describe("deleteFile", () => {
    it("should call delete file endpoint", async () => {
      const mockData = { deleted: true };
      vi.mocked(apiServices.delete).mockResolvedValue({
        data: mockData,
      } as any);

      const response = await deleteFile({ fileId: "f-99" });

      expect(apiServices.delete).toHaveBeenCalledWith("/comments/files/f-99");
      expect(response).toEqual(mockData);
    });
  });

  describe("addReaction", () => {
    it("should call post reaction endpoint with emoji", async () => {
      const mockData = { ok: true };
      vi.mocked(apiServices.post).mockResolvedValue({ data: mockData } as any);

      const response = await addReaction({ commentId: "12", emoji: "👍" });

      expect(apiServices.post).toHaveBeenCalledWith("/comments/12/reactions", {
        emoji: "👍",
      });
      expect(response).toEqual(mockData);
    });
  });

  describe("removeReaction", () => {
    it("should call delete reaction endpoint with encoded emoji", async () => {
      const mockData = { ok: true };
      vi.mocked(apiServices.delete).mockResolvedValue({
        data: mockData,
      } as any);

      const response = await removeReaction({ commentId: "12", emoji: "👍" });

      expect(apiServices.delete).toHaveBeenCalledWith(
        "/comments/12/reactions/%F0%9F%91%8D",
      );
      expect(response).toEqual(mockData);
    });
  });

  describe("getTableCounts", () => {
    it("should return nested data when backend returns { data: counts }", async () => {
      const counts = { "1": { unreadCount: 2, fileCount: 4 } };
      vi.mocked(apiServices.get).mockResolvedValue({
        data: { message: "OK", data: counts },
      } as any);

      const response = await getTableCounts({ tableId: "tasks" });

      expect(apiServices.get).toHaveBeenCalledWith("/comments/tasks/counts", {
        signal: undefined,
      });
      expect(response).toEqual(counts);
    });

    it("should fallback to response.data when nested data is missing", async () => {
      const counts = { "2": { unreadCount: 1, fileCount: 0 } };
      vi.mocked(apiServices.get).mockResolvedValue({ data: counts } as any);

      const response = await getTableCounts({ tableId: "tasks" });

      expect(response).toEqual(counts);
    });
  });

  describe("markAsRead", () => {
    it("should call post mark-read endpoint converting rowId to string", async () => {
      const mockData = { success: true };
      vi.mocked(apiServices.post).mockResolvedValue({ data: mockData } as any);

      const response = await markAsRead({ tableId: "tasks", rowId: 101 });

      expect(apiServices.post).toHaveBeenCalledWith("/comments/mark-read", {
        tableId: "tasks",
        rowId: "101",
      });
      expect(response).toEqual(mockData);
    });
  });
});
