'use strict';

/**
 * Migration: Add Quantitative Risk Assessment Fields
 *
 * Adds FAIR-inspired quantitative risk fields to the risks table and
 * a risk_assessment_mode toggle to the organizations table.
 *
 * All new columns are nullable — zero impact on existing qualitative workflows.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // =============================================
      // 1. Add risk_assessment_mode to organizations
      // =============================================
      await queryInterface.addColumn(
        'organizations',
        'risk_assessment_mode',
        {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: 'qualitative',
        },
        { transaction }
      );

      // =============================================
      // 2. Add FAIR columns to risks table
      // =============================================

      // Event Frequency (annualized)
      await queryInterface.addColumn('risks', 'event_frequency_min', {
        type: Sequelize.DECIMAL(12, 4),
        allowNull: true,
      }, { transaction });

      await queryInterface.addColumn('risks', 'event_frequency_likely', {
        type: Sequelize.DECIMAL(12, 4),
        allowNull: true,
      }, { transaction });

      await queryInterface.addColumn('risks', 'event_frequency_max', {
        type: Sequelize.DECIMAL(12, 4),
        allowNull: true,
      }, { transaction });

      // Loss Magnitude: Regulatory Fines
      await queryInterface.addColumn('risks', 'loss_regulatory_min', {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      }, { transaction });

      await queryInterface.addColumn('risks', 'loss_regulatory_likely', {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      }, { transaction });

      await queryInterface.addColumn('risks', 'loss_regulatory_max', {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      }, { transaction });

      // Loss Magnitude: Operational Costs
      await queryInterface.addColumn('risks', 'loss_operational_min', {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      }, { transaction });

      await queryInterface.addColumn('risks', 'loss_operational_likely', {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      }, { transaction });

      await queryInterface.addColumn('risks', 'loss_operational_max', {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      }, { transaction });

      // Loss Magnitude: Litigation Costs
      await queryInterface.addColumn('risks', 'loss_litigation_min', {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      }, { transaction });

      await queryInterface.addColumn('risks', 'loss_litigation_likely', {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      }, { transaction });

      await queryInterface.addColumn('risks', 'loss_litigation_max', {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      }, { transaction });

      // Loss Magnitude: Reputational Damage
      await queryInterface.addColumn('risks', 'loss_reputational_min', {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      }, { transaction });

      await queryInterface.addColumn('risks', 'loss_reputational_likely', {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      }, { transaction });

      await queryInterface.addColumn('risks', 'loss_reputational_max', {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      }, { transaction });

      // Computed fields (stored for aggregation performance)
      await queryInterface.addColumn('risks', 'total_loss_likely', {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      }, { transaction });

      await queryInterface.addColumn('risks', 'ale_estimate', {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      }, { transaction });

      // Mitigation quantitative fields
      await queryInterface.addColumn('risks', 'control_effectiveness', {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true,
      }, { transaction });

      await queryInterface.addColumn('risks', 'residual_ale', {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      }, { transaction });

      await queryInterface.addColumn('risks', 'mitigation_cost_annual', {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      }, { transaction });

      await queryInterface.addColumn('risks', 'roi_percentage', {
        type: Sequelize.DECIMAL(8, 2),
        allowNull: true,
      }, { transaction });

      // Benchmark reference
      await queryInterface.addColumn('risks', 'benchmark_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
      }, { transaction });

      // Currency
      await queryInterface.addColumn('risks', 'currency', {
        type: Sequelize.STRING(3),
        allowNull: true,
        defaultValue: 'USD',
      }, { transaction });

      await transaction.commit();
      console.log('Successfully added quantitative risk assessment fields.');
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Remove from risks table (reverse order)
      const riskColumns = [
        'currency',
        'benchmark_id',
        'roi_percentage',
        'mitigation_cost_annual',
        'residual_ale',
        'control_effectiveness',
        'ale_estimate',
        'total_loss_likely',
        'loss_reputational_max',
        'loss_reputational_likely',
        'loss_reputational_min',
        'loss_litigation_max',
        'loss_litigation_likely',
        'loss_litigation_min',
        'loss_operational_max',
        'loss_operational_likely',
        'loss_operational_min',
        'loss_regulatory_max',
        'loss_regulatory_likely',
        'loss_regulatory_min',
        'event_frequency_max',
        'event_frequency_likely',
        'event_frequency_min',
      ];

      for (const col of riskColumns) {
        await queryInterface.removeColumn('risks', col, { transaction });
      }

      // Remove from organizations table
      await queryInterface.removeColumn('organizations', 'risk_assessment_mode', { transaction });

      await transaction.commit();
      console.log('Successfully rolled back quantitative risk assessment fields.');
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
