import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/mrm.repository", () => ({
  getFleetTiering: vi.fn(),
  assignModelTier: vi.fn(),
  getValidations: vi.fn(),
  createValidation: vi.fn(),
  updateValidation: vi.fn(),
  signoffValidation: vi.fn(),
  getFindings: vi.fn(),
  createFinding: vi.fn(),
  updateFinding: vi.fn(),
  getModelRoles: vi.fn(),
  setModelRoles: vi.fn(),
  getModelMonitoring: vi.fn(),
  getMetricTrend: vi.fn(),
  getModelBreaches: vi.fn(),
  getIngestionTokens: vi.fn(),
  createIngestionToken: vi.fn(),
  rotateIngestionToken: vi.fn(),
  revokeIngestionToken: vi.fn(),
  getThresholds: vi.fn(),
  createThreshold: vi.fn(),
  updateThreshold: vi.fn(),
  deleteThreshold: vi.fn(),
  getMetricKeys: vi.fn(),
  createMetricKey: vi.fn(),
  getRevalidationEvents: vi.fn(),
  getAttestationSummary: vi.fn(),
  getMrmSettings: vi.fn(),
  updateMrmSettings: vi.fn(),
}));

import {
  mrmQueryKeys,
  useFleetTiering,
  useAssignModelTier,
  useValidations,
  useCreateValidation,
  useUpdateValidation,
  useSignoffValidation,
  useFindings,
  useCreateFinding,
  useUpdateFinding,
  useModelRoles,
  useSetModelRoles,
  useModelMonitoring,
  useMetricTrend,
  useModelBreaches,
  useIngestionTokens,
  useCreateIngestionToken,
  useRotateIngestionToken,
  useRevokeIngestionToken,
  useThresholds,
  useCreateThreshold,
  useUpdateThreshold,
  useDeleteThreshold,
  useMetricKeys,
  useCreateMetricKey,
  useAttestationSummary,
  useRevalidationEvents,
  useMrmSettings,
  useUpdateMrmSettings,
} from "../useMrm";
import * as mrmRepo from "../../repository/mrm.repository";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper, invalidateSpy };
}

describe("useMrm query hooks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("useFleetTiering fetches fleet tiering", async () => {
    vi.mocked(mrmRepo.getFleetTiering).mockResolvedValue([{ id: 1 }] as any);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useFleetTiering(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mrmRepo.getFleetTiering).toHaveBeenCalledWith(expect.anything());
  });

  it("useValidations fetches validations scoped to a model", async () => {
    vi.mocked(mrmRepo.getValidations).mockResolvedValue([] as any);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useValidations(5), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mrmRepo.getValidations).toHaveBeenCalledWith(5, expect.anything());
  });

  it("useFindings fetches findings with filters", async () => {
    vi.mocked(mrmRepo.getFindings).mockResolvedValue([] as any);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useFindings({ modelId: 1 }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mrmRepo.getFindings).toHaveBeenCalledWith({ modelId: 1 }, expect.anything());
  });

  it("useModelRoles fetches roles when modelId is present", async () => {
    vi.mocked(mrmRepo.getModelRoles).mockResolvedValue([] as any);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useModelRoles(1), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mrmRepo.getModelRoles).toHaveBeenCalledWith(1, expect.anything());
  });

  it("useModelRoles returns empty and stays idle when modelId is null", () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useModelRoles(null), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(mrmRepo.getModelRoles).not.toHaveBeenCalled();
  });

  it("useModelMonitoring fetches monitoring data when modelId is present", async () => {
    vi.mocked(mrmRepo.getModelMonitoring).mockResolvedValue([] as any);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useModelMonitoring(1), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mrmRepo.getModelMonitoring).toHaveBeenCalledWith(1, expect.anything());
  });

  it("useModelMonitoring stays idle when modelId is null", () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useModelMonitoring(null), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
  });

  it("useMetricTrend fetches trend data when modelId and metric are present", async () => {
    vi.mocked(mrmRepo.getMetricTrend).mockResolvedValue([] as any);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useMetricTrend(1, "accuracy"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mrmRepo.getMetricTrend).toHaveBeenCalledWith(1, "accuracy", expect.anything());
  });

  it("useMetricTrend stays idle when metric is missing", () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useMetricTrend(1, ""), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
  });

  it("useModelBreaches fetches breach history when modelId is present", async () => {
    vi.mocked(mrmRepo.getModelBreaches).mockResolvedValue([] as any);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useModelBreaches(1), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mrmRepo.getModelBreaches).toHaveBeenCalledWith(1, expect.anything());
  });

  it("useIngestionTokens fetches ingestion tokens", async () => {
    vi.mocked(mrmRepo.getIngestionTokens).mockResolvedValue([] as any);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useIngestionTokens(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mrmRepo.getIngestionTokens).toHaveBeenCalledWith(expect.anything());
  });

  it("useThresholds fetches thresholds with filters", async () => {
    vi.mocked(mrmRepo.getThresholds).mockResolvedValue([] as any);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useThresholds({ metric: "accuracy" }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mrmRepo.getThresholds).toHaveBeenCalledWith({ metric: "accuracy" }, expect.anything());
  });

  it("useMetricKeys fetches metric keys", async () => {
    vi.mocked(mrmRepo.getMetricKeys).mockResolvedValue([] as any);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useMetricKeys(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mrmRepo.getMetricKeys).toHaveBeenCalledWith(expect.anything());
  });

  it("useAttestationSummary fetches the attestation summary", async () => {
    vi.mocked(mrmRepo.getAttestationSummary).mockResolvedValue({ totalModels: 5 } as any);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useAttestationSummary(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mrmRepo.getAttestationSummary).toHaveBeenCalledWith(expect.anything());
  });

  it("useRevalidationEvents fetches events when modelId is present", async () => {
    vi.mocked(mrmRepo.getRevalidationEvents).mockResolvedValue([] as any);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useRevalidationEvents(1), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mrmRepo.getRevalidationEvents).toHaveBeenCalledWith(1, expect.anything());
  });

  it("useRevalidationEvents stays idle when modelId is null", () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useRevalidationEvents(null), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
  });

  it("useMrmSettings fetches settings", async () => {
    vi.mocked(mrmRepo.getMrmSettings).mockResolvedValue({ retentionDays: 90 } as any);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useMrmSettings(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mrmRepo.getMrmSettings).toHaveBeenCalledWith(expect.anything());
  });
});

