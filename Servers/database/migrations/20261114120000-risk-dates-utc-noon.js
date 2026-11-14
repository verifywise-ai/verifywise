"use strict";

/**
 * Store risk deadlines and assessment dates at noon UTC (audit R-L4).
 *
 * risks.deadline and risks.date_of_assessment are TIMESTAMP WITH TIME ZONE but
 * hold calendar dates. Import, the advisor and API clients stored date-only
 * values at 00:00 UTC, which browsers west of UTC showed as the previous day.
 * The risk form stored the browser's local midnight, so a date picked in
 * Istanbul (21:00 UTC the evening before) showed a day early in the Americas.
 *
 * New writes store every calendar date at 12:00 UTC on its day
 * (utils/riskCalendarDate.utils.ts), which reads the same from UTC-11 to
 * UTC+11. This applies the same rule to existing rows: a value that looks
 * like a local midnight (a whole quarter hour, no seconds) moves to noon UTC
 * on the nearest day. Values with seconds (a "now" timestamp) and values
 * already at noon are left alone.
 *
 * Effect: a deadline now passes at 12:00 UTC on its day instead of the
 * picker's local midnight, so overdue checks fire up to 12 hours later.
 * Local midnights from UTC+12..+14 cannot be told from UTC-12..-10 and may
 * land a day off, as they could before.
 *
 * Down is a no-op: the original times carried no information worth restoring.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE verifywise.risks
         SET deadline = (date_trunc('day', (deadline AT TIME ZONE 'UTC') + INTERVAL '12 hours')
                         + INTERVAL '12 hours') AT TIME ZONE 'UTC'
       WHERE deadline IS NOT NULL
         AND date_part('second', deadline AT TIME ZONE 'UTC') = 0
         AND date_part('minute', deadline AT TIME ZONE 'UTC')::int % 15 = 0
         AND (deadline AT TIME ZONE 'UTC')::time <> TIME '12:00';
    `);
    await queryInterface.sequelize.query(`
      UPDATE verifywise.risks
         SET date_of_assessment =
             (date_trunc('day', (date_of_assessment AT TIME ZONE 'UTC') + INTERVAL '12 hours')
              + INTERVAL '12 hours') AT TIME ZONE 'UTC'
       WHERE date_of_assessment IS NOT NULL
         AND date_part('second', date_of_assessment AT TIME ZONE 'UTC') = 0
         AND date_part('minute', date_of_assessment AT TIME ZONE 'UTC')::int % 15 = 0
         AND (date_of_assessment AT TIME ZONE 'UTC')::time <> TIME '12:00';
    `);
  },

  async down() {
    // Intentionally empty: see the note above.
  },
};
