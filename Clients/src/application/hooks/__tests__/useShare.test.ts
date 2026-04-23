import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/share.repository", () => ({
  createShareLink: vi.fn(),
  getShareLinksForResource: vi.fn(),
  getShareLinkByToken: vi.fn(),
  updateShareLink: vi.fn(),
  deleteShareLink: vi.fn(),
}));

import { useShareLinks, useShareLinkByToken, useCreateShareLink, useDeleteShareLink } from "../useShare";
import { getShareLinksForResource, getShareLinkByToken, createShareLink, deleteShareLink } from "../../repository/share.repository";

const mockGetLinks = vi.mocked(getShareLinksForResource);
const mockGetByToken = vi.mocked(getShareLinkByToken);
const mockCreate = vi.mocked(createShareLink);
const mockDelete = vi.mocked(deleteShareLink);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useShareLinks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches share links for a resource", async () => {
    mockGetLinks.mockResolvedValue({ data: [{ id: 1, token: "abc" }] });

    const { result } = renderHook(() => useShareLinks("project", 5), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 1, token: "abc" }]);
  });

  it("does not fetch when resourceId is falsy", () => {
    const { result } = renderHook(() => useShareLinks("", 0), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("useShareLinkByToken", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches a share link by token", async () => {
    mockGetByToken.mockResolvedValue({ data: { id: 1, resource_type: "project" } });

    const { result } = renderHook(() => useShareLinkByToken("abc123"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: 1, resource_type: "project" });
  });
});

describe("useCreateShareLink", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a share link", async () => {
    mockCreate.mockResolvedValue({ data: { id: 2, token: "new" } });

    const { result } = renderHook(() => useCreateShareLink(), { wrapper: createWrapper() });
    result.current.mutate({ resource_type: "project", resource_id: 1 } as any);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockCreate).toHaveBeenCalled();
  });
});

describe("useDeleteShareLink", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes a share link", async () => {
    mockDelete.mockResolvedValue({ data: { success: true } });

    const { result } = renderHook(() => useDeleteShareLink(), { wrapper: createWrapper() });
    result.current.mutate(1);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDelete).toHaveBeenCalledWith(1);
  });
});
