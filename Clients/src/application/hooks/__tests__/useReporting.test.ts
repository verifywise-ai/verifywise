import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../../repository/reporting.repository", () => ({
  getTemplates: vi.fn(async () => [{ id: 1, name: "Daily Governance Pulse" }]),
  getScheduledReports: vi.fn(async () => []),
}));

import { useTemplates } from "../useReporting";

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
