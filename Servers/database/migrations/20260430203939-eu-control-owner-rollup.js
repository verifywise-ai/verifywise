"use strict";

/**
 * EU AI Act: roll subcontrol-level workflow fields up to the parent control.
 *
 * Background: control rows in `controls_eu` were never written to by the save
 * path — owner/approver/reviewer/due_date/risk_review lived only on
 * subcontrols. The controls list and reports read these fields from the
 * control row, so they always showed "Not set" / "Waiting".
 *
 * Implementation_details stays on the subcontrol — it's per-task evidence,
 * not a workflow assignment.
 *
 * Snapshot tables (subcontrols_eu__pre_rollup_snapshot,
 * controls_eu__pre_rollup_snapshot) are intentionally left in place after
 * `up` so we can restore old values if anything goes wrong post-deploy.
 * They are dropped only by `down`. Storage cost is negligible.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const run = (sql) => queryInterface.sequelize.query(sql, { transaction });

      await run(`
        CREATE TABLE IF NOT EXISTS verifywise.subcontrols_eu__pre_rollup_snapshot (
          id INTEGER PRIMARY KEY,
          organization_id INTEGER NOT NULL,
          owner INTEGER,
          approver INTEGER,
          reviewer INTEGER,
          due_date TIMESTAMP WITH TIME ZONE,
          risk_review VARCHAR(64),
          snapshot_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);

      await run(`
        CREATE TABLE IF NOT EXISTS verifywise.controls_eu__pre_rollup_snapshot (
          id INTEGER PRIMARY KEY,
          organization_id INTEGER NOT NULL,
          status VARCHAR(64),
          owner INTEGER,
          approver INTEGER,
          reviewer INTEGER,
          due_date TIMESTAMP WITH TIME ZONE,
          risk_review VARCHAR(64),
          snapshot_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);

      await run(`TRUNCATE verifywise.subcontrols_eu__pre_rollup_snapshot;`);
      await run(`TRUNCATE verifywise.controls_eu__pre_rollup_snapshot;`);

      await run(`
        INSERT INTO verifywise.subcontrols_eu__pre_rollup_snapshot
          (id, organization_id, owner, approver, reviewer, due_date, risk_review)
        SELECT id, organization_id, owner, approver, reviewer, due_date, risk_review
        FROM verifywise.subcontrols_eu;
      `);

      await run(`
        INSERT INTO verifywise.controls_eu__pre_rollup_snapshot
          (id, organization_id, status, owner, approver, reviewer, due_date, risk_review)
        SELECT id, organization_id, status::text, owner, approver, reviewer, due_date, risk_review
        FROM verifywise.controls_eu;
      `);

      await run(`
        WITH agg AS (
          SELECT
            sc.control_id,
            sc.organization_id,
            mode() WITHIN GROUP (ORDER BY sc.owner) FILTER (WHERE sc.owner IS NOT NULL) AS owner,
            mode() WITHIN GROUP (ORDER BY sc.approver) FILTER (WHERE sc.approver IS NOT NULL) AS approver,
            mode() WITHIN GROUP (ORDER BY sc.reviewer) FILTER (WHERE sc.reviewer IS NOT NULL) AS reviewer,
            mode() WITHIN GROUP (ORDER BY sc.due_date) FILTER (WHERE sc.due_date IS NOT NULL) AS due_date,
            mode() WITHIN GROUP (ORDER BY sc.risk_review) FILTER (WHERE sc.risk_review IS NOT NULL) AS risk_review,
            CASE
              WHEN COUNT(*) = COUNT(*) FILTER (WHERE sc.status = 'Done') THEN 'Done'
              WHEN COUNT(*) = COUNT(*) FILTER (WHERE sc.status = 'Waiting' OR sc.status IS NULL) THEN 'Waiting'
              ELSE 'In progress'
            END AS derived_status
          FROM verifywise.subcontrols_eu sc
          GROUP BY sc.control_id, sc.organization_id
        )
        UPDATE verifywise.controls_eu c
        SET owner       = COALESCE(c.owner, agg.owner),
            approver    = COALESCE(c.approver, agg.approver),
            reviewer    = COALESCE(c.reviewer, agg.reviewer),
            due_date    = COALESCE(c.due_date, agg.due_date),
            risk_review = COALESCE(c.risk_review, agg.risk_review::text::verifywise.enum_controls_risk_review),
            status      = agg.derived_status::verifywise.enum_controls_status
        FROM agg
        WHERE c.id = agg.control_id
          AND c.organization_id = agg.organization_id;
      `);

      await run(`
        UPDATE verifywise.subcontrols_eu
        SET owner = NULL,
            approver = NULL,
            reviewer = NULL,
            due_date = NULL,
            risk_review = NULL
        WHERE owner IS NOT NULL
           OR approver IS NOT NULL
           OR reviewer IS NOT NULL
           OR due_date IS NOT NULL
           OR risk_review IS NOT NULL;
      `);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const run = (sql) => queryInterface.sequelize.query(sql, { transaction });

      await run(`
        UPDATE verifywise.subcontrols_eu sc
        SET owner = snap.owner,
            approver = snap.approver,
            reviewer = snap.reviewer,
            due_date = snap.due_date,
            risk_review = snap.risk_review::verifywise.enum_subcontrols_risk_review
        FROM verifywise.subcontrols_eu__pre_rollup_snapshot snap
        WHERE sc.id = snap.id;
      `);

      await run(`
        UPDATE verifywise.controls_eu c
        SET status = snap.status::verifywise.enum_controls_status,
            owner = snap.owner,
            approver = snap.approver,
            reviewer = snap.reviewer,
            due_date = snap.due_date,
            risk_review = snap.risk_review::verifywise.enum_controls_risk_review
        FROM verifywise.controls_eu__pre_rollup_snapshot snap
        WHERE c.id = snap.id;
      `);

      await run(`DROP TABLE IF EXISTS verifywise.subcontrols_eu__pre_rollup_snapshot;`);
      await run(`DROP TABLE IF EXISTS verifywise.controls_eu__pre_rollup_snapshot;`);
    });
  },
};
