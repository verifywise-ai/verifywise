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
