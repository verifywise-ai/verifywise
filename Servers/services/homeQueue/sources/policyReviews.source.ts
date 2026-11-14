import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { addDays, dateSql, DUE_SOON_DAYS, toIso } from "./dateOnly";
import type { HomeQueueItem, HomeQueueSource } from "../../../domain.layer/interfaces/i.homeQueue";

const NEXT_REVIEW = dateSql("p.next_review_date");

/**
 * Policies I own or am an assigned reviewer of (join table
 * policy_manager__assigned_reviewer_ids) whose next review is within the
 * window, overdue included. Policies are hard-deleted, so there is no deleted
 * flag. Exported so tests can pin the rule.
 */
export const POLICY_REVIEWS_SQL = `
  SELECT p.id, p.title, p.status, ${NEXT_REVIEW} AS next_review_date, p.created_at
  FROM policy_manager p
  WHERE p.organization_id = :organizationId
    AND p.next_review_date IS NOT NULL
    AND ${NEXT_REVIEW} <= :windowEnd
    AND (
      p.policy_owner_id = :userId
      OR EXISTS (
        SELECT 1 FROM policy_manager__assigned_reviewer_ids pmr
        WHERE pmr.policy_manager_id = p.id
          AND pmr.organization_id = :organizationId
          AND pmr.user_id = :userId
      )
    )`;

interface PolicyRow {
  id: number;
  title: string;
  status: string | null;
  next_review_date: string;
  created_at: Date | string | null;
}

/** Opens the policy in its editor (`/policies/:id/edit`, the route Wise Search uses). */
export const policyReviewsSource: HomeQueueSource = {
  id: "policyReviews",
  part: "enforce",
  isVisible: () => true,
  async load(ctx) {
    const rows = await sequelize.query<PolicyRow>(POLICY_REVIEWS_SQL, {
      replacements: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        windowEnd: addDays(ctx.today, DUE_SOON_DAYS),
      },
      type: QueryTypes.SELECT,
    });

    return rows.map((p): HomeQueueItem => ({
      id: `policyReviews:${p.id}`,
      source: "policyReviews",
      part: "enforce",
      entityType: "policy",
      entityId: p.id,
      name: p.title,
      url: `/policies/${p.id}/edit`,
      dueDate: p.next_review_date,
      waitingSince: toIso(p.created_at),
      overdue: p.next_review_date < ctx.today,
      meta: { status: p.status },
    }));
  },
};
