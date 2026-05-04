/**
 * Post-Market Monitoring API Service
 *
 * Infrastructure layer service for managing post-market monitoring.
 * Handles all HTTP requests related to PMM configuration, questions, cycles, and reports.
 *
 * @module infrastructure/api/postMarketMonitoringService
 */

import CustomAxios from "./customAxios";
import {
  PMMConfigWithDetails,
  PMMConfigCreateRequest,
  PMMConfigUpdateRequest,
  PMMQuestion,
  PMMQuestionCreate,
  PMMQuestionUpdate,
  PMMCycleWithDetails,
  PMMCycleSubmitRequest,
  PMMResponse,
  PMMResponseSave,
  PMMReportsResponse,
  PMMReportsFilterRequest,
} from "../../domain/types/PostMarketMonitoring";

const BASE_PATH = "/pmm";

// ==================== Configuration ====================

export const getConfigByProjectId = async (projectId: number): Promise<PMMConfigWithDetails> => {
  const response = await CustomAxios.get(`${BASE_PATH}/config/${projectId}`);
  return response.data.data;
};

export const createConfig = async (data: PMMConfigCreateRequest): Promise<PMMConfigWithDetails> => {
  const response = await CustomAxios.post(`${BASE_PATH}/config`, data);
  return response.data.data;
};

export const updateConfig = async (
  configId: number,
  data: PMMConfigUpdateRequest,
): Promise<PMMConfigWithDetails> => {
  const response = await CustomAxios.put(`${BASE_PATH}/config/${configId}`, data);
  return response.data.data;
};

export const deleteConfig = async (configId: number): Promise<void> => {
  await CustomAxios.delete(`${BASE_PATH}/config/${configId}`);
};

// ==================== Questions ====================

export const getQuestions = async (configId: number): Promise<PMMQuestion[]> => {
  const response = await CustomAxios.get(`${BASE_PATH}/config/${configId}/questions`);
  return response.data.data;
};

export const getOrgQuestions = async (): Promise<PMMQuestion[]> => {
  const response = await CustomAxios.get(`${BASE_PATH}/org/questions`);
  return response.data.data;
};

export const addQuestion = async (
  configId: number,
  data: PMMQuestionCreate,
): Promise<PMMQuestion> => {
  const response = await CustomAxios.post(`${BASE_PATH}/config/${configId}/questions`, data);
  return response.data.data;
};

export const updateQuestion = async (
  questionId: number,
  data: PMMQuestionUpdate,
): Promise<PMMQuestion> => {
  const response = await CustomAxios.put(`${BASE_PATH}/questions/${questionId}`, data);
  return response.data.data;
};

export const deleteQuestion = async (questionId: number): Promise<void> => {
  await CustomAxios.delete(`${BASE_PATH}/questions/${questionId}`);
};

export const reorderQuestions = async (
  orders: Array<{ id: number; display_order: number }>,
): Promise<void> => {
  await CustomAxios.post(`${BASE_PATH}/questions/reorder`, { orders });
};

// ==================== Cycles ====================

export const getActiveCycle = async (projectId: number): Promise<PMMCycleWithDetails | null> => {
  try {
    const response = await CustomAxios.get(`${BASE_PATH}/active-cycle/${projectId}`);
    return response.data.data;
  } catch (error) {
    const axiosError = error as { response?: { status?: number } };
    if (axiosError.response?.status === 404) {
      return null;
    }
    throw error;
  }
};

export const getCycleById = async (cycleId: number): Promise<PMMCycleWithDetails> => {
  const response = await CustomAxios.get(`${BASE_PATH}/cycles/${cycleId}`);
  return response.data.data;
};

export const getResponses = async (cycleId: number): Promise<PMMResponse[]> => {
  const response = await CustomAxios.get(`${BASE_PATH}/cycles/${cycleId}/responses`);
  return response.data.data;
};

export const saveResponses = async (
  cycleId: number,
  responses: PMMResponseSave[],
): Promise<void> => {
  await CustomAxios.post(`${BASE_PATH}/cycles/${cycleId}/responses`, {
    responses,
  });
};

export const submitCycle = async (
  cycleId: number,
  data: PMMCycleSubmitRequest,
): Promise<{ message: string; report_generated: boolean; report_filename?: string }> => {
  const response = await CustomAxios.post(`${BASE_PATH}/cycles/${cycleId}/submit`, data);
  return response.data.data;
};

export const flagConcern = async (
  cycleId: number,
  questionId: number,
  responseValue: boolean | string | string[],
): Promise<void> => {
  await CustomAxios.post(`${BASE_PATH}/cycles/${cycleId}/flag`, {
    question_id: questionId,
    response_value: responseValue,
  });
};

// ==================== Reports ====================

export const getReports = async (filters: PMMReportsFilterRequest): Promise<PMMReportsResponse> => {
  const params = new URLSearchParams();

  if (filters.project_id) {
    params.append("project_id", filters.project_id.toString());
  }
  if (filters.start_date) {
    params.append("start_date", filters.start_date);
  }
  if (filters.end_date) {
    params.append("end_date", filters.end_date);
  }
  if (filters.completed_by) {
    params.append("completed_by", filters.completed_by.toString());
  }
  if (filters.flagged_only) {
    params.append("flagged_only", "true");
  }
  if (filters.page) {
    params.append("page", filters.page.toString());
  }
  if (filters.limit) {
    params.append("limit", filters.limit.toString());
  }

  const response = await CustomAxios.get(`${BASE_PATH}/reports?${params.toString()}`);
  return response.data.data;
};

export const downloadReport = async (reportId: number): Promise<void> => {
  // This will trigger a redirect to the file download
  window.location.href = `/api${BASE_PATH}/reports/${reportId}/download`;
};

// ==================== Admin ====================

export const reassignStakeholder = async (
  cycleId: number,
  stakeholderId: number,
): Promise<void> => {
  await CustomAxios.post(`${BASE_PATH}/cycles/${cycleId}/reassign`, {
    stakeholder_id: stakeholderId,
  });
};

export const startNewCycle = async (projectId: number): Promise<PMMCycleWithDetails> => {
  const response = await CustomAxios.post(`${BASE_PATH}/projects/${projectId}/start-cycle`);
  return response.data.data;
};

// ==================== Service Export ====================

export const pmmService = {
  // Configuration
  getConfigByProjectId,
  createConfig,
  updateConfig,
  deleteConfig,

  // Questions
  getQuestions,
  getOrgQuestions,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  reorderQuestions,

  // Cycles
  getActiveCycle,
  getCycleById,
  getResponses,
  saveResponses,
  submitCycle,
  flagConcern,

  // Reports
  getReports,
  downloadReport,

  // Admin
  reassignStakeholder,
  startNewCycle,
};
