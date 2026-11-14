import { toRiskCalendarDate } from "../riskCalendarDate.utils";

const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : value);

describe("toRiskCalendarDate", () => {
  it("stores a date-only string at 12:00 UTC on the same day", () => {
    expect(iso(toRiskCalendarDate("2001-01-01"))).toBe("2001-01-01T12:00:00.000Z");
    expect(iso(toRiskCalendarDate(" 2026-02-28 "))).toBe("2026-02-28T12:00:00.000Z");
  });

  it("snaps a browser's local midnight to noon UTC on the picked day", () => {
    // 1 May picked in UTC, Toronto, Istanbul, India and Hawaii.
    for (const sent of [
      "2026-05-01T00:00:00.000Z",
      "2026-05-01T04:00:00.000Z",
      "2026-04-30T21:00:00.000Z",
      "2026-04-30T18:30:00.000Z",
      "2026-05-01T10:00:00.000Z",
    ]) {
      expect(iso(toRiskCalendarDate(sent))).toBe("2026-05-01T12:00:00.000Z");
    }
    expect(iso(toRiskCalendarDate(new Date("2026-05-01")))).toBe("2026-05-01T12:00:00.000Z");
  });

  it("is idempotent on a stored noon value", () => {
    expect(iso(toRiskCalendarDate("2026-05-01T12:00:00.000Z"))).toBe("2026-05-01T12:00:00.000Z");
  });

  it("keeps a timestamp that is not a local midnight", () => {
    expect(toRiskCalendarDate("2026-05-01T14:23:41.512Z")).toBe("2026-05-01T14:23:41.512Z");
    const now = new Date("2026-05-01T14:23:41.512Z");
    expect(toRiskCalendarDate(now)).toBe(now);
  });

  it("passes empty, invalid and impossible values through for validation to handle", () => {
    expect(toRiskCalendarDate(undefined)).toBeUndefined();
    expect(toRiskCalendarDate(null)).toBeNull();
    expect(toRiskCalendarDate("")).toBe("");
    expect(toRiskCalendarDate("not a date")).toBe("not a date");
    expect(toRiskCalendarDate("2026-02-30")).toBe("2026-02-30");
    expect(toRiskCalendarDate(42)).toBe(42);
  });

  it("shows the stored day in time zones from UTC-11 to UTC+11", () => {
    const stored = toRiskCalendarDate("2001-01-01") as Date;
    for (const offsetHours of [-11, -5, 0, 3, 11]) {
      const local = new Date(stored.getTime() + offsetHours * 3600 * 1000);
      expect(local.toISOString().slice(0, 10)).toBe("2001-01-01");
    }
  });
});
