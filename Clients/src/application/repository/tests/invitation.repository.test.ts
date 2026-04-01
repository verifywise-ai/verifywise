import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  getInvitations,
  resendInvitation,
  revokeInvitation,
  type Invitation,
} from "../invitation.repository";

vi.mock("../../../infrastructure/api/networkServices", () => {
  return {
    apiServices: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
  };
});

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const mockInvitation: Invitation = {
  id: 1,
  email: "user@example.com",
  name: "John",
  surname: "Doe",
  role_id: 3,
  status: "pending",
  invited_by: 42,
  created_at: "2026-03-01T00:00:00Z",
  expires_at: "2026-03-08T00:00:00Z",
  updated_at: "2026-03-01T00:00:00Z",
  role_name: "Editor",
};

// ─── getInvitations ───────────────────────────────────────────────────────────

describe("Test Invitation Repository", () => {
  describe("getInvitations", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a GET request to the correct URL", async () => {
      const mockResponse = {
        data: { invitations: [mockInvitation] },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getInvitations();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/invitations");
    });

    it("should return the invitations data on successful API call", async () => {
      const mockResponse = {
        data: { invitations: [mockInvitation] },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getInvitations();

      expect(result).toEqual(mockResponse.data);
    });

    it("should return an empty invitations array when there are no invitations", async () => {
      const mockResponse = {
        data: { invitations: [] },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getInvitations();

      expect(result.invitations).toEqual([]);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 403, data: { message: "Forbidden" } },
      };
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getInvitations()).rejects.toEqual(mockError);
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.get).mockRejectedValue(
        new Error("Network timeout"),
      );

      await expect(getInvitations()).rejects.toThrow("Network timeout");
    });
  });

  // ─── revokeInvitation ─────────────────────────────────────────────────────

  describe("revokeInvitation", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a DELETE request to the correct URL with the invitation ID", async () => {
      const mockResponse = { data: {}, status: 200, statusText: "OK" };
      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      await revokeInvitation(1);

      expect(apiServices.delete).toHaveBeenCalledTimes(1);
      expect(apiServices.delete).toHaveBeenCalledWith("/invitations/1");
    });

    it("should return the raw response on successful API call", async () => {
      const mockResponse = { data: {}, status: 200, statusText: "OK" };
      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      const result = await revokeInvitation(1);

      expect(result).toEqual(mockResponse);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 404, data: { message: "Invitation not found" } },
      };
      vi.mocked(apiServices.delete).mockRejectedValue(mockError);

      await expect(revokeInvitation(99)).rejects.toEqual(mockError);
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.delete).mockRejectedValue(
        new Error("Connection refused"),
      );

      await expect(revokeInvitation(1)).rejects.toThrow("Connection refused");
    });
  });

  // ─── resendInvitation ─────────────────────────────────────────────────────

  describe("resendInvitation", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a POST request to the correct URL with the invitation ID", async () => {
      const mockResponse = { data: {}, status: 200, statusText: "OK" };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await resendInvitation(1);

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith("/invitations/1/resend");
    });

    it("should return the raw response on successful API call", async () => {
      const mockResponse = { data: {}, status: 200, statusText: "OK" };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await resendInvitation(1);

      expect(result).toEqual(mockResponse);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 404, data: { message: "Invitation not found" } },
      };
      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(resendInvitation(99)).rejects.toEqual(mockError);
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.post).mockRejectedValue(
        new Error("Network timeout"),
      );

      await expect(resendInvitation(1)).rejects.toThrow("Network timeout");
    });
  });
});
