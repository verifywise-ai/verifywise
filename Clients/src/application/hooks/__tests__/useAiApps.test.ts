import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/aiApp.repository", () => ({
  getAllAiApps: vi.fn(),
  getAiAppById: vi.fn(),
  createAiApp: vi.fn(),
  updateAiApp: vi.fn(),
  updateAiAppStatus: vi.fn(),
  deleteAiApp: vi.fn(),
  linkModelsToAiApp: vi.fn(),
  setPoliciesForAiApp: vi.fn(),
  setDataExposureForAiApp: vi.fn(),
  getPolicySuggestions: vi.fn(),
  promoteFromShadowAi: vi.fn(),
}));

import {
  useAiApps,
  useAiApp,
  useCreateAiApp,
  useUpdateAiApp,
  useUpdateAiAppStatus,
  useDeleteAiApp,
  useLinkModelsToAiApp,
  useSetPoliciesForAiApp,
  useSetDataExposureForAiApp,
  usePolicySuggestions,
  usePromoteFromShadowAi,
  aiAppQueryKeys,
} from "../useAiApps";
import {
  getAllAiApps,
  getAiAppById,
  createAiApp,
  updateAiApp,
  updateAiAppStatus,
  deleteAiApp,
  linkModelsToAiApp,
  setPoliciesForAiApp,
  setDataExposureForAiApp,
  getPolicySuggestions,
  promoteFromShadowAi,
} from "../../repository/aiApp.repository";
import { AiAppStatus } from "../../../domain/enums/aiApp.enum";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper, invalidateSpy };
}

