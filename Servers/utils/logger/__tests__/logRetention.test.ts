import { getServerLogRetentionDays } from "../logRetention";

describe("logRetention", () => {
  const originalEnv = process.env.LOG_RETENTION_DAYS;

  afterEach(() => {
    // Restore original value
    if (originalEnv === undefined) {
      delete process.env.LOG_RETENTION_DAYS;
    } else {
      process.env.LOG_RETENTION_DAYS = originalEnv;
    }
  });

  describe("getServerLogRetentionDays", () => {
    it("returns 14 when LOG_RETENTION_DAYS is unset", () => {
      delete process.env.LOG_RETENTION_DAYS;
      expect(getServerLogRetentionDays()).toBe(14);
    });

    it("returns the parsed integer when LOG_RETENTION_DAYS is a valid string number >= 1", () => {
      process.env.LOG_RETENTION_DAYS = "30";
      expect(getServerLogRetentionDays()).toBe(30);
    });

    it("returns 14 when LOG_RETENTION_DAYS is 0", () => {
      process.env.LOG_RETENTION_DAYS = "0";
      expect(getServerLogRetentionDays()).toBe(14);
    });

    it("returns 14 when LOG_RETENTION_DAYS is negative", () => {
      process.env.LOG_RETENTION_DAYS = "-5";
      expect(getServerLogRetentionDays()).toBe(14);
    });

    it("returns 14 when LOG_RETENTION_DAYS is not a valid integer", () => {
      process.env.LOG_RETENTION_DAYS = "abc";
      expect(getServerLogRetentionDays()).toBe(14);
    });

    it("returns 14 when LOG_RETENTION_DAYS is a decimal", () => {
      process.env.LOG_RETENTION_DAYS = "3.5";
      expect(getServerLogRetentionDays()).toBe(14);
    });

    it("returns 14 when LOG_RETENTION_DAYS is an empty string", () => {
      process.env.LOG_RETENTION_DAYS = "";
      expect(getServerLogRetentionDays()).toBe(14);
    });

    it("returns 1 when LOG_RETENTION_DAYS is 1", () => {
      process.env.LOG_RETENTION_DAYS = "1";
      expect(getServerLogRetentionDays()).toBe(1);
    });

    it("returns 365 when LOG_RETENTION_DAYS is 365", () => {
      process.env.LOG_RETENTION_DAYS = "365";
      expect(getServerLogRetentionDays()).toBe(365);
    });
  });
});
