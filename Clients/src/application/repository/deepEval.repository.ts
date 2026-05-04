/**
 * DeepEval Repository
 *
 * Application layer wrapper for all DeepEval-related infrastructure services.
 * Provides a unified API for the presentation layer to access DeepEval functionality.
 */

import { deepEvalProjectsService } from "../../infrastructure/api/deepEvalProjectsService";
import {
  deepEvalDatasetsService,
  isSingleTurnPrompt,
  isMultiTurnConversation,
  type DatasetType,
  type TurnType,
  type UploadDatasetResponse,
  type ListedDataset,
  type DatasetPromptRecord,
  type SingleTurnPrompt,
  type MultiTurnConversation,
  type ConversationTurn,
} from "../../infrastructure/api/deepEvalDatasetsService";
import {
  deepEvalScorersService,
  type DeepEvalScorer,
  type ListScorersResponse,
  type ScorerTestResult,
} from "../../infrastructure/api/deepEvalScorersService";
import {
  deepEvalOrgsService,
  type DeepEvalOrg,
  type OrgMember,
} from "../../infrastructure/api/deepEvalOrgsService";
import {
  evaluationLlmApiKeysService,
  type LLMApiKey,
  type LLMProvider,
  type AddKeyRequest,
} from "../../infrastructure/api/evaluationLlmApiKeysService";
import {
  evaluationLogsService,
  metricsService,
  experimentsService,
  monitoringService,
  modelValidationService,
  type EvaluationLog,
  type EvaluationMetric,
  type Experiment,
  type MonitorDashboard,
  type ModelValidationResult,
} from "../../infrastructure/api/evaluationLogsService";
import {
  deepEvalArenaService,
  type ArenaTestCase,
  type ArenaContestant,
  type ArenaMetricConfig,
  type CreateArenaComparisonRequest,
  type ArenaComparisonResult,
  type ArenaComparison,
  type ArenaComparisonSummary,
} from "../../infrastructure/api/deepEvalArenaService";
import {
  biasAuditService,
  type BiasAuditPresetSummary,
  type BiasAuditPreset,
  type BiasAuditSummary,
  type BiasAuditDetailResponse,
  type GroupResultRow,
  type CategoryTableResult,
  type BiasAuditResultFull,
  type BiasAuditMetric,
  type CreateBiasAuditConfig,
  type FairnessMetricsTable,
  type ConfusionMatrixGroupResult,
  type ScoreDistributionTable,
  type ScoreDistributionGroup,
  type ScoreDistributionBin,
} from "../../infrastructure/api/biasAuditService";

// Re-export types for presentation layer
export type {
  DatasetType,
  TurnType,
  UploadDatasetResponse,
  ListedDataset,
  DatasetPromptRecord,
  SingleTurnPrompt,
  MultiTurnConversation,
  ConversationTurn,
  DeepEvalScorer,
  ListScorersResponse,
  ScorerTestResult,
  DeepEvalOrg,
  OrgMember,
  LLMApiKey,
  LLMProvider,
  AddKeyRequest,
  EvaluationLog,
  EvaluationMetric,
  Experiment,
  MonitorDashboard,
  ModelValidationResult,
  // Arena types
  ArenaTestCase,
  ArenaContestant,
  ArenaMetricConfig,
  CreateArenaComparisonRequest,
  ArenaComparisonResult,
  ArenaComparison,
  ArenaComparisonSummary,
  // Bias audit types
  BiasAuditPresetSummary,
  BiasAuditPreset,
  BiasAuditSummary,
  BiasAuditDetailResponse,
  GroupResultRow,
  CategoryTableResult,
  BiasAuditResultFull,
  BiasAuditMetric,
  CreateBiasAuditConfig,
  FairnessMetricsTable,
  ConfusionMatrixGroupResult,
  ScoreDistributionTable,
  ScoreDistributionGroup,
  ScoreDistributionBin,
};

// Re-export utility functions for presentation layer
export { isSingleTurnPrompt, isMultiTurnConversation };

