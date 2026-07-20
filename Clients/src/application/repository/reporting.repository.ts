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
  ReportRunAnalysis,
  ReportRunPage,
  ReportSectionCatalogEntry,
  ReportTemplate,
  ReportTemplateWriteBody,
  ScheduledReportUpdateBody,
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
export async function updateScheduledReport(
  id: number,
  body: ScheduledReportUpdateBody,
): Promise<unknown> {
  return extract(await apiServices.patch(`/reporting/scheduled-reports/${id}`, body));
}

// The backend soft-delete endpoint has existed since the reporting MVP with no
// frontend caller, so a scheduled report could never be removed from the UI.
export async function deleteScheduledReport(id: number): Promise<{ ok: boolean }> {
  return extract(await apiServices.delete(`/reporting/scheduled-reports/${id}`));
}

export async function getRuns(params?: {
  scheduledReportId?: number;
  limit?: number;
  offset?: number;
}): Promise<ReportRunPage> {
  const qs = new URLSearchParams();
  if (params?.scheduledReportId) qs.set("scheduledReportId", String(params.scheduledReportId));
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  const suffix = qs.toString() ? `?${qs}` : "";
  return extract(await apiServices.get(`/reporting/runs${suffix}`));
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

export async function getSectionCatalog(): Promise<ReportSectionCatalogEntry[]> {
  return extract(await apiServices.get("/reporting/sections"));
}

export async function createTemplate(
  body: ReportTemplateWriteBody,
): Promise<ReportTemplate> {
  return extract(await apiServices.post("/reporting/templates", body));
}

export async function updateTemplate(
  id: number,
  body: ReportTemplateWriteBody,
): Promise<ReportTemplate> {
  return extract(await apiServices.patch(`/reporting/templates/${id}`, body));
}

export async function archiveTemplate(id: number): Promise<{ ok: boolean }> {
  return extract(await apiServices.delete(`/reporting/templates/${id}`));
}

export async function getRunAnalyses(runId: number): Promise<ReportRunAnalysis[]> {
  return extract(await apiServices.get(`/reporting/runs/${runId}/analyses`));
}
