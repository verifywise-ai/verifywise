import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  createRole,
  deleteRole,
  getAllRoles,
  getRoleById,
  updateRole,
} from "../role.repository";

vi.mock("../../../infrastructure/api/networkServices", () => {
  return {
    apiServices: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
  };
});

describe("Test Role Repository", () => {
  describe("getAllRoles", () => {
    beforeEach(vi.clearAllMocks);

    afterEach(vi.clearAllMocks);

    it("should call GET /roles with signal and return response data", async () => {
      const signal: AbortSignal = new AbortController().signal;
      const mockResponse = {
        data: [{ id: 1, name: "Admin" }],
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getAllRoles({ signal });

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/roles", { signal });
      expect(result).toEqual(mockResponse.data);
    });

    it("should call GET /roles with undefined signal when no params are provided", async () => {
      const mockResponse = {
        data: [{ id: 2, name: "Editor" }],
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getAllRoles();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/roles", {
        signal: undefined,
      });
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw an error if the API call fails", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getAllRoles()).rejects.toThrow("Network timeout");
    });
  });

  describe("getRoleById", () => {
    beforeEach(vi.clearAllMocks);

    afterEach(vi.clearAllMocks);

    it("should call GET /roles/:id with signal and return response data", async () => {
      const signal: AbortSignal = new AbortController().signal;
      const mockResponse = {
        data: { id: 1, name: "Admin" },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getRoleById({ id: 1, signal });

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/roles/1", { signal });
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = new Error("Role not found");

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getRoleById({ id: 999 })).rejects.toThrow("Role not found");
    });
  });

  describe("createRole", () => {
    beforeEach(vi.clearAllMocks);

    afterEach(vi.clearAllMocks);

    it("should call POST /roles with body and return full response", async () => {
      const body = { name: "Reviewer", permissions: ["read"] };
      const mockResponse = {
        data: { id: 3, ...body },
        status: 201,
        statusText: "Created",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await createRole({ body });

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith("/roles", body);
      expect(result).toEqual(mockResponse);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = new Error("Internal Server Error");

      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(createRole({ body: { name: "Reviewer" } })).rejects.toThrow(
        "Internal Server Error",
      );
    });
  });

  describe("updateRole", () => {
    beforeEach(vi.clearAllMocks);

    afterEach(vi.clearAllMocks);

    it("should call PUT /roles/:id with body and return full response", async () => {
      const body = { name: "Senior Reviewer" };
      const mockResponse = {
        data: { id: 3, ...body },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.put).mockResolvedValue(mockResponse);

      const result = await updateRole({ id: 3, body });

      expect(apiServices.put).toHaveBeenCalledTimes(1);
      expect(apiServices.put).toHaveBeenCalledWith("/roles/3", body);
      expect(result).toEqual(mockResponse);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = new Error("Conflict");

      vi.mocked(apiServices.put).mockRejectedValue(mockError);

      await expect(
        updateRole({ id: 3, body: { name: "Admin" } }),
      ).rejects.toThrow("Conflict");
    });
  });

  describe("deleteRole", () => {
    beforeEach(vi.clearAllMocks);

    afterEach(vi.clearAllMocks);

    it("should call DELETE /roles/:id and return full response", async () => {
      const mockResponse = {
        data: { success: true },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      const result = await deleteRole({ id: 4 });

      expect(apiServices.delete).toHaveBeenCalledTimes(1);
      expect(apiServices.delete).toHaveBeenCalledWith("/roles/4");
      expect(result).toEqual(mockResponse);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = new Error("Forbidden");

      vi.mocked(apiServices.delete).mockRejectedValue(mockError);

      await expect(deleteRole({ id: 4 })).rejects.toThrow("Forbidden");
    });
  });
});
