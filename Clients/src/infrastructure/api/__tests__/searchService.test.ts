import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../customAxios", () => ({
  default: {
    get: vi.fn(),
  },
}));

import { wiseSearch, getEntityDisplayName, ENTITY_DISPLAY_NAMES } from "../searchService";
import CustomAxios from "../customAxios";

const mockAxios = vi.mocked(CustomAxios, { deep: true });

describe("searchService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("wiseSearch", () => {
    it("passes query, limit, and offset to the API", async () => {
      const mockResponse = {
        data: { results: {}, totalCount: 0, query: "test" },
      };
      mockAxios.get.mockResolvedValue({ data: mockResponse });

      await wiseSearch({ q: "test", limit: 10, offset: 5 });

      expect(mockAxios.get).toHaveBeenCalledWith("/search", {
        params: { q: "test", limit: 10, offset: 5 },
        signal: undefined,
      });
    });

    it("uses default limit=20 and offset=0", async () => {
      mockAxios.get.mockResolvedValue({ data: { results: {}, totalCount: 0, query: "x" } });

      await wiseSearch({ q: "x" });

      expect(mockAxios.get).toHaveBeenCalledWith("/search", {
        params: { q: "x", limit: 20, offset: 0 },
        signal: undefined,
      });
    });

    it("passes AbortSignal when provided", async () => {
      const controller = new AbortController();
      mockAxios.get.mockResolvedValue({ data: { results: {}, totalCount: 0, query: "y" } });

      await wiseSearch({ q: "y", signal: controller.signal });

      expect(mockAxios.get).toHaveBeenCalledWith("/search", {
        params: { q: "y", limit: 20, offset: 0 },
        signal: controller.signal,
      });
    });

    it("includes reviewStatus when set", async () => {
      mockAxios.get.mockResolvedValue({ data: { results: {}, totalCount: 0, query: "z" } });

      await wiseSearch({ q: "z", reviewStatus: "approved" });

      expect(mockAxios.get).toHaveBeenCalledWith("/search", {
        params: { q: "z", limit: 20, offset: 0, reviewStatus: "approved" },
        signal: undefined,
      });
    });

    it("returns response.data", async () => {
      const mockData = {
        results: { projects: { results: [], count: 0, icon: "folder" } },
        totalCount: 0,
        query: "test",
      };
      mockAxios.get.mockResolvedValue({ data: mockData });

      const result = await wiseSearch({ q: "test" });
      expect(result).toEqual(mockData);
    });
  });

  describe("ENTITY_DISPLAY_NAMES", () => {
    it("contains expected entity types", () => {
      expect(ENTITY_DISPLAY_NAMES.projects).toBe("Use cases");
      expect(ENTITY_DISPLAY_NAMES.tasks).toBe("Tasks");
      expect(ENTITY_DISPLAY_NAMES.vendors).toBe("Vendors");
      expect(ENTITY_DISPLAY_NAMES.vendor_risks).toBe("Vendor risks");
      expect(ENTITY_DISPLAY_NAMES.incident_management).toBe("Incidents");
      expect(ENTITY_DISPLAY_NAMES.training_registar).toBe("Training");
    });
  });

  describe("getEntityDisplayName", () => {
    it("returns display name for known entity types", () => {
      expect(getEntityDisplayName("projects")).toBe("Use cases");
      expect(getEntityDisplayName("vendor_risks")).toBe("Vendor risks");
    });

    it("falls back to snake_case → space conversion for unknown types", () => {
      expect(getEntityDisplayName("unknown_entity_type")).toBe("unknown entity type");
    });

    it("handles single-word entity types", () => {
      expect(getEntityDisplayName("something")).toBe("something");
    });
  });
});
