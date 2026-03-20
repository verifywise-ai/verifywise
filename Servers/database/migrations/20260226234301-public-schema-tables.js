'use strict';

/**
 * Public Schema Tables Migration
 *
 * Creates all public/shared tables in the verifywise schema.
 * All tables are created fresh (no IF NOT EXISTS).
 * NIST implementation tables are in 234302-tenant-tables.js.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('Setting up public schema tables...');

    const transaction = await queryInterface.sequelize.transaction();

    try {
      // ========================================
      // ORGANIZATIONS
      // ========================================
      console.log('Creating organizations table...');

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.organizations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          logo TEXT,
          tenant_id VARCHAR(20) UNIQUE,
          onboarding_status VARCHAR(50) DEFAULT 'pending',
          subscription_id INTEGER,
          slug VARCHAR(255) UNIQUE,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `, { transaction });

      await queryInterface.sequelize.query(`CREATE INDEX IF NOT EXISTS idx_organizations_tenant_id ON verifywise.organizations(tenant_id);`, { transaction });

      // Auto-update updated_at trigger for organizations
      await queryInterface.sequelize.query(`
        CREATE OR REPLACE FUNCTION verifywise.update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `, { transaction });

      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at' AND tgrelid = 'verifywise.organizations'::regclass
          ) THEN
            CREATE TRIGGER set_updated_at
            BEFORE UPDATE ON verifywise.organizations
            FOR EACH ROW
            EXECUTE FUNCTION verifywise.update_updated_at_column();
          END IF;
        END $$;
      `, { transaction });

      // NOTE: roles table is created by 20260226234300-base-enums-and-roles.js
      // Do not create or modify it here

      // ========================================
      // USERS
      // ========================================
      console.log('Creating users table...');

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.users (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          surname VARCHAR(255),
          email VARCHAR(255) NOT NULL,
          password_hash VARCHAR(255),
          role_id INTEGER REFERENCES verifywise.roles(id),
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          profile_photo_id INTEGER,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          last_login TIMESTAMP,
          is_demo BOOLEAN DEFAULT false
        );
      `, { transaction });

      await queryInterface.sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON verifywise.users(email);`, { transaction });
      await queryInterface.sequelize.query(`CREATE INDEX IF NOT EXISTS idx_users_organization_id ON verifywise.users(organization_id);`, { transaction });

      // ========================================
      // TIERS & SUBSCRIPTIONS
      // ========================================
      console.log('Creating tiers and subscriptions tables...');

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.tiers (
          id SERIAL PRIMARY KEY,
          name VARCHAR(50) NOT NULL,
          price INTEGER NOT NULL DEFAULT 0,
          features JSONB NOT NULL DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `, { transaction });

      // Insert default tiers
      await queryInterface.sequelize.query(`
        INSERT INTO verifywise.tiers (name, price, features) VALUES
          ('Free', 0, '{"seats": 2, "projects": 1, "frameworks": 1}'),
          ('Team', 139, '{"seats": 0, "projects": 10, "frameworks": 0}'),
          ('Growth', 299, '{"seats": 0, "projects": 50, "frameworks": 0}'),
          ('Enterprise', 799, '{"seats": 0, "projects": 0, "frameworks": 0}')
        ON CONFLICT DO NOTHING;
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.subscriptions (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
          tier_id INTEGER NOT NULL REFERENCES verifywise.tiers(id) ON DELETE RESTRICT ON UPDATE CASCADE,
          stripe_sub_id VARCHAR(255) NOT NULL UNIQUE,
          status VARCHAR(10) NOT NULL CHECK (status IN ('active', 'inactive', 'canceled')),
          start_date TIMESTAMP WITH TIME ZONE NOT NULL,
          end_date TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          CONSTRAINT chk_subscriptions_date_range CHECK (end_date IS NULL OR start_date < end_date)
        );
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.subscription_history (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
          subscription_id INTEGER NOT NULL REFERENCES verifywise.subscriptions(id) ON DELETE CASCADE ON UPDATE CASCADE,
          action VARCHAR(50) NOT NULL CHECK (action IN ('created', 'upgraded', 'downgraded', 'canceled')),
          timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `, { transaction });

      // Add FK from organizations to subscriptions
      await queryInterface.sequelize.query(`
        ALTER TABLE verifywise.organizations ADD CONSTRAINT fk_organizations_subscription
          FOREIGN KEY (subscription_id) REFERENCES verifywise.subscriptions(id) ON DELETE SET NULL ON UPDATE CASCADE;
      `, { transaction });

      // ========================================
      // FRAMEWORKS
      // ========================================
      console.log('Creating frameworks table...');

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.frameworks (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          version VARCHAR(50),
          is_organizational BOOLEAN DEFAULT false,
          is_active BOOLEAN DEFAULT true,
          is_demo BOOLEAN DEFAULT false,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `, { transaction });

      await queryInterface.sequelize.query(`
        INSERT INTO verifywise.frameworks (id, name, description, version, is_organizational) VALUES
          (1, 'EU AI Act', 'European Union Artificial Intelligence Act', '1.0', false),
          (2, 'ISO 42001', 'AI Management System Standard', '2023', true),
          (3, 'ISO 27001', 'Information Security Management', '2022', true),
          (4, 'NIST AI RMF', 'NIST AI Risk Management Framework', '1.0', true)
        ON CONFLICT (id) DO NOTHING;
      `, { transaction });

      // Reset sequence to max id
      await queryInterface.sequelize.query(`
        SELECT setval('verifywise.frameworks_id_seq', COALESCE((SELECT MAX(id) FROM verifywise.frameworks), 1));
      `, { transaction });

      // ========================================
      // EU AI ACT STRUCTURE TABLES
      // ========================================
      console.log('Creating EU AI Act structure tables...');

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.topics_struct_eu (
          id SERIAL PRIMARY KEY,
          framework_id INTEGER NOT NULL REFERENCES verifywise.frameworks(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          order_no INTEGER,
          is_demo BOOLEAN DEFAULT false
        );
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.subtopics_struct_eu (
          id SERIAL PRIMARY KEY,
          topic_id INTEGER REFERENCES verifywise.topics_struct_eu(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          order_no INTEGER,
          is_demo BOOLEAN DEFAULT false
        );
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.questions_struct_eu (
          id SERIAL PRIMARY KEY,
          subtopic_id INTEGER REFERENCES verifywise.subtopics_struct_eu(id) ON DELETE CASCADE,
          order_no INTEGER,
          question TEXT NOT NULL,
          hint TEXT,
          priority_level VARCHAR(50),
          answer_type VARCHAR(50) DEFAULT 'Long text',
          input_type VARCHAR(50),
          evidence_required BOOLEAN NOT NULL DEFAULT false,
          is_required BOOLEAN NOT NULL DEFAULT false,
          dropdown_options TEXT[],
          is_demo BOOLEAN DEFAULT false
        );
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.controlcategories_struct_eu (
          id SERIAL PRIMARY KEY,
          framework_id INTEGER NOT NULL REFERENCES verifywise.frameworks(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          order_no INTEGER,
          is_demo BOOLEAN DEFAULT false
        );
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.controls_struct_eu (
          id SERIAL PRIMARY KEY,
          control_category_id INTEGER REFERENCES verifywise.controlcategories_struct_eu(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          description TEXT,
          order_no INTEGER,
          is_demo BOOLEAN DEFAULT false
        );
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.subcontrols_struct_eu (
          id SERIAL PRIMARY KEY,
          control_id INTEGER REFERENCES verifywise.controls_struct_eu(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          description TEXT,
          order_no INTEGER,
          is_demo BOOLEAN DEFAULT false
        );
      `, { transaction });

      // ========================================
      // ISO 42001 STRUCTURE TABLES
      // ========================================
      console.log('Creating ISO 42001 structure tables...');

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.clauses_struct_iso (
          id SERIAL PRIMARY KEY,
          framework_id INTEGER NOT NULL REFERENCES verifywise.frameworks(id) ON DELETE CASCADE,
          clause_id VARCHAR(50) NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          clause_no INTEGER,
          order_no INTEGER,
          is_demo BOOLEAN DEFAULT false
        );
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.subclauses_struct_iso (
          id SERIAL PRIMARY KEY,
          clause_id INTEGER REFERENCES verifywise.clauses_struct_iso(id) ON DELETE CASCADE,
          subclause_id VARCHAR(50) NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          guidance TEXT,
          summary TEXT,
          questions TEXT[],
          evidence_examples TEXT[],
          order_no INTEGER,
          is_demo BOOLEAN DEFAULT false
        );
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.annex_struct_iso (
          id SERIAL PRIMARY KEY,
          framework_id INTEGER NOT NULL REFERENCES verifywise.frameworks(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          annex_no INTEGER,
          order_no INTEGER,
          is_demo BOOLEAN DEFAULT false
        );
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.annexcategories_struct_iso (
          id SERIAL PRIMARY KEY,
          annex_id INTEGER REFERENCES verifywise.annex_struct_iso(id) ON DELETE CASCADE,
          sub_id INTEGER,
          title TEXT NOT NULL,
          description TEXT,
          guidance TEXT,
          order_no INTEGER,
          is_demo BOOLEAN DEFAULT false
        );
      `, { transaction });

      // ========================================
      // ISO 27001 STRUCTURE TABLES
      // ========================================
      console.log('Creating ISO 27001 structure tables...');

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.annex_struct_iso27001 (
          id SERIAL PRIMARY KEY,
          framework_id INTEGER NOT NULL REFERENCES verifywise.frameworks(id) ON DELETE CASCADE,
          arrangement VARCHAR(50) NOT NULL,
          title TEXT NOT NULL,
          order_no INTEGER NOT NULL,
          is_demo BOOLEAN DEFAULT false
        );
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.clauses_struct_iso27001 (
          id SERIAL PRIMARY KEY,
          framework_id INTEGER NOT NULL REFERENCES verifywise.frameworks(id) ON DELETE CASCADE,
          clause_id VARCHAR(50) NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          order_no INTEGER,
          is_demo BOOLEAN DEFAULT false
        );
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.subclauses_struct_iso27001 (
          id SERIAL PRIMARY KEY,
          clause_id INTEGER REFERENCES verifywise.clauses_struct_iso27001(id) ON DELETE CASCADE,
          subclause_id VARCHAR(50) NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          guidance TEXT,
          requirement_summary TEXT,
          key_questions TEXT[],
          evidence_examples TEXT[],
          order_no INTEGER,
          is_demo BOOLEAN DEFAULT false
        );
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.annexcategories_struct_iso27001 (
          id SERIAL PRIMARY KEY,
          framework_id INTEGER NOT NULL REFERENCES verifywise.frameworks(id) ON DELETE CASCADE,
          annex_id VARCHAR(50) NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          order_no INTEGER,
          is_demo BOOLEAN DEFAULT false
        );
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.annexcontrols_struct_iso27001 (
          id SERIAL PRIMARY KEY,
          category_id INTEGER REFERENCES verifywise.annexcategories_struct_iso27001(id) ON DELETE CASCADE,
          annex_id INTEGER,
          control_id VARCHAR(50) NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          guidance TEXT,
          requirement_summary TEXT,
          key_questions TEXT[],
          evidence_examples TEXT[],
          order_no INTEGER,
          is_demo BOOLEAN DEFAULT false
        );
      `, { transaction });

      // ========================================
      // FILES AND FILE LINKS
      // ========================================
      console.log('Creating files tables...');

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.files (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          filename VARCHAR(255) NOT NULL,
          content BYTEA,
          project_id INTEGER,
          uploaded_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          uploaded_time TIMESTAMP WITH TIME ZONE DEFAULT now(),
          is_demo BOOLEAN NOT NULL DEFAULT false,
          source VARCHAR(255),
          type VARCHAR(255),
          size BIGINT,
          file_path VARCHAR(500),
          org_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          model_id INTEGER,
          tags JSONB DEFAULT '[]'::jsonb,
          review_status VARCHAR(20) DEFAULT 'draft',
          version VARCHAR(20) DEFAULT '1.0',
          expiry_date DATE,
          last_modified_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
          description TEXT,
          file_group_id UUID DEFAULT gen_random_uuid(),
          approval_workflow_id INTEGER,
          approval_request_id INTEGER,
          content_text TEXT,
          content_search TSVECTOR
        );
      `, { transaction });

      await queryInterface.sequelize.query(`CREATE INDEX idx_files_org ON verifywise.files(organization_id);`, { transaction });
      await queryInterface.sequelize.query(`CREATE INDEX idx_files_project ON verifywise.files(project_id);`, { transaction });

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.file_entity_links (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          file_id INTEGER NOT NULL REFERENCES verifywise.files(id) ON DELETE CASCADE,
          framework_type VARCHAR(50) NOT NULL,
          entity_type VARCHAR(50) NOT NULL,
          entity_id INTEGER NOT NULL,
          project_id INTEGER,
          link_type VARCHAR(20) DEFAULT 'evidence',
          created_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(file_id, framework_type, entity_type, entity_id)
        );
      `, { transaction });

      await queryInterface.sequelize.query(`CREATE INDEX idx_file_entity_links_org ON verifywise.file_entity_links(organization_id);`, { transaction });
      await queryInterface.sequelize.query(`CREATE INDEX idx_file_entity_links_file ON verifywise.file_entity_links(file_id);`, { transaction });

      // ========================================
      // NIST AI RMF STRUCTURE TABLES
      // ========================================
      console.log('Creating NIST AI RMF structure tables...');

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.nist_ai_rmf_categories_struct (
          id SERIAL PRIMARY KEY,
          framework_id INTEGER NOT NULL REFERENCES verifywise.frameworks(id) ON DELETE CASCADE,
          function VARCHAR(20) NOT NULL,
          category_id INTEGER NOT NULL,
          description TEXT,
          order_no INTEGER,
          is_demo BOOLEAN DEFAULT false,
          UNIQUE(function, category_id)
        );
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.nist_ai_rmf_subcategories_struct (
          id SERIAL PRIMARY KEY,
          category_struct_id INTEGER NOT NULL REFERENCES verifywise.nist_ai_rmf_categories_struct(id) ON DELETE CASCADE,
          function VARCHAR(20) NOT NULL,
          subcategory_id DECIMAL(4,1) NOT NULL,
          description TEXT,
          order_no INTEGER,
          is_demo BOOLEAN DEFAULT false,
          UNIQUE(function, subcategory_id)
        );
      `, { transaction });

      // NOTE: NIST implementation tables (nist_ai_rmf_subcategories, nist_ai_rmf_subcategories__risks)
      // are created in 234302-tenant-tables.js, not here.

      // ========================================
      // CUSTOM FRAMEWORK TABLES
      // ========================================
      console.log('Creating custom framework tables...');

      // ---- Struct tables (shared, no organization_id) ----

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.custom_framework_definitions (
          id SERIAL PRIMARY KEY,
          plugin_key VARCHAR(100) UNIQUE NOT NULL,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          version VARCHAR(50) DEFAULT '1.0.0',
          is_organizational BOOLEAN DEFAULT FALSE,
          hierarchy_type VARCHAR(50) NOT NULL DEFAULT 'two_level',
          level_1_name VARCHAR(100) NOT NULL DEFAULT 'Category',
          level_2_name VARCHAR(100) NOT NULL DEFAULT 'Control',
          level_3_name VARCHAR(100),
          file_source VARCHAR(100),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `, { transaction });

      await queryInterface.sequelize.query(`CREATE INDEX idx_cfd_plugin_key ON verifywise.custom_framework_definitions(plugin_key);`, { transaction });

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.custom_framework_level1_struct (
          id SERIAL PRIMARY KEY,
          definition_id INTEGER NOT NULL REFERENCES verifywise.custom_framework_definitions(id) ON DELETE CASCADE,
          title VARCHAR(500) NOT NULL,
          description TEXT,
          order_no INTEGER NOT NULL DEFAULT 1,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW()
        );
      `, { transaction });

      await queryInterface.sequelize.query(`CREATE INDEX idx_cfl1s_definition ON verifywise.custom_framework_level1_struct(definition_id);`, { transaction });

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.custom_framework_level2_struct (
          id SERIAL PRIMARY KEY,
          level1_id INTEGER NOT NULL REFERENCES verifywise.custom_framework_level1_struct(id) ON DELETE CASCADE,
          title VARCHAR(500) NOT NULL,
          description TEXT,
          order_no INTEGER NOT NULL DEFAULT 1,
          summary TEXT,
          questions TEXT[],
          evidence_examples TEXT[],
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW()
        );
      `, { transaction });

      await queryInterface.sequelize.query(`CREATE INDEX idx_cfl2s_level1 ON verifywise.custom_framework_level2_struct(level1_id);`, { transaction });

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.custom_framework_level3_struct (
          id SERIAL PRIMARY KEY,
          level2_id INTEGER NOT NULL REFERENCES verifywise.custom_framework_level2_struct(id) ON DELETE CASCADE,
          title VARCHAR(500) NOT NULL,
          description TEXT,
          order_no INTEGER NOT NULL DEFAULT 1,
          summary TEXT,
          questions TEXT[],
          evidence_examples TEXT[],
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW()
        );
      `, { transaction });

      await queryInterface.sequelize.query(`CREATE INDEX idx_cfl3s_level2 ON verifywise.custom_framework_level3_struct(level2_id);`, { transaction });

      // ---- Per-org tables ----

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.custom_frameworks (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          definition_id INTEGER REFERENCES verifywise.custom_framework_definitions(id),
          plugin_key VARCHAR(100),
          name VARCHAR(255) NOT NULL,
          description TEXT,
          version VARCHAR(50) DEFAULT '1.0.0',
          is_organizational BOOLEAN DEFAULT FALSE,
          hierarchy_type VARCHAR(50) NOT NULL DEFAULT 'two_level',
          level_1_name VARCHAR(100) NOT NULL DEFAULT 'Category',
          level_2_name VARCHAR(100) NOT NULL DEFAULT 'Control',
          level_3_name VARCHAR(100),
          file_source VARCHAR(100),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `, { transaction });

      await queryInterface.sequelize.query(`CREATE INDEX idx_cf_org_id ON verifywise.custom_frameworks(organization_id);`, { transaction });
      await queryInterface.sequelize.query(`CREATE INDEX idx_cf_plugin_key ON verifywise.custom_frameworks(plugin_key);`, { transaction });
      await queryInterface.sequelize.query(`CREATE INDEX idx_cf_definition_id ON verifywise.custom_frameworks(definition_id);`, { transaction });

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.custom_framework_projects (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          framework_id INTEGER NOT NULL REFERENCES verifywise.custom_frameworks(id) ON DELETE CASCADE,
          project_id INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(organization_id, framework_id, project_id)
        );
      `, { transaction });

      await queryInterface.sequelize.query(`CREATE INDEX idx_cf_projects_org ON verifywise.custom_framework_projects(organization_id);`, { transaction });

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.custom_framework_level2_impl (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          level2_id INTEGER NOT NULL REFERENCES verifywise.custom_framework_level2_struct(id) ON DELETE CASCADE,
          project_framework_id INTEGER NOT NULL REFERENCES verifywise.custom_framework_projects(id) ON DELETE CASCADE,
          status VARCHAR(50) DEFAULT 'Not started',
          owner INTEGER,
          reviewer INTEGER,
          approver INTEGER,
          due_date DATE,
          implementation_details TEXT,
          evidence_links JSONB DEFAULT '[]',
          feedback_links JSONB DEFAULT '[]',
          auditor_feedback TEXT,
          is_demo BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `, { transaction });

      await queryInterface.sequelize.query(`CREATE INDEX idx_cf_level2_impl_org ON verifywise.custom_framework_level2_impl(organization_id);`, { transaction });
      await queryInterface.sequelize.query(`CREATE INDEX idx_cf_level2_impl_l2 ON verifywise.custom_framework_level2_impl(level2_id);`, { transaction });
      await queryInterface.sequelize.query(`CREATE INDEX idx_cf_level2_impl_pf ON verifywise.custom_framework_level2_impl(project_framework_id);`, { transaction });

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.custom_framework_level3_impl (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          level3_id INTEGER NOT NULL REFERENCES verifywise.custom_framework_level3_struct(id) ON DELETE CASCADE,
          level2_impl_id INTEGER NOT NULL REFERENCES verifywise.custom_framework_level2_impl(id) ON DELETE CASCADE,
          status VARCHAR(50) DEFAULT 'Not started',
          owner INTEGER,
          reviewer INTEGER,
          approver INTEGER,
          due_date DATE,
          implementation_details TEXT,
          evidence_links JSONB DEFAULT '[]',
          feedback_links JSONB DEFAULT '[]',
          auditor_feedback TEXT,
          is_demo BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `, { transaction });

      await queryInterface.sequelize.query(`CREATE INDEX idx_cf_level3_impl_org ON verifywise.custom_framework_level3_impl(organization_id);`, { transaction });
      await queryInterface.sequelize.query(`CREATE INDEX idx_cf_level3_impl_l3 ON verifywise.custom_framework_level3_impl(level3_id);`, { transaction });
      await queryInterface.sequelize.query(`CREATE INDEX idx_cf_level3_impl_l2impl ON verifywise.custom_framework_level3_impl(level2_impl_id);`, { transaction });

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.custom_framework_level2_risks (
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          level2_impl_id INTEGER NOT NULL REFERENCES verifywise.custom_framework_level2_impl(id) ON DELETE CASCADE,
          risk_id INTEGER NOT NULL,
          PRIMARY KEY (level2_impl_id, risk_id)
        );
      `, { transaction });

      await queryInterface.sequelize.query(`CREATE INDEX idx_cf_l2_risks_org ON verifywise.custom_framework_level2_risks(organization_id);`, { transaction });

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.custom_framework_level3_risks (
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          level3_impl_id INTEGER NOT NULL REFERENCES verifywise.custom_framework_level3_impl(id) ON DELETE CASCADE,
          risk_id INTEGER NOT NULL,
          PRIMARY KEY (level3_impl_id, risk_id)
        );
      `, { transaction });

      await queryInterface.sequelize.query(`CREATE INDEX idx_cf_l3_risks_org ON verifywise.custom_framework_level3_risks(organization_id);`, { transaction });

      // ========================================
      // AUTOMATION DEFINITIONS
      // ========================================
      console.log('Creating automation definition tables...');

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.automation_triggers (
          id SERIAL PRIMARY KEY,
          key TEXT UNIQUE NOT NULL,
          label TEXT NOT NULL,
          event_name TEXT NOT NULL,
          description TEXT
        );
      `, { transaction });

      await queryInterface.sequelize.query(`
        INSERT INTO verifywise.automation_triggers (key, label, event_name, description) VALUES
          ('vendor_added', 'Vendor Added', 'vendor.added', 'Triggered when a new vendor is added.'),
          ('model_added', 'Model Added', 'model.added', 'Triggered when a new model is added.'),
          ('vendor_review_date_approaching', 'Vendor Review Date Approaching', 'vendor.review_date_approaching', 'Triggered when a vendor review date is approaching.'),
          ('project_added', 'Project Added', 'project.added', 'Triggered when a new project is added.'),
          ('task_added', 'Task Added', 'task.added', 'Triggered when a new task is added.'),
          ('risk_added', 'Risk Added', 'risk.added', 'Triggered when a new risk is added.'),
          ('training_added', 'Training Added', 'training.added', 'Triggered when a new training is added.'),
          ('policy_added', 'Policy Added', 'policy.added', 'Triggered when a new policy is added.'),
          ('incident_added', 'Incident Added', 'incident.added', 'Triggered when a new incident is added.'),
          ('vendor_updated', 'Vendor Updated', 'vendor.updated', 'Triggered when a vendor is updated.'),
          ('model_updated', 'Model Updated', 'model.updated', 'Triggered when a model is updated.'),
          ('project_updated', 'Project Updated', 'project.updated', 'Triggered when a project is updated.'),
          ('task_updated', 'Task Updated', 'task.updated', 'Triggered when a task is updated.'),
          ('risk_updated', 'Risk Updated', 'risk.updated', 'Triggered when a risk is updated.'),
          ('training_updated', 'Training Updated', 'training.updated', 'Triggered when a training is updated.'),
          ('policy_updated', 'Policy Updated', 'policy.updated', 'Triggered when a policy is updated.'),
          ('incident_updated', 'Incident Updated', 'incident.updated', 'Triggered when an incident is updated.'),
          ('vendor_deleted', 'Vendor Deleted', 'vendor.deleted', 'Triggered when a vendor is deleted.'),
          ('model_deleted', 'Model Deleted', 'model.deleted', 'Triggered when a model is deleted.'),
          ('project_deleted', 'Project Deleted', 'project.deleted', 'Triggered when a project is deleted.'),
          ('task_deleted', 'Task Deleted', 'task.deleted', 'Triggered when a task is deleted.'),
          ('risk_deleted', 'Risk Deleted', 'risk.deleted', 'Triggered when a risk is deleted.'),
          ('training_deleted', 'Training Deleted', 'training.deleted', 'Triggered when a training is deleted.'),
          ('policy_deleted', 'Policy Deleted', 'policy.deleted', 'Triggered when a policy is deleted.'),
          ('incident_deleted', 'Incident Deleted', 'incident.deleted', 'Triggered when an incident is deleted.'),
          ('scheduled_report', 'Scheduled Report', 'report.scheduled', 'Triggered on a schedule to generate and email reports.');
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.automation_actions (
          id SERIAL PRIMARY KEY,
          key TEXT UNIQUE NOT NULL,
          label TEXT NOT NULL,
          description TEXT,
          default_params JSONB DEFAULT '{}'
        );
      `, { transaction });

      await queryInterface.sequelize.query(`
        INSERT INTO verifywise.automation_actions (key, label, description, default_params) VALUES
          ('send_email', 'Send Email', 'Sends an email to specified recipients.', '{"to": [], "subject": "Notification", "body": "This is an automated notification.", "replacements": {}}'::jsonb);
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.automation_triggers_actions (
          trigger_id INTEGER REFERENCES verifywise.automation_triggers(id) ON DELETE CASCADE,
          action_id INTEGER REFERENCES verifywise.automation_actions(id) ON DELETE CASCADE,
          PRIMARY KEY (trigger_id, action_id)
        );
      `, { transaction });

      // Populate trigger-action associations
      await queryInterface.sequelize.query(`
        INSERT INTO verifywise.automation_triggers_actions (trigger_id, action_id)
          SELECT t.id, a.id
          FROM verifywise.automation_triggers t, verifywise.automation_actions a
          WHERE a.key = 'send_email';
      `, { transaction });

      // ========================================
      // MIGRATION STATUS TABLE
      // ========================================
      console.log('Creating migration_status table...');

      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.migration_status (
          id SERIAL PRIMARY KEY,
          migration_key VARCHAR(100) UNIQUE NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          started_at TIMESTAMP,
          completed_at TIMESTAMP,
          organizations_migrated INTEGER DEFAULT 0,
          organizations_total INTEGER DEFAULT 0,
          current_organization_id INTEGER,
          current_table VARCHAR(100),
          error_message TEXT,
          validation_report JSONB,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `, { transaction });

      await queryInterface.sequelize.query(`CREATE INDEX idx_migration_status_key ON verifywise.migration_status(migration_key);`, { transaction });

      // ========================================
      // HELPER FUNCTION FOR TIMESTAMPS
      // ========================================
      await queryInterface.sequelize.query(`
        CREATE OR REPLACE FUNCTION verifywise.update_evaluation_llm_api_keys_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `, { transaction });

      await transaction.commit();
      console.log('Public schema tables ready!');
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('Rolling back public schema tables...');

    // NOTE: roles table is NOT included - it's managed by 20260226234300-base-enums-and-roles.js
    // Tables in reverse dependency order
    const tables = [
      'migration_status',
      'automation_triggers_actions',
      'automation_actions',
      'automation_triggers',
      // Custom framework tables (reverse dependency order)
      'custom_framework_level3_risks',
      'custom_framework_level2_risks',
      'custom_framework_level3_impl',
      'custom_framework_level2_impl',
      'custom_framework_projects',
      'custom_frameworks',
      // Struct tables (shared)
      'custom_framework_level3_struct',
      'custom_framework_level2_struct',
      'custom_framework_level1_struct',
      'custom_framework_definitions',
      // File tables (reverse order)
      'file_entity_links',
      'files',
      // NIST struct tables
      'nist_ai_rmf_subcategories_struct',
      'nist_ai_rmf_categories_struct',
      // ISO 27001 struct tables
      'annexcontrols_struct_iso27001',
      'annexcategories_struct_iso27001',
      'subclauses_struct_iso27001',
      'clauses_struct_iso27001',
      // ISO 42001 struct tables
      'annexcategories_struct_iso',
      'subclauses_struct_iso',
      'clauses_struct_iso',
      // EU AI Act struct tables
      'subcontrols_struct_eu',
      'controls_struct_eu',
      'controlcategories_struct_eu',
      'questions_struct_eu',
      'subtopics_struct_eu',
      'topics_struct_eu',
      // Core tables
      'frameworks',
      'subscription_history',
      'subscriptions',
      'tiers',
      'users',
      'organizations',
    ];

    for (const table of tables) {
      await queryInterface.sequelize.query(`DROP TABLE IF EXISTS verifywise.${table} CASCADE;`);
    }

    await queryInterface.sequelize.query(`
      DROP FUNCTION IF EXISTS verifywise.update_evaluation_llm_api_keys_updated_at();
      DROP FUNCTION IF EXISTS verifywise.update_updated_at_column() CASCADE;
    `);

    console.log('Rollback completed!');
  }
};
