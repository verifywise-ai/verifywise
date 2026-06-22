/**
 * Phase 3 — Agent Network Configuration
 *
 * Thin facade over `network/agentRegistry`. The original implementation
 * was scaffolded around the @mastra/core network primitive but never
 * adopted at runtime, so the package was removed; this file kept its
 * shape so existing call sites still compile.
 */

import { getAllAgents, getRegistryStatus } from "./agentRegistry";
import { logStructured } from "../../utils/logger/fileLogger";

const fileName = "agentNetwork.ts";

let networkInitialized = false;

/**
 * Initialize the agent network.
 * Called on server startup after all agents are registered.
 */
export function initializeNetwork(): void {
  if (networkInitialized) return;

  const status = getRegistryStatus();
  logStructured(
    "successful",
    `agent network initialized: ${status.totalAgents} agents, ${status.healthyAgents} healthy`,
    "initializeNetwork",
    fileName,
  );

  networkInitialized = true;
}

/**
 * Get network status summary.
 */
export function getNetworkStatus(): {
  initialized: boolean;
  agents: ReturnType<typeof getRegistryStatus>;
} {
  return {
    initialized: networkInitialized,
    agents: getRegistryStatus(),
  };
}

/**
 * Shutdown the agent network gracefully.
 */
export function shutdownNetwork(): void {
  logStructured("successful", "agent network shutdown", "shutdownNetwork", fileName);
  networkInitialized = false;
}
