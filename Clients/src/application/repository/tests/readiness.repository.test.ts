import {
  triggerCalculateAll,
  triggerCalculateFramework,
  getReadinessScores,
  getReadinessScoresByFramework,
  getControlScores,
  getWeakestControls,
  getRecommendations,
  getReadinessHistory,
} from "../readiness.repository";
import { apiServices } from "../../../infrastructure/api/networkServices";

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("readiness.repository", () => {
  describe("triggerCalculateAll", () => {
    it("makes a post request with project id and visibility", async () => {
      vi.mocked(apiServices.post).mockResolvedValue({ data: { status: "queued" } });

      const result = await triggerCalculateAll(1, "public");

      expect(apiServices.post).toHaveBeenCalledWith("/readiness/calculate", {
        project_id: 1,
        visibility: "public",
      });
      expect(result).toEqual({ status: "queued" });
    });
  });

  describe("triggerCalculateFramework", () => {
    it("makes a post request scoped to the framework type", async () => {
      vi.mocked(apiServices.post).mockResolvedValue({ data: { status: "queued" } });

      await triggerCalculateFramework("iso42001", 2, "private");

      expect(apiServices.post).toHaveBeenCalledWith("/readiness/calculate/iso42001", {
        project_id: 2,
        visibility: "private",
      });
    });
  });

  describe("getReadinessScores", () => {
    it("builds a query string from project id and visibility", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { score: 80 } });

      await getReadinessScores(3, "public");

      expect(apiServices.get).toHaveBeenCalledWith(
        "/readiness/scores?project_id=3&visibility=public",
      );
    });

    it("makes a get request without a query string when no params are given", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { score: 0 } });

      await getReadinessScores();

      expect(apiServices.get).toHaveBeenCalledWith("/readiness/scores");
    });
  });

  describe("getReadinessScoresByFramework", () => {
    it("builds a query string and scopes to the framework type", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { score: 80 } });

      await getReadinessScoresByFramework("iso27001", 3);

      expect(apiServices.get).toHaveBeenCalledWith("/readiness/scores/iso27001?project_id=3");
    });
  });

  describe("getControlScores", () => {
    it("builds a query string and scopes to the framework type", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: [] });

      await getControlScores("iso27001", 3, "public");

      expect(apiServices.get).toHaveBeenCalledWith(
        "/readiness/controls/iso27001?project_id=3&visibility=public",
      );
    });
  });

  describe("getWeakestControls", () => {
    it("builds a query string with limit, project id, and visibility", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: [] });

      await getWeakestControls(5, 3, "public");

      expect(apiServices.get).toHaveBeenCalledWith(
        "/readiness/weakest?limit=5&project_id=3&visibility=public",
      );
    });
  });

  describe("getRecommendations", () => {
    it("builds a query string with limit, project id, and visibility", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: [] });

      await getRecommendations(10, 3);

      expect(apiServices.get).toHaveBeenCalledWith(
        "/readiness/recommendations?limit=10&project_id=3",
      );
    });
  });

  describe("getReadinessHistory", () => {
    it("builds a query string with framework type, project id, and visibility", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: [] });

      await getReadinessHistory("iso42001", 3, "public");

      expect(apiServices.get).toHaveBeenCalledWith(
        "/readiness/history?framework_type=iso42001&project_id=3&visibility=public",
      );
    });

    it("makes a get request without a query string when no params are given", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: [] });

      await getReadinessHistory();

      expect(apiServices.get).toHaveBeenCalledWith("/readiness/history");
    });
  });
});
