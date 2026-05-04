/**
 * Automations Repository
 *
 * Application layer wrapper for automations infrastructure services.
 * Provides a unified API for the presentation layer to access automation functionality.
 *
 * @module application/repository/automations
 */

import {
  automationsService,
  type AutomationTrigger,
  type AutomationAction,
  type AutomationActionPayload,
  type CreateAutomationPayload,
  type UpdateAutomationPayload,
  type AutomationRecord,
  type AutomationExecutionStats,
  type AutomationExecutionLog,
  type AutomationExecutionLogAction,
  type HistoryResponse,
} from "../../infrastructure/api/automationsService";

// Re-export types for presentation layer
export type {
  AutomationTrigger,
  AutomationAction,
  AutomationActionPayload,
  CreateAutomationPayload,
  UpdateAutomationPayload,
  AutomationRecord,
  AutomationExecutionStats,
  AutomationExecutionLog,
  AutomationExecutionLogAction,
  HistoryResponse,
};

// ==================== Automations ====================

/**
 * Get all automations
 */
export const getAllAutomations = () => automationsService.getAll();

/**
 * Get a single automation by ID
 */
export const getAutomation = (id: string | number) => automationsService.getById(id);

/**
 * Create a new automation
 */
export const createAutomation = (payload: CreateAutomationPayload) =>
  automationsService.create(payload);

/**
 * Update an existing automation
 */
export const updateAutomation = (id: string | number, payload: UpdateAutomationPayload) =>
  automationsService.update(id, payload);

/**
 * Delete an automation
 */
export const deleteAutomation = (id: string | number) => automationsService.delete(id);

// ==================== Triggers ====================

/**
 * Get all available triggers
 */
export const getTriggers = () => automationsService.getTriggers();

// ==================== Actions ====================

/**
 * Get actions available for a specific trigger
 */
export const getActionsByTriggerId = (triggerId: number) =>
  automationsService.getActionsByTriggerId(triggerId);

// ==================== History & Stats ====================

/**
 * Get execution history for an automation
 */
export const getAutomationHistory = (
  automationId: string | number,
  params?: { limit?: number; offset?: number },
) => automationsService.getHistory(automationId, params);

/**
 * Get execution stats for an automation
 */
export const getAutomationStats = (automationId: string | number) =>
  automationsService.getStats(automationId);
