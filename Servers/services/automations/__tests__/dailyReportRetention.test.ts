/**
 * The daily scheduled report email is queued as its own one-off job. It sets
 * removeOnComplete/removeOnFail itself, which replaces the queue defaults, so a
 * failed copy (the automation, project details, the owner's name) must still
 * carry the same failed-job cap as every other job, not be kept for good.
 */

jest.mock("bullmq", () => ({
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn() })),
  Queue: jest.fn(),
}));

jest.mock("../automationProducer", () => ({
  automationQueue: { add: jest.fn(), obliterate: jest.fn() },
  enqueueAutomationAction: jest.fn(),
  enqueueRiskLinkRecompute: jest.fn(),
  enqueueVendorRiskLinkRecompute: jest.fn(),
  FAILED_JOB_RETENTION: { age: 7 * 24 * 60 * 60, count: 5000 },
}));

jest.mock("../../../database/db", () => ({ sequelize: { query: jest.fn() } }));

jest.mock("../../../utils/organization.utils", () => ({
  getAllOrganizationsQuery: jest.fn(),
}));

jest.mock("../../intakeScoring/assessmentJob", () => ({
  backfillIntakeAssessments: jest.fn().mockResolvedValue(0),
  runIntakeAssessment: jest.fn(),
  sendIntakeNotificationOnce: jest.fn(),
}));

jest.mock("../../intakeConfirmation/confirmation", () => ({
  sweepSubmitterConfirmations: jest.fn().mockResolvedValue(0),
  trySendSubmitterConfirmation: jest.fn(),
}));

jest.mock("../../../utils/automationExecutionLog.utils", () => ({
  logAutomationExecution: jest.fn(),
}));

jest.mock("../../../utils/logger/fileLogger", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
  __esModule: true,
}));

import { Worker } from "bullmq";
import { createAutomationWorker } from "../automationWorker";
import { enqueueAutomationAction, FAILED_JOB_RETENTION } from "../automationProducer";
import { sequelize } from "../../../database/db";
import { getAllOrganizationsQuery } from "../../../utils/organization.utils";

const mockEnqueue = enqueueAutomationAction as jest.Mock;
const mockQuery = sequelize.query as unknown as jest.Mock;

function captureProcessor(): (job: { name: string; data: unknown }) => Promise<unknown> {
  createAutomationWorker();
  const calls = (Worker as unknown as jest.Mock).mock.calls;
  return calls[calls.length - 1][1];
}

function queueOneReportAutomation(params: Record<string, unknown>) {
  (getAllOrganizationsQuery as jest.Mock).mockResolvedValue([{ id: 9 }]);
  mockQuery
    .mockResolvedValueOnce([
      [{ id: 41, automation_id: 40, automation_params: params, user_id: 3 }],
      1,
    ])
    .mockResolvedValueOnce([
      [{ project_title: "P", owner: 3, framework_id: 1, project_framework_id: 2 }],
      1,
    ])
    .mockResolvedValueOnce([[{ full_name: "Ada Lovelace" }], 1])
    .mockResolvedValueOnce([[{ organization_name: "Org" }], 1]);
}

describe("send_report_notification: the daily report job's retention", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
  });

  it("caps the failed copy of the daily report job like every other job", async () => {
    queueOneReportAutomation({ projectId: "5", reportType: ["x"], frequency: "daily", hour: 6 });
    const processor = captureProcessor();

    await processor({ name: "send_report_notification", data: {} });

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    const [name, data, options] = mockEnqueue.mock.calls[0];
    expect(name).toBe("send_report_notification_daily");
    expect((data as { full_name: string }).full_name).toBe("Ada Lovelace");
    expect(options.removeOnFail).toBe(FAILED_JOB_RETENTION);
    expect(options.removeOnFail).not.toBe(false);
    // The rest of the job is unchanged: no fixed jobId, removed once it succeeds.
    expect(options.jobId).toBeUndefined();
    expect(options.removeOnComplete).toBe(true);
    expect(options.runAt).toBeInstanceOf(Date);
    expect((options.runAt as Date).getHours()).toBe(6);
  });

  it("still queues nothing for a weekly report on another weekday (neighbour)", async () => {
    const otherDay = (new Date().getDay() + 1) % 7;
    queueOneReportAutomation({
      projectId: "5",
      reportType: ["x"],
      frequency: "weekly",
      dayOfWeek: otherDay,
    });
    const processor = captureProcessor();

    await processor({ name: "send_report_notification", data: {} });

    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
