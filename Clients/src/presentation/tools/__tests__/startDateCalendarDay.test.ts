import { describe, it, expect, afterEach } from "vitest";
import { riskCalendarDay, startDateCalendarDay } from "../isoDateToString";

const localDay = (date: Date | null) =>
  date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate(),
      ).padStart(2, "0")}`
    : null;

// Node applies a changed TZ to every Date created afterwards.
const originalTz = process.env.TZ;
const inTimeZone = (tz: string) => {
  process.env.TZ = tz;
};

describe("startDateCalendarDay", () => {
  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("reads a start date stored at 00:00 UTC as that UTC date in any time zone", () => {
    // What the API, intake and MCP store for "2026-11-17". West of UTC the
    // instant is still 16 November locally.
    expect(localDay(startDateCalendarDay("2026-11-17T00:00:00.000Z"))).toBe("2026-11-17");
    expect(localDay(startDateCalendarDay(new Date("2026-11-17T00:00:00.000Z")))).toBe("2026-11-17");
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

  describe("in UTC+12", () => {
    it("reads the console's local midnight (12:00 UTC the day before) as the local day", () => {
      inTimeZone("Etc/GMT-12"); // POSIX sign is inverted: this is UTC+12
      const localMidnight = new Date(2026, 10, 17);
      expect(localMidnight.toISOString()).toBe("2026-11-16T12:00:00.000Z");
      expect(localDay(startDateCalendarDay(localMidnight.toISOString()))).toBe("2026-11-17");
    });

    it("still reads a stored 00:00 UTC as that UTC date", () => {
      inTimeZone("Etc/GMT-12");
      expect(localDay(startDateCalendarDay("2026-11-17T00:00:00.000Z"))).toBe("2026-11-17");
    });

    it("leaves risk dates on their 12:00 UTC rule", () => {
      inTimeZone("Etc/GMT-12");
      expect(localDay(riskCalendarDay("2026-11-16T12:00:00.000Z"))).toBe("2026-11-16");
    });
  });

  describe("west of UTC (UTC-8)", () => {
    it("reads a stored 00:00 UTC as that UTC date, not the local day before", () => {
      inTimeZone("Etc/GMT+8"); // POSIX sign is inverted: this is UTC-8
      expect(new Date("2026-11-17T00:00:00.000Z").getDate()).toBe(16);
      expect(localDay(startDateCalendarDay("2026-11-17T00:00:00.000Z"))).toBe("2026-11-17");
    });

    it("reads the console's local midnight (08:00 UTC) as the local day", () => {
      inTimeZone("Etc/GMT+8");
      const localMidnight = new Date(2026, 10, 17);
      expect(localMidnight.toISOString()).toBe("2026-11-17T08:00:00.000Z");
      expect(localDay(startDateCalendarDay(localMidnight.toISOString()))).toBe("2026-11-17");
    });

    it("reads 12:00 UTC as the local date of the instant", () => {
      inTimeZone("Etc/GMT+8");
      expect(localDay(startDateCalendarDay("2026-11-17T12:00:00.000Z"))).toBe("2026-11-17");
    });
  });
});
