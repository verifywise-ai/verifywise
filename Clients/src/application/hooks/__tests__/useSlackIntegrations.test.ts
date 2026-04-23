import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("../../repository/slack.integration.repository", () => ({
  getSlackIntegrations: vi.fn(),
}));

import useSlackIntegrations from "../useSlackIntegrations";
import { getSlackIntegrations } from "../../repository/slack.integration.repository";

const mockGetIntegrations = vi.mocked(getSlackIntegrations);

describe("useSlackIntegrations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches and transforms slack integrations", async () => {
    mockGetIntegrations.mockResolvedValue({
      data: [{
        id: 1,
        scope: "incoming-webhook",
        team_name: "My Team",
        team_id: "T123",
        channel: "#general",
        channel_id: "C123",
        access_token: "tok",
        configuration_url: "https://slack.com",
        url: "https://hooks.slack.com",
        is_active: true,
        routing_type: ["Membership and roles"],
      }],
    });

    const { result } = renderHook(() => useSlackIntegrations(1));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.slackIntegrations).toHaveLength(1);
    expect(result.current.slackIntegrations[0].teamName).toBe("My Team");
    expect(result.current.routingData).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it("does not fetch when userId is null", async () => {
    const { result: _result } = renderHook(() => useSlackIntegrations(null));

    // Should stay in loading state since fetch never happens
    expect(mockGetIntegrations).not.toHaveBeenCalled();
  });

  it("handles error", async () => {
    mockGetIntegrations.mockRejectedValue(new Error("Unauthorized"));

    const { result } = renderHook(() => useSlackIntegrations(1));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Unauthorized");
  });
});
