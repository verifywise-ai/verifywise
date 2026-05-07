/**
 * @fileoverview Send Email Action Tests
 *
 * Tests for the sendEmail automation action: dispatch, line break conversion,
 * and error wrapping.
 *
 * @module tests/sendEmail
 */

jest.mock("../../emailService", () => ({
  sendAutomationEmail: jest.fn(),
}));

import sendEmail from "../actions/sendEmail";
import { sendAutomationEmail } from "../../emailService";

const mockSendAutomationEmail = sendAutomationEmail as jest.MockedFunction<
  typeof sendAutomationEmail
>;

describe("sendEmail action", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should call sendAutomationEmail with correct arguments", async () => {
    mockSendAutomationEmail.mockResolvedValue(undefined);

    const data = {
      to: ["user@example.com"],
      subject: "Test Subject",
      body: "Hello World",
    };

    const result = await sendEmail(data);

    expect(result).toEqual({ success: true });
    expect(mockSendAutomationEmail).toHaveBeenCalledWith(
      ["user@example.com"],
      "Test Subject",
      "Hello World",
      undefined,
    );
  });

  it("should convert newlines to <br> tags in body", async () => {
    mockSendAutomationEmail.mockResolvedValue(undefined);

    const data = {
      to: ["user@example.com"],
      subject: "Test",
      body: "Line 1\nLine 2\nLine 3",
    };

    await sendEmail(data);

    expect(mockSendAutomationEmail).toHaveBeenCalledWith(
      ["user@example.com"],
      "Test",
      "Line 1<br>Line 2<br>Line 3",
      undefined,
    );
  });

  it("should pass attachments through", async () => {
    mockSendAutomationEmail.mockResolvedValue(undefined);

    const attachments = [{ filename: "test.pdf", content: Buffer.from("data") }];
    const data = {
      to: ["user@example.com"],
      subject: "Test",
      body: "Hello",
      attachments,
    };

    await sendEmail(data);

    expect(mockSendAutomationEmail).toHaveBeenCalledWith(
      ["user@example.com"],
      "Test",
      "Hello",
      attachments,
    );
  });

  it("should return error object on failure", async () => {
    mockSendAutomationEmail.mockRejectedValue(new Error("SMTP timeout"));

    const data = {
      to: ["user@example.com"],
      subject: "Test",
      body: "Hello",
    };

    const result = await sendEmail(data);

    expect(result).toEqual({
      success: false,
      error: "SMTP timeout",
    });
  });

  it("should handle non-Error exceptions", async () => {
    mockSendAutomationEmail.mockRejectedValue("string error");

    const data = {
      to: ["user@example.com"],
      subject: "Test",
      body: "Hello",
    };

    const result = await sendEmail(data);

    expect(result).toEqual({
      success: false,
      error: "Unknown error",
    });
  });
});
