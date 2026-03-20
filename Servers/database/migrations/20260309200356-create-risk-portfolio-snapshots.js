'use strict';

/**
 * Migration: Create Risk Portfolio Snapshots Table
 *
 * Stores periodic snapshots of aggregated quantitative risk exposure
 * at org-level and project-level. Used for trend tracking on the
 * executive dashboard ("portfolio exposure over time").
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable({ tableName: 'risk_portfolio_snapshots', schema: 'verifywise' }, {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      organization_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'organizations', key: 'id' },
        onDelete: 'CASCADE',
      },
      project_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'projects', key: 'id' },
        onDelete: 'CASCADE',
      },
      total_ale: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      total_residual_ale: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      total_mitigation_cost: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      risk_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      snapshot_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('now'),
      },
    });

    // Index for efficient trend queries
    await queryInterface.addIndex(
      { tableName: 'risk_portfolio_snapshots', schema: 'verifywise' },
      ['organization_id', 'snapshot_date'],
      { name: 'idx_risk_portfolio_snapshots_org_date' }
    );

    console.log('Successfully created risk_portfolio_snapshots table.');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable({ tableName: 'risk_portfolio_snapshots', schema: 'verifywise' });
    console.log('Successfully dropped risk_portfolio_snapshots table.');
  },
};
