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

jest.mock("../notificationService", () => ({
  notificationService: { sendEmailWithTemplate: jest.fn() },
}));

jest.mock("../../constants/emailTemplates", () => ({
  EMAIL_TEMPLATES: {
    INTAKE_SUBMISSION_RECEIVED: "submission-received",
    INTAKE_NEW_SUBMISSION_ADMIN: "new-submission-admin",
    INTAKE_SECOND_REVIEW: "second-review",
    INTAKE_SUBMISSION_APPROVED: "submission-approved",
    INTAKE_SUBMISSION_REJECTED: "submission-rejected",
  },
}));

jest.mock("../../utils/intakeForm.utils", () => ({
  getUsersByIds: jest.fn(),
  getEligibleReviewerIdsQuery: jest.fn(),
  getSubmissionByIdQuery: jest.fn(),
  getIntakeFormByIdQuery: jest.fn(),
}));

jest.mock("../../utils/logger/fileLogger", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  __esModule: true,
}));

import {
  sendSubmissionReceivedEmail,
  sendNewSubmissionAdminNotification,
  renderIntakeResultsHtml,
  sendSecondReviewRequestEmail,
  sendSubmissionApprovedEmail,
  sendSubmissionRejectedEmail,
} from "../intakeFormEmail.service";
import { notificationService } from "../notificationService";
import {
  getEligibleReviewerIdsQuery,
  getIntakeFormByIdQuery,
  getSubmissionByIdQuery,
  getUsersByIds,
} from "../../utils/intakeForm.utils";
import { sequelize } from "../../database/db";
import { IntakeEntityType } from "../../domain.layer/enums/intake-entity-type.enum";

// Intake emails pass a template file name, so they go through the service
// that reads the file; emailService.sendEmail expects MJML source.
const mockSendEmailWithTemplate = notificationService.sendEmailWithTemplate as jest.MockedFunction<
  typeof notificationService.sendEmailWithTemplate
