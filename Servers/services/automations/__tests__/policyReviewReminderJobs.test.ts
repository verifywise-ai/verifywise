/**
 * Automation worker dispatch for policy review reminders (P-H3): the new sweep
 * job runs the sweep, and the retired due soon job completes without sending.
 */
const mockSweep = jest.fn();

jest.mock("bullmq", () => ({
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn() })),
  Queue: jest.fn().mockImplementation(() => ({ add: jest.fn(), on: jest.fn() })),
}));
jest.mock("../actions/policyReviewReminderSweep", () => ({
  runPolicyReviewReminderSweepAllOrgs: (...args: unknown[]) => mockSweep(...args),
}));
jest.mock("../automationProducer", () => ({
  automationQueue: { add: jest.fn(), obliterate: jest.fn() },
  enqueueAutomationAction: jest.fn(),
}));
jest.mock("../../../utils/organization.utils", () => ({
  getAllOrganizationsQuery: jest.fn().mockResolvedValue([]),
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
  __esModule: true,
}));

import { Worker, Job } from "bullmq";
import { createAutomationWorker } from "../automationWorker";
import logger from "../../../utils/logger/fileLogger";

const processor = () => {
  createAutomationWorker();
  return (Worker as unknown as jest.Mock).mock.calls[0][1] as (job: Job) => Promise<unknown>;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSweep.mockResolvedValue(undefined);
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

describe("automation worker policy review reminder jobs", () => {
  it("runs the sweep for policy_review_reminder_sweep", async () => {
    await processor()({ name: "policy_review_reminder_sweep", data: {} } as Job);

    expect(mockSweep).toHaveBeenCalledTimes(1);
  });

  it("completes a retired send_policy_due_soon_notification job without sending", async () => {
    await processor()({ name: "send_policy_due_soon_notification", data: {} } as Job);

    expect(mockSweep).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      "Skipping retired job send_policy_due_soon_notification",
    );
  });
});
