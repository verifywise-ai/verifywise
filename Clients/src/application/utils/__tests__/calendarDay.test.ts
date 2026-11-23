import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { calendarDayAtNoonUtc } from "../calendarDay";

describe("calendarDayAtNoonUtc", () => {
  const originalTz = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = "Europe/Istanbul";
  });
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("keeps the picked day for a user east of UTC", () => {
    // Local midnight of Nov 30 in UTC+3 is Nov 29 in UTC.
    expect(calendarDayAtNoonUtc("2026-11-29T21:00:00.000Z")).toBe("2026-11-30T12:00:00.000Z");
  });

  it("leaves an empty or invalid date empty", () => {
    expect(calendarDayAtNoonUtc("")).toBe("");
    expect(calendarDayAtNoonUtc(null)).toBe("");
    expect(calendarDayAtNoonUtc("not a date")).toBe("");
  });
});
