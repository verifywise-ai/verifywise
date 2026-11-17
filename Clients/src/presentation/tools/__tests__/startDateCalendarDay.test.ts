import { describe, it, expect } from "vitest";
import { startDateCalendarDay } from "../isoDateToString";

const localDay = (date: Date | null) =>
  date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate(),
      ).padStart(2, "0")}`
    : null;

describe("startDateCalendarDay", () => {
  it("reads a start date stored at 00:00 UTC as that UTC date in any time zone", () => {
    // What the API, intake and MCP store for "2026-11-17". West of UTC the
    // instant is still 16 November locally.
    expect(localDay(startDateCalendarDay("2026-11-17T00:00:00.000Z"))).toBe("2026-11-17");
    expect(localDay(startDateCalendarDay(new Date("2026-11-17T00:00:00.000Z")))).toBe("2026-11-17");
  });

  it("reads 12:00 UTC as that UTC date too", () => {
    expect(localDay(startDateCalendarDay("2026-11-17T12:00:00.000Z"))).toBe("2026-11-17");
  });

  it("reads a browser's local midnight as that local date, as before", () => {
    const localMidnight = new Date(2026, 10, 17);
    expect(localDay(startDateCalendarDay(localMidnight.toISOString()))).toBe("2026-11-17");
  });

  it("returns local midnight, so the date picker shows the same day", () => {
    const day = startDateCalendarDay("2026-11-17T00:00:00.000Z")!;
    expect([day.getHours(), day.getMinutes(), day.getSeconds()]).toEqual([0, 0, 0]);
  });

  it("reads a bare YYYY-MM-DD as that day, and empty or invalid values as null", () => {
    expect(localDay(startDateCalendarDay("2026-11-17"))).toBe("2026-11-17");
    expect(startDateCalendarDay(null)).toBeNull();
    expect(startDateCalendarDay("")).toBeNull();
    expect(startDateCalendarDay("not a date")).toBeNull();
  });
});
