import {
  getAuditLog,
  getActionAuditTrail,
  getAuditAnalytics,
  exportAuditLog,
} from "../aiAudit.repository";
import { apiServices } from "../../../infrastructure/api/networkServices";

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("aiAudit.repository", () => {
  describe("getAuditLog", () => {
    it("builds a query string from all provided filters", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: [{ id: 1 }] } });

      const result = await getAuditLog({
        state: "completed",
        tool: "scanner",
        user: 3,
        actorType: "agent",
        dateFrom: "2026-01-01",
        dateTo: "2026-01-31",
        limit: 10,
        offset: 0,
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-audit/log?state=completed&tool=scanner&user=3&actorType=agent&dateFrom=2026-01-01&dateTo=2026-01-31&limit=10",
      );
      expect(result).toEqual([{ id: 1 }]);
    });

    it("makes a get request with an empty query string when no filters are provided", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: [] } });

      await getAuditLog();

      expect(apiServices.get).toHaveBeenCalledWith("/ai-audit/log?");
    });

    it("falls back to response.data when data.data is absent", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: [{ id: 2 }] });

      const result = await getAuditLog();

      expect(result).toEqual([{ id: 2 }]);
    });
  });

  describe("getActionAuditTrail", () => {
    it("makes a get request scoped to the action id", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: { id: "a1" } } });

      const result = await getActionAuditTrail("a1");

      expect(apiServices.get).toHaveBeenCalledWith("/ai-audit/log/a1");
      expect(result).toEqual({ id: "a1" });
    });
  });

  describe("getAuditAnalytics", () => {
    it("builds a query string from the provided date range", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: { total: 5 } } });

      await getAuditAnalytics("2026-01-01", "2026-01-31");

      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-audit/analytics?dateFrom=2026-01-01&dateTo=2026-01-31",
      );
    });

    it("makes a get request with an empty query string when no dates are provided", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: {} } });

      await getAuditAnalytics();

      expect(apiServices.get).toHaveBeenCalledWith("/ai-audit/analytics?");
    });
  });

  describe("exportAuditLog", () => {
    it("returns json data directly when format is json", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: [{ id: 1 }] } });

      const result = await exportAuditLog("json", "2026-01-01", "2026-01-31");

      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-audit/export?format=json&dateFrom=2026-01-01&dateTo=2026-01-31",
      );
      expect(result).toEqual([{ id: 1 }]);
    });

    it("triggers a CSV file download and returns undefined when format is csv", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: "id,name\n1,test" });

      const createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
      const revokeObjectURL = vi.fn();
      window.URL.createObjectURL = createObjectURL;
      window.URL.revokeObjectURL = revokeObjectURL;

      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

      const result = await exportAuditLog("csv");

      expect(apiServices.get).toHaveBeenCalledWith("/ai-audit/export?format=csv", {
        responseType: "blob",
      });
      expect(createObjectURL).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
      expect(result).toBeUndefined();

      clickSpy.mockRestore();
    });
  });
});
