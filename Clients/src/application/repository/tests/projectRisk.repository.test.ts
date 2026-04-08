import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  createProjectRisk,
  deleteProjectRisk,
  getAllProjectRisks,
  getAllProjectRisksByProjectId,
  getAllRisksByFrameworkId,
  getNonMitigatedProjectRisks,
  getProjectRiskById,
  updateProjectRisk,
} from "../projectRisk.repository";

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockRisk = {
  id: 1,
  projectId: 10,
  title: "Model accuracy degradation",
  description: "Risk of model accuracy decreasing over time",
  severity: "high",
  likelihood: "medium",
  status: "identified",
  mitigation: "Regular model retraining",
  createdAt: "2026-03-12T00:00:00Z",
  updatedAt: "2026-03-12T00:00:00Z",
};

const mockRisks = [
  mockRisk,
  {
    id: 2,
    projectId: 10,
    title: "Data bias",
    description: "Risk of algorithmic bias in predictions",
    severity: "high",
    likelihood: "high",
    status: "mitigated",
    mitigation: "Bias audit and correction",
    createdAt: "2026-03-11T00:00:00Z",
    updatedAt: "2026-03-11T00:00:00Z",
  },
];

describe("projectRisk.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("getProjectRiskById", () => {
    it("should fetch project risk by ID", async () => {
      const response = { data: mockRisk };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getProjectRiskById({ id: 1 });

      expect(apiServices.get).toHaveBeenCalledWith("/projectRisks/1", {
        signal: undefined,
      });
      expect(result).toEqual(mockRisk);
    });

    it("should pass AbortSignal for request cancellation", async () => {
      const abortController = new AbortController();
      const response = { data: mockRisk };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getProjectRiskById({
        id: 1,
        signal: abortController.signal,
      });

      expect(apiServices.get).toHaveBeenCalledWith("/projectRisks/1", {
        signal: abortController.signal,
      });
      expect(result).toEqual(mockRisk);
    });

    it("should handle different risk IDs", async () => {
      const response = { data: mockRisk };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      await getProjectRiskById({ id: 25 });

      expect(apiServices.get).toHaveBeenCalledWith("/projectRisks/25", {
        signal: undefined,
      });
    });

    it("should throw error when risk not found", async () => {
      const error = {
        response: { status: 404, data: { message: "Risk not found" } },
        message: "Not Found",
      };
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getProjectRiskById({ id: 999 })).rejects.toEqual(error);
    });

    it("should throw error with 403 forbidden", async () => {
      const error = {
        response: { status: 403, data: { message: "Forbidden" } },
        message: "Forbidden",
      };
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getProjectRiskById({ id: 1 })).rejects.toEqual(error);
    });
  });

  describe("getAllProjectRisks", () => {
    it("should fetch all risks with default filter", async () => {
      const response = { data: mockRisks };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllProjectRisks();

      expect(apiServices.get).toHaveBeenCalledWith(
        "/projectRisks?filter=active",
        {
          signal: undefined,
        },
      );
      expect(result).toEqual(mockRisks);
    });

    it("should fetch all risks with active filter explicitly", async () => {
      const response = { data: mockRisks };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllProjectRisks({ filter: "active" });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/projectRisks?filter=active",
        {
          signal: undefined,
        },
      );
      expect(result).toEqual(mockRisks);
    });

    it("should fetch risks with deleted filter", async () => {
      const response = { data: [] };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllProjectRisks({ filter: "deleted" });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/projectRisks?filter=deleted",
        {
          signal: undefined,
        },
      );
      expect(result).toEqual([]);
    });

    it("should fetch all risks regardless of status", async () => {
      const response = { data: mockRisks };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllProjectRisks({ filter: "all" });

      expect(apiServices.get).toHaveBeenCalledWith("/projectRisks?filter=all", {
        signal: undefined,
      });
      expect(result).toEqual(mockRisks);
    });

    it("should pass AbortSignal with filter", async () => {
      const abortController = new AbortController();
      const response = { data: mockRisks };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllProjectRisks({
        signal: abortController.signal,
        filter: "active",
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/projectRisks?filter=active",
        {
          signal: abortController.signal,
        },
      );
      expect(result).toEqual(mockRisks);
    });

    it("should return empty array when no risks", async () => {
      const response = { data: [] };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllProjectRisks();

      expect(result).toEqual([]);
    });

    it("should handle API errors", async () => {
      const error = new Error("Network error");
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getAllProjectRisks()).rejects.toThrow("Network error");
    });
  });

  describe("getAllProjectRisksByProjectId", () => {
    it("should fetch risks by project ID with default filter", async () => {
      const response = { data: mockRisks };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllProjectRisksByProjectId({
        projectId: "10",
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/projectRisks/by-projid/10?filter=active",
        { signal: undefined },
      );
      expect(result).toEqual(mockRisks);
    });

    it("should fetch risks with active filter", async () => {
      const response = { data: mockRisks };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllProjectRisksByProjectId({
        projectId: "10",
        filter: "active",
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/projectRisks/by-projid/10?filter=active",
        { signal: undefined },
      );
      expect(result).toEqual(mockRisks);
    });

    it("should fetch risks with deleted filter", async () => {
      const response = { data: [] };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllProjectRisksByProjectId({
        projectId: "10",
        filter: "deleted",
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/projectRisks/by-projid/10?filter=deleted",
        { signal: undefined },
      );
      expect(result).toEqual([]);
    });

    it("should fetch all risks for project", async () => {
      const response = { data: mockRisks };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllProjectRisksByProjectId({
        projectId: "10",
        filter: "all",
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/projectRisks/by-projid/10?filter=all",
        { signal: undefined },
      );
      expect(result).toEqual(mockRisks);
    });

    it("should pass AbortSignal with project risks fetch", async () => {
      const abortController = new AbortController();
      const response = { data: mockRisks };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllProjectRisksByProjectId({
        projectId: "10",
        signal: abortController.signal,
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/projectRisks/by-projid/10?filter=active",
        { signal: abortController.signal },
      );
      expect(result).toEqual(mockRisks);
    });

    it("should handle different project IDs", async () => {
      const response = { data: mockRisks };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      await getAllProjectRisksByProjectId({ projectId: "25" });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/projectRisks/by-projid/25?filter=active",
        { signal: undefined },
      );
    });

    it("should throw error when project not found", async () => {
      const error = {
        response: { status: 404, data: { message: "Project not found" } },
        message: "Not Found",
      };
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(
        getAllProjectRisksByProjectId({ projectId: "999" }),
      ).rejects.toEqual(error);
    });
  });

  describe("getAllRisksByFrameworkId", () => {
    it("should fetch risks by framework ID with default filter", async () => {
      const response = { data: mockRisks };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllRisksByFrameworkId({
        frameworkId: 5,
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/projectRisks/by-frameworkid/5?filter=active",
        { signal: undefined },
      );
      expect(result).toEqual(mockRisks);
    });

    it("should fetch risks with active filter", async () => {
      const response = { data: mockRisks };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllRisksByFrameworkId({
        frameworkId: 5,
        filter: "active",
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/projectRisks/by-frameworkid/5?filter=active",
        { signal: undefined },
      );
      expect(result).toEqual(mockRisks);
    });

    it("should fetch risks with deleted filter", async () => {
      const response = { data: [] };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllRisksByFrameworkId({
        frameworkId: 5,
        filter: "deleted",
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/projectRisks/by-frameworkid/5?filter=deleted",
        { signal: undefined },
      );
      expect(result).toEqual([]);
    });

    it("should fetch all risks for framework", async () => {
      const response = { data: mockRisks };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllRisksByFrameworkId({
        frameworkId: 5,
        filter: "all",
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/projectRisks/by-frameworkid/5?filter=all",
        { signal: undefined },
      );
      expect(result).toEqual(mockRisks);
    });

    it("should pass AbortSignal with framework risks fetch", async () => {
      const abortController = new AbortController();
      const response = { data: mockRisks };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllRisksByFrameworkId({
        frameworkId: 5,
        signal: abortController.signal,
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/projectRisks/by-frameworkid/5?filter=active",
        { signal: abortController.signal },
      );
      expect(result).toEqual(mockRisks);
    });

    it("should handle different framework IDs", async () => {
      const response = { data: mockRisks };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      await getAllRisksByFrameworkId({ frameworkId: 15 });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/projectRisks/by-frameworkid/15?filter=active",
        { signal: undefined },
      );
    });

    it("should throw error when framework not found", async () => {
      const error = {
        response: { status: 404, data: { message: "Framework not found" } },
        message: "Not Found",
      };
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(
        getAllRisksByFrameworkId({ frameworkId: 999 }),
      ).rejects.toEqual(error);
    });
  });

  describe("getNonMitigatedProjectRisks", () => {
    it("should fetch non-mitigated risks for project", async () => {
      const nonMitigatedRisks = [mockRisk]; // mockRisk has status 'identified'
      const response = { data: nonMitigatedRisks };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getNonMitigatedProjectRisks({
        projectId: 10,
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/projectRisks/by-projid/non-mitigated/10",
        { signal: undefined },
      );
      expect(result).toEqual(nonMitigatedRisks);
    });

    it("should pass AbortSignal for non-mitigated risks request", async () => {
      const abortController = new AbortController();
      const response = { data: [mockRisk] };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getNonMitigatedProjectRisks({
        projectId: 10,
        signal: abortController.signal,
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/projectRisks/by-projid/non-mitigated/10",
        { signal: abortController.signal },
      );
      expect(result).toEqual([mockRisk]);
    });

    it("should return empty array when all risks are mitigated", async () => {
      const response = { data: [] };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getNonMitigatedProjectRisks({
        projectId: 10,
      });

      expect(result).toEqual([]);
    });

    it("should handle different project IDs", async () => {
      const response = { data: [mockRisk] };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      await getNonMitigatedProjectRisks({ projectId: 25 });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/projectRisks/by-projid/non-mitigated/25",
        { signal: undefined },
      );
    });

    it("should throw error when project not found", async () => {
      const error = {
        response: { status: 404, data: { message: "Project not found" } },
        message: "Not Found",
      };
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(
        getNonMitigatedProjectRisks({ projectId: 999 }),
      ).rejects.toEqual(error);
    });

    it("should throw error with 403 forbidden", async () => {
      const error = {
        response: { status: 403, data: { message: "Forbidden" } },
        message: "Forbidden",
      };
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(
        getNonMitigatedProjectRisks({ projectId: 10 }),
      ).rejects.toEqual(error);
    });
  });

  describe("createProjectRisk", () => {
    it("should create a new project risk", async () => {
      const createData = {
        projectId: 10,
        title: "New Risk",
        description: "A new risk",
        severity: "high",
      };
      const response = { data: mockRisk, status: 201 };
      vi.mocked(apiServices.post).mockResolvedValue(response as any);

      const result = await createProjectRisk({ body: createData });

      expect(apiServices.post).toHaveBeenCalledWith(
        "/projectRisks",
        createData,
      );
      expect(result).toEqual(response);
    });

    it("should return full response object on create", async () => {
      const response = { data: mockRisk, status: 201, statusText: "Created" };
      vi.mocked(apiServices.post).mockResolvedValue(response as any);

      const result = await createProjectRisk({ body: {} });

      expect(result).toEqual(response);
      expect(result.status).toBe(201);
    });

    it("should pass correct body to API", async () => {
      const createData = {
        projectId: 10,
        title: "Risk Title",
        severity: "medium",
        likelihood: "low",
      };
      const response = { data: mockRisk };
      vi.mocked(apiServices.post).mockResolvedValue(response as any);

      await createProjectRisk({ body: createData });

      expect(apiServices.post).toHaveBeenCalledWith(
        "/projectRisks",
        createData,
      );
    });

    it("should handle validation errors on create", async () => {
      const error = {
        response: { status: 422, data: { message: "Validation failed" } },
        message: "Unprocessable Entity",
      };
      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(createProjectRisk({ body: {} })).rejects.toEqual(error);
    });

    it("should handle 403 forbidden on create", async () => {
      const error = {
        response: { status: 403, data: { message: "Forbidden" } },
        message: "Forbidden",
      };
      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(createProjectRisk({ body: {} })).rejects.toEqual(error);
    });

    it("should handle 409 conflict on create", async () => {
      const error = {
        response: { status: 409, data: { message: "Risk already exists" } },
        message: "Conflict",
      };
      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(createProjectRisk({ body: {} })).rejects.toEqual(error);
    });
  });

  describe("updateProjectRisk", () => {
    it("should update an existing project risk", async () => {
      const updateData = {
        title: "Updated Risk",
        severity: "medium",
      };
      const response = { data: { ...mockRisk, ...updateData }, status: 200 };
      vi.mocked(apiServices.put).mockResolvedValue(response as any);

      const result = await updateProjectRisk({ id: 1, body: updateData });

      expect(apiServices.put).toHaveBeenCalledWith(
        "/projectRisks/1",
        updateData,
      );
      expect(result).toEqual(response);
      expect(result.data.title).toBe("Updated Risk");
    });

    it("should return full response object on update", async () => {
      const response = { data: mockRisk, status: 200, statusText: "OK" };
      vi.mocked(apiServices.put).mockResolvedValue(response as any);

      const result = await updateProjectRisk({ id: 1, body: {} });

      expect(result).toEqual(response);
      expect(result.status).toBe(200);
    });

    it("should handle different risk IDs", async () => {
      const response = { data: mockRisk };
      vi.mocked(apiServices.put).mockResolvedValue(response as any);

      await updateProjectRisk({ id: 15, body: { status: "resolved" } });

      expect(apiServices.put).toHaveBeenCalledWith("/projectRisks/15", {
        status: "resolved",
      });
    });

    it("should pass correct body to update endpoint", async () => {
      const updateData = {
        mitigation: "Updated mitigation strategy",
        severity: "critical",
      };
      const response = { data: mockRisk };
      vi.mocked(apiServices.put).mockResolvedValue(response as any);

      await updateProjectRisk({ id: 1, body: updateData });

      expect(apiServices.put).toHaveBeenCalledWith(
        "/projectRisks/1",
        updateData,
      );
    });

    it("should throw error when risk not found on update", async () => {
      const error = {
        response: { status: 404, data: { message: "Risk not found" } },
        message: "Not Found",
      };
      vi.mocked(apiServices.put).mockRejectedValue(error);

      await expect(updateProjectRisk({ id: 999, body: {} })).rejects.toEqual(
        error,
      );
    });

    it("should handle validation errors on update", async () => {
      const error = {
        response: { status: 422, data: { message: "Invalid data" } },
        message: "Unprocessable Entity",
      };
      vi.mocked(apiServices.put).mockRejectedValue(error);

      await expect(updateProjectRisk({ id: 1, body: {} })).rejects.toEqual(
        error,
      );
    });

    it("should handle 403 forbidden on update", async () => {
      const error = {
        response: { status: 403, data: { message: "Forbidden" } },
        message: "Forbidden",
      };
      vi.mocked(apiServices.put).mockRejectedValue(error);

      await expect(updateProjectRisk({ id: 1, body: {} })).rejects.toEqual(
        error,
      );
    });

    it("should handle 409 conflict on update", async () => {
      const error = {
        response: { status: 409, data: { message: "Conflict" } },
        message: "Conflict",
      };
      vi.mocked(apiServices.put).mockRejectedValue(error);

      await expect(updateProjectRisk({ id: 1, body: {} })).rejects.toEqual(
        error,
      );
    });
  });

  describe("deleteProjectRisk", () => {
    it("should delete a project risk", async () => {
      const response = { status: 204, data: null };
      vi.mocked(apiServices.delete).mockResolvedValue(response as any);

      const result = await deleteProjectRisk({ id: 1 });

      expect(apiServices.delete).toHaveBeenCalledWith("/projectRisks/1");
      expect(result).toEqual(response);
    });

    it("should return response object on delete", async () => {
      const response = { status: 200, data: { message: "Deleted" } };
      vi.mocked(apiServices.delete).mockResolvedValue(response as any);

      const result = await deleteProjectRisk({ id: 1 });

      expect(result).toEqual(response);
    });

    it("should handle different risk IDs on delete", async () => {
      const response = { status: 204 };
      vi.mocked(apiServices.delete).mockResolvedValue(response as any);

      await deleteProjectRisk({ id: 25 });

      expect(apiServices.delete).toHaveBeenCalledWith("/projectRisks/25");
    });

    it("should throw error when risk not found on delete", async () => {
      const error = {
        response: { status: 404, data: { message: "Risk not found" } },
        message: "Not Found",
      };
      vi.mocked(apiServices.delete).mockRejectedValue(error);

      await expect(deleteProjectRisk({ id: 999 })).rejects.toEqual(error);
    });

    it("should throw error with 403 forbidden on delete", async () => {
      const error = {
        response: { status: 403, data: { message: "Forbidden" } },
        message: "Forbidden",
      };
      vi.mocked(apiServices.delete).mockRejectedValue(error);

      await expect(deleteProjectRisk({ id: 1 })).rejects.toEqual(error);
    });

    it("should handle 409 conflict on delete", async () => {
      const error = {
        response: {
          status: 409,
          data: { message: "Cannot delete, risk has mitigation plans" },
        },
        message: "Conflict",
      };
      vi.mocked(apiServices.delete).mockRejectedValue(error);

      await expect(deleteProjectRisk({ id: 1 })).rejects.toEqual(error);
    });

    it("should handle 500 server error on delete", async () => {
      const error = {
        response: { status: 500, data: { message: "Internal Server Error" } },
        message: "Server Error",
      };
      vi.mocked(apiServices.delete).mockRejectedValue(error);

      await expect(deleteProjectRisk({ id: 1 })).rejects.toEqual(error);
    });
  });
});
