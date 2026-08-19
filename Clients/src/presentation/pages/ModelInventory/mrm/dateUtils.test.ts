import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { toIsoDateInput, relativeTime } from "./dateUtils";

describe("mrm dateUtils", () => {
  describe("toIsoDateInput", () => {
    it("returns an empty string for missing input", () => {
      expect(toIsoDateInput(null)).toBe("");
      expect(toIsoDateInput(undefined)).toBe("");
      expect(toIsoDateInput("")).toBe("");
    });

    it("returns an empty string for an invalid date", () => {
      expect(toIsoDateInput("not-a-date")).toBe("");
    });

    it("converts an ISO datetime to a yyyy-mm-dd date input value", () => {
      expect(toIsoDateInput("2026-07-02T14:00:00Z")).toBe("2026-07-02");
    });
  });

  describe("relativeTime", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-17T12:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("returns an em dash for missing or invalid input", () => {
      expect(relativeTime(null)).toBe("—");
      expect(relativeTime(undefined)).toBe("—");
      expect(relativeTime("not-a-date")).toBe("—");
    });

    it("reports 'just now' for sub-minute deltas", () => {
      expect(relativeTime("2026-08-17T11:59:45Z")).toBe("just now");
    });

    it("reports minutes ago", () => {
      expect(relativeTime("2026-08-17T11:45:00Z")).toBe("15m ago");
    });

    it("reports hours ago", () => {
      expect(relativeTime("2026-08-17T09:00:00Z")).toBe("3h ago");
    });

    it("reports days ago", () => {
      expect(relativeTime("2026-08-14T12:00:00Z")).toBe("3d ago");
    });
  });
});