// ==================== PROJECTS ====================

export const createProject = (
  projectData: Parameters<typeof deepEvalProjectsService.createProject>[0],
) => deepEvalProjectsService.createProject(projectData);

export const getAllProjects = () => deepEvalProjectsService.getAllProjects();

export const getProject = (projectId: string) => deepEvalProjectsService.getProject(projectId);

export const updateProject = (
  projectId: string,
  projectData: Parameters<typeof deepEvalProjectsService.updateProject>[1],
) => deepEvalProjectsService.updateProject(projectId, projectData);

export const deleteProject = (projectId: string) =>
  deepEvalProjectsService.deleteProject(projectId);

export const getProjectStats = (projectId: string) =>
  deepEvalProjectsService.getProjectStats(projectId);

// ==================== DATASETS ====================

export const uploadDataset = (
  file: File,
  datasetType?: DatasetType,
  turnType?: TurnType,
  orgId?: string,
) => deepEvalDatasetsService.uploadDataset(file, datasetType, turnType, orgId);

export const listDatasets = () => deepEvalDatasetsService.list();

export const readDataset = (path: string) => deepEvalDatasetsService.read(path);

export const listUploads = () => deepEvalDatasetsService.listUploads();

export const listMyDatasets = () => deepEvalDatasetsService.listMy();

export const deleteDatasets = (paths: string[]) => deepEvalDatasetsService.deleteDatasets(paths);

// ==================== SCORERS ====================

export const listScorers = (params?: { org_id?: string }) => deepEvalScorersService.list(params);

export const createScorer = (payload: Parameters<typeof deepEvalScorersService.create>[0]) =>
  deepEvalScorersService.create(payload);

export const updateScorer = (
  id: string,
  payload: Parameters<typeof deepEvalScorersService.update>[1],
) => deepEvalScorersService.update(id, payload);

export const deleteScorer = (id: string) => deepEvalScorersService.delete(id);

export const testScorer = (
  id: string,
  payload: Parameters<typeof deepEvalScorersService.test>[1],
) => deepEvalScorersService.test(id, payload);

// ==================== ORGANIZATIONS ====================

export const getAllOrgs = () => deepEvalOrgsService.getAllOrgs();

export const createOrg = (name: string, memberIds?: number[]) =>
  deepEvalOrgsService.createOrg(name, memberIds);

export const updateOrg = (orgId: string, name: string, memberIds?: number[]) =>
  deepEvalOrgsService.updateOrg(orgId, name, memberIds);

export const deleteOrg = (orgId: string) => deepEvalOrgsService.deleteOrg(orgId);

export const getProjectsForOrg = (orgId: string) => deepEvalOrgsService.getProjectsForOrg(orgId);

export const setCurrentOrg = (orgId: string) => deepEvalOrgsService.setCurrentOrg(orgId);

export const getCurrentOrg = () => deepEvalOrgsService.getCurrentOrg();

export const clearCurrentOrg = () => deepEvalOrgsService.clearCurrentOrg();

export const addProjectToOrg = (orgId: string, projectId: string) =>
  deepEvalOrgsService.addProjectToOrg(orgId, projectId);

// ==================== LLM API KEYS ====================

export const getAllLlmApiKeys = () => evaluationLlmApiKeysService.getAllKeys();

export const addLlmApiKey = (request: AddKeyRequest) => evaluationLlmApiKeysService.addKey(request);

export const deleteLlmApiKey = (provider: LLMProvider) =>
  evaluationLlmApiKeysService.deleteKey(provider);

export const hasLlmApiKey = (provider: LLMProvider) => evaluationLlmApiKeysService.hasKey(provider);

export const verifyLlmApiKey = (provider: string, apiKey: string) =>
  evaluationLlmApiKeysService.verifyKey({ provider, apiKey });

// ==================== EVALUATION LOGS ====================

export const createLog = (data: Parameters<typeof evaluationLogsService.createLog>[0]) =>
  evaluationLogsService.createLog(data);

