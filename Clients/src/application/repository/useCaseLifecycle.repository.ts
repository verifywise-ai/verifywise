import { apiServices } from "../../infrastructure/api/networkServices";
import type {
  ConfirmationIntervalDays,
  LifecycleStage,
  LifecycleStageCounts,
} from "../../domain/enums/lifecycleStage.enum";

/** Lifecycle API (#5187), all under /api/v1. */

export interface UseCaseLifecycleSummary {
  counts: LifecycleStageCounts;
  stale_ids: number[];
  confirmation_interval_days: number;
}

export interface LifecycleDashboardItem {
  id: number;
  title: string;
  stage: LifecycleStage;
  date: string | null;
}

export interface LifecycleBreakdownRow {
  label: string;
  count: number;
}

export interface UseCaseLifecycleDashboard {
  counts: LifecycleStageCounts;
  quarter: {
    start: string;
    end: string;
    going_live: LifecycleDashboardItem[];
    retired: LifecycleDashboardItem[];
  };
  live_by: {
    department: LifecycleBreakdownRow[];
    risk_tier: LifecycleBreakdownRow[];
    regulation: LifecycleBreakdownRow[];
  };
  stale: { total: number; items: LifecycleDashboardItem[] };
  confirmation_interval_days: number;
}

export interface UseCaseLifecycleState {
  id: number;
  lifecycle_stage: LifecycleStage;
  go_live_date: string | null;
  retired_at: string | null;
  last_confirmed_at: string | null;
  last_confirmed_by: number | null;
  department: string | null;
}

export interface LifecycleSettings {
  organization_id: number;
  confirmation_interval_days: ConfirmationIntervalDays;
}

const BASE = "/v1/use-case-lifecycle";
const SETTINGS = "/v1/lifecycle-settings";

type Envelope<T> = { data: T };

export async function getUseCaseLifecycleSummary(): Promise<UseCaseLifecycleSummary> {
  const response = await apiServices.get<Envelope<UseCaseLifecycleSummary>>(`${BASE}/summary`);
  return response.data.data;
}

export async function getUseCaseLifecycleDashboard(): Promise<UseCaseLifecycleDashboard> {
  const response = await apiServices.get<Envelope<UseCaseLifecycleDashboard>>(`${BASE}/dashboard`);
  return response.data.data;
}

export async function markUseCaseLive(
  id: number,
  goLiveDate?: string,
): Promise<UseCaseLifecycleState> {
  const response = await apiServices.post<Envelope<UseCaseLifecycleState>>(
    `${BASE}/${id}/go-live`,
    goLiveDate ? { go_live_date: goLiveDate } : {},
  );
  return response.data.data;
}

export async function retireUseCase(id: number): Promise<UseCaseLifecycleState> {
  const response = await apiServices.post<Envelope<UseCaseLifecycleState>>(`${BASE}/${id}/retire`);
  return response.data.data;
}

export async function confirmUseCaseStillLive(id: number): Promise<UseCaseLifecycleState> {
  const response = await apiServices.post<Envelope<UseCaseLifecycleState>>(`${BASE}/${id}/confirm`);
  return response.data.data;
}

export async function updateUseCaseDepartment(
  id: number,
  department: string | null,
): Promise<UseCaseLifecycleState> {
  const response = await apiServices.patch<Envelope<UseCaseLifecycleState>>(
    `${BASE}/${id}/department`,
    { department },
  );
  return response.data.data;
}

export async function getLifecycleSettings(): Promise<LifecycleSettings> {
  const response = await apiServices.get<Envelope<LifecycleSettings>>(SETTINGS);
  return response.data.data;
}

export async function updateLifecycleSettings(
  confirmationIntervalDays: ConfirmationIntervalDays,
): Promise<LifecycleSettings> {
  const response = await apiServices.patch<Envelope<LifecycleSettings>>(SETTINGS, {
    confirmation_interval_days: confirmationIntervalDays,
  });
  return response.data.data;
}
