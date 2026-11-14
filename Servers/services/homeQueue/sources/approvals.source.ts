import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { getPendingApprovalsQuery } from "../../../utils/approvalRequest.utils";
import { toIso } from "./dateOnly";
import type { HomeQueueItem, HomeQueueSource } from "../../../domain.layer/interfaces/i.homeQueue";

/**
 * Approval requests waiting on my decision: I am an approver on the request's
 * current step, I have not answered, and the request is pending. The rule is
 * getPendingApprovalsQuery's, the same list the Approval requests modal shows.
 * Requests I raised myself are not included (the top-bar badge adds them).
 */
export const approvalsSource: HomeQueueSource = {
  id: "approvals",
  part: "enforce",
  isVisible: () => true,
  async load(ctx) {
    const requests = await getPendingApprovalsQuery(ctx.userId, ctx.organizationId);
    if (requests.length === 0) return [];

    const stepCounts = await sequelize.query<{ request_id: number; step_count: number }>(
      `SELECT request_id, COUNT(*)::int AS step_count
       FROM approval_request_steps
       WHERE organization_id = :organizationId
         AND request_id IN (:requestIds)
       GROUP BY request_id`,
      {
        replacements: {
          organizationId: ctx.organizationId,
          requestIds: requests.map((r) => r.id),
        },
        type: QueryTypes.SELECT,
      },
    );
    const stepCountById = new Map(stepCounts.map((r) => [Number(r.request_id), r.step_count]));

    return requests.map((r): HomeQueueItem => ({
      id: `approvals:${r.id}`,
      source: "approvals",
      part: "enforce",
      entityType: "approval_request",
      entityId: r.id,
      name: r.request_name,
      url: `/approval-workflows?request=${r.id}`,
      dueDate: null,
      waitingSince: toIso(r.created_at),
      overdue: false,
      meta: {
        stepNumber: r.current_step,
        stepCount: stepCountById.get(Number(r.id)) ?? null,
      },
    }));
  },
};
