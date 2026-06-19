const findDue = jest.fn(); const markEnqueued = jest.fn(); const runScheduledReport = jest.fn();
jest.mock("../../../utils/scheduledReport.utils", () => ({ findDueScheduledReportsQuery:(...a:any)=>findDue(...a), markRunEnqueuedQuery:(...a:any)=>markEnqueued(...a) }));
jest.mock("../reportRunOrchestrator", () => ({ runScheduledReport:(...a:any)=>runScheduledReport(...a) }));
import { handleReportSchedulerTick } from "../reportSchedulerJobs";

describe("handleReportSchedulerTick", () => {
  beforeEach(()=>{ findDue.mockReset(); markEnqueued.mockReset(); runScheduledReport.mockReset(); });
  it("runs each due report and advances next_run", async () => {
    findDue.mockResolvedValue([{ id: 3, schedule_config: { frequency:"daily", hour:9, minute:0, timezone:"UTC" } }]);
    await handleReportSchedulerTick();
    expect(runScheduledReport).toHaveBeenCalledTimes(1);
    expect(markEnqueued).toHaveBeenCalledTimes(1);
  });
  it("no due reports -> no runs", async () => {
    findDue.mockResolvedValue([]);
    await handleReportSchedulerTick();
    expect(runScheduledReport).not.toHaveBeenCalled();
  });
});
