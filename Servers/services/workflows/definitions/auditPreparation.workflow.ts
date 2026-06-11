/**
 * Phase 6 — auditPreparation workflow definition (issue 3813).
 *
 * NET-NEW. Scheduled quarterly. Walks an organization through audit prep:
 *   gather framework readiness -> identify gaps -> collect evidence status ->
 *   generate an audit-preparation report -> notify admins.
 *
 * Read steps fan out to the existing readiness / evidence query helpers. The
 * report-generation step is a write and gates for approval: it pauses the run
 * (engine puts it in 'awaiting_approval') until the trigger payload carries
 * `approved: true`, at which point it emits the summarized report. The final
 * step notifies org admins via the notification helper.
 */

import { WorkflowDefinition, WorkflowStep } from "../types";
import {
  getFrameworkScoresQuery,
  getWeakestControlsQuery,
} from "../../../utils/readiness.utils";
import { getEvidenceGapsQuery } from "../../../utils/evidenceAi.utils";
import { getAllUsersQuery } from "../../../utils/user.utils";
import { createBulkNotificationsQuery } from "../../../utils/notification.utils";
import { NotificationType } from "../../../domain.layer/interfaces/i.notification";

const GAP_LIMIT = 10;
const ADMIN_ROLE_ID = 1;

const steps: WorkflowStep[] = [
  {
    id: "gather_framework_readiness",
    description: "Gather current framework readiness scores for the organization.",
    agent: "compliance-agent",
    isWrite: false,
    handler: async (ctx) => {
      const frameworks = await getFrameworkScoresQuery(ctx.organizationId);
      return { type: "ok", output: { frameworks } };
    },
  },
  {
    id: "identify_gaps",
    description: "Identify the weakest controls across frameworks as audit gaps.",
    agent: "compliance-agent",
    isWrite: false,
    handler: async (ctx) => {
      const gaps = await getWeakestControlsQuery(ctx.organizationId, GAP_LIMIT);
      return { type: "ok", output: { gaps } };
    },
  },
  {
    id: "collect_evidence_status",
    description: "Collect evidence coverage and quality gaps per control.",
    agent: "evidence-agent",
    isWrite: false,
    handler: async (ctx) => {
      const evidence = await getEvidenceGapsQuery(ctx.organizationId);
      return { type: "ok", output: { evidence } };
    },
  },
  {
    id: "generate_audit_prep_report",
    description: "Generate the audit-preparation report from the gathered findings.",
    agent: "compliance-agent",
    isWrite: true,
    handler: async (ctx) => {
      // Gate the write: pause for approval until the trigger payload approves it.
      if (ctx.triggerPayload.approved !== true) {
        return { type: "pause", reason: "Audit-preparation report requires approval before publishing." };
      }

      const frameworks =
        (ctx.results.gather_framework_readiness as { frameworks?: unknown[] })?.frameworks ?? [];
      const gaps = (ctx.results.identify_gaps as { gaps?: unknown[] })?.gaps ?? [];
      const evidence =
        (ctx.results.collect_evidence_status as { evidence?: unknown[] })?.evidence ?? [];

      const report = {
        frameworks_assessed: frameworks.length,
        gaps_identified: gaps.length,
        evidence_items_reviewed: evidence.length,
        generated_at: new Date().toISOString(),
      };
      return { type: "ok", output: { report } };
    },
  },
  {
    id: "notify_admins",
    description: "Notify organization admins that the audit-preparation report is ready.",
    agent: "compliance-agent",
    isWrite: true,
    handler: async (ctx) => {
      const users = await getAllUsersQuery(ctx.organizationId);
      const adminIds = users
        .filter((u) => u.role_id === ADMIN_ROLE_ID)
        .map((u) => u.id as number);

      if (adminIds.length === 0) {
        return { type: "skip", reason: "No admins to notify." };
      }

      const report =
        (ctx.results.generate_audit_prep_report as { report?: Record<string, unknown> })?.report ??
        {};

      await createBulkNotificationsQuery(
        {
          user_ids: adminIds,
          type: NotificationType.SYSTEM,
          title: "Audit-preparation report ready",
          message: "The quarterly audit-preparation report has been generated and is ready for review.",
          metadata: { workflow: "audit_preparation", report },
        },
        ctx.organizationId,
      );

      return { type: "ok", output: { notified: adminIds } };
    },
  },
];

export const auditPreparationWorkflow: WorkflowDefinition = {
  id: "audit_preparation",
  name: "Audit Preparation",
  triggerName: "scheduled.quarterly.audit_preparation",
  agents: ["compliance-agent", "evidence-agent"],
  steps,
};
