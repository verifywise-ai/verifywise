"use strict";

/**
 * Migration: Add regulation-agnostic use-case classification columns
 *
 * Adds four nullable columns to the projects table so a framework-free use case
 * can still be organized and searched. Existing EU AI Act data is untouched.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      console.log("📋 Adding use-case classification columns to projects...");

      await queryInterface.sequelize.query(
        `
        ALTER TABLE verifywise.projects
          ADD COLUMN IF NOT EXISTS use_case_category VARCHAR(64),
          ADD COLUMN IF NOT EXISTS use_case_purpose TEXT,
          ADD COLUMN IF NOT EXISTS use_case_audience VARCHAR(32),
          ADD COLUMN IF NOT EXISTS deployment_context VARCHAR(64);
      `,
        { transaction },
      );

      await transaction.commit();
      console.log("✅ Use-case classification columns added.");
    } catch (error) {
      await transaction.rollback();
      console.error("❌ Failed to add use-case classification columns:", error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      console.log("📋 Rolling back use-case classification columns...");

      await queryInterface.sequelize.query(
        `
        ALTER TABLE verifywise.projects
          DROP COLUMN IF EXISTS use_case_category,
          DROP COLUMN IF EXISTS use_case_purpose,
          DROP COLUMN IF EXISTS use_case_audience,
          DROP COLUMN IF EXISTS deployment_context;
      `,
        { transaction },
      );

      await transaction.commit();
      console.log("✅ Use-case classification columns removed.");
    } catch (error) {
      await transaction.rollback();
      console.error("❌ Failed to remove use-case classification columns:", error);
      throw error;
    }
  },
};
