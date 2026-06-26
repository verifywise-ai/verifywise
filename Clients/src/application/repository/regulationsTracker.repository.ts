// Clients/src/application/repository/regulationsTracker.repository.ts
import { apiServices } from "../../infrastructure/api/networkServices";

const BASE = "/regulations-tracker";

export async function getCountries(params: { region?: string; q?: string } = {}): Promise<any> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") qs.set(k, String(v));
  });
  const query = qs.toString();
  const response = await apiServices.get(`${BASE}/countries${query ? `?${query}` : ""}`);
  return response.data;
}

export async function getCountryDetail(slug: string): Promise<any> {
  const response = await apiServices.get(`${BASE}/countries/${encodeURIComponent(slug)}`);
  return response.data;
}

export async function getTracked(): Promise<any> {
  const response = await apiServices.get(`${BASE}/tracked`);
  return response.data;
}

export async function trackCountry(slug: string): Promise<any> {
  return (await apiServices.post(`${BASE}/tracked`, { slug })).data;
}

export async function trackBulk(slugs: string[]): Promise<any> {
  return (await apiServices.post(`${BASE}/tracked/bulk`, { slugs })).data;
}

export async function untrackCountry(slug: string): Promise<any> {
  return (await apiServices.delete(`${BASE}/tracked/${encodeURIComponent(slug)}`)).data;
}

export async function getSettings(): Promise<any> {
  return (await apiServices.get(`${BASE}/settings`)).data;
}

export async function updateSettings(body: {
  recipient_user_ids: number[];
  recipient_emails: string[];
}): Promise<any> {
  return (await apiServices.put(`${BASE}/settings`, body)).data;
}

export async function getHorizon(): Promise<any> {
  return (await apiServices.get(`${BASE}/horizon`)).data;
}

export async function getDeadlines(): Promise<any> {
  return (await apiServices.get(`${BASE}/deadlines`)).data;
}

export async function getFrameworks(): Promise<any> {
  return (await apiServices.get(`${BASE}/frameworks`)).data;
}
