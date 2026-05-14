/**
 * CCM API Service
 *
 * Infrastructure layer service for Continuous Control Monitoring.
 */

import CustomAxios from "./customAxios";

// ==================== Types ====================

export interface CcmConnector {
  id: number;
  organization_id: number;
  name: string;
  type: string;
  config: Record<string, unknown>;
  status?: string;
  last_health_check_at?: string;
  created_by?: number;
  created_at: string;
  updated_at?: string;
}

export interface CcmControlTest {
  id: number;
  organization_id: number;
  name: string;
  description?: string;
  connector_id: number;
  connector_type: string;
  query_template: string;
  expectation_type: string;
  expectation_config: Record<string, unknown>;
  schedule: string;
  is_active: boolean;
  next_run_at?: string;
  last_run_at?: string;
  subcontrol_id?: number;
  created_by?: number;
  created_at: string;
  updated_at?: string;
}

export interface CcmTestResult {
  id: number;
  test_id: number;
  status: "pass" | "fail" | "error";
  result_data?: Record<string, unknown>;
  error_message?: string;
  execution_time_ms?: number;
  evidence_file_id?: number;
  created_at: string;
}

export interface CcmControlHealth {
  id: number;
  test_id: number;
  control_id?: number;
  health_score: number;
  streak_days: number;
  last_result_status: "pass" | "fail" | "error";
  failure_count_30d: number;
  updated_at: string;
}

export interface CcmAlert {
  id: number;
  organization_id: number;
  test_id: number;
  alert_type: string;
  severity: "critical" | "warning" | "info";
  message: string;
  status: "open" | "acknowledged" | "resolved";
  acknowledged_by?: number;
  acknowledged_at?: string;
  resolved_at?: string;
  created_at: string;
}

export interface CcmDashboardSummary {
  totalTests: number;
  activeTests: number;
  passingTests: number;
  failingTests: number;
  openAlerts: number;
  connectorCount: number;
  healthyConnectors: number;
  recentResults: CcmTestResult[];
  recentAlerts: CcmAlert[];
}

export interface ConnectorTypeInfo {
  type: string;
  name: string;
  description: string;
}

// ==================== Service ====================

export const ccmService = {
  // Dashboard
  async getDashboard(): Promise<CcmDashboardSummary> {
    const response = await CustomAxios.get("/ccm/dashboard");
    return response.data.data;
  },

  // Connectors
  async getConnectors(): Promise<CcmConnector[]> {
    const response = await CustomAxios.get("/ccm/connectors");
    return response.data.data;
  },

  async getConnectorTypes(): Promise<ConnectorTypeInfo[]> {
    const response = await CustomAxios.get("/ccm/connectors/types");
    return response.data.data;
  },

  async createConnector(payload: {
    name: string;
    type: string;
    config?: Record<string, unknown>;
  }): Promise<CcmConnector> {
    const response = await CustomAxios.post("/ccm/connectors", payload);
    return response.data.data;
  },

  async updateConnector(
    id: number,
    payload: Partial<Omit<CcmConnector, "id" | "created_at">>,
  ): Promise<CcmConnector> {
    const response = await CustomAxios.patch(`/ccm/connectors/${id}`, payload);
    return response.data.data;
  },

  async deleteConnector(id: number): Promise<void> {
    await CustomAxios.delete(`/ccm/connectors/${id}`);
  },

  async testConnectorConnection(id: number): Promise<{ success: boolean; message?: string }> {
    const response = await CustomAxios.post(`/ccm/connectors/${id}/test`);
    return response.data.data;
  },

  // Control Tests
  async getControlTests(): Promise<CcmControlTest[]> {
    const response = await CustomAxios.get("/ccm/tests");
    return response.data.data;
  },

  async createControlTest(
    payload: Omit<CcmControlTest, "id" | "organization_id" | "created_at" | "updated_at">,
  ): Promise<CcmControlTest> {
    const response = await CustomAxios.post("/ccm/tests", payload);
    return response.data.data;
  },

  async updateControlTest(
    id: number,
    payload: Partial<Omit<CcmControlTest, "id" | "organization_id" | "created_at">>,
  ): Promise<CcmControlTest> {
    const response = await CustomAxios.patch(`/ccm/tests/${id}`, payload);
    return response.data.data;
  },

  async deleteControlTest(id: number): Promise<void> {
    await CustomAxios.delete(`/ccm/tests/${id}`);
  },

  async runControlTest(id: number): Promise<CcmTestResult> {
    const response = await CustomAxios.post(`/ccm/tests/${id}/run`);
    return response.data.data;
  },

  // Results
  async getTestResults(params?: { test_id?: number; limit?: number }): Promise<CcmTestResult[]> {
    const response = await CustomAxios.get("/ccm/results", { params });
    return response.data.data;
  },

  // Health
  async getControlHealth(): Promise<CcmControlHealth[]> {
    const response = await CustomAxios.get("/ccm/health");
    return response.data.data;
  },

  // Alerts
  async getAlerts(params?: { status?: string }): Promise<CcmAlert[]> {
    const response = await CustomAxios.get("/ccm/alerts", { params });
    return response.data.data;
  },

  async updateAlert(
    id: number,
    payload: { status: "acknowledged" | "resolved"; message?: string },
  ): Promise<CcmAlert> {
    const response = await CustomAxios.patch(`/ccm/alerts/${id}`, payload);
    return response.data.data;
  },

};
