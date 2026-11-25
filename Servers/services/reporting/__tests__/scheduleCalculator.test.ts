import logger from "../../../utils/logger/fileLogger";
import { computeNextRun, rollingPeriod, scheduleConfigErrors } from "../scheduleCalculator";
import { PARAMETER_MESSAGES, parameterErrorMessages } from "../reportParameters";

// The English text of a schedule config's problems.
const scheduleConfigText = (cfg: unknown) => parameterErrorMessages(scheduleConfigErrors(cfg));

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
    it("anchor 1 -> next is 2027-01-01", () => {
      expect(q(1)).toBe("2027-01-01T09:00:00.000Z");
    });
    it.each([0, 13, 1.5])("invalid stored anchor %s falls back to 1 and warns", (a) => {
      (logger.warn as jest.Mock).mockClear();
      expect(q(a)).toBe("2027-01-01T09:00:00.000Z");
      expect(logger.warn).toHaveBeenCalled();
    });
    it("undefined anchor falls back to 1 without warning", () => {
      (logger.warn as jest.Mock).mockClear();
      const next = computeNextRun(
        { frequency: "quarterly", hour: 9, minute: 0, timezone: "UTC", dayOfMonth: 1 },
        now,
      );
      expect(next.toISOString()).toBe("2027-01-01T09:00:00.000Z");
      expect(logger.warn).not.toHaveBeenCalled();
    });
    it("anchor 12 -> next is 2026-12-01", () => {
      expect(q(12)).toBe("2026-12-01T09:00:00.000Z");
    });
  });

  it("unknown stored frequency falls back to the monthly cron", () => {
    (logger.warn as jest.Mock).mockClear();
    const next = computeNextRun(
      { frequency: "yearly", hour: 9, minute: 0, timezone: "UTC", dayOfMonth: 1 } as any,
      from,
    );
    expect(next.toISOString()).toBe("2026-07-01T09:00:00.000Z");
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('unknown frequency "yearly"'));
  });
});

describe("scheduleConfigErrors as text", () => {
  const base = { hour: 9, minute: 0, timezone: "UTC" };
  it("accepts the four frequencies", () => {
    for (const frequency of ["daily", "weekly", "monthly"]) {
      expect(scheduleConfigText({ ...base, frequency })).toEqual([]);
    }
    expect(scheduleConfigText({ ...base, frequency: "quarterly", anchorMonth: 3 })).toEqual([]);
  });
  it("rejects an unknown frequency", () => {
    expect(scheduleConfigText({ ...base, frequency: "yearly" }).length).toBeGreaterThan(0);
  });
  it("rejects a non-object", () => {
    expect(scheduleConfigText(null).length).toBeGreaterThan(0);
  });
  it("quarterly requires anchorMonth", () => {
    const errors = scheduleConfigText({ ...base, frequency: "quarterly" });
    expect(errors.join(" ")).toMatch(/anchorMonth/);
  });
  it("quarterly rejects anchorMonth 13 and non-integers", () => {
    expect(scheduleConfigText({ ...base, frequency: "quarterly", anchorMonth: 13 }).length).toBe(1);
    expect(scheduleConfigText({ ...base, frequency: "quarterly", anchorMonth: 1.5 }).length).toBe(
      1,
    );
  });
  it("quarterly rejects dayOfMonth outside 1-28", () => {
    expect(
      scheduleConfigText({ ...base, frequency: "quarterly", anchorMonth: 1, dayOfMonth: 29 })
        .length,
    ).toBe(1);
  });
});

describe("scheduleConfigErrors", () => {
  const base = { hour: 9, minute: 0, timezone: "UTC" };

  it("gives translation keys with named placeholders, never a filled-in message", () => {
    expect(scheduleConfigErrors({ ...base, frequency: "yearly" })).toEqual([
      {
        key: "frequency",
        message: "frequency must be one of: {frequencies}",
        params: { frequencies: "daily, weekly, monthly, quarterly" },
      },
    ]);
  });

  it("lists every message it can give in PARAMETER_MESSAGES, so each is translated", () => {
    const bad = [
      null,
      "x",
      { ...base, frequency: "yearly" },
      { ...base, frequency: "quarterly" },
      { ...base, frequency: "quarterly", anchorMonth: 1, dayOfMonth: 31 },
    ];
    const messages = new Set(bad.flatMap((c) => scheduleConfigErrors(c).map((e) => e.message)));
    expect(messages.size).toBe(4);
    for (const m of messages) expect(PARAMETER_MESSAGES).toContain(m);
  });

  it("fills the placeholder into the English text", () => {
    expect(scheduleConfigText({ ...base, frequency: "yearly" })).toEqual([
      "frequency must be one of: daily, weekly, monthly, quarterly",
    ]);
  });
});

describe("rollingPeriod", () => {
  const d = (s: string) => new Date(`${s}T10:00:00Z`);
  const cases: [string, string, string, string][] = [
    ["daily", "2026-06-10", "2026-06-09", "2026-06-09"],
    ["weekly", "2026-06-10", "2026-06-03", "2026-06-09"],
    ["monthly", "2026-07-01", "2026-06-01", "2026-06-30"],
    ["monthly", "2026-03-01", "2026-02-01", "2026-02-28"],
    ["monthly", "2026-03-31", "2026-02-28", "2026-03-30"],
    ["quarterly", "2026-06-01", "2026-03-01", "2026-05-31"],
    ["quarterly", "2026-11-01", "2026-08-01", "2026-10-31"],
  ];
  it.each(cases)("%s run %s -> %s..%s", (f, run, start, end) => {
    expect(rollingPeriod(f as any, d(run))).toEqual({ periodStart: start, periodEnd: end });
  });

  describe("in the schedule's timezone", () => {
    it("east of UTC: a 09:00 Auckland quarterly run on 1 January covers the last quarter", () => {
      // 2027-01-01 09:00 in Auckland (NZDT, +13) is 2026-12-31 20:00 UTC.
      const run = computeNextRun(
        {
          frequency: "quarterly",
          anchorMonth: 1,
          dayOfMonth: 1,
          hour: 9,
          minute: 0,
          timezone: "Pacific/Auckland",
        },
        new Date("2026-11-22T00:00:00Z"),
      );
      expect(run.toISOString()).toBe("2026-12-31T20:00:00.000Z");
      expect(rollingPeriod("quarterly", run, "Pacific/Auckland")).toEqual({
        periodStart: "2026-10-01",
        periodEnd: "2026-12-31",
      });
    });

    it("west of UTC: a 20:00 Los Angeles daily run covers the local day before", () => {
      // 2026-06-10 20:00 in Los Angeles (PDT, -7) is 2026-06-11 03:00 UTC.
      const run = new Date("2026-06-11T03:00:00Z");
      expect(rollingPeriod("daily", run, "America/Los_Angeles")).toEqual({
        periodStart: "2026-06-09",
        periodEnd: "2026-06-09",
      });
    });

    it("uses UTC when the schedule names no timezone", () => {
      const run = new Date("2026-06-11T03:00:00Z");
      expect(rollingPeriod("daily", run)).toEqual({
        periodStart: "2026-06-10",
        periodEnd: "2026-06-10",
      });
      expect(rollingPeriod("daily", run, "")).toEqual(rollingPeriod("daily", run));
    });

    it("falls back to UTC, with a warning, for a timezone it cannot read", () => {
      (logger.warn as jest.Mock).mockClear();
      const run = new Date("2026-06-11T03:00:00Z");
      expect(rollingPeriod("daily", run, "Mars/Olympus")).toEqual(rollingPeriod("daily", run));
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Mars/Olympus"));
    });
  });
});
