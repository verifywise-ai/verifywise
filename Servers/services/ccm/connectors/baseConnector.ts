/**
 * Base Connector Interface for Continuous Control Monitoring
 *
 * All integration connectors must implement this interface.
 */

export interface TestExecutionResult {
  status: "pass" | "fail" | "error";
  message: string;
  details?: Record<string, unknown>;
  evidence?: {
    filename: string;
    content: Buffer;
    mimeType: string;
  };
}

export interface ConnectorConfig {
  [key: string]: unknown;
}

export abstract class BaseConnector {
  abstract readonly type: string;
  abstract readonly displayName: string;
  abstract readonly supportedTestTypes: string[];

  protected config: ConnectorConfig = {};

  async initialize(config: ConnectorConfig): Promise<void> {
    this.config = config;
  }

  abstract testConnection(): Promise<{ success: boolean; message?: string }>;

  abstract executeTest(testConfig: Record<string, unknown>): Promise<TestExecutionResult>;

  async disconnect(): Promise<void> {
    // Default no-op; override if cleanup is needed
  }
}
