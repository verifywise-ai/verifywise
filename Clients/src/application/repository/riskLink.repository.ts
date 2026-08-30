import { apiServices } from "../../infrastructure/api/networkServices";
import { APIError } from "../tools/error";
import {
  CreateRiskLinkInput,
  DismissReason,
  RiskLink,
  RiskLinkStatus,
} from "../../domain/interfaces/i.riskLink";

function extractData<T>(response: { data: { data: T } }): T {
  return response.data.data;
}

/**
 * Deliberately unlike `policy.repository.ts`, which throws a hardcoded message
 * and reads `error.response.status`. `apiServices` rejects with a
 * `CustomException` whose `.message` is already the backend's message and whose
 * `.response` is the response *body*, not the response object — so
 * `.response.status` is always undefined there. The panel needs the real status
 * (409 vs 404) and the real message, so both are carried through.
 */
function toAPIError(error: any, fallback: string): APIError {
  return new APIError(error?.message || fallback, error?.status, error);
}

export async function getRiskLinks(
  riskId: number,
  status?: RiskLinkStatus,
): Promise<RiskLink[]> {
  try {
    const query = status ? `?status=${status}` : "";
    const response = await apiServices.get<{ message: string; data: RiskLink[] }>(
      `/riskLinks/${riskId}${query}`,
    );
    return extractData<RiskLink[]>(response);
  } catch (error: any) {
    throw toAPIError(error, "Failed to fetch linked risks");
  }
}

export async function createRiskLink(input: CreateRiskLinkInput): Promise<{ id: number }> {
  try {
    const response = await apiServices.post<{ message: string; data: { id: number } }>(
      "/riskLinks",
      input,
    );
    return extractData<{ id: number }>(response);
  } catch (error: any) {
    throw toAPIError(error, "Failed to create the link");
  }
}

/** `dismissal` is only ever accepted on a link that is currently `suggested`. */
export async function updateRiskLinkStatus(
  id: number,
  status: RiskLinkStatus,
  dismissal?: { dismissReason: DismissReason; dismissNote?: string },
): Promise<{ id: number; status: RiskLinkStatus }> {
  try {
    const response = await apiServices.patch<{
      message: string;
      data: { id: number; status: RiskLinkStatus };
    }>(`/riskLinks/${id}`, { status, ...dismissal });
    return extractData<{ id: number; status: RiskLinkStatus }>(response);
  } catch (error: any) {
    throw toAPIError(error, "Failed to update the link");
  }
}

export async function recomputeRiskLinks(): Promise<{ enqueued: number }> {
  try {
    const response = await apiServices.post<{
      message: string;
      data: { enqueued: number };
    }>("/riskLinks/recompute", {});
    return extractData<{ enqueued: number }>(response);
  } catch (error: any) {
    throw toAPIError(error, "Failed to start the scan");
  }
}

/**
 * Starts a direction pass over every cluster of related risks in the org.
 * `skipped` counts clusters too large for one model call.
 */
export async function suggestRiskHierarchy(): Promise<{
  enqueued: number;
  skipped: number;
}> {
  try {
    const response = await apiServices.post<{
      message: string;
      data: { enqueued: number; skipped: number };
    }>("/riskLinks/suggest-hierarchy", {});
    return extractData<{ enqueued: number; skipped: number }>(response);
  } catch (error: any) {
    throw toAPIError(error, "Failed to start the hierarchy suggestions");
  }
}