>;
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
      mockSendEmailWithTemplate.mockResolvedValue(undefined);

      await sendSubmissionReceivedEmail(
        "user@test.com",
        "John",
        "AI Model Intake",
        42,
        "token123",
        "pub-id-1",
      );

      expect(mockSendEmailWithTemplate).toHaveBeenCalledWith(
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
      mockSendEmailWithTemplate.mockResolvedValue(undefined);

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

      expect(mockSendEmailWithTemplate).toHaveBeenCalledWith(
        "user@test.com",
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          resubmitLink: "https://app.example.com/intake/tenant-slug/form-slug?token=token",
        }),
      );
    });

    it("should fallback to /intake-forms when no publicId or slugs", async () => {
      mockSendEmailWithTemplate.mockResolvedValue(undefined);

      await sendSubmissionReceivedEmail("user@test.com", "John", "Form", 1, "token");

      expect(mockSendEmailWithTemplate).toHaveBeenCalledWith(
        "user@test.com",
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          resubmitLink: "https://app.example.com/intake-forms",
        }),
      );
    });

    it("does not throw on send failure and reports it, so the caller can retry", async () => {
      mockSendEmailWithTemplate.mockRejectedValue(new Error("SMTP error"));

      await expect(
        sendSubmissionReceivedEmail("user@test.com", "John", "Form", 1, "token"),
      ).resolves.toBe(false);
    });

    it("reports a successful send", async () => {
      mockSendEmailWithTemplate.mockResolvedValue(undefined);

      await expect(
        sendSubmissionReceivedEmail("user@test.com", "John", "Form", 1, "token"),
      ).resolves.toBe(true);
    });

    it("passes the review sentence as an escaped reviewHtml block", async () => {
      mockSendEmailWithTemplate.mockResolvedValue(undefined);

      await sendSubmissionReceivedEmail(
        "user@test.com",
        "John",
        "Form",
        1,
        "token",
        "pub-id-1",
        undefined,
        undefined,
        "en",
        "<b>Ann</b> will review your submission within 3 business days, by Friday.",
      );

      const data = mockSendEmailWithTemplate.mock.calls[0][3];
      expect(data.reviewHtml).toBe(
        '<div class="box box-primary"><p class="box-subtitle">&lt;b&gt;Ann&lt;/b&gt; will review your submission within 3 business days, by Friday.</p></div>',
      );
      expect(data.resubmitLink).toBe(
        "https://app.example.com/pub-id-1/use-case-form-intake?token=token",
      );
    });

    it("sends an empty reviewHtml without a sentence", async () => {
      mockSendEmailWithTemplate.mockResolvedValue(undefined);

      await sendSubmissionReceivedEmail("user@test.com", "John", "Form", 1, "token");

      expect(mockSendEmailWithTemplate.mock.calls[0][3].reviewHtml).toBe("");
    });
  });

  describe("intake-submission-received template", () => {
    it("uses every variable the sender passes and renders the review block", async () => {
      // Real template and compiler, so a renamed variable fails here.
      const fs = jest.requireActual("fs") as typeof import("fs");
      const path = jest.requireActual("path") as typeof import("path");
      const { compileMjmlToHtml } = jest.requireActual("../../tools/mjmlCompiler") as {
        compileMjmlToHtml: (t: string, d: Record<string, string>) => Promise<string>;
      };
      const template = fs.readFileSync(
        path.join(__dirname, "../../templates/intake-submission-received.mjml"),
        "utf8",
      );
      mockSendEmailWithTemplate.mockResolvedValue(undefined);
      await sendSubmissionReceivedEmail(
        "user@test.com",
        "John",
        "AI Model Intake",
        42,
        "token123",
        "pub-id-1",
        undefined,
        undefined,
        "en",
        "Ann Lee will review your submission within 3 business days, by Thursday, November 5, 2026.",
      );
      const data = mockSendEmailWithTemplate.mock.calls[0][3];
      for (const key of Object.keys(data)) {
        expect(template).toContain(`{{${key}}}`);
      }

      const html = await compileMjmlToHtml(template, data);
      expect(html).toContain(
        "Ann Lee will review your submission within 3 business days, by Thursday, November 5, 2026.",
      );
      expect(html).toContain("pub-id-1/use-case-form-intake?token=token123");
      expect(html).not.toMatch(/{{\w+}}/);
    });
  });

  describe("sendNewSubmissionAdminNotification", () => {
    it("should send to per-form recipients when array provided", async () => {
      mockGetUsersByIds.mockResolvedValue([
        { id: 1, name: "Admin", email: "admin@test.com" },
      ] as any);
      mockSendEmailWithTemplate.mockResolvedValue(undefined);

      await sendNewSubmissionAdminNotification(
        [1],
        "Form",
        "Submitter",
        "sub@test.com",
        42,
        IntakeEntityType.MODEL,
      );

      expect(mockGetUsersByIds).toHaveBeenCalledWith([1]);
      expect(mockSendEmailWithTemplate).toHaveBeenCalledTimes(1);
    });

    it("should fallback to org admins when number provided", async () => {
      mockQuery.mockResolvedValue([{ id: 1, name: "OrgAdmin", email: "orgadmin@test.com" }] as any);
      mockSendEmailWithTemplate.mockResolvedValue(undefined);

      await sendNewSubmissionAdminNotification(
        10,
        "Form",
        "Submitter",
        "sub@test.com",
        42,
        IntakeEntityType.USE_CASE,
      );

      expect(mockQuery).toHaveBeenCalled();
      expect(mockSendEmailWithTemplate).toHaveBeenCalledTimes(1);
    });

    it("should not send when no recipients found", async () => {
      mockGetUsersByIds.mockResolvedValue([]);
      mockSendEmailWithTemplate.mockResolvedValue(undefined);

      await sendNewSubmissionAdminNotification(
        [],
        "Form",
        "Submitter",
        "sub@test.com",
        42,
        IntakeEntityType.MODEL,
      );

      expect(mockSendEmailWithTemplate).not.toHaveBeenCalled();
    });

    it("should display Model entity type correctly", async () => {
      mockGetUsersByIds.mockResolvedValue([
        { id: 1, name: "Admin", email: "admin@test.com" },
      ] as any);
      mockSendEmailWithTemplate.mockResolvedValue(undefined);

      await sendNewSubmissionAdminNotification(
        [1],
        "Form",
        "Sub",
        "sub@test.com",
        42,
        IntakeEntityType.MODEL,
      );

      expect(mockSendEmailWithTemplate).toHaveBeenCalledWith(
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
      mockSendEmailWithTemplate.mockResolvedValue(undefined);

      await sendNewSubmissionAdminNotification(
        [1],
        "Form",
        "Sub",
        "sub@test.com",
        42,
        IntakeEntityType.USE_CASE,
      );

      expect(mockSendEmailWithTemplate).toHaveBeenCalledWith(
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
      mockSendEmailWithTemplate
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce(undefined);

      await sendNewSubmissionAdminNotification(
        [1, 2],
        "Form",
        "Sub",
        "sub@test.com",
        42,
        IntakeEntityType.MODEL,
      );

      expect(mockSendEmailWithTemplate).toHaveBeenCalledTimes(2);
    });

    it("sends an empty results block when no results are given", async () => {
      mockGetUsersByIds.mockResolvedValue([{ id: 1, name: "Admin", email: "a@test.com" }] as any);
      mockSendEmailWithTemplate.mockResolvedValue(undefined);

      await sendNewSubmissionAdminNotification(
        [1],
        "Form",
        "S",
        "s@test.com",
        42,
        IntakeEntityType.USE_CASE,
      );

      expect(
        (mockSendEmailWithTemplate.mock.calls[0][3] as Record<string, string>).resultsHtml,
      ).toBe("");
    });

    it("includes the results block when results are given", async () => {
      mockGetUsersByIds.mockResolvedValue([{ id: 1, name: "Admin", email: "a@test.com" }] as any);
      mockSendEmailWithTemplate.mockResolvedValue(undefined);

      await sendNewSubmissionAdminNotification(
        [1],
        "Form",
        "S",
        "s@test.com",
        42,
        IntakeEntityType.USE_CASE,
        "en",
        { level: "High risk", scoreText: "70 (High)", suggestionCount: 3, capReached: false },
      );

      const html = (mockSendEmailWithTemplate.mock.calls[0][3] as Record<string, string>)
        .resultsHtml;
      expect(html).toContain("70 (High)");
      expect(html).toContain("High risk");
      expect(html).toContain("</strong> 3</p>");
    });
  });

  describe("renderIntakeResultsHtml", () => {
    it("is empty without results", () => {
      expect(renderIntakeResultsHtml(undefined)).toBe("");
    });

    it("shows level, score and suggestion count, escaped", () => {
      const html = renderIntakeResultsHtml({
        level: null,
        scoreText: "<b>64</b> (High)",
        suggestionCount: 0,
        capReached: false,
      });
      expect(html).toContain("Initial assessment");
      expect(html).toContain("Not rule-checked");
      expect(html).toContain("&lt;b&gt;64&lt;/b&gt; (High)");
      expect(html).not.toContain("<b>64</b>");
      expect(html).toContain("Suggested risks:");
    });

    it("shows only a still-running note when the wait ran out", () => {
      const html = renderIntakeResultsHtml({
        level: "High risk",
        scoreText: "70 (High)",
        suggestionCount: 2,
        capReached: true,
      });
      expect(html).toContain("Scoring was still running");
      expect(html).not.toContain("70 (High)");
    });

    it("never words the score as a probability, confidence or certainty", () => {
      for (const capReached of [true, false]) {
        const html = renderIntakeResultsHtml({
          level: "High risk",
          scoreText: "70 (High)",
          suggestionCount: 1,
          capReached,
        }).toLowerCase();
        expect(html).not.toMatch(/probability|confidence|certainty/);
      }
    });
  });

  describe("sendSecondReviewRequestEmail", () => {
    it("emails each senior reviewer with the form and approver", async () => {
      (getSubmissionByIdQuery as jest.Mock).mockResolvedValue({
        formId: 3,
        reviewedBy: 2,
        entityType: IntakeEntityType.MODEL,
      });
      (getIntakeFormByIdQuery as jest.Mock).mockResolvedValue({ name: "AI intake" });
      mockGetUsersByIds
        .mockResolvedValueOnce([{ id: 2, name: "Sam", email: "sam@test.com" }])
        .mockResolvedValueOnce([
          { id: 1, name: "Ann", email: "ann@test.com" },
          { id: 9, name: "", email: "bo@test.com" },
        ]);
      mockSendEmailWithTemplate.mockResolvedValue(undefined);
      (getEligibleReviewerIdsQuery as jest.Mock).mockResolvedValue([1, 9]);

      await sendSecondReviewRequestEmail(7, 11, [1, 9], "en");

      expect(getSubmissionByIdQuery).toHaveBeenCalledWith(11, 7);
      expect(mockSendEmailWithTemplate).toHaveBeenCalledTimes(2);
      expect(mockSendEmailWithTemplate).toHaveBeenCalledWith(
        "ann@test.com",
        "Second review requested: AI intake",
        "second-review",
        expect.objectContaining({
          reviewerName: "Ann",
          formName: "AI intake",
          submissionId: "11",
          entityType: "Model",
          approverName: "Sam",
          reviewLink: "https://app.example.com/intake-forms/submissions?submission=11",
        }),
      );
      expect(mockSendEmailWithTemplate.mock.calls[1][3]).toMatchObject({ reviewerName: "bo" });
    });

    it("only looks up and emails eligible senior reviewers", async () => {
      (getSubmissionByIdQuery as jest.Mock).mockResolvedValue({
        formId: 3,
        reviewedBy: null,
        entityType: IntakeEntityType.MODEL,
      });
      (getIntakeFormByIdQuery as jest.Mock).mockResolvedValue({ name: "AI intake" });
      (getEligibleReviewerIdsQuery as jest.Mock).mockResolvedValue([1]);
      mockGetUsersByIds.mockResolvedValue([{ id: 1, name: "Ann", email: "ann@test.com" }]);
      mockSendEmailWithTemplate.mockResolvedValue(undefined);

      await sendSecondReviewRequestEmail(7, 11, [1, 5], "en");

      expect(getEligibleReviewerIdsQuery).toHaveBeenCalledWith(7, [1, 5]);
      expect(mockGetUsersByIds).toHaveBeenLastCalledWith([1]);
      expect(mockSendEmailWithTemplate).toHaveBeenCalledTimes(1);
    });

    it("sends nothing when no senior reviewer is eligible", async () => {
      (getSubmissionByIdQuery as jest.Mock).mockResolvedValue({
        formId: 3,
        reviewedBy: null,
        entityType: IntakeEntityType.MODEL,
      });
      (getIntakeFormByIdQuery as jest.Mock).mockResolvedValue({ name: "AI intake" });
      (getEligibleReviewerIdsQuery as jest.Mock).mockResolvedValue([]);
      mockGetUsersByIds.mockResolvedValue([]);

      await sendSecondReviewRequestEmail(7, 11, [5], "en");

      expect(mockSendEmailWithTemplate).not.toHaveBeenCalled();
    });

    it("never throws when the lookup fails", async () => {
      (getSubmissionByIdQuery as jest.Mock).mockRejectedValue(new Error("db down"));
      await expect(sendSecondReviewRequestEmail(7, 11, [1], "en")).resolves.toBeUndefined();
      expect(mockSendEmailWithTemplate).not.toHaveBeenCalled();
    });
  });

  describe("sendSubmissionApprovedEmail", () => {
    it("should send approval email with entity type", async () => {
      mockSendEmailWithTemplate.mockResolvedValue(undefined);

      await sendSubmissionApprovedEmail(
        "user@test.com",
        "John",
        "AI Model Intake",
        42,
        IntakeEntityType.MODEL,
      );

      expect(mockSendEmailWithTemplate).toHaveBeenCalledWith(
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
      mockSendEmailWithTemplate.mockResolvedValue(undefined);

      await sendSubmissionRejectedEmail(
        "user@test.com",
        "John",
        "Form",
        42,
        "Incomplete data",
        "token123",
        "pub-id-1",
      );

      expect(mockSendEmailWithTemplate).toHaveBeenCalledWith(
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
