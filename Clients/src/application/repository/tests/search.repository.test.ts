import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ENTITY_DISPLAY_NAMES as infraEntityDisplayNames,
  getEntityDisplayName as infraGetEntityDisplayName,
  wiseSearch as infraWiseSearch,
} from "../../../infrastructure/api/searchService";
import {
  ENTITY_DISPLAY_NAMES,
  getEntityDisplayName,
  performWiseSearch,
} from "../search.repository";

vi.mock("../../../infrastructure/api/searchService", () => {
  return {
    wiseSearch: vi.fn(),
    getEntityDisplayName: vi.fn(),
    ENTITY_DISPLAY_NAMES: {
      projects: "Use cases",
      tasks: "Tasks",
    },
  };
});

describe("Test Search Repository", () => {
  describe("performWiseSearch", () => {
    beforeEach(vi.clearAllMocks);

    afterEach(vi.clearAllMocks);

    it("should call infrastructure wiseSearch with params and return response", async () => {
      const params = {
        q: "risk",
        limit: 10,
        offset: 0,
        reviewStatus: "approved",
      };

      const mockResponse = {
        data: {
          results: {
            projects: {
              results: [],
              count: 0,
              icon: "Folder",
            },
          },
          totalCount: 0,
          query: "risk",
        },
      };

      vi.mocked(infraWiseSearch).mockResolvedValue(mockResponse);

      const result = await performWiseSearch(params);

      expect(infraWiseSearch).toHaveBeenCalledTimes(1);
      expect(infraWiseSearch).toHaveBeenCalledWith(params);
      expect(result).toEqual(mockResponse);
    });

    it("should throw an error if infrastructure wiseSearch fails", async () => {
      const mockError = new Error("Search failed");

      vi.mocked(infraWiseSearch).mockRejectedValue(mockError);

      await expect(performWiseSearch({ q: "risk" })).rejects.toThrow(
        "Search failed",
      );
    });
  });

  describe("getEntityDisplayName", () => {
    beforeEach(vi.clearAllMocks);

    afterEach(vi.clearAllMocks);

    it("should call infrastructure getEntityDisplayName and return display name", () => {
      vi.mocked(infraGetEntityDisplayName).mockReturnValue("Use cases");

      const result = getEntityDisplayName("projects");

      expect(infraGetEntityDisplayName).toHaveBeenCalledTimes(1);
      expect(infraGetEntityDisplayName).toHaveBeenCalledWith("projects");
      expect(result).toBe("Use cases");
    });
  });

  describe("ENTITY_DISPLAY_NAMES", () => {
    it("should re-export infrastructure ENTITY_DISPLAY_NAMES", () => {
      expect(ENTITY_DISPLAY_NAMES).toEqual(infraEntityDisplayNames);
      expect(ENTITY_DISPLAY_NAMES).toEqual({
        projects: "Use cases",
        tasks: "Tasks",
      });
    });
  });
});
