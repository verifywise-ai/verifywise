import { describe, it, expect } from "vitest";
import { server } from "../../../test/mocks/server";
import { http, HttpResponse } from "msw";

import { automationsService } from "../automationsService";

describe("automationsService", () => {
  it("getAll fetches /automations", async () => {
    const result = await automationsService.getAll();
    expect(result).toEqual([{ id: 1, name: "Daily Report", triggerId: 1, actionId: 1 }]);
  });

  it("getById fetches /automations/:id", async () => {
    const result = await automationsService.getById(5);
    expect(result).toEqual({ id: "5", name: "Automation Detail" });
  });

  it("create posts to /automations", async () => {
    server.use(
      http.post("/api/automations", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: { id: 10, ...body } }, { status: 201 });
      }),
    );
    const payload = { triggerId: 1, name: "New", params: "{}", actions: [] };
    const result = await automationsService.create(payload);
    expect(result.id).toBe(10);
  });

  it("update puts to /automations/:id", async () => {
    server.use(
      http.put("/api/automations/:id", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: { id: 3, ...body } });
      }),
    );
    const payload = { name: "Updated" };
    const result = await automationsService.update(3, payload);
    expect(result).toEqual({ id: 3, name: "Updated" });
  });

  it("delete calls DELETE /automations/:id", async () => {
    await automationsService.delete(7);
  });

  it("getTriggers fetches /automations/triggers", async () => {
    const result = await automationsService.getTriggers();
    expect(result).toEqual([{ id: 1, name: "Schedule", type: "cron" }]);
  });

  it("getActionsByTriggerId fetches actions by trigger", async () => {
    const result = await automationsService.getActionsByTriggerId(1);
    expect(result).toEqual([{ id: 1, triggerId: "1", name: "Send Email" }]);
  });

  it("getHistory fetches execution history", async () => {
    const result = await automationsService.getHistory(1, { limit: 10, offset: 0 });
    expect(result).toEqual({ logs: [{ id: 1, status: "success" }], total: 10 });
  });

  it("getStats fetches execution stats", async () => {
    const result = await automationsService.getStats(2);
    expect(result).toEqual({
      total_executions: 50,
      successful_executions: 45,
      failed_executions: 5,
    });
  });
});
