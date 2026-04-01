'use strict';

/**
 * Tenant Tables Migration
 *
 * Strategy:
 * - Drops and recreates all tenant tables for correct schema
 * - files & file_entity_links are NOT dropped here (owned by public-schema-tables migration)
 *
 * Part 3 of the migration set.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
    console.log('🚀 Setting up tenant tables...');

    // Helper: Create index if not exists
    const createIndex = async (indexName, tableName, columns) => {
      await queryInterface.sequelize.query(`
        CREATE INDEX IF NOT EXISTS ${indexName} ON verifywise.${tableName}(${columns});
      `, { transaction });
    };

    // ========================================
    // SEQUENCES
    // ========================================
    await queryInterface.sequelize.query(`CREATE SEQUENCE IF NOT EXISTS verifywise.project_uc_id_seq;`, { transaction });

    // ========================================
    // PROJECTS
    // ========================================
    console.log('📋 Creating projects table...');
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.projects (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        uc_id VARCHAR(255),
        project_title VARCHAR(255) NOT NULL,
        owner INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        start_date TIMESTAMP WITH TIME ZONE,
        ai_risk_classification verifywise.enum_projects_ai_risk_classification,
        type_of_high_risk_role verifywise.enum_projects_type_of_high_risk_role,
        goal TEXT,
        target_industry VARCHAR(255),
        description TEXT,
        geography INTEGER,
        last_updated TIMESTAMP WITH TIME ZONE,
        last_updated_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        is_demo BOOLEAN NOT NULL DEFAULT false,
        is_organizational BOOLEAN NOT NULL DEFAULT false,
        status verifywise.projects_status_enum NOT NULL DEFAULT 'Not started',
        approval_workflow_id INTEGER,
        pending_frameworks JSONB DEFAULT NULL,
        enable_ai_data_insertion BOOLEAN DEFAULT FALSE,
        _source VARCHAR(100),
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
        UNIQUE(organization_id, uc_id)
      );
    `, { transaction });
    await createIndex('idx_projects_org', 'projects', 'organization_id');

    // ========================================
    // VENDORS
    // ========================================
    console.log('📋 Ensuring vendors table...');

    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.vendors (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        order_no INTEGER,
        vendor_name VARCHAR(255) NOT NULL,
        vendor_provides TEXT NOT NULL,
        assignee INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        website VARCHAR(255) NOT NULL,
        vendor_contact_person VARCHAR(255) NOT NULL,
        review_result VARCHAR(255),
        review_status verifywise.enum_vendors_review_status,
        reviewer INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        review_date TIMESTAMP WITH TIME ZONE,
        data_sensitivity verifywise.enum_vendors_data_sensitivity,
        business_criticality verifywise.enum_vendors_business_criticality,
        past_issues verifywise.enum_vendors_past_issues,
        regulatory_exposure verifywise.enum_vendors_regulatory_exposure,
        risk_score INTEGER,
        is_demo BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );
    `, { transaction });
    await createIndex('idx_vendors_org', 'vendors', 'organization_id');

    // ========================================
    // TRAINING REGISTRAR
    // ========================================
    console.log('📋 Ensuring training table...');

    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.trainingregistar (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        training_name VARCHAR(255) NOT NULL,
        duration VARCHAR(255),
        provider VARCHAR(255),
        department VARCHAR(255),
        status verifywise.enum_trainingregistar_status,
        people INTEGER,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        description VARCHAR(255),
        is_demo BOOLEAN NOT NULL DEFAULT false
      );
    `, { transaction });
    await createIndex('idx_trainingregistar_org', 'trainingregistar', 'organization_id');

    // ========================================
    // JUNCTION TABLES
    // ========================================
    console.log('📋 Ensuring junction tables...');

    // projects_members
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.projects_members (
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES verifywise.users(id) ON DELETE CASCADE,
        project_id INTEGER NOT NULL REFERENCES verifywise.projects(id) ON DELETE CASCADE,
        is_demo BOOLEAN NOT NULL DEFAULT false,
        PRIMARY KEY (user_id, project_id)
      );
    `, { transaction });

    // event_logs
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.event_logs (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        event_type verifywise.enum_event_logs_event_type NOT NULL,
        description TEXT,
        user_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `, { transaction });

    // vendors_projects
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.vendors_projects (
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        vendor_id INTEGER NOT NULL REFERENCES verifywise.vendors(id) ON DELETE CASCADE,
        project_id INTEGER NOT NULL REFERENCES verifywise.projects(id) ON DELETE CASCADE,
        is_demo BOOLEAN NOT NULL DEFAULT false,
        PRIMARY KEY (vendor_id, project_id)
      );
    `, { transaction });

    // ========================================
    // RISKS
    // ========================================
    console.log('📋 Ensuring risks table...');

    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.risks (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        risk_name VARCHAR(255) NOT NULL,
        risk_owner INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        ai_lifecycle_phase verifywise.enum_projectrisks_ai_lifecycle_phase,
        risk_description TEXT,
        risk_category verifywise.enum_projectrisks_risk_category[],
        impact VARCHAR(255),
        assessment_mapping TEXT,
        controls_mapping TEXT,
        likelihood verifywise.enum_projectrisks_likelihood,
        severity verifywise.enum_projectrisks_severity,
        risk_level_autocalculated verifywise.enum_projectrisks_risk_level_autocalculated,
        review_notes TEXT,
        mitigation_status verifywise.enum_projectrisks_mitigation_status,
        current_risk_level verifywise.enum_projectrisks_current_risk_level,
        deadline TIMESTAMP WITH TIME ZONE,
        mitigation_plan TEXT,
        implementation_strategy TEXT,
        mitigation_evidence_document VARCHAR(255),
        likelihood_mitigation verifywise.enum_projectrisks_likelihood_mitigation,
        risk_severity verifywise.enum_projectrisks_risk_severity,
        final_risk_level VARCHAR(255),
        risk_approval INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        approval_status VARCHAR(255),
        date_of_assessment TIMESTAMP WITH TIME ZONE,
        is_demo BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
        is_deleted BOOLEAN NOT NULL DEFAULT false,
        deleted_at TIMESTAMP WITHOUT TIME ZONE
      );
    `, { transaction });
    await createIndex('idx_risks_org', 'risks', 'organization_id');

    // projects_risks junction
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.projects_risks (
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        risk_id INTEGER NOT NULL REFERENCES verifywise.risks(id) ON DELETE CASCADE,
        project_id INTEGER NOT NULL REFERENCES verifywise.projects(id) ON DELETE CASCADE,
        PRIMARY KEY (risk_id, project_id)
      );
    `, { transaction });

    // frameworks_risks junction
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.frameworks_risks (
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        risk_id INTEGER NOT NULL REFERENCES verifywise.risks(id) ON DELETE CASCADE,
        framework_id INTEGER NOT NULL REFERENCES verifywise.frameworks(id) ON DELETE CASCADE,
        PRIMARY KEY (risk_id, framework_id)
      );
    `, { transaction });

    // NOTE: files and file_entity_links are created in 234301-public-schema-tables.js

    // virtual_folders
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.virtual_folders (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        parent_id INTEGER REFERENCES verifywise.virtual_folders(id) ON DELETE CASCADE,
        color VARCHAR(7),
        icon VARCHAR(50),
        is_system BOOLEAN DEFAULT FALSE,
        created_by INTEGER REFERENCES verifywise.users(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE (organization_id, parent_id, name)
      );
    `, { transaction });

    // file_folder_mappings
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.file_folder_mappings (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        file_id INTEGER NOT NULL REFERENCES verifywise.files(id) ON DELETE CASCADE,
        folder_id INTEGER NOT NULL REFERENCES verifywise.virtual_folders(id) ON DELETE CASCADE,
        assigned_by INTEGER REFERENCES verifywise.users(id) ON DELETE CASCADE,
        assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE (file_id, folder_id)
      );
    `, { transaction });

    // ========================================
    // FRAMEWORKS DATA
    // ========================================
    console.log('📋 Ensuring framework data tables...');

    // projects_frameworks
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.projects_frameworks (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        project_id INTEGER NOT NULL REFERENCES verifywise.projects(id) ON DELETE CASCADE,
        framework_id INTEGER NOT NULL REFERENCES verifywise.frameworks(id) ON DELETE CASCADE,
        is_demo BOOLEAN DEFAULT false,
        UNIQUE(project_id, framework_id)
      );
    `, { transaction });

    // assessments
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.assessments (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        project_id INTEGER REFERENCES verifywise.projects(id) ON DELETE SET NULL,
        is_demo BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
        projects_frameworks_id INTEGER REFERENCES verifywise.projects_frameworks(id) ON DELETE CASCADE
      );
    `, { transaction });

    // projectscopes
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.projectscopes (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        assessment_id INTEGER NOT NULL,
        describe_ai_environment TEXT NOT NULL,
        is_new_ai_technology BOOLEAN NOT NULL,
        uses_personal_data BOOLEAN NOT NULL,
        project_scope_documents VARCHAR(255) NOT NULL,
        technology_type VARCHAR(255) NOT NULL,
        has_ongoing_monitoring BOOLEAN NOT NULL,
        unintended_outcomes TEXT NOT NULL,
        technology_documentation VARCHAR(255) NOT NULL,
        is_demo BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
      );
    `, { transaction });

    // vendorrisks
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.vendorrisks (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        vendor_id INTEGER REFERENCES verifywise.vendors(id) ON DELETE CASCADE,
        order_no INTEGER,
        risk_description TEXT,
        impact_description TEXT,
        likelihood verifywise.enum_vendorrisks_likelihood,
        risk_severity verifywise.enum_vendorrisks_risk_severity,
        action_plan TEXT,
        action_owner INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        risk_level VARCHAR(255),
        is_demo BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
        is_deleted BOOLEAN NOT NULL DEFAULT false,
        deleted_at TIMESTAMP WITHOUT TIME ZONE
      );
    `, { transaction });
    await createIndex('idx_vendorrisks_org', 'vendorrisks', 'organization_id');

    // ========================================
    // EU AI ACT CONTROLS
    // ========================================
    console.log('📋 Ensuring EU AI Act tenant tables...');

    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.controls_eu (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        status verifywise.enum_controls_status,
        approver INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        risk_review verifywise.enum_controls_risk_review,
        owner INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        reviewer INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        due_date TIMESTAMP WITH TIME ZONE,
        implementation_details TEXT,
        is_demo BOOLEAN NOT NULL DEFAULT false,
        control_meta_id INTEGER REFERENCES verifywise.controls_struct_eu(id) ON DELETE CASCADE,
        projects_frameworks_id INTEGER REFERENCES verifywise.projects_frameworks(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
      );
    `, { transaction });

    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.subcontrols_eu (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        status verifywise.enum_subcontrols_status,
        approver INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        risk_review verifywise.enum_subcontrols_risk_review,
        owner INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        reviewer INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        due_date TIMESTAMP WITH TIME ZONE,
        implementation_details TEXT,
        control_id INTEGER REFERENCES verifywise.controls_eu(id) ON DELETE CASCADE,
        subcontrol_meta_id INTEGER REFERENCES verifywise.subcontrols_struct_eu(id) ON DELETE CASCADE,
        is_demo BOOLEAN NOT NULL DEFAULT false,
        evidence_description TEXT,
        feedback_description TEXT,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
      );
    `, { transaction });

    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.answers_eu (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        assessment_id INTEGER REFERENCES verifywise.assessments(id) ON DELETE CASCADE,
        question_id INTEGER REFERENCES verifywise.questions_struct_eu(id) ON DELETE CASCADE,
        answer TEXT,
        dropdown_options TEXT[],
        status verifywise.enum_status_questions DEFAULT 'Not started',
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
        is_demo BOOLEAN NOT NULL DEFAULT false
      );
    `, { transaction });

    // subcontrols_eu__risks junction
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.subcontrols_eu__risks (
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        subcontrol_id INTEGER REFERENCES verifywise.subcontrols_eu(id) ON DELETE CASCADE,
        projects_risks_id INTEGER REFERENCES verifywise.risks(id) ON DELETE CASCADE,
        PRIMARY KEY (subcontrol_id, projects_risks_id)
      );
    `, { transaction });

    // ========================================
    // ISO 42001
    // ========================================
    console.log('📋 Ensuring ISO 42001 tenant tables...');

    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.subclauses_iso (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        implementation_description TEXT,
        status verifywise.enum_subclauses_iso_status DEFAULT 'Not started',
        owner INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        reviewer INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        approver INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        due_date DATE,
        auditor_feedback TEXT,
        subclause_meta_id INTEGER REFERENCES verifywise.subclauses_struct_iso(id) ON DELETE CASCADE,
        projects_frameworks_id INTEGER REFERENCES verifywise.projects_frameworks(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        is_demo BOOLEAN DEFAULT false
      );
    `, { transaction });

    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.annexcategories_iso (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        is_applicable BOOLEAN DEFAULT false,
        justification_for_exclusion TEXT,
        implementation_description TEXT,
        status verifywise.enum_annexcategories_iso_status DEFAULT 'Not started',
        owner INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        reviewer INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        approver INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        due_date DATE,
        auditor_feedback TEXT,
        projects_frameworks_id INTEGER REFERENCES verifywise.projects_frameworks(id) ON DELETE CASCADE,
        annexcategory_meta_id INTEGER REFERENCES verifywise.annexcategories_struct_iso(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        is_demo BOOLEAN DEFAULT false
      );
    `, { transaction });

    // annexcategories_iso__risks junction table
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.annexcategories_iso__risks (
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        annexcategory_id INTEGER,
        projects_risks_id INTEGER NOT NULL,
        PRIMARY KEY (projects_risks_id, annexcategory_id)
      );
    `, { transaction });

    // ========================================
    // ISO 27001
    // ========================================
    console.log('📋 Ensuring ISO 27001 tenant tables...');

    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.subclauses_iso27001 (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        implementation_description TEXT,
        status verifywise.enum_subclauses_iso_status DEFAULT 'Not started',
        owner INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        reviewer INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        approver INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        due_date DATE,
        auditor_feedback TEXT,
        subclause_meta_id INTEGER REFERENCES verifywise.subclauses_struct_iso27001(id) ON DELETE CASCADE,
        projects_frameworks_id INTEGER REFERENCES verifywise.projects_frameworks(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_demo BOOLEAN DEFAULT FALSE
      );
    `, { transaction });

    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.annexcontrols_iso27001 (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        implementation_description TEXT,
        status verifywise.enum_annexcategories_iso_status DEFAULT 'Not started',
        owner INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        reviewer INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        approver INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        due_date DATE,
        auditor_feedback TEXT,
        projects_frameworks_id INTEGER REFERENCES verifywise.projects_frameworks(id) ON DELETE CASCADE,
        annexcontrol_meta_id INTEGER REFERENCES verifywise.annexcontrols_struct_iso27001(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_demo BOOLEAN DEFAULT FALSE
      );
    `, { transaction });

    // ========================================
    // NIST AI RMF
    // ========================================
    console.log('📋 Ensuring NIST AI RMF tenant tables...');

    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.nist_ai_rmf_subcategories (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        subcategory_meta_id INTEGER REFERENCES verifywise.nist_ai_rmf_subcategories_struct(id) ON DELETE CASCADE,
        projects_frameworks_id INTEGER NOT NULL,
        implementation_description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP,
        is_demo BOOLEAN DEFAULT FALSE,
        status verifywise.enum_nist_ai_rmf_subcategories_status DEFAULT 'Not started',
        auditor_feedback TEXT,
        owner INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        reviewer INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        approver INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        due_date DATE
      );
    `, { transaction });
    await createIndex('idx_nist_subcategories_org', 'nist_ai_rmf_subcategories', 'organization_id');
    await createIndex('idx_nist_subcategories_pf', 'nist_ai_rmf_subcategories', 'projects_frameworks_id');

    // ========================================
    // REMAINING TABLES (continue pattern)
    // ========================================
    console.log('📋 Ensuring remaining tenant tables...');

    // policy_manager
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.policy_manager (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        content_html TEXT DEFAULT '',
        status VARCHAR(50) DEFAULT 'Draft',
        tags TEXT[] DEFAULT '{}',
        next_review_date TIMESTAMP,
        author_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        last_updated_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        last_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        review_status VARCHAR(50),
        review_comment TEXT,
        reviewed_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMP,
        is_demo BOOLEAN NOT NULL DEFAULT false
      );
    `, { transaction });

    // model_inventories
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.model_inventories (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        provider_model VARCHAR(255),
        version VARCHAR(255),
        approver INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        capabilities TEXT,
        security_assessment BOOLEAN DEFAULT false,
        status verifywise.enum_model_inventories_status DEFAULT 'Pending',
        status_date TIMESTAMP WITH TIME ZONE,
        reference_link VARCHAR(255),
        biases VARCHAR(255),
        limitations VARCHAR(255),
        hosting_provider VARCHAR(255),
        security_assessment_data JSONB DEFAULT '[]'::JSONB,
        is_demo BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
        provider VARCHAR(255) NOT NULL,
        model VARCHAR(255) NOT NULL
      );
    `, { transaction });
    await createIndex('idx_model_inventories_org', 'model_inventories', 'organization_id');

    // model_risks
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.model_risks (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        risk_name VARCHAR(255),
        risk_category verifywise.enum_model_risks_risk_category,
        risk_level verifywise.enum_model_risks_risk_level,
        status verifywise.enum_model_risks_status DEFAULT 'Open',
        owner INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        target_date TIMESTAMP,
        description TEXT,
        mitigation_plan TEXT,
        impact TEXT,
        likelihood VARCHAR(255),
        key_metrics TEXT,
        current_values TEXT,
        threshold VARCHAR(255),
        model_id INTEGER REFERENCES verifywise.model_inventories(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_deleted BOOLEAN DEFAULT false,
        deleted_at TIMESTAMP,
        is_demo BOOLEAN DEFAULT false
      );
    `, { transaction });

    // datasets
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.datasets (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        name VARCHAR(255),
        description TEXT,
        version VARCHAR(50),
        owner VARCHAR(255),
        type verifywise.enum_dataset_type,
        function TEXT,
        source VARCHAR(255),
        license VARCHAR(255),
        format VARCHAR(100),
        classification verifywise.enum_data_classification,
        contains_pii BOOLEAN DEFAULT false,
        pii_types TEXT,
        status verifywise.enum_dataset_status DEFAULT 'Draft',
        status_date TIMESTAMP,
        known_biases TEXT,
        bias_mitigation TEXT,
        collection_method TEXT,
        preprocessing_steps TEXT,
        documentation_data JSONB DEFAULT '[]',
        is_demo BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `, { transaction });

    // tasks
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.tasks (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        creator_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        due_date TIMESTAMP WITH TIME ZONE,
        priority verifywise.enum_tasks_priority DEFAULT 'Medium',
        status verifywise.enum_tasks_status DEFAULT 'Open',
        categories JSONB DEFAULT '[]',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
        is_demo BOOLEAN DEFAULT false
      );
    `, { transaction });
    await createIndex('idx_tasks_org', 'tasks', 'organization_id');

    // task_assignees
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.task_assignees (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        task_id INTEGER NOT NULL REFERENCES verifywise.tasks(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES verifywise.users(id) ON DELETE CASCADE,
        assigned_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
        UNIQUE (task_id, user_id)
      );
    `, { transaction });

    // ai_incident_managements
    await queryInterface.sequelize.query(`CREATE SEQUENCE IF NOT EXISTS verifywise.incident_id_seq;`, { transaction });
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.ai_incident_managements (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        incident_id VARCHAR(255) DEFAULT 'INC-' || nextval('verifywise.incident_id_seq'),
        ai_project VARCHAR(255),
        type VARCHAR(255),
        severity VARCHAR(20),
        occurred_date TIMESTAMP,
        date_detected TIMESTAMP,
        reporter VARCHAR(255),
        status VARCHAR(20) DEFAULT 'Open',
        categories_of_harm JSON,
        affected_persons_groups TEXT,
        description TEXT,
        relationship_causality TEXT,
        immediate_mitigations TEXT,
        planned_corrective_actions TEXT,
        model_system_version VARCHAR(255),
        interim_report BOOLEAN DEFAULT FALSE,
        approval_status VARCHAR(20) DEFAULT 'Pending',
        approved_by VARCHAR(255),
        approval_date TIMESTAMP,
        approval_notes TEXT,
        archived BOOLEAN DEFAULT FALSE,
        is_demo BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(organization_id, incident_id)
      );
    `, { transaction });

    // automations
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.automations (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        trigger_id INTEGER REFERENCES verifywise.automation_triggers(id) ON DELETE RESTRICT,
        params JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT TRUE,
        created_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `, { transaction });

    // automation_actions_data
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.automation_actions_data (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        automation_id INTEGER REFERENCES verifywise.automations(id) ON DELETE CASCADE,
        action_type_id INTEGER REFERENCES verifywise.automation_actions(id) ON DELETE RESTRICT,
        params JSONB DEFAULT '{}',
        "order" INTEGER DEFAULT 1
      );
    `, { transaction });

    // automation_execution_logs
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.automation_execution_logs (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        automation_id INTEGER REFERENCES verifywise.automations(id) ON DELETE CASCADE,
        triggered_at TIMESTAMP DEFAULT NOW(),
        trigger_data JSONB DEFAULT '{}',
        action_results JSONB DEFAULT '[]',
        status TEXT CHECK (status IN ('success', 'partial_success', 'failure')) DEFAULT 'success',
        execution_time_ms INTEGER,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `, { transaction });

    // notifications
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.notifications (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES verifywise.users(id) ON DELETE CASCADE,
        type verifywise.enum_notification_type,
        title VARCHAR(255),
        message TEXT,
        entity_type verifywise.enum_notification_entity_type,
        entity_id INTEGER,
        entity_name VARCHAR(255),
        action_url VARCHAR(500),
        is_read BOOLEAN DEFAULT FALSE,
        read_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        metadata JSONB
      );
    `, { transaction });

    // plugin_installations
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.plugin_installations (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        plugin_key VARCHAR(100) NOT NULL,
        status VARCHAR(20) DEFAULT 'installed',
        installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        error_message TEXT,
        configuration JSONB,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(organization_id, plugin_key)
      );
    `, { transaction });

    // llm_keys
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.llm_keys (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        name verifywise.enum_llm_keys_provider NOT NULL,
        url TEXT,
        model TEXT NOT NULL,
        custom_headers JSONB DEFAULT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `, { transaction });

    // invitations
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.invitations (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        surname VARCHAR(255),
        role_id INTEGER REFERENCES verifywise.roles(id),
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        invited_by INTEGER REFERENCES verifywise.users(id),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `, { transaction });

    // notes
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.notes (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        author_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        attached_to VARCHAR(50) NOT NULL,
        attached_to_id VARCHAR(255) NOT NULL,
        is_edited BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `, { transaction });

    // share_links
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.share_links (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        share_token VARCHAR(64) UNIQUE NOT NULL,
        resource_type VARCHAR(50) NOT NULL,
        resource_id INTEGER NOT NULL,
        created_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        settings JSONB DEFAULT '{"shareAllFields": false, "allowDataExport": true}'::jsonb,
        is_enabled BOOLEAN DEFAULT true,
        expires_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `, { transaction });

    // approval_workflows
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.approval_workflows (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        workflow_title VARCHAR(255) NOT NULL,
        entity_type VARCHAR(50) CHECK (entity_type IN ('use_case', 'project', 'file')),
        description TEXT,
        created_by INTEGER REFERENCES verifywise.users(id) ON DELETE CASCADE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `, { transaction });

    // approval_workflow_steps
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.approval_workflow_steps (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        workflow_id INTEGER REFERENCES verifywise.approval_workflows(id) ON DELETE CASCADE,
        step_number INTEGER NOT NULL,
        step_name VARCHAR(255) NOT NULL,
        description TEXT,
        requires_all_approvers BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(workflow_id, step_number)
      );
    `, { transaction });

    // approval_requests
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.approval_requests (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        request_name VARCHAR(255),
        workflow_id INTEGER REFERENCES verifywise.approval_workflows(id) ON DELETE CASCADE,
        entity_id INTEGER,
        entity_type VARCHAR(50),
        entity_data JSONB,
        status VARCHAR(50) DEFAULT 'Pending',
        requested_by INTEGER REFERENCES verifywise.users(id) ON DELETE CASCADE,
        current_step INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `, { transaction });

    // ========================================
    // ADDITIONAL TENANT TABLES (Junction & Change History)
    // ========================================
    console.log('📋 Ensuring additional junction & history tables...');

    // approval_request_steps
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.approval_request_steps (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        request_id INTEGER NOT NULL REFERENCES verifywise.approval_requests(id) ON DELETE CASCADE,
        step_number INTEGER NOT NULL,
        step_name VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Completed', 'Rejected')),
        date_assigned TIMESTAMP,
        date_completed TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(request_id, step_number)
      );
    `, { transaction });

    // approval_request_step_approvals
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.approval_request_step_approvals (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        request_step_id INTEGER NOT NULL REFERENCES verifywise.approval_request_steps(id) ON DELETE CASCADE,
        approver_id INTEGER NOT NULL REFERENCES verifywise.users(id) ON DELETE CASCADE,
        approval_result VARCHAR(50) NOT NULL DEFAULT 'Pending' CHECK (approval_result IN ('Pending', 'Approved', 'Rejected')),
        comments TEXT,
        approved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(request_step_id, approver_id)
      );
    `, { transaction });

    // approval_step_approvers
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.approval_step_approvers (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        workflow_step_id INTEGER NOT NULL REFERENCES verifywise.approval_workflow_steps(id) ON DELETE CASCADE,
        approver_id INTEGER NOT NULL REFERENCES verifywise.users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(workflow_step_id, approver_id)
      );
    `, { transaction });

    // task_entity_links
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.task_entity_links (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        task_id INTEGER REFERENCES verifywise.tasks(id) ON DELETE CASCADE,
        entity_type VARCHAR(50) NOT NULL,
        entity_id INTEGER NOT NULL,
        entity_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(task_id, entity_type, entity_id)
      );
    `, { transaction });

    // policy_linked_objects
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.policy_linked_objects (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        policy_id INTEGER REFERENCES verifywise.policy_manager(id) ON DELETE CASCADE,
        object_type VARCHAR(50) NOT NULL,
        object_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `, { transaction });

    // policy_manager__assigned_reviewer_ids
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.policy_manager__assigned_reviewer_ids (
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        policy_manager_id INTEGER REFERENCES verifywise.policy_manager(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES verifywise.users(id) ON DELETE CASCADE,
        PRIMARY KEY (policy_manager_id, user_id)
      );
    `, { transaction });

    // dataset_projects
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.dataset_projects (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        dataset_id INTEGER REFERENCES verifywise.datasets(id) ON DELETE CASCADE,
        project_id INTEGER REFERENCES verifywise.projects(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(dataset_id, project_id)
      );
    `, { transaction });

    // dataset_model_inventories
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.dataset_model_inventories (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        dataset_id INTEGER REFERENCES verifywise.datasets(id) ON DELETE CASCADE,
        model_inventory_id INTEGER REFERENCES verifywise.model_inventories(id) ON DELETE CASCADE,
        relationship_type VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(dataset_id, model_inventory_id)
      );
    `, { transaction });

    // model_inventories_projects_frameworks
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.model_inventories_projects_frameworks (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        model_inventory_id INTEGER REFERENCES verifywise.model_inventories(id) ON DELETE CASCADE,
        project_id INTEGER REFERENCES verifywise.projects(id) ON DELETE CASCADE,
        framework_id INTEGER REFERENCES verifywise.frameworks(id) ON DELETE CASCADE,
        UNIQUE(model_inventory_id, project_id, framework_id)
      );
    `, { transaction });

    // Change History Tables
    console.log('📋 Ensuring change history tables...');

    // vendor_change_history
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.vendor_change_history (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        vendor_id INTEGER,
        field_name VARCHAR(255),
        old_value TEXT,
        new_value TEXT,
        action VARCHAR(50),
        changed_by_user_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        changed_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `, { transaction });

    // vendor_risk_change_history
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.vendor_risk_change_history (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        vendor_risk_id INTEGER,
        field_name VARCHAR(255),
        old_value TEXT,
        new_value TEXT,
        action VARCHAR(50),
        changed_by_user_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        changed_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `, { transaction });

    // project_risk_change_history
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.project_risk_change_history (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        project_risk_id INTEGER,
        field_name VARCHAR(255),
        old_value TEXT,
        new_value TEXT,
        action VARCHAR(50),
        changed_by_user_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        changed_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `, { transaction });

    // policy_change_history
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.policy_change_history (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        policy_id INTEGER,
        field_name VARCHAR(255),
        old_value TEXT,
        new_value TEXT,
        action VARCHAR(50),
        changed_by_user_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        changed_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `, { transaction });

    // incident_change_history
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.incident_change_history (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        incident_id INTEGER,
        field_name VARCHAR(255),
        old_value TEXT,
        new_value TEXT,
        action VARCHAR(50),
        changed_by_user_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        changed_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `, { transaction });

    // use_case_change_history
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.use_case_change_history (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        use_case_id INTEGER,
        field_name VARCHAR(255),
        old_value TEXT,
        new_value TEXT,
        action VARCHAR(50),
        changed_by_user_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        changed_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `, { transaction });

    // model_inventory_change_history
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.model_inventory_change_history (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        model_inventory_id INTEGER,
        field_name VARCHAR(255),
        old_value TEXT,
        new_value TEXT,
        action VARCHAR(50),
        changed_by_user_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        changed_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `, { transaction });

    // model_risk_change_history
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.model_risk_change_history (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        model_risk_id INTEGER,
        field_name VARCHAR(255),
        old_value TEXT,
        new_value TEXT,
        action VARCHAR(50),
        changed_by_user_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        changed_at TIMESTAMP DEFAULT NOW()
      );
    `, { transaction });

    // file_change_history
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.file_change_history (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        file_id INTEGER,
        field_name VARCHAR(255),
        old_value TEXT,
        new_value TEXT,
        action VARCHAR(50),
        changed_by_user_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        changed_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `, { transaction });

    // dataset_change_histories
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.dataset_change_histories (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        dataset_id INTEGER,
        field_name VARCHAR(255),
        old_value TEXT,
        new_value TEXT,
        action VARCHAR(50),
        changed_by_user_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        changed_at TIMESTAMP DEFAULT NOW()
      );
    `, { transaction });

    // task_change_history
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.task_change_history (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        task_id INTEGER,
        field_name VARCHAR(255),
        old_value TEXT,
        new_value TEXT,
        action VARCHAR(50),
        changed_by_user_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        changed_at TIMESTAMP DEFAULT NOW()
      );
    `, { transaction });

    // training_change_history
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.training_change_history (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        training_id INTEGER,
        field_name VARCHAR(255),
        old_value TEXT,
        new_value TEXT,
        action VARCHAR(50),
        changed_by_user_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        changed_at TIMESTAMP DEFAULT NOW()
      );
    `, { transaction });

    // risk_history
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.risk_history (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        parameter VARCHAR(255),
        snapshot_data JSONB,
        recorded_at TIMESTAMP DEFAULT NOW(),
        triggered_by_user_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `, { transaction });

    // model_inventory_history
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.model_inventory_history (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        parameter VARCHAR(255),
        snapshot_data JSONB,
        recorded_at TIMESTAMP DEFAULT NOW(),
        triggered_by_user_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `, { transaction });

    // ========================================
    // RISK JUNCTION TABLES
    // ========================================
    console.log('📋 Ensuring risk junction tables...');

    // controls_eu__risks
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.controls_eu__risks (
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        control_id INTEGER,
        projects_risks_id INTEGER,
        PRIMARY KEY (control_id, projects_risks_id)
      );
    `, { transaction });

    // answers_eu__risks
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.answers_eu__risks (
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        answer_id INTEGER,
        projects_risks_id INTEGER,
        PRIMARY KEY (answer_id, projects_risks_id)
      );
    `, { transaction });

    // subclauses_iso__risks
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.subclauses_iso__risks (
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        subclause_id INTEGER,
        projects_risks_id INTEGER,
        PRIMARY KEY (subclause_id, projects_risks_id)
      );
    `, { transaction });

    // subclauses_iso27001__risks
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.subclauses_iso27001__risks (
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        subclause_id INTEGER,
        projects_risks_id INTEGER,
        PRIMARY KEY (subclause_id, projects_risks_id)
      );
    `, { transaction });

    // annexcontrols_iso27001__risks
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.annexcontrols_iso27001__risks (
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        annexcontrol_id INTEGER,
        projects_risks_id INTEGER,
        PRIMARY KEY (annexcontrol_id, projects_risks_id)
      );
    `, { transaction });

    // nist_ai_rmf_subcategories__risks
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.nist_ai_rmf_subcategories__risks (
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        nist_ai_rmf_subcategory_id INTEGER,
        projects_risks_id INTEGER,
        PRIMARY KEY (nist_ai_rmf_subcategory_id, projects_risks_id)
      );
    `, { transaction });

    // ========================================
    // AI DETECTION, SHADOW AI, AI TRUST CENTER
    // ========================================
    console.log('📋 Ensuring AI detection & Shadow AI tables...');

    // ai_detection_scans
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.ai_detection_scans (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          repository_url TEXT,
          repository_name VARCHAR(255),
          repository_owner VARCHAR(255),
          repository_id INTEGER,
          default_branch VARCHAR(255),
          status VARCHAR(50) DEFAULT 'pending',
          cache_path TEXT,
          started_at TIMESTAMP,
          completed_at TIMESTAMP,
          duration_ms INTEGER,
          error_message TEXT,
          total_files INTEGER DEFAULT 0,
          files_scanned INTEGER DEFAULT 0,
          findings_count INTEGER DEFAULT 0,
          triggered_by INTEGER,
          triggered_by_type VARCHAR(50),
          risk_score NUMERIC(5,2),
          risk_score_grade VARCHAR(10),
          risk_score_details JSONB,
          risk_score_calculated_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `, { transaction });

    // ai_detection_findings
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.ai_detection_findings (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          scan_id INTEGER,
          finding_type VARCHAR(100),
          name VARCHAR(255),
          category VARCHAR(100),
          provider VARCHAR(100),
          description TEXT,
          documentation_url TEXT,
          confidence VARCHAR(20),
          severity VARCHAR(20),
          threat_type VARCHAR(100),
          risk_level VARCHAR(20),
          license_id VARCHAR(100),
          license_name VARCHAR(255),
          license_risk VARCHAR(20),
          license_source VARCHAR(50),
          file_paths JSONB,
          file_count INTEGER DEFAULT 0,
          module_name VARCHAR(255),
          operator_name VARCHAR(255),
          governance_status VARCHAR(50),
          governance_updated_by INTEGER,
          governance_updated_at TIMESTAMP,
          cwe_id VARCHAR(50),
          cwe_name VARCHAR(255),
          owasp_ml_id VARCHAR(50),
          owasp_ml_name VARCHAR(255),
          created_at TIMESTAMP DEFAULT NOW()
        );
      `, { transaction });

    // ai_detection_repositories
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.ai_detection_repositories (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          repository_url VARCHAR(500) NOT NULL,
          repository_name VARCHAR(255) NOT NULL,
          repository_owner VARCHAR(255) NOT NULL,
          display_name VARCHAR(255),
          default_branch VARCHAR(255) DEFAULT 'main',
          github_token_id INTEGER,
          is_enabled BOOLEAN DEFAULT TRUE,
          schedule_enabled BOOLEAN DEFAULT FALSE,
          schedule_frequency VARCHAR(50),
          schedule_hour INTEGER,
          schedule_minute INTEGER,
          schedule_day_of_week INTEGER,
          schedule_day_of_month INTEGER,
          last_scan_id INTEGER,
          last_scan_status VARCHAR(50),
          last_scan_at TIMESTAMPTZ,
          next_scan_at TIMESTAMPTZ,
          risk_score INTEGER,
          created_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(organization_id, repository_owner, repository_name)
        );
      `, { transaction });

    // ai_detection_risk_scoring_config
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.ai_detection_risk_scoring_config (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          dimension_weights JSONB,
          llm_enabled BOOLEAN DEFAULT FALSE,
          llm_key_id INTEGER,
          updated_by INTEGER,
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `, { transaction });

    // shadow_ai_tools
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.shadow_ai_tools (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          vendor VARCHAR(255),
          domains TEXT[] NOT NULL,
          status VARCHAR(50) DEFAULT 'detected',
          risk_score INTEGER,
          total_events INTEGER DEFAULT 0,
          total_users INTEGER DEFAULT 0,
          first_detected_at TIMESTAMPTZ,
          last_seen_at TIMESTAMPTZ,
          governance_owner_id INTEGER,
          model_inventory_id INTEGER,
          risk_entry_id INTEGER,
          trains_on_data BOOLEAN,
          sso_support BOOLEAN,
          encryption_at_rest BOOLEAN,
          data_residency VARCHAR(100),
          gdpr_compliant BOOLEAN,
          soc2_certified BOOLEAN,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(organization_id, name)
        );
      `, { transaction });

    // shadow_ai_events
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.shadow_ai_events (
          id BIGSERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          detected_tool_id INTEGER REFERENCES verifywise.shadow_ai_tools(id) ON DELETE SET NULL,
          user_email VARCHAR(255) NOT NULL,
          department VARCHAR(255),
          job_title VARCHAR(255),
          manager_email VARCHAR(255),
          action VARCHAR(50),
          http_method VARCHAR(10),
          uri_path TEXT,
          destination VARCHAR(512),
          detected_model VARCHAR(255),
          event_timestamp TIMESTAMPTZ,
          ingested_at TIMESTAMPTZ DEFAULT NOW()
        );
      `, { transaction });

    // shadow_ai_daily_rollups
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.shadow_ai_daily_rollups (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          rollup_date DATE NOT NULL,
          tool_id INTEGER REFERENCES verifywise.shadow_ai_tools(id) ON DELETE CASCADE,
          user_email VARCHAR(255) NOT NULL,
          department VARCHAR(255),
          total_events INTEGER DEFAULT 0,
          post_events INTEGER DEFAULT 0,
          blocked_events INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(organization_id, rollup_date, user_email, tool_id)
        );
      `, { transaction });

    // shadow_ai_monthly_rollups
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.shadow_ai_monthly_rollups (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          rollup_month DATE NOT NULL,
          tool_id INTEGER REFERENCES verifywise.shadow_ai_tools(id) ON DELETE CASCADE,
          department VARCHAR(255),
          total_events INTEGER DEFAULT 0,
          post_events INTEGER DEFAULT 0,
          blocked_events INTEGER DEFAULT 0,
          unique_users INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(organization_id, rollup_month, tool_id, department)
        );
      `, { transaction });

    // shadow_ai_rules
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.shadow_ai_rules (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          trigger_type VARCHAR(100) NOT NULL,
          trigger_config JSONB NOT NULL,
          actions JSONB NOT NULL,
          cooldown_minutes INTEGER DEFAULT 1440,
          is_active BOOLEAN DEFAULT TRUE,
          created_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `, { transaction });

    // shadow_ai_alert_history
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.shadow_ai_alert_history (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          rule_id INTEGER REFERENCES verifywise.shadow_ai_rules(id) ON DELETE SET NULL,
          rule_name VARCHAR(255),
          trigger_type VARCHAR(100),
          trigger_data JSONB,
          actions_taken JSONB,
          fired_at TIMESTAMPTZ DEFAULT NOW()
        );
      `, { transaction });

    // shadow_ai_rule_notifications
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.shadow_ai_rule_notifications (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          rule_id INTEGER REFERENCES verifywise.shadow_ai_rules(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES verifywise.users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(organization_id, rule_id, user_id)
        );
      `, { transaction });

    // shadow_ai_settings
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.shadow_ai_settings (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          rate_limit_max_events_per_hour INTEGER DEFAULT 0,
          retention_events_days INTEGER DEFAULT 30,
          retention_daily_rollups_days INTEGER DEFAULT 365,
          retention_alert_history_days INTEGER DEFAULT 90,
          updated_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `, { transaction });

    // shadow_ai_syslog_config
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.shadow_ai_syslog_config (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          is_active BOOLEAN DEFAULT true,
          source_identifier VARCHAR(255),
          parser_type VARCHAR(50),
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `, { transaction });

    // shadow_ai_api_keys
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.shadow_ai_api_keys (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          label VARCHAR(255) NOT NULL,
          key_prefix VARCHAR(20) NOT NULL,
          key_hash VARCHAR(255) NOT NULL UNIQUE,
          is_active BOOLEAN DEFAULT TRUE,
          last_used_at TIMESTAMPTZ,
          created_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `, { transaction });

    // ========================================
    // AI TRUST CENTER TABLES
    // ========================================
    console.log('📋 Ensuring AI Trust Center tables...');

    // ai_trust_center
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.ai_trust_center (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          title VARCHAR(255),
          logo INTEGER,
          visible BOOLEAN DEFAULT TRUE,
          header_color VARCHAR(20),
          intro_visible BOOLEAN DEFAULT TRUE,
          company_description_visible BOOLEAN DEFAULT TRUE,
          compliance_badges_visible BOOLEAN DEFAULT TRUE,
          resources_visible BOOLEAN DEFAULT TRUE,
          subprocessor_visible BOOLEAN DEFAULT TRUE,
          terms_and_contact_visible BOOLEAN DEFAULT TRUE,
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `, { transaction });

    // ai_trust_center_intro
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.ai_trust_center_intro (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          purpose_visible BOOLEAN DEFAULT TRUE,
          purpose_text TEXT,
          our_mission_visible BOOLEAN DEFAULT TRUE,
          our_mission_text TEXT,
          our_statement_visible BOOLEAN DEFAULT TRUE,
          our_statement_text TEXT,
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `, { transaction });

    // ai_trust_center_company_description
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.ai_trust_center_company_description (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          background_visible BOOLEAN DEFAULT TRUE,
          background_text TEXT,
          core_benefits_visible BOOLEAN DEFAULT TRUE,
          core_benefits_text TEXT,
          compliance_doc_visible BOOLEAN DEFAULT TRUE,
          compliance_doc_text TEXT,
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `, { transaction });

    // ai_trust_center_compliance_badges
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.ai_trust_center_compliance_badges (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          gdpr BOOLEAN DEFAULT FALSE,
          hipaa BOOLEAN DEFAULT FALSE,
          ccpa BOOLEAN DEFAULT FALSE,
          soc2_type_i BOOLEAN DEFAULT FALSE,
          soc2_type_ii BOOLEAN DEFAULT FALSE,
          iso_27001 BOOLEAN DEFAULT FALSE,
          iso_42001 BOOLEAN DEFAULT FALSE,
          eu_ai_act BOOLEAN DEFAULT FALSE,
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `, { transaction });

    // ai_trust_center_resources
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.ai_trust_center_resources (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          name VARCHAR(255),
          description TEXT,
          file_id INTEGER,
          visible BOOLEAN DEFAULT TRUE,
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `, { transaction });

    // ai_trust_center_subprocessor
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.ai_trust_center_subprocessor (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          name VARCHAR(255),
          purpose TEXT,
          location VARCHAR(255),
          url TEXT,
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `, { transaction });

    // ai_trust_center_terms_and_contact
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.ai_trust_center_terms_and_contact (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          terms_visible BOOLEAN DEFAULT TRUE,
          terms_text TEXT,
          privacy_visible BOOLEAN DEFAULT TRUE,
          privacy_text TEXT,
          email_visible BOOLEAN DEFAULT TRUE,
          email_text TEXT,
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `, { transaction });

    // ========================================
    // REMAINING TENANT TABLES
    // ========================================
    console.log('📋 Ensuring remaining tenant tables...');

    // evidence_hub
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.evidence_hub (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          evidence_name VARCHAR(255),
          evidence_type VARCHAR(100),
          description TEXT,
          expiry_date TIMESTAMP,
          mapped_model_ids INTEGER[],
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `, { transaction });

    // api_tokens
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.api_tokens (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          name VARCHAR(255),
          token TEXT,
          expires_at TIMESTAMP,
          created_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `, { transaction });

    // github_tokens
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.github_tokens (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          token_name VARCHAR(255),
          encrypted_token TEXT,
          created_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          last_used_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `, { transaction });

    // user_preferences
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.user_preferences (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES verifywise.users(id) ON DELETE CASCADE,
          preferences JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(user_id)
        );
      `, { transaction });

    // entity_graph_annotations
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.entity_graph_annotations (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES verifywise.users(id) ON DELETE CASCADE,
          entity_type VARCHAR(50),
          entity_id VARCHAR(100) NOT NULL,
          content TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `, { transaction });

    // entity_graph_views
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.entity_graph_views (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES verifywise.users(id) ON DELETE CASCADE,
          name VARCHAR(255),
          config JSONB,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `, { transaction });

    // entity_graph_gap_rules
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.entity_graph_gap_rules (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES verifywise.users(id) ON DELETE CASCADE,
          rules JSONB,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `, { transaction });

    // feature_settings
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.feature_settings (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          lifecycle_enabled BOOLEAN NOT NULL DEFAULT true,
          audit_ledger_enabled BOOLEAN NOT NULL DEFAULT true,
          updated_at TIMESTAMP DEFAULT now(),
          updated_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL
        );
      `, { transaction });

    // audit_ledger
    // Create guard functions first
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION verifywise.audit_ledger_prevent_delete()
      RETURNS trigger LANGUAGE plpgsql AS $func$
      BEGIN
        RAISE EXCEPTION 'DELETE on audit_ledger is prohibited — append-only table';
      END;
      $func$;
    `, { transaction });

    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION verifywise.audit_ledger_guard_update()
      RETURNS trigger LANGUAGE plpgsql AS $func$
      BEGIN
        IF OLD.entry_hash = RPAD('pending', 64, '0')
           AND NEW.entry_hash ~ '^[a-f0-9]{64}$'
           AND OLD.entry_type   = NEW.entry_type
           AND OLD.user_id     IS NOT DISTINCT FROM NEW.user_id
           AND OLD.occurred_at  = NEW.occurred_at
           AND OLD.event_type  IS NOT DISTINCT FROM NEW.event_type
           AND OLD.entity_type IS NOT DISTINCT FROM NEW.entity_type
           AND OLD.entity_id   IS NOT DISTINCT FROM NEW.entity_id
           AND OLD.action      IS NOT DISTINCT FROM NEW.action
           AND OLD.field_name  IS NOT DISTINCT FROM NEW.field_name
           AND OLD.old_value   IS NOT DISTINCT FROM NEW.old_value
           AND OLD.new_value   IS NOT DISTINCT FROM NEW.new_value
           AND OLD.description IS NOT DISTINCT FROM NEW.description
           AND OLD.prev_hash    = NEW.prev_hash
        THEN
          RETURN NEW;
        END IF;
        RAISE EXCEPTION 'UPDATE on audit_ledger is prohibited — only sentinel hash finalization is allowed';
      END;
      $func$;
    `, { transaction });

    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.audit_ledger (
        id BIGSERIAL PRIMARY KEY,
        organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        entry_type VARCHAR(20) NOT NULL,
        user_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        event_type VARCHAR(20),
        entity_type VARCHAR(60),
        entity_id INTEGER,
        action VARCHAR(20),
        field_name TEXT,
        old_value TEXT,
        new_value TEXT,
        description TEXT,
        entry_hash CHAR(64) NOT NULL,
        prev_hash CHAR(64) NOT NULL
      );
    `, { transaction });

    // Indexes
    await createIndex('idx_audit_ledger_occurred_at', 'audit_ledger', 'occurred_at DESC');
    await createIndex('idx_audit_ledger_user_id', 'audit_ledger', 'user_id');
    await createIndex('idx_audit_ledger_entity', 'audit_ledger', 'entity_type, entity_id');

    // Guard triggers
    await queryInterface.sequelize.query(`
      CREATE TRIGGER trg_audit_ledger_no_delete
      BEFORE DELETE ON verifywise.audit_ledger
      FOR EACH ROW EXECUTE FUNCTION verifywise.audit_ledger_prevent_delete();
    `, { transaction });

    await queryInterface.sequelize.query(`
      CREATE TRIGGER trg_audit_ledger_guard_update
      BEFORE UPDATE ON verifywise.audit_ledger
      FOR EACH ROW EXECUTE FUNCTION verifywise.audit_ledger_guard_update();
    `, { transaction });

    // policy_folder_mappings
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.policy_folder_mappings (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          policy_id INTEGER NOT NULL,
          folder_id INTEGER NOT NULL REFERENCES verifywise.virtual_folders(id) ON DELETE CASCADE,
          assigned_by INTEGER NOT NULL REFERENCES verifywise.users(id) ON DELETE CASCADE,
          assigned_at TIMESTAMPTZ DEFAULT now(),
          UNIQUE(policy_id, folder_id)
        );
      `, { transaction });

    // slack_webhooks
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.slack_webhooks (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          access_token VARCHAR(255) NOT NULL,
          access_token_iv VARCHAR(255) NOT NULL,
          scope VARCHAR(255) NOT NULL,
          user_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          team_name VARCHAR(255) NOT NULL,
          team_id VARCHAR(255) NOT NULL,
          channel VARCHAR(255) NOT NULL,
          channel_id VARCHAR(255) NOT NULL,
          configuration_url VARCHAR(255) NOT NULL,
          url VARCHAR(255) NOT NULL,
          url_iv VARCHAR(255) NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          routing_type TEXT[],
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `, { transaction });

    // advisor_conversations
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.advisor_conversations (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES verifywise.users(id) ON DELETE CASCADE,
          domain VARCHAR(100),
          messages JSONB DEFAULT '[]',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `, { transaction });

    // file_access_logs
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.file_access_logs (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          file_id INTEGER,
          org_id INTEGER,
          accessed_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          action VARCHAR(50),
          access_date TIMESTAMP DEFAULT NOW()
        );
      `, { transaction });

    // NOTE: automation_actions_data already created above (line ~996)

    // =====================================================
    // CE MARKING TABLES
    // =====================================================
    console.log('  Creating CE Marking tables...');

    // ce_markings
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.ce_markings (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          project_id INTEGER NOT NULL REFERENCES verifywise.projects(id) ON DELETE CASCADE,
          is_high_risk_ai_system BOOLEAN DEFAULT false,
          role_in_product VARCHAR(50) DEFAULT 'standalone',
          annex_iii_category VARCHAR(50) DEFAULT 'annex_iii_5',
          controls_completed INTEGER DEFAULT 0,
          controls_total INTEGER DEFAULT 0,
          assessments_completed INTEGER DEFAULT 0,
          assessments_total INTEGER DEFAULT 0,
          declaration_status VARCHAR(50) DEFAULT 'draft',
          signed_on DATE,
          signatory VARCHAR(255),
          declaration_document TEXT,
          registration_status VARCHAR(50) DEFAULT 'not_registered',
          eu_registration_id VARCHAR(255),
          registration_date DATE,
          eu_record_url TEXT,
          policies_linked INTEGER DEFAULT 0,
          evidence_linked INTEGER DEFAULT 0,
          total_incidents INTEGER DEFAULT 0,
          ai_act_reportable_incidents INTEGER DEFAULT 0,
          last_incident TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          created_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          updated_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          CONSTRAINT unique_project_ce_marking UNIQUE(project_id)
        );
      `, { transaction });

    // ce_marking_conformity_steps
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.ce_marking_conformity_steps (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          ce_marking_id INTEGER NOT NULL,
          step_number INTEGER NOT NULL,
          step_name VARCHAR(255) NOT NULL,
          description TEXT,
          status VARCHAR(50) DEFAULT 'Not started',
          owner VARCHAR(255),
          due_date DATE,
          completed_date DATE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(ce_marking_id, step_number)
        );
      `, { transaction });

    // ce_marking_audit_trail
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.ce_marking_audit_trail (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          ce_marking_id INTEGER NOT NULL,
          field_name VARCHAR(255) NOT NULL,
          old_value TEXT,
          new_value TEXT,
          changed_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          changed_at TIMESTAMP DEFAULT NOW(),
          change_type VARCHAR(50)
        );
      `, { transaction });

    // ce_marking_policies
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.ce_marking_policies (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          ce_marking_id INTEGER NOT NULL,
          policy_id INTEGER NOT NULL,
          linked_at TIMESTAMP NOT NULL DEFAULT NOW(),
          linked_by INTEGER NOT NULL
        );
      `, { transaction });

    // ce_marking_evidences
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.ce_marking_evidences (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          ce_marking_id INTEGER NOT NULL,
          file_id INTEGER NOT NULL,
          linked_at TIMESTAMP NOT NULL DEFAULT NOW(),
          linked_by INTEGER NOT NULL
        );
      `, { transaction });

    // ce_marking_incidents
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.ce_marking_incidents (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          ce_marking_id INTEGER NOT NULL,
          incident_id INTEGER NOT NULL,
          linked_at TIMESTAMP NOT NULL DEFAULT NOW(),
          linked_by INTEGER NOT NULL
        );
      `, { transaction });

    // =====================================================
    // POST-MARKET MONITORING TABLES
    // =====================================================
    console.log('  Creating Post-Market Monitoring tables...');

    // post_market_monitoring_configs
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.post_market_monitoring_configs (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          project_id INTEGER REFERENCES verifywise.projects(id) ON DELETE CASCADE,
          is_active BOOLEAN DEFAULT FALSE,
          frequency_value INTEGER NOT NULL DEFAULT 30,
          frequency_unit TEXT CHECK (frequency_unit IN ('days', 'weeks', 'months')) DEFAULT 'days',
          start_date DATE,
          reminder_days INTEGER DEFAULT 3,
          escalation_days INTEGER DEFAULT 7,
          escalation_contact_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          notification_hour INTEGER DEFAULT 9,
          created_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(project_id)
        );
      `, { transaction });

    // post_market_monitoring_questions
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.post_market_monitoring_questions (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          config_id INTEGER REFERENCES verifywise.post_market_monitoring_configs(id) ON DELETE CASCADE,
          question_text TEXT NOT NULL,
          question_type TEXT CHECK (question_type IN ('yes_no', 'multi_select', 'multi_line_text')) NOT NULL,
          options JSONB DEFAULT '[]',
          suggestion_text TEXT,
          is_required BOOLEAN DEFAULT TRUE,
          is_system_default BOOLEAN DEFAULT FALSE,
          allows_flag_for_concern BOOLEAN DEFAULT TRUE,
          display_order INTEGER DEFAULT 0,
          eu_ai_act_article TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `, { transaction });

    // post_market_monitoring_cycles
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.post_market_monitoring_cycles (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          config_id INTEGER REFERENCES verifywise.post_market_monitoring_configs(id) ON DELETE CASCADE,
          cycle_number INTEGER NOT NULL,
          status TEXT CHECK (status IN ('pending', 'in_progress', 'completed', 'escalated')) DEFAULT 'pending',
          started_at TIMESTAMP DEFAULT NOW(),
          due_at TIMESTAMP NOT NULL,
          reminder_sent_at TIMESTAMP,
          escalation_sent_at TIMESTAMP,
          completed_at TIMESTAMP,
          completed_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          assigned_stakeholder_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `, { transaction });

    // post_market_monitoring_responses
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.post_market_monitoring_responses (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          cycle_id INTEGER REFERENCES verifywise.post_market_monitoring_cycles(id) ON DELETE CASCADE,
          question_id INTEGER REFERENCES verifywise.post_market_monitoring_questions(id) ON DELETE CASCADE,
          response_value JSONB,
          is_flagged BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(cycle_id, question_id)
        );
      `, { transaction });

    // post_market_monitoring_reports
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.post_market_monitoring_reports (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          cycle_id INTEGER REFERENCES verifywise.post_market_monitoring_cycles(id) ON DELETE CASCADE,
          file_id INTEGER REFERENCES verifywise.files(id) ON DELETE SET NULL,
          context_snapshot JSONB NOT NULL DEFAULT '{}',
          generated_at TIMESTAMP DEFAULT NOW(),
          generated_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          UNIQUE(cycle_id)
        );
      `, { transaction });

    // NOTE: llm_evals_* and bias_fairness_evaluations tables are owned by EvalServer
    // and created by its Alembic migration (c20260303115117_create_shared_schema_tables.py)

    // mlflow_integrations — NOT an eval table, keep here
    //   (placeholder to maintain code flow)

    // llm_evals_organizations — REMOVED (owned by EvalServer)
    // llm_evals_org_members — REMOVED (owned by EvalServer)
    // llm_evals_projects — REMOVED (owned by EvalServer)
    // llm_evals_datasets — REMOVED (owned by EvalServer)
    // llm_evals_scorers — REMOVED (owned by EvalServer)
    // llm_evals_models — REMOVED (owned by EvalServer)
    // llm_evals_experiments — REMOVED (owned by EvalServer)
    // llm_evals_logs — REMOVED (owned by EvalServer)
    // llm_evals_metrics — REMOVED (owned by EvalServer)
    // llm_evals_api_keys — REMOVED (owned by EvalServer)
    // evaluation_llm_api_keys — REMOVED (owned by EvalServer)
    // llm_evals_arena_comparisons — REMOVED (owned by EvalServer)
    // llm_evals_bias_audits — REMOVED (owned by EvalServer)
    // llm_evals_bias_audit_results — REMOVED (owned by EvalServer)
    // bias_fairness_evaluations — REMOVED (owned by EvalServer)

    // mlflow_integrations
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.mlflow_integrations (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          tracking_server_url VARCHAR(255) NOT NULL,
          auth_method VARCHAR(10) NOT NULL DEFAULT 'none' CHECK (auth_method IN ('none', 'basic', 'token')),
          username VARCHAR(255),
          username_iv VARCHAR(255),
          password VARCHAR(255),
          password_iv VARCHAR(255),
          api_token VARCHAR(255),
          api_token_iv VARCHAR(255),
          verify_ssl BOOLEAN NOT NULL DEFAULT TRUE,
          timeout INTEGER NOT NULL DEFAULT 30,
          last_tested_at TIMESTAMP,
          last_test_status VARCHAR(10) CHECK (last_test_status IN ('success', 'error')),
          last_test_message TEXT,
          updated_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `, { transaction });

    // mlflow_model_records
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.mlflow_model_records (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          model_name VARCHAR(255) NOT NULL,
          version VARCHAR(255) NOT NULL,
          lifecycle_stage VARCHAR(255),
          run_id VARCHAR(255),
          description TEXT,
          source VARCHAR(255),
          status VARCHAR(255),
          tags JSONB NOT NULL DEFAULT '{}'::jsonb,
          metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
          parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
          experiment_id VARCHAR(255),
          experiment_name VARCHAR(255),
          artifact_location TEXT,
          training_status VARCHAR(255),
          training_started_at TIMESTAMP,
          training_ended_at TIMESTAMP,
          source_version VARCHAR(255),
          model_created_at TIMESTAMP,
          model_updated_at TIMESTAMP,
          last_synced_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT mlflow_model_records_org_model_version_unique UNIQUE (organization_id, model_name, version)
        );
      `, { transaction });

    // intake_forms
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.intake_forms (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          description TEXT NOT NULL,
          slug VARCHAR(255) NOT NULL,
          entity_type VARCHAR(50) NOT NULL,
          schema JSONB NOT NULL DEFAULT '{"version":"1.0","fields":[]}',
          submit_button_text VARCHAR(100) DEFAULT 'Submit',
          status VARCHAR(20) NOT NULL DEFAULT 'draft',
          ttl_expires_at TIMESTAMPTZ,
          public_id VARCHAR(16) UNIQUE,
          recipients JSONB DEFAULT '[]',
          risk_tier_system VARCHAR(20) DEFAULT 'generic',
          risk_assessment_config JSONB,
          llm_key_id INTEGER,
          suggested_questions_enabled BOOLEAN DEFAULT false,
          design_settings JSONB,
          created_by INTEGER NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(organization_id, slug)
        );
      `, { transaction });

    // intake_submissions
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.intake_submissions (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          form_id INTEGER NOT NULL,
          submitter_email VARCHAR(255),
          submitter_name VARCHAR(255),
          data JSONB NOT NULL DEFAULT '{}',
          entity_type VARCHAR(50) NOT NULL,
          entity_id INTEGER,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          rejection_reason TEXT,
          reviewed_by INTEGER,
          reviewed_at TIMESTAMPTZ,
          original_submission_id INTEGER,
          resubmission_count INTEGER NOT NULL DEFAULT 0,
          ip_address VARCHAR(45),
          risk_assessment JSONB,
          risk_tier VARCHAR(20),
          risk_override JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `, { transaction });

    // =====================================================
    // INDEXES
    // =====================================================
    console.log('📋 Creating indexes...');

    // Shadow AI indexes
    await createIndex('idx_shadow_ai_events_timestamp', 'shadow_ai_events', 'organization_id, event_timestamp');
    await createIndex('idx_shadow_ai_events_user', 'shadow_ai_events', 'organization_id, user_email');
    await createIndex('idx_shadow_ai_events_tool', 'shadow_ai_events', 'organization_id, detected_tool_id');
    await createIndex('idx_shadow_ai_daily_rollups_date', 'shadow_ai_daily_rollups', 'organization_id, rollup_date');
    await createIndex('idx_shadow_ai_daily_rollups_tool', 'shadow_ai_daily_rollups', 'organization_id, tool_id');
    await createIndex('idx_shadow_ai_alert_cooldown', 'shadow_ai_alert_history', 'rule_id, fired_at');

    // AI incident management indexes
    await createIndex('idx_ai_incidents_severity', 'ai_incident_managements', 'organization_id, severity');
    await createIndex('idx_ai_incidents_status', 'ai_incident_managements', 'organization_id, status');
    await createIndex('idx_ai_incidents_approval', 'ai_incident_managements', 'organization_id, approval_status');
    await createIndex('idx_ai_incidents_created', 'ai_incident_managements', 'organization_id, created_at');

    // AI detection indexes
    await createIndex('idx_ai_detection_findings_type', 'ai_detection_findings', 'organization_id, finding_type');
    await createIndex('idx_ai_detection_scans_status', 'ai_detection_scans', 'organization_id, status');

    // Partial unique index: prevent concurrent active scans for same repo
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_scans_unique_active
      ON verifywise.ai_detection_scans (organization_id, repository_owner, repository_name)
      WHERE status IN ('pending', 'cloning', 'scanning');
    `, { transaction });

    // Slack webhooks index
    await createIndex('idx_slack_webhooks_team', 'slack_webhooks', 'team_id');

    // Invitations partial unique index: only one pending invite per email per org
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_pending_email
      ON verifywise.invitations(organization_id, email) WHERE status = 'pending';
    `, { transaction });

    // =====================================================
    // FK CONSTRAINTS
    // =====================================================

    // CE marking FK constraints
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        ALTER TABLE verifywise.ce_marking_conformity_steps ADD CONSTRAINT fk_ce_conformity_ce_marking FOREIGN KEY (ce_marking_id) REFERENCES verifywise.ce_markings(id) ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `, { transaction });
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        ALTER TABLE verifywise.ce_marking_audit_trail ADD CONSTRAINT fk_ce_audit_ce_marking FOREIGN KEY (ce_marking_id) REFERENCES verifywise.ce_markings(id) ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `, { transaction });
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        ALTER TABLE verifywise.ce_marking_policies ADD CONSTRAINT fk_ce_policies_ce_marking FOREIGN KEY (ce_marking_id) REFERENCES verifywise.ce_markings(id) ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `, { transaction });
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        ALTER TABLE verifywise.ce_marking_evidences ADD CONSTRAINT fk_ce_evidences_ce_marking FOREIGN KEY (ce_marking_id) REFERENCES verifywise.ce_markings(id) ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `, { transaction });
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        ALTER TABLE verifywise.ce_marking_incidents ADD CONSTRAINT fk_ce_incidents_ce_marking FOREIGN KEY (ce_marking_id) REFERENCES verifywise.ce_markings(id) ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `, { transaction });
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        ALTER TABLE verifywise.ce_marking_incidents ADD CONSTRAINT fk_ce_incidents_incident FOREIGN KEY (incident_id) REFERENCES verifywise.ai_incident_managements(id) ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `, { transaction });

    // AI detection repositories → github_tokens FK (deferred because github_tokens created later)
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        ALTER TABLE verifywise.ai_detection_repositories ADD CONSTRAINT fk_ai_detection_repos_github_token FOREIGN KEY (github_token_id) REFERENCES verifywise.github_tokens(id) ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `, { transaction });

    // Add FK constraints for approval_workflow_id (deferred due to table creation order)
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        ALTER TABLE verifywise.projects
        ADD CONSTRAINT fk_projects_approval_workflow
        FOREIGN KEY (approval_workflow_id) REFERENCES verifywise.approval_workflows(id) ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `, { transaction });

    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        ALTER TABLE verifywise.files
        ADD CONSTRAINT fk_files_approval_workflow
        FOREIGN KEY (approval_workflow_id) REFERENCES verifywise.approval_workflows(id) ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `, { transaction });

    console.log('✅ Tenant tables migration complete!');
    await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      console.error('Migration tenant-tables failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('🔄 Rolling back tenant tables...');
    // Rolling back is complex - in most cases you wouldn't want to drop these
    console.log('⚠️ Rollback not implemented - data preservation');
  }
};
