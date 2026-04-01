import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  createControl,
  deleteControl,
  getComplianceProgress,
  getControlById,
  getControlByIdAndProject,
  getControlCategoriesByProject,
  getControlsByControlCategoryId,
  updateControl,
} from "../control_eu_act.repository";

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

describe("Test Control EU Act Repository", () => {
  describe("getControlById", () => {
    it("should call get /controls/:id with default responseType=json and return response.data", async () => {
      const signal = new AbortController().signal;
      const mockData = { id: 10, title: "Control 10" };
      vi.mocked(apiServices.get).mockResolvedValue({ data: mockData } as any);

      const response = await getControlById({ id: 10, signal });

      expect(apiServices.get).toHaveBeenCalledWith("/controls/10", {
        signal,
        responseType: "json",
      });
      expect(response).toEqual(mockData);
    });

    it("should honor custom responseType", async () => {
      const mockData = new Blob(["binary"], {
        type: "application/octet-stream",
      });
      vi.mocked(apiServices.get).mockResolvedValue({ data: mockData } as any);

      const response = await getControlById({ id: 22, responseType: "blob" });

      expect(apiServices.get).toHaveBeenCalledWith("/controls/22", {
        signal: undefined,
        responseType: "blob",
      });
      expect(response).toBe(mockData);
    });
  });

  describe("createControl", () => {
    it("should call post /controls and return full response", async () => {
      const body = { name: "New control" };
      const mockResponse = { status: 201, data: { id: 1 } };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse as any);

      const response = await createControl({ body });

      expect(apiServices.post).toHaveBeenCalledWith("/controls", body);
      expect(response).toEqual(mockResponse);
    });
  });

  describe("deleteControl", () => {
    it("should call delete /controls/:id and return full response", async () => {
      const mockResponse = { status: 200, data: { deleted: true } };
      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse as any);

      const response = await deleteControl({ id: 7 });

      expect(apiServices.delete).toHaveBeenCalledWith("/controls/7");
      expect(response).toEqual(mockResponse);
    });
  });

  describe("getControlByIdAndProject", () => {
    it("should build query params with optional filters and return response.data", async () => {
      const signal = new AbortController().signal;
      const mockData = [{ id: 1 }];
      vi.mocked(apiServices.get).mockResolvedValue({ data: mockData } as any);

      const response = await getControlByIdAndProject({
        controlId: 5,
        projectFrameworkId: 99,
        owner: "John",
        approver: "Mary",
        dueDateFilter: "overdue",
        signal,
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/eu-ai-act/controlById?controlId=5&projectFrameworkId=99&owner=John&approver=Mary&dueDateFilter=overdue",
        { signal },
      );
      expect(response).toEqual(mockData);
    });

    it("should ignore empty optional filters", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: [] } as any);

      await getControlByIdAndProject({
        controlId: 5,
        projectFrameworkId: 99,
        owner: "",
        approver: "",
        dueDateFilter: "",
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/eu-ai-act/controlById?controlId=5&projectFrameworkId=99",
        { signal: undefined },
      );
    });
  });

  describe("getControlCategoriesByProject", () => {
    it("should call category endpoint with projectFrameworkId and return response.data", async () => {
      const signal = new AbortController().signal;
      const mockData = [{ id: 3, name: "Category" }];
      vi.mocked(apiServices.get).mockResolvedValue({ data: mockData } as any);

      const response = await getControlCategoriesByProject({
        projectFrameworkId: 123,
        signal,
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/eu-ai-act/controlCategories?projectFrameworkId=123",
        { signal },
      );
      expect(response).toEqual(mockData);
    });
  });

  describe("getComplianceProgress", () => {
    it("should call compliance progress endpoint and return response.data", async () => {
      const signal = new AbortController().signal;
      const mockData = { percentage: 80 };
      vi.mocked(apiServices.get).mockResolvedValue({ data: mockData } as any);

      const response = await getComplianceProgress({
        projectFrameworkId: 44,
        signal,
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/eu-ai-act/compliances/progress/44",
        { signal },
      );
      expect(response).toEqual(mockData);
    });
  });

  describe("updateControl", () => {
    it("should call patch saveControls endpoint with headers and return full response", async () => {
      const body = { status: "completed" };
      const headers = { "X-Test": "yes" };
      const mockResponse = { status: 200, data: { ok: true } };
      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse as any);

      const response = await updateControl({
        controlId: 88,
        body,
        headers,
      });

      expect(apiServices.patch).toHaveBeenCalledWith(
        "/eu-ai-act/saveControls/88",
        body,
        { headers: { "X-Test": "yes" } },
      );
      expect(response).toEqual(mockResponse);
    });

    it("should call patch with empty headers object when headers is undefined", async () => {
      vi.mocked(apiServices.patch).mockResolvedValue({
        data: { ok: true },
      } as any);

      await updateControl({
        controlId: undefined,
        body: { test: true },
      });

      expect(apiServices.patch).toHaveBeenCalledWith(
        "/eu-ai-act/saveControls/undefined",
        { test: true },
        { headers: {} },
      );
    });
  });

  describe("getControlsByControlCategoryId", () => {
    it("should build query params with optional filters and return response.data", async () => {
      const signal = new AbortController().signal;
      const mockData = [{ id: 2 }];
      vi.mocked(apiServices.get).mockResolvedValue({ data: mockData } as any);

      const response = await getControlsByControlCategoryId({
        controlCategoryId: 15,
        projectFrameworkId: 200,
        owner: "Ana",
        approver: "Bob",
        dueDateFilter: "this_week",
        signal,
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/eu-ai-act/controls/byControlCategoryId/15?projectFrameworkId=200&owner=Ana&approver=Bob&dueDateFilter=this_week",
        { signal },
      );
      expect(response).toEqual(mockData);
    });

    it("should ignore empty optional filters", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: [] } as any);

      await getControlsByControlCategoryId({
        controlCategoryId: 15,
        projectFrameworkId: 200,
        owner: "",
        approver: "",
        dueDateFilter: "",
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/eu-ai-act/controls/byControlCategoryId/15?projectFrameworkId=200",
        { signal: undefined },
      );
    });
  });
});
