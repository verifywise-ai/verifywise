"use strict";

/**
 * Framework Import extension — catalog registration (#5254, VW-CQ-02).
 *
 * Self-service import of custom compliance frameworks from a spreadsheet:
 * one worksheet defines the framework plus its topics and subtopics, and the
 * imported structure becomes an organization-scoped framework
 * (see 20261111092002-imported-framework-storage.js).
 *
 * Idempotent: the catalog key is UNIQUE, so a re-run is a no-op.
 */
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const transaction = await sequelize.transaction();

    try {
      await sequelize.query(
        `
        INSERT INTO verifywise.extensions
          (key, name, display_name, description, long_description, version, author,
           category, icon_path, documentation_url, support_url, requires_configuration,
           features, tags, created_at, updated_at)
        VALUES
          ('framework-import',
           'Framework Import',
           'Framework Import',
           'Import custom compliance frameworks from Excel files, including topics and subtopics.',
           'Framework Import enables self-service creation of organization-scoped compliance frameworks from a spreadsheet. Download a pre-formatted Excel template, define the framework with its topics and subtopics, and upload to make the framework available to your organization. Re-uploading the same framework name replaces its structure, making repeated imports idempotent.',
           '1.0.0',
           'VerifyWise',
           'data_management',
           '/assets/extensions/framework-import.svg',
           NULL,
           'https://support.verifywise.com',
           FALSE,
           CAST(:features AS JSONB),
           CAST(:tags AS TEXT[]),
           NOW(),
           NOW())
        ON CONFLICT (key) DO NOTHING;
        `,
        {
          transaction,
          replacements: {
            features: JSON.stringify([
              {
                name: "Excel Template Download",
                description: "Download a pre-formatted Excel template for the framework structure",
                displayOrder: 1,
              },
              {
                name: "Topics and Subtopics",
                description: "Define framework topics and nested subtopics in one worksheet",
                displayOrder: 2,
              },
              {
                name: "Idempotent Re-import",
                description: "Re-uploading the same framework name replaces its structure",
                displayOrder: 3,
              },
              {
                name: "Validation",
                description: "Comprehensive row-level validation before import",
                displayOrder: 4,
              },
              {
                name: "Organization Scoping",
                description: "Imported frameworks are private to your organization",
                displayOrder: 5,
              },
            ]),
            tags: '{"framework","import","excel","compliance","data-management"}',
          },
        },
      );

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM verifywise.extensions WHERE key = 'framework-import';`,
    );
  },
};
