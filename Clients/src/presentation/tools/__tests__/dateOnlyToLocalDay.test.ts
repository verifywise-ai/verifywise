import { describe, it, expect, afterEach, vi } from "vitest";
import { dateOnlyToLocalDay, displayFormattedDate, toDateOnlyString } from "../isoDateToString";
import { matchesFilterCondition } from "../../../application/utils/filterConditions";
import { UserDateFormat } from "../../../domain/enums/userDateFormat.enum";

// Node applies a changed TZ to every Date created afterwards.
const originalTz = process.env.TZ;
const ZONES = ["UTC", "America/Los_Angeles", "Pacific/Kiritimati"];

const localDay = (date: Date | null) =>
  date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate(),
      ).padStart(2, "0")}`
    : null;

describe("incident calendar days on the client", () => {
  afterEach(() => {
    vi.useRealTimers();
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it.each(ZONES)("reads a YYYY-MM-DD as local midnight of that day (%s)", (tz) => {
    process.env.TZ = tz;
    const day = dateOnlyToLocalDay("2026-09-20");
    expect(localDay(day)).toBe("2026-09-20");
    expect([day!.getHours(), day!.getMinutes()]).toEqual([0, 0]);
    // A date-time from an older server keeps its date part.
    expect(localDay(dateOnlyToLocalDay("2026-09-20T00:00:00.000Z"))).toBe("2026-09-20");
  });

  it("returns null for no date", () => {
    expect(dateOnlyToLocalDay(null)).toBeNull();
    expect(dateOnlyToLocalDay("")).toBeNull();
    expect(dateOnlyToLocalDay("not a date")).toBeNull();
  });

  it.each(ZONES)(
    "shows the stored day in the user's date format, never the day before (%s)",
    (tz) => {
      process.env.TZ = tz;
      expect(
        displayFormattedDate(toDateOnlyString("2026-09-20"), UserDateFormat.DD_MM_YYYY_DASH),
      ).toBe("20-09-2026");
    },
  );

  it.each(ZONES)('"is today" matches an incident that occurred on the user\'s today (%s)', (tz) => {
    process.env.TZ = tz;
    vi.useFakeTimers({ toFake: ["Date"] });
    // 18:30 on 23 November in Los Angeles: already 24 November in UTC and
    // Kiritimati, so each zone has its own today.
    vi.setSystemTime(new Date("2026-11-24T02:30:00.000Z"));
    const today = localDay(new Date())!;

    expect(matchesFilterCondition(dateOnlyToLocalDay(today), "is_today", "")).toBe(true);
    expect(matchesFilterCondition(dateOnlyToLocalDay(today), "is_past", "")).toBe(false);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(matchesFilterCondition(dateOnlyToLocalDay(localDay(yesterday)), "is_today", "")).toBe(
      false,
    );
    expect(matchesFilterCondition(dateOnlyToLocalDay(localDay(yesterday)), "is_past", "")).toBe(
      true,
    );
  });
});
