import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const mockGetReportRun = vi.fn();

vi.mock("../../repository/reporting.repository", () => ({
  getTemplates: vi.fn(async () => [{ id: 1, name: "Daily Governance Pulse" }]),
  getScheduledReports: vi.fn(async () => []),
  getReportRun: (...args: unknown[]) => mockGetReportRun(...args),
  getSectionCatalog: vi.fn(async () => [
    { key: "projectRisks", label: "Use case risks", group: "Risk analysis" },
  ]),
  createTemplate: vi.fn(async () => ({ id: 7 })),
  updateTemplate: vi.fn(async () => ({ id: 7 })),
  archiveTemplate: vi.fn(async () => ({ ok: true })),
  getRunAnalyses: vi.fn(async () => []),
}));

import {
  useTemplates,
  useReportRun,
  useSectionCatalog,
  useCreateTemplate,
  useUpdateTemplate,
  useArchiveTemplate,
  useRunAnalyses,
} from "../useReporting";
import * as repo from "../../repository/reporting.repository";

const wrap = ({ children }: any) => {
  const c = new QueryClient();
  return React.createElement(QueryClientProvider, { client: c }, children);
};

describe("useReporting", () => {
  it("useTemplates loads templates", async () => {
    const { result } = renderHook(() => useTemplates(), { wrapper: wrap });
    await waitFor(() => expect(result.current.data?.length).toBe(1));
  });
});

describe("useReportRun", () => {
  afterEach(() => vi.clearAllMocks());

  it("fetches the run when enabled and id is set", async () => {
    mockGetReportRun.mockResolvedValue({ id: 5, status: "success" });

    const { result } = renderHook(() => useReportRun(5, true), { wrapper: wrap });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetReportRun).toHaveBeenCalledWith(5);
    expect(result.current.data).toEqual({ id: 5, status: "success" });
  });

  it("does not fetch when disabled", async () => {
    const { result } = renderHook(() => useReportRun(undefined, false), { wrapper: wrap });
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockGetReportRun).not.toHaveBeenCalled();
  });
});

describe("useReporting template hooks", () => {
  it("useSectionCatalog fetches the catalog", async () => {
    const { result } = renderHook(() => useSectionCatalog(), { wrapper: wrap });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });

  it("useCreateTemplate calls the repository", async () => {
    const { result } = renderHook(() => useCreateTemplate(), { wrapper: wrap });
    result.current.mutate({ name: "Board pack", category: "governance" });
    await waitFor(() => expect(repo.createTemplate).toHaveBeenCalled());
  });

  it("useArchiveTemplate passes the id through", async () => {
    const { result } = renderHook(() => useArchiveTemplate(), { wrapper: wrap });
    result.current.mutate(7);
    await waitFor(() => expect(repo.archiveTemplate).toHaveBeenCalledWith(7));
  });

  // useUpdateTemplate has no caller until the deferred TemplatesTab edit
  // affordance lands. It ships now so the client surface matches the PATCH
  // endpoint, and it is tested now so it is not untested dead code.
  it("useUpdateTemplate splits id and body", async () => {
    const { result } = renderHook(() => useUpdateTemplate(), { wrapper: wrap });
    result.current.mutate({ id: 7, body: { name: "Renamed" } });
    await waitFor(() =>
      expect(repo.updateTemplate).toHaveBeenCalledWith(7, { name: "Renamed" }),
    );
  });

  it("useRunAnalyses stays disabled without a run id", () => {
    const { result } = renderHook(() => useRunAnalyses(undefined), { wrapper: wrap });
    expect(result.current.fetchStatus).toBe("idle");
    expect(repo.getRunAnalyses).not.toHaveBeenCalled();
  });
});
