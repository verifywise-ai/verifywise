/**
 * @fileoverview addAllJobs, the scheduler registration every backend start runs
 *
 * Every start of every backend replica runs addAllJobs on the automation and
 * Slack queues. The automation queue also carries one-off jobs that users and
 * other replicas queued or are running (extension sync runs, manual reports,
 * emails, risk link recomputes), so a start has to leave them where they are.
 *
 * The real producers run here against an in-memory stand-in for BullMQ's Queue.
 * It keeps the BullMQ behaviour these tests depend on: jobs by id (an add with
 * an id in use is ignored), job schedulers by id (an upsert replaces one), and
 * obliterate, which deletes both.
 *
 * @module jobs/tests/producer
 */

interface MockJobRecord {
  name: string;
  data: unknown;
  state: string;
}

interface MockSchedulerRecord {
  key: string;
  name: string;
  next: number;
  pattern?: string;
  tz?: string;
  iterationCount?: number;
}

interface MockQueueState {
  name: string;
  jobs: Map<string, MockJobRecord>;
  schedulers: Map<string, MockSchedulerRecord>;
  getJobSchedulers(): Promise<MockSchedulerRecord[]>;
}

const mockQueues = new Map<string, MockQueueState>();

jest.mock("bullmq", () => {
  class FakeQueue {
    jobs = new Map<string, MockJobRecord>();
    schedulers = new Map<string, MockSchedulerRecord>();
    private lastId = 0;

    constructor(public name: string) {
      mockQueues.set(name, this);
    }

    async add(name: string, data: unknown, opts: { jobId?: string } = {}) {
      const id = opts.jobId ?? String(++this.lastId);
      if (!this.jobs.has(id)) this.jobs.set(id, { name, data, state: "waiting" });
      return this.jobHandle(id);
    }

    async getJob(id: string) {
      return this.jobs.has(id) ? this.jobHandle(id) : undefined;
    }

    async upsertJobScheduler(
      id: string,
      repeat: { pattern: string; tz?: string },
      template: { name: string },
    ) {
      const iterationCount = this.schedulers.get(id)?.iterationCount ?? 1;
      this.schedulers.set(id, {
        key: id,
        name: template.name,
        next: Date.now() + 60_000,
        ...repeat,
        iterationCount,
      });
    }

    async getJobSchedulers() {
      return [...this.schedulers.values()];
    }

    async removeJobScheduler(id: string) {
      return this.schedulers.delete(id);
    }

    async obliterate() {
      this.jobs.clear();
      this.schedulers.clear();
    }

    private jobHandle(id: string) {
      return {
        id,
        getState: async () => this.jobs.get(id)?.state ?? "unknown",
        remove: async () => {
          this.jobs.delete(id);
        },
      };
    }
  }
  return { Queue: jest.fn().mockImplementation((name: string) => new FakeQueue(name)) };
});

jest.mock("../../database/redis", () => ({
  REDIS_URL: "redis://localhost:6379",
}));

jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { addAllJobs } from "../producer";
import {
  enqueueAutomationAction,
  enqueueExtensionSyncRun,
  enqueueRiskLinkRecompute,
} from "../../services/automations/automationProducer";

function queue(name: string): MockQueueState {
  const found = mockQueues.get(name);
  if (!found) throw new Error(`queue ${name} was never created`);
  return found;
}

const automationQueue = () => queue("automation-actions");
const slackQueue = () => queue("slack-notifications");

// The keys BullMQ 5's Queue.add(name, data, { repeat: { pattern } }) stored the
// schedules under: md5 of `name:jobId:endDate:tz:pattern`.
const BULLMQ5_REPORT_NOTIFICATION_KEY = "ee622aa7a3e7de48f86831ede5b5a722"; // send_report_notification::::0 0 * * *
const BULLMQ5_SLACK_POLICY_KEY = "8681a526dd19fcc26cca0f74aab804e6"; // slack-notification-policy::::0 9 * * *

describe("addAllJobs", () => {
  beforeEach(() => {
    for (const state of mockQueues.values()) {
      state.jobs.clear();
      state.schedulers.clear();
    }
  });

  it("leaves the one-off jobs that are queued or running where they are", async () => {
    await enqueueExtensionSyncRun({
      key: "jira-assets",
      orgId: 5,
      kind: "manual",
      triggeredBy: 8,
      payload: null,
    });
    const report = await enqueueAutomationAction("generate_report_manual", { runId: 77 });
    const email = await enqueueAutomationAction("send_email", { to: ["a@example.com"] });
    await enqueueRiskLinkRecompute(5, 42);
    automationQueue().jobs.get("ext-sync-jira-assets-5")!.state = "active"; // on another replica

    await addAllJobs();

    expect([...automationQueue().jobs.keys()].sort()).toEqual(
      ["ext-sync-jira-assets-5", report.id, email.id, "risk-link:5:42"].sort(),
    );
  });

  it("keeps every scheduler registered when it runs again", async () => {
    await addAllJobs();
    await addAllJobs(); // a restart, or a second replica starting

    expect([...automationQueue().schedulers.keys()]).toEqual(
      expect.arrayContaining([
        "send_vendor_notification",
        "send_policy_due_soon_notification",
        "send_report_notification",
        "extension_sync_tick",
      ]),
    );
    expect([...slackQueue().schedulers.keys()]).toEqual(["slack-notification-policy"]);
  });

  it("removes the repeatable jobs BullMQ 5 left, and keeps the schedulers that replace them", async () => {
    automationQueue().schedulers.set(BULLMQ5_REPORT_NOTIFICATION_KEY, {
      key: BULLMQ5_REPORT_NOTIFICATION_KEY,
      name: "send_report_notification",
      next: Date.now() + 60_000,
      pattern: "0 0 * * *",
    });
    slackQueue().schedulers.set(BULLMQ5_SLACK_POLICY_KEY, {
      key: BULLMQ5_SLACK_POLICY_KEY,
      name: "slack-notification-policy",
      next: Date.now() + 60_000,
      pattern: "0 9 * * *",
    });

    await addAllJobs();

    const automationSchedulers = [...automationQueue().schedulers.keys()];
    expect(automationSchedulers).not.toContain(BULLMQ5_REPORT_NOTIFICATION_KEY);
    expect(automationSchedulers).toContain("send_report_notification");
    expect([...slackQueue().schedulers.keys()]).toEqual(["slack-notification-policy"]);
  });

  it("still registers the schedulers when the removal of BullMQ 5 jobs fails", async () => {
    const listing = jest
      .spyOn(automationQueue(), "getJobSchedulers")
      .mockRejectedValueOnce(new Error("Connection is closed."));
    try {
      await addAllJobs();
    } finally {
      listing.mockRestore();
    }

    expect([...automationQueue().schedulers.keys()]).toEqual(
      expect.arrayContaining(["send_vendor_notification", "extension_sync_tick"]),
    );
  });
});
