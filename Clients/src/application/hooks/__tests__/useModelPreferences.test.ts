import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useModelPreferences } from "../useModelPreferences";
import { evalModelsService } from "../../../infrastructure/api/evalModelsService";
import { deepEvalScorersService } from "../../../infrastructure/api/deepEvalScorersService";
import { deepEvalOrgsService } from "../../../infrastructure/api/deepEvalOrgsService";

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
    getCurrentOrg: vi.fn(),
    getAllOrgs: vi.fn(),
  },
}));

const mockListModels = evalModelsService.listModels as unknown as ReturnType<typeof vi.fn>;
const mockCreateModel = evalModelsService.createModel as unknown as ReturnType<typeof vi.fn>;
const mockListScorers = deepEvalScorersService.list as unknown as ReturnType<typeof vi.fn>;
const mockCreateScorer = deepEvalScorersService.create as unknown as ReturnType<typeof vi.fn>;
const mockGetCurrentOrg = deepEvalOrgsService.getCurrentOrg as unknown as ReturnType<typeof vi.fn>;
const mockGetAllOrgs = deepEvalOrgsService.getAllOrgs as unknown as ReturnType<typeof vi.fn>;

describe("useModelPreferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initial state", () => {
    it("should have correct initial state", async () => {
      mockListModels.mockResolvedValue([]);
      mockListScorers.mockResolvedValue({ scorers: [] });

      const { result } = renderHook(() => useModelPreferences("project-1"));

      expect(result.current.loading).toBe(true);
      expect(result.current.loaded).toBe(false);
      expect(result.current.preferences).toBeNull();
    });
  });

  describe("loadPreferences", () => {
    it("should load preferences with model and judge", async () => {
      const mockModels = [
        { name: "GPT-4", provider: "openai", endpointUrl: "https://api.openai.com", updatedAt: "2024-01-01" },
      ];
      const mockScorers = {
        scorers: [
          {
            type: "llm",
            config: { provider: "anthropic", model: "claude-3", endpointUrl: "https://api.anthropic.com", temperature: 0.5, maxTokens: 1024 },
            updatedAt: "2024-01-02",
          },
        ],
      };

      mockListModels.mockResolvedValue(mockModels);
      mockListScorers.mockResolvedValue(mockScorers);

      const { result } = renderHook(() => useModelPreferences("project-1"));

      await waitFor(() => {
        expect(result.current.loaded).toBe(true);
      });

      expect(result.current.preferences).not.toBeNull();
      expect(result.current.preferences?.model.name).toBe("GPT-4");
      expect(result.current.preferences?.model.accessMethod).toBe("openai");
      expect(result.current.preferences?.judgeLlm.model).toBe("claude-3");
      expect(result.current.loading).toBe(false);
    });

    it("should use defaults when no model or judge available", async () => {
      mockListModels.mockResolvedValue([]);
      mockListScorers.mockResolvedValue({ scorers: [] });

      const { result } = renderHook(() => useModelPreferences("project-1"));

      await waitFor(() => {
        expect(result.current.loaded).toBe(true);
      });

      expect(result.current.preferences).toBeNull();
    });

    it("should handle API errors gracefully", async () => {
      mockListModels.mockRejectedValue(new Error("API Error"));
      mockListScorers.mockRejectedValue(new Error("API Error"));

      const { result } = renderHook(() => useModelPreferences("project-1"));

      await waitFor(() => {
        expect(result.current.loaded).toBe(true);
      });

      expect(result.current.preferences).toBeNull();
    });
  });

  describe("getPreferences", () => {
    it("should return cached preferences when already loaded", async () => {
      const mockModels = [{ name: "Cached Model", provider: "openai", updatedAt: "2024-01-01" }];
      mockListModels.mockResolvedValue(mockModels);
      mockListScorers.mockResolvedValue({ scorers: [] });

      const { result } = renderHook(() => useModelPreferences("project-1"));

      await waitFor(() => {
        expect(result.current.loaded).toBe(true);
      });

      const prefs = await result.current.getPreferences();
      expect(prefs?.model.name).toBe("Cached Model");
    });

    it("should fetch when not loaded", async () => {
      mockListModels.mockResolvedValue([]);
      mockListScorers.mockResolvedValue({ scorers: [] });

      const { result } = renderHook(() => useModelPreferences("project-1"));

      const prefs = await result.current.getPreferences();
      expect(prefs).toBeNull();
    });
  });

  describe("savePreferences", () => {
    it("should save preferences successfully", async () => {
      mockGetCurrentOrg.mockResolvedValue({ org: { id: "org-1" } });
      mockListModels.mockResolvedValue([]);
      mockCreateModel.mockResolvedValue({ id: "model-1" });
      mockListScorers.mockResolvedValue({ scorers: [] });
      mockCreateScorer.mockResolvedValue({ id: "scorer-1" });

      const prefs = {
        model: { name: "New Model", accessMethod: "openai" },
        judgeLlm: { provider: "anthropic", model: "claude-3", temperature: 0.7, maxTokens: 2048 },
      };

      const { result } = renderHook(() => useModelPreferences("project-1", "org-1"));

      await waitFor(() => {
        expect(result.current.loaded).toBe(true);
      });

      const success = await result.current.savePreferences(prefs);
      expect(success).toBe(true);
      expect(mockCreateModel).toHaveBeenCalled();
    });

    it("should not duplicate existing model", async () => {
      mockGetCurrentOrg.mockResolvedValue({ org: { id: "org-1" } });
      mockListModels.mockResolvedValue([{ name: "Existing Model", provider: "openai" }]);
      mockListScorers.mockResolvedValue({ scorers: [] });

      const prefs = {
        model: { name: "Existing Model", accessMethod: "openai" },
        judgeLlm: { provider: "anthropic", model: "claude-3", temperature: 0.7, maxTokens: 2048 },
      };

      const { result } = renderHook(() => useModelPreferences("project-1", "org-1"));

      await waitFor(() => {
        expect(result.current.loaded).toBe(true);
      });

      await result.current.savePreferences(prefs);
      expect(mockCreateModel).not.toHaveBeenCalled();
    });

    it("should return false when no org found", async () => {
      mockGetCurrentOrg.mockResolvedValue({ org: null });
      mockGetAllOrgs.mockResolvedValue({ orgs: [] });

      const prefs = {
        model: { name: "Model", accessMethod: "openai" },
        judgeLlm: { provider: "anthropic", model: "claude-3", temperature: 0.7, maxTokens: 2048 },
      };

      const { result } = renderHook(() => useModelPreferences("project-1"));

      await waitFor(() => {
        expect(result.current.loaded).toBe(true);
      });

      const success = await result.current.savePreferences(prefs);
      expect(success).toBe(false);
    });

    it("should handle save errors gracefully", async () => {
      mockGetCurrentOrg.mockRejectedValue(new Error("Network error"));

      const prefs = {
        model: { name: "Model", accessMethod: "openai" },
        judgeLlm: { provider: "anthropic", model: "claude-3", temperature: 0.7, maxTokens: 2048 },
      };

      const { result } = renderHook(() => useModelPreferences("project-1"));

      await waitFor(() => {
        expect(result.current.loaded).toBe(true);
      });

      const success = await result.current.savePreferences(prefs);
      expect(success).toBe(false);
    });
  });

  describe("hasPreferences", () => {
    it("should return true when preferences exist", async () => {
      const mockModels = [{ name: "Model", provider: "openai", updatedAt: "2024-01-01" }];
      mockListModels.mockResolvedValue(mockModels);
      mockListScorers.mockResolvedValue({ scorers: [] });

      const { result } = renderHook(() => useModelPreferences("project-1"));

      await waitFor(() => {
        expect(result.current.loaded).toBe(true);
      });

      expect(result.current.hasPreferences()).toBe(true);
    });

    it("should return false when preferences are null", async () => {
      mockListModels.mockResolvedValue([]);
      mockListScorers.mockResolvedValue({ scorers: [] });

      const { result } = renderHook(() => useModelPreferences("project-1"));

      await waitFor(() => {
        expect(result.current.loaded).toBe(true);
      });

      expect(result.current.hasPreferences()).toBe(false);
    });
  });

  describe("clearPreferences", () => {
    it("should return false (not implemented)", async () => {
      const { result } = renderHook(() => useModelPreferences("project-1"));

      const success = await result.current.clearPreferences();
      expect(success).toBe(false);
    });
  });
});
