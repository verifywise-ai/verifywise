/**
 * Phase 6 — Vendor Onboarding Workflow.
 *
 * Trigger: vendor.created.
 * Steps (Vendor + Risk + Compliance agents):
 *   1. Vendor Agent     — load the newly created vendor
 *   2. Vendor Agent     — create/verify the vendor risk assessment
 *   3. Risk Agent       — run risk checks over the assessment
 *   4. Compliance Agent — branch: missing controls → follow-up tasks, else → notify
 *   5. Compliance Agent — create follow-up tasks for missing controls (gated write:
 *                         pauses for approval per the engine contract)
 *   6. Vendor Agent     — notify the vendor owner
 */

import { WorkflowContext, WorkflowDefinition, StepResult } from "../types";
import { getVendorByIdQuery } from "../../../utils/vendor.utils";
import { getVendorRisksByVendorIdQuery } from "../../../utils/vendorRisk.utils";
import { sendInAppNotification } from "../../inAppNotification.service";
import {
  NotificationType,
  NotificationEntityType,
} from "../../../domain.layer/interfaces/i.notification";

/** Severities that count as a control gap requiring follow-up. */
const HIGH_SEVERITIES = ["Major", "Catastrophic"];

export const vendorOnboardingWorkflow: WorkflowDefinition = {
  id: "vendor_onboarding",
  name: "Vendor Onboarding",
  triggerName: "vendor.created",
  agents: ["vendor", "risk", "compliance"],
  steps: [
    {
      id: "fetch_vendor",
      description: "Load the newly created vendor",
      agent: "vendor",
      isWrite: false,
      handler: async (ctx: WorkflowContext): Promise<StepResult> => {
        const trigger = ctx.triggerPayload as { vendorId?: number };
        if (!trigger.vendorId) {
          return { type: "fail", error: "vendor.created trigger missing vendorId" };
        }
        const vendor = await getVendorByIdQuery(trigger.vendorId, ctx.organizationId);
        if (!vendor) {
          return { type: "fail", error: `Vendor ${trigger.vendorId} not found` };
        }
        return { type: "ok", output: vendor };
      },
    },
    {
      id: "verify_risk_assessment",
      description: "Create/verify the vendor risk assessment",
      agent: "vendor",
      isWrite: false,
      handler: async (ctx: WorkflowContext): Promise<StepResult> => {
        const vendor = ctx.results.fetch_vendor as { id: number } | undefined;
        if (!vendor?.id) {
          return { type: "fail", error: "fetch_vendor produced no vendor" };
        }
        const risks = await getVendorRisksByVendorIdQuery(vendor.id, ctx.organizationId);
        return {
          type: "ok",
          output: {
            vendorId: vendor.id,
            riskCount: risks.length,
            hasAssessment: risks.length > 0,
            risks,
          },
        };
      },
    },
    {
      id: "run_risk_checks",
      description: "Score the vendor risk assessment for severity",
      agent: "risk",
      isWrite: false,
      handler: async (ctx: WorkflowContext): Promise<StepResult> => {
        const assessment = ctx.results.verify_risk_assessment as
          | { risks?: Array<{ risk_severity?: string }> }
          | undefined;
        const risks = assessment?.risks || [];
        const highSeverityCount = risks.filter(
          (r) => r.risk_severity != null && HIGH_SEVERITIES.includes(r.risk_severity),
        ).length;
        return { type: "ok", output: { highSeverityCount } };
      },
    },
    {
      id: "decide_missing_controls",
      description: "Branch on whether follow-up tasks are needed for missing controls",
      agent: "compliance",
      isWrite: false,
      handler: async (ctx: WorkflowContext): Promise<StepResult> => {
        const assessment = ctx.results.verify_risk_assessment as
          | { hasAssessment?: boolean }
          | undefined;
        const checks = ctx.results.run_risk_checks as { highSeverityCount?: number } | undefined;
        const missingAssessment = !assessment?.hasAssessment;
        const hasHighSeverity = (checks?.highSeverityCount || 0) > 0;
        if (missingAssessment || hasHighSeverity) {
          return { type: "branch", gotoStepId: "create_followup_tasks" };
        }
        return { type: "branch", gotoStepId: "notify_owner" };
      },
    },
    {
      id: "create_followup_tasks",
      description: "Create follow-up tasks for missing controls (requires approval)",
      agent: "compliance",
      isWrite: true,
      handler: async (ctx: WorkflowContext): Promise<StepResult> => {
        const vendor = ctx.results.fetch_vendor as { vendor_name?: string } | undefined;
        const checks = ctx.results.run_risk_checks as { highSeverityCount?: number } | undefined;
        return {
          type: "pause",
          reason: `Follow-up tasks for ${vendor?.vendor_name || "vendor"} (${
            checks?.highSeverityCount || 0
          } high-severity risk(s)) require approval before creation`,
        };
      },
    },
    {
      id: "notify_owner",
      description: "Notify the vendor owner that onboarding completed",
      agent: "vendor",
      isWrite: false,
      handler: async (ctx: WorkflowContext): Promise<StepResult> => {
        const vendor = ctx.results.fetch_vendor as
          | {
              id?: number;
              vendor_name?: string;
              assignee?: number | null;
              reviewer?: number | null;
            }
          | undefined;
        const ownerId = vendor?.assignee ?? vendor?.reviewer ?? null;
        if (!ownerId) {
          return { type: "skip", reason: "Vendor has no owner to notify" };
        }
        await sendInAppNotification(ctx.organizationId, {
          user_id: ownerId,
          type: NotificationType.SYSTEM,
          title: `Vendor onboarding: ${vendor?.vendor_name || "new vendor"}`,
          message: `Onboarding review for "${
            vendor?.vendor_name || "a vendor"
          }" has completed. See workflow run ${ctx.workflowRunId}.`,
          entity_type: NotificationEntityType.VENDOR,
          entity_id: vendor?.id,
          entity_name: vendor?.vendor_name,
          metadata: { workflow_run_id: ctx.workflowRunId },
        });
        return { type: "ok", output: { notified: ownerId } };
      },
    },
  ],
};
