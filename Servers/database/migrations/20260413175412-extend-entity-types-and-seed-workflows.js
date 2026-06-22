"use strict";

/**
 * Phase 2 — Extend Approval Workflows to All Entity Types
 *
 * 1. Alters entity_type columns to VARCHAR(50) to support new types
 * 2. Seeds default workflow templates for each entity type
 */
module.exports = {
  async up(queryInterface) {
    // 1. Drop old CHECK constraints and alter entity_type columns to VARCHAR(50)
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.approval_workflows
        DROP CONSTRAINT IF EXISTS approval_workflows_entity_type_check;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.approval_workflows
        ALTER COLUMN entity_type TYPE VARCHAR(50);
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.approval_requests
        DROP CONSTRAINT IF EXISTS approval_requests_entity_type_check;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.approval_requests
        ALTER COLUMN entity_type TYPE VARCHAR(50);
    `);

    // 2. Seed default workflow templates (organization_id = NULL means global defaults)
    // These will be cloned per-org on first use or can be used as-is

    // Risk: Single step → Admin
    await queryInterface.sequelize.query(`
      INSERT INTO verifywise.approval_workflows
        (organization_id, workflow_title, entity_type, description, is_active, created_at, updated_at)
      SELECT o.id, 'Risk Approval', 'risk',
        'Default approval workflow for risk operations', true, NOW(), NOW()
      FROM verifywise.organizations o
      WHERE NOT EXISTS (
        SELECT 1 FROM verifywise.approval_workflows w
        WHERE w.organization_id = o.id AND w.entity_type = 'risk'
      );
    `);

    // Policy: Single step → Admin
    await queryInterface.sequelize.query(`
      INSERT INTO verifywise.approval_workflows
        (organization_id, workflow_title, entity_type, description, is_active, created_at, updated_at)
      SELECT o.id, 'Policy Approval', 'policy',
        'Default approval workflow for policy operations', true, NOW(), NOW()
      FROM verifywise.organizations o
      WHERE NOT EXISTS (
        SELECT 1 FROM verifywise.approval_workflows w
        WHERE w.organization_id = o.id AND w.entity_type = 'policy'
      );
    `);

    // Vendor: Single step → Admin
    await queryInterface.sequelize.query(`
      INSERT INTO verifywise.approval_workflows
        (organization_id, workflow_title, entity_type, description, is_active, created_at, updated_at)
      SELECT o.id, 'Vendor Approval', 'vendor',
        'Default approval workflow for vendor operations', true, NOW(), NOW()
      FROM verifywise.organizations o
      WHERE NOT EXISTS (
        SELECT 1 FROM verifywise.approval_workflows w
        WHERE w.organization_id = o.id AND w.entity_type = 'vendor'
      );
    `);

    // Model Inventory: Single step → Admin
    await queryInterface.sequelize.query(`
      INSERT INTO verifywise.approval_workflows
        (organization_id, workflow_title, entity_type, description, is_active, created_at, updated_at)
      SELECT o.id, 'Model Approval', 'model_inventory',
        'Default approval workflow for model inventory operations', true, NOW(), NOW()
      FROM verifywise.organizations o
      WHERE NOT EXISTS (
        SELECT 1 FROM verifywise.approval_workflows w
        WHERE w.organization_id = o.id AND w.entity_type = 'model_inventory'
      );
    `);

    // Incident: Single step → Admin
    await queryInterface.sequelize.query(`
      INSERT INTO verifywise.approval_workflows
        (organization_id, workflow_title, entity_type, description, is_active, created_at, updated_at)
      SELECT o.id, 'Incident Approval', 'incident',
        'Default approval workflow for incident operations', true, NOW(), NOW()
      FROM verifywise.organizations o
      WHERE NOT EXISTS (
        SELECT 1 FROM verifywise.approval_workflows w
        WHERE w.organization_id = o.id AND w.entity_type = 'incident'
      );
    `);

    // Dataset: Single step → Admin
    await queryInterface.sequelize.query(`
      INSERT INTO verifywise.approval_workflows
        (organization_id, workflow_title, entity_type, description, is_active, created_at, updated_at)
      SELECT o.id, 'Dataset Approval', 'dataset',
        'Default approval workflow for dataset operations', true, NOW(), NOW()
      FROM verifywise.organizations o
      WHERE NOT EXISTS (
        SELECT 1 FROM verifywise.approval_workflows w
        WHERE w.organization_id = o.id AND w.entity_type = 'dataset'
      );
    `);

    // Evidence: Single step → Admin
    await queryInterface.sequelize.query(`
      INSERT INTO verifywise.approval_workflows
        (organization_id, workflow_title, entity_type, description, is_active, created_at, updated_at)
      SELECT o.id, 'Evidence Approval', 'evidence',
        'Default approval workflow for evidence operations', true, NOW(), NOW()
      FROM verifywise.organizations o
      WHERE NOT EXISTS (
        SELECT 1 FROM verifywise.approval_workflows w
        WHERE w.organization_id = o.id AND w.entity_type = 'evidence'
      );
    `);

    // AI Action: Single step → Admin
    await queryInterface.sequelize.query(`
      INSERT INTO verifywise.approval_workflows
        (organization_id, workflow_title, entity_type, description, is_active, created_at, updated_at)
      SELECT o.id, 'AI Action Approval', 'ai_action',
        'Approval workflow for AI-triggered write operations', true, NOW(), NOW()
      FROM verifywise.organizations o
      WHERE NOT EXISTS (
        SELECT 1 FROM verifywise.approval_workflows w
        WHERE w.organization_id = o.id AND w.entity_type = 'ai_action'
      );
    `);

    // Add a default step "Admin Approval" to each new workflow that doesn't have steps yet
    await queryInterface.sequelize.query(`
      INSERT INTO verifywise.approval_workflow_steps
        (organization_id, workflow_id, step_number, step_name, description, requires_all_approvers, created_at)
      SELECT w.organization_id, w.id, 1, 'Admin Approval',
        'Requires admin approval', false, NOW()
      FROM verifywise.approval_workflows w
      WHERE w.entity_type IN ('risk', 'policy', 'vendor', 'model_inventory', 'incident', 'dataset', 'evidence', 'ai_action')
        AND NOT EXISTS (
          SELECT 1 FROM verifywise.approval_workflow_steps s WHERE s.workflow_id = w.id
        );
    `);
  },

  async down(queryInterface) {
    // Remove seeded workflows for new entity types
    await queryInterface.sequelize.query(`
      DELETE FROM verifywise.approval_workflows
      WHERE entity_type IN ('risk', 'policy', 'vendor', 'model_inventory', 'incident', 'dataset', 'evidence', 'ai_action');
    `);
  },
};
