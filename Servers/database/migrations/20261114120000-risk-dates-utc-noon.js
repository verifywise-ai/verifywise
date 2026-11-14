"use strict";

/**
 * Store existing risk deadlines and assessment dates at noon UTC (audit R-L4).
 *
 * risks.deadline and risks.date_of_assessment are TIMESTAMP WITH TIME ZONE but
 * hold calendar dates. Import, the advisor and API clients stored date-only
 * values at 00:00 UTC, which browsers west of UTC showed as the previous day.
 * The risk form stored the browser's local midnight, so a date picked in
 * Istanbul (21:00 UTC the evening before) showed a day early in the Americas.
 * New writes store calendar dates at 12:00 UTC and the client reads exactly
 * 12:00 UTC as that UTC date (utils/riskCalendarDate.utils.ts).
 *
 * This moves every stored value that looks like a local midnight (a whole
 * quarter hour, no seconds) to 12:00 UTC on the day it was picked. The local
 * midnight of day D sits at UTC D-1 10:00 (UTC+14) to D 12:00 (UTC-12), so the
 * picked day is the UTC date of the value plus 13 hours:
 * - 00:00 to 10:45 UTC: the same day (UTC and the Americas down to Hawaii);
 * - 11:00 to 23:45 UTC: the next day (UTC+13 New Zealand summer, UTC+12 New
 *   Zealand winter and Fiji, Asia, Europe).
 * 10:00 and 11:00 UTC are each also a midnight in a sparsely populated zone on
 * the other side (UTC+14 Kiribati, UTC-11 Samoa); those picks land a day off.
 * A whole-quarter-hour time sent on purpose through the API, such as 18:00
 * UTC, is treated as a local midnight too. Values with seconds ("now"
 * timestamps) are left alone.
 *
 * Effect: a deadline now passes at 12:00 UTC on its day instead of the
 * picker's local midnight, so overdue checks fire up to 12 hours later.
 *
 * Down is a no-op: the original times carried no information worth restoring.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE verifywise.risks
         SET deadline = (date_trunc('day', (deadline AT TIME ZONE 'UTC') + INTERVAL '13 hours')
                         + INTERVAL '12 hours') AT TIME ZONE 'UTC'
       WHERE deadline IS NOT NULL
         AND date_part('second', deadline AT TIME ZONE 'UTC') = 0
         AND date_part('minute', deadline AT TIME ZONE 'UTC')::int % 15 = 0;
    `);
    await queryInterface.sequelize.query(`
      UPDATE verifywise.risks
         SET date_of_assessment =
             (date_trunc('day', (date_of_assessment AT TIME ZONE 'UTC') + INTERVAL '13 hours')
              + INTERVAL '12 hours') AT TIME ZONE 'UTC'
       WHERE date_of_assessment IS NOT NULL
         AND date_part('second', date_of_assessment AT TIME ZONE 'UTC') = 0
         AND date_part('minute', date_of_assessment AT TIME ZONE 'UTC')::int % 15 = 0;
    `);
  },

  async down() {
    // Intentionally empty: see the note above.
  },
};
