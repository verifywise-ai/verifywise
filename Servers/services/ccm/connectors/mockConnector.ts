import { BaseConnector, TestExecutionResult } from "./baseConnector";

/**
 * Mock Connector — Returns successful test results for demo data.
 *
 * Useful for onboarding and demonstrations where real credentials
 * are not available.
 */
export class MockConnector extends BaseConnector {
  readonly type = "mock";
  readonly displayName = "Mock / Demo";
  readonly supportedTestTypes = ["s3_encryption", "iam_mfa", "branch_protection", "generic"];

  async testConnection(): Promise<{ success: boolean; message?: string }> {
    return { success: true, message: "Mock connector is healthy" };
  }

  async executeTest(testConfig: Record<string, unknown>): Promise<TestExecutionResult> {
    // Simulate a realistic pass result based on test config
    const expectation = testConfig?.expectation as string;
    const threshold = testConfig?.threshold as number;

    // For demo purposes, most tests pass; failures are deterministic
    const shouldFail = expectation === "count_equals" && threshold === 0 && Math.random() < 0.15;

    if (shouldFail) {
      return {
        status: "fail",
        message: "Mock test failed: found 3 items exceeding threshold",
        details: {
          found: 3,
          threshold,
          query: testConfig.query,
        },
      };
    }

    return {
      status: "pass",
      message: "Mock test passed",
      details: {
        found: 0,
        threshold,
        query: testConfig.query,
      },
    };
  }
}
