"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.model_inventories
          ALTER COLUMN reference_link TYPE VARCHAR(511),
          ALTER COLUMN biases TYPE VARCHAR(1023),
          ALTER COLUMN limitations TYPE VARCHAR(1023),
          ALTER COLUMN hosting_provider TYPE VARCHAR(511);`,
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.model_inventories
          ALTER COLUMN reference_link TYPE VARCHAR(255),
          ALTER COLUMN biases TYPE VARCHAR(255),
          ALTER COLUMN limitations TYPE VARCHAR(255),
          ALTER COLUMN hosting_provider TYPE VARCHAR(255);`,
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
