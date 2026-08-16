import {
  triggerAnalysis,
  getAnalysis,
  getQualityScores,
  getEvidenceGaps,
  getSuggestions,
  applySuggestions,
} from "../evidenceAi.repository";
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

describe("evidenceAi.repository", () => {
  describe("triggerAnalysis", () => {
    it("makes a post request with the visibility payload", async () => {
      vi.mocked(apiServices.post).mockResolvedValue({ data: { status: "queued" } });

      const result = await triggerAnalysis(10, "internal");

      expect(apiServices.post).toHaveBeenCalledWith("/evidence-ai/analyze/10", {
        visibility: "internal",
      });
      expect(result).toEqual({ status: "queued" });
    });

    it("makes a post request without visibility when not provided", async () => {
      vi.mocked(apiServices.post).mockResolvedValue({ data: { status: "queued" } });

      await triggerAnalysis(11);

      expect(apiServices.post).toHaveBeenCalledWith("/evidence-ai/analyze/11", {
        visibility: undefined,
      });
    });
  });

  describe("getAnalysis", () => {
    it("makes a get request scoped to the file id", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { score: 0.8 } });

      const result = await getAnalysis(10);

      expect(apiServices.get).toHaveBeenCalledWith("/evidence-ai/analysis/10");
      expect(result).toEqual({ score: 0.8 });
    });
  });

  describe("getQualityScores", () => {
    it("makes a get request for quality scores", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: [{ fileId: 1, score: 0.9 }] });

      const result = await getQualityScores();

      expect(apiServices.get).toHaveBeenCalledWith("/evidence-ai/quality-scores");
      expect(result).toEqual([{ fileId: 1, score: 0.9 }]);
    });
  });

  describe("getEvidenceGaps", () => {
    it("makes a get request with query params when provided", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: [] });

      await getEvidenceGaps({ framework_type: "iso42001", quality_threshold: 0.5 });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/evidence-ai/gaps?framework_type=iso42001&quality_threshold=0.5",
      );
    });

    it("makes a get request without a query string when no params are provided", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: [] });

      await getEvidenceGaps();

      expect(apiServices.get).toHaveBeenCalledWith("/evidence-ai/gaps");
    });
  });

  describe("getSuggestions", () => {
    it("makes a get request scoped to the file id", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: [{ control_id: 1 }] });

      const result = await getSuggestions(20);

      expect(apiServices.get).toHaveBeenCalledWith("/evidence-ai/suggestions/20");
      expect(result).toEqual([{ control_id: 1 }]);
    });
  });

  describe("applySuggestions", () => {
    it("makes a post request with the suggestions payload", async () => {
      const suggestions = [{ control_id: 1, framework_type: "iso42001" }];
      vi.mocked(apiServices.post).mockResolvedValue({ data: { applied: 1 } });

      const result = await applySuggestions(20, suggestions);

      expect(apiServices.post).toHaveBeenCalledWith("/evidence-ai/suggestions/20/apply", {
        suggestions,
      });
      expect(result).toEqual({ applied: 1 });
    });
  });
});
