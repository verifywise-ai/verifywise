import { dayOf } from "../types";

describe("dayOf", () => {
  it("reads a day written dd/mm/yyyy or as an ISO date or date and time", () => {
    expect(dayOf("31/12/2025")).toBe("2025-12-31");
    expect(dayOf("2025-12-31")).toBe("2025-12-31");
    expect(dayOf("2025-12-31T23:59:59+05:00")).toBe("2025-12-31");
    expect(dayOf(" 2025-12-31 10:00 ")).toBe("2025-12-31");
  });

  it("is null for anything else and for a day that does not exist", () => {
    expect(dayOf(null)).toBeNull();
    expect(dayOf(undefined)).toBeNull();
    expect(dayOf("December 2025")).toBeNull();
    expect(dayOf("2025-02-30")).toBeNull();
    expect(dayOf("31/04/2025")).toBeNull();
  });

  it("is null for a day of year 0000, which Postgres does not have and would refuse the whole write of a list", () => {
    expect(dayOf("0000-01-01")).toBeNull();
    expect(dayOf("0000-12-31T00:00:00Z")).toBeNull();
    expect(dayOf("01/01/0000")).toBeNull();
    // The first day Postgres reads is kept.
    expect(dayOf("0001-01-01")).toBe("0001-01-01");
  });
});
