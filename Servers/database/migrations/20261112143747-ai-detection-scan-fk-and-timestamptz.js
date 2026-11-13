"use strict";

/**
 * AI Detection data integrity fixes.
 *
 * 1. Foreign keys. ai_detection_findings.scan_id had no FK, so deleting a scan
 *    left its findings behind (the delete query assumed a CASCADE that did not
 *    exist). This deletes the orphaned findings (their vulnerability details
 *    go with them through the existing finding_id CASCADE), then adds
 *    findings.scan_id -> scans ON DELETE CASCADE. ai_detection_repositories.
 *    last_scan_id is also unconstrained: dangling ids are cleared and an
 *    ON DELETE SET NULL FK is added.
 *
 * 2. Time zones. ai_detection_scans, ai_detection_findings and
 *    ai_detection_risk_scoring_config used TIMESTAMP WITHOUT TIME ZONE and the
 *    writers disagreed:
 *      - columns written with NOW() (created_at, updated_at,
 *        risk_score_calculated_at, findings.created_at,
 *        findings.governance_updated_at, risk_scoring_config.updated_at) hold
 *        UTC wall time, because Sequelize sets the session time zone to +00:00;
 *      - scans.started_at and scans.completed_at were bound from a JS Date in a
 *        raw query, which Sequelize serialises in the Node process's local
 *        time zone. The offset in that literal is discarded by a TIMESTAMP
 *        column, so they hold server-local wall time.
 *    The local offset is not recorded anywhere, so it is recovered per row
 *    from started_at - created_at: started_at is written when the scan
 *    starts, moments after created_at (UTC), and created_at is never updated.
 *    The difference, rounded to 15 minutes, is the writer's UTC offset at
 *    that moment (this also follows DST). Offsets beyond +/-14h are treated
 *    as 0. Both columns are shifted by it, then every column is converted
 *    with AT TIME ZONE 'UTC'. On servers that run in UTC the offset is 0 and
 *    nothing shifts.
 *    Rows without started_at are not shifted. updated_at is not a usable
 *    reference for completed_at: it is written again after completion (risk
 *    scoring, cache cleanup), so completed_at - updated_at would be a wrong
 *    offset. Every scan that runs writes started_at first, so a row without
 *    it is rare, and leaving it unshifted is off by at most the server's UTC
 *    offset, never by an arbitrary amount.
 *
 * 3. Severity. LLM vulnerability findings kept their severity only inside
 *    ai_detection_vulnerability_details.vulnerability_details, so the
 *    finding's own severity column was empty and the CI critical-findings
 *    gate could not see them. Empty severities are backfilled from that JSON.
 *
 * Down drops the two FKs and converts the columns back to TIMESTAMP holding
 * UTC wall time. It does not restore deleted orphans, the old server-local
 * values of started_at/completed_at, or empty severities.
 */

const SCHEMA = "verifywise";

const UTC_COLUMNS = {
  ai_detection_scans: [
    "created_at",
    "updated_at",
    "started_at",
    "completed_at",
    "risk_score_calculated_at",
  ],
  ai_detection_findings: ["created_at", "governance_updated_at"],
  ai_detection_risk_scoring_config: ["updated_at"],
};

