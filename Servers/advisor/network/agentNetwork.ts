/**
 * Phase 3 — Agent Network Configuration
 *
 * Thin facade over `network/agentRegistry`. The original implementation
 * was scaffolded around the @mastra/core network primitive but never
 * adopted at runtime, so the package was removed; this file kept its
 * shape so existing call sites still compile.
 */

import { getRegistryStatus } from "./agentRegistry";
import { logStructured } from "../../utils/logger/fileLogger";
import { registerRiskAgent } from "../agents/risk.agent";
import { registerComplianceAgent } from "../agents/compliance.agent";
import { registerVendorAgent } from "../agents/vendor.agent";
import { registerPolicyAgent } from "../agents/policy.agent";
import { registerIncidentAgent } from "../agents/incident.agent";
import { registerModelAgent } from "../agents/model.agent";
import { registerEvidenceAgent } from "../agents/evidence.agent";
import { registerControlAssessmentAgent } from "../agents/controlAssessment.agent";
import { registerCoordinatorAgent } from "../agents/coordinator.agent";

const fileName = "agentNetwork.ts";

let networkInitialized = false;
let networkBootstrapped = false;

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
 * Bootstrap the multi-agent network once at server startup.
 *
 * Registers every specialized agent in its registry and initializes the
 * network. Guarded so repeated calls are a no-op (idempotent) — safe to
 * invoke unconditionally from the boot path.
 *
 * @param tenant - Organization id injected into the tenant-bound agents
 *                 (evidence, control-assessment). Their tools close over it
 *                 only when executed; defaults to 0 for the global registry.
 */
export function bootstrapAgentNetwork(tenant = 0): void {
  if (networkBootstrapped) return;

  registerRiskAgent();
  registerComplianceAgent();
  registerVendorAgent();
  registerPolicyAgent();
  registerIncidentAgent();
  registerModelAgent();
  registerEvidenceAgent(tenant);
  registerControlAssessmentAgent(tenant);
  registerCoordinatorAgent();

  initializeNetwork();

  networkBootstrapped = true;
  logStructured("successful", "agent network bootstrapped", "bootstrapAgentNetwork", fileName);
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
