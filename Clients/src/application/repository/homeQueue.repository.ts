import { apiServices } from "../../infrastructure/api/networkServices";
import type { HomeQueueResponse } from "../../domain/types/homeQueue.types";

/** Home action queue API, under /api/v1/home. */
const BASE = "/v1/home";
type Envelope<T> = { data: T };

/** What needs the signed-in user's action, plus the counts strip. */
export async function getHomeQueue(): Promise<HomeQueueResponse> {
  const response = await apiServices.get<Envelope<HomeQueueResponse>>(`${BASE}/queue`);
  return response.data.data;
}
