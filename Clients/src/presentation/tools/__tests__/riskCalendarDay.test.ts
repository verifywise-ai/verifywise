import { describe, it, expect } from "vitest";
import { riskCalendarDay } from "../isoDateToString";

const localDay = (date: Date | null) =>
  date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate(),
      ).padStart(2, "0")}`
    : null;

describe("riskCalendarDay", () => {
  it("reads a stored noon UTC as that UTC date in any time zone", () => {
    expect(localDay(riskCalendarDay("2026-05-01T12:00:00.000Z"))).toBe("2026-05-01");
    expect(localDay(riskCalendarDay(new Date("2026-05-01T12:00:00.000Z")))).toBe("2026-05-01");
  });

  it("returns local midnight, so the date picker shows the same day", () => {
    const day = riskCalendarDay("2026-05-01T12:00:00.000Z")!;
    expect([day.getHours(), day.getMinutes(), day.getSeconds()]).toEqual([0, 0, 0]);
  });

  it("reads any other value as the local date of the instant, as before", () => {
    const instant = new Date(2026, 4, 1, 15, 30, 12);
    expect(localDay(riskCalendarDay(instant.toISOString()))).toBe("2026-05-01");
  });

  it("returns null for empty and invalid values", () => {
    expect(riskCalendarDay(null)).toBeNull();
    expect(riskCalendarDay("")).toBeNull();
    expect(riskCalendarDay("not a date")).toBeNull();
    expect(riskCalendarDay(42)).toBeNull();
  });

  it("reads a bare YYYY-MM-DD as that day in any time zone", () => {
    expect(localDay(riskCalendarDay("2026-05-01"))).toBe("2026-05-01");
  });
});
