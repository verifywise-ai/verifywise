/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * useReporting — React Query hooks for the enterprise reporting feature.
 *
 * Wraps the reporting repository (templates, scheduled reports, runs) with
 * query/mutation hooks and cache invalidation.
 *
 * @module application/hooks/useReporting
 */

import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import * as repo from "../repository/reporting.repository";
import type {
  ReportRun,
  ReportTemplateWriteBody,
  ScheduledReportUpdateBody,
} from "../../domain/interfaces/i.reporting";

export const useTemplates = () =>
  useQuery({
    queryKey: ["reporting", "templates"],
    queryFn: repo.getTemplates,
    staleTime: 5 * 60 * 1000,
  });

export const useScheduledReports = () =>
  useQuery({ queryKey: ["reporting", "scheduled"], queryFn: repo.getScheduledReports });

type RunPageParams = {
  scheduledReportId?: number;
  archived?: boolean;
  limit?: number;
  offset?: number;
};

// Poll while any run in the page is still running, then stop. A report can take
// minutes, and without this the archive silently shows a stale "running"
// forever.
const runsRefetchInterval = (query: { state: { data?: { rows?: ReportRun[] } } }) =>
  (query.state.data?.rows ?? []).some((r) => r.status === "running") ? 5000 : false;

/**
 * Runs as a plain array.
 *
 * GET /reporting/runs became paginated in Phase 4 and now returns
 * {rows, total, limit, offset}. `select` unwraps it so existing consumers that
 * do `runs.length` / `runs.map` keep working — the endpoint changed shape, the
 * hook's contract deliberately did not. Use useReportRunsPage when you need the
 * total.
 */
export const useReportRuns = (params?: RunPageParams) =>
  useQuery({
    queryKey: ["reporting", "runs", params ?? {}],
    queryFn: () => repo.getRuns(params),
    select: (page) => page.rows,
    refetchInterval: runsRefetchInterval,
  });

/**
 * Runs with pagination metadata, for callers that render a pager.
 *
 * keepPreviousData: each offset is a new query key, so without it every page
 * change drops to `isLoading` and the whole table — pager included — flashes to
 * a spinner. Holding the previous page until the next arrives keeps the pager
 * on screen and stable to click.
 */
export const useReportRunsPage = (params?: RunPageParams) =>
  useQuery({
    queryKey: ["reporting", "runs", params ?? {}],
    queryFn: () => repo.getRuns(params),
    placeholderData: keepPreviousData,
    refetchInterval: runsRefetchInterval,
  });

export const useCreateScheduledReport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: repo.createScheduledReport,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reporting", "scheduled"] }),
  });
};

export const useRunNow = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => repo.runScheduledReportNow(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reporting", "runs"] });
      qc.invalidateQueries({ queryKey: ["reporting", "scheduled"] });
    },
  });
};

export const useSetActive = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      repo.setScheduledReportActive(id, active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reporting", "scheduled"] }),
  });
};

// Poll a single report run until it leaves the "running" state.
// v5 refetchInterval: return false to stop polling once terminal.
export const useReportRun = (id: number | undefined, enabled: boolean) =>
  useQuery({
    queryKey: ["reporting", "run", id],
    queryFn: () => repo.getReportRun(id as number),
    enabled: enabled && id != null,
    refetchInterval: (query) =>
      query.state.data && query.state.data.status !== "running" ? false : 2000,
  });

// Enqueue an async report generation; returns { runId }.
export const useGenerateReport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: repo.generateReportV2,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reporting", "runs"] }),
  });
};

// The catalog is static server-side data; cache it hard.
export const useSectionCatalog = () =>
  useQuery({
    queryKey: ["reporting", "sections"],
    queryFn: repo.getSectionCatalog,
    staleTime: 60 * 60 * 1000,
  });

export const useCreateTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: repo.createTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reporting", "templates"] }),
  });
};

export const useUpdateTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: ReportTemplateWriteBody }) =>
      repo.updateTemplate(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reporting", "templates"] }),
  });
};

export const useArchiveTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => repo.archiveTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reporting", "templates"] }),
  });
};

// Analyses are written once when the run completes and never change after,
// so there is nothing to poll for.
export const useRunAnalyses = (runId: number | undefined) =>
  useQuery({
    queryKey: ["reporting", "run-analyses", runId],
    queryFn: () => repo.getRunAnalyses(runId as number),
    enabled: runId != null,
  });

export const useUpdateScheduledReport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: ScheduledReportUpdateBody }) =>
      repo.updateScheduledReport(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reporting", "scheduled"] }),
  });
};

export const useDeleteScheduledReport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => repo.deleteScheduledReport(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reporting", "scheduled"] }),
  });
};

// All three invalidate the whole runs key: an archive moves a row between two
// cached lists, so refreshing only one leaves the other stale.
const useRunMutation = (fn: (id: number) => Promise<unknown>) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reporting", "runs"] }),
  });
};

export const useArchiveRun = () => useRunMutation(repo.archiveRun);
export const useRestoreRun = () => useRunMutation(repo.restoreRun);
export const useDeleteRun = () => useRunMutation(repo.deleteRun);
