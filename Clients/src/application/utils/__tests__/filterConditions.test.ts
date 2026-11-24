import { dateOnlyToLocalDay } from "../../../presentation/tools/isoDateToString";
import { matchesFilterCondition } from "../filterConditions";

describe("matchesFilterCondition on a multi-valued field", () => {
  const ids = ["1", "22", "Draft"];

  it("'is' means includes, ignoring case", () => {
    expect(matchesFilterCondition(ids, "is", "22")).toBe(true);
    expect(matchesFilterCondition(ids, "is", "draft")).toBe(true);
    expect(matchesFilterCondition(ids, "is", "2")).toBe(false);
  });

  it("'is not' means does not include", () => {
    expect(matchesFilterCondition(ids, "is_not", "22")).toBe(false);
    expect(matchesFilterCondition(ids, "is_not", "3")).toBe(true);
    expect(matchesFilterCondition([], "is_not", "3")).toBe(true);
  });

  it("contains and does not contain look inside each value", () => {
    expect(matchesFilterCondition(ids, "contains", "raf")).toBe(true);
    expect(matchesFilterCondition(ids, "does_not_contain", "raf")).toBe(false);
    expect(matchesFilterCondition(ids, "does_not_contain", "zz")).toBe(true);
  });

  it("empty checks look at the length", () => {
    expect(matchesFilterCondition([], "is_empty", "")).toBe(true);
    expect(matchesFilterCondition(ids, "is_empty", "")).toBe(false);
    expect(matchesFilterCondition(ids, "is_not_empty", "")).toBe(true);
    expect(matchesFilterCondition([], "is_not_empty", "")).toBe(false);
  });

  it("numbers in the array match their string form", () => {
    expect(matchesFilterCondition([1, 2], "is", "2")).toBe(true);
  });

  it("scalars keep exact, case-insensitive matching", () => {
    expect(matchesFilterCondition("1,2", "is", "1")).toBe(false);
    expect(matchesFilterCondition("High", "is", "high")).toBe(true);
    expect(matchesFilterCondition(null, "is_empty", "")).toBe(true);
  });
});

describe("matchesFilterCondition 'in the last N days' (recent date columns)", () => {
  // Day-only values as the incidents page passes them: local midnight of the day.
  const day = (ymd: string) => dateOnlyToLocalDay(ymd);

  afterEach(() => {
    vi.useRealTimers();
  });

  // Late evening and just after midnight local time: in most zones the UTC
  // date differs from the local one at one of these, so a UTC comparison
  // would be off by a day.
  it.each([
    ["late evening", new Date(2026, 10, 24, 23, 30)],
    ["just after midnight", new Date(2026, 10, 24, 0, 15)],
  ])("compares by local calendar day (%s)", (_label, now) => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    expect(matchesFilterCondition(day("2026-11-24"), "in_last_7_days", "")).toBe(true);
    expect(matchesFilterCondition(day("2026-11-17"), "in_last_7_days", "")).toBe(true);
    expect(matchesFilterCondition(day("2026-11-16"), "in_last_7_days", "")).toBe(false);
    // A day after today is not "in the last 7 days".
    expect(matchesFilterCondition(day("2026-11-25"), "in_last_7_days", "")).toBe(false);

    expect(matchesFilterCondition(day("2026-11-23"), "in_last_1_day", "")).toBe(true);
    expect(matchesFilterCondition(day("2026-11-22"), "in_last_1_day", "")).toBe(false);

    expect(matchesFilterCondition(day("2026-11-10"), "in_last_2_weeks", "")).toBe(true);
    expect(matchesFilterCondition(day("2026-11-09"), "in_last_2_weeks", "")).toBe(false);

    expect(matchesFilterCondition(day("2026-10-25"), "in_last_30_days", "")).toBe(true);
    expect(matchesFilterCondition(day("2026-10-24"), "in_last_30_days", "")).toBe(false);
  });

  it("an empty date never matches", () => {
    expect(matchesFilterCondition(null, "in_last_30_days", "")).toBe(false);
  });

  it("the forward-looking operators are unchanged: a past day is not 'in 7 days'", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 24, 12, 0));
    expect(matchesFilterCondition(day("2026-11-20"), "in_7_days", "")).toBe(false);
    expect(matchesFilterCondition(day("2026-11-28"), "in_7_days", "")).toBe(true);
  });
});
