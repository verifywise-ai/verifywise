/**
 * @fileoverview Slack Producer Tests
 *
 * Tests for Slack notification queue scheduling.
 *
 * @module tests/slackProducer
 */

const mockObliterate = jest.fn().mockResolvedValue(undefined);
const mockAdd = jest.fn().mockResolvedValue({ id: "job-1" });
const mockUpsertJobScheduler = jest.fn().mockResolvedValue({ id: "job-1" });
const mockRemoveJobScheduler = jest.fn().mockResolvedValue(true);

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({
    obliterate: mockObliterate,
    add: mockAdd,
    upsertJobScheduler: mockUpsertJobScheduler,
    removeJobScheduler: mockRemoveJobScheduler,
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
import { removeRetiredSlackPolicyScheduler } from "../slackProducer";

describe("slackProducer", () => {
  beforeEach(() => {
    mockObliterate.mockClear();
    mockAdd.mockClear();
    mockUpsertJobScheduler.mockClear();
    mockRemoveJobScheduler.mockClear();
  });

  describe("removeRetiredSlackPolicyScheduler", () => {
    it("removes the retired policy Slack scheduler and schedules nothing", async () => {
      await removeRetiredSlackPolicyScheduler();
      expect(mockRemoveJobScheduler).toHaveBeenCalledWith("slack-notification-policy");
      expect(mockUpsertJobScheduler).not.toHaveBeenCalled();
      expect(mockObliterate).not.toHaveBeenCalled();
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
