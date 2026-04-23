import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../customAxios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import { automationsService } from "../automationsService";
import CustomAxios from "../customAxios";

const mockAxios = vi.mocked(CustomAxios, { deep: true });

describe("automationsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getAll fetches /automations", async () => {
    mockAxios.get.mockResolvedValue({ data: { data: [{ id: 1 }] } });
    const result = await automationsService.getAll();
    expect(mockAxios.get).toHaveBeenCalledWith("/automations");
    expect(result).toEqual([{ id: 1 }]);
  });

  it("getById fetches /automations/:id", async () => {
    mockAxios.get.mockResolvedValue({ data: { data: { id: 5, name: "Auto" } } });
    const result = await automationsService.getById(5);
    expect(mockAxios.get).toHaveBeenCalledWith("/automations/5");
    expect(result).toEqual({ id: 5, name: "Auto" });
  });

  it("create posts to /automations", async () => {
    const payload = { triggerId: 1, name: "New", params: "{}", actions: [] };
    mockAxios.post.mockResolvedValue({ data: { data: { id: 10 } } });
    const result = await automationsService.create(payload);
    expect(mockAxios.post).toHaveBeenCalledWith("/automations", payload);
    expect(result).toEqual({ id: 10 });
  });

  it("update puts to /automations/:id", async () => {
    const payload = { name: "Updated" };
    mockAxios.put.mockResolvedValue({ data: { data: { id: 3, name: "Updated" } } });
    const result = await automationsService.update(3, payload);
    expect(mockAxios.put).toHaveBeenCalledWith("/automations/3", payload);
    expect(result).toEqual({ id: 3, name: "Updated" });
  });

  it("delete calls DELETE /automations/:id", async () => {
    mockAxios.delete.mockResolvedValue({});
    await automationsService.delete(7);
    expect(mockAxios.delete).toHaveBeenCalledWith("/automations/7");
  });

  it("getTriggers fetches /automations/triggers", async () => {
    mockAxios.get.mockResolvedValue({ data: { data: [{ id: 1, key: "on_create" }] } });
    const result = await automationsService.getTriggers();
    expect(mockAxios.get).toHaveBeenCalledWith("/automations/triggers");
    expect(result).toEqual([{ id: 1, key: "on_create" }]);
  });

  it("getActionsByTriggerId fetches actions by trigger", async () => {
    mockAxios.get.mockResolvedValue({ data: { data: [{ id: 2, key: "send_email" }] } });
    const result = await automationsService.getActionsByTriggerId(1);
    expect(mockAxios.get).toHaveBeenCalledWith("/automations/actions/by-triggerId/1");
    expect(result).toEqual([{ id: 2, key: "send_email" }]);
  });

  it("getHistory fetches execution history", async () => {
    mockAxios.get.mockResolvedValue({ data: { data: { logs: [], total: 0 } } });
    const result = await automationsService.getHistory(1, { limit: 10, offset: 0 });
    expect(mockAxios.get).toHaveBeenCalledWith("/automations/1/history", {
      params: { limit: 10, offset: 0 },
    });
    expect(result).toEqual({ logs: [], total: 0 });
  });

  it("getStats fetches execution stats", async () => {
    const stats = { total_executions: 5, successful_executions: 4, failed_executions: 1 };
    mockAxios.get.mockResolvedValue({ data: { data: stats } });
    const result = await automationsService.getStats(2);
    expect(mockAxios.get).toHaveBeenCalledWith("/automations/2/stats");
    expect(result).toEqual(stats);
  });
});
