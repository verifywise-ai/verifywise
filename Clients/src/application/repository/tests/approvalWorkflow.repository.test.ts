import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  createApprovalWorkflow,
  deleteApprovalWorkflow,
  getAllApprovalWorkflows,
  getApprovalWorkflowById,
  getApprovalWorkflowsByEntityType,
  updateApprovalWorkflow,
} from "../approvalWorkflow.repository";

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Test Approval Workflow Repository", () => {
  describe("getAllApprovalWorkflows", () => {
    it("should make a get request with signal when provided", async () => {
      const signal: AbortSignal = new AbortController().signal;
      const mockResponse = {
        data: { data: [{ id: 1, workflow_title: "Workflow 1" }] },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getAllApprovalWorkflows({ signal });

      expect(apiServices.get).toHaveBeenCalledWith("/approval-workflows", {
        signal,
      });
      expect(response).toEqual(mockResponse.data);
    });

    it("should make a get request with undefined signal by default", async () => {
      const mockResponse = {
        data: { data: [] },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getAllApprovalWorkflows();

      expect(apiServices.get).toHaveBeenCalledWith("/approval-workflows", {
        signal: undefined,
      });
      expect(response).toEqual(mockResponse.data);
    });
  });

  describe("getApprovalWorkflowById", () => {
    it("should make a get request by id and return response.data", async () => {
      const signal: AbortSignal = new AbortController().signal;
      const mockResponse = {
        data: { data: { id: 10, workflow_title: "WF 10" } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getApprovalWorkflowById({ id: 10, signal });

      expect(apiServices.get).toHaveBeenCalledWith("/approval-workflows/10", {
        signal,
      });
      expect(response).toEqual(mockResponse.data);
    });
  });

  describe("createApprovalWorkflow", () => {
    it("should make a post request to create approval workflow", async () => {
      const body = {
        workflow_title: "Use Case Workflow",
        entity_type: "use_case",
        steps: [],
      };
      const mockResponse = {
        data: { data: { id: 100, ...body } },
        status: 201,
        statusText: "Created",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const response = await createApprovalWorkflow({ body });

      expect(apiServices.post).toHaveBeenCalledWith(
        "/approval-workflows",
        body,
      );
      expect(response).toEqual(mockResponse);
    });
  });

  describe("updateApprovalWorkflow", () => {
    it("should make a put request to update approval workflow", async () => {
      const body = {
        workflow_title: "Updated Workflow",
        steps: [],
      };
      const mockResponse = {
        data: { data: { id: 101, ...body } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.put).mockResolvedValue(mockResponse);

      const response = await updateApprovalWorkflow({ id: 101, body });

      expect(apiServices.put).toHaveBeenCalledWith(
        "/approval-workflows/101",
        body,
      );
      expect(response).toEqual(mockResponse);
    });
  });

  describe("deleteApprovalWorkflow", () => {
    it("should make a delete request to remove approval workflow", async () => {
      const mockResponse = {
        data: { data: { message: "Deleted" } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      const response = await deleteApprovalWorkflow({ id: 102 });

      expect(apiServices.delete).toHaveBeenCalledWith(
        "/approval-workflows/102",
      );
      expect(response).toEqual(mockResponse);
    });
  });

  describe("getApprovalWorkflowsByEntityType", () => {
    it("should request workflows by entity type and filter array response", async () => {
      const signal: AbortSignal = new AbortController().signal;
      const responseArray = [
        { id: 1, entity_type: "use_case" },
        { id: 2, entity_type: "file" },
        { id: 3, entity_type: "use_case" },
      ];
      const mockResponse = {
        data: responseArray,
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getApprovalWorkflowsByEntityType({
        entityType: "use_case",
        signal,
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/approval-workflows?entity_type=use_case",
        { signal },
      );
      expect(response).toEqual([
        { id: 1, entity_type: "use_case" },
        { id: 3, entity_type: "use_case" },
      ]);
    });

    it("should extract workflows from response.data.data and filter by entity type", async () => {
      const signal: AbortSignal = new AbortController().signal;
      const mockResponse = {
        data: {
          data: [
            { id: 4, entity_type: "file" },
            { id: 5, entity_type: "use_case" },
          ],
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getApprovalWorkflowsByEntityType({
        entityType: "file",
        signal,
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/approval-workflows?entity_type=file",
        { signal },
      );
      expect(response).toEqual([{ id: 4, entity_type: "file" }]);
    });

    it("should return empty array when workflows payload is not an array", async () => {
      const mockResponse = {
        data: { data: { not: "array" } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getApprovalWorkflowsByEntityType({
        entityType: "use_case",
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/approval-workflows?entity_type=use_case",
        { signal: undefined },
      );
      expect(response).toEqual([]);
    });

    it("should return empty array when response data is undefined", async () => {
      const mockResponse = {
        data: undefined,
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getApprovalWorkflowsByEntityType({
        entityType: "file",
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/approval-workflows?entity_type=file",
        { signal: undefined },
      );
      expect(response).toEqual([]);
    });
  });
});
