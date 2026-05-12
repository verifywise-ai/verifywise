import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../jwt.utils", () => ({
  generateInviteToken: jest.fn().mockReturnValue("mock-token-123"),
  ONE_WEEK_MS: 604800000,
}));

jest.mock("../../config/constants", () => ({ frontEndUrl: "https://app.example.com" }));

jest.mock("../../services/emailService", () => ({
  sendEmail: jest.fn<() => Promise<any>>().mockResolvedValue({ messageId: "msg-123" }),
}));

jest.mock("fs/promises", () => ({
  readFile: jest.fn<() => Promise<string>>().mockResolvedValue("<mjml>template</mjml>"),
}));

import fs from "fs/promises";
import { generateInviteToken, ONE_WEEK_MS } from "../jwt.utils";
import { sendEmail } from "../../services/emailService";
import { sendInviteEmail } from "../inviteEmail.utils";

const mockGenerateInviteToken = generateInviteToken as jest.MockedFunction<
  typeof generateInviteToken
>;
const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;
const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;

describe("inviteEmail.utils", () => {
  const params = {
    email: "user@example.com",
    name: "John",
    surname: "Doe",
    roleId: 2,
    organizationId: 10,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("sendInviteEmail", () => {
    it("should return correct link with token query param", async () => {
      const result = await sendInviteEmail(params);

      expect(result.link).toBe("https://app.example.com/user-reg?token=mock-token-123");
    });

    it("should call generateInviteToken with correct payload", async () => {
      await sendInviteEmail(params);

      expect(mockGenerateInviteToken).toHaveBeenCalledWith(expect.any(Object));
      expect(mockGenerateInviteToken.mock.calls[0][0]).toMatchObject({
        name: "John",
        surname: "Doe",
        roleId: 2,
        email: "user@example.com",
        organizationId: 10,
      });
    });

    it("should call sendEmail with correct args", async () => {
      await sendInviteEmail(params);

      expect(mockSendEmail).toHaveBeenCalledWith(
        "user@example.com",
        "Create your account",
        "<mjml>template</mjml>",
        expect.any(Object),
      );
      const callArgs = mockSendEmail.mock.calls[0];
      expect(callArgs[3]).toMatchObject({
        name: "John",
        link: "https://app.example.com/user-reg?token=mock-token-123",
      });
    });

    it("should return expiresAt ~1 week from now", async () => {
      const before = Date.now();
      const result = await sendInviteEmail(params);
      const after = Date.now();

      const expectedExpires = before + ONE_WEEK_MS;
      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedExpires - 1000);
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(
        expectedExpires + (after - before) + 1000,
      );
    });

    it("should handle sendEmail failure gracefully", async () => {
      mockSendEmail.mockRejectedValue(new Error("SMTP error"));

      await expect(sendInviteEmail(params)).rejects.toThrow("SMTP error");
    });

    it("should handle fs.readFile failure gracefully", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));

      await expect(sendInviteEmail(params)).rejects.toThrow("ENOENT");
    });
  });
});
