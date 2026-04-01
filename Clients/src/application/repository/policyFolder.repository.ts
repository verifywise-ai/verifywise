import CustomAxios from "../../infrastructure/api/customAxios";
import type { IVirtualFolder } from "../../domain/interfaces/i.virtualFolder";

const BASE_URL = "/policies";

export const getPolicyFolders = async (
  policyId: number
): Promise<IVirtualFolder[]> => {
  const response = await CustomAxios.get(`${BASE_URL}/${policyId}/folders`);
  return response.data.data;
};

export const getPolicyIdsInFolder = async (
  folderId: number
): Promise<number[]> => {
  const response = await CustomAxios.get(`${BASE_URL}/folders/${folderId}/policies`);
  return response.data.data;
};

export const updatePolicyFolders = async (
  policyId: number,
  folderIds: number[]
): Promise<IVirtualFolder[]> => {
  const response = await CustomAxios.patch(`${BASE_URL}/${policyId}/folders`, {
    folder_ids: folderIds,
  });
  return response.data.data;
};
