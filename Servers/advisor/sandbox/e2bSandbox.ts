/**
 * Phase 3 — E2B Sandbox (Firecracker microVM)
 *
 * Provides secure execution environments for untrusted operations:
 * - Code execution from AI-generated scripts
 * - Document parsing of untrusted uploads
 * - External API calls to untrusted services
 */

import { logStructured } from "../../utils/logger/fileLogger";

const fileName = "e2bSandbox.ts";

interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  error?: string;
}

/**
 * Execute code in an E2B Firecracker microVM sandbox.
 * Returns null if E2B is not configured.
 */
export async function executeInE2B(
  code: string,
  language: "python" | "javascript" = "python",
  timeoutMs: number = 30000,
  memoryMb: number = 256,
): Promise<SandboxResult | null> {
  const apiKey = process.env.E2B_API_KEY;
  if (!apiKey) {
    logStructured(
      "successful",
      "E2B not configured (missing E2B_API_KEY), skipping sandbox",
      "executeInE2B",
      fileName,
    );
    return null;
  }

  const startTime = Date.now();

  try {
    // Dynamic import to avoid requiring E2B when not configured
    const { Sandbox } = await import("@e2b/code-interpreter");

    const sandbox = await Sandbox.create({
      apiKey,
      timeoutMs,
    });

    try {
      const execution = await sandbox.runCode(code);

      return {
        stdout: execution.logs.stdout.map((l: any) => l.line).join("\n"),
        stderr: execution.logs.stderr.map((l: any) => l.line).join("\n"),
        exitCode: execution.error ? 1 : 0,
        duration: Date.now() - startTime,
        error: execution.error?.message,
      };
    } finally {
      await sandbox.kill();
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    logStructured("error", `E2B execution failed: ${errorMsg}`, "executeInE2B", fileName);
    return {
      stdout: "",
      stderr: errorMsg,
      exitCode: 1,
      duration: Date.now() - startTime,
      error: errorMsg,
    };
  }
}

/**
 * Check if E2B is available and configured.
 */
export function isE2BAvailable(): boolean {
  return !!process.env.E2B_API_KEY;
}
