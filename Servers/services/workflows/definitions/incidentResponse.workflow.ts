/**
 * Phase 6 — incident_response workflow definition (issue 3813).
 *
 * Trigger: incident.severity = critical.
 *
 * Steps (Incident + Risk + Compliance agents):
 *   1. classify_incident       — load the incident, decide if it is critical.
 *                                 Non-critical incidents short-circuit the run
 *                                 (skip); only critical incidents proceed.
 *   2. link_related_risks       — pull risks that relate to the incident so the
 *                                 remediation/escalation steps have context.
 *   3. create_remediation_tasks — WRITE. Gated: returns a pause result so the
 *                                 engine parks the run in 'awaiting_approval'
 *                                 before any task is created.
 *   4. escalate_notify_admins   — WRITE. Gated: returns a pause result so the
 *                                 escalation/notification is approved first.
 *
 * Read steps call the real domain tool maps; write steps gate for approval per
 * the engine's contract rather than mutating state inline.
 */

import { WorkflowContext, WorkflowDefinition, StepResult } from "../types";
import { availableIncidentTools } from "../../../advisor/functions/incidentFunctions";
import { availableRiskTools } from "../../../advisor/functions/riskFunctions";
import { requestGateApproval } from "../approvalGate";

/** Severity values that count as a critical-tier incident. */
const CRITICAL_SEVERITIES = new Set(["very serious", "critical"]);

function isCriticalSeverity(severity: unknown): boolean {
  return typeof severity === "string" && CRITICAL_SEVERITIES.has(severity.toLowerCase());
}

/**
 * Step 1 — classify the incident and decide whether the response runs.
 * The trigger only fires for critical incidents, so this also acts as a guard:
 * a non-critical (or missing) incident skips the rest of the workflow.
 */
async function classifyIncident(ctx: WorkflowContext): Promise<StepResult> {
  const incidentId = ctx.triggerPayload.incidentId as number | undefined;
  const incidents = (await availableIncidentTools.fetch_incidents(
    { limit: 50 },
    ctx.organizationId,
  )) as Array<{ id: number; severity?: string; type?: string }>;

  const incident = incidents.find((i) => i.id === incidentId);
  if (!incident) {
    return { type: "skip", reason: `Incident ${incidentId ?? "?"} not found` };
  }

  const severity = incident.severity ?? (ctx.triggerPayload.severity as string | undefined);
  if (!isCriticalSeverity(severity)) {
    return {
      type: "skip",
      reason: `Incident ${incident.id} is not critical (${severity ?? "unknown"})`,
    };
  }

  return {
    type: "ok",
    output: {
      incidentId: incident.id,
      severity,
      type: incident.type,
      isCritical: true,
    },
  };
}

/**
 * Step 2 — find risks related to the incident so remediation has context.
 */
async function linkRelatedRisks(ctx: WorkflowContext): Promise<StepResult> {
  const risks = (await availableRiskTools.fetch_risks({ limit: 50 }, ctx.organizationId)) as Array<{
    id: number;
    risk_name?: string;
  }>;

  return {
    type: "ok",
    output: {
      relatedRiskCount: risks.length,
      relatedRiskIds: risks.map((r) => r.id),
    },
  };
}

/**
 * Step 3 — create remediation tasks. WRITE: gated for approval.
 *
 * Pauses on first visit; on the post-approval resume (resumedApprovalId set)
 * the engine re-runs this step, which then records the approved outcome rather
 * than pausing again.
 */
async function createRemediationTasks(ctx: WorkflowContext): Promise<StepResult> {
  const classification = ctx.results.classify_incident as { incidentId?: number } | undefined;
  if (!ctx.resumedApprovalId) {
    return requestGateApproval(
      ctx,
      "incident_response",
      "create_remediation_tasks",
      `Approve creation of remediation tasks for incident ${classification?.incidentId ?? "?"}`,
    );
  }
  return {
    type: "ok",
    output: { remediation_tasks_approved: true, incidentId: classification?.incidentId ?? null },
  };
}

/**
 * Step 4 — escalate and notify admins. WRITE: gated for approval.
 *
 * Pauses on first visit; proceeds on the post-approval resume.
 */
async function escalateNotifyAdmins(ctx: WorkflowContext): Promise<StepResult> {
  const classification = ctx.results.classify_incident as { incidentId?: number } | undefined;
  if (!ctx.resumedApprovalId) {
    return requestGateApproval(
      ctx,
      "incident_response",
      "escalate_notify_admins",
      `Approve admin escalation for critical incident ${classification?.incidentId ?? "?"}`,
    );
  }
  return {
    type: "ok",
    output: { escalation_approved: true, incidentId: classification?.incidentId ?? null },
  };
}

export const incidentResponseWorkflow: WorkflowDefinition = {
  id: "incident_response",
  name: "Critical Incident Response",
  triggerName: "incident.critical",
  agents: ["incident", "risk", "compliance"],
  steps: [
    {
      id: "classify_incident",
      description: "Classify the incident and confirm it is critical",
      agent: "incident",
      isWrite: false,
      handler: classifyIncident,
    },
    {
      id: "link_related_risks",
      description: "Link risks related to the incident",
      agent: "risk",
      isWrite: false,
      handler: linkRelatedRisks,
    },
    {
      id: "create_remediation_tasks",
      description: "Create remediation tasks for the incident",
      agent: "compliance",
      isWrite: true,
      handler: createRemediationTasks,
    },
    {
      id: "escalate_notify_admins",
      description: "Escalate and notify admins",
      agent: "incident",
      isWrite: true,
      handler: escalateNotifyAdmins,
    },
  ],
};
