import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  GetAllAnnexes,
  GetAnnexControlISO27001ById,
  GetAnnexesByProjectFrameworkId,
} from "../annex_struct_iso.repository";

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

describe("Test Annex Struct ISO Repository", () => {
  describe("GetAllAnnexes", () => {
    it("should make a get request with provided signal and default responseType", async () => {
      const routeUrl = "/annexes";
      const signal: AbortSignal = new AbortController().signal;
      const mockResponse = {
        status: 200,
        statusText: "OK",
        data: { items: [] },
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await GetAllAnnexes({ routeUrl, signal });

      expect(apiServices.get).toHaveBeenCalledWith(routeUrl, {
        signal,
        responseType: "json",
      });
      expect(response).toEqual({
        status: 200,
        data: mockResponse.data,
      });
    });

    it("should make a get request with provided responseType", async () => {
      const routeUrl = "/annexes/export";
      const signal: AbortSignal = new AbortController().signal;
      const mockResponse = {
        status: 200,
        statusText: "OK",
        data: "csv-content",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await GetAllAnnexes({
        routeUrl,
        signal,
        responseType: "blob",
      });

      expect(apiServices.get).toHaveBeenCalledWith(routeUrl, {
        signal,
        responseType: "blob",
      });
      expect(response).toEqual({
        status: 200,
        data: mockResponse.data,
      });
    });
  });

  describe("GetAnnexesByProjectFrameworkId", () => {
    it("should make a get request with provided signal and default responseType", async () => {
      const routeUrl = "/annexes/project-framework/10";
      const signal: AbortSignal = new AbortController().signal;
      const mockResponse = {
        status: 200,
        statusText: "OK",
        data: { annexes: [{ id: 1 }] },
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await GetAnnexesByProjectFrameworkId({
        routeUrl,
        signal,
      });

      expect(apiServices.get).toHaveBeenCalledWith(routeUrl, {
        signal,
        responseType: "json",
      });
      expect(response).toEqual({
        status: 200,
        data: mockResponse.data,
      });
    });

    it("should make a get request with provided responseType", async () => {
      const routeUrl = "/annexes/project-framework/10/export";
      const signal: AbortSignal = new AbortController().signal;
      const mockResponse = {
        status: 200,
        statusText: "OK",
        data: "file-data",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await GetAnnexesByProjectFrameworkId({
        routeUrl,
        signal,
        responseType: "blob",
      });

      expect(apiServices.get).toHaveBeenCalledWith(routeUrl, {
        signal,
        responseType: "blob",
      });
      expect(response).toEqual({
        status: 200,
        data: mockResponse.data,
      });
    });
  });

  describe("GetAnnexControlISO27001ById", () => {
    it("should make a get request and return response.data", async () => {
      const routeUrl = "/annexes/controls/5";
      const signal: AbortSignal = new AbortController().signal;
      const mockData = { id: 5, title: "Control" };
      const mockResponse = {
        status: 200,
        statusText: "OK",
        data: mockData,
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await GetAnnexControlISO27001ById({ routeUrl, signal });

      expect(apiServices.get).toHaveBeenCalledWith(routeUrl, {
        signal,
        responseType: "json",
      });
      expect(response).toEqual(mockData);
    });

    it("should make a get request with provided responseType", async () => {
      const routeUrl = "/annexes/controls/5/export";
      const signal: AbortSignal = new AbortController().signal;
      const mockData = "binary-data";
      const mockResponse = {
        status: 200,
        statusText: "OK",
        data: mockData,
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await GetAnnexControlISO27001ById({
        routeUrl,
        signal,
        responseType: "blob",
      });

      expect(apiServices.get).toHaveBeenCalledWith(routeUrl, {
        signal,
        responseType: "blob",
      });
      expect(response).toEqual(mockData);
    });
  });
});
