/**
 * Phase 3 — Agent network bootstrap.
 *
 * `bootstrapAgentNetwork()` must register every specialized agent exactly
 * once at server startup so the registries aren't empty at runtime. The
 * eight domain agents flow through two registries:
 *   - network/agentRegistry (RegisteredAgent): risk, compliance, vendor,
 *     policy, incident, model + coordinator.
 *   - agents/agentRegistry (AgentDefinition): evidence, control-assessment.
 *
 * These tests assert both registries are populated and that repeated calls
 * are idempotent (no duplicate registrations).
 */

import { describe, expect, it, beforeAll } from "@jest/globals";
import { bootstrapAgentNetwork, getNetworkStatus } from "../agentNetwork";
import { getAllAgents } from "../agentRegistry";
import { listAgents } from "../../agents/agentRegistry";
import { AGENT_TOOL_MAP } from "../../agents/agentToolMap";

// network-registry agents (RegisteredAgent: name + capabilities.tools)
const NETWORK_DOMAIN_AGENTS = [
  "risk-agent",
  "compliance-agent",
  "vendor-agent",
  "policy-agent",
  "incident-agent",
  "model-agent",
] as const;

// agents-registry agents (AgentDefinition: name + tools ToolSet)
const DEFINITION_AGENTS = ["evidence-agent", "control-assessment-agent"] as const;

describe("bootstrapAgentNetwork", () => {
  beforeAll(() => {
    bootstrapAgentNetwork();
  });

  it("marks the network as initialized", () => {
    expect(getNetworkStatus().initialized).toBe(true);
  });

  it("registers the six network-registry domain agents with non-empty tool lists", () => {
    const byName = new Map(getAllAgents().map((a) => [a.name, a]));
    for (const name of NETWORK_DOMAIN_AGENTS) {
      const agent = byName.get(name);
      expect(agent).toBeDefined();
      expect(agent!.name).toBe(name);
      expect(agent!.capabilities.tools.length).toBeGreaterThan(0);
    }
  });

  it("registers each network-registry domain agent with its AGENT_TOOL_MAP tools", () => {
    // The *.agent.ts files read their tools from AGENT_TOOL_MAP by name; a
    // renamed agent there would register with no tools instead of failing.
    const byName = new Map(getAllAgents().map((a) => [a.name, a]));
    for (const name of NETWORK_DOMAIN_AGENTS) {
      const mapped = AGENT_TOOL_MAP.find((a) => a.name === name);
      expect(mapped).toBeDefined();
      expect(byName.get(name)?.capabilities.tools).toEqual(mapped!.tools);
    }
  });

  it("registers the coordinator agent", () => {
    const coordinator = getAllAgents().find((a) => a.name === "coordinator");
    expect(coordinator).toBeDefined();
    expect(coordinator!.name).toBe("coordinator");
  });

  it("registers the two definition-registry domain agents with non-empty tool sets", () => {
    const byName = new Map(listAgents().map((a) => [a.name, a]));
    for (const name of DEFINITION_AGENTS) {
      const agent = byName.get(name);
      expect(agent).toBeDefined();
      expect(agent!.name).toBe(name);
      expect(Object.keys(agent!.tools).length).toBeGreaterThan(0);
    }
  });

  it("registers all eight domain agents plus coordinator across both registries", () => {
    const networkNames = getAllAgents().map((a) => a.name);
    const definitionNames = listAgents().map((a) => a.name);

    for (const name of NETWORK_DOMAIN_AGENTS) {
      expect(networkNames).toContain(name);
    }
    expect(networkNames).toContain("coordinator");
    for (const name of DEFINITION_AGENTS) {
      expect(definitionNames).toContain(name);
    }
  });

  it("is idempotent — repeated calls do not duplicate registrations", () => {
    const networkCountBefore = getAllAgents().length;
    const definitionCountBefore = listAgents().length;

    bootstrapAgentNetwork();
    bootstrapAgentNetwork();

    expect(getAllAgents().length).toBe(networkCountBefore);
    expect(listAgents().length).toBe(definitionCountBefore);
  });
});
