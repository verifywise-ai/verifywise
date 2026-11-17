import { apiServices } from "../../infrastructure/api/networkServices";

/** Change notice API, under /api/v1/change-notices. */
const BASE = "/v1/change-notices";
type Envelope<T> = { data: T };

/** Asks whether the notice should be shown now; the server records the view when it says yes. */
export async function recordNoticeView(id: string): Promise<{ show: boolean }> {
  const response = await apiServices.post<Envelope<{ show: boolean }>>(
    `${BASE}/${encodeURIComponent(id)}/view`,
    {},
  );
  return response.data.data;
}

/** Dismisses a notice, or restores it (Undo) when dismissed is false. */
export async function setNoticeDismissed(
  id: string,
  dismissed: boolean,
): Promise<{ dismissed: boolean }> {
  const response = await apiServices.put<Envelope<{ dismissed: boolean }>>(
    `${BASE}/${encodeURIComponent(id)}/dismissed`,
    { dismissed },
  );
  return response.data.data;
}
