import { apiServices } from "../../../infrastructure/api/networkServices";
import { createEvidenceHub } from "../evidenceHub.repository";

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

describe("Test Evidence Hub Repository", () => {
  describe("createEvidenceHub", () => {
    it("should call post with routeUrl and data, returning response.data", async () => {
      const routeUrl = "/evidenceHub";
      const data = { name: "Evidence 1", file_type: "pdf" };
      const mockData = { id: 1, ...data };

      vi.mocked(apiServices.post).mockResolvedValue({
        status: 201,
        statusText: "Created",
        data: mockData,
      });

      const response = await createEvidenceHub(routeUrl, data);

      expect(apiServices.post).toHaveBeenCalledWith(routeUrl, data);
      expect(response).toEqual(mockData);
    });

    it("should log and rethrow when post fails", async () => {
      const routeUrl = "/evidenceHub";
      const data = { name: "Bad Evidence" };
      const error = new Error("Post failed");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(createEvidenceHub(routeUrl, data)).rejects.toThrow(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error creating incident management:",
        error,
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
