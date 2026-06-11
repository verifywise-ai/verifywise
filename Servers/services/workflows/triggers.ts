/**
 * Phase 6 — Workflow triggers.
 *
 * Fans out scheduled workflow runs across all organizations and exposes a
 * direct entrypoint that entity controllers can call from create/update paths.
 */

import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import logger from "../../utils/logger/fileLogger";
import { startWorkflow } from "./engine";
import { getWorkflow } from "./registry";
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
async function triggerVendorOnboarding(
  organizationId: number,
  vendorId: number,
): Promise<void> {
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
 * Trigger: incident.severity = critical
 * Called from the incident controller after a critical incident is created.
 */
async function triggerIncidentResponse(
  organizationId: number,
  incidentId: number,
  severity?: string,
): Promise<void> {
  const wf = getWorkflow("incident_response");
  if (!wf) return;
  try {
    await startWorkflow(wf, {
      organizationId,
      triggerPayload: { incidentId, severity },
    });
  } catch (error) {
    logger.error(`[workflow] incident_response trigger failed:`, error);
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
      const policies = (await sequelize.query(
        `SELECT id
           FROM policy_manager
          WHERE organization_id = :orgId
            AND next_review_date IS NOT NULL
            AND next_review_date BETWEEN CURRENT_DATE AND CURRENT_DATE + (:lead || ' days')::interval`,
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
