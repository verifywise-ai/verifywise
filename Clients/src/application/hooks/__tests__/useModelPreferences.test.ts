import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("../../../infrastructure/api/evalModelsService", () => ({
  evalModelsService: {
    listModels: vi.fn(),
    createModel: vi.fn(),
  },
}));

vi.mock("../../../infrastructure/api/deepEvalScorersService", () => ({
  deepEvalScorersService: {
    list: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("../../../infrastructure/api/deepEvalOrgsService", () => ({
  deepEvalOrgsService: {
    getCurrentOrg: vi.fn().mockResolvedValue({ org: { id: "org-1" } }),
    getAllOrgs: vi.fn().mockResolvedValue({ orgs: [{ id: "org-1" }] }),
  },
}));

import { useModelPreferences } from "../useModelPreferences";
import { evalModelsService } from "../../../infrastructure/api/evalModelsService";
import { deepEvalScorersService } from "../../../infrastructure/api/deepEvalScorersService";

const mockListModels = vi.mocked(evalModelsService.listModels);
const mockListScorers = vi.mocked(deepEvalScorersService.list);

describe("useModelPreferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads preferences from API on mount", async () => {
    mockListModels.mockResolvedValue([
      { id: "m1", orgId: "org-1", name: "GPT-4", provider: "openai" },
    ] as any);
    mockListScorers.mockResolvedValue({
      scorers: [
        {
          id: "s1",
          type: "llm",
          config: { provider: "openai", model: "gpt-4o", temperature: 0.5, maxTokens: 1024 },
          updatedAt: "2024-01-01",
        },
      ],
    } as any);

    const { result } = renderHook(() => useModelPreferences("p1", "org-1"));

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    expect(result.current.preferences).not.toBeNull();
    expect(result.current.preferences!.model.name).toBe("GPT-4");
    expect(result.current.preferences!.judgeLlm.model).toBe("gpt-4o");
  });

  it("returns null preferences when no models or scorers", async () => {
    mockListModels.mockResolvedValue([]);
    mockListScorers.mockResolvedValue({ scorers: [] });

    const { result } = renderHook(() => useModelPreferences("p1", "org-1"));

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    expect(result.current.preferences).toBeNull();
  });

  it("handles API errors gracefully", async () => {
    mockListModels.mockRejectedValue(new Error("fail"));
    mockListScorers.mockRejectedValue(new Error("fail"));

    const { result } = renderHook(() => useModelPreferences("p1", "org-1"));

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    expect(result.current.preferences).toBeNull();
  });
});
