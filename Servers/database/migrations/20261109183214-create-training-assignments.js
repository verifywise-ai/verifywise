"use strict";

/**
 * training_assignments: who has to complete a training, and by when (#5260).
 *
 * One row per person per training. Status is never stored: it is derived from
 * completed_at and due_date when read. The two *_reminded_at columns are the
 * dedupe for the daily reminder sweep. Groups (#5253) are not modelled yet.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.training_assignments (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL
            REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          training_id INTEGER NOT NULL
            REFERENCES verifywise.trainingregistar(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL
            REFERENCES verifywise.users(id) ON DELETE CASCADE,
          due_date DATE NOT NULL,
          completed_at TIMESTAMP WITH TIME ZONE NULL,
          completed_by INTEGER
            REFERENCES verifywise.users(id) ON DELETE SET NULL,
          assigned_by INTEGER
            REFERENCES verifywise.users(id) ON DELETE SET NULL,
          due_soon_reminded_at TIMESTAMP WITH TIME ZONE NULL,
          overdue_reminded_at TIMESTAMP WITH TIME ZONE NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          UNIQUE (training_id, user_id)
        );
        `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        CREATE INDEX IF NOT EXISTS idx_training_assignments_org_training
          ON verifywise.training_assignments(organization_id, training_id);
        `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        CREATE INDEX IF NOT EXISTS idx_training_assignments_open_due_date
          ON verifywise.training_assignments(due_date)
          WHERE completed_at IS NULL;
        `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        ALTER TABLE verifywise.training_assignments ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation ON verifywise.training_assignments;
        CREATE POLICY tenant_isolation ON verifywise.training_assignments
          USING (organization_id = current_setting('app.current_org', true)::int)
          WITH CHECK (organization_id = current_setting('app.current_org', true)::int);
        `,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "DROP TABLE IF EXISTS verifywise.training_assignments CASCADE;",
    );
  },
};
