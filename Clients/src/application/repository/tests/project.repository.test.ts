import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  createProject,
  deleteProject,
  getAllProjects,
  getProjectById,
  getProjectProgressData,
  updateProject,
} from "../project.repository";

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockProject = {
  id: 1,
  name: "AI Model Assessment",
  description: "Assessment for AI model deployment",
  status: "active",
  startDate: "2026-03-12T00:00:00Z",
  endDate: "2026-12-31T00:00:00Z",
  createdAt: "2026-03-12T00:00:00Z",
  updatedAt: "2026-03-12T00:00:00Z",
};

const mockProjects = [
  mockProject,
  {
    id: 2,
    name: "GDPR Compliance",
    description: "GDPR compliance project",
    status: "active",
    startDate: "2026-02-01T00:00:00Z",
    endDate: "2026-12-31T00:00:00Z",
    createdAt: "2026-02-01T00:00:00Z",
    updatedAt: "2026-02-01T00:00:00Z",
  },
];

const mockProgressData = {
  projectId: 1,
  completionPercentage: 65,
  tasksTotal: 20,
  tasksCompleted: 13,
  risksIdentified: 5,
  risksResolved: 2,
  lastUpdated: "2026-03-12T00:00:00Z",
};

describe("project.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("getAllProjects", () => {
    it("should fetch all projects with defaults", async () => {
      const response = { data: mockProjects };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllProjects();

      expect(apiServices.get).toHaveBeenCalledWith("/projects", {
        signal: undefined,
      });
      expect(result).toEqual(mockProjects);
      expect(result).toHaveLength(2);
    });

    it("should fetch all projects without parameters", async () => {
      const response = { data: mockProjects };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllProjects({});

      expect(apiServices.get).toHaveBeenCalledWith("/projects", {
        signal: undefined,
      });
      expect(result).toEqual(mockProjects);
    });

    it("should pass AbortSignal for request cancellation", async () => {
      const abortController = new AbortController();
      const response = { data: mockProjects };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllProjects({ signal: abortController.signal });

      expect(apiServices.get).toHaveBeenCalledWith("/projects", {
        signal: abortController.signal,
      });
      expect(result).toEqual(mockProjects);
    });

    it("should return empty array when no projects exist", async () => {
      const response = { data: [] };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllProjects();

      expect(result).toEqual([]);
    });

    it("should return single project in array", async () => {
      const response = { data: [mockProject] };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllProjects();

      expect(result).toEqual([mockProject]);
      expect(result).toHaveLength(1);
    });

    it("should handle API errors", async () => {
      const error = new Error("Network error");
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getAllProjects()).rejects.toThrow("Network error");
    });

    it("should throw error with 500 status", async () => {
      const error = {
        response: { status: 500, data: { message: "Internal Server Error" } },
        message: "Server Error",
      };
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getAllProjects()).rejects.toEqual(error);
    });

    it("should throw error with 403 forbidden", async () => {
      const error = {
        response: { status: 403, data: { message: "Forbidden" } },
        message: "Forbidden",
      };
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getAllProjects()).rejects.toEqual(error);
    });
  });

  describe("getProjectById", () => {
    it("should fetch project by ID", async () => {
      const response = { data: mockProject };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getProjectById({ id: "1" });

      expect(apiServices.get).toHaveBeenCalledWith("/projects/1", {
        signal: undefined,
      });
      expect(result).toEqual(mockProject);
    });

    it("should pass AbortSignal with project fetch", async () => {
      const abortController = new AbortController();
      const response = { data: mockProject };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getProjectById({
        id: "1",
        signal: abortController.signal,
      });

      expect(apiServices.get).toHaveBeenCalledWith("/projects/1", {
        signal: abortController.signal,
      });
      expect(result).toEqual(mockProject);
    });

    it("should handle different project IDs", async () => {
      const response = { data: mockProject };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      await getProjectById({ id: "25" });

      expect(apiServices.get).toHaveBeenCalledWith("/projects/25", {
        signal: undefined,
      });
    });

    it("should handle UUID-style project IDs", async () => {
      const uuidId = "a1b2c3d4-e5f6-4789-a012-b3c4d5e6f7g8";
      const response = { data: mockProject };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      await getProjectById({ id: uuidId });

      expect(apiServices.get).toHaveBeenCalledWith(`/projects/${uuidId}`, {
        signal: undefined,
      });
    });

    it("should throw error when project not found", async () => {
      const error = {
        response: { status: 404, data: { message: "Project not found" } },
        message: "Not Found",
      };
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getProjectById({ id: "999" })).rejects.toEqual(error);
    });

    it("should throw error with 403 forbidden", async () => {
      const error = {
        response: { status: 403, data: { message: "Forbidden" } },
        message: "Forbidden",
      };
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getProjectById({ id: "1" })).rejects.toEqual(error);
    });

    it("should handle network errors", async () => {
      const error = new Error("Network timeout");
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getProjectById({ id: "1" })).rejects.toThrow(
        "Network timeout",
      );
    });
  });

  describe("createProject", () => {
    it("should create a new project", async () => {
      const createData = {
        name: "New Project",
        description: "A new project",
        status: "active",
      };
      const response = { data: mockProject, status: 201 };
      vi.mocked(apiServices.post).mockResolvedValue(response as any);

      const result = await createProject({ body: createData });

      expect(apiServices.post).toHaveBeenCalledWith("/projects", createData);
      expect(result).toEqual(response);
    });

    it("should return full response object on create", async () => {
      const response = {
        data: mockProject,
        status: 201,
        statusText: "Created",
      };
      vi.mocked(apiServices.post).mockResolvedValue(response as any);

      const result = await createProject({ body: {} });

      expect(result).toEqual(response);
      expect(result.status).toBe(201);
    });

    it("should pass correct body to API", async () => {
      const createData = {
        name: "Test Project",
        description: "Test Description",
        startDate: "2026-03-12",
      };
      const response = { data: mockProject };
      vi.mocked(apiServices.post).mockResolvedValue(response as any);

      await createProject({ body: createData });

      expect(apiServices.post).toHaveBeenCalledWith("/projects", createData);
    });

    it("should handle validation errors on create", async () => {
      const error = {
        response: { status: 422, data: { message: "Validation failed" } },
        message: "Unprocessable Entity",
      };
      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(createProject({ body: {} })).rejects.toEqual(error);
    });

    it("should handle conflict on project creation", async () => {
      const error = {
        response: {
          status: 409,
          data: { message: "Project name already exists" },
        },
        message: "Conflict",
      };
      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(
        createProject({ body: { name: "Duplicate" } }),
      ).rejects.toEqual(error);
    });

    it("should handle 403 forbidden on create", async () => {
      const error = {
        response: { status: 403, data: { message: "Forbidden" } },
        message: "Forbidden",
      };
      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(createProject({ body: {} })).rejects.toEqual(error);
    });

    it("should handle 500 server error on create", async () => {
      const error = {
        response: { status: 500, data: { message: "Internal Server Error" } },
        message: "Server Error",
      };
      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(createProject({ body: {} })).rejects.toEqual(error);
    });
  });

  describe("updateProject", () => {
    it("should update an existing project", async () => {
      const updateData = {
        name: "Updated Project",
        status: "completed",
      };
      const response = { data: { ...mockProject, ...updateData }, status: 200 };
      vi.mocked(apiServices.patch).mockResolvedValue(response as any);

      const result = await updateProject({ id: 1, body: updateData });

      expect(apiServices.patch).toHaveBeenCalledWith("/projects/1", updateData);
      expect(result).toEqual(response);
      expect(result.data.name).toBe("Updated Project");
    });

    it("should return full response object on update", async () => {
      const response = { data: mockProject, status: 200, statusText: "OK" };
      vi.mocked(apiServices.patch).mockResolvedValue(response as any);

      const result = await updateProject({ id: 1, body: {} });

      expect(result).toEqual(response);
      expect(result.status).toBe(200);
    });

    it("should handle different project IDs", async () => {
      const response = { data: mockProject };
      vi.mocked(apiServices.patch).mockResolvedValue(response as any);

      await updateProject({ id: 15, body: { status: "archived" } });

      expect(apiServices.patch).toHaveBeenCalledWith("/projects/15", {
        status: "archived",
      });
    });

    it("should pass correct body to update endpoint", async () => {
      const updateData = {
        description: "Updated description",
        endDate: "2026-06-30",
      };
      const response = { data: mockProject };
      vi.mocked(apiServices.patch).mockResolvedValue(response as any);

      await updateProject({ id: 1, body: updateData });

      expect(apiServices.patch).toHaveBeenCalledWith("/projects/1", updateData);
    });

    it("should handle project not found on update", async () => {
      const error = {
        response: { status: 404, data: { message: "Project not found" } },
        message: "Not Found",
      };
      vi.mocked(apiServices.patch).mockRejectedValue(error);

      await expect(updateProject({ id: 999, body: {} })).rejects.toEqual(error);
    });

    it("should handle validation errors on update", async () => {
      const error = {
        response: { status: 422, data: { message: "Invalid data" } },
        message: "Unprocessable Entity",
      };
      vi.mocked(apiServices.patch).mockRejectedValue(error);

      await expect(updateProject({ id: 1, body: {} })).rejects.toEqual(error);
    });

    it("should handle 403 forbidden on update", async () => {
      const error = {
        response: { status: 403, data: { message: "Forbidden" } },
        message: "Forbidden",
      };
      vi.mocked(apiServices.patch).mockRejectedValue(error);

      await expect(updateProject({ id: 1, body: {} })).rejects.toEqual(error);
    });

    it("should handle 409 conflict on update", async () => {
      const error = {
        response: { status: 409, data: { message: "Conflict" } },
        message: "Conflict",
      };
      vi.mocked(apiServices.patch).mockRejectedValue(error);

      await expect(updateProject({ id: 1, body: {} })).rejects.toEqual(error);
    });
  });

  describe("deleteProject", () => {
    it("should delete a project", async () => {
      const response = { status: 204, data: null };
      vi.mocked(apiServices.delete).mockResolvedValue(response as any);

      const result = await deleteProject({ id: 1 });

      expect(apiServices.delete).toHaveBeenCalledWith("/projects/1");
      expect(result).toEqual(response);
    });

    it("should return response object on delete", async () => {
      const response = { status: 200, data: { message: "Deleted" } };
      vi.mocked(apiServices.delete).mockResolvedValue(response as any);

      const result = await deleteProject({ id: 1 });

      expect(result).toEqual(response);
    });

    it("should handle different project IDs on delete", async () => {
      const response = { status: 204 };
      vi.mocked(apiServices.delete).mockResolvedValue(response as any);

      await deleteProject({ id: 25 });

      expect(apiServices.delete).toHaveBeenCalledWith("/projects/25");
    });

    it("should handle project not found on delete", async () => {
      const error = {
        response: { status: 404, data: { message: "Project not found" } },
        message: "Not Found",
      };
      vi.mocked(apiServices.delete).mockRejectedValue(error);

      await expect(deleteProject({ id: 999 })).rejects.toEqual(error);
    });

    it("should handle 403 forbidden on delete", async () => {
      const error = {
        response: { status: 403, data: { message: "Forbidden" } },
        message: "Forbidden",
      };
      vi.mocked(apiServices.delete).mockRejectedValue(error);

      await expect(deleteProject({ id: 1 })).rejects.toEqual(error);
    });

    it("should handle 409 conflict on delete (project has dependencies)", async () => {
      const error = {
        response: {
          status: 409,
          data: { message: "Cannot delete, project has active assessments" },
        },
        message: "Conflict",
      };
      vi.mocked(apiServices.delete).mockRejectedValue(error);

      await expect(deleteProject({ id: 1 })).rejects.toEqual(error);
    });

    it("should handle 500 server error on delete", async () => {
      const error = {
        response: { status: 500, data: { message: "Internal Server Error" } },
        message: "Server Error",
      };
      vi.mocked(apiServices.delete).mockRejectedValue(error);

      await expect(deleteProject({ id: 1 })).rejects.toEqual(error);
    });
  });

  describe("getProjectProgressData", () => {
    it("should fetch project progress data with dynamic route", async () => {
      const response = { data: mockProgressData };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getProjectProgressData({
        routeUrl: "/projects/1/progress",
      });

      expect(apiServices.get).toHaveBeenCalledWith("/projects/1/progress", {
        signal: undefined,
      });
      expect(result).toEqual(mockProgressData);
    });

    it("should pass AbortSignal for progress data request", async () => {
      const abortController = new AbortController();
      const response = { data: mockProgressData };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getProjectProgressData({
        routeUrl: "/projects/1/progress",
        signal: abortController.signal,
      });

      expect(apiServices.get).toHaveBeenCalledWith("/projects/1/progress", {
        signal: abortController.signal,
      });
      expect(result).toEqual(mockProgressData);
    });

    it("should support different progress endpoints", async () => {
      const response = { data: mockProgressData };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      await getProjectProgressData({
        routeUrl: "/projects/5/progress/detailed",
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/projects/5/progress/detailed",
        {
          signal: undefined,
        },
      );
    });

    it("should handle dynamic route URLs with query parameters", async () => {
      const response = { data: mockProgressData };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      await getProjectProgressData({
        routeUrl: "/projects/1/progress?detailed=true&includeRisks=true",
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/projects/1/progress?detailed=true&includeRisks=true",
        { signal: undefined },
      );
    });

    it("should return progress data object", async () => {
      const progressData = {
        completionPercentage: 75,
        tasksTotal: 20,
        tasksCompleted: 15,
      };
      const response = { data: progressData };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getProjectProgressData({
        routeUrl: "/projects/1/progress",
      });

      expect(result).toEqual(progressData);
      expect(result.completionPercentage).toBe(75);
    });

    it("should handle empty progress data", async () => {
      const response = { data: {} };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getProjectProgressData({
        routeUrl: "/projects/1/progress",
      });

      expect(result).toEqual({});
    });

    it("should throw error when project progress not found", async () => {
      const error = {
        response: { status: 404, data: { message: "Progress data not found" } },
        message: "Not Found",
      };
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(
        getProjectProgressData({ routeUrl: "/projects/999/progress" }),
      ).rejects.toEqual(error);
    });

    it("should throw error with 403 forbidden", async () => {
      const error = {
        response: { status: 403, data: { message: "Forbidden" } },
        message: "Forbidden",
      };
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(
        getProjectProgressData({ routeUrl: "/projects/1/progress" }),
      ).rejects.toEqual(error);
    });

    it("should handle network errors on progress fetch", async () => {
      const error = new Error("Network timeout");
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(
        getProjectProgressData({ routeUrl: "/projects/1/progress" }),
      ).rejects.toThrow("Network timeout");
    });

    it("should handle 500 server error on progress fetch", async () => {
      const error = {
        response: { status: 500, data: { message: "Internal Server Error" } },
        message: "Server Error",
      };
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(
        getProjectProgressData({ routeUrl: "/projects/1/progress" }),
      ).rejects.toEqual(error);
    });
  });
});
