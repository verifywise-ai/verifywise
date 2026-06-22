import { apiServices } from "../../infrastructure/api/networkServices";

const BASE_URL = "/ai-content";

export async function getBadges(entityType: string, entityId: number) {
  const response = await apiServices.get<any>(`${BASE_URL}/${entityType}/${entityId}`);
  return response.data;
}

export async function reviewContent(id: number, reviewAction: string, notes?: string) {
  const response = await apiServices.patch<any>(`${BASE_URL}/${id}/review`, {
    review_action: reviewAction,
    review_notes: notes,
  });
  return response.data;
}

export async function getUnreviewed(limit?: number, offset?: number) {
  const query = new URLSearchParams();
  if (limit) query.set("limit", String(limit));
  if (offset) query.set("offset", String(offset));
  const qs = query.toString();
  const response = await apiServices.get<any>(`${BASE_URL}/unreviewed${qs ? `?${qs}` : ""}`);
  return response.data;
}

export async function getStats() {
  const response = await apiServices.get<any>(`${BASE_URL}/stats`);
  return response.data;
}
