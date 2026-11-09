"use strict";

/**
 * Center the public intake forms that are left-aligned.
 *
 * Until now every form created in the builder was saved with the default
 * design settings, whose alignment was "left", so nearly every public form
 * rendered against the left edge of a wide screen. The default is now
 * "center". A saved "left" cannot be told apart from one picked on purpose,
 * so all of them move to "center"; a form owner can pick left again in the
 * Design panel.
 *
 * The forms it moves are recorded first, in the same transaction, in
 * intake_forms_alignment_backup, so down() can put them back. To put one
 * form back by hand without undoing the migration (only the alignment key,
 * so later design edits stay):
 *
 *   UPDATE verifywise.intake_forms f
 *      SET design_settings = jsonb_set(f.design_settings, '{alignment}', to_jsonb(b.previous_alignment))
 *     FROM verifywise.intake_forms_alignment_backup b
 *    WHERE f.id = b.form_id AND f.id = <form id>;
 */
const BACKUP = "verifywise.intake_forms_alignment_backup";

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS ${BACKUP} (
          form_id INTEGER PRIMARY KEY
            REFERENCES verifywise.intake_forms(id) ON DELETE CASCADE,
          -- Nullable like intake_forms.organization_id, so a legacy form
          -- without one cannot stop the deploy.
          organization_id INTEGER,
          previous_alignment TEXT NOT NULL,
          backed_up_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        `,
        { transaction },
      );
      const [rows] = await queryInterface.sequelize.query(
        `
        WITH copied AS (
          INSERT INTO ${BACKUP} (form_id, organization_id, previous_alignment)
          SELECT id, organization_id, design_settings->>'alignment'
            FROM verifywise.intake_forms
           WHERE design_settings->>'alignment' = 'left'
          ON CONFLICT (form_id) DO NOTHING
          RETURNING form_id
        ),
        centered AS (
          UPDATE verifywise.intake_forms
             SET design_settings = jsonb_set(design_settings, '{alignment}', '"center"')
           WHERE design_settings->>'alignment' = 'left'
          RETURNING id
        )
        SELECT (SELECT COUNT(*) FROM copied)::int AS copied,
               (SELECT COUNT(*) FROM centered)::int AS centered;
        `,
        { transaction },
      );
      console.log(
        `[20261024110000] centered ${rows?.[0]?.centered ?? 0} left-aligned intake form(s); ` +
          `${rows?.[0]?.copied ?? 0} recorded in ${BACKUP}`,
      );
    });
  },

  // Puts "left" back on the recorded forms that are still centered, then drops
  // the record. An owner who has since picked left or right keeps it; one who
  // re-saved "center" cannot be told apart and goes back to left.
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const [present] = await queryInterface.sequelize.query(
        `SELECT to_regclass('${BACKUP}') IS NOT NULL AS present;`,
        { transaction },
      );
      if (!present?.[0]?.present) return;
      await queryInterface.sequelize.query(
        `
        UPDATE verifywise.intake_forms f
           SET design_settings = jsonb_set(f.design_settings, '{alignment}', to_jsonb(b.previous_alignment))
          FROM ${BACKUP} b
         WHERE f.id = b.form_id
           AND f.design_settings->>'alignment' = 'center';
        `,
        { transaction },
      );
      await queryInterface.sequelize.query(`DROP TABLE ${BACKUP};`, { transaction });
    });
  },
};
