import { executeManualRun } from "../reporting/manualReportRunner";
import type { ManualReportJobData } from "../reporting/reportJobConstants";

// Worker dispatch target for MANUAL_REPORT_JOB. Pure unpack → executeManualRun,
// which records its own success/failure on the run row.
export async function handleManualReportGeneration(data: ManualReportJobData): Promise<void> {
  await executeManualRun(data.runId, data.request, data.userId, data.organizationId);
}