describe("useAiApps hooks", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("useAiApps", () => {
    it("fetches the list of AI apps with filters", async () => {
      vi.mocked(getAllAiApps).mockResolvedValue({ ai_apps: [], total: 0 } as any);
      const { wrapper } = createWrapper();

      const { result } = renderHook(() => useAiApps({ status: AiAppStatus.APPROVED }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(getAllAiApps).toHaveBeenCalledWith(
        { status: AiAppStatus.APPROVED },
        expect.anything(),
      );
    });
  });

  describe("useAiApp", () => {
    it("fetches an app by id when id is provided", async () => {
      vi.mocked(getAiAppById).mockResolvedValue({ id: 1 } as any);
      const { wrapper } = createWrapper();

      const { result } = renderHook(() => useAiApp(1), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(getAiAppById).toHaveBeenCalledWith(1, expect.anything());
    });

    it("does not fetch when id is null", () => {
      const { wrapper } = createWrapper();

      const { result } = renderHook(() => useAiApp(null), { wrapper });

      expect(result.current.fetchStatus).toBe("idle");
      expect(getAiAppById).not.toHaveBeenCalled();
    });
  });

  describe("useCreateAiApp", () => {
    it("creates an app and invalidates the list", async () => {
      vi.mocked(createAiApp).mockResolvedValue({ id: 1 } as any);
      const { wrapper, invalidateSpy } = createWrapper();

      const { result } = renderHook(() => useCreateAiApp(), { wrapper });

      result.current.mutate({ name: "New App" } as any);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(createAiApp).toHaveBeenCalledWith({ name: "New App" });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: aiAppQueryKeys.lists() });
    });
  });

  describe("useUpdateAiApp", () => {
    it("updates an app and invalidates detail and list", async () => {
      vi.mocked(updateAiApp).mockResolvedValue({ id: 1 } as any);
      const { wrapper, invalidateSpy } = createWrapper();

      const { result } = renderHook(() => useUpdateAiApp(), { wrapper });

      result.current.mutate({ id: 1, data: { name: "Updated" } as any });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(updateAiApp).toHaveBeenCalledWith(1, { name: "Updated" });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: aiAppQueryKeys.detail(1) });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: aiAppQueryKeys.lists() });
    });
  });

  describe("useUpdateAiAppStatus", () => {
    it("updates the app status and invalidates detail and list", async () => {
      vi.mocked(updateAiAppStatus).mockResolvedValue({ id: 1 } as any);
      const { wrapper, invalidateSpy } = createWrapper();

      const { result } = renderHook(() => useUpdateAiAppStatus(), { wrapper });

      result.current.mutate({ id: 1, status: AiAppStatus.RESTRICTED });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(updateAiAppStatus).toHaveBeenCalledWith(1, AiAppStatus.RESTRICTED);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: aiAppQueryKeys.detail(1) });
    });
  });

  describe("useDeleteAiApp", () => {
    it("deletes an app and invalidates the list", async () => {
      vi.mocked(deleteAiApp).mockResolvedValue({ id: 1 } as any);
      const { wrapper, invalidateSpy } = createWrapper();

      const { result } = renderHook(() => useDeleteAiApp(), { wrapper });

      result.current.mutate(1);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(deleteAiApp).toHaveBeenCalledWith(1);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: aiAppQueryKeys.lists() });
    });
  });

  describe("useLinkModelsToAiApp", () => {
    it("links models and invalidates detail and list", async () => {
      vi.mocked(linkModelsToAiApp).mockResolvedValue({ id: 1 } as any);
      const { wrapper, invalidateSpy } = createWrapper();

      const { result } = renderHook(() => useLinkModelsToAiApp(), { wrapper });

      result.current.mutate({ id: 1, modelInventoryIds: [10] });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(linkModelsToAiApp).toHaveBeenCalledWith(1, [10]);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: aiAppQueryKeys.detail(1) });
    });
  });

  describe("useSetPoliciesForAiApp", () => {
    it("sets policies and invalidates the detail", async () => {
      vi.mocked(setPoliciesForAiApp).mockResolvedValue({ id: 1 } as any);
      const { wrapper, invalidateSpy } = createWrapper();

      const { result } = renderHook(() => useSetPoliciesForAiApp(), { wrapper });

      const policies = [{ policy_id: 1, status: "applicable" }];
      result.current.mutate({ id: 1, policies });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(setPoliciesForAiApp).toHaveBeenCalledWith(1, policies);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: aiAppQueryKeys.detail(1) });
    });
  });

  describe("useSetDataExposureForAiApp", () => {
    it("sets data exposure and invalidates the detail", async () => {
      vi.mocked(setDataExposureForAiApp).mockResolvedValue({ id: 1 } as any);
      const { wrapper, invalidateSpy } = createWrapper();

      const { result } = renderHook(() => useSetDataExposureForAiApp(), { wrapper });

      const dataExposure = [{ data_type: "pii", allowed: false }];
      result.current.mutate({ id: 1, dataExposure });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(setDataExposureForAiApp).toHaveBeenCalledWith(1, dataExposure);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: aiAppQueryKeys.detail(1) });
    });
  });

  describe("usePolicySuggestions", () => {
    it("fetches suggestions when a non-empty name is given", async () => {
      vi.mocked(getPolicySuggestions).mockResolvedValue([{ id: 1 }] as any);
      const { wrapper } = createWrapper();

      const { result } = renderHook(() => usePolicySuggestions("My App"), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(getPolicySuggestions).toHaveBeenCalledWith("My App", expect.anything());
    });

    it("does not fetch when the name is empty", () => {
      const { wrapper } = createWrapper();

      const { result } = renderHook(() => usePolicySuggestions(""), { wrapper });

      expect(result.current.fetchStatus).toBe("idle");
      expect(getPolicySuggestions).not.toHaveBeenCalled();
    });
  });

  describe("usePromoteFromShadowAi", () => {
    it("promotes a shadow AI tool and invalidates the list", async () => {
      vi.mocked(promoteFromShadowAi).mockResolvedValue({ id: 1 } as any);
      const { wrapper, invalidateSpy } = createWrapper();

      const { result } = renderHook(() => usePromoteFromShadowAi(), { wrapper });

      result.current.mutate(20);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(promoteFromShadowAi).toHaveBeenCalledWith(20);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: aiAppQueryKeys.lists() });
    });
  });
});

describe("aiAppQueryKeys", () => {
  it("builds hierarchical query keys", () => {
    expect(aiAppQueryKeys.all).toEqual(["aiApps"]);
    expect(aiAppQueryKeys.lists()).toEqual(["aiApps", "list"]);
    expect(aiAppQueryKeys.details()).toEqual(["aiApps", "detail"]);
    expect(aiAppQueryKeys.detail(1)).toEqual(["aiApps", "detail", 1]);
    expect(aiAppQueryKeys.policySuggestions("x")).toEqual(["aiApps", "policySuggestions", "x"]);
  });
});
