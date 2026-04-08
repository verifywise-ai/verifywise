import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  createProjectScope,
  deleteProjectScope,
  getAllProjectScopes,
  getProjectScopeById,
  updateProjectScope,
} from "../projectScope.repository";

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockProjectScope = {
  id: 1,
  projectId: 10,
  name: "Model Development",
  description: "Scope for model development and training",
  status: "active",
  startDate: "2026-03-12T00:00:00Z",
  endDate: "2026-12-31T00:00:00Z",
  createdAt: "2026-03-12T00:00:00Z",
  updatedAt: "2026-03-12T00:00:00Z",
};

const mockProjectScopes = [
  mockProjectScope,
  {
    id: 2,
    projectId: 10,
    name: "Testing & Validation",
    description: "Scope for model testing and validation",
    status: "active",
    startDate: "2026-04-01T00:00:00Z",
    endDate: "2026-06-30T00:00:00Z",
    createdAt: "2026-03-11T00:00:00Z",
    updatedAt: "2026-03-11T00:00:00Z",
  },
];

describe("projectScope.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("getAllProjectScopes", () => {
    it("should fetch all project scopes with defaults", async () => {
      const response = { data: mockProjectScopes };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllProjectScopes();

      expect(apiServices.get).toHaveBeenCalledWith("/projectScopes", {
        signal: undefined,
      });
      expect(result).toEqual(mockProjectScopes);
      expect(result).toHaveLength(2);
    });

    it("should fetch all scopes without parameters", async () => {
      const response = { data: mockProjectScopes };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllProjectScopes({});

      expect(apiServices.get).toHaveBeenCalledWith("/projectScopes", {
        signal: undefined,
      });
      expect(result).toEqual(mockProjectScopes);
    });

    it("should pass AbortSignal for request cancellation", async () => {
      const abortController = new AbortController();
      const response = { data: mockProjectScopes };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllProjectScopes({
        signal: abortController.signal,
      });

      expect(apiServices.get).toHaveBeenCalledWith("/projectScopes", {
        signal: abortController.signal,
      });
      expect(result).toEqual(mockProjectScopes);
    });

    it("should return empty array when no scopes exist", async () => {
      const response = { data: [] };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllProjectScopes();

      expect(result).toEqual([]);
    });

    it("should return single scope in array", async () => {
      const response = { data: [mockProjectScope] };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllProjectScopes();

      expect(result).toEqual([mockProjectScope]);
      expect(result).toHaveLength(1);
    });

    it("should handle API errors", async () => {
      const error = new Error("Network error");
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getAllProjectScopes()).rejects.toThrow("Network error");
    });

    it("should throw error with 500 status", async () => {
      const error = {
        response: { status: 500, data: { message: "Internal Server Error" } },
        message: "Server Error",
      };
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getAllProjectScopes()).rejects.toEqual(error);
    });

    it("should throw error with 403 forbidden", async () => {
      const error = {
        response: { status: 403, data: { message: "Forbidden" } },
        message: "Forbidden",
      };
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getAllProjectScopes()).rejects.toEqual(error);
    });
  });

  describe("getProjectScopeById", () => {
    it("should fetch project scope by ID", async () => {
      const response = { data: mockProjectScope };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getProjectScopeById({ id: 1 });

      expect(apiServices.get).toHaveBeenCalledWith("/projectScopes/1", {
        signal: undefined,
      });
      expect(result).toEqual(mockProjectScope);
    });

    it("should pass AbortSignal with scope fetch", async () => {
      const abortController = new AbortController();
      const response = { data: mockProjectScope };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getProjectScopeById({
        id: 1,
        signal: abortController.signal,
      });

      expect(apiServices.get).toHaveBeenCalledWith("/projectScopes/1", {
        signal: abortController.signal,
      });
      expect(result).toEqual(mockProjectScope);
    });

    it("should handle different scope IDs", async () => {
      const response = { data: mockProjectScope };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      await getProjectScopeById({ id: 25 });

      expect(apiServices.get).toHaveBeenCalledWith("/projectScopes/25", {
        signal: undefined,
      });
    });

    it("should throw error when scope not found", async () => {
      const error = {
        response: { status: 404, data: { message: "Scope not found" } },
        message: "Not Found",
      };
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getProjectScopeById({ id: 999 })).rejects.toEqual(error);
    });

    it("should throw error with 403 forbidden", async () => {
      const error = {
        response: { status: 403, data: { message: "Forbidden" } },
        message: "Forbidden",
      };
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getProjectScopeById({ id: 1 })).rejects.toEqual(error);
    });

    it("should handle network errors", async () => {
      const error = new Error("Network timeout");
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getProjectScopeById({ id: 1 })).rejects.toThrow(
        "Network timeout",
      );
    });
  });

  describe("createProjectScope", () => {
    it("should create a new project scope", async () => {
      const createData = {
        projectId: 10,
        name: "New Scope",
        description: "A new scope",
        status: "active",
      };
      const response = { data: mockProjectScope, status: 201 };
      vi.mocked(apiServices.post).mockResolvedValue(response as any);

      const result = await createProjectScope({ body: createData });

      expect(apiServices.post).toHaveBeenCalledWith(
        "/projectScopes",
        createData,
      );
      expect(result).toEqual(response);
    });

    it("should return full response object on create", async () => {
      const response = {
        data: mockProjectScope,
        status: 201,
        statusText: "Created",
      };
      vi.mocked(apiServices.post).mockResolvedValue(response as any);

      const result = await createProjectScope({ body: {} });

      expect(result).toEqual(response);
      expect(result.status).toBe(201);
    });

    it("should pass correct body to API", async () => {
      const createData = {
        projectId: 10,
        name: "Test Scope",
        description: "Test Description",
        startDate: "2026-03-12",
      };
      const response = { data: mockProjectScope };
      vi.mocked(apiServices.post).mockResolvedValue(response as any);

      await createProjectScope({ body: createData });

      expect(apiServices.post).toHaveBeenCalledWith(
        "/projectScopes",
        createData,
      );
    });

    it("should handle validation errors on create", async () => {
      const error = {
        response: { status: 422, data: { message: "Validation failed" } },
        message: "Unprocessable Entity",
      };
      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(createProjectScope({ body: {} })).rejects.toEqual(error);
    });

    it("should handle conflict on scope creation", async () => {
      const error = {
        response: {
          status: 409,
          data: { message: "Scope name already exists" },
        },
        message: "Conflict",
      };
      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(
        createProjectScope({ body: { name: "Duplicate" } }),
      ).rejects.toEqual(error);
    });

    it("should handle 403 forbidden on create", async () => {
      const error = {
        response: { status: 403, data: { message: "Forbidden" } },
        message: "Forbidden",
      };
      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(createProjectScope({ body: {} })).rejects.toEqual(error);
    });

    it("should handle 500 server error on create", async () => {
      const error = {
        response: { status: 500, data: { message: "Internal Server Error" } },
        message: "Server Error",
      };
      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(createProjectScope({ body: {} })).rejects.toEqual(error);
    });
  });

  describe("updateProjectScope", () => {
    it("should update an existing project scope", async () => {
      const updateData = {
        name: "Updated Scope",
        status: "completed",
      };
      const response = {
        data: { ...mockProjectScope, ...updateData },
        status: 200,
      };
      vi.mocked(apiServices.put).mockResolvedValue(response as any);

      const result = await updateProjectScope({ id: 1, body: updateData });

      expect(apiServices.put).toHaveBeenCalledWith(
        "/projectScopes/1",
        updateData,
      );
      expect(result).toEqual(response);
      expect(result.data.name).toBe("Updated Scope");
    });

    it("should return full response object on update", async () => {
      const response = {
        data: mockProjectScope,
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.put).mockResolvedValue(response as any);

      const result = await updateProjectScope({ id: 1, body: {} });

      expect(result).toEqual(response);
      expect(result.status).toBe(200);
    });

    it("should handle different scope IDs", async () => {
      const response = { data: mockProjectScope };
      vi.mocked(apiServices.put).mockResolvedValue(response as any);

      await updateProjectScope({ id: 15, body: { status: "archived" } });

      expect(apiServices.put).toHaveBeenCalledWith("/projectScopes/15", {
        status: "archived",
      });
    });

    it("should pass correct body to update endpoint", async () => {
      const updateData = {
        description: "Updated description",
        endDate: "2026-06-30",
      };
      const response = { data: mockProjectScope };
      vi.mocked(apiServices.put).mockResolvedValue(response as any);

      await updateProjectScope({ id: 1, body: updateData });

      expect(apiServices.put).toHaveBeenCalledWith(
        "/projectScopes/1",
        updateData,
      );
    });

    it("should handle scope not found on update", async () => {
      const error = {
        response: { status: 404, data: { message: "Scope not found" } },
        message: "Not Found",
      };
      vi.mocked(apiServices.put).mockRejectedValue(error);

      await expect(updateProjectScope({ id: 999, body: {} })).rejects.toEqual(
        error,
      );
    });

    it("should handle validation errors on update", async () => {
      const error = {
        response: { status: 422, data: { message: "Invalid data" } },
        message: "Unprocessable Entity",
      };
      vi.mocked(apiServices.put).mockRejectedValue(error);

      await expect(updateProjectScope({ id: 1, body: {} })).rejects.toEqual(
        error,
      );
    });

    it("should handle 403 forbidden on update", async () => {
      const error = {
        response: { status: 403, data: { message: "Forbidden" } },
        message: "Forbidden",
      };
      vi.mocked(apiServices.put).mockRejectedValue(error);

      await expect(updateProjectScope({ id: 1, body: {} })).rejects.toEqual(
        error,
      );
    });

    it("should handle 409 conflict on update", async () => {
      const error = {
        response: { status: 409, data: { message: "Conflict" } },
        message: "Conflict",
      };
      vi.mocked(apiServices.put).mockRejectedValue(error);

      await expect(updateProjectScope({ id: 1, body: {} })).rejects.toEqual(
        error,
      );
    });
  });

  describe("deleteProjectScope", () => {
    it("should delete a project scope", async () => {
      const response = { status: 204, data: null };
      vi.mocked(apiServices.delete).mockResolvedValue(response as any);

      const result = await deleteProjectScope({ id: 1 });

      expect(apiServices.delete).toHaveBeenCalledWith("/projectScopes/1");
      expect(result).toEqual(response);
    });

    it("should return response object on delete", async () => {
      const response = { status: 200, data: { message: "Deleted" } };
      vi.mocked(apiServices.delete).mockResolvedValue(response as any);

      const result = await deleteProjectScope({ id: 1 });

      expect(result).toEqual(response);
    });

    it("should handle different scope IDs on delete", async () => {
      const response = { status: 204 };
      vi.mocked(apiServices.delete).mockResolvedValue(response as any);

      await deleteProjectScope({ id: 25 });

      expect(apiServices.delete).toHaveBeenCalledWith("/projectScopes/25");
    });

    it("should handle scope not found on delete", async () => {
      const error = {
        response: { status: 404, data: { message: "Scope not found" } },
        message: "Not Found",
      };
      vi.mocked(apiServices.delete).mockRejectedValue(error);

      await expect(deleteProjectScope({ id: 999 })).rejects.toEqual(error);
    });

    it("should handle 403 forbidden on delete", async () => {
      const error = {
        response: { status: 403, data: { message: "Forbidden" } },
        message: "Forbidden",
      };
      vi.mocked(apiServices.delete).mockRejectedValue(error);

      await expect(deleteProjectScope({ id: 1 })).rejects.toEqual(error);
    });

    it("should handle 409 conflict on delete (scope has dependencies)", async () => {
      const error = {
        response: {
          status: 409,
          data: { message: "Cannot delete, scope has active assessments" },
        },
        message: "Conflict",
      };
      vi.mocked(apiServices.delete).mockRejectedValue(error);

      await expect(deleteProjectScope({ id: 1 })).rejects.toEqual(error);
    });

    it("should handle 500 server error on delete", async () => {
      const error = {
        response: { status: 500, data: { message: "Internal Server Error" } },
        message: "Server Error",
      };
      vi.mocked(apiServices.delete).mockRejectedValue(error);

      await expect(deleteProjectScope({ id: 1 })).rejects.toEqual(error);
    });
  });
});
