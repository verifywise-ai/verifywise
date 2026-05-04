import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/vendorRisk.repository", () => ({
  createVendorRisk: vi.fn(),
  updateVendorRisk: vi.fn(),
  deleteVendorRisk: vi.fn(),
  getVendorRiskById: vi.fn(),
}));

import {
  useCreateVendorRisk,
  useUpdateVendorRisk,
  useDeleteVendorRisk,
  useVendorRisk,
} from "../useVendorRiskMutations";
import {
  createVendorRisk,
  updateVendorRisk,
  deleteVendorRisk,
  getVendorRiskById,
} from "../../repository/vendorRisk.repository";

const mockCreate = vi.mocked(createVendorRisk);
const mockUpdate = vi.mocked(updateVendorRisk);
const mockDelete = vi.mocked(deleteVendorRisk);
const mockGetById = vi.mocked(getVendorRiskById);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useCreateVendorRisk", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates vendor risk", async () => {
    mockCreate.mockResolvedValue({ data: { id: 1 } });

    const { result } = renderHook(() => useCreateVendorRisk(), { wrapper: createWrapper() });
    result.current.mutate({ risk_name: "Test Risk" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockCreate).toHaveBeenCalledWith({ body: { risk_name: "Test Risk" } });
  });
});

describe("useUpdateVendorRisk", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates vendor risk", async () => {
    mockUpdate.mockResolvedValue({ data: { id: 1 } });

    const { result } = renderHook(() => useUpdateVendorRisk(), { wrapper: createWrapper() });
    result.current.mutate({ id: 1, data: { risk_name: "Updated" } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockUpdate).toHaveBeenCalledWith({ id: 1, body: { risk_name: "Updated" } });
  });
});

describe("useDeleteVendorRisk", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes vendor risk", async () => {
    mockDelete.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useDeleteVendorRisk(), { wrapper: createWrapper() });
    result.current.mutate(5);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDelete).toHaveBeenCalledWith({ id: 5 });
  });
});

describe("useVendorRisk", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches vendor risk by ID", async () => {
    mockGetById.mockResolvedValue({ data: { id: 3, risk_name: "Data Leak" } });

    const { result } = renderHook(() => useVendorRisk(3), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: 3, risk_name: "Data Leak" });
  });
});
