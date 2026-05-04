/**
 * Post-Market Monitoring Repository
 *
 * Application layer wrapper for PMM infrastructure services.
 * Provides a unified API for the presentation layer to access PMM functionality.
 *
 * @module application/repository/postMarketMonitoring
 */

import { pmmService } from "../../infrastructure/api/postMarketMonitoringService";
import {
  PMMConfigWithDetails,
  PMMConfigCreateRequest,
  PMMConfigUpdateRequest,
  PMMQuestion,
  PMMQuestionCreate,
  PMMQuestionUpdate,
  PMMCycleWithDetails,
  PMMCycleSubmitRequest,
  PMMResponseSave,
  PMMReportsResponse,
  PMMReportsFilterRequest,
} from "../../domain/types/PostMarketMonitoring";

// Re-export types for presentation layer
export type {
  PMMConfigWithDetails,
  PMMConfigCreateRequest,
  PMMConfigUpdateRequest,
  PMMQuestion,
  PMMQuestionCreate,
  PMMQuestionUpdate,
  PMMCycleWithDetails,
  PMMCycleSubmitRequest,
  PMMResponseSave,
  PMMReportsResponse,
  PMMReportsFilterRequest,
};

// ==================== Configuration ====================

/**
 * Get PMM configuration by project ID
 */
export const getConfigByProjectId = (projectId: number): Promise<PMMConfigWithDetails> =>
  pmmService.getConfigByProjectId(projectId);

/**
 * Create a new PMM configuration
 */
export const createConfig = (data: PMMConfigCreateRequest): Promise<PMMConfigWithDetails> =>
  pmmService.createConfig(data);

/**
 * Update an existing PMM configuration
 */
export const updateConfig = (
  configId: number,
  data: PMMConfigUpdateRequest,
): Promise<PMMConfigWithDetails> => pmmService.updateConfig(configId, data);

/**
 * Delete a PMM configuration
 */
export const deleteConfig = (configId: number): Promise<void> => pmmService.deleteConfig(configId);

// ==================== Questions ====================

/**
 * Get questions for a config
 */
export const getQuestions = (configId: number): Promise<PMMQuestion[]> =>
  pmmService.getQuestions(configId);

/**
 * Get organization-level template questions
 */
export const getOrgQuestions = (): Promise<PMMQuestion[]> => pmmService.getOrgQuestions();

/**
 * Add a new question
 */
export const addQuestion = (configId: number, data: PMMQuestionCreate): Promise<PMMQuestion> =>
  pmmService.addQuestion(configId, data);

/**
 * Update a question
 */
export const updateQuestion = (questionId: number, data: PMMQuestionUpdate): Promise<PMMQuestion> =>
  pmmService.updateQuestion(questionId, data);

/**
 * Delete a question
 */
export const deleteQuestion = (questionId: number): Promise<void> =>
  pmmService.deleteQuestion(questionId);

/**
 * Reorder questions
 */
export const reorderQuestions = (
  orders: Array<{ id: number; display_order: number }>,
): Promise<void> => pmmService.reorderQuestions(orders);

// ==================== Cycles ====================

/**
 * Get active monitoring cycle for a project
 */
export const getActiveCycle = (projectId: number): Promise<PMMCycleWithDetails | null> =>
  pmmService.getActiveCycle(projectId);

/**
 * Get cycle by ID
 */
export const getCycleById = (cycleId: number): Promise<PMMCycleWithDetails> =>
  pmmService.getCycleById(cycleId);

/**
 * Save responses (partial save)
 */
export const saveResponses = (cycleId: number, responses: PMMResponseSave[]): Promise<void> =>
  pmmService.saveResponses(cycleId, responses);

/**
 * Submit completed cycle
 */
export const submitCycle = (
  cycleId: number,
  data: PMMCycleSubmitRequest,
): Promise<{ message: string; report_generated: boolean; report_filename?: string }> =>
  pmmService.submitCycle(cycleId, data);

/**
 * Flag a concern immediately
 */
export const flagConcern = (
  cycleId: number,
  questionId: number,
  responseValue: boolean | string | string[],
): Promise<void> => pmmService.flagConcern(cycleId, questionId, responseValue);

// ==================== Reports ====================

/**
 * Get reports with filters
 */
export const getReports = (filters: PMMReportsFilterRequest): Promise<PMMReportsResponse> =>
  pmmService.getReports(filters);

/**
 * Download a report PDF
 */
export const downloadReport = (reportId: number): Promise<void> =>
  pmmService.downloadReport(reportId);

// ==================== Admin ====================

/**
 * Reassign stakeholder for a cycle
 */
export const reassignStakeholder = (cycleId: number, stakeholderId: number): Promise<void> =>
  pmmService.reassignStakeholder(cycleId, stakeholderId);

/**
 * Manually start a new monitoring cycle
 */
export const startNewCycle = (projectId: number): Promise<PMMCycleWithDetails> =>
  pmmService.startNewCycle(projectId);
