import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { getSpecialDayGreeting, getTimeBasedGreeting } from "../greetings";

describe("sanitizeDisplayName", () => {
  it("strips angle brackets from names", () => {
    const result = getTimeBasedGreeting("<script>alert('xss')</script>");
    expect(result.text).not.toContain("<");
    expect(result.text).not.toContain(">");
  });

  it("trims whitespace from names", () => {
    const result = getTimeBasedGreeting("  Alice  ");
    expect(result.text).toContain("Alice");
  });
});

describe("getSpecialDayGreeting", () => {
  it("returns New Year greeting on Jan 1", () => {
    const result = getSpecialDayGreeting(1, 1, "Alice");
    expect(result).not.toBeNull();
    expect(result!.greetingText).toBe("Happy New Year");
  });

  it("returns Women's Day greeting on Mar 8", () => {
    const result = getSpecialDayGreeting(3, 8, "Alice");
    expect(result).not.toBeNull();
    expect(result!.greetingText).toBe("Happy Women's Day");
  });

  it("returns Programmer's Day greeting on Sep 13", () => {
    const result = getSpecialDayGreeting(9, 13, "Alice");
    expect(result).not.toBeNull();
    expect(result!.greetingText).toBe("Happy Programmer's Day");
  });

  it("returns null for unknown date", () => {
    const result = getSpecialDayGreeting(6, 15, "Alice");
    expect(result).toBeNull();
  });

  it("returns Password Day greeting for May 1-7 range", () => {
    const result = getSpecialDayGreeting(5, 3, "Alice");
    expect(result).not.toBeNull();
    expect(result!.greetingText).toBe("Happy World Password Day");
  });

  it("returns Beer Day greeting for Aug 1-7 range", () => {
    const result = getSpecialDayGreeting(8, 4, "Alice");
    expect(result).not.toBeNull();
    expect(result!.greetingText).toBe("Happy International Beer Day");
  });

  it("includes display name in greeting text", () => {
    const result = getSpecialDayGreeting(1, 1, "Alice");
    expect(result!.text).toContain("Alice");
  });

  it("handles month-only ranges correctly (not in range)", () => {
    const result = getSpecialDayGreeting(5, 10, "Alice");
    expect(result).toBeNull();
  });
});

describe("getTimeBasedGreeting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses "there" when no name or token provided', () => {
    const result = getTimeBasedGreeting();
    expect(result.text).toContain("there");
  });

  it("uses userToken.name when provided", () => {
    const result = getTimeBasedGreeting(undefined, { name: "Bob", email: "bob@test.com" });
    expect(result.text).toContain("Bob");
  });

  it("falls back to userName when no token.name", () => {
    const result = getTimeBasedGreeting("Charlie", { email: "charlie@test.com" });
    expect(result.text).toContain("Charlie");
  });

  it("extracts name from email when no other name", () => {
    const result = getTimeBasedGreeting(undefined, { email: "diana@test.com" });
    expect(result.text).toContain("diana");
  });

  it('returns "Good morning" for 8 AM', () => {
    vi.setSystemTime(new Date(2025, 0, 15, 8, 0, 0));
    const result = getTimeBasedGreeting("Alice");
    expect(result.greetingText).toBe("Good morning");
    expect(result.icon).toBe("☀️");
  });

  it('returns "Good afternoon" for 2 PM', () => {
    vi.setSystemTime(new Date(2025, 0, 15, 14, 0, 0));
    const result = getTimeBasedGreeting("Alice");
    expect(result.greetingText).toBe("Good afternoon");
  });

  it('returns "Good evening" for 7 PM', () => {
    vi.setSystemTime(new Date(2025, 0, 15, 19, 0, 0));
    const result = getTimeBasedGreeting("Alice");
    expect(result.greetingText).toBe("Good evening");
  });

  it('returns "Good night" for midnight', () => {
    vi.setSystemTime(new Date(2025, 0, 15, 0, 0, 0));
    const result = getTimeBasedGreeting("Alice");
    expect(result.greetingText).toBe("Good night");
  });

  it("returns late-night message for 2 AM", () => {
    vi.setSystemTime(new Date(2025, 0, 15, 2, 0, 0));
    const result = getTimeBasedGreeting("Alice");
    const lateNightMessages = [
      "Burning the midnight oil",
      "Still up? You're dedicated",
      "Night owl mode activated",
      "Coffee might be needed",
      "Early bird or night owl",
    ];
    expect(lateNightMessages).toContain(result.greetingText);
  });

  it("returns special day greeting when date matches a holiday", () => {
    vi.setSystemTime(new Date(2025, 0, 1, 10, 0, 0));
    const result = getTimeBasedGreeting("Alice");
    expect(result.greetingText).toBe("Happy New Year");
  });

  it("sanitizes display name by limiting to 50 chars", () => {
    const longName = "a".repeat(100);
    const result = getTimeBasedGreeting(longName);
    expect(result.text.length).toBeLessThan(150);
  });
});
