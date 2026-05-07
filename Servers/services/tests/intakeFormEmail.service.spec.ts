/**
 * @fileoverview Intake Form Email Service Tests
 *
 * Tests for sendSubmissionReceivedEmail, sendNewSubmissionAdminNotification,
 * sendSubmissionApprovedEmail, sendSubmissionRejectedEmail: entity type display,
 * admin fallback, URL building, error isolation.
 *
 * @module tests/intakeFormEmail.service
 */

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

jest.mock("../emailService", () => ({
  sendEmail: jest.fn(),
}));

jest.mock("../../constants/emailTemplates", () => ({
  EMAIL_TEMPLATES: {
    INTAKE_SUBMISSION_RECEIVED: "submission-received",
    INTAKE_NEW_SUBMISSION_ADMIN: "new-submission-admin",
    INTAKE_SUBMISSION_APPROVED: "submission-approved",
    INTAKE_SUBMISSION_REJECTED: "submission-rejected",
  },
}));

jest.mock("../../utils/intakeForm.utils", () => ({
  getUsersByIds: jest.fn(),
}));

jest.mock("../../utils/logger/fileLogger", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  __esModule: true,
}));

import {
  sendSubmissionReceivedEmail,
  sendNewSubmissionAdminNotification,
  sendSubmissionApprovedEmail,
  sendSubmissionRejectedEmail,
} from "../intakeFormEmail.service";
import { sendEmail } from "../emailService";
import { getUsersByIds } from "../../utils/intakeForm.utils";
import { sequelize } from "../../database/db";
import { IntakeEntityType } from "../../domain.layer/enums/intake-entity-type.enum";

const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;
const mockGetUsersByIds = getUsersByIds as jest.MockedFunction<typeof getUsersByIds>;
const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;

