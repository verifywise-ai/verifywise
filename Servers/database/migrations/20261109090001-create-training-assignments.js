"use strict";

/**
 * training_assignments — who must complete which training, by when (#5260).
 *
 * A row points at a trainingregistar entry and at either a user
 * (subject_type 'user', subject_id = users.id) or a group
 * (subject_type 'group', subject_id = groups.id, resolved through
 * group_members at notification time). status moves pending → overdue
 * (the daily sweep) → completed (manual or when the training itself is
 * marked Completed). last_reminded_at is stamped after a successful
 * reminder send so each assignee hears about a training at most once
 * every 3 days.
 */
module.exports = {
  async up(queryInterface) {
    const sql = queryInterface.sequelize;

    await sql.query(`
      CREATE TABLE IF NOT EXISTS verifywise.training_assignments (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL
          REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        training_id INTEGER NOT NULL
          REFERENCES verifywise.trainingregistar(id) ON DELETE CASCADE,
        subject_type VARCHAR(10) NOT NULL DEFAULT 'user'
          CHECK (subject_type IN ('user', 'group')),
        subject_id INTEGER NOT NULL,
        due_date TIMESTAMP,
        status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'completed', 'overdue')),
        completed_at TIMESTAMP,
        last_reminded_at TIMESTAMP,
        assigned_by INTEGER
          REFERENCES verifywise.users(id) ON DELETE SET NULL,
        assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE (organization_id, training_id, subject_type, subject_id)
      );
    `);

    await sql.query(`
      CREATE INDEX IF NOT EXISTS idx_training_assignments_org_training
        ON verifywise.training_assignments(organization_id, training_id);
    `);

    await sql.query(`
      CREATE INDEX IF NOT EXISTS idx_training_assignments_org_status
        ON verifywise.training_assignments(organization_id, status);
    `);

    await sql.query(`
      ALTER TABLE verifywise.training_assignments ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON verifywise.training_assignments;
      CREATE POLICY tenant_isolation ON verifywise.training_assignments
        USING (organization_id = current_setting('app.current_org', true)::int)
        WITH CHECK (organization_id = current_setting('app.current_org', true)::int);
    `);
  },

  async down(queryInterface) {
    const sql = queryInterface.sequelize;
    await sql.query("DROP POLICY IF EXISTS tenant_isolation ON verifywise.training_assignments;");
    await sql.query("DROP TABLE IF EXISTS verifywise.training_assignments CASCADE;");
  },
};
