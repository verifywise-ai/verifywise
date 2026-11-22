"use strict";

/**
 * MRM: schedule the next periodic review for models validated before scheduling
 * existed.
 *
 * Sign-off now sets mrm_validations.next_due from the model's tier (Tier 1 every
 * 12 months, Tier 2 every 18, Tier 3 every 24; see REVALIDATION_CADENCE_MONTHS in
 * Servers/utils/mrm.utils.ts). Validations signed off earlier have next_due NULL,
 * so the daily revalidation sweep would never reschedule those models. This sets
 * next_due on each tiered model's latest signed-off validation, counted from its
 * sign-off date, whatever the sign-off outcome. The month math runs in UTC and
 * clamps to the end of a shorter month, the same as computeNextReviewDue. A
 * model whose review is already past due gets a revalidation opened on the next
 * sweep, which is the intended behaviour.
 *
 * Only rows where next_due is NULL are touched, so a due date set through the
 * API is kept, as sign-off keeps a future one for an untiered model. Untiered
 * models are skipped: they have no cadence. down() is a no-op: once written, a
 * backfilled date cannot be told apart from one set at sign-off.
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `WITH latest AS (
           SELECT DISTINCT ON (v.organization_id, v.model_inventory_id)
                  v.id, v.organization_id, v.model_inventory_id, v.signed_off_at
             FROM verifywise.mrm_validations v
            WHERE v.stage = 'validated'
              AND v.signed_off_at IS NOT NULL
            ORDER BY v.organization_id, v.model_inventory_id, v.signed_off_at DESC, v.id DESC
         )
         UPDATE verifywise.mrm_validations target
            SET next_due = ((latest.signed_off_at AT TIME ZONE 'UTC') + make_interval(months =>
                  CASE mi.mrm_tier::text WHEN '1' THEN 12 WHEN '2' THEN 18 WHEN '3' THEN 24 END))
                  AT TIME ZONE 'UTC',
                updated_at = now()
           FROM latest
           JOIN verifywise.model_inventories mi
             ON mi.id = latest.model_inventory_id
            AND mi.organization_id = latest.organization_id
          WHERE target.id = latest.id
            AND target.next_due IS NULL
            AND mi.mrm_tier::text IN ('1', '2', '3');`,
        { transaction },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down() {
    // No-op: see the header comment.
  },
};
