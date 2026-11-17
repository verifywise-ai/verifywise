import { formatUtcTimeInLocal, maxCriticalError, minScoreError } from "../repositoryForm";

describe("repositoryForm", () => {
  describe("minScoreError", () => {
    it.each(["0", "70", "100"])("accepts %s", (value) => {
      expect(minScoreError(value)).toBeUndefined();
    });

    it.each(["", "-1", "101", "70.5", "abc", " 70"])("rejects %p", (value) => {
      expect(minScoreError(value)).toBe("Enter a whole number from 0 to 100");
    });
  });

  describe("maxCriticalError", () => {
    it.each(["0", "3", "250"])("accepts %s", (value) => {
      expect(maxCriticalError(value)).toBeUndefined();
    });

    it.each(["", "-1", "1.5", "x"])("rejects %p", (value) => {
      expect(maxCriticalError(value)).toBe("Enter a whole number of 0 or more");
    });
  });

  describe("formatUtcTimeInLocal", () => {
    const winter = new Date("2026-01-15T12:00:00Z");
    const summer = new Date("2026-07-15T12:00:00Z");

    it("shows UTC unchanged in the UTC zone", () => {
      expect(formatUtcTimeInLocal(2, 0, winter, "UTC")).toEqual({ utc: "02:00", local: "02:00" });
    });

    it("converts to a zone behind UTC, crossing midnight", () => {
      expect(formatUtcTimeInLocal(2, 0, winter, "America/New_York")).toEqual({
        utc: "02:00",
        local: "21:00",
      });
    });

    it("applies daylight saving time for the current date", () => {
      expect(formatUtcTimeInLocal(2, 30, summer, "America/New_York").local).toBe("22:30");
    });

    it("handles half-hour offsets", () => {
      expect(formatUtcTimeInLocal(0, 15, winter, "Asia/Kolkata").local).toBe("05:45");
    });
  });
});
