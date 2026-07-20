/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * useReporting — React Query hooks for the enterprise reporting feature.
 *
 * Wraps the reporting repository (templates, scheduled reports, runs) with
 * query/mutation hooks and cache invalidation.
 *
 * @module application/hooks/useReporting
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as repo from "../repository/reporting.repository";
import type {
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

// Polls while any run in the page is still running, then stops. A report can
// take minutes, and without this the archive silently shows a stale "running"
// forever.
export const useReportRuns = (params?: {
  scheduledReportId?: number;
  limit?: number;
  offset?: number;
}) =>
  useQuery({
    queryKey: ["reporting", "runs", params ?? {}],
    queryFn: () => repo.getRuns(params),
    refetchInterval: (query) => {
      const rows = query.state.data?.rows ?? [];
      return rows.some((r) => r.status === "running") ? 5000 : false;
    },
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
