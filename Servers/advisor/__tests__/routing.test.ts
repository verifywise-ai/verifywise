/**
 * Tool routing — selectActiveTools tests.
 *
 * Pure-logic suite: no DB, no LLM. Verifies the keyword router picks the
 * right agent(s), respects the feature flag, and returns the full
 * catalogue under all the documented fallback conditions.
 */

import { describe, expect, it } from "@jest/globals";
import { selectActiveTools } from "../routing";

/**
 * Build a master catalogue large enough to make subsetting visible.
 * We mix tools from a few agents plus several "universal" ones (no agent
 * claims them in AGENT_TOOL_MAP), so the router must keep universals.
 */
const MASTER_DEF = [
  // Risk agent
  { type: "function", function: { name: "fetch_risks", description: "", parameters: {} } },
  { type: "function", function: { name: "agent_create_risk", description: "", parameters: {} } },
  { type: "function", function: { name: "get_risk_analytics", description: "", parameters: {} } },
  // Vendor agent
  { type: "function", function: { name: "fetch_vendors", description: "", parameters: {} } },
  { type: "function", function: { name: "get_vendor_analytics", description: "", parameters: {} } },
  // Compliance agent
  {
    type: "function",
    function: { name: "get_compliance_overview", description: "", parameters: {} },
  },
  {
    type: "function",
    function: { name: "fetch_eu_ai_act_categories", description: "", parameters: {} },
  },
  // Universal — not claimed by any agent in AGENT_TOOL_MAP
  { type: "function", function: { name: "global_search", description: "", parameters: {} } },
  { type: "function", function: { name: "create_note", description: "", parameters: {} } },
  { type: "function", function: { name: "send_notification", description: "", parameters: {} } },
  { type: "function", function: { name: "trigger_automation", description: "", parameters: {} } },
];

const MASTER_AVAILABLE = MASTER_DEF.reduce<Record<string, () => Promise<unknown>>>((acc, def) => {
  acc[def.function.name] = async () => ({ ok: true });
  return acc;
}, {});

function names(defs: Array<{ function?: { name?: string }; name?: string }>) {
  return defs.map((d) => d?.function?.name ?? (d as { name?: string }).name ?? "");
}

/* ------------------------------------------------------------------ */
/* Happy path — single agent match                                    */
/* ------------------------------------------------------------------ */

describe("routing / selectActiveTools — single agent match", () => {
  it("picks vendor-agent for a vendor query and keeps universals", async () => {
    const result = await selectActiveTools({
      // Pure vendor language — no "risk", no "compliance" etc., so risk
      // and compliance agents shouldn't be selected.
      message: "List all my vendors and their SLA status",
      availableTools: MASTER_AVAILABLE,
      toolsDefinition: MASTER_DEF,
    });

    expect(result.reason).toBe("subset_keyword_match");
    expect(result.selectedAgents).toContain("vendor-agent");
    expect(result.selectedAgents).not.toContain("risk-agent");

    const activeNames = names(result.toolsDefinition);
    // Vendor tools present:
    expect(activeNames).toEqual(expect.arrayContaining(["fetch_vendors", "get_vendor_analytics"]));
    // Universals present:
    expect(activeNames).toEqual(expect.arrayContaining(["global_search", "create_note"]));
    // Risk-specific tool NOT present (vendor query shouldn't surface risk tools):
    expect(activeNames).not.toContain("agent_create_risk");
  });

  it("picks risk-agent for a risk query", async () => {
    const result = await selectActiveTools({
      message: "Show me the latest risk register entries",
      availableTools: MASTER_AVAILABLE,
      toolsDefinition: MASTER_DEF,
    });
    expect(result.selectedAgents).toContain("risk-agent");
    expect(names(result.toolsDefinition)).toEqual(
      expect.arrayContaining(["fetch_risks", "get_risk_analytics"]),
    );
  });

  it("picks compliance-agent for an EU AI Act query", async () => {
    const result = await selectActiveTools({
      message: "What's our gap analysis for EU AI Act Article 10?",
      availableTools: MASTER_AVAILABLE,
      toolsDefinition: MASTER_DEF,
    });
    expect(result.selectedAgents).toContain("compliance-agent");
    expect(names(result.toolsDefinition)).toContain("fetch_eu_ai_act_categories");
  });
});

/* ------------------------------------------------------------------ */
/* Multi-agent overlap                                                */
/* ------------------------------------------------------------------ */

