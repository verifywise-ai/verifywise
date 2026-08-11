/**
 * Phase 6 — Workflow bootstrap (issue 3813).
 *
 * registerAllWorkflows() imports every shipped workflow definition and
 * registers it into the registry. Called once at server startup so the
 * triggers and scheduler can resolve workflows by key. Idempotent —
 * re-registering the same id overwrites the previous definition.
 */

import { register } from "./registry";
import { modelDeploymentWorkflow } from "./definitions/modelDeployment.workflow";
import { policyRenewalWorkflow } from "./definitions/policyRenewal.workflow";
import { frameworkGapWorkflow } from "./definitions/frameworkGap.workflow";
import { vendorOnboardingWorkflow } from "./definitions/vendorOnboarding.workflow";
import { incidentResponseWorkflow } from "./definitions/incidentResponse.workflow";
import { auditPreparationWorkflow } from "./definitions/auditPreparation.workflow";

/**
 * Register all 6 built-in workflow definitions into the registry.
 */
function registerAllWorkflows(): void {
  register(modelDeploymentWorkflow);
  register(policyRenewalWorkflow);
  register(frameworkGapWorkflow);
  register(vendorOnboardingWorkflow);
  register(incidentResponseWorkflow);
  register(auditPreparationWorkflow);
}

export { registerAllWorkflows };
