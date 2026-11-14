import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { addDays, DUE_SOON_DAYS, toIso, utcDateSql } from "./dateOnly";
import type { HomeQueueItem, HomeQueueSource } from "../../../domain.layer/interfaces/i.homeQueue";

const REVIEW_DATE = utcDateSql("v.review_date");

/**
 * Which vendors are due for review, whoever the recipient is (alias `v`). The
 * queue source adds the recipient; the Home counts strip counts it org-wide.
 * Keep the rule here so a change applies to both. A 'Reviewed' vendor drops
 * out only once its review_date is before today; the usual workflow marks it
 * Reviewed and sets the next cycle's date in the same save, and that upcoming
 * review must still show. (IS DISTINCT FROM keeps a NULL status in.)
 */
export const VENDOR_REVIEW_DUE_CONDITION = `
    v.organization_id = :organizationId
    AND v.review_date IS NOT NULL
    AND (v.review_status IS DISTINCT FROM 'Reviewed' OR ${REVIEW_DATE} >= :today)
    AND ${REVIEW_DATE} <= :windowEnd`;

/**
 * Mirrors the `vendor_review_due` sweep's recipient and widens its window.
 * The sweep (automationWorker.ts, the vendor_review_date_approaching loop)
 * notifies `vendor.reviewer || vendor.assignee`; so the recipient here is the
 * reviewer, or the assignee when there is no reviewer (NULL or 0, as `||`
 * reads it). Unlike the sweep, a vendor whose review_status is 'Reviewed' is
 * excluded only when its review_date is before today, by product decision
 * (2026-11-13); a Reviewed vendor due today or later stays in, as do NULL and
 * other statuses. Window:
 * review_date <= today + 14 days, overdue included. Vendors have no
 * soft-delete flag. Exported so tests can pin the rule.
 */
export const VENDOR_REVIEWS_SQL = `
  SELECT v.id, v.vendor_name, v.review_status, ${REVIEW_DATE} AS review_date, v.created_at
  FROM vendors v
  WHERE ${VENDOR_REVIEW_DUE_CONDITION}
    AND COALESCE(NULLIF(v.reviewer, 0), v.assignee) = :userId`;

/** Binds the due condition's `:organizationId`, `:today` and `:windowEnd`. */
export const vendorReviewDueReplacements = (organizationId: number, today: string) => ({
  organizationId,
  today,
  windowEnd: addDays(today, DUE_SOON_DAYS),
});

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
        ...vendorReviewDueReplacements(ctx.organizationId, ctx.today),
        userId: ctx.userId,
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
