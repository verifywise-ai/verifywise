import { describe, it, expect, beforeEach } from "vitest";
import { server } from "../../../test/mocks/server";
import { http, HttpResponse } from "msw";

import { deepEvalOrgsService } from "../deepEvalOrgsService";

describe("deepEvalOrgsService", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("getAllOrgs fetches orgs", async () => {
    server.use(
      http.get("/api/deepeval/orgs", () => HttpResponse.json({ orgs: [{ id: "1", name: "Org" }] })),
    );
    const result = await deepEvalOrgsService.getAllOrgs();
    expect(result.orgs).toHaveLength(1);
  });

  it("getAllOrgs returns empty array on 404", async () => {
    server.use(
      http.get("/api/deepeval/orgs", () => HttpResponse.json({ orgs: [] }, { status: 404 })),
    );
    const result = await deepEvalOrgsService.getAllOrgs();
    expect(result.orgs).toEqual([]);
  });

  it("getAllOrgs rethrows non-404 errors", async () => {
    server.use(
      http.get("/api/deepeval/orgs", () =>
        HttpResponse.json({ message: "Server error" }, { status: 500 }),
      ),
    );
    await expect(deepEvalOrgsService.getAllOrgs()).rejects.toThrow();
  });

  it("createOrg posts name and member_ids", async () => {
    server.use(
      http.post("/api/deepeval/orgs", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ org: { id: "new", name: body.name } }, { status: 201 });
      }),
    );
    const result = await deepEvalOrgsService.createOrg("New Org", [1, 2]);
    expect(result.org.name).toBe("New Org");
  });

  it("updateOrg puts updated data", async () => {
    server.use(
      http.put("/api/deepeval/orgs/:id", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ org: { id: "1", name: body.name } });
      }),
    );
    const result = await deepEvalOrgsService.updateOrg("1", "Updated", [3]);
    expect(result.org.name).toBe("Updated");
  });

  it("deleteOrg calls DELETE and clears current if matching", async () => {
    server.use(http.delete("/api/deepeval/orgs/:id", () => HttpResponse.json({})));
    localStorage.setItem("vw_evals_current_org", "org-1");
    await deepEvalOrgsService.deleteOrg("org-1");
    expect(localStorage.getItem("vw_evals_current_org")).toBeNull();
  });

  it("getProjectsForOrg fetches project IDs", async () => {
    const result = await deepEvalOrgsService.getProjectsForOrg("org-1");
    expect(result).toEqual(["p1", "p2", "p3"]);
  });

  it("setCurrentOrg and getCurrentOrg work together", async () => {
    server.use(
      http.get("/api/deepeval/orgs", () =>
        HttpResponse.json({ orgs: [{ id: "org-x", name: "X" }] }),
      ),
    );
    await deepEvalOrgsService.setCurrentOrg("org-x");
    const result = await deepEvalOrgsService.getCurrentOrg();
    expect(result.org).toEqual({ id: "org-x", name: "X" });
  });

  it("getCurrentOrg returns null when no org set", async () => {
    const result = await deepEvalOrgsService.getCurrentOrg();
    expect(result.org).toBeNull();
  });

  it("clearCurrentOrg removes from localStorage", async () => {
    localStorage.setItem("vw_evals_current_org", "org-1");
    await deepEvalOrgsService.clearCurrentOrg();
    expect(localStorage.getItem("vw_evals_current_org")).toBeNull();
  });
});
