import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));

import { GENERIC_FORMATTERS, getEntityConfig } from "../../config/changeHistory.config";

describe("calendarDate history formatter (policy next review date)", () => {
  it("is the formatter for a policy's next review date", () => {
    expect(getEntityConfig("policy").fieldFormatters!.next_review_date).toBe(
      GENERIC_FORMATTERS.calendarDate,
    );
  });

  it("reads a stored day by its local date parts, as node-pg builds it", async () => {
    // node-pg turns "2030-01-15 00:00" (no time zone) into local midnight.
    expect(await GENERIC_FORMATTERS.calendarDate(new Date(2030, 0, 15))).toBe("2030-01-15");
  });

  it("formats the sent date-only string as the same day, so an unchanged date records no change", async () => {
    const stored = await GENERIC_FORMATTERS.calendarDate(new Date(2030, 0, 15));
    expect(await GENERIC_FORMATTERS.calendarDate("2030-01-15")).toBe(stored);
  });

  it("shows - for an empty value", async () => {
    expect(await GENERIC_FORMATTERS.calendarDate(null)).toBe("-");
  });
});
