import { describe, it, expect } from "vitest";
import { server } from "../../../test/mocks/server";
import { http, HttpResponse } from "msw";

import { deepEvalScorersService } from "../deepEvalScorersService";

describe("deepEvalScorersService", () => {
  it("list fetches scorers with params", async () => {
    server.use(
      http.get("/api/deepeval/scorers", () =>
        HttpResponse.json({
          scorers: [{ id: "s1", name: "Test Scorer" }],
        }),
      ),
    );
    const result = await deepEvalScorersService.list({ org_id: "org-1" });
    expect(result.scorers).toHaveLength(1);
    expect(result.scorers[0].id).toBe("s1");
  });

  it("create posts scorer with orgId", async () => {
    server.use(
      http.post("/api/deepeval/scorers", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          id: body.id || "s1",
          name: body.name,
          metricKey: body.metricKey,
        });
      }),
    );
    const result = await deepEvalScorersService.create({
      name: "Test",
      metricKey: "m1",
      orgId: "org-1",
    });
    expect(result.id).toBe("s1");
  });

  it("update puts scorer data", async () => {
    server.use(
      http.put("/api/deepeval/scorers/:id", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "s1", name: body.name });
      }),
    );
    const result = await deepEvalScorersService.update("s1", { name: "Updated" });
    expect(result.name).toBe("Updated");
  });

  it("delete removes scorer", async () => {
    server.use(
      http.delete("/api/deepeval/scorers/:id", () =>
        HttpResponse.json({ message: "deleted", id: "s1" }),
      ),
    );
    const result = await deepEvalScorersService.delete("s1");
    expect(result.message).toBe("deleted");
  });

  it("test sends test payload", async () => {
    server.use(
      http.post("/api/deepeval/scorers/:id/test", () =>
        HttpResponse.json({ scorerId: "s1", score: 0.9, passed: true }),
      ),
    );
    const result = await deepEvalScorersService.test("s1", { input: "hi", output: "hello" });
    expect(result.passed).toBe(true);
  });
});