describe("useMrm mutation hooks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("useAssignModelTier assigns a tier and invalidates all mrm queries", async () => {
    vi.mocked(mrmRepo.assignModelTier).mockResolvedValue({ id: 1 } as any);
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useAssignModelTier(), { wrapper });
    result.current.mutate({ modelId: 1, payload: { tier: "tier_1" } as any });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mrmRepo.assignModelTier).toHaveBeenCalledWith(1, { tier: "tier_1" });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: mrmQueryKeys.all });
  });

  it("useCreateValidation creates a validation and invalidates all mrm queries", async () => {
    vi.mocked(mrmRepo.createValidation).mockResolvedValue({ id: 1 } as any);
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useCreateValidation(), { wrapper });
    result.current.mutate({ modelId: 1, payload: {} as any });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mrmRepo.createValidation).toHaveBeenCalledWith(1, {});
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: mrmQueryKeys.all });
  });

  it("useUpdateValidation updates a validation and invalidates all mrm queries", async () => {
    vi.mocked(mrmRepo.updateValidation).mockResolvedValue({ id: 1 } as any);
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useUpdateValidation(), { wrapper });
    result.current.mutate({ id: 1, payload: {} as any });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mrmRepo.updateValidation).toHaveBeenCalledWith(1, {});
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: mrmQueryKeys.all });
  });

  it("useSignoffValidation signs off a validation and invalidates all mrm queries", async () => {
    vi.mocked(mrmRepo.signoffValidation).mockResolvedValue({ id: 1 } as any);
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useSignoffValidation(), { wrapper });
    result.current.mutate({ id: 1, payload: {} as any });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mrmRepo.signoffValidation).toHaveBeenCalledWith(1, {});
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: mrmQueryKeys.all });
  });

  it("useCreateFinding creates a finding and invalidates all mrm queries", async () => {
    vi.mocked(mrmRepo.createFinding).mockResolvedValue({ id: 1 } as any);
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useCreateFinding(), { wrapper });
    result.current.mutate({ validationId: 1, payload: {} as any });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mrmRepo.createFinding).toHaveBeenCalledWith(1, {});
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: mrmQueryKeys.all });
  });

  it("useUpdateFinding updates a finding and invalidates all mrm queries", async () => {
    vi.mocked(mrmRepo.updateFinding).mockResolvedValue({ id: 1 } as any);
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useUpdateFinding(), { wrapper });
    result.current.mutate({ id: 1, payload: {} as any });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mrmRepo.updateFinding).toHaveBeenCalledWith(1, {});
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: mrmQueryKeys.all });
  });

  it("useSetModelRoles sets roles and invalidates the roles query for that model", async () => {
    vi.mocked(mrmRepo.setModelRoles).mockResolvedValue([] as any);
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useSetModelRoles(), { wrapper });
    const assignments = [{ user_id: 1, role: "owner" }] as any;
    result.current.mutate({ modelId: 1, assignments });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mrmRepo.setModelRoles).toHaveBeenCalledWith(1, assignments);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: mrmQueryKeys.roles(1) });
  });

  it("useCreateIngestionToken creates a token and invalidates the ingestion tokens query", async () => {
    vi.mocked(mrmRepo.createIngestionToken).mockResolvedValue({ token: "abc" } as any);
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useCreateIngestionToken(), { wrapper });
    result.current.mutate({ model_id: 1 } as any);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mrmRepo.createIngestionToken).toHaveBeenCalledWith({ model_id: 1 });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: mrmQueryKeys.ingestionTokens() });
  });

  it("useRotateIngestionToken rotates a token and invalidates the ingestion tokens query", async () => {
    vi.mocked(mrmRepo.rotateIngestionToken).mockResolvedValue({ token: "new" } as any);
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useRotateIngestionToken(), { wrapper });
    result.current.mutate(1);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mrmRepo.rotateIngestionToken).toHaveBeenCalledWith(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: mrmQueryKeys.ingestionTokens() });
  });

  it("useRevokeIngestionToken revokes a token and invalidates the ingestion tokens query", async () => {
    vi.mocked(mrmRepo.revokeIngestionToken).mockResolvedValue({ id: 1 } as any);
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useRevokeIngestionToken(), { wrapper });
    result.current.mutate(1);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mrmRepo.revokeIngestionToken).toHaveBeenCalledWith(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: mrmQueryKeys.ingestionTokens() });
  });

  it("useCreateThreshold creates a threshold and invalidates all mrm queries", async () => {
    vi.mocked(mrmRepo.createThreshold).mockResolvedValue({ id: 1 } as any);
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useCreateThreshold(), { wrapper });
    result.current.mutate({ modelId: 1, payload: {} as any });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mrmRepo.createThreshold).toHaveBeenCalledWith(1, {});
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: mrmQueryKeys.all });
  });

  it("useUpdateThreshold updates a threshold and invalidates all mrm queries", async () => {
    vi.mocked(mrmRepo.updateThreshold).mockResolvedValue({ id: 1 } as any);
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useUpdateThreshold(), { wrapper });
    result.current.mutate({ id: 1, payload: {} as any });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mrmRepo.updateThreshold).toHaveBeenCalledWith(1, {});
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: mrmQueryKeys.all });
  });

  it("useDeleteThreshold deletes a threshold and invalidates all mrm queries", async () => {
    vi.mocked(mrmRepo.deleteThreshold).mockResolvedValue(undefined);
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useDeleteThreshold(), { wrapper });
    result.current.mutate(1);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mrmRepo.deleteThreshold).toHaveBeenCalledWith(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: mrmQueryKeys.all });
  });

  it("useCreateMetricKey creates a metric key and invalidates the metric keys query", async () => {
    vi.mocked(mrmRepo.createMetricKey).mockResolvedValue({ id: 1 } as any);
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useCreateMetricKey(), { wrapper });
    result.current.mutate({ key: "accuracy" } as any);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mrmRepo.createMetricKey).toHaveBeenCalledWith({ key: "accuracy" });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: mrmQueryKeys.metricKeys() });
  });

  it("useUpdateMrmSettings updates settings and invalidates the settings query", async () => {
    vi.mocked(mrmRepo.updateMrmSettings).mockResolvedValue({ retentionDays: 120 } as any);
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useUpdateMrmSettings(), { wrapper });
    result.current.mutate({ retentionDays: 120 } as any);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mrmRepo.updateMrmSettings).toHaveBeenCalledWith({ retentionDays: 120 });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: mrmQueryKeys.settings() });
  });
});

