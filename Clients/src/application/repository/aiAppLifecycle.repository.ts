import { apiServices } from "../../infrastructure/api/networkServices";
import type { LifecycleStage, LifecycleStageCounts } from "../../domain/enums/lifecycleStage.enum";
import type { PendingIntakeSubmissions } from "./useCaseLifecycle.repository";

/** AI app lifecycle API (#5193), under /api/v1/ai-app-lifecycle. */

export interface AiAppLifecycleSummary {
  counts: LifecycleStageCounts;
  stale_ids: number[];
  confirmation_interval_days: number;
}

export interface AiAppLifecycleState {
  id: number;
  owner: number | null;
  lifecycle_stage: LifecycleStage;
  go_live_date: string | null;
  retired_at: string | null;
  last_confirmed_at: string | null;
  last_confirmed_by: number | null;
  is_stale: boolean;
  confirmation_interval_days: number;
}

const BASE = "/v1/ai-app-lifecycle";
type Envelope<T> = { data: T };

export async function getAiAppLifecycleSummary(): Promise<AiAppLifecycleSummary> {
  const response = await apiServices.get<Envelope<AiAppLifecycleSummary>>(`${BASE}/summary`);
  return response.data.data;
}

/** Pending AI app intake requests, listed in the In review tab. */
export async function getPendingAiAppSubmissions(): Promise<PendingIntakeSubmissions> {
  const response = await apiServices.get<Envelope<PendingIntakeSubmissions>>(
    `${BASE}/intake-submissions`,
  );
  return response.data.data;
}

export async function getAiAppLifecycle(id: number): Promise<AiAppLifecycleState> {
  const response = await apiServices.get<Envelope<AiAppLifecycleState>>(`${BASE}/${id}`);
  return response.data.data;
}

/** `goLiveDate` is the user's local calendar date, YYYY-MM-DD. */
export async function markAiAppLive(id: number, goLiveDate: string): Promise<void> {
  await apiServices.post(`${BASE}/${id}/go-live`, { go_live_date: goLiveDate });
}

export async function retireAiApp(id: number): Promise<void> {
  await apiServices.post(`${BASE}/${id}/retire`);
}

export async function confirmAiAppStillLive(id: number): Promise<void> {
  await apiServices.post(`${BASE}/${id}/confirm`);
}
