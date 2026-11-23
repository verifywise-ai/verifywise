import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/vendorRisk.repository", () => ({
  getAllVendorRisks: vi.fn(),
}));

import useVendorRisks from "../useVendorRisks";
import { getAllVendorRisks } from "../../repository/vendorRisk.repository";

const mockGetAll = vi.mocked(getAllVendorRisks);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useVendorRisks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches vendor risks", async () => {
    mockGetAll.mockResolvedValue({
      data: [
        { id: 1, risk_level: "High", project_id: 1, vendor_id: 1 },
        { id: 2, risk_level: "Low", project_id: 1, vendor_id: 2 },
      ],
    });

    const { result } = renderHook(() => useVendorRisks({}), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loadingVendorRisks).toBe(false));
    expect(result.current.vendorRisks).toHaveLength(2);
    expect(result.current.vendorRisksSummary.total).toBe(2);
  });

  it("filters by projectId", async () => {
    mockGetAll.mockResolvedValue({
      data: [
        { id: 1, risk_level: "High", project_id: 1, vendor_id: 1 },
        { id: 2, risk_level: "Low", project_id: 2, vendor_id: 2 },
      ],
    });

    const { result } = renderHook(() => useVendorRisks({ projectId: "1" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loadingVendorRisks).toBe(false));
    expect(result.current.vendorRisks).toHaveLength(1);
  });

  it("keeps each risk once although the API sends a row per use case", async () => {
    mockGetAll.mockResolvedValue({
      data: [
        { risk_id: 1, risk_level: "High risk", project_id: 1, vendor_id: 1 },
        { risk_id: 1, risk_level: "High risk", project_id: 2, vendor_id: 1 },
        { risk_id: 1, risk_level: "High risk", project_id: 3, vendor_id: 1 },
        { risk_id: 2, risk_level: "No risk", project_id: 1, vendor_id: 2 },
      ],
    });

    const { result } = renderHook(() => useVendorRisks({}), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loadingVendorRisks).toBe(false));
    expect(result.current.vendorRisks).toHaveLength(2);
    expect(result.current.vendorRisks[0].project_ids).toEqual([1, 2, 3]);
    expect(result.current.vendorRisksSummary).toEqual({
      total: 2,
      veryHighRisks: 0,
      highRisks: 1,
      mediumRisks: 0,
      lowRisks: 0,
      veryLowRisks: 1,
    });
  });

  it("filters by any of a risk's use cases", async () => {
    mockGetAll.mockResolvedValue({
      data: [
        { risk_id: 1, risk_level: "High risk", project_id: 1, vendor_id: 1 },
        { risk_id: 1, risk_level: "High risk", project_id: 2, vendor_id: 1 },
        { risk_id: 2, risk_level: "Low risk", project_id: 3, vendor_id: 2 },
      ],
    });

    const { result } = renderHook(() => useVendorRisks({ projectId: "2" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loadingVendorRisks).toBe(false));
    expect(result.current.vendorRisks.map((risk) => risk.risk_id)).toEqual([1]);
    expect(result.current.vendorRisksSummary.total).toBe(1);
  });

  it("handles error", async () => {
    mockGetAll.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useVendorRisks({}), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.error).toContain("Request failed"));
  });
});
