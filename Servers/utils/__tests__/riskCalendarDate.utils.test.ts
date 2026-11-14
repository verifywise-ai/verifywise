import {
  isInvalidDateCell,
  riskCalendarDateFromCell,
  toRiskCalendarDate,
} from "../riskCalendarDate.utils";

const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : value);

describe("toRiskCalendarDate", () => {
  it("stores a date-only string at 12:00 UTC on the same day", () => {
    expect(iso(toRiskCalendarDate("2001-01-01"))).toBe("2001-01-01T12:00:00.000Z");
    expect(iso(toRiskCalendarDate(" 2026-02-28 "))).toBe("2026-02-28T12:00:00.000Z");
  });

  it("treats exactly 00:00 UTC as a parsed date-only value", () => {
    expect(iso(toRiskCalendarDate("2026-05-01T00:00:00.000Z"))).toBe("2026-05-01T12:00:00.000Z");
    expect(iso(toRiskCalendarDate(new Date("2026-05-01")))).toBe("2026-05-01T12:00:00.000Z");
  });

  it("stores any other time as sent", () => {
    for (const sent of [
      "2026-05-01T12:00:00.000Z", // already stored
      "2026-05-01T18:00:00Z", // explicit API time
      "2026-05-01T04:00:00.000Z", // older client, Toronto midnight
      "2026-04-30T21:00:00.000Z", // older client, Istanbul midnight
      "2026-05-01T14:23:41.512Z", // "now"
    ]) {
      expect(toRiskCalendarDate(sent)).toBe(sent);
    }
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
});

describe("riskCalendarDateFromCell", () => {
  it("reads a cell without a time as that calendar day, whatever the server time zone", () => {
    expect(iso(riskCalendarDateFromCell("05/01/2026"))).toBe("2026-05-01T12:00:00.000Z");
    expect(iso(riskCalendarDateFromCell("1 May 2026"))).toBe("2026-05-01T12:00:00.000Z");
  });

  it("reads a weekday name as part of the date, not as a time", () => {
    expect(iso(riskCalendarDateFromCell("Thu 1 Oct 2026"))).toBe("2026-10-01T12:00:00.000Z");
    expect(iso(riskCalendarDateFromCell("Tue, 5 May 2026"))).toBe("2026-05-05T12:00:00.000Z");
  });

  it("reads a year or year-month as that day in UTC, whatever the server time zone", () => {
    expect(iso(riskCalendarDateFromCell("2026"))).toBe("2026-01-01T12:00:00.000Z");
    expect(iso(riskCalendarDateFromCell("2026-05"))).toBe("2026-05-01T12:00:00.000Z");
  });

  it("follows toRiskCalendarDate for ISO text and date cells", () => {
    expect(iso(riskCalendarDateFromCell("2026-05-01"))).toBe("2026-05-01T12:00:00.000Z");
    expect(iso(riskCalendarDateFromCell(new Date("2026-05-01T00:00:00.000Z")))).toBe(
      "2026-05-01T12:00:00.000Z",
    );
    expect(riskCalendarDateFromCell("2026-05-01T18:00:00Z")).toBe("2026-05-01T18:00:00Z");
  });

  it("passes unparseable text through for validation", () => {
    expect(riskCalendarDateFromCell("someday")).toBe("someday");
  });
});

describe("isInvalidDateCell", () => {
  it("refuses number cells, such as an Excel serial or a typed year", () => {
    expect(isInvalidDateCell(46022)).toBe(true);
    expect(isInvalidDateCell(2026)).toBe(true);
  });

  it("accepts parseable text and dates, and refuses text that does not parse", () => {
    expect(isInvalidDateCell("2026-05-01")).toBe(false);
    expect(isInvalidDateCell("Thu 1 Oct 2026")).toBe(false);
    expect(isInvalidDateCell(new Date("2026-05-01"))).toBe(false);
    expect(isInvalidDateCell("someday")).toBe(true);
  });
});
