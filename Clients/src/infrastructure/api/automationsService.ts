/**
 * Automations API Service
 *
 * Infrastructure layer service for managing automations.
 * Handles all HTTP requests related to automations, triggers, and actions.
 *
 * @module infrastructure/api/automationsService
 */

import CustomAxios from "./customAxios";

// ==================== Types ====================

export interface AutomationTrigger {
  id: number;
  key: string;
  label: string;
  description?: string;
}

export interface AutomationAction {
  id: number;
  key: string;
  label: string;
  description?: string;
  trigger_id: number;
}

export interface AutomationActionPayload {
  action_type_id: number;
  params: Record<string, unknown>;
  order: number;
}

export interface CreateAutomationPayload {
  triggerId: number;
  name: string;
  params: string;
  actions: AutomationActionPayload[];
}

export interface UpdateAutomationPayload {
  triggerId?: number;
  name?: string;
  params?: string;
  actions?: AutomationActionPayload[];
  is_active?: boolean;
}

export interface AutomationRecord {
  id: number;
  name: string;
  description?: string;
  trigger_id: number;
  params?: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  actions?: Array<{
    id: number;
    action_type_id: number;
    params: string | Record<string, unknown>;
    order: number;
  }>;
}

export interface AutomationExecutionStats {
  total_executions: number;
  successful_executions: number;
  failed_executions: number;
  last_execution_at?: Date;
}

export interface AutomationExecutionLogAction {
  action_type: string;
  status: "success" | "failure";
  executed_at?: Date;
  error_message?: string;
  result_data?: Record<string, unknown>;
}

export interface AutomationExecutionLog {
  id: string;
  automation_id: number;
  triggered_at: Date;
  status: "success" | "partial_success" | "failure";
  trigger_data?: Record<string, unknown>;
  execution_time_ms?: number;
  error_message?: string;
  actions: AutomationExecutionLogAction[];
}

export interface HistoryResponse {
  logs: AutomationExecutionLog[];
  total: number;
}

// ==================== Service ====================

export const automationsService = {
  // ==================== Automations ====================

  /**
   * Get all automations
   */
  async getAll(): Promise<AutomationRecord[]> {
    const response = await CustomAxios.get("/automations");
    return response.data.data;
  },

  /**
   * Get a single automation by ID
   */
  async getById(id: string | number): Promise<AutomationRecord> {
    const response = await CustomAxios.get(`/automations/${id}`);
    return response.data.data;
  },

  /**
   * Create a new automation
   */
  async create(payload: CreateAutomationPayload): Promise<AutomationRecord> {
    const response = await CustomAxios.post("/automations", payload);
    return response.data.data;
  },

  /**
   * Update an existing automation
   */
  async update(id: string | number, payload: UpdateAutomationPayload): Promise<AutomationRecord> {
    const response = await CustomAxios.put(`/automations/${id}`, payload);
    return response.data.data;
  },

  /**
   * Delete an automation
   */
  async delete(id: string | number): Promise<void> {
    await CustomAxios.delete(`/automations/${id}`);
  },

  // ==================== Triggers ====================

  /**
   * Get all available triggers
   */
  async getTriggers(): Promise<AutomationTrigger[]> {
    const response = await CustomAxios.get("/automations/triggers");
    return response.data.data;
  },

  // ==================== Actions ====================

  /**
   * Get actions available for a specific trigger
   */
  async getActionsByTriggerId(triggerId: number): Promise<AutomationAction[]> {
    const response = await CustomAxios.get(`/automations/actions/by-triggerId/${triggerId}`);
    return response.data.data;
  },

  // ==================== History & Stats ====================

  /**
   * Get execution history for an automation
   */
  async getHistory(
    automationId: string | number,
    params?: { limit?: number; offset?: number },
  ): Promise<HistoryResponse> {
    const response = await CustomAxios.get(`/automations/${automationId}/history`, { params });
    return response.data.data;
  },

  /**
   * Get execution stats for an automation
   */
  async getStats(automationId: string | number): Promise<AutomationExecutionStats> {
    const response = await CustomAxios.get(`/automations/${automationId}/stats`);
    return response.data.data;
  },
};
