import { computeNextRun, validateScheduleConfig, rollingPeriod } from "../scheduleCalculator";

jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

describe("computeNextRun", () => {
  const from = new Date("2026-06-19T08:00:00Z"); // Friday

  it("daily: next run is today/tomorrow at hh:mm in tz", () => {
    const next = computeNextRun({ frequency: "daily", hour: 9, minute: 0, timezone: "UTC" }, from);
    expect(next.toISOString()).toBe("2026-06-19T09:00:00.000Z");
  });

  it("daily: rolls to next day when time already passed", () => {
    const next = computeNextRun({ frequency: "daily", hour: 7, minute: 0, timezone: "UTC" }, from);
    expect(next.toISOString()).toBe("2026-06-20T07:00:00.000Z");
  });

  it("weekly: respects dayOfWeek (Monday=1)", () => {
    const next = computeNextRun(
      { frequency: "weekly", hour: 9, minute: 0, timezone: "UTC", dayOfWeek: 1 },
      from,
    );
    expect(next.getUTCDay()).toBe(1);
  });

  it("monthly: respects dayOfMonth", () => {
    const next = computeNextRun(
      { frequency: "monthly", hour: 9, minute: 0, timezone: "UTC", dayOfMonth: 1 },
      from,
    );
    expect(next.getUTCDate()).toBe(1);
  });

  describe("quarterly", () => {
    const now = new Date("2026-11-22T08:00:00Z");
    const q = (anchorMonth: number) =>
      computeNextRun(
        { frequency: "quarterly", hour: 9, minute: 0, timezone: "UTC", dayOfMonth: 1, anchorMonth },
        now,
      ).toISOString();

    it("anchor 11 -> next is 2027-02-01", () => {
      expect(q(11)).toBe("2027-02-01T09:00:00.000Z");
    });
    it("anchor 2 -> next is 2027-02-01", () => {
      expect(q(2)).toBe("2027-02-01T09:00:00.000Z");
    });
    it("anchor 12 -> next is 2026-12-01", () => {
      expect(q(12)).toBe("2026-12-01T09:00:00.000Z");
    });
  });

  it("unknown stored frequency falls back to the monthly cron", () => {
    const next = computeNextRun(
      { frequency: "yearly", hour: 9, minute: 0, timezone: "UTC", dayOfMonth: 1 } as any,
      from,
    );
    expect(next.toISOString()).toBe("2026-07-01T09:00:00.000Z");
  });
});

describe("validateScheduleConfig", () => {
  const base = { hour: 9, minute: 0, timezone: "UTC" };
  it("accepts the four frequencies", () => {
    for (const frequency of ["daily", "weekly", "monthly"]) {
      expect(validateScheduleConfig({ ...base, frequency })).toEqual([]);
    }
    expect(validateScheduleConfig({ ...base, frequency: "quarterly", anchorMonth: 3 })).toEqual([]);
  });
  it("rejects an unknown frequency", () => {
    expect(validateScheduleConfig({ ...base, frequency: "yearly" }).length).toBeGreaterThan(0);
  });
  it("rejects a non-object", () => {
    expect(validateScheduleConfig(null).length).toBeGreaterThan(0);
  });
  it("quarterly requires anchorMonth", () => {
    const errors = validateScheduleConfig({ ...base, frequency: "quarterly" });
    expect(errors.join(" ")).toMatch(/anchorMonth/);
  });
  it("quarterly rejects anchorMonth 13 and non-integers", () => {
    expect(
      validateScheduleConfig({ ...base, frequency: "quarterly", anchorMonth: 13 }).length,
    ).toBe(1);
    expect(
      validateScheduleConfig({ ...base, frequency: "quarterly", anchorMonth: 1.5 }).length,
    ).toBe(1);
  });
  it("quarterly rejects dayOfMonth outside 1-28", () => {
    expect(
      validateScheduleConfig({ ...base, frequency: "quarterly", anchorMonth: 1, dayOfMonth: 29 })
        .length,
    ).toBe(1);
  });
});

describe("rollingPeriod", () => {
  const d = (s: string) => new Date(`${s}T10:00:00Z`);
  it("daily", () => {
    expect(rollingPeriod("daily", d("2026-06-10"))).toEqual({
      periodStart: "2026-06-09",
      periodEnd: "2026-06-09",
    });
  });
  it("weekly", () => {
    expect(rollingPeriod("weekly", d("2026-06-10"))).toEqual({
      periodStart: "2026-06-03",
      periodEnd: "2026-06-09",
    });
  });
  it("monthly clamps to month end", () => {
    expect(rollingPeriod("monthly", d("2026-03-31"))).toEqual({
      periodStart: "2026-03-01",
      periodEnd: "2026-03-30",
    });
  });
  it("monthly on the 1st covers the previous month", () => {
    expect(rollingPeriod("monthly", d("2026-06-01"))).toEqual({
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
    });
  });
  it("quarterly", () => {
    expect(rollingPeriod("quarterly", d("2026-06-01"))).toEqual({
      periodStart: "2026-03-01",
      periodEnd: "2026-05-31",
    });
  });
});
