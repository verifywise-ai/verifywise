import { describe, it, expect, beforeEach } from "vitest";
import { formatDate, displayFormattedDate, formatDateTime } from "../isoDateToString";

describe("formatDate", () => {
  it("formats an ISO date to 'day month year'", () => {
    expect(formatDate("2024-11-01")).toBe("1 November 2024");
  });

  it("formats another date correctly", () => {
    expect(formatDate("2023-03-15T00:00:00Z")).toBe("15 March 2023");
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
    localStorage.setItem(
      "verifywise_preferences",
      JSON.stringify({ date_format: "MM-DD-YYYY" })
    );
    const result = displayFormattedDate("2024-11-01");
    expect(result).toBe("11-01-2024");
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

describe("formatDateTime", () => {
  it("formats date with time components", () => {
    // Use a UTC midnight date, but formatDateTime uses local time
    // so we test the pattern rather than exact values
    const result = formatDateTime("2024-11-01T14:30:25Z");
    // Should contain the date parts and time separated by comma
    expect(result).toMatch(/\d+ \w+ \d{4}, \d{2}:\d{2}:\d{2}/);
  });

  it("throws for empty string", () => {
    expect(() => formatDateTime("")).toThrow("Invalid ISO date format");
  });

  it("throws for invalid format", () => {
    expect(() => formatDateTime("invalid")).toThrow("Invalid ISO date format");
  });

  it("includes hours, minutes, and seconds", () => {
    // Use a date where local time will have identifiable components
    const result = formatDateTime("2024-06-15T00:00:00Z");
    // Result should match the pattern "day Month year, HH:MM:SS"
    expect(result).toMatch(/^\d{1,2} \w+ \d{4}, \d{2}:\d{2}:\d{2}$/);
  });
});
