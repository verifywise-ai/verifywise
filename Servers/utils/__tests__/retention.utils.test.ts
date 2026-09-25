import { computeExpiryDate, toExpiryDateString } from "../retention.utils";

const BASE = new Date("2026-01-15T12:00:00.000Z");

describe("computeExpiryDate", () => {
  it("adds day-granularity retentions relative to baseDate", () => {
    const thirty = computeExpiryDate("30_days", BASE);
    expect(thirty).not.toBeNull();
    expect(thirty!.getUTCFullYear()).toBe(2026);
    expect(thirty!.getUTCMonth()).toBe(1); // February
    expect(thirty!.getUTCDate()).toBe(14);

    const ninety = computeExpiryDate("90_days", BASE);
    expect(ninety!.getUTCMonth()).toBe(3); // April
    expect(ninety!.getUTCDate()).toBe(15);
  });

  it("adds month-granularity retentions relative to baseDate", () => {
    expect(computeExpiryDate("6_months", BASE)!.getUTCMonth()).toBe(6); // July
    expect(computeExpiryDate("1_year", BASE)!.getUTCFullYear()).toBe(2027);
    expect(computeExpiryDate("3_years", BASE)!.getUTCFullYear()).toBe(2029);
    expect(computeExpiryDate("5_years", BASE)!.getUTCFullYear()).toBe(2031);
    expect(computeExpiryDate("7_years", BASE)!.getUTCFullYear()).toBe(2033);
  });

  it("returns null for indefinite and unrecognized values", () => {
    expect(computeExpiryDate("indefinite", BASE)).toBeNull();
    expect(computeExpiryDate("garbage", BASE)).toBeNull();
    expect(computeExpiryDate(null, BASE)).toBeNull();
    expect(computeExpiryDate(undefined, BASE)).toBeNull();
    expect(computeExpiryDate("", BASE)).toBeNull();
  });
});

describe("toExpiryDateString", () => {
  it("formats to YYYY-MM-DD", () => {
    expect(toExpiryDateString(new Date("2026-02-14T09:30:00.000Z"))).toBe("2026-02-14");
  });
});
