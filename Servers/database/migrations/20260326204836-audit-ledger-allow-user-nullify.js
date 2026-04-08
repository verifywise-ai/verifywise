'use strict';

/**
 * Update audit_ledger triggers to support org/user deletion:
 * 1. Allow user_id SET NULL (FK cascade when user is deleted)
 * 2. Allow DELETE when org is deleted (FK cascade from organizations)
 *
 * The original triggers were too strict — they blocked FK cascades
 * which prevented deleting organizations and users.
 */
module.exports = {
  async up(queryInterface) {
    // Update guard to allow user_id nullification from FK cascade
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION verifywise.audit_ledger_guard_update()
      RETURNS trigger LANGUAGE plpgsql AS $func$
      BEGIN
        -- Allow sentinel hash finalization (pending → real hash)
        IF OLD.entry_hash = RPAD('pending', 64, '0')
           AND NEW.entry_hash ~ '^[a-f0-9]{64}$'
           AND OLD.entry_type   = NEW.entry_type
           AND OLD.user_id     IS NOT DISTINCT FROM NEW.user_id
           AND OLD.occurred_at  = NEW.occurred_at
           AND OLD.event_type  IS NOT DISTINCT FROM NEW.event_type
           AND OLD.entity_type IS NOT DISTINCT FROM NEW.entity_type
           AND OLD.entity_id   IS NOT DISTINCT FROM NEW.entity_id
           AND OLD.action      IS NOT DISTINCT FROM NEW.action
           AND OLD.field_name  IS NOT DISTINCT FROM NEW.field_name
           AND OLD.old_value   IS NOT DISTINCT FROM NEW.old_value
           AND OLD.new_value   IS NOT DISTINCT FROM NEW.new_value
           AND OLD.description IS NOT DISTINCT FROM NEW.description
           AND OLD.prev_hash    = NEW.prev_hash
        THEN
          RETURN NEW;
        END IF;

        -- Allow FK cascade: user_id set to NULL (ON DELETE SET NULL)
        IF NEW.user_id IS NULL
           AND OLD.user_id IS NOT NULL
           AND OLD.entry_type   = NEW.entry_type
           AND OLD.occurred_at  = NEW.occurred_at
           AND OLD.event_type  IS NOT DISTINCT FROM NEW.event_type
           AND OLD.entity_type IS NOT DISTINCT FROM NEW.entity_type
           AND OLD.entity_id   IS NOT DISTINCT FROM NEW.entity_id
           AND OLD.action      IS NOT DISTINCT FROM NEW.action
           AND OLD.field_name  IS NOT DISTINCT FROM NEW.field_name
           AND OLD.old_value   IS NOT DISTINCT FROM NEW.old_value
           AND OLD.new_value   IS NOT DISTINCT FROM NEW.new_value
           AND OLD.description IS NOT DISTINCT FROM NEW.description
           AND OLD.entry_hash   = NEW.entry_hash
           AND OLD.prev_hash    = NEW.prev_hash
        THEN
          RETURN NEW;
        END IF;

        RAISE EXCEPTION 'UPDATE on audit_ledger is prohibited — only sentinel hash finalization and FK nullification are allowed';
      END;
      $func$;
    `);

    // Allow DELETE via FK cascade from organizations (ON DELETE CASCADE)
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

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION verifywise.audit_ledger_guard_update()
      RETURNS trigger LANGUAGE plpgsql AS $func$
      BEGIN
        IF OLD.entry_hash = RPAD('pending', 64, '0')
           AND NEW.entry_hash ~ '^[a-f0-9]{64}$'
           AND OLD.entry_type   = NEW.entry_type
           AND OLD.user_id     IS NOT DISTINCT FROM NEW.user_id
           AND OLD.occurred_at  = NEW.occurred_at
           AND OLD.event_type  IS NOT DISTINCT FROM NEW.event_type
           AND OLD.entity_type IS NOT DISTINCT FROM NEW.entity_type
           AND OLD.entity_id   IS NOT DISTINCT FROM NEW.entity_id
           AND OLD.action      IS NOT DISTINCT FROM NEW.action
           AND OLD.field_name  IS NOT DISTINCT FROM NEW.field_name
           AND OLD.old_value   IS NOT DISTINCT FROM NEW.old_value
           AND OLD.new_value   IS NOT DISTINCT FROM NEW.new_value
           AND OLD.description IS NOT DISTINCT FROM NEW.description
           AND OLD.prev_hash    = NEW.prev_hash
        THEN
          RETURN NEW;
        END IF;
        RAISE EXCEPTION 'UPDATE on audit_ledger is prohibited — only sentinel hash finalization is allowed';
      END;
      $func$;
    `);

    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION verifywise.audit_ledger_prevent_delete()
      RETURNS trigger LANGUAGE plpgsql AS $func$
      BEGIN
        RAISE EXCEPTION 'DELETE on audit_ledger is prohibited — append-only table';
      END;
      $func$;
    `);
  }
};
