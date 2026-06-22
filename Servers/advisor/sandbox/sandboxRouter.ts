/**
 * Phase 3 — Sandbox Router
 *
 * Decides which sandbox (if any) to use for a given operation.
 */

import { isE2BAvailable } from "./e2bSandbox";
import { isDaytonaAvailable } from "./daytonaSandbox";

export type SandboxType = "none" | "e2b" | "daytona";

interface SandboxDecision {
  sandbox: SandboxType;
  reason: string;
}

/**
 * Determine which sandbox to use for an operation.
 */
export function decideSandbox(params: {
  operationType: string;
  isUntrustedInput: boolean;
  isParallel: boolean;
  isLongRunning: boolean;
  toolName?: string;
}): SandboxDecision {
  const { operationType, isUntrustedInput, isParallel, isLongRunning, toolName } = params;

  // Code execution → E2B (Firecracker microVM)
  if (operationType === "code_execution") {
    if (isE2BAvailable()) {
      return { sandbox: "e2b", reason: "Code execution requires VM-level isolation" };
    }
    return { sandbox: "none", reason: "E2B not configured, code execution blocked" };
  }

  // Untrusted file parsing → E2B
  if (isUntrustedInput && (toolName?.includes("parse") || toolName?.includes("upload"))) {
    if (isE2BAvailable()) {
      return { sandbox: "e2b", reason: "Untrusted file parsing requires isolation" };
    }
    return { sandbox: "none", reason: "E2B not configured, proceeding without isolation" };
  }

  // External API calls → E2B
  if (operationType === "external_api" && isUntrustedInput) {
    if (isE2BAvailable()) {
      return { sandbox: "e2b", reason: "Untrusted external API call requires isolation" };
    }
  }

  // Parallel multi-agent tasks → Daytona
  if (isParallel && isDaytonaAvailable()) {
    return { sandbox: "daytona", reason: "Parallel execution benefits from container isolation" };
  }

  // Long-running batch tasks → Daytona
  if (isLongRunning && isDaytonaAvailable()) {
    return { sandbox: "daytona", reason: "Long-running task benefits from container isolation" };
  }

  // Standard operations → no sandbox needed
  return { sandbox: "none", reason: "Standard operation, no isolation needed" };
}

/**
 * Get sandbox availability status.
 */
export function getSandboxStatus(): Record<string, boolean> {
  return {
    e2b: isE2BAvailable(),
    daytona: isDaytonaAvailable(),
  };
}
