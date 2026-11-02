/**
 * @fileoverview removeLegacyRepeatableJobs
 *
 * Which entries of a queue's repeat set count as BullMQ 5 repeatable jobs, and
 * which are the job schedulers that replaced them.
 *
 * @module jobs/tests/legacyRepeatableJobs
 */

jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import type { JobSchedulerJson } from "bullmq";
import { removeLegacyRepeatableJobs } from "../legacyRepeatableJobs";

const NEXT_RUN = Date.UTC(2026, 10, 3, 0, 0, 0);

function scheduler(id: string, pattern: string): JobSchedulerJson {
  return { key: id, name: id, next: NEXT_RUN, pattern, iterationCount: 12 };
}

/** The part of a BullMQ Queue the cleanup uses, over an in-memory repeat set. */
function queueWith(entries: JobSchedulerJson[]) {
  const repeatSet = new Map(entries.map((entry) => [entry.key, entry]));
  return {
    name: "automation-actions",
    repeatSet,
    getJobSchedulers: async () => [...repeatSet.values()],
    removeJobScheduler: async (id: string) => repeatSet.delete(id),
  };
}

describe("removeLegacyRepeatableJobs", () => {
  it.each<[string, JobSchedulerJson]>([
    [
      "a BullMQ 5 repeatable job (md5 key, no iteration count)",
      {
        key: "ee622aa7a3e7de48f86831ede5b5a722",
        name: "send_report_notification",
        next: NEXT_RUN,
        pattern: "0 0 * * *",
      },
    ],
    [
      "a BullMQ 5 repeatable job that a BullMQ 6 worker already ran (md5 key, counted)",
      {
        key: "5b539185f9e5c8a2c6990bb035f6f68c",
        name: "pmm_hourly_check",
        next: NEXT_RUN,
        pattern: "0 * * * *",
        iterationCount: 3,
      },
    ],
    [
      "an entry without the iteration count every job scheduler has",
      {
        key: "send_vendor_notification",
        name: "send_vendor_notification",
        next: NEXT_RUN,
        pattern: "0 0 * * *",
      },
    ],
  ])("removes %s", async (_label, legacy) => {
    const queue = queueWith([legacy, scheduler("send_report_notification", "0 0 * * *")]);

    await removeLegacyRepeatableJobs(queue);

    expect([...queue.repeatSet.keys()]).toEqual(["send_report_notification"]);
  });

  it("leaves job schedulers alone", async () => {
    const queue = queueWith([
      scheduler("send_report_notification", "0 0 * * *"),
      scheduler("extension_sync_tick", "*/5 * * * *"),
    ]);

    await removeLegacyRepeatableJobs(queue);

    expect([...queue.repeatSet.keys()]).toEqual([
      "send_report_notification",
      "extension_sync_tick",
    ]);
  });
});
