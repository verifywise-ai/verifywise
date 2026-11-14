import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { addDays, DUE_SOON_DAYS, toIso, utcDateSql } from "./dateOnly";
import type { HomeQueueItem, HomeQueueSource } from "../../../domain.layer/interfaces/i.homeQueue";

const REVIEW_DATE = utcDateSql("v.review_date");

/**
 * The `vendor_review_due` sweep's selection with a wider window. The sweep
 * (automationWorker.ts, the vendor_review_date_approaching loop) reads every
 * vendor in the org, applies no review_status or other status condition, and
 * notifies `vendor.reviewer || vendor.assignee`; so the recipient here is the
 * reviewer, or the assignee when there is no reviewer (NULL or 0, as `||`
 * reads it), and review_status is not filtered. Only the window differs:
 * review_date <= today + 14 days, overdue included. Vendors have no soft-delete
 * flag. Exported so tests can pin the rule.
 */
export const VENDOR_REVIEWS_SQL = `
  SELECT v.id, v.vendor_name, v.review_status, ${REVIEW_DATE} AS review_date, v.created_at
  FROM vendors v
  WHERE v.organization_id = :organizationId
    AND v.review_date IS NOT NULL
    AND ${REVIEW_DATE} <= :windowEnd
    AND COALESCE(NULLIF(v.reviewer, 0), v.assignee) = :userId`;

interface VendorRow {
  id: number;
  vendor_name: string;
  review_status: string | null;
  review_date: string;
  created_at: Date | string | null;
}

/** Opens the vendor's edit modal on the vendors page (`vendorId` param). */
export const vendorReviewsSource: HomeQueueSource = {
  id: "vendorReviews",
  part: "track",
  isVisible: () => true,
  async load(ctx) {
    const rows = await sequelize.query<VendorRow>(VENDOR_REVIEWS_SQL, {
      replacements: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        windowEnd: addDays(ctx.today, DUE_SOON_DAYS),
      },
      type: QueryTypes.SELECT,
    });

    return rows.map((v): HomeQueueItem => ({
      id: `vendorReviews:${v.id}`,
      source: "vendorReviews",
      part: "track",
      entityType: "vendor",
      entityId: v.id,
      name: v.vendor_name,
      url: `/vendors?vendorId=${v.id}`,
      dueDate: v.review_date,
      waitingSince: toIso(v.created_at),
      overdue: v.review_date < ctx.today,
      meta: { reviewStatus: v.review_status },
    }));
  },
};
