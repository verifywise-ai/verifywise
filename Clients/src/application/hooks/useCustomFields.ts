import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CustomFieldEntityType,
  ICreateCustomFieldDefinitionInput,
  ICustomFieldDefinition,
  ICustomFieldValueRow,
  IUpdateCustomFieldDefinitionInput,
} from "../../domain/interfaces/i.customField";
import {
  createCustomFieldDefinition,
  deleteCustomFieldDefinition,
  getCustomFieldValuesForEntity,
  getMissingRequiredCustomFields,
  listCustomFieldDefinitions,
  updateCustomFieldDefinition,
} from "../repository/customField.repository";

export const customFieldsKeys = {
  definitions: (entityType: CustomFieldEntityType) =>
    ["customFields", "definitions", entityType] as const,
  values: (entityType: CustomFieldEntityType, entityId: number | null) =>
    ["customFields", "values", entityType, entityId] as const,
  missingRequired: (entityType: CustomFieldEntityType, entityId: number | null) =>
    ["customFields", "missingRequired", entityType, entityId] as const,
};

export function useCustomFieldDefinitions(entityType: CustomFieldEntityType) {
  return useQuery<ICustomFieldDefinition[]>({
    queryKey: customFieldsKeys.definitions(entityType),
    queryFn: ({ signal }) => listCustomFieldDefinitions({ entityType, signal }),
  });
}

export function useCreateCustomFieldDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ICreateCustomFieldDefinitionInput) => createCustomFieldDefinition(body),
    onSuccess: (created) => {
      qc.invalidateQueries({
        queryKey: customFieldsKeys.definitions(created.entity_type),
      });
    },
  });
}

export function useUpdateCustomFieldDefinition(entityType: CustomFieldEntityType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: IUpdateCustomFieldDefinitionInput }) =>
      updateCustomFieldDefinition({ id, body }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: customFieldsKeys.definitions(entityType),
      });
    },
  });
}

export function useDeleteCustomFieldDefinition(entityType: CustomFieldEntityType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteCustomFieldDefinition(id),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: customFieldsKeys.definitions(entityType),
      });
    },
  });
}

export function useCustomFieldValues(entityType: CustomFieldEntityType, entityId: number | null) {
  return useQuery<ICustomFieldValueRow[]>({
    queryKey: customFieldsKeys.values(entityType, entityId),
    queryFn: ({ signal }) =>
      getCustomFieldValuesForEntity({
        entityType,
        entityId: entityId as number,
        signal,
      }),
    enabled: entityId !== null && entityId > 0,
  });
}

export function useMissingRequiredCustomFields(
  entityType: CustomFieldEntityType,
  entityId: number | null,
) {
  return useQuery({
    queryKey: customFieldsKeys.missingRequired(entityType, entityId),
    queryFn: ({ signal }) =>
      getMissingRequiredCustomFields({
        entityType,
        entityId: entityId as number,
        signal,
      }),
    enabled: entityId !== null && entityId > 0,
  });
}
