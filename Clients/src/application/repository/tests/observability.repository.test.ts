import { getTraces, getTraceDetail, getObservabilityMetrics } from "../observability.repository";
import { apiServices } from "../../../infrastructure/api/networkServices";

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("observability.repository", () => {
  describe("getTraces", () => {
    it("makes a get request with all filters applied as query params", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: [{ id: "t1" }] } });

      const result = await getTraces({
        status: "error",
        service: "gateway",
        dateFrom: "2026-01-01",
        dateTo: "2026-01-31",
        limit: 10,
        offset: 5,
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/observability/traces?status=error&service=gateway&dateFrom=2026-01-01&dateTo=2026-01-31&limit=10&offset=5",
      );
      expect(result).toEqual([{ id: "t1" }]);
    });

    it("makes a get request with an empty query string when no filters are provided", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: [] } });

      await getTraces();

      expect(apiServices.get).toHaveBeenCalledWith("/observability/traces?");
    });

    it("falls back to response.data when response.data.data is absent", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: [{ id: "t2" }] });

      const result = await getTraces();

      expect(result).toEqual([{ id: "t2" }]);
    });
  });

  describe("getTraceDetail", () => {
    it("makes a get request for a specific trace", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: { id: "t1" } } });

      const result = await getTraceDetail("t1");

      expect(apiServices.get).toHaveBeenCalledWith("/observability/traces/t1");
      expect(result).toEqual({ id: "t1" });
    });
  });

  describe("getObservabilityMetrics", () => {
    it("makes a get request with date range query params", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: { total: 42 } } });

      const result = await getObservabilityMetrics("2026-01-01", "2026-01-31");

      expect(apiServices.get).toHaveBeenCalledWith(
        "/observability/metrics?dateFrom=2026-01-01&dateTo=2026-01-31",
      );
      expect(result).toEqual({ total: 42 });
    });

    it("makes a get request with an empty query string when no dates are provided", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: { total: 0 } } });

      await getObservabilityMetrics();

      expect(apiServices.get).toHaveBeenCalledWith("/observability/metrics?");
    });
  });
});
