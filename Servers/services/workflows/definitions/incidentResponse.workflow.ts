/**
 * Phase 6 — incident_response workflow definition (issue 3813).
 *
 * Trigger: an incident reaches the critical tier (isCriticalIncidentSeverity),
 * on create or when an update raises its severity. At most one run per
 * incident (triggerIncidentResponse).
 *
 * Steps (Incident + Risk + Compliance agents):
 *   1. classify_incident       — load the incident by id in the run's
 *                                 organization and confirm it is critical.
 *                                 A missing, archived or no longer critical
 *                                 incident ends the run (completed, no gate).
 *   2. link_related_risks       — pull risks so the later steps have context.
 *   3. create_remediation_tasks — WRITE, gated. The first visit opens an
 *                                 approval and pauses; once an Admin approves,
 *                                 the resume creates ONE remediation task for
 *                                 the incident's owner (createRemediationTask).
 *   4. escalate_notify_admins   — WRITE, gated the same way. Once approved, the
 *                                 resume notifies every Admin in the app and by
 *                                 email (notifyAdminsOfCriticalIncident). When
 *                                 any Admin could not be reached, the step opens
 *                                 a new approval to retry; approving it reaches
 *                                 only the Admins still missing.
 *
 * Both writes re-read the incident when they run: if it was deleted,
 * archived or lowered below the critical tier since, the run ends there.
 * Rejecting an approval cancels the run (engine). Each write records what it
 * did on the run, so running a step again for the same run never repeats it.
 */

import { WorkflowContext, WorkflowDefinition, StepResult } from "../types";
import { availableRiskTools } from "../../../advisor/functions/riskFunctions";
import { requestGateApproval } from "../approvalGate";
import { isCriticalIncidentSeverity } from "../../../domain.layer/enums/ai-incident-management.enum";
import {
  createRemediationTask,
  loadIncidentForResponse,
  notifyAdminsOfCriticalIncident,
  ResponseIncident,
} from "../incidentResponseActions";

/** The run's incident id: from classify_incident, else the trigger payload. */
function runIncidentId(ctx: WorkflowContext): number {
  const classification = ctx.results.classify_incident as { incidentId?: number } | undefined;
  return Number(classification?.incidentId ?? ctx.triggerPayload.incidentId);
}

/**
 * Why the response no longer applies to `incident`, or null when it does:
 * gone, archived, or below the critical tier.
 */
function noLongerApplies(incident: ResponseIncident | null, incidentId: unknown): string | null {
  if (!incident) return `Incident ${incidentId || "?"} not found`;
  if (incident.archived) return `Incident ${incident.id} is archived`;
  if (!isCriticalIncidentSeverity(incident.severity)) {
    return `Incident ${incident.id} is not critical (${incident.severity || "unknown"})`;
  }
  return null;
}

/**
 * Step 1 — classify the incident and decide whether the response runs.
 * The incident is read directly by id, scoped to the run's organization.
 * When the response does not apply, the run ends here: no later step and no
 * approval request.
 */
async function classifyIncident(ctx: WorkflowContext): Promise<StepResult> {
  const incidentId = Number(ctx.triggerPayload.incidentId);
  const incident = await loadIncidentForResponse(ctx.organizationId, incidentId);
  const reason = noLongerApplies(incident, ctx.triggerPayload.incidentId);
  if (reason || !incident) return { type: "end", reason: reason ?? "Incident not found" };

  return {
    type: "ok",
    output: {
      incidentId: incident.id,
      reference: incident.reference,
      severity: incident.severity,
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
 * The incident as it is now, for a write that runs after approval (possibly
 * days after classify_incident): the owner may have changed, and the
 * incident may have been deleted, archived or lowered. `end` is set when the
 * response no longer applies.
 */
async function currentIncident(
  ctx: WorkflowContext,
): Promise<{ incident: ResponseIncident; end?: undefined } | { end: StepResult }> {
  const incidentId = runIncidentId(ctx);
  const incident = await loadIncidentForResponse(ctx.organizationId, incidentId);
  const reason = noLongerApplies(incident, incidentId);
  if (reason || !incident) {
    return { end: { type: "end", reason: reason ?? "Incident not found" } };
  }
  return { incident };
}

/**
 * Step 3 — create the remediation task. WRITE: gated for approval.
 *
 * Pauses on first visit; on the post-approval resume (resumedApprovalId set)
 * the engine re-runs this step, which then creates the task.
 */
async function createRemediationTasks(ctx: WorkflowContext): Promise<StepResult> {
  const incidentId = runIncidentId(ctx);
  if (!ctx.resumedApprovalId) {
    return requestGateApproval(
      ctx,
      "incident_response",
      "create_remediation_tasks",
      `Approve creation of a remediation task for critical incident ${incidentId || "?"}`,
    );
  }
  const current = await currentIncident(ctx);
  if (current.end) return current.end;
  const { incident } = current;
  const outcome = await createRemediationTask(ctx, incident);
  return {
    type: "ok",
    output: {
      remediation_tasks_approved: true,
      incidentId: incident.id,
      taskId: outcome.taskId,
      assigneeId: outcome.assigneeId,
      assigneeSource: outcome.assigneeSource,
      alreadyCreated: outcome.alreadyCreated,
    },
  };
}

/**
 * Step 4 — escalate to the organization's Admins. WRITE: gated for approval.
 *
 * Pauses on first visit; on the post-approval resume it notifies every Admin
 * in the app and by email.
 */
async function escalateNotifyAdmins(ctx: WorkflowContext): Promise<StepResult> {
  const incidentId = runIncidentId(ctx);
  if (!ctx.resumedApprovalId) {
    return requestGateApproval(
      ctx,
      "incident_response",
      "escalate_notify_admins",
      `Approve admin escalation for critical incident ${incidentId || "?"}`,
    );
  }
  const current = await currentIncident(ctx);
  if (current.end) return current.end;
  const { incident } = current;
  const outcome = await notifyAdminsOfCriticalIncident(ctx, incident);
  if (outcome.failed.length > 0) {
    // Keep the escalation retryable: a new approval re-runs this step, which
    // then reaches only the Admins still missing.
    return requestGateApproval(
      ctx,
      "incident_response",
      "escalate_notify_admins",
      `Retry admin escalation for critical incident ${incident.id}: ` +
        `${outcome.failed.length} Admin(s) could not be notified`,
    );
  }
  return {
    type: "ok",
    output: {
      escalation_approved: true,
      incidentId: incident.id,
      notified: outcome.notified,
      alreadyNotified: outcome.alreadyNotified,
      inFlight: outcome.inFlight,
    },
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
      description: "Create a remediation task for the incident's owner",
      agent: "compliance",
      isWrite: true,
      handler: createRemediationTasks,
    },
    {
      id: "escalate_notify_admins",
      description: "Notify the organization's Admins in the app and by email",
      agent: "incident",
      isWrite: true,
      handler: escalateNotifyAdmins,
    },
  ],
};