export const getLogs = (params: Parameters<typeof evaluationLogsService.getLogs>[0]) =>
  evaluationLogsService.getLogs(params);

export const getLog = (logId: string) => evaluationLogsService.getLog(logId);

export const getTraceLogs = (traceId: string) => evaluationLogsService.getTraceLogs(traceId);

// ==================== METRICS ====================

export const createMetric = (data: Parameters<typeof metricsService.createMetric>[0]) =>
  metricsService.createMetric(data);

export const getMetrics = (params: Parameters<typeof metricsService.getMetrics>[0]) =>
  metricsService.getMetrics(params);

export const getMetricAggregates = (
  params: Parameters<typeof metricsService.getMetricAggregates>[0],
) => metricsService.getMetricAggregates(params);

// ==================== MODEL VALIDATION ====================

export const validateModel = (modelName: string, provider?: string) =>
  modelValidationService.validateModel(modelName, provider);

export const validateModelForExperiment = (config: Record<string, unknown>) =>
  experimentsService.validateModelForExperiment(config);

// ==================== EXPERIMENTS ====================

export const createExperiment = (data: Parameters<typeof experimentsService.createExperiment>[0]) =>
  experimentsService.createExperiment(data);

export const getExperiments = (params: Parameters<typeof experimentsService.getExperiments>[0]) =>
  experimentsService.getExperiments(params);

export const getAllExperiments = (
  params: Parameters<typeof experimentsService.getAllExperiments>[0],
) => experimentsService.getAllExperiments(params);

export const getExperiment = (experimentId: string) =>
  experimentsService.getExperiment(experimentId);

export const updateExperiment = (
  experimentId: string,
  data: Parameters<typeof experimentsService.updateExperiment>[1],
) => experimentsService.updateExperiment(experimentId, data);

export const updateExperimentStatus = (
  experimentId: string,
  data: Parameters<typeof experimentsService.updateExperimentStatus>[1],
) => experimentsService.updateExperimentStatus(experimentId, data);

export const deleteExperiment = (experimentId: string) =>
  experimentsService.deleteExperiment(experimentId);

// ==================== MONITORING ====================

export const getMonitorDashboard = (
  projectId: string,
  params?: Parameters<typeof monitoringService.getDashboard>[1],
) => monitoringService.getDashboard(projectId, params);

// ==================== ARENA ====================

export const createArenaComparison = (data: CreateArenaComparisonRequest) =>
  deepEvalArenaService.createComparison(data);

export const listArenaComparisons = (params?: { org_id?: string }) =>
  deepEvalArenaService.listComparisons(params);

export const getArenaComparisonStatus = (comparisonId: string) =>
  deepEvalArenaService.getComparisonStatus(comparisonId);

export const getArenaComparisonResults = (comparisonId: string) =>
  deepEvalArenaService.getComparisonResults(comparisonId);

export const deleteArenaComparison = (comparisonId: string) =>
  deepEvalArenaService.deleteComparison(comparisonId);

// ==================== BIAS AUDITS ====================

export const listBiasAuditPresets = () => biasAuditService.listPresets();

export const getBiasAuditPreset = (presetId: string) => biasAuditService.getPreset(presetId);

export const runBiasAudit = (dataset: File, config: CreateBiasAuditConfig) =>
  biasAuditService.runAudit(dataset, config);

export const getBiasAuditStatus = (auditId: string) => biasAuditService.getStatus(auditId);

export const getBiasAuditResults = (auditId: string) => biasAuditService.getResults(auditId);

export const listBiasAudits = (params?: { org_id?: string; project_id?: string }) =>
  biasAuditService.listAudits(params);

export const deleteBiasAudit = (auditId: string) => biasAuditService.deleteAudit(auditId);

export const updateBiasAuditName = (auditId: string, systemName: string) =>
  biasAuditService.updateAuditName(auditId, systemName);

export const downloadBiasAuditReport = (auditId: string) =>
  biasAuditService.downloadReport(auditId);

export const parseBiasAuditCsvHeaders = (dataset: File) => biasAuditService.parseHeaders(dataset);
