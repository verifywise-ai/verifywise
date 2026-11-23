import { describe, expect, it } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { AGENT_TOOL_MAP } from "../agentToolMap";

/**
 * Every tool an agent claims must be a real Advisor tool: the router keeps
 * only claimed tools when an agent matches, so a misspelt or renamed name
 * silently hides the real tool from that domain.
 *
 * The real names are every tool definition in advisor/tools, the same files
 * advisor.ctrl.ts builds the catalogue from.
 */

const TOOLS_DIR = path.join(__dirname, "../../tools");

function realToolNames(): Set<string> {
  const names = new Set<string>();
  for (const file of fs.readdirSync(TOOLS_DIR).filter((f) => /Tools\.ts$/.test(f))) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const exported = require(path.join(TOOLS_DIR, file)) as Record<string, unknown>;
    for (const value of Object.values(exported)) {
      if (!Array.isArray(value)) continue;
      for (const tool of value) {
        const name = (tool as { function?: { name?: unknown } })?.function?.name;
        if (typeof name === "string") names.add(name);
      }
    }
  }
  return names;
}

/**
 * Names that were already unknown when this check was added. They are listed
 * so the check can guard against new drift without fixing every agent at
 * once. Remove a name here when its entry is corrected; never add one.
 */
const KNOWN_STALE: Record<string, string[]> = {
  "risk-agent": [
    "get_risk_by_id",
    "get_risk_distribution",
    "fetch_risk_categories",
    "get_risk_summary",
    "get_risk_changes_history",
    "search_risks",
    "get_quantitative_risk_details",
    "get_risk_benchmarks",
    "get_model_risk_by_id",
    "get_model_risk_changes_history",
    "agent_create_model_risk",
  ],
  "vendor-agent": [
    "get_vendor_by_id",
    "get_vendor_risk_by_id",
    "get_vendor_risk_analytics",
    "get_vendor_changes_history",
    "search_vendors",
    "get_vendor_risk_changes_history",
    "get_vendor_compliance_status",
    "get_vendor_review_schedule",
    "get_vendor_risk_summary",
  ],
  "compliance-agent": [
    "get_compliance_overview",
    "get_compliance_gaps",
    "get_framework_progress",
    "get_control_readiness",
    "get_control_readiness_detail",
    "fetch_eu_ai_act_categories",
    "get_eu_ai_act_progress",
    "fetch_iso42001_categories",
    "fetch_iso27001_categories",
    "fetch_nist_ai_rmf_categories",
    "get_nist_ai_rmf_progress",
    "get_evidence_analysis",
    "get_control_readiness_analysis",
    "fetch_audit_ledger_entries",
    "get_audit_ledger_stats",
    "agent_update_eu_ai_act_assessment",
    "agent_submit_eu_ai_act_evidence",
    "agent_update_iso42001_assessment",
    "agent_submit_iso42001_evidence",
    "agent_update_iso27001_assessment",
    "agent_submit_iso27001_evidence",
    "agent_update_nist_ai_rmf_assessment",
    "agent_update_ce_marking_status",
  ],
  "incident-agent": [
    "get_incident_by_id",
    "get_incident_changes_history",
    "search_incidents",
    "get_incident_timeline",
    "get_incident_related_tasks",
    "get_incident_impact_assessment",
  ],
  "model-agent": [
    "fetch_model_inventory",
    "get_model_inventory_by_id",
    "get_model_inventory_changes_history",
    "search_model_inventory",
    "get_model_lifecycle_status",
    "get_model_deployment_info",
    "get_dataset_by_id",
    "get_dataset_changes_history",
    "get_model_risk_by_id",
    "agent_register_model",
  ],
  "task-agent": [
    "get_task_by_id",
    "get_task_changes_history",
    "search_tasks",
    "get_overdue_tasks",
    "get_tasks_due_soon",
    "agent_complete_task",
    "agent_change_task_status",
  ],
};

describe("AGENT_TOOL_MAP tool names", () => {
  const real = realToolNames();

  it("reads the real catalogue", () => {
    expect(real.size).toBeGreaterThan(200);
  });

  it.each(AGENT_TOOL_MAP.map((agent) => [agent.name, agent.tools] as const))(
    "%s names only real tools",
    (agentName, tools) => {
      const stale = new Set(KNOWN_STALE[agentName] ?? []);
      expect(tools.filter((tool) => !real.has(tool) && !stale.has(tool))).toEqual([]);
    },
  );

  it("lists as stale only names that are still unknown and still claimed", () => {
    for (const [agentName, names] of Object.entries(KNOWN_STALE)) {
      const claimed = new Set(AGENT_TOOL_MAP.find((a) => a.name === agentName)?.tools ?? []);
      expect(names.filter((name) => real.has(name) || !claimed.has(name))).toEqual([]);
    }
  });
});
