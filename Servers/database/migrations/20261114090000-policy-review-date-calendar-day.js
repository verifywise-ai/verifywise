"use strict";

/**
 * Repair policy review dates shifted by the old date picker (audit P-M1).
 *
 * The editor used to send the picked day as the browser's local midnight in
 * UTC, e.g. "2030-01-14T21:00:00Z" for 15 January in Istanbul, and the
 * TIMESTAMP (no time zone) column dropped the offset. Every such value has a
 * time of day; a review date is a calendar day, stored at midnight. Rounding
 * to the nearest midnight restores the picked day for browsers from UTC-12 to
 * UTC+12 (21:00 becomes the next day, 05:00 from Toronto stays the same day).
 *
 * The stored time alone cannot tell UTC+13/+14 (New Zealand summer, Tonga,
 * Kiribati) from UTC-11/-10 (American Samoa, Hawaii): both give 10:00-11:00.
 * Rounding keeps those on the stored day, which is right for the west side
 * and a day early for the east side.
 *
 * Values already at midnight are left alone. Down is a no-op: the original
 * times carried no information worth restoring.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE verifywise.policy_manager
         SET next_review_date = date_trunc('day', next_review_date + INTERVAL '12 hours')
       WHERE next_review_date IS NOT NULL
         AND next_review_date <> date_trunc('day', next_review_date);
    `);
  },

  async down() {
    // Intentionally empty: see the note above.
  },
};
