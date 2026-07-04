import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  useVendors,
  useVendor,
  useCreateVendor,
  useUpdateVendor,
  useDeleteVendor,
} from "../useVendors";

vi.mock("../../repository/vendor.repository", () => ({
  getAllVendors: vi.fn(),
  getVendorById: vi.fn(),
  getVendorsByProjectId: vi.fn(),
  createNewVendor: vi.fn(),
  update: vi.fn(),
  deleteVendor: vi.fn(),
}));

import {
  getAllVendors,
  getVendorById,
  getVendorsByProjectId,
  createNewVendor,
  update as updateVendor,
  deleteVendor,
} from "../../repository/vendor.repository";

const mockGetAllVendors = vi.mocked(getAllVendors);
const mockGetVendorById = vi.mocked(getVendorById);
const mockGetVendorsByProjectId = vi.mocked(getVendorsByProjectId);
const mockCreateNewVendor = vi.mocked(createNewVendor);
const mockUpdateVendor = vi.mocked(updateVendor);
const mockDeleteVendor = vi.mocked(deleteVendor);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useVendors", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches all vendors when no projectId filter", async () => {
    mockGetAllVendors.mockResolvedValue({ data: [{ id: 1, name: "Vendor A" }] });
    const { result } = renderHook(() => useVendors(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 1, name: "Vendor A" }]);
    expect(mockGetAllVendors).toHaveBeenCalled();
  });

  it("fetches vendors by projectId when filter provided", async () => {
    mockGetVendorsByProjectId.mockResolvedValue({ data: [{ id: 2, name: "Vendor B" }] });
    const { result } = renderHook(() => useVendors({ projectId: "5" }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 2, name: "Vendor B" }]);
    expect(mockGetVendorsByProjectId).toHaveBeenCalledWith({ projectId: 5 });
  });

  it("returns empty array when no data", async () => {
    mockGetAllVendors.mockResolvedValue({ data: undefined });
    const { result } = renderHook(() => useVendors(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

describe("useVendor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches single vendor by id", async () => {
    mockGetVendorById.mockResolvedValue({ data: { id: 1, name: "Vendor A" } });
    const { result } = renderHook(() => useVendor(1), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: 1, name: "Vendor A" });
  });

  it("is disabled when id is falsy", () => {
    const { result } = renderHook(() => useVendor(0 as any), { wrapper: createWrapper() });
    expect(result.current.isFetching).toBe(false);
  });
});

describe("useCreateVendor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a new vendor", async () => {
    mockCreateNewVendor.mockResolvedValue({ data: { id: 10 } });
    const { result } = renderHook(() => useCreateVendor(), { wrapper: createWrapper() });
    await result.current.mutateAsync({ name: "New Vendor" } as any);
    expect(mockCreateNewVendor).toHaveBeenCalledWith({ body: { name: "New Vendor" } });
  });
});

describe("useUpdateVendor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates a vendor", async () => {
    mockUpdateVendor.mockResolvedValue({ data: { id: 1 } });
    const { result } = renderHook(() => useUpdateVendor(), { wrapper: createWrapper() });
    await result.current.mutateAsync({ id: 1, data: { name: "Updated" } } as any);
    expect(mockUpdateVendor).toHaveBeenCalledWith({ id: 1, body: { name: "Updated" } });
  });
});

describe("useDeleteVendor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes a vendor", async () => {
    mockDeleteVendor.mockResolvedValue({});
    const { result } = renderHook(() => useDeleteVendor(), { wrapper: createWrapper() });
    await result.current.mutateAsync(5);
    expect(mockDeleteVendor).toHaveBeenCalledWith({ id: 5 });
  });
});
