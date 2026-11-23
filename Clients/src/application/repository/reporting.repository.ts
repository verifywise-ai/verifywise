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
  LastReportParameters,
  ReportRunPage,
  ReportSectionCatalogEntry,
  ReportTemplate,
  ReportTemplateWriteBody,
  ScheduledReportUpdateBody,
} from "../../domain/interfaces/i.reporting";

// Backend responses are wrapped as { data: <payload> }; apiServices already
// returns { data: response.data, ... }, so the payload is at r.data.data.
const extract = <T>(r: any): T => (r?.data?.data ?? r?.data) as T;

// The run wizard and the schedule edit dialog show the server's own 400
// messages (missing or invalid report details), so the global toast, which
// would only say "Bad Request", is not wanted on these writes.
const OWN_ERROR_UI = { suppressGlobalErrorToast: true };

export async function getTemplates(): Promise<any[]> {
  return extract(await apiServices.get("/reporting/templates"));
}
export async function getTemplate(id: number): Promise<any> {
  return extract(await apiServices.get(`/reporting/templates/${id}`));
}
export async function getScheduledReports(): Promise<any[]> {
  return extract(await apiServices.get("/reporting/scheduled-reports"));
}
// v1 accepts reportParameters and the quarterly frequency.
export async function createScheduledReport(body: any): Promise<any> {
  return extract(await apiServices.post("/v1/scheduled-reports", body, OWN_ERROR_UI));
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
  return extract(await apiServices.patch(`/v1/scheduled-reports/${id}`, body, OWN_ERROR_UI));
}

// The backend soft-delete endpoint has existed since the reporting MVP with no
// frontend caller, so a scheduled report could never be removed from the UI.
export async function deleteScheduledReport(id: number): Promise<{ ok: boolean }> {
  return extract(await apiServices.delete(`/reporting/scheduled-reports/${id}`));
}

export async function getRuns(params?: {
  scheduledReportId?: number;
  archived?: boolean;
  limit?: number;
  offset?: number;
}): Promise<ReportRunPage> {
  const qs = new URLSearchParams();
  if (params?.scheduledReportId) qs.set("scheduledReportId", String(params.scheduledReportId));
  // Explicit check: `false` is meaningful here and must still be sent.
  if (params?.archived !== undefined) qs.set("archived", String(params.archived));
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  const suffix = qs.toString() ? `?${qs}` : "";
  return extract(await apiServices.get(`/reporting/runs${suffix}`));
}

export async function archiveRun(id: number) {
  return extract(await apiServices.patch(`/reporting/runs/${id}/archive`, {}));
}

export async function restoreRun(id: number) {
  return extract(await apiServices.patch(`/reporting/runs/${id}/restore`, {}));
}

export async function deleteRun(id: number) {
  return extract(await apiServices.delete(`/reporting/runs/${id}`));
}

// Org-scoped report file download (NOT file-manager, which has its own RBAC and 403s here).
export async function downloadReportRun(id: number): Promise<Blob> {
  const r: any = await apiServices.get(`/reporting/runs/${id}/download`, { responseType: "blob" });
  return r.data as Blob;
}

// The internal fix-it list stored beside an OSFI E-23 report; same checks as the download above.
export async function downloadReportRunFixItList(id: number): Promise<Blob> {
  const r: any = await apiServices.get(`/v1/report-runs/${id}/download/fix-it-list`, {
    responseType: "blob",
  });
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

// Template writes go through v1, which accepts parameters_config (the report
// kind); the legacy /reporting/templates writes are frozen and drop it.
export async function createTemplate(body: ReportTemplateWriteBody): Promise<ReportTemplate> {
  return extract(await apiServices.post("/v1/report-templates", body));
}

export async function updateTemplate(
  id: number,
  body: ReportTemplateWriteBody,
): Promise<ReportTemplate> {
  return extract(await apiServices.patch(`/v1/report-templates/${id}`, body));
}

// Server-side copy into the caller's organization, carrying the latest
// version's sections, AI blocks, framework selection and report kind.
export async function duplicateTemplate(id: number): Promise<ReportTemplate> {
  return extract(await apiServices.post(`/v1/report-templates/${id}/duplicate`, {}));
}

export async function archiveTemplate(id: number): Promise<{ ok: boolean }> {
  return extract(await apiServices.delete(`/reporting/templates/${id}`));
}

export async function runTemplateNow(id: number, body: Record<string, unknown>) {
  return extract(await apiServices.post(`/v1/report-templates/${id}/run`, body, OWN_ERROR_UI));
}

// The answers from this template's latest successful run in the organization,
// period and final flag left out; null when it has never run. Not `extract`:
// it would turn a null payload into the whole envelope.
export async function getLastReportParameters(id: number): Promise<LastReportParameters | null> {
  const r: any = await apiServices.get(`/v1/report-templates/${id}/last-parameters`, OWN_ERROR_UI);
  return (r?.data?.data ?? null) as LastReportParameters | null;
}

export async function getRunAnalyses(runId: number): Promise<ReportRunAnalysis[]> {
  return extract(await apiServices.get(`/reporting/runs/${runId}/analyses`));
}
