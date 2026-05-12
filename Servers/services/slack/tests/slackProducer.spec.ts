/**
 * @fileoverview Slack Producer Tests
 *
 * Tests for Slack notification queue scheduling.
 *
 * @module tests/slackProducer
 */

const mockObliterate = jest.fn().mockResolvedValue(undefined);
const mockAdd = jest.fn().mockResolvedValue({ id: "job-1" });

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({
    obliterate: mockObliterate,
    add: mockAdd,
  })),
}));

jest.mock("../../../utils/logger/fileLogger", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  __esModule: true,
}));

jest.mock("../../../database/redis", () => ({
  REDIS_URL: "redis://localhost:6379",
}));

import { Queue } from "bullmq";
import { scheduleDailyNotification } from "../slackProducer";

describe("slackProducer", () => {
  beforeEach(() => {
    mockObliterate.mockClear();
    mockAdd.mockClear();
  });

  describe("scheduleDailyNotification", () => {
    it("should obliterate existing jobs before adding new ones", async () => {
      await scheduleDailyNotification();
      expect(mockObliterate).toHaveBeenCalledWith({ force: true });
    });

    it("should add policy notification job with cron pattern", async () => {
      await scheduleDailyNotification();
      expect(mockAdd).toHaveBeenCalledWith(
        "slack-notification-policy",
        { type: "policies" },
        expect.objectContaining({
          repeat: { pattern: "0 9 * * *" },
          removeOnComplete: true,
          removeOnFail: false,
        }),
      );
    });
  });

  describe("queue initialization", () => {
    it("should create queue with redis connection on module load", () => {
      expect(Queue).toHaveBeenCalledWith("slack-notifications", {
        connection: { url: "redis://localhost:6379" },
      });
    });
  });
});
