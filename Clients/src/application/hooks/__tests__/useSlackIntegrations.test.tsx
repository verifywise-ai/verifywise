import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import useSlackIntegrations from "../useSlackIntegrations";
import * as slackRepository from "../../repository/slack.integration.repository";

vi.mock("../../repository/slack.integration.repository", () => ({
  getSlackIntegrations: vi.fn(),
}));

const mockGetSlackIntegrations = slackRepository.getSlackIntegrations as unknown as ReturnType<typeof vi.fn>;

describe("useSlackIntegrations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initial state", () => {
    it("should return correct initial state when userId is null", async () => {
      const { result } = renderHook(() => useSlackIntegrations(null));

      expect(result.current.slackIntegrations).toEqual([]);
      expect(result.current.routingData).toEqual([]);
      expect(result.current.loading).toBe(true);
      expect(result.current.error).toBeNull();
    });
  });

  describe("fetching slack integrations", () => {
    it("should fetch slack integrations successfully", async () => {
      const mockResponse = {
        data: [
          {
            id: 1,
            scope: "incoming_webhook",
            team_name: "Test Team",
            team_id: "T123",
            channel: "#general",
            channel_id: "C123",
            created_at: "2024-01-01",
            is_active: true,
            routing_type: ["Evidence and task alerts"],
          },
        ],
      };
      mockGetSlackIntegrations.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useSlackIntegrations(1));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.slackIntegrations).toHaveLength(1);
      expect(result.current.slackIntegrations[0]).toEqual({
        id: 1,
        scope: "incoming_webhook",
        teamName: "Test Team",
        teamId: "T123",
        channel: "#general",
        channelId: "C123",
        createdAt: "2024-01-01",
        isActive: true,
        routingType: ["Evidence and task alerts"],
      });
    });

    it("should build routing data from integrations", async () => {
      const mockResponse = {
        data: [
          {
            id: 1,
            scope: "incoming_webhook",
            team_name: "Team 1",
            team_id: "T1",
            channel: "#alerts",
            channel_id: "C1",
            routing_type: ["Evidence and task alerts", "Policy reminders and status"],
          },
          {
            id: 2,
            scope: "incoming_webhook",
            team_name: "Team 2",
            team_id: "T2",
            channel: "#evidence",
            channel_id: "C2",
            routing_type: ["Evidence and task alerts"],
          },
        ],
      };
      mockGetSlackIntegrations.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useSlackIntegrations(1));

      await waitFor(() => {
        expect(result.current.routingData).toHaveLength(2);
      });

      const evidenceRouting = result.current.routingData.find(
        (r) => r.routingType === "Evidence and task alerts"
      );
      expect(evidenceRouting?.id).toEqual([1, 2]);

      const policyRouting = result.current.routingData.find(
        (r) => r.routingType === "Policy reminders and status"
      );
      expect(policyRouting?.id).toEqual([1]);
    });

    it("should handle fetch error", async () => {
      mockGetSlackIntegrations.mockRejectedValue(new Error("Failed to fetch"));

      const { result } = renderHook(() => useSlackIntegrations(1));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Failed to fetch");
      expect(result.current.slackIntegrations).toEqual([]);
    });

    it("should handle empty routing_type", async () => {
      const mockResponse = {
        data: [
          {
            id: 1,
            scope: "incoming_webhook",
            team_name: "Team",
            team_id: "T1",
            channel: "#general",
            channel_id: "C1",
          },
        ],
      };
      mockGetSlackIntegrations.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useSlackIntegrations(1));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.slackIntegrations[0].routingType).toEqual([]);
      expect(result.current.routingData).toEqual([]);
    });

    it("should not fetch when userId is null", async () => {
      const { result } = renderHook(() => useSlackIntegrations(null));

      await waitFor(() => {
        expect(result.current.loading).toBe(true);
      });

      expect(mockGetSlackIntegrations).not.toHaveBeenCalled();
    });
  });

  describe("refreshSlackIntegrations", () => {
    it("should refetch integrations", async () => {
      const mockResponse = {
        data: [
          {
            id: 1,
            scope: "incoming_webhook",
            team_name: "Team",
            team_id: "T1",
            channel: "#general",
            channel_id: "C1",
          },
        ],
      };
      mockGetSlackIntegrations.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useSlackIntegrations(1));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockGetSlackIntegrations.mockClear();
      mockGetSlackIntegrations.mockResolvedValue({
        data: [{ ...mockResponse.data[0], id: 2 }],
      });

      await result.current.refreshSlackIntegrations();

      expect(mockGetSlackIntegrations).toHaveBeenCalled();
    });
  });
});
