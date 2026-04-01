import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  approveRequest,
  createApprovalRequest,
  getAllApprovalRequests,
  getApprovalRequestById,
  getMyApprovalRequests,
  getPendingApprovals,
  rejectRequest,
  withdrawRequest,
} from "../approvalRequest.repository";

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

describe("Test Approval Request Repository", () => {
  describe("createApprovalRequest", () => {
    it("should make a post request to create an approval request", async () => {
      const body = {
        workflow_id: 1,
        entity_id: 10,
        entity_type: "use_case",
        request_name: "Approve Use Case",
      };
      const mockResponse = {
        data: { data: { id: 123, ...body } },
        status: 201,
        statusText: "Created",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const response = await createApprovalRequest({ body });

      expect(apiServices.post).toHaveBeenCalledWith("/approval-requests", body);
      expect(response).toEqual(mockResponse);
    });
  });

  describe("getMyApprovalRequests", () => {
    it("should make a get request with signal when provided", async () => {
      const signal: AbortSignal = new AbortController().signal;
      const mockResponse = {
        data: { data: [{ id: 1, request_name: "My Request" }] },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getMyApprovalRequests({ signal });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/approval-requests/my-requests",
        { signal },
      );
      expect(response).toEqual(mockResponse.data);
    });

    it("should make a get request with undefined signal by default", async () => {
      const mockResponse = {
        data: { data: [] },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getMyApprovalRequests();

      expect(apiServices.get).toHaveBeenCalledWith(
        "/approval-requests/my-requests",
        { signal: undefined },
      );
      expect(response).toEqual(mockResponse.data);
    });
  });

  describe("getPendingApprovals", () => {
    it("should make a get request with signal when provided", async () => {
      const signal: AbortSignal = new AbortController().signal;
      const mockResponse = {
        data: { data: [{ id: 2, request_name: "Pending Request" }] },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getPendingApprovals({ signal });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/approval-requests/pending-approvals",
        { signal },
      );
      expect(response).toEqual(mockResponse.data);
    });

    it("should make a get request with undefined signal by default", async () => {
      const mockResponse = {
        data: { data: [] },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getPendingApprovals();

      expect(apiServices.get).toHaveBeenCalledWith(
        "/approval-requests/pending-approvals",
        { signal: undefined },
      );
      expect(response).toEqual(mockResponse.data);
    });
  });

  describe("getAllApprovalRequests", () => {
    it("should make a get request with signal when provided", async () => {
      const signal: AbortSignal = new AbortController().signal;
      const mockResponse = {
        data: { data: [{ id: 3, request_name: "All Requests" }] },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getAllApprovalRequests({ signal });

      expect(apiServices.get).toHaveBeenCalledWith("/approval-requests/all", {
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

      const response = await getAllApprovalRequests();

      expect(apiServices.get).toHaveBeenCalledWith("/approval-requests/all", {
        signal: undefined,
      });
      expect(response).toEqual(mockResponse.data);
    });
  });

  describe("getApprovalRequestById", () => {
    it("should make a get request by id and return response.data", async () => {
      const signal: AbortSignal = new AbortController().signal;
      const mockResponse = {
        data: { data: { id: 100, request_name: "Request 100" } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getApprovalRequestById({ id: 100, signal });

      expect(apiServices.get).toHaveBeenCalledWith("/approval-requests/100", {
        signal,
      });
      expect(response).toEqual(mockResponse.data);
    });
  });

  describe("approveRequest", () => {
    it("should make a post request to approve request", async () => {
      const body = { comments: "Looks good" };
      const mockResponse = {
        data: { data: { id: 100, status: "approved" } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const response = await approveRequest({ id: 100, body });

      expect(apiServices.post).toHaveBeenCalledWith(
        "/approval-requests/100/approve",
        body,
      );
      expect(response).toEqual(mockResponse);
    });
  });

  describe("rejectRequest", () => {
    it("should make a post request to reject request", async () => {
      const body = { comments: "Needs more details" };
      const mockResponse = {
        data: { data: { id: 101, status: "rejected" } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const response = await rejectRequest({ id: 101, body });

      expect(apiServices.post).toHaveBeenCalledWith(
        "/approval-requests/101/reject",
        body,
      );
      expect(response).toEqual(mockResponse);
    });
  });

  describe("withdrawRequest", () => {
    it("should make a post request to withdraw request with empty body", async () => {
      const mockResponse = {
        data: { data: { id: 102, status: "withdrawn" } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const response = await withdrawRequest({ id: 102 });

      expect(apiServices.post).toHaveBeenCalledWith(
        "/approval-requests/102/withdraw",
        {},
      );
      expect(response).toEqual(mockResponse);
    });
  });
});
