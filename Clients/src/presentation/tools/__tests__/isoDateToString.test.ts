import { describe, it, expect, beforeEach } from "vitest";
import {
  displayFormattedDate,
  displayFormattedDateTime,
  displayFormattedTime,
  formatDate,
  formatDateTime,
} from "../isoDateToString";

describe("formatDate", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("formats an ISO date using the default preference", () => {
    expect(formatDate("2024-11-01")).toBe("01-11-2024");
  });

  it("formats another date using the default preference", () => {
    expect(formatDate("2023-03-15T00:00:00Z")).toBe("15-03-2023");
  });

  it("throws for empty string", () => {
    expect(() => formatDate("")).toThrow("Invalid ISO date format");
  });

  it("throws for invalid format", () => {
    expect(() => formatDate("not-a-date")).toThrow("Invalid ISO date format");
  });
});

describe("displayFormattedDate", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("uses DD-MM-YYYY as default format", () => {
    const result = displayFormattedDate("2024-11-01");
    expect(result).toBe("01-11-2024");
  });

  it("respects localStorage preference for MM-DD-YYYY", () => {
    localStorage.setItem("verifywise_preferences", JSON.stringify({ date_format: "MM-DD-YYYY" }));
    const result = displayFormattedDate("2024-11-01");
    expect(result).toBe("11-01-2024");
  });

  it.each([
    ["DD-MM-YYYY", "01-11-2024"],
    ["MM-DD-YYYY", "11-01-2024"],
    ["DD/MM/YY", "01/11/24"],
    ["MM/DD/YY", "11/01/24"],
  ])("respects localStorage preference for %s", (dateFormat, expected) => {
    localStorage.setItem("verifywise_preferences", JSON.stringify({ date_format: dateFormat }));
    const result = displayFormattedDate("2024-11-01");
    expect(result).toBe(expected);
  });

  it("handles Date objects", () => {
    // Construct a LOCAL-midnight date so round-trip via toISOString → dayjs
    // (which formats in local) renders the same calendar day in every TZ.
    const date = new Date(2024, 10, 1); // Nov 1 local
    const result = displayFormattedDate(date);
    expect(result).toBe("01-11-2024");
  });

  it("returns input string for invalid date strings", () => {
    const result = displayFormattedDate("not-a-date");
    expect(result).toBe("not-a-date");
  });

  it("handles corrupt localStorage JSON gracefully", () => {
    localStorage.setItem("verifywise_preferences", "not-json{{{");
    // Should fall back to default format without throwing
    const result = displayFormattedDate("2024-11-01");
    expect(result).toBe("01-11-2024");
  });
});

describe("displayFormattedTime", () => {
  it("formats time without seconds by default", () => {
    expect(displayFormattedTime("2024-11-01T14:30:25")).toBe("14:30");
  });

  it("formats time with seconds when requested", () => {
    expect(displayFormattedTime("2024-11-01T14:30:25", { includeSeconds: true })).toBe("14:30:25");
  });
});

describe("displayFormattedDateTime", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("formats date and time using the preferred date format", () => {
    localStorage.setItem("verifywise_preferences", JSON.stringify({ date_format: "MM/DD/YY" }));
    expect(displayFormattedDateTime("2024-11-01T14:30:25")).toBe("11/01/24, 14:30");
  });

  it("includes seconds when requested", () => {
    expect(displayFormattedDateTime("2024-11-01T14:30:25", { includeSeconds: true })).toBe(
      "01-11-2024, 14:30:25",
    );
  });

  it("supports a custom separator", () => {
    expect(displayFormattedDateTime("2024-11-01T14:30:25", { separator: " at " })).toBe(
      "01-11-2024 at 14:30",
    );
  });
});

describe("formatDateTime", () => {
  it("formats date with time components", () => {
    const result = formatDateTime("2024-11-01T14:30:25");
    expect(result).toBe("01-11-2024, 14:30:25");
  });

  it("throws for empty string", () => {
    expect(() => formatDateTime("")).toThrow("Invalid ISO date format");
  });

  it("throws for invalid format", () => {
    expect(() => formatDateTime("invalid")).toThrow("Invalid ISO date format");
  });

  it("includes hours, minutes, and seconds", () => {
    const result = formatDateTime("2024-06-15T00:00:00");
    expect(result).toMatch(/^\d{2}-\d{2}-\d{4}, \d{2}:\d{2}:\d{2}$/);
  });
});
