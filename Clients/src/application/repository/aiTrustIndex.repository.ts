// Clients/src/application/repository/aiTrustIndex.repository.ts
import { apiServices } from "../../infrastructure/api/networkServices";

const BASE = "/ai-trust-index";

export async function getApps(
  params: {
    search?: string;
    category?: string;
    grade?: string;
    page?: number;
    pageSize?: number;
    sort?: string;
    dir?: "asc" | "desc";
  } = {},
): Promise<any> {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") q.set(k, String(v));
  });
  const response = await apiServices.get(`${BASE}/apps?${q.toString()}`);
  return response.data;
}

export async function getApp(slug: string): Promise<any> {
  const response = await apiServices.get(`${BASE}/apps/${encodeURIComponent(slug)}`);
  return response.data;
}

export async function getTracked(): Promise<any> {
  const response = await apiServices.get(`${BASE}/tracked`);
  return response.data;
}

export async function trackApp(slug: string): Promise<any> {
  return (await apiServices.post(`${BASE}/tracked`, { slug })).data;
}

export async function trackAppsBulk(slugs: string[]): Promise<any> {
  return (await apiServices.post(`${BASE}/tracked/bulk`, { slugs })).data;
}

export async function untrackApp(slug: string): Promise<any> {
  return (await apiServices.delete(`${BASE}/tracked/${encodeURIComponent(slug)}`)).data;
}

export async function getSettings(): Promise<any> {
  return (await apiServices.get(`${BASE}/settings`)).data;
}

export async function updateSettings(body: {
  recipientUserIds: number[];
  recipientEmails: string[];
}): Promise<any> {
  return (await apiServices.put(`${BASE}/settings`, body)).data;
}
