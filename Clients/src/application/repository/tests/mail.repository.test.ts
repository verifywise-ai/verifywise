import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import { sendInviteEmail } from "../mail.repository";

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

const inviteData = {
  to: "newuser@example.com",
  email: "newuser@example.com",
  name: "Jane",
  surname: "Doe",
  roleId: "3",
  organizationId: "42",
};

// ─── sendInviteEmail ──────────────────────────────────────────────────────────

describe("Test Mail Repository", () => {
  describe("sendInviteEmail", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a POST request to the correct URL with the provided data", async () => {
      const mockResponse = {
        status: 200,
        data: { message: "Invitation sent" },
        statusText: "OK",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await sendInviteEmail(inviteData);

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith("/mail/invite", inviteData);
    });

    it("should return the full response on successful API call", async () => {
      const mockResponse = {
        status: 200,
        data: { message: "Invitation sent" },
        statusText: "OK",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await sendInviteEmail(inviteData);

      expect(result).toEqual(mockResponse);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 422, data: { message: "Invalid email address" } },
      };
      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(sendInviteEmail(inviteData)).rejects.toEqual(mockError);
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.post).mockRejectedValue(
        new Error("Network timeout"),
      );

      await expect(sendInviteEmail(inviteData)).rejects.toThrow(
        "Network timeout",
      );
    });
  });
});
