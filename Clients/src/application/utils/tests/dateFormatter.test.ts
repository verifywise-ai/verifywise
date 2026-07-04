import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatRelativeDate } from "../dateFormatter";

// Mock date-fns to make formatRelativeDate deterministic
vi.mock("date-fns", () => ({
  formatDistanceToNow: vi.fn(),
  isValid: vi.fn(),
}));

import { formatDistanceToNow, isValid } from "date-fns";

describe("dateFormatter utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("formatRelativeDate", () => {
    it('returns "Unknown" when dateString is empty', () => {
      expect(formatRelativeDate("")).toBe("Unknown");
    });

    it('returns "Unknown" when dateString is null', () => {
      expect(formatRelativeDate(null as unknown as string)).toBe("Unknown");
    });

    it('returns "Unknown" when dateString is undefined', () => {
      expect(formatRelativeDate(undefined as unknown as string)).toBe("Unknown");
    });

    it('returns "Unknown" when date is invalid (isValid = false)', () => {
      (isValid as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);

      expect(formatRelativeDate("not-a-date")).toBe("Unknown");
      expect(isValid).toHaveBeenCalledTimes(1);
      expect(formatDistanceToNow).not.toHaveBeenCalled();
    });

    it("returns relative date using date-fns when date is valid", () => {
      (isValid as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (formatDistanceToNow as unknown as ReturnType<typeof vi.fn>).mockReturnValue("5 minutes ago");

      const input = "2026-01-22T12:00:00.000Z";
      const result = formatRelativeDate(input);

      expect(result).toBe("5 minutes ago");
      expect(isValid).toHaveBeenCalledTimes(1);

      expect(formatDistanceToNow).toHaveBeenCalledTimes(1);
      const [passedDate, passedOptions] = (formatDistanceToNow as any).mock.calls[0];

      expect(passedDate).toBeInstanceOf(Date);
      expect((passedDate as Date).toISOString()).toBe(input);
      expect(passedOptions).toEqual({ addSuffix: true });
    });

    it("handles PostgreSQL format (space-separated) by normalizing to ISO", () => {
      (isValid as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (formatDistanceToNow as unknown as ReturnType<typeof vi.fn>).mockReturnValue("2 days ago");

      const result = formatRelativeDate("2026-02-19 21:30:00");

      expect(result).toBe("2 days ago");
      // The space should be replaced with 'T' and 'Z' appended
      const [passedDate] = (formatDistanceToNow as any).mock.calls[0];
      expect((passedDate as Date).toISOString()).toBe("2026-02-19T21:30:00.000Z");
    });

    it("appends Z when no timezone indicator present", () => {
      (isValid as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (formatDistanceToNow as unknown as ReturnType<typeof vi.fn>).mockReturnValue("1 hour ago");

      formatRelativeDate("2026-03-15T10:00:00");

      const [passedDate] = (formatDistanceToNow as any).mock.calls[0];
      expect((passedDate as Date).toISOString()).toBe("2026-03-15T10:00:00.000Z");
    });

    it("does not append Z when date already has timezone offset", () => {
      (isValid as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (formatDistanceToNow as unknown as ReturnType<typeof vi.fn>).mockReturnValue("3 hours ago");

      formatRelativeDate("2026-03-15T10:00:00+05:00");

      const [passedDate] = (formatDistanceToNow as any).mock.calls[0];
      // Should preserve the original offset
      expect((passedDate as Date).toISOString()).toBe("2026-03-15T05:00:00.000Z");
    });

    it("trims whitespace from input date string", () => {
      (isValid as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (formatDistanceToNow as unknown as ReturnType<typeof vi.fn>).mockReturnValue("1 day ago");

      const result = formatRelativeDate("  2026-04-01T12:00:00.000Z  ");

      expect(result).toBe("1 day ago");
      // Should have been trimmed before processing
      const [passedDate] = (formatDistanceToNow as any).mock.calls[0];
      expect((passedDate as Date).toISOString()).toBe("2026-04-01T12:00:00.000Z");
    });
  });
});
