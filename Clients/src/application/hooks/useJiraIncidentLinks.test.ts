import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const isEnabled = vi.fn();
vi.mock("../contexts/Extensions.context", () => ({ useExtensions: () => ({ isEnabled }) }));
const getLinks = vi.fn();
vi.mock("../repository/jiraIncidents.repository", () => ({
  getJiraIncidentLinks: (ids: number[]) => getLinks(ids),
}));
import { useJiraIncidentLinks } from "./useJiraIncidentLinks";

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    children,
  );

describe("useJiraIncidentLinks", () => {
  beforeEach(() => {
    isEnabled.mockReset();
    getLinks.mockReset();
  });

  it("does not call the API when the extension is off", () => {
    isEnabled.mockReturnValue(false);
    const { result } = renderHook(() => useJiraIncidentLinks([1, 2]), { wrapper });
    expect(result.current.size).toBe(0);
    expect(getLinks).not.toHaveBeenCalled();
  });

  it("does not call the API for no incidents", () => {
    isEnabled.mockReturnValue(true);
    renderHook(() => useJiraIncidentLinks([]), { wrapper });
    expect(getLinks).not.toHaveBeenCalled();
  });

  it("returns links by incident id, asking once for sorted unique ids", async () => {
    isEnabled.mockReturnValue(true);
    getLinks.mockResolvedValue([
      { incident_id: 2, jira_issue_key: "SEC-1", jira_url: "u", state: "ok", state_reason: null },
    ]);
    const { result } = renderHook(() => useJiraIncidentLinks([2, 1, 2]), { wrapper });
    await waitFor(() => expect(result.current.get(2)?.jira_issue_key).toBe("SEC-1"));
    expect(getLinks).toHaveBeenCalledTimes(1);
    expect(getLinks).toHaveBeenCalledWith([1, 2]);
  });

  it("stays empty when the read fails", async () => {
    isEnabled.mockReturnValue(true);
    getLinks.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useJiraIncidentLinks([1]), { wrapper });
    await waitFor(() => expect(getLinks).toHaveBeenCalled());
    expect(result.current.size).toBe(0);
  });
});
