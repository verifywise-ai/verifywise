import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock customAxios before importing
vi.mock("../customAxios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock axios — networkServices imports { isAxiosError } via `import axios` default
vi.mock("axios", () => {
  const isAxiosError = (error: any) => error?.isAxiosError === true;
  return {
    default: { isAxiosError },
    isAxiosError,
  };
});

import { apiServices } from "../networkServices";
import CustomAxios from "../customAxios";

const mockAxios = vi.mocked(CustomAxios, { deep: true });

describe("apiServices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("get", () => {
    it("calls CustomAxios.get with endpoint and params", async () => {
      mockAxios.get.mockResolvedValue({
        data: { items: [] },
        status: 200,
        statusText: "OK",
      });

      const result = await apiServices.get("/users", { page: 1 });

      expect(mockAxios.get).toHaveBeenCalledWith("/users", {
        params: { page: 1 },
        responseType: "json",
        signal: undefined,
      });
      expect(result.data).toEqual({ items: [] });
      expect(result.status).toBe(200);
    });

    it("extracts signal and responseType from params", async () => {
      const controller = new AbortController();
      mockAxios.get.mockResolvedValue({
        data: "binary",
        status: 200,
        statusText: "OK",
      });

      await apiServices.get("/files", {
        signal: controller.signal,
        responseType: "blob",
        id: 1,
      });

      expect(mockAxios.get).toHaveBeenCalledWith("/files", {
        params: { id: 1 },
        responseType: "blob",
        signal: controller.signal,
      });
    });

    it("throws CustomException on error", async () => {
      mockAxios.get.mockRejectedValue({
        isAxiosError: true,
        message: "Network Error",
        response: {
          status: 500,
          data: { message: "Internal server error" },
        },
      });

      await expect(apiServices.get("/fail")).rejects.toThrow("Internal server error");
    });
  });

  describe("post", () => {
    it("calls CustomAxios.post with data", async () => {
      mockAxios.post.mockResolvedValue({
        data: { id: 1 },
        status: 201,
        statusText: "Created",
        headers: {},
      });

      const result = await apiServices.post("/users", { name: "Alice" });

      expect(mockAxios.post).toHaveBeenCalledWith("/users", { name: "Alice" }, {});
      expect(result.data).toEqual({ id: 1 });
      expect(result.status).toBe(201);
    });
  });

  describe("put", () => {
    it("calls CustomAxios.put with data", async () => {
      mockAxios.put.mockResolvedValue({
        data: { updated: true },
        status: 200,
        statusText: "OK",
      });

      const result = await apiServices.put("/users/1", { name: "Bob" });

      expect(mockAxios.put).toHaveBeenCalledWith("/users/1", { name: "Bob" }, {});
      expect(result.data).toEqual({ updated: true });
    });
  });

  describe("patch", () => {
    it("calls CustomAxios.patch with data", async () => {
      mockAxios.patch.mockResolvedValue({
        data: { patched: true },
        status: 200,
        statusText: "OK",
      });

      const result = await apiServices.patch("/users/1", { name: "Charlie" });

      expect(mockAxios.patch).toHaveBeenCalledWith("/users/1", { name: "Charlie" }, {});
      expect(result.data).toEqual({ patched: true });
    });
  });

  describe("delete", () => {
    it("calls CustomAxios.delete and returns data.data", async () => {
      mockAxios.delete.mockResolvedValue({
        data: { data: { deleted: true }, message: "Deleted" },
        status: 200,
        statusText: "OK",
      });

      const result = await apiServices.delete("/users/1");

      expect(mockAxios.delete).toHaveBeenCalledWith("/users/1", {});
      expect(result.data).toEqual({ deleted: true });
      expect(result.statusText).toBe("Deleted");
    });
  });

  describe("error handling", () => {
    it("extracts data.data string for validation errors", async () => {
      mockAxios.post.mockRejectedValue({
        isAxiosError: true,
        message: "Request failed",
        response: {
          status: 400,
          data: { data: "Email is required" },
        },
      });

      await expect(apiServices.post("/users", {})).rejects.toThrow("Email is required");
    });

    it("extracts data.error for alternative error format", async () => {
      mockAxios.get.mockRejectedValue({
        isAxiosError: true,
        message: "Request failed",
        response: {
          status: 422,
          data: { error: "Validation failed" },
        },
      });

      await expect(apiServices.get("/test")).rejects.toThrow("Validation failed");
    });

    it("falls back to error.message for non-Axios errors", async () => {
      mockAxios.get.mockRejectedValue(new Error("Something broke"));

      await expect(apiServices.get("/test")).rejects.toThrow("Something broke");
    });
  });
});