describe("routing / selectActiveTools — multi-agent overlap", () => {
  it("includes both risk and vendor tools when both are mentioned", async () => {
    const result = await selectActiveTools({
      message: "Vendor risk assessment for our top suppliers",
      availableTools: MASTER_AVAILABLE,
      toolsDefinition: MASTER_DEF,
    });
    expect(result.reason).toBe("subset_keyword_match");
    expect(result.selectedAgents).toEqual(expect.arrayContaining(["vendor-agent", "risk-agent"]));
    const activeNames = names(result.toolsDefinition);
    expect(activeNames).toContain("fetch_vendors");
    expect(activeNames).toContain("fetch_risks");
  });

  it("respects topK cap", async () => {
    const result = await selectActiveTools({
      message: "vendor risk compliance audit incident model policy training",
      availableTools: MASTER_AVAILABLE,
      toolsDefinition: MASTER_DEF,
      topK: 2,
    });
    expect(result.selectedAgents.length).toBeLessThanOrEqual(2);
  });
});

/* ------------------------------------------------------------------ */
/* Fallbacks                                                          */
/* ------------------------------------------------------------------ */

describe("routing / selectActiveTools — fallbacks", () => {
  it("returns full catalogue when feature flag is disabled", async () => {
    const result = await selectActiveTools({
      message: "How many vendors do I have?",
      availableTools: MASTER_AVAILABLE,
      toolsDefinition: MASTER_DEF,
      enabled: false,
    });
    expect(result.reason).toBe("fallback_disabled");
    expect(result.toolsDefinition).toHaveLength(MASTER_DEF.length);
    expect(result.selectedAgents).toEqual([]);
  });

  it("returns full catalogue for empty/short messages", async () => {
    const empty = await selectActiveTools({
      message: "",
      availableTools: MASTER_AVAILABLE,
      toolsDefinition: MASTER_DEF,
    });
    expect(empty.reason).toBe("fallback_empty_message");

    const short = await selectActiveTools({
      message: "hi",
      availableTools: MASTER_AVAILABLE,
      toolsDefinition: MASTER_DEF,
    });
    expect(short.reason).toBe("fallback_empty_message");
  });

  it("returns full catalogue when no agent keywords match", async () => {
    const result = await selectActiveTools({
      message: "What is the meaning of life?",
      availableTools: MASTER_AVAILABLE,
      toolsDefinition: MASTER_DEF,
    });
    expect(result.reason).toBe("fallback_no_match");
    expect(result.toolsDefinition).toHaveLength(MASTER_DEF.length);
  });

  it("falls back when subset would be too small", async () => {
    // Only universal tools, no agent-claimed tools — even with a vendor
    // keyword in the message, subset = universals (4 tools), which is
    // smaller than the default minActiveTools (6) → fallback.
    const universalOnly = MASTER_DEF.filter(
      (d) =>
        d.function.name === "global_search" ||
        d.function.name === "create_note" ||
        d.function.name === "send_notification" ||
        d.function.name === "trigger_automation",
    );
    const universalAvailable: Record<string, () => Promise<unknown>> = {};
    for (const d of universalOnly) {
      universalAvailable[d.function.name] = async () => ({ ok: true });
    }

    const result = await selectActiveTools({
      message: "Vendor risk assessment",
      availableTools: universalAvailable,
      toolsDefinition: universalOnly,
    });
    expect(result.reason).toBe("fallback_too_few_tools");
  });
});

/* ------------------------------------------------------------------ */
/* Tool count metrics                                                 */
/* ------------------------------------------------------------------ */

describe("routing / selectActiveTools — metrics", () => {
  it("reports active < full when subsetting succeeds", async () => {
    const result = await selectActiveTools({
      message: "vendor due diligence",
      availableTools: MASTER_AVAILABLE,
      toolsDefinition: MASTER_DEF,
    });
    expect(result.metrics.fullCount).toBe(MASTER_DEF.length);
    expect(result.metrics.activeCount).toBeLessThanOrEqual(MASTER_DEF.length);
    expect(result.metrics.universalCount).toBeGreaterThan(0);
  });

  it("reports active === full on fallback", async () => {
    const result = await selectActiveTools({
      message: "",
      availableTools: MASTER_AVAILABLE,
      toolsDefinition: MASTER_DEF,
    });
    expect(result.metrics.activeCount).toBe(MASTER_DEF.length);
    expect(result.metrics.fullCount).toBe(MASTER_DEF.length);
  });
});

/* ------------------------------------------------------------------ */
/* Catalogue drift safety                                             */
/* ------------------------------------------------------------------ */

describe("routing / selectActiveTools — catalogue drift", () => {
  it("ignores tools listed in AGENT_TOOL_MAP that aren't in the master catalogue", async () => {
    // The vendor agent claims `agent_delete_vendor` but our test catalogue
    // doesn't include it. The router must still work, just without that
    // tool — no crash, no "phantom" entries.
    const result = await selectActiveTools({
      message: "delete vendor X",
      availableTools: MASTER_AVAILABLE,
      toolsDefinition: MASTER_DEF,
    });
    const activeNames = names(result.toolsDefinition);
    expect(activeNames).not.toContain("agent_delete_vendor");
    // Sanity: vendor tools that ARE in the catalogue still come through.
    expect(activeNames).toContain("fetch_vendors");
  });
});
