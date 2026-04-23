import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/vendor.repository", () => ({
  getAllVendors: vi.fn(),
  getVendorById: vi.fn(),
  getVendorsByProjectId: vi.fn(),
  createNewVendor: vi.fn(),
  update: vi.fn(),
  deleteVendor: vi.fn(),
}));

import { useVendors, vendorQueryKeys } from "../useVendors";
import { getAllVendors, getVendorsByProjectId } from "../../repository/vendor.repository";

const mockGetAllVendors = vi.mocked(getAllVendors);
const mockGetByProject = vi.mocked(getVendorsByProjectId);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useVendors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches all vendors when no projectId filter", async () => {
    const vendors = [{ id: 1, name: "Vendor A" }];
    mockGetAllVendors.mockResolvedValue({ data: vendors });

    const { result } = renderHook(() => useVendors(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(vendors);
    expect(mockGetAllVendors).toHaveBeenCalled();
  });

  it("fetches vendors by project when projectId provided", async () => {
    const vendors = [{ id: 2, name: "Vendor B" }];
    mockGetByProject.mockResolvedValue({ data: vendors });

    const { result } = renderHook(() => useVendors({ projectId: 5 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(vendors);
    expect(mockGetByProject).toHaveBeenCalledWith({ projectId: 5 });
  });

  it("fetches all vendors when projectId is 'all'", async () => {
    mockGetAllVendors.mockResolvedValue({ data: [] });

    const { result } = renderHook(() => useVendors({ projectId: "all" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGetAllVendors).toHaveBeenCalled();
  });
});

describe("vendorQueryKeys", () => {
  it("generates correct keys", () => {
    expect(vendorQueryKeys.all).toEqual(["vendors"]);
    expect(vendorQueryKeys.detail(5)).toEqual(["vendors", "detail", 5]);
  });
});
