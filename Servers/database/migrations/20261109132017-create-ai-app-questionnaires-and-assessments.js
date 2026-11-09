"use strict";

/**
 * AI app questionnaires and assessments (#5258).
 *
 * ai_app_questionnaires: an org's lists of rated questions, stored as JSONB and
 * read and written whole. Names are unique per org, ignoring case; one row per
 * org can be the default.
 *
 * ai_app_assessments: one app answered against one questionnaire. A partial
 * unique index allows one pending assessment per app and questionnaire; on
 * completion the questionnaire's name and questions are copied onto the row.
 */
module.exports = {
  async up(queryInterface) {
    const sql = queryInterface.sequelize;

    await sql.transaction(async (transaction) => {
      await sql.query(
        `CREATE TABLE IF NOT EXISTS verifywise.ai_app_questionnaires (
           id SERIAL PRIMARY KEY,
           organization_id INTEGER NOT NULL
             REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
           name VARCHAR(255) NOT NULL,
           description TEXT,
           questions JSONB NOT NULL DEFAULT '[]'::jsonb,
           is_default BOOLEAN NOT NULL DEFAULT FALSE,
           created_by INTEGER
             REFERENCES verifywise.users(id) ON DELETE SET NULL,
           created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
           updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
         );`,
        { transaction },
      );

      await sql.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_app_questionnaires_org_name
           ON verifywise.ai_app_questionnaires (organization_id, LOWER(name));`,
        { transaction },
      );

      await sql.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_app_questionnaires_org_default
           ON verifywise.ai_app_questionnaires (organization_id) WHERE is_default;`,
        { transaction },
      );

      await sql.query(
        `CREATE TABLE IF NOT EXISTS verifywise.ai_app_assessments (
           id SERIAL PRIMARY KEY,
           organization_id INTEGER NOT NULL
             REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
           ai_app_id INTEGER NOT NULL
             REFERENCES verifywise.ai_apps(id) ON DELETE CASCADE,
           questionnaire_id INTEGER
             REFERENCES verifywise.ai_app_questionnaires(id) ON DELETE SET NULL,
           status VARCHAR(20) NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending', 'completed')),
           questionnaire_name VARCHAR(255),
           questions JSONB,
           answers JSONB,
           risk_score INTEGER CHECK (risk_score BETWEEN 0 AND 100),
           requested_by INTEGER
             REFERENCES verifywise.users(id) ON DELETE SET NULL,
           assessed_by INTEGER
             REFERENCES verifywise.users(id) ON DELETE SET NULL,
           assessed_at TIMESTAMP WITH TIME ZONE,
           created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
           updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
         );`,
        { transaction },
      );

      await sql.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_app_assessments_open
           ON verifywise.ai_app_assessments (ai_app_id, questionnaire_id)
           WHERE status = 'pending';`,
        { transaction },
      );

      await sql.query(
        `CREATE INDEX IF NOT EXISTS idx_ai_app_assessments_org_status
           ON verifywise.ai_app_assessments (organization_id, status, questionnaire_id);`,
        { transaction },
      );

      await sql.query(
        `CREATE INDEX IF NOT EXISTS idx_ai_app_assessments_app
           ON verifywise.ai_app_assessments (ai_app_id, created_at DESC);`,
        { transaction },
      );

      for (const table of ["ai_app_questionnaires", "ai_app_assessments"]) {
        await sql.query(
          `ALTER TABLE verifywise.${table} ENABLE ROW LEVEL SECURITY;
           DROP POLICY IF EXISTS tenant_isolation ON verifywise.${table};
           CREATE POLICY tenant_isolation ON verifywise.${table}
             USING (organization_id = current_setting('app.current_org', true)::int)
             WITH CHECK (organization_id = current_setting('app.current_org', true)::int);`,
          { transaction },
        );
      }
    });
  },

  async down(queryInterface) {
    const sql = queryInterface.sequelize;

    await sql.transaction(async (transaction) => {
      await sql.query("DROP TABLE IF EXISTS verifywise.ai_app_assessments CASCADE;", {
        transaction,
      });
      await sql.query("DROP TABLE IF EXISTS verifywise.ai_app_questionnaires CASCADE;", {
        transaction,
      });
    });
  },
};
