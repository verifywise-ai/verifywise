import { getBadges, reviewContent, getUnreviewed, getStats } from "../aiContent.repository";
import { apiServices } from "../../../infrastructure/api/networkServices";

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("aiContent.repository", () => {
  describe("getBadges", () => {
    it("makes a get request for badges of an entity", async () => {
      const mockResponse = { status: 200, statusText: "OK", data: [{ badge: "reviewed" }] };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getBadges("task", 5);

      expect(apiServices.get).toHaveBeenCalledWith("/ai-content/task/5");
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe("reviewContent", () => {
    it("makes a patch request with review action and notes", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        data: { id: 1, review_action: "approve" },
      };
      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      const result = await reviewContent(1, "approve", "looks good");

      expect(apiServices.patch).toHaveBeenCalledWith("/ai-content/1/review", {
        review_action: "approve",
        review_notes: "looks good",
      });
      expect(result).toEqual(mockResponse.data);
    });

    it("makes a patch request without notes when not provided", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        data: { id: 2, review_action: "reject" },
      };
      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      await reviewContent(2, "reject");

      expect(apiServices.patch).toHaveBeenCalledWith("/ai-content/2/review", {
        review_action: "reject",
        review_notes: undefined,
      });
    });
  });

  describe("getUnreviewed", () => {
    it("makes a get request with limit and offset query params", async () => {
      const mockResponse = { status: 200, statusText: "OK", data: [] };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getUnreviewed(10, 20);

      expect(apiServices.get).toHaveBeenCalledWith("/ai-content/unreviewed?limit=10&offset=20");
    });

    it("makes a get request without query string when no params are provided", async () => {
      const mockResponse = { status: 200, statusText: "OK", data: [] };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getUnreviewed();

      expect(apiServices.get).toHaveBeenCalledWith("/ai-content/unreviewed");
    });

    it("returns the response data", async () => {
      const mockResponse = { status: 200, statusText: "OK", data: [{ id: 1 }] };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getUnreviewed(5);

      expect(result).toEqual(mockResponse.data);
    });
  });

  describe("getStats", () => {
    it("makes a get request for content stats", async () => {
      const mockResponse = { status: 200, statusText: "OK", data: { total: 10, reviewed: 4 } };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getStats();

      expect(apiServices.get).toHaveBeenCalledWith("/ai-content/stats");
      expect(result).toEqual(mockResponse.data);
    });
  });
});
