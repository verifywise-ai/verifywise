import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

vi.mock("../../../infrastructure/api/evalModelsService", () => ({
  evalModelsService: {
    listModels: vi.fn(),
    createModel: vi.fn(),
  },
}));

vi.mock("../../../infrastructure/api/evaluationLogsService", () => ({
  experimentsService: {
    getExperiments: vi.fn(),
  },
}));

vi.mock("../../../infrastructure/api/deepEvalScorersService", () => ({
  deepEvalScorersService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
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
import { experimentsService } from "../../../infrastructure/api/evaluationLogsService";
import { deepEvalScorersService } from "../../../infrastructure/api/deepEvalScorersService";
import { DEFAULT_JUDGE } from "../../../presentation/utils/providers";

const mockListModels = vi.mocked(evalModelsService.listModels);
const mockCreateModel = vi.mocked(evalModelsService.createModel);
const mockGetExperiments = vi.mocked(experimentsService.getExperiments);

describe("useModelPreferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetExperiments.mockResolvedValue({ experiments: [] });
  });

  it("takes the judge from the newest completed experiment that used one", async () => {
    mockListModels.mockResolvedValue([
      { id: "m1", orgId: "org-1", name: "GPT-4", provider: "openai" },
    ] as any);
    mockGetExperiments.mockResolvedValue({
      experiments: [
        { created_at: "2026-11-02", config: { evaluationMode: "scorer" } },
        {
          created_at: "2026-11-01",
          config: { judgeLlm: { provider: "anthropic", model: "claude-sonnet-4-6" } },
        },
        { created_at: "2026-10-01", config: { judgeLlm: { provider: "openai", model: "old" } } },
      ],
    });

    const { result } = renderHook(() => useModelPreferences("p1", "org-1"));

    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(mockGetExperiments).toHaveBeenCalledWith({ status: "completed", limit: 20 });
    expect(result.current.preferences!.model.name).toBe("GPT-4");
    expect(result.current.preferences!.judgeLlm).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      endpointUrl: undefined,
    });
  });

  it("falls back to the default judge when no experiment used one", async () => {
    mockListModels.mockResolvedValue([
      { id: "m1", orgId: "org-1", name: "GPT-4", provider: "openai" },
    ] as any);

    const { result } = renderHook(() => useModelPreferences("p1", "org-1"));

    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.preferences!.judgeLlm.model).toBe(DEFAULT_JUDGE.model);
    expect(result.current.preferences!.judgeLlm.provider).toBe(DEFAULT_JUDGE.provider);
  });

  it("returns null preferences when there are no models or experiments", async () => {
    mockListModels.mockResolvedValue([]);

    const { result } = renderHook(() => useModelPreferences("p1", "org-1"));

    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.preferences).toBeNull();
  });

  it("still loads the model when the experiment list fails", async () => {
    mockListModels.mockResolvedValue([
      { id: "m1", orgId: "org-1", name: "GPT-4", provider: "openai" },
    ] as any);
    mockGetExperiments.mockRejectedValue(new Error("fail"));

    const { result } = renderHook(() => useModelPreferences("p1", "org-1"));

    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.preferences!.model.name).toBe("GPT-4");
    expect(result.current.preferences!.judgeLlm.model).toBe(DEFAULT_JUDGE.model);
  });

  it("handles API errors gracefully", async () => {
    mockListModels.mockRejectedValue(new Error("fail"));

    const { result } = renderHook(() => useModelPreferences("p1", "org-1"));

    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.preferences).toBeNull();
  });

  it("saves a new model but never adds the judge to the Scorers list", async () => {
    mockListModels.mockResolvedValue([]);

    const { result } = renderHook(() => useModelPreferences("p1", "org-1"));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let saved = false;
    await act(async () => {
      saved = await result.current.savePreferences({
        model: { name: "gpt-4o-mini", accessMethod: "openai" },
        judgeLlm: { provider: "anthropic", model: "claude-sonnet-4-6" },
      });
    });

    expect(saved).toBe(true);
    expect(mockCreateModel).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "org-1", name: "gpt-4o-mini", provider: "openai" }),
    );
    expect(deepEvalScorersService.create).not.toHaveBeenCalled();
    expect(deepEvalScorersService.update).not.toHaveBeenCalled();
    expect(deepEvalScorersService.list).not.toHaveBeenCalled();
  });

  it("keeps the last judge when a scorer-only run is saved", async () => {
    mockListModels.mockResolvedValue([
      { id: "m1", orgId: "org-1", name: "GPT-4", provider: "openai" },
    ] as any);
    mockGetExperiments.mockResolvedValue({
      experiments: [
        { config: { judgeLlm: { provider: "anthropic", model: "claude-sonnet-4-6" } } },
      ],
    });

    const { result } = renderHook(() => useModelPreferences("p1", "org-1"));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.savePreferences({
        model: { name: "GPT-4", accessMethod: "openai" },
        judgeLlm: { provider: "", model: "" },
      });
    });

    expect(result.current.preferences!.judgeLlm.model).toBe("claude-sonnet-4-6");
  });
});
