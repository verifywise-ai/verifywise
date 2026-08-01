jest.mock("../../../utils/scheduledReport.utils", () => ({
  findDueScheduledReportsQuery: jest.fn(),
  markRunEnqueuedQuery: jest.fn(async () => true),
}));
jest.mock("../reportRunOrchestrator", () => ({ runScheduledReport: jest.fn(async () => ({})) }));
jest.mock("../scheduleCalculator", () => ({ computeNextRun: jest.fn(() => new Date()) }));
jest.mock("../reportAuthorization", () => ({ assertReportScopeAllowed: jest.fn(async () => []) }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { handleReportSchedulerTick } from "../reportSchedulerJobs";
import { findDueScheduledReportsQuery } from "../../../utils/scheduledReport.utils";
import { runScheduledReport } from "../reportRunOrchestrator";
import { assertReportScopeAllowed } from "../reportAuthorization";
import logger from "../../../utils/logger/fileLogger";

const DUE = {
  id: 11,
  organization_id: 1,
  owner_id: 9,
  scope: "organization",
  project_id: null,
  next_run_at: new Date().toISOString(),
  schedule_config: { frequency: "daily", hour: 9, minute: 0 },
};

beforeEach(() => jest.clearAllMocks());

describe("handleReportSchedulerTick scope warnings", () => {
  it("still runs a schedule that would no longer be permitted, and warns", async () => {
    // Decision: the rule gates creation and editing. A schedule that predates
    // it keeps delivering — nothing silently stops working on deploy — but it
    // is named in the log so someone can clean it up.
    (findDueScheduledReportsQuery as jest.Mock).mockResolvedValue([DUE]);
    (assertReportScopeAllowed as jest.Mock).mockResolvedValue([
      "organization-scope reports require the Admin role",
    ]);

    await handleReportSchedulerTick();

    expect(runScheduledReport).toHaveBeenCalledTimes(1);
    const warning = (logger.warn as jest.Mock).mock.calls.map((c) => String(c[0])).join(" ");
    expect(warning).toContain("11");
    expect(warning).toMatch(/Admin/);
  });

  it("does not warn for a schedule that is still permitted", async () => {
    (findDueScheduledReportsQuery as jest.Mock).mockResolvedValue([DUE]);
    (assertReportScopeAllowed as jest.Mock).mockResolvedValue([]);

    await handleReportSchedulerTick();

    expect(runScheduledReport).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
