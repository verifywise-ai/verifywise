import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  GetClausesByProjectFrameworkId,
  Iso27001GetClauseStructByFrameworkID,
} from "../clause_struct_iso.repository";

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

describe("Test Clause Struct ISO Repository", () => {
  describe("GetClausesByProjectFrameworkId", () => {
    it("should make a get request with default responseType and return response.data", async () => {
      const routeUrl = "/iso27001/clauses/struct/byProjectId/1";
      const signal: AbortSignal = new AbortController().signal;
      const mockData = { clauses: [{ id: 1, title: "Clause 1" }] };
      const mockResponse = {
        status: 200,
        statusText: "OK",
        data: mockData,
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await GetClausesByProjectFrameworkId({
        routeUrl,
        signal,
      });

      expect(apiServices.get).toHaveBeenCalledWith(routeUrl, {
        signal,
        responseType: "json",
      });
      expect(response).toEqual(mockData);
    });

    it("should make a get request with custom responseType", async () => {
      const routeUrl = "/iso27001/clauses/struct/export/1";
      const signal: AbortSignal = new AbortController().signal;
      const mockResponse = {
        status: 200,
        statusText: "OK",
        data: "blob-content",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await GetClausesByProjectFrameworkId({
        routeUrl,
        signal,
        responseType: "blob",
      });

      expect(apiServices.get).toHaveBeenCalledWith(routeUrl, {
        signal,
        responseType: "blob",
      });
      expect(response).toEqual("blob-content");
    });
  });

  describe("Iso27001GetClauseStructByFrameworkID", () => {
    it("should make a get request with default responseType and return full response", async () => {
      const routeUrl = "/iso27001/clauses/struct/byProjectId/1";
      const signal: AbortSignal = new AbortController().signal;
      const mockResponse = {
        status: 200,
        statusText: "OK",
        data: { clauses: [{ id: 1 }] },
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await Iso27001GetClauseStructByFrameworkID({
        routeUrl,
        signal,
      });

      expect(apiServices.get).toHaveBeenCalledWith(routeUrl, {
        signal,
        responseType: "json",
      });
      expect(response).toEqual(mockResponse);
    });

    it("should make a get request with custom responseType and return full response", async () => {
      const routeUrl = "/iso27001/clauses/struct/export/1";
      const signal: AbortSignal = new AbortController().signal;
      const mockResponse = {
        status: 200,
        statusText: "OK",
        data: "binary-content",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await Iso27001GetClauseStructByFrameworkID({
        routeUrl,
        signal,
        responseType: "blob",
      });

      expect(apiServices.get).toHaveBeenCalledWith(routeUrl, {
        signal,
        responseType: "blob",
      });
      expect(response).toEqual(mockResponse);
    });
  });
});
