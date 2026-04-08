import { apiServices } from "../../../infrastructure/api/networkServices";
import { getEntityChangeHistory } from "../changeHistory.repository";

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

describe("Test Change History Repository", () => {
  describe("getEntityChangeHistory", () => {
    it("should map entity type from underscore to dash and return nested response data", async () => {
      const mockPayload = {
        data: [{ id: 1, field_name: "status" }],
        hasMore: false,
        total: 1,
      };
      const mockResponse = {
        data: {
          message: "OK",
          data: mockPayload,
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getEntityChangeHistory(
        "model_inventory" as any,
        42,
      );

      expect(apiServices.get).toHaveBeenCalledWith(
        "/model-inventory-change-history/42?limit=100&offset=0",
      );
      expect(response).toEqual(mockPayload);
    });

    it("should use custom limit and offset when provided", async () => {
      const mockPayload = {
        data: [{ id: 2, field_name: "owner" }],
        hasMore: true,
        total: 10,
      };
      const mockResponse = {
        data: {
          message: "OK",
          data: mockPayload,
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getEntityChangeHistory(
        "project_risk" as any,
        99,
        20,
        40,
      );

      expect(apiServices.get).toHaveBeenCalledWith(
        "/project-risk-change-history/99?limit=20&offset=40",
      );
      expect(response).toEqual(mockPayload);
    });

    it("should throw and log when request fails", async () => {
      const error = new Error("API Error");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      vi.mocked(apiServices.get).mockRejectedValueOnce(error);

      await expect(
        getEntityChangeHistory("project_risk" as any, 99),
      ).rejects.toThrow("API Error");

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error getting project_risk change history:",
        error,
      );
    });
  });
});
