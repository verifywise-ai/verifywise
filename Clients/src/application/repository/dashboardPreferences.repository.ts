import { apiServices } from "../../infrastructure/api/networkServices";

/** One widget's place in a saved dashboard layout. */
export interface DashboardLayoutEntry {
  widgetKey: string;
  visible: boolean;
  position: number;
}

export interface DashboardPreferences {
  /** null when the user has not saved a layout: the dashboard uses its default. */
  layout: DashboardLayoutEntry[] | null;
  updated_at: string | null;
}

const ROUTE = "/v1/dashboard/preferences";

// The dashboard waits for this response so it does not visibly rearrange, and
// a timeout falls back to the default layout. Hence far below the 120s default.
const FETCH_TIMEOUT_MS = 5000;

export async function getDashboardPreferences(): Promise<DashboardPreferences> {
  const response = await apiServices.get(ROUTE, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    // A failed read only means the default layout, not an error to announce.
    suppressGlobalErrorToast: true,
  });
  return (response.data as { data: DashboardPreferences }).data;
}

export async function updateDashboardPreferences(
  layout: DashboardLayoutEntry[],
): Promise<DashboardPreferences> {
  const response = await apiServices.put(ROUTE, { layout });
  return (response.data as { data: DashboardPreferences }).data;
}
