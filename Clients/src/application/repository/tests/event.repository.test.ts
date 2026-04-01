import { apiServices } from "../../../infrastructure/api/networkServices";
import { getAllEvents } from "../event.repository";

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

describe("Test Event Repository", () => {
  describe("getAllEvents", () => {
    it("should call get with routeUrl and return full response", async () => {
      const routeUrl = "/events";
      const mockResponse = {
        status: 200,
        statusText: "OK",
        data: [{ id: 1, name: "Event A" }],
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getAllEvents({ routeUrl });

      expect(apiServices.get).toHaveBeenCalledWith(routeUrl);
      expect(response).toEqual(mockResponse);
    });

    it("should log and rethrow when get fails", async () => {
      const routeUrl = "/events";
      const error = new Error("Network error");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getAllEvents({ routeUrl })).rejects.toThrow(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error fetching events:",
        error,
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
