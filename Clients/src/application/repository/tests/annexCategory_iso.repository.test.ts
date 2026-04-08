import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  GetAnnexCategoriesById,
  UpdateAnnexCategoryById,
} from "../annexCategory_iso.repository";

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

describe("Test Annex Category ISO Repository", () => {
  describe("GetAnnexCategoriesById", () => {
    it("should make a get request and return response.data", async () => {
      const routeUrl = "/annex-categories/1";
      const signal: AbortSignal = new AbortController().signal;
      const mockData = { id: 1, title: "Category 1" };
      const mockResponse = {
        status: 200,
        statusText: "OK",
        data: mockData,
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await GetAnnexCategoriesById({ routeUrl, signal });

      expect(apiServices.get).toHaveBeenCalledWith(routeUrl, {
        signal,
        responseType: "json",
      });
      expect(response).toEqual(mockData);
    });

    it("should pass through custom responseType", async () => {
      const routeUrl = "/annex-categories/1/export";
      const signal: AbortSignal = new AbortController().signal;
      const mockResponse = {
        status: 200,
        statusText: "OK",
        data: "blob-data",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await GetAnnexCategoriesById({
        routeUrl,
        signal,
        responseType: "blob",
      });

      expect(apiServices.get).toHaveBeenCalledWith(routeUrl, {
        signal,
        responseType: "blob",
      });
      expect(response).toEqual("blob-data");
    });

    it("should throw and log when request fails", async () => {
      const routeUrl = "/annex-categories/1";
      const signal: AbortSignal = new AbortController().signal;
      const error = new Error("API Error");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      vi.mocked(apiServices.get).mockRejectedValueOnce(error);

      await expect(
        GetAnnexCategoriesById({ routeUrl, signal }),
      ).rejects.toThrow("API Error");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error getting annex categories by ID:",
        error,
      );
    });
  });

  describe("UpdateAnnexCategoryById", () => {
    it("should make a patch request with multipart/form-data and return full response", async () => {
      const routeUrl = "/annex-categories/1";
      const body = new FormData();
      body.append("name", "Category Updated");
      const headers = {
        Authorization: "Bearer token",
      };
      const mockResponse = {
        status: 200,
        statusText: "OK",
        data: { updated: true },
      };

      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      const response = await UpdateAnnexCategoryById({
        routeUrl,
        body,
        headers,
      });

      expect(apiServices.patch).toHaveBeenCalledWith(routeUrl, body, {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: "Bearer token",
        },
      });
      expect(response).toEqual(mockResponse);
    });

    it("should throw the same error when api returns an HTTP response error", async () => {
      const routeUrl = "/annex-categories/1";
      const body = new FormData();
      const error = Object.assign(new Error("Request failed"), {
        response: { status: 400 },
      });
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      vi.mocked(apiServices.patch).mockRejectedValueOnce(error);

      await expect(UpdateAnnexCategoryById({ routeUrl, body })).rejects.toBe(
        error,
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error updating annex category by ID:",
        error,
      );
    });

    it("should map network errors to a user-friendly error message", async () => {
      const routeUrl = "/annex-categories/1";
      const body = new FormData();
      const error = Object.assign(new Error("Network down"), {
        request: {},
      });
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      vi.mocked(apiServices.patch).mockRejectedValueOnce(error);

      await expect(UpdateAnnexCategoryById({ routeUrl, body })).rejects.toThrow(
        "Network error - unable to reach the server",
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error updating annex category by ID:",
        error,
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Network error - no response received",
      );
    });

    it("should throw unknown non-network errors as-is", async () => {
      const routeUrl = "/annex-categories/1";
      const body = new FormData();
      const error = "Unknown failure";
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      vi.mocked(apiServices.patch).mockRejectedValueOnce(error);

      await expect(UpdateAnnexCategoryById({ routeUrl, body })).rejects.toBe(
        error,
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error updating annex category by ID:",
        error,
      );
    });
  });
});
