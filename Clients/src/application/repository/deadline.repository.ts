import { apiServices } from "../../infrastructure/api/networkServices";

export interface DeadlineSummary {
  overdue: number;
  dueSoon: number;
  dueSoonDays: number;
}

/**
 * Retrieves the deadline summary (overdue + due-soon task counts) for the
 * current organization. Org scoping is handled server-side via the auth token.
 *
 * @param {number} [days] - Optional due-soon window in days (defaults to backend's 7).
 * @returns {Promise<{ data: DeadlineSummary }>} The wrapped summary payload.
 * @throws Will throw an error if the request fails.
 */
export async function getDeadlineSummary(days?: number): Promise<{ data: DeadlineSummary }> {
  const query = typeof days === "number" ? `?days=${days}` : "";
  const response = await apiServices.get(`/deadlines/summary${query}`);
  return response.data as { data: DeadlineSummary };
}
