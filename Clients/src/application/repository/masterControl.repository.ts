/**
 * Master Control repository — HTTP layer for the Controls Hub feature.
 *
 * Thin wrappers around `apiServices` for the nine endpoints backing the
 * master control CRUD + mappings + propagation preview. Repository functions
 * do not massage responses (mapping to domain models is the caller's job —
 * typically a React Query `select`).
 *
 * Backend contract: `Servers/routes/masterControl.route.ts` mounted at
 * `/api/master-controls`.
 */

import { apiServices } from "../../infrastructure/api/networkServices";
import type {
  Framework,
  FrameworkEntityType,
  MasterControlFrameworkMapping,
  MasterControlRiskReview,
  MasterControlStatus,
} from "../../domain/models/Common/masterControl/masterControl.model";

// ---------- Request shapes ----------

export interface MasterControlCreatePayload {
  title: string;
  description?: string | null;
  status?: MasterControlStatus;
  risk_review?: MasterControlRiskReview | null;
  owner?: number | null;
  reviewer?: number | null;
  approver?: number | null;
  due_date?: string | null;
  implementation_details?: string | null;
}

export type MasterControlUpdatePayload = Partial<MasterControlCreatePayload>;

export interface MasterControlBulkUpdatePayload {
  ids: number[];
  patch: MasterControlUpdatePayload;
}

export interface BulkUpdateRowResult {
  id: number;
  success: boolean;
  error?: string;
  master?: any;
  propagation?: PropagationResult[];
}

export interface BulkUpdateResponse {
  results: BulkUpdateRowResult[];
  summary: { total: number; updated: number; failed: number };
}

export interface MasterControlMappingCreatePayload {
  framework: Framework;
  framework_entity_type: FrameworkEntityType;
  framework_entity_id: number;
}

export interface PropagationPreviewPayload {
  status?: MasterControlStatus;
  owner?: number | null;
  reviewer?: number | null;
  approver?: number | null;
  due_date?: string | null;
  implementation_details?: string | null;
}

// ---------- Response shapes ----------

export interface PropagationResult {
  mappingId: number;
  framework: Framework;
  framework_entity_type: FrameworkEntityType;
  framework_entity_id: number;
  tenantTable: string;
  rowsUpdated: number;
  skipped: boolean;
  reason?: string;
}

export interface UpdateMasterControlResponse {
  master: any;
  propagation: PropagationResult[];
}

// ---------- Master Controls CRUD ----------

export async function getAllMasterControls({
  signal,
}: {
  signal?: AbortSignal;
} = {}): Promise<any> {
  const response = await apiServices.get("/master-controls", { signal });
  return response.data;
}

export async function getMasterControlById({
  id,
  signal,
}: {
  id: number;
  signal?: AbortSignal;
}): Promise<any> {
  const response = await apiServices.get(`/master-controls/${id}`, { signal });
  return response.data;
}

export async function createMasterControl({
  body,
}: {
  body: MasterControlCreatePayload;
}): Promise<any> {
  const response = await apiServices.post("/master-controls", body);
  return response.data;
}

export async function updateMasterControl({
  id,
  body,
}: {
  id: number;
  body: MasterControlUpdatePayload;
}): Promise<any> {
  const response = await apiServices.patch(`/master-controls/${id}`, body);
  return response.data;
}

export async function deleteMasterControl({
  id,
}: {
  id: number;
}): Promise<any> {
  const response = await apiServices.delete(`/master-controls/${id}`);
  return response.data;
}

export async function bulkUpdateMasterControls({
  body,
}: {
  body: MasterControlBulkUpdatePayload;
}): Promise<BulkUpdateResponse> {
  const response = await apiServices.patch("/master-controls/bulk", body);
  // apiServices.patch returns { data: { message, data } }
  return (response.data as any).data ?? response.data;
}

export interface MasterControlsCsvExport {
  blob: Blob;
  filename: string;
}

/** Downloads the master controls CSV for the current organization. */
export async function exportMasterControlsCsv({
  signal,
}: {
  signal?: AbortSignal;
} = {}): Promise<MasterControlsCsvExport> {
  const response = await apiServices.get("/master-controls/export", {
    signal,
    responseType: "blob",
  });

  const rawName =
    (response.headers as any)?.["content-disposition"] ??
    (response.headers as any)?.get?.("Content-Disposition");

  // Best-effort filename extraction — fall back to a dated default so the
  // download always has a sensible name.
  const match =
    typeof rawName === "string" ? rawName.match(/filename="([^"]+)"/) : null;
  const filename =
    match?.[1] ??
    `master-controls-${new Date().toISOString().slice(0, 10)}.csv`;

  return {
    blob: response.data as Blob,
    filename,
  };
}

// ---------- Mappings ----------

export async function getMasterControlMappings({
  id,
  signal,
}: {
  id: number;
  signal?: AbortSignal;
}): Promise<any> {
  const response = await apiServices.get(`/master-controls/${id}/mappings`, {
    signal,
  });
  return response.data;
}

export async function addMasterControlMapping({
  id,
  body,
}: {
  id: number;
  body: MasterControlMappingCreatePayload;
}): Promise<any> {
  const response = await apiServices.post(
    `/master-controls/${id}/mappings`,
    body
  );
  return response.data;
}

export async function deleteMasterControlMapping({
  mappingId,
}: {
  mappingId: number;
}): Promise<MasterControlFrameworkMapping> {
  const response = await apiServices.delete(
    `/master-controls/mappings/${mappingId}`
  );
  return response.data;
}

// ---------- Propagation preview ----------

export async function getMasterControlPropagationPreview({
  id,
  body,
}: {
  id: number;
  body: PropagationPreviewPayload;
}): Promise<any> {
  const response = await apiServices.post(
    `/master-controls/${id}/propagation-preview`,
    body
  );
  return response.data;
}
