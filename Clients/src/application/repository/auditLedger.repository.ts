import CustomAxios from "../../infrastructure/api/customAxios";
import { filenameFromContentDisposition } from "../utils/contentDisposition";

/**
 * Longer than the client's 120 s default: the server streams large ledgers in
 * batches. Still bounded, so a server that never answers frees the button.
 */
const EXPORT_TIMEOUT_MS = 15 * 60 * 1000;

export interface AuditLedgerEntry {
  id: number;
  entry_type: "event_log" | "change_history";
  user_id: number | null;
  user_name: string | null;
  user_surname: string | null;
  occurred_at: string;
  event_type: string | null;
  entity_type: string | null;
  entity_id: number | null;
  action: string | null;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  description: string | null;
  entry_hash: string;
  prev_hash: string;
}

export interface AuditLedgerResponse {
  entries: AuditLedgerEntry[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface VerifyResult {
  status: "intact" | "compromised" | "empty" | "partial";
  totalEntries: number;
  brokenAtId?: number;
  expectedHash?: string;
  actualHash?: string;
  /** Set when retention has removed the oldest records; `cutoff` is an ISO date. */
  prunedThrough?: { id: number; cutoff: string };
}

interface GetAuditLedgerParams {
  limit?: number;
  offset?: number;
  entity_type?: string;
  entry_type?: string;
}

export async function getAuditLedger(
  params: GetAuditLedgerParams = {},
): Promise<AuditLedgerResponse> {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  if (params.entity_type) query.set("entity_type", String(params.entity_type));
  if (params.entry_type) query.set("entry_type", String(params.entry_type));

  const response = await CustomAxios.get(
    `/audit-ledger${query.toString() ? `?${query.toString()}` : ""}`,
  );
  return response.data.data;
}

export async function verifyAuditLedger(): Promise<VerifyResult> {
  const response = await CustomAxios.get("/audit-ledger/verify");
  return response.data.data;
}

export async function exportAuditLedger(
  params: Pick<GetAuditLedgerParams, "entity_type" | "entry_type"> = {},
  signal?: AbortSignal,
): Promise<{ blob: Blob; filename: string }> {
  const query = new URLSearchParams();
  if (params.entity_type) query.set("entity_type", params.entity_type);
  if (params.entry_type) query.set("entry_type", params.entry_type);
  const response = await CustomAxios.get(
    `/audit-ledger/export${query.toString() ? `?${query.toString()}` : ""}`,
    { responseType: "blob", timeout: EXPORT_TIMEOUT_MS, signal },
  );
  const fallback = `audit-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
  return {
    blob: response.data,
    filename: filenameFromContentDisposition(response.headers?.["content-disposition"], fallback),
  };
}
