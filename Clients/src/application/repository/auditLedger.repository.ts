import CustomAxios from "../../infrastructure/api/customAxios";

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
}

interface GetAuditLedgerParams {
  limit?: number;
  offset?: number;
  entity_type?: string;
  entry_type?: string;
}

export async function getAuditLedger(
  params: GetAuditLedgerParams = {}
): Promise<AuditLedgerResponse> {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  if (params.entity_type) query.set("entity_type", String(params.entity_type));
  if (params.entry_type) query.set("entry_type", String(params.entry_type));

  const response = await CustomAxios.get(
    `/audit-ledger${query.toString() ? `?${query.toString()}` : ""}`
  );
  return response.data.data;
}

export async function verifyAuditLedger(): Promise<VerifyResult> {
  const response = await CustomAxios.get("/audit-ledger/verify");
  return response.data.data;
}
