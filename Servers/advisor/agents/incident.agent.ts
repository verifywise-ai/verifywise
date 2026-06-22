/**
 * Phase 3 — Incident Agent
 *
 * Handles incident management, root cause analysis,
 * remediation playbooks, and incident pattern detection.
 */

import { createDomainAgent } from "./baseAgent";

export function registerIncidentAgent() {
  return createDomainAgent({
    name: "incident-agent",
    description:
      "Incident management specialist — classification, root cause analysis, remediation",
    domains: ["incident"],
    keywords: [
      "incident",
      "breach",
      "security event",
      "root cause",
      "remediation",
      "post-mortem",
      "outage",
      "data breach",
      "security incident",
      "incident response",
      "containment",
      "recovery",
      "lessons learned",
    ],
    tools: [
      // Read tools
      "fetch_incidents",
      "get_incident_by_id",
      "get_incident_analytics",
      "get_incident_changes_history",
      "search_incidents",
      "get_incident_timeline",
      "get_incident_related_tasks",
      "get_incident_impact_assessment",
      // Write tools
      "agent_create_incident",
      "agent_update_incident",
      "agent_delete_incident",
      "agent_archive_incident",
      "agent_update_incident_status",
    ],
    systemPromptSuffix: `You are an incident management and response expert. When handling incidents:
- Classify incidents by severity and impact
- Guide through incident response phases: detect → contain → eradicate → recover → learn
- Perform root cause analysis using 5-Why or fishbone methodology
- Suggest preventive measures to avoid recurrence
- Track SLA compliance for incident resolution times
- Flag patterns across multiple incidents`,
  });
}
