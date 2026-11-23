/**
 * Phase 6 — Workflow triggers.
 *
 * Fans out scheduled workflow runs across all organizations and exposes a
 * direct entrypoint that entity controllers can call from create/update paths.
 */

import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import logger from "../../utils/logger/fileLogger";
import { createRun, persistRun, runWorkflow, startWorkflow } from "./engine";
import { getWorkflow } from "./registry";
import { WorkflowDefinition, WorkflowRunParams } from "./types";
import { getAllOrganizationsQuery } from "../../utils/organization.utils";

const POLICY_LEAD_DAYS = 30;

/**
 * Trigger: model.status = "Deployed"
 * Called from modelInventory controller after status changes to Deployed.
 */
async function triggerModelDeployment(
  organizationId: number,
  modelId: number,
  modelName?: string,
  modelVersion?: string,
): Promise<void> {
  const wf = getWorkflow("model_deployment");
  if (!wf) return;
  try {
    await startWorkflow(wf, {
      organizationId,
      triggerPayload: { modelId, modelName, modelVersion },
    });
  } catch (error) {
    logger.error(`[workflow] model_deployment trigger failed:`, error);
  }
}

/**
 * Trigger: vendor.created
 * Called from the vendor controller after a vendor is created.
 */
async function triggerVendorOnboarding(organizationId: number, vendorId: number): Promise<void> {
  const wf = getWorkflow("vendor_onboarding");
  if (!wf) return;
  try {
    await startWorkflow(wf, {
      organizationId,
      triggerPayload: { vendorId },
    });
  } catch (error) {
    logger.error(`[workflow] vendor_onboarding trigger failed:`, error);
  }
}

/**
 * A run still 'pending' this long after it was created never started (the
 * process stopped between creating and running it): it no longer counts as
 * the incident's run. A live run leaves 'pending' within milliseconds.
 */
export const INCIDENT_RESPONSE_STALE_PENDING_MINUTES = 10;

/**
 * Creates the incident_response run for an incident unless the incident
 * already has one. Under a per-incident advisory lock, on ONE transaction
 * (the run row and its audit entry are written on it, so the lock never waits
 * on a second pooled connection): look for a run of the incident, insert one
 * when there is none, commit. Two writers escalating the same incident at
 * once therefore produce one run. Returns the new run id, or null.
 *
 * Every run counts except a 'failed' one and a 'pending' one older than
 * INCIDENT_RESPONSE_STALE_PENDING_MINUTES: those never did the response, so a
 * later escalation may start a fresh run. A 'cancelled' run (an Admin
 * rejected a step) does count. Runs are never deleted, so the row itself is
 * the durable record; no extra column.
 */
async function createIncidentResponseRunOnce(
  wf: WorkflowDefinition,
  organizationId: number,
  incidentId: number,
  params: WorkflowRunParams,
): Promise<number | null> {
  return sequelize.transaction(async (transaction) => {
    await sequelize.query(
      `SELECT pg_advisory_xact_lock(hashtext('incident_response_run'), hashtext(:key))`,
      {
        replacements: { key: `${organizationId}:${incidentId}` },
        type: QueryTypes.SELECT,
        transaction,
      },
    );
    const existing = (await sequelize.query(
      `SELECT id FROM ai_workflow_runs
        WHERE organization_id = :organizationId
          AND workflow_type = :workflowType
          AND trigger_payload->>'incidentId' = :incidentId
          AND state <> 'failed'
          AND NOT (state = 'pending'
                   AND created_at < NOW() - make_interval(mins => :staleMinutes))
        LIMIT 1`,
      {
        replacements: {
          organizationId,
          workflowType: wf.id,
          incidentId: String(incidentId),
          staleMinutes: INCIDENT_RESPONSE_STALE_PENDING_MINUTES,
        },
        type: QueryTypes.SELECT,
        transaction,
      },
    )) as Array<{ id: number }>;
    if (existing.length > 0) return null;
    return createRun(wf, params, transaction);
  });
}

/**
 * Trigger: incident severity reaches the critical tier
 * (isCriticalIncidentSeverity). Called after commit when an incident is
 * created critical (console, AI Advisor, Jira import) and when an update
 * raises an existing incident from a lower severity to the critical tier.
 *
 * At most one run per incident (createIncidentResponseRunOnce). A run that
 * cannot be started is marked failed, so it never blocks a later escalation.
 * Never throws.
 */
