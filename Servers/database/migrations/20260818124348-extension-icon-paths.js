"use strict";

/**
 * Set icon_path for the 7 seeded extensions.
 *
 * The initial extensions migration (20260811102307) seeded the catalog with
 * icon_path = NULL. Icons live in Clients/public/assets/extensions/<key>.<ext>.
 */

const ICON_PATHS = {
  slack: "/assets/extensions/slack.svg",
  mlflow: "/assets/extensions/mlflow.svg",
  "azure-ai-foundry": "/assets/extensions/azure-ai-foundry.jpg",
  "model-lifecycle": "/assets/extensions/model-lifecycle.svg",
  "risk-import": "/assets/extensions/risk-import.svg",
  "jira-assets": "/assets/extensions/jira-assets.svg",
  "dataset-bulk-upload": "/assets/extensions/dataset-bulk-upload.svg",
};

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const transaction = await sequelize.transaction();
    try {
      for (const [key, iconPath] of Object.entries(ICON_PATHS)) {
        await sequelize.query(
          `UPDATE verifywise.extensions SET icon_path = :iconPath, updated_at = NOW() WHERE key = :key;`,
          { transaction, replacements: { key, iconPath } },
        );
      }
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    await sequelize.query(
      `UPDATE verifywise.extensions SET icon_path = NULL, updated_at = NOW() WHERE key IN (:keys);`,
      { replacements: { keys: Object.keys(ICON_PATHS) } },
    );
  },
};
