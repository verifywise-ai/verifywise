import CustomAxios from "../../infrastructure/api/customAxios";
import { FriaAssessment, FriaRight, FriaRiskItem } from "../hooks/useFria";

const BASE_URL = "/fria";

export const friaRepository = {
  getFria: async (projectId: string | number) => {
    const response = await CustomAxios.get(`${BASE_URL}/${projectId}`);
    return response.data.data;
  },

  updateFria: async (projectId: string | number, data: Partial<FriaAssessment>) => {
    const response = await CustomAxios.put(`${BASE_URL}/${projectId}`, data);
    return response.data.data;
  },

  updateRights: async (
    friaId: number,
    rights: Partial<FriaRight>[]
  ) => {
    const response = await CustomAxios.put(`${BASE_URL}/${friaId}/rights`, {
      rights,
    });
    return response.data.data;
  },

  addRiskItem: async (friaId: number, data: Partial<FriaRiskItem>) => {
    const response = await CustomAxios.post(
      `${BASE_URL}/${friaId}/risk-items`,
      data
    );
    return response.data.data;
  },

  updateRiskItem: async (
    friaId: number,
    itemId: number,
    data: Partial<FriaRiskItem>
  ) => {
    const response = await CustomAxios.patch(
      `${BASE_URL}/${friaId}/risk-items/${itemId}`,
      data
    );
    return response.data.data;
  },

  deleteRiskItem: async (friaId: number, itemId: number) => {
    const response = await CustomAxios.delete(
      `${BASE_URL}/${friaId}/risk-items/${itemId}`
    );
    return response.data.data;
  },

  getModelLinks: async (friaId: number) => {
    const response = await CustomAxios.get(`${BASE_URL}/${friaId}/models`);
    return response.data.data;
  },

  linkModel: async (friaId: number, modelId: number) => {
    const response = await CustomAxios.post(
      `${BASE_URL}/${friaId}/models/${modelId}`
    );
    return response.data.data;
  },

  unlinkModel: async (friaId: number, modelId: number) => {
    const response = await CustomAxios.delete(
      `${BASE_URL}/${friaId}/models/${modelId}`
    );
    return response.data.data;
  },

  submitFria: async (friaId: number, reason?: string) => {
    const response = await CustomAxios.post(`${BASE_URL}/${friaId}/submit`, {
      reason,
    });
    return response.data.data;
  },

  getVersions: async (friaId: number) => {
    const response = await CustomAxios.get(`${BASE_URL}/${friaId}/versions`);
    return response.data.data;
  },

  getEvidence: async (friaId: number, section?: string) => {
    const params = section ? `?section=${section}` : "";
    const response = await CustomAxios.get(
      `${BASE_URL}/${friaId}/evidence${params}`
    );
    return response.data.data;
  },

  linkEvidence: async (friaId: number, fileId: number, entityType: string) => {
    const response = await CustomAxios.post(
      `${BASE_URL}/${friaId}/evidence`,
      { file_id: fileId, entity_type: entityType }
    );
    return response.data.data;
  },

  unlinkEvidence: async (friaId: number, linkId: number) => {
    const response = await CustomAxios.delete(
      `${BASE_URL}/${friaId}/evidence/${linkId}`
    );
    return response.data.data;
  },
};
