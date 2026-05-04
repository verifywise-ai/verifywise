"use strict";

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.frameworks_vendorrisks (
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        vendorrisk_id INTEGER NOT NULL REFERENCES verifywise.vendorrisks(id) ON DELETE CASCADE,
        framework_id INTEGER NOT NULL REFERENCES verifywise.frameworks(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        PRIMARY KEY (vendorrisk_id, framework_id)
      );
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_frameworks_vendorrisks_org
        ON verifywise.frameworks_vendorrisks (organization_id);
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_frameworks_vendorrisks_vendorrisk
        ON verifywise.frameworks_vendorrisks (vendorrisk_id);
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_frameworks_vendorrisks_framework
        ON verifywise.frameworks_vendorrisks (framework_id);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("DROP TABLE IF EXISTS verifywise.frameworks_vendorrisks;");
  },
};
