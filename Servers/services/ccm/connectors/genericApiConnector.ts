import { BaseConnector, TestExecutionResult } from "./baseConnector";

/**
 * Generic API Connector for CCM
 *
 * Supports any REST API endpoint with configurable HTTP method,
 * headers, query params, and JSON path assertions.
 */

export class GenericApiConnector extends BaseConnector {
  readonly type = "generic_api";
  readonly displayName = "Generic API";
  readonly supportedTestTypes = ["http_assertion"];

  async testConnection(): Promise<{ success: boolean; message?: string }> {
    try {
      const url = this.config.baseUrl as string;
      if (!url) {
        return { success: false, message: "Missing baseUrl in connector config" };
      }

      const response = await fetch(url, {
        method: "GET",
        headers: this.buildHeaders(),
      });

      if (response.ok) {
        return { success: true, message: `Connected to ${url}` };
      }
      return {
        success: false,
        message: `Connection test returned ${response.status}: ${response.statusText}`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Connection test failed",
      };
    }
  }

  async executeTest(testConfig: Record<string, unknown>): Promise<TestExecutionResult> {
    const url = testConfig.url as string;
    const method = (testConfig.method as string) || "GET";
    const body = testConfig.body as Record<string, unknown> | undefined;
    const expectedStatus = (testConfig.expectedStatus as number) || 200;
    const jsonPath = testConfig.jsonPath as string | undefined;
    const expectedValue = testConfig.expectedValue;

    if (!url) {
      return { status: "error", message: "Missing 'url' in test config" };
    }

    try {
      const response = await fetch(url, {
        method,
        headers: {
          ...this.buildHeaders(),
          ...(testConfig.headers as Record<string, string> || {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      const responseBody = await response.text();
      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(responseBody);
      } catch {
        parsedBody = responseBody;
      }

      // Check HTTP status
      if (response.status !== expectedStatus) {
        return {
          status: "fail",
          message: `Expected status ${expectedStatus}, got ${response.status}.`,
          details: { expectedStatus, actualStatus: response.status, body: parsedBody },
        };
      }

      // Check JSON path assertion if provided
      if (jsonPath && expectedValue !== undefined) {
        const actualValue = this.getValueAtPath(parsedBody as Record<string, unknown>, jsonPath);
        if (actualValue !== expectedValue) {
          return {
            status: "fail",
            message: `JSON path '${jsonPath}' expected '${expectedValue}', got '${actualValue}'.`,
            details: { jsonPath, expectedValue, actualValue, body: parsedBody },
          };
        }
      }

      return {
        status: "pass",
        message: `HTTP ${response.status} matched expected status${jsonPath ? ` and JSON path '${jsonPath}'` : ""}.`,
        details: { status: response.status, body: parsedBody },
      };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "HTTP request failed",
      };
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    } else if (this.config.authorizationHeader) {
      headers["Authorization"] = this.config.authorizationHeader as string;
    }

    const extraHeaders = this.config.headers as Record<string, string>;
    if (extraHeaders) {
      Object.assign(headers, extraHeaders);
    }

    return headers;
  }

  private getValueAtPath(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split(".");
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }
}
