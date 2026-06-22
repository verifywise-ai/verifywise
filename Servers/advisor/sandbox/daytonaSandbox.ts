/**
 * Phase 3 — Daytona Sandbox (Docker containers)
 *
 * Provides isolated Docker containers for:
 * - Parallel execution of multiple agents
 * - Long-running agent tasks
 * - Batch processing operations
 */

import { logStructured } from "../../utils/logger/fileLogger";

const fileName = "daytonaSandbox.ts";

interface DaytonaConfig {
  cpuLimit?: number;
  memoryLimitMb?: number;
  timeoutMs?: number;
  networkEnabled?: boolean;
}

interface DaytonaResult {
  containerId: string;
  output: string;
  exitCode: number;
  duration: number;
  error?: string;
}

/**
 * Execute a task in a Daytona Docker container.
 * Returns null if Daytona is not configured.
 */
export async function executeInDaytona(
  taskFn: () => Promise<unknown>,
  config?: DaytonaConfig,
): Promise<DaytonaResult | null> {
  const apiKey = process.env.DAYTONA_API_KEY;
  const serverUrl = process.env.DAYTONA_SERVER_URL;

  if (!apiKey || !serverUrl) {
    logStructured(
      "successful",
      "Daytona not configured, executing locally",
      "executeInDaytona",
      fileName,
    );

    // Fallback: execute locally without container isolation
    const startTime = Date.now();
    try {
      const result = await taskFn();
      return {
        containerId: "local",
        output: JSON.stringify(result),
        exitCode: 0,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        containerId: "local",
        output: "",
        exitCode: 1,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  const startTime = Date.now();

  try {
    // Dynamic import
    const { Daytona } = await import("@daytonaio/sdk");

    const daytona = new Daytona({
      apiKey,
      target: "us",
    });

    const sandbox = await daytona.create({
      language: "typescript",
      envVars: {},
    });

    try {
      const response = await sandbox.process.executeCommand(
        `node -e "${JSON.stringify(taskFn.toString())}"`,
        { timeout: config?.timeoutMs || 60000 },
      );

      return {
        containerId: sandbox.id,
        output: response.result || "",
        exitCode: response.exitCode,
        duration: Date.now() - startTime,
      };
    } finally {
      await daytona.remove(sandbox);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    logStructured("error", `Daytona execution failed: ${errorMsg}`, "executeInDaytona", fileName);
    return {
      containerId: "error",
      output: "",
      exitCode: 1,
      duration: Date.now() - startTime,
      error: errorMsg,
    };
  }
}

/**
 * Check if Daytona is available.
 */
export function isDaytonaAvailable(): boolean {
  return !!(process.env.DAYTONA_API_KEY && process.env.DAYTONA_SERVER_URL);
}