describe("mrmQueryKeys", () => {
  it("builds hierarchical query keys with sensible defaults", () => {
    expect(mrmQueryKeys.all).toEqual(["mrm"]);
    expect(mrmQueryKeys.tiering()).toEqual(["mrm", "tiering"]);
    expect(mrmQueryKeys.validations()).toEqual(["mrm", "validations", "all"]);
    expect(mrmQueryKeys.validations(3)).toEqual(["mrm", "validations", 3]);
    expect(mrmQueryKeys.findings()).toEqual(["mrm", "findings", "all", "all"]);
    expect(mrmQueryKeys.findings({ modelId: 1, validationId: 2 })).toEqual([
      "mrm",
      "findings",
      1,
      2,
    ]);
    expect(mrmQueryKeys.roles(null)).toEqual(["mrm", "roles", -1]);
    expect(mrmQueryKeys.roles(5)).toEqual(["mrm", "roles", 5]);
    expect(mrmQueryKeys.monitoring(null)).toEqual(["mrm", "monitoring", -1]);
    expect(mrmQueryKeys.breaches(null)).toEqual(["mrm", "breaches", -1]);
    expect(mrmQueryKeys.trend(1, "accuracy")).toEqual(["mrm", "trend", 1, "accuracy"]);
    expect(mrmQueryKeys.ingestionTokens()).toEqual(["mrm", "ingestion-tokens"]);
    expect(mrmQueryKeys.thresholds()).toEqual(["mrm", "thresholds", "all", "all"]);
    expect(mrmQueryKeys.metricKeys()).toEqual(["mrm", "metric-keys"]);
    expect(mrmQueryKeys.attestationSummary()).toEqual(["mrm", "attestation-summary"]);
    expect(mrmQueryKeys.revalidationEvents(null)).toEqual(["mrm", "revalidation-events", -1]);
    expect(mrmQueryKeys.settings()).toEqual(["mrm", "settings"]);
  });
});
