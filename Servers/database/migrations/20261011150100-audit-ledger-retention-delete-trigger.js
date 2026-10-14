"use strict";

/**
 * Let the retention job delete audit_ledger rows, and only those: the
 * transaction must set verifywise.ledger_retention = 'on', write a checkpoint
 * for the organization in the same transaction, and only rows older than that
 * checkpoint's cutoff (itself at least 12 months old) may go. The trigger
 * trg_audit_ledger_no_delete is unchanged; only the function it calls is.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION verifywise.audit_ledger_prevent_delete()
      RETURNS trigger LANGUAGE plpgsql AS $func$
      BEGIN
        -- Organization cascade (unchanged from 20260326204836).
        IF NOT EXISTS (SELECT 1 FROM verifywise.organizations WHERE id = OLD.organization_id) THEN
          RETURN OLD;
        END IF;
        -- Retention job: flagged transaction, and only rows covered by a
        -- checkpoint written in THIS transaction, older than that checkpoint's
        -- cutoff, whose cutoff is at least 12 months old (the shortest period
        -- an Admin can choose). Anything else falls through and fails closed.
        IF current_setting('verifywise.ledger_retention', true) = 'on'
           AND EXISTS (
             SELECT 1 FROM (
               SELECT c.pruned_through_id, c.cutoff
                 FROM verifywise.audit_ledger_retention_checkpoints c
                WHERE c.organization_id = OLD.organization_id
                  AND c.created_txid = txid_current()
                ORDER BY c.id DESC
                LIMIT 1
             ) latest
              WHERE OLD.id <= latest.pruned_through_id
                AND OLD.occurred_at < latest.cutoff
                AND latest.cutoff <= now() - interval '12 months'
           ) THEN
          RETURN OLD;
        END IF;
        RAISE EXCEPTION 'DELETE on audit_ledger is prohibited — append-only table';
      END;
      $func$;
    `);
  },

  async down(queryInterface) {
    // Body restored from 20260326204836-audit-ledger-allow-user-nullify.js.
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION verifywise.audit_ledger_prevent_delete()
      RETURNS trigger LANGUAGE plpgsql AS $func$
      BEGIN
        -- Allow if the parent organization no longer exists (FK cascade)
        IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = OLD.organization_id) THEN
          RETURN OLD;
        END IF;
        RAISE EXCEPTION 'DELETE on audit_ledger is prohibited — append-only table';
      END;
      $func$;
    `);
  },
};
