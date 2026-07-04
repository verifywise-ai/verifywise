import { describe, it, expect } from "vitest";
import { server } from "../../../test/mocks/server";
import { http, HttpResponse } from "msw";

import { wiseSearch, getEntityDisplayName, ENTITY_DISPLAY_NAMES } from "../searchService";

describe("searchService", () => {
  describe("wiseSearch", () => {
    it("passes query, limit, and offset to the API", async () => {
      server.use(
        http.get("/api/search", ({ request }) => {
          const url = new URL(request.url);
          return HttpResponse.json({
            data: {
              results: {},
              totalCount: 0,
              query: url.searchParams.get("q"),
            },
          });
        }),
      );
      const result = await wiseSearch({ q: "test", limit: 10, offset: 5 });
      expect(result.data.totalCount).toBe(0);
      expect(result.data.query).toBe("test");
    });

    it("uses default limit=20 and offset=0", async () => {
      server.use(
        http.get("/api/search", ({ request }) => {
          const url = new URL(request.url);
          return HttpResponse.json({
            data: {
              results: {},
              totalCount: 0,
              query: url.searchParams.get("q"),
              limit: Number(url.searchParams.get("limit")),
              offset: Number(url.searchParams.get("offset")),
            },
          });
        }),
      );
      const result = await wiseSearch({ q: "x" });
      expect(result.data.query).toBe("x");
    });

    it("passes AbortSignal when provided", async () => {
      const controller = new AbortController();
      server.use(
        http.get("/api/search", () =>
          HttpResponse.json({ data: { results: {}, totalCount: 0, query: "y" } }),
        ),
      );
      const result = await wiseSearch({ q: "y", signal: controller.signal });
      expect(result.data.query).toBe("y");
    });

    it("includes reviewStatus when set", async () => {
      server.use(
        http.get("/api/search", ({ request }) => {
          const url = new URL(request.url);
          return HttpResponse.json({
            data: {
              results: {},
              totalCount: 0,
              query: url.searchParams.get("q"),
              reviewStatus: url.searchParams.get("reviewStatus"),
            },
          });
        }),
      );
      const result = await wiseSearch({ q: "z", reviewStatus: "approved" });
      expect(result.data.query).toBe("z");
    });

    it("returns response.data", async () => {
      const mockData = {
        data: {
          results: { projects: { results: [], count: 0, icon: "folder" } },
          totalCount: 0,
          query: "test",
        },
      };
      server.use(http.get("/api/search", () => HttpResponse.json(mockData)));
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
