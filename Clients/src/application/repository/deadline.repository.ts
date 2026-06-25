import { apiServices } from "../../infrastructure/api/networkServices";
import { ApiSuccessEnvelope } from "../../infrastructure/api/api.types";
import { DEADLINE_CONFIG } from "../config/deadlineConfig";

export interface DeadlineSummary {
  overdue: number;
  dueSoon: number;
  dueSoonDays: number;
}

/**
 * Retrieves the deadline summary (overdue + due-soon task counts) for the
 * current organization. Org scoping is handled server-side via the auth token.
 */
export async function getDeadlineSummary(days?: number): Promise<DeadlineSummary> {
  const params = typeof days === "number" ? { days } : undefined;
  const response = await apiServices.get<ApiSuccessEnvelope<DeadlineSummary>>(
    "/deadlines/summary",
    params ?? {},
  );
  const summary = response.data.data;

  return {
    overdue: summary?.overdue ?? 0,
    dueSoon: summary?.dueSoon ?? 0,
    dueSoonDays: summary?.dueSoonDays ?? DEADLINE_CONFIG.dueSoonDays,
  };
}