async function columnType(queryInterface, transaction, table, column) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT data_type FROM information_schema.columns
     WHERE table_schema = :schema AND table_name = :table AND column_name = :column`,
    { replacements: { schema: SCHEMA, table, column }, transaction },
  );
  return rows[0] ? rows[0].data_type : null;
}

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // ---- 1. Orphans and foreign keys ----------------------------------------
      await queryInterface.sequelize.query(
        `DELETE FROM ${SCHEMA}.ai_detection_findings f
         WHERE f.scan_id IS NULL
            OR NOT EXISTS (SELECT 1 FROM ${SCHEMA}.ai_detection_scans s WHERE s.id = f.scan_id);`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE ${SCHEMA}.ai_detection_findings
           DROP CONSTRAINT IF EXISTS fk_ai_detection_findings_scan;
         ALTER TABLE ${SCHEMA}.ai_detection_findings
           ADD CONSTRAINT fk_ai_detection_findings_scan
           FOREIGN KEY (scan_id) REFERENCES ${SCHEMA}.ai_detection_scans(id) ON DELETE CASCADE;`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `UPDATE ${SCHEMA}.ai_detection_repositories r
         SET last_scan_id = NULL
         WHERE r.last_scan_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM ${SCHEMA}.ai_detection_scans s WHERE s.id = r.last_scan_id);`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE ${SCHEMA}.ai_detection_repositories
           DROP CONSTRAINT IF EXISTS fk_ai_detection_repositories_last_scan;
         ALTER TABLE ${SCHEMA}.ai_detection_repositories
           ADD CONSTRAINT fk_ai_detection_repositories_last_scan
           FOREIGN KEY (last_scan_id) REFERENCES ${SCHEMA}.ai_detection_scans(id) ON DELETE SET NULL;`,
        { transaction },
      );

      // ---- 1b. Backfill finding severity from vulnerability details ----------
      await queryInterface.sequelize.query(
        `UPDATE ${SCHEMA}.ai_detection_findings f
         SET severity = vd.vulnerability_details->>'severity'
         FROM ${SCHEMA}.ai_detection_vulnerability_details vd
         WHERE vd.finding_id = f.id
           AND f.severity IS NULL
           AND vd.vulnerability_details->>'severity' IN ('critical', 'high', 'medium', 'low');`,
        { transaction },
      );

      // ---- 2. Shift server-local started_at / completed_at to UTC wall time --
      // Only while the columns are still TIMESTAMP (idempotent on re-run).
      const startedType = await columnType(
        queryInterface,
        transaction,
        "ai_detection_scans",
        "started_at",
      );
      if (startedType === "timestamp without time zone") {
        await queryInterface.sequelize.query(
          `WITH offsets AS (
             SELECT
               id,
               ROUND(EXTRACT(EPOCH FROM started_at - created_at) / 900) * 900 AS offset_seconds
             FROM ${SCHEMA}.ai_detection_scans
             WHERE started_at IS NOT NULL
           )
           UPDATE ${SCHEMA}.ai_detection_scans s
           SET
             started_at = s.started_at - make_interval(secs => o.offset_seconds),
             completed_at = s.completed_at - make_interval(secs => o.offset_seconds)
           FROM offsets o
           WHERE s.id = o.id
             AND o.offset_seconds IS NOT NULL
             AND o.offset_seconds <> 0
             AND ABS(o.offset_seconds) <= 14 * 3600;`,
          { transaction },
        );
      }

      // ---- 3. TIMESTAMP -> TIMESTAMPTZ (values are UTC wall time) -------------
      for (const [table, columns] of Object.entries(UTC_COLUMNS)) {
        for (const column of columns) {
          const type = await columnType(queryInterface, transaction, table, column);
          if (type !== "timestamp without time zone") continue;
          await queryInterface.sequelize.query(
            `ALTER TABLE ${SCHEMA}.${table}
               ALTER COLUMN ${column} TYPE TIMESTAMPTZ USING ${column} AT TIME ZONE 'UTC';`,
            { transaction },
          );
        }
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      for (const [table, columns] of Object.entries(UTC_COLUMNS)) {
        for (const column of columns) {
          const type = await columnType(queryInterface, transaction, table, column);
          if (type !== "timestamp with time zone") continue;
          await queryInterface.sequelize.query(
            `ALTER TABLE ${SCHEMA}.${table}
               ALTER COLUMN ${column} TYPE TIMESTAMP USING ${column} AT TIME ZONE 'UTC';`,
            { transaction },
          );
        }
      }

      await queryInterface.sequelize.query(
        `ALTER TABLE ${SCHEMA}.ai_detection_repositories
           DROP CONSTRAINT IF EXISTS fk_ai_detection_repositories_last_scan;
         ALTER TABLE ${SCHEMA}.ai_detection_findings
           DROP CONSTRAINT IF EXISTS fk_ai_detection_findings_scan;`,
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
