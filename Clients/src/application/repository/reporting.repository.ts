/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Reporting Repository
 *
 * Application layer wrapper for the enterprise reporting backend endpoints
 * (templates, scheduled reports, runs). Uses the shared `apiServices` client
 * whose axios baseURL already includes `/api`.
 *
 * @module application/repository/reporting
 */

import { apiServices } from "../../infrastructure/api/networkServices";
import type {
  GenerateReportRequestBody,
  GenerateReportResponse,
  ReportRun,
} from "../../domain/interfaces/i.reporting";

// Backend responses are wrapped as { data: <payload> }; apiServices already
// returns { data: response.data, ... }, so the payload is at r.data.data.
const extract = <T,>(r: any): T => (r?.data?.data ?? r?.data) as T;

export async function getTemplates(): Promise<any[]> {
  return extract(await apiServices.get("/reporting/templates"));
}
export async function getTemplate(id: number): Promise<any> {
  return extract(await apiServices.get(`/reporting/templates/${id}`));
}
export async function getScheduledReports(): Promise<any[]> {
  return extract(await apiServices.get("/reporting/scheduled-reports"));
}
export async function createScheduledReport(body: any): Promise<any> {
  return extract(await apiServices.post("/reporting/scheduled-reports", body));
}
export async function runScheduledReportNow(id: number): Promise<any> {
  return extract(await apiServices.post(`/reporting/scheduled-reports/${id}/run-now`, {}));
}
export async function setScheduledReportActive(id: number, active: boolean): Promise<any> {
  return extract(
    await apiServices.post(`/reporting/scheduled-reports/${id}/${active ? "resume" : "pause"}`, {}),
  );
}
export async function getRuns(params?: { scheduledReportId?: number }): Promise<any[]> {
  const qs = params?.scheduledReportId ? `?scheduledReportId=${params.scheduledReportId}` : "";
  return extract(await apiServices.get(`/reporting/runs${qs}`));
}

// Org-scoped report file download (NOT file-manager, which has its own RBAC and 403s here).
export async function downloadReportRun(id: number): Promise<Blob> {
  const r: any = await apiServices.get(`/reporting/runs/${id}/download`, { responseType: "blob" });
  return r.data as Blob;
}

// Enqueue an async report generation; returns the run id to poll.
export async function generateReportV2(
  body: GenerateReportRequestBody,
): Promise<GenerateReportResponse> {
  return extract(await apiServices.post("/reporting/v2/generate-report", body));
}

// Fetch a single run (org-scoped) for status polling.
export async function getReportRun(id: number): Promise<ReportRun> {
  return extract(await apiServices.get(`/reporting/runs/${id}`));
}
