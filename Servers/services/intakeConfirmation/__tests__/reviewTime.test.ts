import {
  addBusinessDays,
  formatReviewDate,
  isPastDue,
  localDateIn,
  parseReviewDays,
  reviewerNamesText,
  reviewSentence,
} from "../reviewTime";

const at = (iso: string) => new Date(iso);

describe("addBusinessDays", () => {
  it("counts weekdays from the next day", () => {
    // Monday + 3 = Thursday
    expect(addBusinessDays(at("2026-11-02T10:00:00Z"), 3, "UTC")).toBe("2026-11-05");
    // Thursday + 3 skips the weekend: Tuesday
    expect(addBusinessDays(at("2026-11-05T10:00:00Z"), 3, "UTC")).toBe("2026-11-10");
    // Two working weeks
    expect(addBusinessDays(at("2026-11-02T10:00:00Z"), 10, "UTC")).toBe("2026-11-16");
  });

  it("moves Friday and weekend submissions to Monday", () => {
    expect(addBusinessDays(at("2026-11-06T10:00:00Z"), 1, "UTC")).toBe("2026-11-09"); // Fri
    expect(addBusinessDays(at("2026-11-07T10:00:00Z"), 1, "UTC")).toBe("2026-11-09"); // Sat
    expect(addBusinessDays(at("2026-11-08T10:00:00Z"), 1, "UTC")).toBe("2026-11-09"); // Sun
    expect(addBusinessDays(at("2026-11-07T10:00:00Z"), 5, "UTC")).toBe("2026-11-13"); // Sat + 5
  });

  it("crosses a year boundary", () => {
    // Thursday 31 December + 2 = Monday 4 January
    expect(addBusinessDays(at("2026-12-31T12:00:00Z"), 2, "UTC")).toBe("2027-01-04");
  });

  it("counts from the calendar day in the given timezone", () => {
    // 23:30 UTC on Thursday is already Friday morning in Tokyo.
    const lateThursdayUtc = at("2026-11-05T23:30:00Z");
    expect(addBusinessDays(lateThursdayUtc, 1, "UTC")).toBe("2026-11-06");
    expect(addBusinessDays(lateThursdayUtc, 1, "Asia/Tokyo")).toBe("2026-11-09");
    // 03:00 UTC on Tuesday is still Monday evening in Los Angeles.
    const earlyTuesdayUtc = at("2026-11-03T03:00:00Z");
    expect(addBusinessDays(earlyTuesdayUtc, 1, "UTC")).toBe("2026-11-04");
    expect(addBusinessDays(earlyTuesdayUtc, 1, "America/Los_Angeles")).toBe("2026-11-03");
  });
});

describe("localDateIn", () => {
  it("formats the calendar date in the zone", () => {
    expect(localDateIn(at("2026-11-05T23:30:00Z"), "UTC")).toBe("2026-11-05");
    expect(localDateIn(at("2026-11-05T23:30:00Z"), "Asia/Tokyo")).toBe("2026-11-06");
  });
});

describe("parseReviewDays", () => {
  it("accepts whole numbers from 1 to 30", () => {
    expect(parseReviewDays(1)).toBe(1);
    expect(parseReviewDays(3)).toBe(3);
    expect(parseReviewDays(30)).toBe(30);
  });

  it.each([0, 31, -1, 2.5, "3", null, undefined, Number.NaN])("rejects %p", (value) => {
    expect(parseReviewDays(value)).toBeNull();
  });
});

describe("isPastDue", () => {
  it("is past only from the day after the due date, in the zone", () => {
    expect(isPastDue("2026-11-05", at("2026-11-05T23:00:00Z"), "UTC")).toBe(false);
    expect(isPastDue("2026-11-05", at("2026-11-06T00:30:00Z"), "UTC")).toBe(true);
    // Still 5 November in Los Angeles.
    expect(isPastDue("2026-11-05", at("2026-11-06T00:30:00Z"), "America/Los_Angeles")).toBe(false);
  });
});

describe("formatReviewDate", () => {
  it("formats in English, like the rest of the email", () => {
    expect(formatReviewDate("2026-11-05")).toBe("Thursday, November 5, 2026");
  });
});

describe("reviewerNamesText", () => {
  const names = ["Ann Lee", "Ben Ross", "Cem Tan", "Dee Fox", "Eli Roe"];

  it("is null without names", () => {
    expect(reviewerNamesText([])).toBeNull();
    expect(reviewerNamesText(["  ", ""])).toBeNull();
  });

  it("lists up to three names", () => {
    expect(reviewerNamesText(names.slice(0, 1))).toBe("Ann Lee");
    expect(reviewerNamesText(names.slice(0, 2))).toBe("Ann Lee and Ben Ross");
    expect(reviewerNamesText(names.slice(0, 3))).toBe("Ann Lee, Ben Ross and Cem Tan");
  });

  it("counts the rest after three", () => {
    expect(reviewerNamesText(names.slice(0, 4))).toBe("Ann Lee, Ben Ross, Cem Tan and 1 other");
    expect(reviewerNamesText(names)).toBe("Ann Lee, Ben Ross, Cem Tan and 2 others");
  });
});

describe("reviewSentence", () => {
  it("names the reviewers and the due date", () => {
    expect(reviewSentence("Ann Lee", { days: 3, date: "2026-11-05" })).toBe(
      "Ann Lee will review your submission within 3 business days, by Thursday, November 5, 2026.",
    );
    expect(reviewSentence("Ann Lee", { days: 1, date: "2026-11-05" })).toBe(
      "Ann Lee will review your submission within 1 business day, by Thursday, November 5, 2026.",
    );
  });

  it("names the governance team without reviewers", () => {
    expect(reviewSentence(null, { days: 3, date: "2026-11-05" })).toBe(
      "The governance team will review your submission within 3 business days, by Thursday, November 5, 2026.",
    );
  });

  it("leaves out the time and date without a due date", () => {
    expect(reviewSentence("Ann Lee", null)).toBe("Ann Lee will review your submission.");
    expect(reviewSentence(null, null)).toBe("The governance team will review your submission.");
  });
});
