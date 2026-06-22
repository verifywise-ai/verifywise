import { apiServices } from "../../infrastructure/api/networkServices";
import type {
  CustomFieldEntityType,
  ICreateCustomFieldDefinitionInput,
  ICustomFieldDefinition,
  ICustomFieldValueRow,
  IUpdateCustomFieldDefinitionInput,
} from "../../domain/interfaces/i.customField";

// Backend wraps every payload in STATUS_CODE[xxx](...) → { message, data }.
type Envelope<T> = { data: T; message?: string };

export async function listCustomFieldDefinitions({
  entityType,
  signal,
}: {
  entityType: CustomFieldEntityType;
  signal?: AbortSignal;
}): Promise<ICustomFieldDefinition[]> {
  const response = await apiServices.get<Envelope<ICustomFieldDefinition[]>>(
    `/custom-fields/definitions/${entityType}`,
    { signal },
  );
  return response.data?.data ?? [];
}

export async function createCustomFieldDefinition(
  body: ICreateCustomFieldDefinitionInput,
): Promise<ICustomFieldDefinition> {
  const response = await apiServices.post<Envelope<ICustomFieldDefinition>>(
    "/custom-fields/definitions",
    body,
  );
  return response.data.data;
}

export async function updateCustomFieldDefinition({
  id,
  body,
}: {
  id: number;
  body: IUpdateCustomFieldDefinitionInput;
}): Promise<ICustomFieldDefinition> {
  const response = await apiServices.patch<Envelope<ICustomFieldDefinition>>(
    `/custom-fields/definitions/${id}`,
    body,
  );
  return response.data.data;
}

export async function deleteCustomFieldDefinition(id: number): Promise<void> {
  await apiServices.delete(`/custom-fields/definitions/${id}`);
}

export async function getCustomFieldValuesForEntity({
  entityType,
  entityId,
  signal,
}: {
  entityType: CustomFieldEntityType;
  entityId: number;
  signal?: AbortSignal;
}): Promise<ICustomFieldValueRow[]> {
  const response = await apiServices.get<Envelope<ICustomFieldValueRow[]>>(
    `/custom-fields/values/${entityType}/${entityId}`,
    { signal },
  );
  return response.data?.data ?? [];
}

export async function setCustomFieldValue(body: {
  definition_id: number;
  entity_id: number;
  value: unknown;
}): Promise<void> {
  await apiServices.put("/custom-fields/values", body);
}

export async function deleteCustomFieldValue({
  definitionId,
  entityId,
}: {
  definitionId: number;
  entityId: number;
}): Promise<void> {
  await apiServices.delete(`/custom-fields/values/${definitionId}/${entityId}`);
}

export async function getMissingRequiredCustomFields({
  entityType,
  entityId,
  signal,
}: {
  entityType: CustomFieldEntityType;
  entityId: number;
  signal?: AbortSignal;
}): Promise<Array<{ id: number; field_key: string; label: string }>> {
  const response = await apiServices.get<
    Envelope<Array<{ id: number; field_key: string; label: string }>>
  >(`/custom-fields/values/${entityType}/${entityId}/missing-required`, { signal });
  return response.data?.data ?? [];
}