async function triggerIncidentResponse(
  organizationId: number,
  incidentId: number,
  severity?: string,
): Promise<void> {
  const wf = getWorkflow("incident_response");
  if (!wf) return;
  let runId: number | null = null;
  try {
    const params: WorkflowRunParams = { organizationId, triggerPayload: { incidentId, severity } };
    runId = await createIncidentResponseRunOnce(wf, organizationId, incidentId, params);
    if (runId === null) {
      logger.info(
        `[workflow] incident_response not started for incident ${incidentId}: it already has a run`,
      );
      return;
    }
    await runWorkflow(wf, runId, params);
  } catch (error) {
    logger.error(`[workflow] incident_response trigger failed:`, error);
    if (runId !== null) {
      await persistRun(
        runId,
        organizationId,
        "failed",
        0,
        [],
        `could not start: ${error instanceof Error ? error.message : String(error)}`,
      ).catch((persistError) =>
        logger.error(`[workflow] could not mark run ${runId} failed:`, persistError),
      );
    }
  }
}

/**
 * Scheduled: kick off policy_renewal workflow once per policy in the
 * 30-day window, across all organizations.
 */
async function runPolicyRenewalScan(): Promise<void> {
  const orgs = await getAllOrganizationsQuery();
  for (const org of orgs as Array<{ id: number }>) {
    const orgId = org.id;
    try {
      // Dedup: the scan runs daily and a policy stays in the 30-day window for
      // many consecutive days, so without this guard the same policy would spawn
      // a fresh run (and re-notify its owner) every day. Skip a policy that
      // already has a run for it within the current lead window.
      const policies = (await sequelize.query(
        `SELECT p.id
           FROM policy_manager p
          WHERE p.organization_id = :orgId
            AND p.next_review_date IS NOT NULL
            AND p.next_review_date BETWEEN CURRENT_DATE AND CURRENT_DATE + (:lead || ' days')::interval
            AND NOT EXISTS (
              SELECT 1
                FROM ai_workflow_runs r
               WHERE r.organization_id = :orgId
                 AND r.workflow_type = 'policy_renewal'
                 AND r.trigger_payload->>'policyId' = p.id::text
                 AND r.created_at >= CURRENT_DATE - (:lead || ' days')::interval
            )`,
        {
          replacements: { orgId, lead: POLICY_LEAD_DAYS },
          type: QueryTypes.SELECT,
        },
      )) as Array<{ id: number }>;
      const wf = getWorkflow("policy_renewal");
      if (!wf) continue;
      for (const p of policies) {
        try {
          await startWorkflow(wf, {
            organizationId: orgId,
            triggerPayload: { policyId: p.id },
          });
        } catch (error) {
          logger.error(`[workflow] policy_renewal failed for policy ${p.id}:`, error);
        }
      }
    } catch (error) {
      logger.error(`[workflow] policy_renewal scan failed for org ${orgId}:`, error);
    }
  }
}

/**
 * Scheduled: framework_gap_remediation. One run per organization that has
 * any framework below the readiness threshold (the workflow itself will skip
 * if no gap is present).
 */
async function runFrameworkGapScan(): Promise<void> {
  const orgs = await getAllOrganizationsQuery();
  const wf = getWorkflow("framework_gap_remediation");
  if (!wf) return;
  for (const org of orgs as Array<{ id: number }>) {
    try {
      await startWorkflow(wf, {
        organizationId: org.id,
        triggerPayload: {},
      });
    } catch (error) {
      logger.error(`[workflow] framework_gap scan failed for org ${org.id}:`, error);
    }
  }
}

/**
 * Scheduled: audit_preparation. One run per organization (quarterly). The
 * workflow gathers readiness, identifies gaps, collects evidence status and
 * gates the report on approval.
 */
async function runAuditPreparationScan(): Promise<void> {
  const orgs = await getAllOrganizationsQuery();
  const wf = getWorkflow("audit_preparation");
  if (!wf) return;
  for (const org of orgs as Array<{ id: number }>) {
    try {
      await startWorkflow(wf, {
        organizationId: org.id,
        triggerPayload: {},
      });
    } catch (error) {
      logger.error(`[workflow] audit_preparation scan failed for org ${org.id}:`, error);
    }
  }
}

export {
  triggerModelDeployment,
  triggerVendorOnboarding,
  triggerIncidentResponse,
  runPolicyRenewalScan,
  runFrameworkGapScan,
  runAuditPreparationScan,
};
