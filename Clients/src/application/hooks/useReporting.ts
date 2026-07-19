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

export const useTemplates = () =>
  useQuery({
    queryKey: ["reporting", "templates"],
    queryFn: repo.getTemplates,
    staleTime: 5 * 60 * 1000,
  });

export const useScheduledReports = () =>
  useQuery({ queryKey: ["reporting", "scheduled"], queryFn: repo.getScheduledReports });

export const useReportRuns = (scheduledReportId?: number) =>
  useQuery({
    queryKey: ["reporting", "runs", scheduledReportId],
    queryFn: () => repo.getRuns({ scheduledReportId }),
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
