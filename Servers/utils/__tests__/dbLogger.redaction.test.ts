import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockQuery = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue([]);
const mockAppend = jest.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);

jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: unknown[]) => mockQuery(...args) },
}));
jest.mock("../auditLedger.utils", () => ({
  appendToAuditLedger: (...args: unknown[]) => mockAppend(...args),
}));

import { logEvent } from "../logger/dbLogger";
import { UNSCANNABLE_PLACEHOLDER } from "../logger/redact";

// event_logs is served to every org member by GET /api/logger/events, and
// controllers call logEvent directly with `${error.message}`, so the sink
// itself must redact before both writes.
describe("logEvent redaction", () => {
  beforeEach(() => {
    mockQuery.mockClear();
    mockAppend.mockClear();
  });

  it("redacts secrets before the event_logs insert and the audit ledger append", async () => {
    await logEvent(
      "Error",
      "Share link failed: upstream said client_secret=abc123 and key sk-abcdefghijklmnop1234",
      5,
      7,
    );

    const [, options] = mockQuery.mock.calls[0] as [
      string,
      { replacements: Record<string, unknown> },
    ];
    const stored = options.replacements.description as string;
    expect(stored).toBe(
      "Share link failed: upstream said client_secret=[REDACTED] and key [REDACTED]",
    );
    expect(mockAppend).toHaveBeenCalledWith(expect.objectContaining({ description: stored }));
  });

  it("stores a description without secrets unchanged", async () => {
    await logEvent("Create", "Created vendor Acme", 5, 7);
    const [, options] = mockQuery.mock.calls[0] as [
      string,
      { replacements: Record<string, unknown> },
    ];
    expect(options.replacements.description).toBe("Created vendor Acme");
  });

  // logEvent swallows and logs its own failures; a caller passing a
  // non-string (untyped JS, `any`) must not make it throw.
  it("does not throw for an undefined description and stores it as before", async () => {
    await expect(logEvent("Create", undefined as unknown as string, 5, 7)).resolves.toBeUndefined();
    const [, options] = mockQuery.mock.calls[0] as [
      string,
      { replacements: Record<string, unknown> },
    ];
    expect(options.replacements.description).toBeUndefined();
  });

  it("coerces a non-string description to text before redacting", async () => {
    await expect(logEvent("Error", 42 as unknown as string, 5, 7)).resolves.toBeUndefined();
    const [, options] = mockQuery.mock.calls[0] as [
      string,
      { replacements: Record<string, unknown> },
    ];
    expect(options.replacements.description).toBe("42");
  });

  // String() throws on a null-prototype object; the coercion must sit
  // inside the fail-closed guard, not before it.
  it("stores the placeholder for a description that cannot be coerced", async () => {
    await expect(
      logEvent("Error", Object.create(null) as unknown as string, 5, 7),
    ).resolves.toBeUndefined();
    const [, options] = mockQuery.mock.calls[0] as [
      string,
      { replacements: Record<string, unknown> },
    ];
    expect(options.replacements.description).toBe(UNSCANNABLE_PLACEHOLDER);
  });
});
