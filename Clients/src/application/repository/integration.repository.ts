import { apiServices } from "../../infrastructure/api/networkServices";

/**
 * Integration Repository
 * Handles integration-related API calls (MLflow, Slack, etc.)
 */

// MLflow Types
interface MlflowConfigResponse {
  configured: boolean;
  config?: {
    lastTestStatus?: "success" | "error";
    lastTestedAt?: string;
    tracking_uri?: string;
  };
}

interface MlflowSyncStatusResponse {
  success: boolean;
  data: {
    configured: boolean;
    lastSyncedAt: string | null;
    lastSyncStatus: "success" | "partial" | "error" | null;
    lastSyncMessage: string | null;
    lastTestStatus: "success" | "error" | null;
    lastTestedAt: string | null;
    lastTestMessage: string | null;
    lastSuccessfulTestAt: string | null;
    lastFailedTestAt: string | null;
    lastFailedTestMessage: string | null;
  };
}

interface MlflowModelsResponse {
  configured: boolean;
  connected?: boolean;
  models: any[];
  message?: string;
  error?: string;
}

interface MlflowTestResponse {
  success: boolean;
  message?: string;
  error?: string;
}

interface MlflowConfigureData {
  tracking_uri: string;
}

interface MlflowTestData {
  trackingServerUrl?: string;
  authMethod?: string;
  username?: string;
  password?: string;
  apiToken?: string;
  timeout?: number;
  verifySsl?: boolean;
}

/**
 * Get MLflow configuration status
 *
 * @param {AbortSignal} signal - Optional abort signal for cancellation
 * @returns {Promise<MlflowConfigResponse>} The MLflow configuration
 */
export async function getMlflowConfig({
  signal,
}: {
  signal?: AbortSignal;
} = {}): Promise<MlflowConfigResponse> {
  const response = await apiServices.get<MlflowConfigResponse>("/integrations/mlflow/config", {
    signal,
  });
  return response.data;
}

/**
 * Get MLflow sync status
 *
 * @param {AbortSignal} signal - Optional abort signal for cancellation
 * @returns {Promise<MlflowSyncStatusResponse>} The sync status
 */
export async function getMlflowSyncStatus({
  signal,
}: {
  signal?: AbortSignal;
} = {}): Promise<MlflowSyncStatusResponse> {
  const response = await apiServices.get<MlflowSyncStatusResponse>(
    "/integrations/mlflow/sync-status",
    { signal },
  );
  return response.data;
}

/**
 * Get MLflow models
 *
 * @param {AbortSignal} signal - Optional abort signal for cancellation
 * @returns {Promise<MlflowModelsResponse>} The models data
 */
export async function getMlflowModels({
  signal,
}: {
  signal?: AbortSignal;
} = {}): Promise<MlflowModelsResponse> {
  const response = await apiServices.get<MlflowModelsResponse>("/integrations/mlflow/models", {
    signal,
  });
  return response.data;
}

/**
 * Test MLflow connection with given configuration
 *
 * @param {MlflowTestData} data - The configuration data to test
 * @returns {Promise<MlflowTestResponse>} The test result
 */
export async function testMlflowConnection(data: MlflowTestData): Promise<MlflowTestResponse> {
  const response = await apiServices.post<MlflowTestResponse>("/integrations/mlflow/test", data);
  return response.data;
}

/**
 * Configure MLflow integration
 *
 * @param {MlflowConfigureData} data - The configuration data
 * @returns {Promise<any>} The configuration result
 */
export async function configureMlflow(data: MlflowConfigureData): Promise<any> {
  const response = await apiServices.post("/integrations/mlflow/configure", data);
  return response.data;
}

/**
 * Trigger MLflow sync
 *
 * @returns {Promise<any>} The sync result
 */
export async function triggerMlflowSync(): Promise<any> {
  const response = await apiServices.post("/integrations/mlflow/sync", {});
  return response.data;
}
