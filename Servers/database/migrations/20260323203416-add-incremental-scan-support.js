'use strict';

/**
 * Adds incremental scan support columns to ai_detection_scans and ai_detection_findings.
 *
 * ai_detection_scans:
 *   - scan_mode: 'full' (default) or 'incremental'
 *   - base_commit_sha / head_commit_sha: git SHAs for incremental diff
 *   - baseline_scan_id: FK to the full scan used as baseline
 *   - changed_files_count: number of files in the diff
 *
 * ai_detection_findings:
 *   - finding_status: 'active' (default), 'fixed', or 'carried_forward'
 *   - index on (scan_id, finding_status) for efficient filtering
 */

const SCHEMA = 'verifywise';
const SCANS_TABLE = { tableName: 'ai_detection_scans', schema: SCHEMA };
const FINDINGS_TABLE = { tableName: 'ai_detection_findings', schema: SCHEMA };

async function columnExists(queryInterface, tableRef, column) {
  const desc = await queryInterface.describeTable(tableRef.tableName, { schema: tableRef.schema });
  return !!desc[column];
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // --- ai_detection_scans columns ---
    if (!(await columnExists(queryInterface, SCANS_TABLE, 'scan_mode'))) {
      await queryInterface.addColumn(SCANS_TABLE, 'scan_mode', {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'full',
      });
    }

    if (!(await columnExists(queryInterface, SCANS_TABLE, 'base_commit_sha'))) {
      await queryInterface.addColumn(SCANS_TABLE, 'base_commit_sha', {
        type: Sequelize.STRING(40),
        allowNull: true,
      });
    }

    if (!(await columnExists(queryInterface, SCANS_TABLE, 'head_commit_sha'))) {
      await queryInterface.addColumn(SCANS_TABLE, 'head_commit_sha', {
        type: Sequelize.STRING(40),
        allowNull: true,
      });
    }

    if (!(await columnExists(queryInterface, SCANS_TABLE, 'baseline_scan_id'))) {
      await queryInterface.addColumn(SCANS_TABLE, 'baseline_scan_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: SCANS_TABLE,
          key: 'id',
        },
        onDelete: 'SET NULL',
      });
    }

    if (!(await columnExists(queryInterface, SCANS_TABLE, 'changed_files_count'))) {
      await queryInterface.addColumn(SCANS_TABLE, 'changed_files_count', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }

    // --- ai_detection_findings columns ---
    if (!(await columnExists(queryInterface, FINDINGS_TABLE, 'finding_status'))) {
      await queryInterface.addColumn(FINDINGS_TABLE, 'finding_status', {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'active',
      });
    }

    // --- Index for efficient filtering by finding_status ---
    try {
      await queryInterface.addIndex(FINDINGS_TABLE, ['scan_id', 'finding_status'], {
        name: 'idx_findings_scan_id_finding_status',
      });
    } catch (e) {
      // Index may already exist
      if (!e.message.includes('already exists')) throw e;
    }
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      FINDINGS_TABLE,
      'idx_findings_scan_id_finding_status'
    ).catch(() => {});
    await queryInterface.removeColumn(FINDINGS_TABLE, 'finding_status').catch(() => {});
    await queryInterface.removeColumn(SCANS_TABLE, 'changed_files_count').catch(() => {});
    await queryInterface.removeColumn(SCANS_TABLE, 'baseline_scan_id').catch(() => {});
    await queryInterface.removeColumn(SCANS_TABLE, 'head_commit_sha').catch(() => {});
    await queryInterface.removeColumn(SCANS_TABLE, 'base_commit_sha').catch(() => {});
    await queryInterface.removeColumn(SCANS_TABLE, 'scan_mode').catch(() => {});
  },
};
