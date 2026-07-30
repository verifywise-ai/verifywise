import { computeNextRun } from "../scheduleCalculator";

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
});
