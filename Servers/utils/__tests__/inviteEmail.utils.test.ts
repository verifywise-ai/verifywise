import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../jwt.utils", () => ({
  generateInviteTokenUntil: jest.fn().mockReturnValue("mock-token-123"),
}));

jest.mock("../../config/constants", () => ({ frontEndUrl: "https://app.example.com" }));

jest.mock("../../services/emailService", () => ({
  sendEmail: jest.fn<() => Promise<any>>().mockResolvedValue({ messageId: "msg-123" }),
}));

jest.mock("fs/promises", () => ({
  readFile: jest.fn<() => Promise<string>>().mockResolvedValue("<mjml>template</mjml>"),
}));

jest.mock("../user.utils", () => ({
  getUserByEmailQuery: jest.fn<() => Promise<{ id: number } | null>>(),
}));

jest.mock("../userPreference.utils", () => ({
  getUserLanguage: jest.fn<() => Promise<string>>(),
}));

import fs from "fs/promises";
import { generateInviteTokenUntil } from "../jwt.utils";
import { sendEmail } from "../../services/emailService";
import { getUserByEmailQuery } from "../user.utils";
import { getUserLanguage } from "../userPreference.utils";
import { sendInviteEmail } from "../inviteEmail.utils";

const mockGenerateInviteToken = generateInviteTokenUntil as jest.MockedFunction<
  typeof generateInviteTokenUntil
>;
const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;
const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
const mockGetUserByEmail = getUserByEmailQuery as jest.MockedFunction<typeof getUserByEmailQuery>;
const mockGetUserLanguage = getUserLanguage as jest.MockedFunction<typeof getUserLanguage>;

const englishCopy = {
  heading: "Welcome to VerifyWise",
  greeting: "Hello John,",
  intro: "An administrator has created an account for you on the VerifyWise server.",
  instruction: "Click the button below to set up your account and get started.",
  button: "Create account",
  ignore: "If you did not expect this invitation, please ignore this email.",
  thanks: "Thank you.",
  footer: "Sent with care from VerifyWise",
};

describe("inviteEmail.utils", () => {
  const params = {
    email: "user@example.com",
    name: "John",
    surname: "Doe",
    roleId: 2,
    organizationId: 10,
    expiresAt: new Date("2026-11-05T12:00:00Z"),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserByEmail.mockResolvedValue(null);
    mockGetUserLanguage.mockResolvedValue("en");
  });

  describe("sendInviteEmail", () => {
    it("should return correct link with token query param", async () => {
      const result = await sendInviteEmail(params);

      expect(result.link).toBe("https://app.example.com/user-reg?token=mock-token-123");
    });

    it("should sign the link with the invitee payload, expiring at expiresAt", async () => {
      const result = await sendInviteEmail(params);

      expect(mockGenerateInviteToken).toHaveBeenCalledTimes(1);
      const [payload, expiresAt] = mockGenerateInviteToken.mock.calls[0];
      expect(payload).toMatchObject({
        name: "John",
        surname: "Doe",
        roleId: 2,
        email: "user@example.com",
        organizationId: 10,
      });
      // The link expires at the stored invitations.expires_at.
      expect(expiresAt).toEqual(params.expiresAt);
      expect(result.link).toContain("mock-token-123");
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
        ...englishCopy,
      });
    });

    it("writes a known recipient in their saved language", async () => {
      mockGetUserByEmail.mockResolvedValue({ id: 8, role_name: "Editor" } as Awaited<
        ReturnType<typeof getUserByEmailQuery>
      >);
      mockGetUserLanguage.mockResolvedValue("de");

      await sendInviteEmail({ ...params, lang: "fr" });

      expect(mockGetUserByEmail).toHaveBeenCalledWith("user@example.com");
      expect(mockGetUserLanguage).toHaveBeenCalledWith(8);
      expect(mockSendEmail).toHaveBeenCalledWith(
        "user@example.com",
        "Erstellen Sie Ihr Konto",
        "<mjml>template</mjml>",
        expect.objectContaining({
          heading: "Willkommen bei VerifyWise",
          greeting: "Hallo John,",
          intro: "Ein Administrator hat ein Konto für Sie auf dem VerifyWise-Server erstellt.",
          instruction:
            "Klicken Sie auf die Schaltfläche unten, um Ihr Konto einzurichten und zu beginnen.",
          button: "Konto erstellen",
          ignore:
            "Wenn Sie diese Einladung nicht erwartet haben, ignorieren Sie diese E-Mail bitte.",
          thanks: "Vielen Dank.",
          footer: "Mit Sorgfalt gesendet von VerifyWise",
        }),
      );
    });

    it("uses the inviter's language when the address has no user yet", async () => {
      await sendInviteEmail({ ...params, lang: "fr" });

      expect(mockGetUserLanguage).not.toHaveBeenCalled();
      expect(mockSendEmail).toHaveBeenCalledWith(
        "user@example.com",
        "Créez votre compte",
        "<mjml>template</mjml>",
        expect.objectContaining({
          heading: "Bienvenue dans VerifyWise",
          greeting: "Bonjour John,",
          button: "Créer le compte",
          thanks: "Merci.",
          footer: "Envoyé avec soin depuis VerifyWise",
        }),
      );
    });

    it("keeps the inviter's language when the recipient lookup fails", async () => {
      mockGetUserByEmail.mockRejectedValue(new Error("db down"));

      const result = await sendInviteEmail({ ...params, lang: "de" });

      expect(result.info.error).toBeUndefined();
      expect(mockSendEmail).toHaveBeenCalledWith(
        "user@example.com",
        "Erstellen Sie Ihr Konto",
        "<mjml>template</mjml>",
        expect.objectContaining({ greeting: "Hallo John," }),
      );
    });

    it("sends English when the recipient language resolves to English", async () => {
      mockGetUserByEmail.mockResolvedValue({ id: 8, role_name: null } as Awaited<
        ReturnType<typeof getUserByEmailQuery>
      >);
      mockGetUserLanguage.mockResolvedValue("en");

      await sendInviteEmail({ ...params, lang: "de" });

      expect(mockSendEmail.mock.calls[0][1]).toBe("Create your account");
      expect(mockSendEmail.mock.calls[0][3]).toMatchObject(englishCopy);
    });

    // The invitation row is already saved when this runs, so a send that
    // throws must still hand back the link, reported like a failed send.
    it("returns the link with the error when sendEmail throws", async () => {
      mockSendEmail.mockRejectedValue(new Error("SMTP error"));

      const result = await sendInviteEmail(params);

      expect(result.link).toBe("https://app.example.com/user-reg?token=mock-token-123");
      expect(result.info.error).toEqual({ name: "Error", message: "SMTP error" });
    });

    it("returns the link with the error when the template cannot be read", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));

      const result = await sendInviteEmail(params);

      expect(result.link).toBe("https://app.example.com/user-reg?token=mock-token-123");
      expect(result.info.error?.message).toBe("ENOENT");
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    // A failed signature (e.g. JWT_SECRET unset) would email token=undefined.
    it("throws and sends nothing when the link cannot be signed", async () => {
      mockGenerateInviteToken.mockReturnValueOnce(undefined);

      await expect(sendInviteEmail(params)).rejects.toThrow("Could not sign the invitation link");
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });
});
