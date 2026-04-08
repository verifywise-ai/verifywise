import { apiServices } from "../../../infrastructure/api/networkServices";
import { resetPassword, sendPasswordResetEmail } from "../auth.repository";

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Test Auth Repository", () => {
  describe("sendPasswordResetEmail", () => {
    it("should make a post request to send reset password email", async () => {
      const data = {
        to: "user@example.com",
        email: "user@example.com",
        name: "User Name",
      };
      const mockResponse = {
        data: { message: "Email sent" },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const response = await sendPasswordResetEmail(data);

      expect(apiServices.post).toHaveBeenCalledWith(
        "/mail/reset-password",
        data,
      );
      expect(response).toEqual(mockResponse);
    });
  });

  describe("resetPassword", () => {
    it("should make a post request to reset password with bearer token", async () => {
      const data = {
        email: "user@example.com",
        newPassword: "NewPassword123!",
      };
      const token = "token-123";
      const mockResponse = {
        data: { message: "Password reset successful" },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const response = await resetPassword(data, token);

      expect(apiServices.post).toHaveBeenCalledWith(
        "/users/reset-password",
        data,
        {
          headers: {
            Authorization: "Bearer token-123",
          },
        },
      );
      expect(response).toEqual(mockResponse);
    });
  });
});
