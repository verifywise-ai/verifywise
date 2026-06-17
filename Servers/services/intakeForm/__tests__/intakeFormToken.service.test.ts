process.env.JWT_SECRET = "test-secret-1234567890";

import { describe, it, expect } from "@jest/globals";
import {
  createSignedToken,
  verifySignedToken,
  validateCaptcha,
  validateResubmissionToken,
  generateCaptchaChallenge,
  FIVE_MINUTES_MS,
  SEVEN_DAYS_MS,
} from "../intakeFormToken.service";

describe("createSignedToken / verifySignedToken", () => {
  it("round-trips a payload", () => {
    const token = createSignedToken({ foo: "bar", n: 1 });
    const decoded = verifySignedToken<{ foo: string; n: number }>(token);
    expect(decoded).toEqual({ foo: "bar", n: 1 });
  });

  it("returns null for tampered tokens", () => {
    const token = createSignedToken({ foo: "bar" });
    const tampered = token.slice(0, -2) + "XX";
    expect(verifySignedToken(tampered)).toBeNull();
  });

  it("returns null for completely garbage input", () => {
    expect(verifySignedToken("not-a-token")).toBeNull();
  });
});

describe("generateCaptchaChallenge", () => {
  it("returns a question, token, and an answer that round-trips", () => {
    const challenge = generateCaptchaChallenge();
    expect(challenge.question).toMatch(/[0-9]+ [\+\-] [0-9]+/);
    expect(typeof challenge.token).toBe("string");
    expect(typeof challenge.answer).toBe("number");

    const verified = verifySignedToken<{ answer: number; timestamp: number }>(challenge.token);
    expect(verified?.answer).toBe(challenge.answer);
  });
});

describe("validateCaptcha", () => {
  it("accepts a fresh, matching answer", () => {
    const c = generateCaptchaChallenge();
    const result = validateCaptcha(c.token, c.answer);
    expect(result).toEqual({ ok: true });
  });

  it("rejects missing token or answer", () => {
    expect(validateCaptcha(undefined, 1)).toEqual({ ok: false, error: "missing" });
    expect(validateCaptcha("x", undefined)).toEqual({ ok: false, error: "missing" });
  });

  it("rejects invalid tokens", () => {
    expect(validateCaptcha("garbage", 1)).toEqual({ ok: false, error: "invalid" });
  });

  it("rejects wrong answer", () => {
    const c = generateCaptchaChallenge();
    expect(validateCaptcha(c.token, c.answer + 99)).toEqual({ ok: false, error: "wrong_answer" });
  });

  it("rejects expired tokens", () => {
    const expiredToken = createSignedToken({
      answer: 5,
      timestamp: Date.now() - FIVE_MINUTES_MS - 1000,
    });
    expect(validateCaptcha(expiredToken, 5)).toEqual({ ok: false, error: "expired" });
  });
});

describe("validateResubmissionToken", () => {
  it("accepts a fresh, matching token", () => {
    const token = createSignedToken({
      submissionId: 1,
      formId: 2,
      email: "a@b.co",
      timestamp: Date.now(),
    });
    const result = validateResubmissionToken(token, "a@b.co");
    expect(result.kind).toBe("valid");
  });

  it("returns invalid for unparseable token", () => {
    expect(validateResubmissionToken("garbage", "a@b.co").kind).toBe("invalid");
  });

  it("returns expired for old tokens", () => {
    const token = createSignedToken({
      submissionId: 1,
      formId: 2,
      email: "a@b.co",
      timestamp: Date.now() - SEVEN_DAYS_MS - 1000,
    });
    expect(validateResubmissionToken(token, "a@b.co").kind).toBe("expired");
  });

  it("returns email_mismatch when email doesn't match", () => {
    const token = createSignedToken({
      submissionId: 1,
      formId: 2,
      email: "a@b.co",
      timestamp: Date.now(),
    });
    expect(validateResubmissionToken(token, "other@b.co").kind).toBe("email_mismatch");
  });
});
