"use strict";

/**
 * Model risk level from the shared formula (audit decision 10).
 *
 * - Adds `model_risks.severity` (a severity label, nullable).
 * - Normalizes `likelihood` to the likelihood labels: a value that matches a
 *   label without regard to case or surrounding spaces gets the label's
 *   spelling; a blank one becomes NULL; anything else is appended to the
 *   risk's `description` as "Previous likelihood: <value>" and then set to
 *   NULL, so no text is lost.
 *
 * `risk_level` is not recomputed: existing rows have no severity, so they
 * keep their hand-picked level until someone sets both.
 *
 * `down` drops `severity` and moves each "Previous likelihood" line back into
 * `likelihood`. A label whose spelling `up` changed ("likely" -> "Likely")
 * keeps the new spelling.
 */

const LABELS = ["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"];
const MARKER = "Previous likelihood: ";

module.exports = {
  async up(queryInterface) {
    const lowered = LABELS.map((l) => `'${l.toLowerCase()}'`).join(", ");
    const cases = LABELS.map((l) => `WHEN '${l.toLowerCase()}' THEN '${l}'`).join(" ");
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.model_risks ADD COLUMN IF NOT EXISTS severity VARCHAR(255);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `UPDATE verifywise.model_risks
            SET likelihood = CASE lower(btrim(likelihood)) ${cases} END
          WHERE lower(btrim(likelihood)) IN (${lowered});`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `UPDATE verifywise.model_risks
            SET description = CASE
                  WHEN COALESCE(btrim(description), '') = '' THEN :marker || btrim(likelihood)
                  ELSE description || E'\\n\\n' || :marker || btrim(likelihood)
                END,
                likelihood = NULL
          WHERE btrim(likelihood) <> ''
            AND lower(btrim(likelihood)) NOT IN (${lowered});`,
        { transaction, replacements: { marker: MARKER } },
      );
      await queryInterface.sequelize.query(
        `UPDATE verifywise.model_risks SET likelihood = NULL WHERE btrim(likelihood) = '';`,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `UPDATE verifywise.model_risks
            SET likelihood = substring(description from :capture),
                description = regexp_replace(description, :strip, '')
          WHERE likelihood IS NULL
            AND description ~ :strip;`,
        {
          transaction,
          replacements: {
            capture: `(?:\n\n|^)${MARKER}(.*)$`,
            strip: `(\n\n|^)${MARKER}.*$`,
          },
        },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.model_risks DROP COLUMN IF EXISTS severity;`,
        { transaction },
      );
    });
  },
};
