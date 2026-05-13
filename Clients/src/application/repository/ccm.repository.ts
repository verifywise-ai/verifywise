/**
 * CCM Repository
 *
 * Application layer wrapper for CCM infrastructure services.
 */

import { ccmService } from "../../infrastructure/api/ccmService";

export type {
  CcmConnector,
  CcmControlTest,
  CcmTestResult,
  CcmControlHealth,
  CcmAlert,
  CcmDashboardSummary,
  ConnectorTypeInfo,
} from "../../infrastructure/api/ccmService";

// ==================== Dashboard ====================

export const getCcmDashboard = () => ccmService.getDashboard();

// ==================== Connectors ====================

export const getCcmConnectors = () => ccmService.getConnectors();

export const getCcmConnectorTypes = () => ccmService.getConnectorTypes();

export const createCcmConnector = (payload: {
  name: string;
  type: string;
  config?: Record<string, unknown>;
}) => ccmService.createConnector(payload);

export const updateCcmConnector = (
  id: number,
  payload: Parameters<typeof ccmService.updateConnector>[1],
) => ccmService.updateConnector(id, payload);

export const deleteCcmConnector = (id: number) => ccmService.deleteConnector(id);

export const testCcmConnector = (id: number) => ccmService.testConnectorConnection(id);

// ==================== Control Tests ====================

export const getCcmControlTests = () => ccmService.getControlTests();

export const createCcmControlTest = (
  payload: Parameters<typeof ccmService.createControlTest>[0],
) => ccmService.createControlTest(payload);

export const updateCcmControlTest = (
  id: number,
  payload: Parameters<typeof ccmService.updateControlTest>[1],
) => ccmService.updateControlTest(id, payload);

export const deleteCcmControlTest = (id: number) => ccmService.deleteControlTest(id);

export const runCcmControlTest = (id: number) => ccmService.runControlTest(id);

// ==================== Results ====================

export const getCcmTestResults = (params?: { test_id?: number; limit?: number }) =>
  ccmService.getTestResults(params);

// ==================== Health ====================

export const getCcmControlHealth = () => ccmService.getControlHealth();

// ==================== Alerts ====================

export const getCcmAlerts = (params?: { status?: string }) => ccmService.getAlerts(params);

export const updateCcmAlert = (
  id: number,
  payload: { status: "acknowledged" | "resolved"; message?: string },
) => ccmService.updateAlert(id, payload);