describe("intakeFormEmail.service", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.FRONTEND_URL = "https://app.example.com";
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("sendSubmissionReceivedEmail", () => {
    it("should send email with resubmit link using publicId", async () => {
      mockSendEmail.mockResolvedValue(undefined);

      await sendSubmissionReceivedEmail(
        "user@test.com",
        "John",
        "AI Model Intake",
        42,
        "token123",
        "pub-id-1",
      );

      expect(mockSendEmail).toHaveBeenCalledWith(
        "user@test.com",
        "Submission received: AI Model Intake",
        "submission-received",
        expect.objectContaining({
          submitterName: "John",
          formName: "AI Model Intake",
          submissionId: "42",
          resubmitLink: "https://app.example.com/pub-id-1/use-case-form-intake?token=token123",
        }),
      );
    });

    it("should build resubmit link using legacy format when no publicId", async () => {
      mockSendEmail.mockResolvedValue(undefined);

      await sendSubmissionReceivedEmail(
        "user@test.com",
        "John",
        "Form",
        1,
        "token",
        undefined,
        "tenant-slug",
        "form-slug",
      );

      expect(mockSendEmail).toHaveBeenCalledWith(
        "user@test.com",
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          resubmitLink: "https://app.example.com/intake/tenant-slug/form-slug?token=token",
        }),
      );
    });

    it("should fallback to /intake-forms when no publicId or slugs", async () => {
      mockSendEmail.mockResolvedValue(undefined);

      await sendSubmissionReceivedEmail("user@test.com", "John", "Form", 1, "token");

      expect(mockSendEmail).toHaveBeenCalledWith(
        "user@test.com",
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          resubmitLink: "https://app.example.com/intake-forms",
        }),
      );
    });

    it("should not throw on sendEmail failure", async () => {
      mockSendEmail.mockRejectedValue(new Error("SMTP error"));

      await expect(
        sendSubmissionReceivedEmail("user@test.com", "John", "Form", 1, "token"),
      ).resolves.toBeUndefined();
    });
  });

  describe("sendNewSubmissionAdminNotification", () => {
    it("should send to per-form recipients when array provided", async () => {
      mockGetUsersByIds.mockResolvedValue([
        { id: 1, name: "Admin", email: "admin@test.com" },
      ] as any);
      mockSendEmail.mockResolvedValue(undefined);

      await sendNewSubmissionAdminNotification(
        [1],
        "Form",
        "Submitter",
        "sub@test.com",
        42,
        IntakeEntityType.MODEL,
      );

      expect(mockGetUsersByIds).toHaveBeenCalledWith([1]);
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
    });

    it("should fallback to org admins when number provided", async () => {
      mockQuery.mockResolvedValue([{ id: 1, name: "OrgAdmin", email: "orgadmin@test.com" }] as any);
      mockSendEmail.mockResolvedValue(undefined);

      await sendNewSubmissionAdminNotification(
        10,
        "Form",
        "Submitter",
        "sub@test.com",
        42,
        IntakeEntityType.USE_CASE,
      );

      expect(mockQuery).toHaveBeenCalled();
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
    });

    it("should not send when no recipients found", async () => {
      mockGetUsersByIds.mockResolvedValue([]);
      mockSendEmail.mockResolvedValue(undefined);

      await sendNewSubmissionAdminNotification(
        [],
        "Form",
        "Submitter",
        "sub@test.com",
        42,
        IntakeEntityType.MODEL,
      );

      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("should display Model entity type correctly", async () => {
      mockGetUsersByIds.mockResolvedValue([
        { id: 1, name: "Admin", email: "admin@test.com" },
      ] as any);
      mockSendEmail.mockResolvedValue(undefined);

      await sendNewSubmissionAdminNotification(
        [1],
        "Form",
        "Sub",
        "sub@test.com",
        42,
        IntakeEntityType.MODEL,
      );

      expect(mockSendEmail).toHaveBeenCalledWith(
        "admin@test.com",
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          entityType: "Model",
        }),
      );
    });

    it("should display Use Case entity type correctly", async () => {
      mockGetUsersByIds.mockResolvedValue([
        { id: 1, name: "Admin", email: "admin@test.com" },
      ] as any);
      mockSendEmail.mockResolvedValue(undefined);

      await sendNewSubmissionAdminNotification(
        [1],
        "Form",
        "Sub",
        "sub@test.com",
        42,
        IntakeEntityType.USE_CASE,
      );

      expect(mockSendEmail).toHaveBeenCalledWith(
        "admin@test.com",
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          entityType: "Use Case",
        }),
      );
    });

    it("should continue sending to other recipients if one fails", async () => {
      mockGetUsersByIds.mockResolvedValue([
        { id: 1, name: "Admin1", email: "admin1@test.com" },
        { id: 2, name: "Admin2", email: "admin2@test.com" },
      ] as any);
      mockSendEmail.mockRejectedValueOnce(new Error("fail")).mockResolvedValueOnce(undefined);

      await sendNewSubmissionAdminNotification(
        [1, 2],
        "Form",
        "Sub",
        "sub@test.com",
        42,
        IntakeEntityType.MODEL,
      );

      expect(mockSendEmail).toHaveBeenCalledTimes(2);
    });
  });

  describe("sendSubmissionApprovedEmail", () => {
    it("should send approval email with entity type", async () => {
      mockSendEmail.mockResolvedValue(undefined);

      await sendSubmissionApprovedEmail(
        "user@test.com",
        "John",
        "AI Model Intake",
        42,
        IntakeEntityType.MODEL,
      );

      expect(mockSendEmail).toHaveBeenCalledWith(
        "user@test.com",
        "Submission approved: AI Model Intake",
        "submission-approved",
        expect.objectContaining({
          submitterName: "John",
          entityType: "Model",
        }),
      );
    });
  });

  describe("sendSubmissionRejectedEmail", () => {
    it("should send rejection email with reason and resubmit link", async () => {
      mockSendEmail.mockResolvedValue(undefined);

      await sendSubmissionRejectedEmail(
        "user@test.com",
        "John",
        "Form",
        42,
        "Incomplete data",
        "token123",
        "pub-id-1",
      );

      expect(mockSendEmail).toHaveBeenCalledWith(
        "user@test.com",
        "Submission requires changes: Form",
        "submission-rejected",
        expect.objectContaining({
          rejectionReason: "Incomplete data",
          resubmitLink: "https://app.example.com/pub-id-1/use-case-form-intake?token=token123",
        }),
      );
    });
  });
});
