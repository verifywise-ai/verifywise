'use strict';

/**
 * Migration: Create Risk Benchmarks Reference Table
 *
 * Global reference data table (no organization_id) containing industry
 * benchmarks for FAIR-inspired quantitative risk assessment. Pre-loaded
 * values give customers a starting point for event frequency and loss
 * magnitude estimates across AI risk categories.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable({ tableName: 'risk_benchmarks', schema: 'verifywise' }, {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      category: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      industry: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      ai_risk_type: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      regulation: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },

      // Event Frequency (annualized)
      event_frequency_min: {
        type: Sequelize.DECIMAL(12, 4),
        allowNull: true,
      },
      event_frequency_likely: {
        type: Sequelize.DECIMAL(12, 4),
        allowNull: true,
      },
      event_frequency_max: {
        type: Sequelize.DECIMAL(12, 4),
        allowNull: true,
      },

      // Loss Magnitude: Regulatory Fines
      loss_regulatory_min: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      },
      loss_regulatory_likely: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      },
      loss_regulatory_max: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      },

      // Loss Magnitude: Operational Costs
      loss_operational_min: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      },
      loss_operational_likely: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      },
      loss_operational_max: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      },

      // Loss Magnitude: Litigation Costs
      loss_litigation_min: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      },
      loss_litigation_likely: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      },
      loss_litigation_max: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      },

      // Loss Magnitude: Reputational Damage
      loss_reputational_min: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      },
      loss_reputational_likely: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      },
      loss_reputational_max: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      },

      // Metadata
      source: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('now'),
      },
    });

    console.log('Successfully created risk_benchmarks table.');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable({ tableName: 'risk_benchmarks', schema: 'verifywise' });
    console.log('Successfully dropped risk_benchmarks table.');
  },
};
