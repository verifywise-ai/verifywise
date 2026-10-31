import { apiServices } from "../../infrastructure/api/networkServices";
import { APIError } from "../tools/error";
import {
  AcceptFindingBody,
  AcceptedVendorRisk,
  DismissReason,
  FindingStatus,
  VendorResearchConfig,
  VendorResearchRun,
  VendorResearchSettings,
  VendorRiskFinding,
} from "../../domain/interfaces/i.vendorResearch";

function extractData<T>(response: { data: { data: T } }): T {
  return response.data.data;
}

/**
 * `apiServices` rejects with a `CustomException`: `.message` is the backend's
 * message, `.status` the HTTP status, and `.response` the response *body*, not
 * the response object. The screen needs more than the message (a 409 on start
 * means the LLM key is missing, a 429 means wait), so the status goes on the
 * APIError and the exception stays reachable as `originalError`, where
 * `readVendorResearchError` reads the body.
 */
function toAPIError(error: unknown, fallback: string): APIError {
  const failure = error as { message?: string; status?: number } | null | undefined;
  return new APIError(failure?.message || fallback, failure?.status, error);
}

export async function getVendorResearchConfig(): Promise<VendorResearchConfig> {
  try {
    const response = await apiServices.get<{ message: string; data: VendorResearchConfig }>(
      "/vendor-research/config",
    );
    return extractData<VendorResearchConfig>(response);
  } catch (error) {
    throw toAPIError(error, "Failed to fetch the vendor research settings");
  }
}

/** The keys an Admin chose for the research, `null` where the default applies. Admin only. */
export async function getVendorResearchSettings(): Promise<VendorResearchSettings> {
  try {
    const response = await apiServices.get<{ message: string; data: VendorResearchSettings }>(
      "/vendor-research/settings",
    );
    return extractData<VendorResearchSettings>(response);
  } catch (error) {
    throw toAPIError(error, "Failed to fetch the research settings");
  }
}

/**
 * Both fields are always sent (the server takes a whole choice, and `null` is a choice), and the
 * answer is what it kept. A key that is not the organization's is a 404.
 */
export async function saveVendorResearchSettings(
  settings: VendorResearchSettings,
): Promise<VendorResearchSettings> {
  try {
    const response = await apiServices.put<{ message: string; data: VendorResearchSettings }>(
      "/vendor-research/settings",
      settings,
    );
    return extractData<VendorResearchSettings>(response);
  } catch (error) {
    throw toAPIError(error, "Failed to save the research settings");
  }
}

export async function listVendorRiskFindings(params: {
  status?: FindingStatus;
  vendorId?: number;
  limit?: number;
  offset?: number;
}): Promise<{ rows: VendorRiskFinding[]; total: number }> {
  // A parameter is sent when it is set, so `offset: 0` is sent too.
  const query = new URLSearchParams();
  if (params.status !== undefined) query.set("status", params.status);
  if (params.vendorId !== undefined) query.set("vendorId", String(params.vendorId));
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  const queryString = query.toString();

  try {
    const response = await apiServices.get<{
      message: string;
      data: { rows: VendorRiskFinding[]; total: number };
    }>(`/vendor-risk-findings${queryString ? `?${queryString}` : ""}`);
    return extractData<{ rows: VendorRiskFinding[]; total: number }>(response);
  } catch (error) {
    throw toAPIError(error, "Failed to fetch the research findings");
  }
}

/** `alreadyRunning` is true when the vendor has an active run, which is returned instead. */
export async function startVendorResearch(
  vendorId: number,
): Promise<{ run: VendorResearchRun; alreadyRunning: boolean }> {
  try {
    const response = await apiServices.post<{
      message: string;
      data: { run: VendorResearchRun; alreadyRunning: boolean };
    }>(`/vendors/${vendorId}/research`, {});
    return extractData<{ run: VendorResearchRun; alreadyRunning: boolean }>(response);
  } catch (error) {
    throw toAPIError(error, "Failed to start the research");
  }
}

/** `null` for a vendor that has never been researched. */
export async function getLatestVendorResearch(vendorId: number): Promise<VendorResearchRun | null> {
  try {
    const response = await apiServices.get<{ message: string; data: VendorResearchRun | null }>(
      `/vendors/${vendorId}/research/latest`,
    );
    return extractData<VendorResearchRun | null>(response) ?? null;
  } catch (error) {
    throw toAPIError(error, "Failed to fetch the latest research run");
  }
}

/**
 * `action_owner` absent means the vendor's assignee, `null` means nobody, and a
 * number is that user. The body is sent as it is, so the three stay apart. The
 * other fields are the person's edits (see AcceptFindingBody): the risk is
 * created from them, and from the finding for the fields that are absent.
 */
export async function acceptVendorRiskFinding(
  id: number,
  body: AcceptFindingBody,
): Promise<{ finding: VendorRiskFinding; vendorRisk: AcceptedVendorRisk }> {
  try {
    const response = await apiServices.post<{
      message: string;
      data: { finding: VendorRiskFinding; vendorRisk: AcceptedVendorRisk };
    }>(`/vendor-risk-findings/${id}/accept`, body);
    return extractData<{ finding: VendorRiskFinding; vendorRisk: AcceptedVendorRisk }>(response);
  } catch (error) {
    throw toAPIError(error, "Failed to accept the finding");
  }
}

export async function dismissVendorRiskFinding(
  id: number,
  body: { reason: DismissReason; note?: string | null },
): Promise<VendorRiskFinding> {
  try {
    const response = await apiServices.post<{ message: string; data: VendorRiskFinding }>(
      `/vendor-risk-findings/${id}/dismiss`,
      body,
    );
    return extractData<VendorRiskFinding>(response);
  } catch (error) {
    throw toAPIError(error, "Failed to dismiss the finding");
  }
}

/** What a failed research call tells the screen, beyond its message. */
export interface VendorResearchErrorDetail {
  status?: number;
  /**
   * `llm_key_missing` (409 on start), `cooldown` or `daily_cap` (429 on start). A 503 has no
   * code: tell it by the status. A 409 on accept or dismiss carries a sentence, not a code.
   */
  code?: string;
  /** The wait of a `cooldown`. */
  retryAfterSeconds?: number;
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;

/**
 * Reads the HTTP status and the machine-readable detail off what the functions
 * above throw. Anything else, such as an error from elsewhere, gives an empty
 * detail.
 */
export function readVendorResearchError(error: unknown): VendorResearchErrorDetail {
  if (!(error instanceof APIError)) return {};

  const detail: VendorResearchErrorDetail = {};
  if (typeof error.status === "number") detail.status = error.status;

  // `originalError.response` is the response body, `{ message, data }`; `data`
  // is an object only when the server sent a code.
  const data = asRecord(asRecord(asRecord(error.originalError)?.response)?.data);
  if (typeof data?.code === "string") detail.code = data.code;
  if (typeof data?.retryAfterSeconds === "number" && Number.isFinite(data.retryAfterSeconds)) {
    detail.retryAfterSeconds = data.retryAfterSeconds;
  }
  return detail;
}
