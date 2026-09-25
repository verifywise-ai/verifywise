import { describe, it, expect } from "vitest";
import { isFileExpired, isFileExpiringSoon, earliestFileExpiry } from "../fileExpiry";

// Test relative to the real "today" so the assertions stay valid whichever
// day the suite runs — the helper is TZ-safe by design (see fileExpiry.ts).
const yyyyMmDd = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const daysFromToday = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return yyyyMmDd(d);
};

describe("isFileExpired", () => {
  it("is false for null/undefined/empty/invalid", () => {
    expect(isFileExpired(null)).toBe(false);
    expect(isFileExpired(undefined)).toBe(false);
    expect(isFileExpired("")).toBe(false);
    expect(isFileExpired("not-a-date")).toBe(false);
  });

  it("is false for today (expiry_date === today counts as not-yet-expired)", () => {
    expect(isFileExpired(daysFromToday(0))).toBe(false);
  });

  it("is false for future dates", () => {
    expect(isFileExpired(daysFromToday(1))).toBe(false);
    expect(isFileExpired(daysFromToday(30))).toBe(false);
  });

  it("is true for any date strictly before today", () => {
    expect(isFileExpired(daysFromToday(-1))).toBe(true);
    expect(isFileExpired(daysFromToday(-365))).toBe(true);
  });
});

describe("isFileExpiringSoon", () => {
  it("is false for null/undefined/empty/invalid", () => {
    expect(isFileExpiringSoon(null)).toBe(false);
    expect(isFileExpiringSoon(undefined)).toBe(false);
    expect(isFileExpiringSoon("")).toBe(false);
    expect(isFileExpiringSoon("not-a-date")).toBe(false);
  });

  it("is true across the 7-day pre-expiry window (0..6 days remaining)", () => {
    for (let n = 0; n <= 6; n++) {
      expect(isFileExpiringSoon(daysFromToday(n))).toBe(true);
    }
  });

  it("is false the day after the window closes (T-7)", () => {
    expect(isFileExpiringSoon(daysFromToday(7))).toBe(false);
    expect(isFileExpiringSoon(daysFromToday(30))).toBe(false);
  });

  it("is false once expired — mutually exclusive with isFileExpired", () => {
    expect(isFileExpiringSoon(daysFromToday(-1))).toBe(false);
    expect(isFileExpiringSoon(daysFromToday(-30))).toBe(false);
  });
});

describe("earliestFileExpiry", () => {
  it("returns null for null/undefined/empty input", () => {
    expect(earliestFileExpiry(null)).toBeNull();
    expect(earliestFileExpiry(undefined)).toBeNull();
    expect(earliestFileExpiry([])).toBeNull();
  });

  it("returns null when no file has an expiry_date", () => {
    expect(earliestFileExpiry([{ expiry_date: null }, { expiry_date: undefined }])).toBeNull();
  });

  it("returns the earliest date across a mixed list", () => {
    const files = [
      { expiry_date: daysFromToday(30) },
      { expiry_date: daysFromToday(-5) }, // earliest
      { expiry_date: daysFromToday(10) },
    ];
    expect(earliestFileExpiry(files)).toBe(daysFromToday(-5));
  });

  it("ignores invalid values and picks from the valid ones", () => {
    const files = [
      { expiry_date: "not-a-date" },
      { expiry_date: daysFromToday(3) },
      { expiry_date: null },
    ];
    expect(earliestFileExpiry(files)).toBe(daysFromToday(3));
  });

  it("feeds the chip contract — an expired file in the group makes the group expired", () => {
    const files = [{ expiry_date: daysFromToday(2) }, { expiry_date: daysFromToday(-1) }];
    const earliest = earliestFileExpiry(files);
    expect(isFileExpired(earliest)).toBe(true);
    expect(isFileExpiringSoon(earliest)).toBe(false);
  });
});
