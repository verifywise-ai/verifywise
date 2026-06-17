import { apiServices } from "../../infrastructure/api/networkServices";

export interface DeadlineSummary {
  overdue: number;
  dueSoon: number;
  dueSoonDays: number;
}

interface DeadlineSummaryEnvelope {
  message?: string;
  data?: {
    tasks?: {
      overdue?: number;
      dueSoon?: number;
      threshold?: number;
    };
  };
}

/**
 * Retrieves the deadline summary (overdue + due-soon task counts) for the
 * current organization. Org scoping is handled server-side via the auth token.
 *
 * The backend response shape is `{ tasks: { overdue, dueSoon, threshold } }`;
 * this repo flattens it to the legacy `{ overdue, dueSoon, dueSoonDays }`
 * shape so consumers of `useDeadlineWarnings` don't need to change.
 *
 * @param {number} [days] - Optional due-soon window in days.
 * @returns {Promise<{ data: DeadlineSummary }>} The flattened summary payload.
 * @throws Will throw an error if the request fails.
 */
export async function getDeadlineSummary(days?: number): Promise<{ data: DeadlineSummary }> {
  const query = typeof days === "number" ? `?threshold=${days}` : "";
  const response = await apiServices.get(`/deadlines/summary${query}`);
  const body = response.data as DeadlineSummaryEnvelope;
  const tasks = body?.data?.tasks ?? {};
  return {
    data: {
      overdue: tasks.overdue ?? 0,
      dueSoon: tasks.dueSoon ?? 0,
      dueSoonDays: tasks.threshold ?? 0,
    },
  };
}
