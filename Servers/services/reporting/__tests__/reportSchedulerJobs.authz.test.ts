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

// owner_role is what findDueScheduledReportsQuery's LEFT JOIN on users/roles
// now carries. A fixture without it (owner_role absent) represents an owner
// row that vanished (deleted user); DUE_ADMIN_OWNED represents the common
// case this fix targets — an Admin's own org-scope schedule.
const DUE = {
  id: 11,
  organization_id: 1,
  owner_id: 9,
  owner_role: null,
  scope: "organization",
  project_id: null,
  next_run_at: new Date().toISOString(),
  schedule_config: { frequency: "daily", hour: 9, minute: 0 },
};

const DUE_ADMIN_OWNED = {
  ...DUE,
  id: 12,
  owner_id: 1,
  owner_role: "Admin",
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

  it("still runs the report when the scope check itself throws", async () => {
    // The claim is already consumed by markRunEnqueuedQuery before this check
    // runs, so a failure here (e.g. a DB blip in the membership lookup) must
    // not lose the slot: it must not throw out of the tick, and the report
    // must still be delivered.
    (findDueScheduledReportsQuery as jest.Mock).mockResolvedValue([DUE]);
    (assertReportScopeAllowed as jest.Mock).mockRejectedValue(new Error("connection blip"));

    await expect(handleReportSchedulerTick()).resolves.toBeUndefined();

    expect(runScheduledReport).toHaveBeenCalledTimes(1);
  });

  // assertReportScopeAllowed is fully mocked in this file, so a fixture
  // change alone proves nothing — the mock returns whatever it's told to
  // regardless of its arguments. What actually catches a regression to the
  // hard-coded `role: null` this replaces is asserting on the CALL
  // arguments: the tick must forward the joined owner_role, not discard it.
  it("passes the schedule owner's real role to the scope check, not null", async () => {
    (findDueScheduledReportsQuery as jest.Mock).mockResolvedValue([DUE_ADMIN_OWNED]);
    (assertReportScopeAllowed as jest.Mock).mockResolvedValue([]);

    await handleReportSchedulerTick();

    expect(assertReportScopeAllowed).toHaveBeenCalledWith(
      expect.objectContaining({ role: "Admin", userId: 1 }),
    );
  });

  it("falls back to role: null when the schedule has no owner_role (e.g. a deleted owner)", async () => {
    (findDueScheduledReportsQuery as jest.Mock).mockResolvedValue([DUE]);
    (assertReportScopeAllowed as jest.Mock).mockResolvedValue([]);

    await handleReportSchedulerTick();

    expect(assertReportScopeAllowed).toHaveBeenCalledWith(expect.objectContaining({ role: null }));
  });

  // The end-to-end case this fix exists for — an Admin's own org-scope
  // schedule must not warn — is covered against the REAL (unmocked)
  // reportScopeErrors rule in reportAuthorization.test.ts's own table (role:
  // "Admin", scope: "organization" → []), and against the real database in
  // report-scope-authorization.test.ts. This file's job is narrower: prove
  // the tick forwards the joined owner_role instead of discarding it, which
  // the two tests above do directly on the call arguments.
  it("still does not warn for an Admin-owned org-scope schedule when the scope check permits it", async () => {
    (findDueScheduledReportsQuery as jest.Mock).mockResolvedValue([DUE_ADMIN_OWNED]);
    (assertReportScopeAllowed as jest.Mock).mockResolvedValue([]);

    await handleReportSchedulerTick();

    expect(runScheduledReport).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
