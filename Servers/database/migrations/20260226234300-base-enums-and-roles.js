'use strict';

/**
 * Base ENUMs and Roles Migration
 *
 * This creates all ENUM types and the roles table needed by the application.
 * Part 1 of the fresh installation migration set.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      console.log('🚀 Creating base ENUMs and roles...');

      // ========================================
      // CREATE SCHEMA
      // ========================================
      await queryInterface.sequelize.query(`
        CREATE SCHEMA IF NOT EXISTS verifywise;
      `, { transaction });

      // ========================================
      // CORE ENUMS
      // ========================================

      // Project status
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.projects_status_enum AS ENUM ('Not started', 'In progress', 'Under review', 'Completed', 'Closed', 'On hold', 'Rejected');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      // Project risk classification
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_projects_ai_risk_classification AS ENUM (
            'High risk', 'Limited risk', 'Minimal risk',
            'Prohibited', 'gpai', 'gpai_systemic', 'not_ai_system'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      // High risk role types
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_projects_type_of_high_risk_role AS ENUM (
            'Deployer', 'Provider', 'Distributor', 'Importer',
            'Product manufacturer', 'Authorized representative',
            'not_applicable'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      // Vendor review status
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_vendors_review_status AS ENUM (
            'Not started', 'In review', 'Reviewed', 'Requires follow-up', 'Superseded'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      // Vendor scorecard enums
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_vendors_data_sensitivity AS ENUM (
            'None', 'Internal only', 'Personally identifiable information (PII)',
            'Financial data', 'Health data (e.g. HIPAA)',
            'Model weights or AI assets', 'Other sensitive data'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_vendors_business_criticality AS ENUM (
            'Low (vendor supports non-core functions)',
            'Medium (affects operations but is replaceable)',
            'High (critical to core services or products)'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_vendors_past_issues AS ENUM (
            'None', 'Minor incident (e.g. small delay, minor bug)',
            'Major incident (e.g. data breach, legal issue)'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_vendors_regulatory_exposure AS ENUM (
            'None', 'GDPR (EU)', 'HIPAA (US)', 'SOC 2',
            'ISO 27001', 'EU AI act', 'CCPA (california)', 'Other'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      // Training status
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_trainingregistar_status AS ENUM (
            'Planned', 'In Progress', 'Completed'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      // Event log types
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_event_logs_event_type AS ENUM (
            'Create', 'Read', 'Update', 'Delete', 'Login', 'Logout', 'Error'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      // Risk enums
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_projectrisks_ai_lifecycle_phase AS ENUM (
            'Problem definition & planning',
            'Data collection & processing',
            'Model development & training',
            'Model validation & testing',
            'Deployment & integration',
            'Monitoring & maintenance',
            'Decommissioning & retirement'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_projectrisks_risk_category AS ENUM (
            'Strategic risk', 'Operational risk', 'Compliance risk', 'Financial risk',
            'Cybersecurity risk', 'Reputational risk', 'Legal risk', 'Technological risk',
            'Third-party/vendor risk', 'Environmental risk', 'Human resources risk',
            'Geopolitical risk', 'Fraud risk', 'Data privacy risk', 'Health and safety risk'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_projectrisks_likelihood AS ENUM (
            'Rare', 'Unlikely', 'Possible', 'Likely', 'Almost Certain'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_projectrisks_severity AS ENUM (
            'Negligible', 'Minor', 'Moderate', 'Major', 'Catastrophic'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_projectrisks_risk_level_autocalculated AS ENUM (
            'No risk', 'Very low risk', 'Low risk', 'Medium risk', 'High risk', 'Very high risk'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_projectrisks_mitigation_status AS ENUM (
            'Not Started', 'In Progress', 'Completed', 'On Hold', 'Deferred', 'Canceled', 'Requires review'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_projectrisks_current_risk_level AS ENUM (
            'Very Low risk', 'Low risk', 'Medium risk', 'High risk', 'Very high risk'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_projectrisks_likelihood_mitigation AS ENUM (
            'Rare', 'Unlikely', 'Possible', 'Likely', 'Almost Certain'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_projectrisks_risk_severity AS ENUM (
            'Critical', 'Major', 'Minor', 'Moderate', 'Negligible'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      // Vendor risk enums
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_vendorrisks_likelihood AS ENUM (
            'Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_vendorrisks_risk_severity AS ENUM (
            'Negligible', 'Minor', 'Moderate', 'Major', 'Catastrophic'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      // File source enum
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_files_source AS ENUM (
            'Manual', 'Reporting', 'Policy', 'Vendor', 'Model',
            'Risk', 'Assessment', 'Control', 'Evidence', 'Training',
            'ISO42001Clause', 'ISO42001Annex', 'ISO27001Clause', 'ISO27001Annex',
            'NIST_AI_RMF', 'Incident', 'PMM', 'Plugin',
            'Assessment tracker group', 'Compliance tracker group',
            'Project risks report', 'Compliance tracker report', 'Assessment tracker report',
            'Vendors and risks report', 'All reports',
            'Management system clauses group', 'Reference controls group',
            'Main clauses group', 'Annex controls group', 'ISO 27001 report',
            'Clauses and annexes report',
            'Models and risks report', 'Training registry report', 'Policy manager report',
            'Subcategories group', 'AI trust center group',
            'Post-Market Monitoring report',
            'File Manager', 'policy_editor', 'dataset_bulk_upload'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      // Control status enums
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_controls_status AS ENUM ('Waiting', 'In progress', 'Done');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_controls_risk_review AS ENUM (
            'Acceptable risk', 'Residual risk', 'Unacceptable risk'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_subcontrols_status AS ENUM ('Waiting', 'In progress', 'Done');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_subcontrols_risk_review AS ENUM (
            'Acceptable risk', 'Residual risk', 'Unacceptable risk'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_status_questions AS ENUM (
            'Not started', 'In progress', 'Done'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      // ISO status enums
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_subclauses_iso_status AS ENUM (
            'Not started', 'Draft', 'In progress', 'Awaiting review',
            'Awaiting approval', 'Implemented', 'Audited', 'Needs rework'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_annexcategories_iso_status AS ENUM (
            'Not started', 'Draft', 'In progress', 'Awaiting review',
            'Awaiting approval', 'Implemented', 'Audited', 'Needs rework'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      // Model inventory status
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_model_inventories_status AS ENUM (
            'Approved', 'Restricted', 'Pending', 'Blocked', 'Rejected'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      // Model risk enums
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_model_risks_risk_category AS ENUM (
            'Performance', 'Bias & Fairness', 'Security', 'Data Quality', 'Compliance'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_model_risks_risk_level AS ENUM (
            'Low', 'Medium', 'High', 'Critical'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_model_risks_status AS ENUM (
            'Open', 'In Progress', 'Resolved', 'Accepted'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      // Dataset enums
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_dataset_status AS ENUM ('Draft', 'Active', 'Deprecated', 'Archived');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_dataset_type AS ENUM ('Training', 'Validation', 'Testing', 'Production', 'Reference');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_data_classification AS ENUM ('Public', 'Internal', 'Confidential', 'Restricted');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      // Task enums
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_tasks_priority AS ENUM ('Low', 'Medium', 'High');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_tasks_status AS ENUM ('Open', 'In Progress', 'Completed', 'Overdue', 'Deleted');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      // Notification enums
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_notification_type AS ENUM (
            'task_assigned', 'task_completed', 'task_updated',
            'review_requested', 'review_approved', 'review_rejected',
            'approval_requested', 'approval_approved', 'approval_rejected', 'approval_complete',
            'policy_due_soon', 'policy_overdue',
            'training_assigned', 'training_completed',
            'vendor_review_due', 'file_uploaded', 'comment_added', 'mention', 'system',
            'assignment_owner', 'assignment_reviewer', 'assignment_approver',
            'assignment_member', 'assignment_assignee', 'assignment_action_owner', 'assignment_risk_owner'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_notification_entity_type AS ENUM (
            'project', 'task', 'policy', 'vendor', 'model', 'training',
            'file', 'use_case', 'risk', 'assessment', 'comment', 'user'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      // LLM Keys enum
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_llm_keys_provider AS ENUM ('Anthropic', 'OpenAI', 'OpenRouter', 'Custom');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      // NIST AI RMF enums
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_nist_ai_rmf_status AS ENUM (
            'Not started', 'Draft', 'In progress', 'Awaiting review',
            'Awaiting approval', 'Implemented', 'Needs rework', 'Audited'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_nist_ai_rmf_subcategories_status AS ENUM (
            'Not started', 'Draft', 'In progress', 'Awaiting review',
            'Awaiting approval', 'Implemented', 'Needs rework', 'Audited'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      // ========================================
      // ROLES TABLE
      // ========================================
      console.log('📋 Creating roles table...');

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.roles (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description VARCHAR(255) NOT NULL,
          is_demo BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMP NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `, { transaction });

      // Insert default roles
      await queryInterface.sequelize.query(`
        INSERT INTO verifywise.roles (id, name, description) VALUES
          (1, 'Admin', 'Administrator with full access to the system.'),
          (2, 'Reviewer', 'Reviewer with access to review compliance and reports.'),
          (3, 'Editor', 'Editor with permission to modify and update project details.'),
          (4, 'Auditor', 'Auditor with access to compliance and security audits.')
        ON CONFLICT (id) DO NOTHING;
      `, { transaction });

      // Reset sequence
      await queryInterface.sequelize.query(`
        SELECT setval('verifywise.roles_id_seq', (SELECT MAX(id) FROM verifywise.roles));
      `, { transaction });

      await transaction.commit();
      console.log('✅ Base ENUMs and roles created successfully!');

    } catch (error) {
      await transaction.rollback();
      console.error('❌ Migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      console.log('🔄 Rolling back base ENUMs and roles...');

      // Drop roles table
      await queryInterface.sequelize.query(`DROP TABLE IF EXISTS verifywise.roles CASCADE;`, { transaction });

      // Note: We don't drop ENUMs here as they may be used by other tables
      // ENUMs should be dropped last if needed

      await transaction.commit();
      console.log('✅ Rollback completed successfully!');
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Rollback failed:', error);
      throw error;
    }
  }
};
