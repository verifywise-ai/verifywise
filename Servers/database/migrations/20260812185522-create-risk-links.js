"use strict";

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.risk_links (
        id                 SERIAL PRIMARY KEY,
        organization_id    INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        source_risk_id     INTEGER NOT NULL REFERENCES verifywise.risks(id) ON DELETE CASCADE,
        target_risk_id     INTEGER NOT NULL REFERENCES verifywise.risks(id) ON DELETE CASCADE,
        relation_type      VARCHAR(30) NOT NULL,
        status             VARCHAR(20) NOT NULL DEFAULT 'suggested',
        source             VARCHAR(20) NOT NULL,
        score              NUMERIC(6,3) NOT NULL DEFAULT 0,
        reasons            JSONB NOT NULL DEFAULT '[]',
        created_by_user_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        decided_by_user_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        decided_at         TIMESTAMPTZ,
        last_computed_at   TIMESTAMPTZ,
        created_at         TIMESTAMPTZ DEFAULT NOW(),
        updated_at         TIMESTAMPTZ DEFAULT NOW(),

        CONSTRAINT risk_links_no_self CHECK (source_risk_id <> target_risk_id),
        CONSTRAINT risk_links_canonical CHECK (
          relation_type = 'inherits_from' OR source_risk_id < target_risk_id
        ),
        CONSTRAINT risk_links_unique UNIQUE (source_risk_id, target_risk_id, relation_type)
      );
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS risk_links_org_source_status_idx
        ON verifywise.risk_links (organization_id, source_risk_id, status);
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS risk_links_org_target_status_idx
        ON verifywise.risk_links (organization_id, target_risk_id, status);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("DROP TABLE IF EXISTS verifywise.risk_links;");
  },
};
