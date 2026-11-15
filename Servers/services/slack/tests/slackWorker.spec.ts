/**
 * @fileoverview Slack Worker Tests
 *
 * Tests for Slack notification BullMQ worker.
 *
 * @module tests/slackWorker
 */

const mockWorkerOn = jest.fn();

jest.mock("bullmq", () => ({
  Worker: jest.fn().mockImplementation((_queueName: string, _processor: any, _opts: any) => ({
    on: mockWorkerOn,
  })),
}));

jest.mock("../../../database/redis", () => ({
  REDIS_URL: "redis://localhost:6379",
}));

jest.mock("../../../utils/logger/fileLogger", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  __esModule: true,
}));

import { Worker, Job } from "bullmq";
import { createNotificationWorker } from "../slackWorker";

describe("slackWorker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createNotificationWorker", () => {
    it("should create a Worker with correct queue name", () => {
      createNotificationWorker();
      expect(Worker).toHaveBeenCalledWith(
        "slack-notifications",
        expect.any(Function),
        expect.objectContaining({
          connection: { url: "redis://localhost:6379" },
        }),
      );
    });

    it("should return the worker instance", () => {
      const worker = createNotificationWorker();
      expect(worker).toBeDefined();
      expect(worker.on).toBe(mockWorkerOn);
    });

    it("completes a retired policies job without sending anything", async () => {
      createNotificationWorker();

      const processor = (Worker as jest.MockedFunction<typeof Worker>).mock.calls[0][1] as (
        job: Job,
      ) => Promise<any>;
      const result = await processor({ data: { type: "policies" } } as Job);

      expect(result).toEqual({ success: true, skipped: true });
    });

    it("should throw for unknown job type", async () => {
      createNotificationWorker();

      const processor = (Worker as jest.MockedFunction<typeof Worker>).mock.calls[0][1] as (
        job: Job,
      ) => Promise<any>;
      await expect(processor({ data: { type: "unknown" } } as Job)).rejects.toThrow(
        "Unknown job type: unknown",
      );
    });

    it("should register completed and failed event handlers", () => {
      createNotificationWorker();
      expect(mockWorkerOn).toHaveBeenCalledWith("completed", expect.any(Function));
      expect(mockWorkerOn).toHaveBeenCalledWith("failed", expect.any(Function));
    });
  });
});
