/**
 * Routing — REAL catalogue smoke test.
 *
 * Imports the actual tool sets that advisor.ctrl combines into the master
 * `availableTools` and feeds them through `selectActiveTools` with realistic
 * user queries. Asserts:
 *   - Active count < full count when an agent matches.
 *   - Selected agents include the expected ones for each domain.
 *   - Universal tools (e.g., notes / notifications) survive the subsetting.
 *
 * This is a smoke test — uses a representative slice of the real surface
 * rather than every single tool import, so the run stays fast.
 */

import { describe, expect, it } from "@jest/globals";
import { selectActiveTools } from "../routing";
import { availableRiskTools } from "../functions/riskFunctions";
import { availableModelInventoryTools } from "../functions/modelInventoryFunctions";
import { availableVendorTools } from "../functions/vendorFunctions";
import { availableIncidentTools } from "../functions/incidentFunctions";
import { availableTaskTools } from "../functions/taskFunctions";
import { availablePolicyTools } from "../functions/policyFunctions";
import { availableEvidenceTools } from "../functions/evidenceFunctions";
import { availableFrameworkTools } from "../functions/frameworkFunctions";
import { availableEvidenceAiTools } from "../functions/evidenceAiFunctions";
import { availableReadinessTools } from "../functions/readinessFunctions";
import { availableNotesTools } from "../functions/notesFunctions";
import { availableNotificationTools } from "../functions/notificationFunctions";

const availableTools: Record<string, unknown> = {
  ...availableRiskTools,
  ...availableModelInventoryTools,
  ...availableVendorTools,
  ...availableIncidentTools,
  ...availableTaskTools,
  ...availablePolicyTools,
  ...availableEvidenceTools,
  ...availableFrameworkTools,
  ...availableEvidenceAiTools,
  ...availableReadinessTools,
  ...availableNotesTools,
  ...availableNotificationTools,
};

const toolsDefinition = Object.keys(availableTools).map((name) => ({
  type: "function",
  function: { name, description: `tool ${name}`, parameters: {} },
}));

describe("routing / real catalogue smoke", () => {
  const FULL = toolsDefinition.length;

  it("the synthesized catalogue is non-trivial in size (sanity)", async () => {
    // Sanity: if the imports change shape later, fail loudly here.
    expect(FULL).toBeGreaterThan(60);
  });

  it("OBSERVABILITY: log routing metrics for sample queries", async () => {
    const samples = [
      "List all my vendors and their SLA status",
      "Show me the risk register entries for our top projects",
      "What's our gap analysis for EU AI Act Article 10?",
      "Any open incidents from this week's data breach?",
      "List all foundation models in our model inventory",
      "Hello, what can you help me with?",
      "Vendor risk assessment with related compliance gap evidence",
    ];
    // eslint-disable-next-line no-console
    console.log(`\n  Full catalogue size: ${FULL} tools\n  ${"─".repeat(95)}`);
    for (const q of samples) {
      const r = await selectActiveTools({
        message: q,
        availableTools,
        toolsDefinition,
      });
      const reduction =
        r.metrics.fullCount > 0
          ? Math.round(((r.metrics.fullCount - r.metrics.activeCount) / r.metrics.fullCount) * 100)
          : 0;
      // eslint-disable-next-line no-console
      console.log(
        `  Q="${q.slice(0, 55).padEnd(55)}" → ${r.reason.padEnd(22)} agents=[${(r.selectedAgents.join(", ") || "—").padEnd(35)}] ${String(r.metrics.activeCount).padStart(3)}/${r.metrics.fullCount} (-${reduction}%)`,
      );
    }
    // eslint-disable-next-line no-console
    console.log(`  ${"─".repeat(95)}\n`);
    expect(true).toBe(true); // observability-only test
  });

  it("vendor query selects vendor-agent and reduces the catalogue", async () => {
    const r = await selectActiveTools({
      message: "List all my vendors and their SLA status",
      availableTools,
      toolsDefinition,
    });
    expect(r.reason).toBe("subset_keyword_match");
    expect(r.selectedAgents).toContain("vendor-agent");
    expect(r.metrics.activeCount).toBeLessThan(FULL);
    expect(r.metrics.universalCount).toBeGreaterThan(0);
  });

  it("risk query selects risk-agent", async () => {
    const r = await selectActiveTools({
      message: "Show me the risk register entries for our top projects",
      availableTools,
      toolsDefinition,
    });
    expect(r.reason).toBe("subset_keyword_match");
    expect(r.selectedAgents).toContain("risk-agent");
    expect(r.metrics.activeCount).toBeLessThan(FULL);
  });

  it("compliance query selects compliance-agent", async () => {
    const r = await selectActiveTools({
      message: "What's our gap analysis for EU AI Act Article 10?",
      availableTools,
      toolsDefinition,
    });
    expect(r.reason).toBe("subset_keyword_match");
    expect(r.selectedAgents).toContain("compliance-agent");
  });

  it("incident query selects incident-agent", async () => {
    const r = await selectActiveTools({
      message: "Any open incidents from this week's data breach?",
      availableTools,
      toolsDefinition,
    });
    expect(r.reason).toBe("subset_keyword_match");
    expect(r.selectedAgents).toContain("incident-agent");
  });

  it("model query selects model-agent", async () => {
    const r = await selectActiveTools({
      message: "List all foundation models in our model inventory",
      availableTools,
      toolsDefinition,
    });
    expect(r.reason).toBe("subset_keyword_match");
    expect(r.selectedAgents).toContain("model-agent");
  });

  it("greeting falls back to full catalogue", async () => {
    const r = await selectActiveTools({
      message: "Hello, what can you help me with?",
      availableTools,
      toolsDefinition,
    });
    expect(r.reason).toBe("fallback_no_match");
    expect(r.metrics.activeCount).toBe(FULL);
  });

  it("multi-domain query produces a larger but still reduced subset", async () => {
    const r = await selectActiveTools({
      message: "Vendor risk assessment with related compliance gap evidence",
      availableTools,
      toolsDefinition,
    });
    expect(r.reason).toBe("subset_keyword_match");
    // At least 2 agents picked up
    expect(r.selectedAgents.length).toBeGreaterThanOrEqual(2);
    // Still smaller than full
    expect(r.metrics.activeCount).toBeLessThan(FULL);
  });
});
