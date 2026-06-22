import { useQuery } from "@tanstack/react-query";
import {
  getAuditLog,
  getAuditAnalytics,
  type AuditLogFilters,
} from "../repository/aiAudit.repository";

const AUDIT_LOG_KEY = ["ai-audit-log"] as const;
const AUDIT_ANALYTICS_KEY = ["ai-audit-analytics"] as const;

export function useAuditLog(filters?: AuditLogFilters) {
  return useQuery({
    queryKey: [...AUDIT_LOG_KEY, filters],
    queryFn: () => getAuditLog(filters),
    staleTime: 3 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useAuditAnalytics(dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: [...AUDIT_ANALYTICS_KEY, dateFrom, dateTo],
    queryFn: () => getAuditAnalytics(dateFrom, dateTo),
    staleTime: 3 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
