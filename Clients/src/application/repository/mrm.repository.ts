/**
 * MRM (Model Risk Management) repository — CustomAxios calls to /api/mrm/*.
 *
 * The backend wraps every payload as STATUS_CODE[xxx](data) → { message, data }
 * and apiServices adds another axios layer, so the real payload sits at
 * response.data.data (mirrors modelInventory/aiApp repositories).
 */

import { apiServices } from "../../infrastructure/api/networkServices";
import {
  IAssignTierPayload,
  ICreateFindingPayload,
  ICreateValidationPayload,
  IMrmFinding,
  IMrmFleetRow,
  IMrmModelRole,
  IMrmValidation,
  IRoleAssignment,
  ISignoffValidationPayload,
  IUpdateFindingPayload,
  IUpdateValidationPayload,
} from "../../domain/interfaces/i.mrm";

// ---- Tiering ----

export async function getFleetTiering(signal?: AbortSignal): Promise<IMrmFleetRow[]> {
  const response = await apiServices.get("/mrm/tiering", { signal });
  return (response.data as { data: IMrmFleetRow[] }).data ?? [];
}

export async function assignModelTier(
  modelId: number,
  payload: IAssignTierPayload,
): Promise<IMrmFleetRow> {
  const response = await apiServices.put(`/mrm/models/${modelId}/tier`, payload);
  return (response.data as { data: IMrmFleetRow }).data;
}

// ---- Validations ----

export async function getValidations(
  modelId?: number,
  signal?: AbortSignal,
): Promise<IMrmValidation[]> {
  const query = modelId ? `?modelId=${modelId}` : "";
  const response = await apiServices.get(`/mrm/validations${query}`, { signal });
  return (response.data as { data: IMrmValidation[] }).data ?? [];
}

export async function createValidation(
  modelId: number,
  payload: ICreateValidationPayload,
): Promise<IMrmValidation> {
  const response = await apiServices.post(`/mrm/models/${modelId}/validations`, payload);
  return (response.data as { data: IMrmValidation }).data;
}

export async function updateValidation(
  id: number,
  payload: IUpdateValidationPayload,
): Promise<IMrmValidation> {
  const response = await apiServices.patch(`/mrm/validations/${id}`, payload);
  return (response.data as { data: IMrmValidation }).data;
}

export async function signoffValidation(
  id: number,
  payload: ISignoffValidationPayload,
): Promise<IMrmValidation> {
  const response = await apiServices.post(`/mrm/validations/${id}/signoff`, payload);
  return (response.data as { data: IMrmValidation }).data;
}

// ---- Findings ----

export async function getFindings(
  filters?: { modelId?: number; validationId?: number },
  signal?: AbortSignal,
): Promise<IMrmFinding[]> {
  const params = new URLSearchParams();
  if (filters?.modelId) params.append("modelId", String(filters.modelId));
  if (filters?.validationId) params.append("validationId", String(filters.validationId));
  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await apiServices.get(`/mrm/findings${query}`, { signal });
  return (response.data as { data: IMrmFinding[] }).data ?? [];
}

export async function createFinding(
  validationId: number,
  payload: ICreateFindingPayload,
): Promise<IMrmFinding> {
  const response = await apiServices.post(`/mrm/validations/${validationId}/findings`, payload);
  return (response.data as { data: IMrmFinding }).data;
}

export async function updateFinding(
  id: number,
  payload: IUpdateFindingPayload,
): Promise<IMrmFinding> {
  const response = await apiServices.patch(`/mrm/findings/${id}`, payload);
  return (response.data as { data: IMrmFinding }).data;
}

// ---- Per-model roles ----

export async function getModelRoles(
  modelId: number,
  signal?: AbortSignal,
): Promise<IMrmModelRole[]> {
  const response = await apiServices.get(`/mrm/models/${modelId}/roles`, { signal });
  return (response.data as { data: IMrmModelRole[] }).data ?? [];
}

export async function setModelRoles(
  modelId: number,
  assignments: IRoleAssignment[],
): Promise<IMrmModelRole[]> {
  const response = await apiServices.put(`/mrm/models/${modelId}/roles`, { assignments });
  return (response.data as { data: IMrmModelRole[] }).data ?? [];
}
