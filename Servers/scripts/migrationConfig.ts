/**
 * Migration Configuration
 *
 * Defines the order of table migration and FK mappings for the
 * tenant-to-shared-schema data migration.
 */

/**
 * Tables ordered by dependency level for migration.
 * Level 0 tables have no FK dependencies on other tenant tables.
 * Higher levels depend on lower levels.
 */
export const MIGRATION_TABLE_ORDER = {
  // Level 0: No FK dependencies on other tenant tables (only references to verifywise schema)
  level0: [
    // Core entities
    'projects',
    'vendors',
    'risks',
    'model_inventories',
    'datasets',
    'tasks',
    'policy_manager',
    'trainingregistar',
    'ai_incident_managements',
    'virtual_folders',
    'approval_workflows',
    'llm_keys',
    'invitations',
    'notes',
    'share_links',
    'plugin_installations',
    'automations',
    'event_logs',
    'slack_webhooks',
    'github_tokens',
    // Shadow AI
    'shadow_ai_api_keys',
    'shadow_ai_syslog_config',
    'shadow_ai_tools',
    'shadow_ai_events',
    'shadow_ai_rules',
    'shadow_ai_alert_history',
    'shadow_ai_settings',
    // AI Trust Center
    'ai_trust_center',
    'ai_trust_center_intro',
    'ai_trust_center_company_description',
    'ai_trust_center_terms_and_contact',
    'ai_trust_center_subprocessor',
    // AI Detection
    'ai_detection_scans',
    'ai_detection_repositories',
    'ai_detection_risk_scoring_config',
    // Agent Discovery
    'agent_primitives',
    // LLM Evals
    'llm_evals_organizations',
    'llm_evals_api_keys',
    // Entity Graph
    'entity_graph_annotations',
    'entity_graph_gap_rules',
    'entity_graph_views',
    // Other standalone tables
    'audit_ledger',
    'advisor_conversations',
    'api_tokens',
    'bias_fairness_evaluations',
    'evidence_hub',
    'feature_settings',
    'evaluation_llm_api_keys',
    'intake_forms',
    'mlflow_integrations',
    'risk_history',
    'user_preferences',
  ],

  // Level 1: Depends on Level 0
  level1: [
    // Core junction/dependent tables
    'projects_members',
    'projects_frameworks',
    'vendors_projects',
    'projects_risks',
    'frameworks_risks',
    'files',
    'vendorrisks',
    'model_risks',
    'task_assignees',
    'task_entity_links',
    // Approval
    'approval_workflow_steps',
    'approval_step_approvers',
    // Automation
    'automation_actions',
    // Policy
    'policy_linked_objects',
    'policy_manager__assigned_reviewer_ids',
    // CE Marking (depends on projects)
    'ce_markings',
    // PMM (depends on projects)
    'post_market_monitoring_configs',
    'post_market_monitoring_questions',
    // AI Detection
    'ai_detection_findings',
    // Agent
    'agent_audit_log',
    'agent_discovery_sync_log',
    // AI Trust Center
    'ai_trust_center_compliance_badges',
    'ai_trust_center_resources',
    // Dataset junctions
    'dataset_model_inventories',
    'dataset_projects',
    // Files
    'file_access_logs',
    // Intake
    'intake_submissions',
    // LLM Evals
    'llm_evals_org_members',
    'llm_evals_projects',
    'llm_evals_datasets',
    'llm_evals_models',
    'llm_evals_scorers',
    // MLflow
    'mlflow_model_records',
    // Model inventory
    'model_inventory_history',
    // Shadow AI
    'shadow_ai_daily_rollups',
    'shadow_ai_monthly_rollups',
    'shadow_ai_rule_notifications',
  ],

  // Level 2: Depends on Level 1
  level2: [
    // Framework tables
    'assessments',
    'controls_eu',
    'subclauses_iso',
    'annexcategories_iso',
    'subclauses_iso27001',
    'annexcontrols_iso27001',
    'nist_ai_rmf_subcategories',
    // File linking
    'file_entity_links',
    'file_folder_mappings',
    // Policy folders
    'policy_folder_mappings',
    // Approval
    'approval_requests',
    // Automation
    'automation_execution_logs',
    // Notifications
    'notifications',
    // PMM
    'post_market_monitoring_cycles',
    // CE Marking
    'ce_marking_audit_trail',
    'ce_marking_conformity_steps',
    'ce_marking_evidences',
    'ce_marking_incidents',
    'ce_marking_policies',
    // LLM Evals
    'llm_evals_experiments',
    'llm_evals_bias_audits',
    'llm_evals_arena_comparisons',
    // Model inventory junction
    'model_inventories_projects_frameworks',
  ],

  // Level 3: Depends on Level 2
  level3: [
    // Framework child tables
    'projectscopes',
    'subcontrols_eu',
    'answers_eu',
    // Approval
    'approval_request_steps',
    // PMM
    'post_market_monitoring_responses',
    'post_market_monitoring_reports',
    // Risk junction tables (depend on level 2 framework tables + projects_risks)
    'controls_eu__risks',
    'annexcategories_iso__risks',
    'subclauses_iso__risks',
    'subclauses_iso27001__risks',
    'annexcontrols_iso27001__risks',
    'nist_ai_rmf_subcategories__risks',
    // LLM Evals
    'llm_evals_logs',
    'llm_evals_metrics',
  ],

  // Level 4: Depends on Level 3
  level4: [
    'subcontrols_eu__risks',
    'answers_eu__risks',
    'approval_request_step_approvals',
    'llm_evals_bias_audit_results',
  ],

  // Change history tables (can be migrated last)
  changeHistory: [
    'vendor_change_history',
    'vendor_risk_change_history',
    'project_risk_change_history',
    'policy_change_history',
    'incident_change_history',
    'use_case_change_history',
    'model_inventory_change_history',
    'file_change_history',
    'dataset_change_histories',
    'model_risk_change_history',
    'task_change_history',
    'training_change_history',
  ],
};

/**
 * FK Mappings: Maps table columns to their source tables.
 * During migration, old IDs are replaced with new IDs using the ID mapping.
 *
 * Format: { tableName: { columnName: sourceTableName } }
 */
export const FK_MAPPINGS: Record<string, Record<string, string>> = {
  // Level 1 tables
  projects_members: {
    project_id: 'projects',
  },
  projects_frameworks: {
    project_id: 'projects',
  },
  vendors_projects: {
    vendor_id: 'vendors',
    project_id: 'projects',
  },
  projects_risks: {
    project_id: 'projects',
    risk_id: 'risks',
  },
  frameworks_risks: {
    risk_id: 'risks',
  },
  files: {
    project_id: 'projects',
  },
  vendorrisks: {
    vendor_id: 'vendors',
  },
  model_risks: {
    model_id: 'model_inventories',
  },
  task_assignees: {
    task_id: 'tasks',
  },
  task_entity_links: {
    task_id: 'tasks',
  },
  approval_workflow_steps: {
    workflow_id: 'approval_workflows',
  },
  approval_step_approvers: {
    workflow_step_id: 'approval_workflow_steps',
  },
  automation_actions: {
    automation_id: 'automations',
  },
  policy_linked_objects: {
    policy_id: 'policy_manager',
  },
  policy_manager__assigned_reviewer_ids: {
    policy_manager_id: 'policy_manager',
  },
  ce_markings: {
    project_id: 'projects',
  },
  post_market_monitoring_configs: {
    project_id: 'projects',
  },
  post_market_monitoring_questions: {
    config_id: 'post_market_monitoring_configs',
  },
  agent_audit_log: {
    agent_primitive_id: 'agent_primitives',
  },
  agent_discovery_sync_log: {
    agent_primitive_id: 'agent_primitives',
  },
  ai_trust_center_compliance_badges: {
    file_id: 'files',
  },
  ai_trust_center_resources: {
    file_id: 'files',
  },
  dataset_model_inventories: {
    dataset_id: 'datasets',
    model_inventory_id: 'model_inventories',
  },
  dataset_projects: {
    dataset_id: 'datasets',
    project_id: 'projects',
  },
  file_access_logs: {
    file_id: 'files',
  },
  ai_detection_findings: {
    scan_id: 'ai_detection_scans',
  },
  intake_submissions: {
    form_id: 'intake_forms',
  },
  shadow_ai_events: {
    detected_tool_id: 'shadow_ai_tools',
  },
  shadow_ai_daily_rollups: {
    tool_id: 'shadow_ai_tools',
  },
  shadow_ai_monthly_rollups: {
    tool_id: 'shadow_ai_tools',
  },
  shadow_ai_alert_history: {
    rule_id: 'shadow_ai_rules',
  },
  shadow_ai_rule_notifications: {
    rule_id: 'shadow_ai_rules',
  },

  // Level 2 tables
  assessments: {
    projects_frameworks_id: 'projects_frameworks',
    project_id: 'projects',
  },
  controls_eu: {
    projects_frameworks_id: 'projects_frameworks',
  },
  subclauses_iso: {
    projects_frameworks_id: 'projects_frameworks',
  },
  annexcategories_iso: {
    projects_frameworks_id: 'projects_frameworks',
  },
  subclauses_iso27001: {
    projects_frameworks_id: 'projects_frameworks',
  },
  annexcontrols_iso27001: {
    projects_frameworks_id: 'projects_frameworks',
  },
  nist_ai_rmf_subcategories: {
    projects_frameworks_id: 'projects_frameworks',
  },
  file_entity_links: {
    file_id: 'files',
  },
  file_folder_mappings: {
    file_id: 'files',
    folder_id: 'virtual_folders',
  },
  policy_folder_mappings: {
    policy_id: 'policy_manager',
    folder_id: 'virtual_folders',
  },
  approval_requests: {
    workflow_id: 'approval_workflows',
  },
  automation_execution_logs: {
    automation_id: 'automations',
  },
  post_market_monitoring_cycles: {
    config_id: 'post_market_monitoring_configs',
  },
  ce_marking_audit_trail: {
    ce_marking_id: 'ce_markings',
  },
  ce_marking_conformity_steps: {
    ce_marking_id: 'ce_markings',
  },
  ce_marking_evidences: {
    ce_marking_id: 'ce_markings',
    file_id: 'files',
  },
  ce_marking_incidents: {
    ce_marking_id: 'ce_markings',
    incident_id: 'ai_incident_managements',
  },
  ce_marking_policies: {
    ce_marking_id: 'ce_markings',
    policy_id: 'policy_manager',
  },
  model_inventories_projects_frameworks: {
    model_inventory_id: 'model_inventories',
    project_id: 'projects',
  },

  // Level 3 tables
  projectscopes: {
    assessment_id: 'assessments',
  },
  subcontrols_eu: {
    control_id: 'controls_eu',
  },
  answers_eu: {
    assessment_id: 'assessments',
  },
  approval_request_steps: {
    request_id: 'approval_requests',
    workflow_step_id: 'approval_workflow_steps',
  },
  post_market_monitoring_responses: {
    cycle_id: 'post_market_monitoring_cycles',
    question_id: 'post_market_monitoring_questions',
  },
  post_market_monitoring_reports: {
    cycle_id: 'post_market_monitoring_cycles',
    file_id: 'files',
  },
  // Risk junction tables (Level 3)
  controls_eu__risks: {
    control_id: 'controls_eu',
    projects_risks_id: 'risks',
  },
  annexcategories_iso__risks: {
    annexcategory_id: 'annexcategories_iso',
    projects_risks_id: 'risks',
  },
  subclauses_iso__risks: {
    subclause_id: 'subclauses_iso',
    projects_risks_id: 'risks',
  },
  subclauses_iso27001__risks: {
    subclause_id: 'subclauses_iso27001',
    projects_risks_id: 'risks',
  },
  annexcontrols_iso27001__risks: {
    annexcontrol_id: 'annexcontrols_iso27001',
    projects_risks_id: 'risks',
  },
  nist_ai_rmf_subcategories__risks: {
    nist_ai_rmf_subcategory_id: 'nist_ai_rmf_subcategories',
    projects_risks_id: 'risks',
  },

  // Level 4 tables
  subcontrols_eu__risks: {
    subcontrol_id: 'subcontrols_eu',
    risk_id: 'risks',
  },
  answers_eu__risks: {
    answer_id: 'answers_eu',
    projects_risks_id: 'risks',
  },
  approval_request_step_approvals: {
    request_step_id: 'approval_request_steps',
  },
  llm_evals_bias_audit_results: {
    audit_id: 'llm_evals_bias_audits',
  },

  // Change history tables (reference main tables)
  vendor_change_history: {
    vendor_id: 'vendors',
  },
  vendor_risk_change_history: {
    vendor_risk_id: 'vendorrisks',
  },
  project_risk_change_history: {
    project_risk_id: 'risks',
  },
  policy_change_history: {
    policy_id: 'policy_manager',
  },
  incident_change_history: {
    incident_id: 'ai_incident_managements',
  },
  use_case_change_history: {
    use_case_id: 'projects',
  },
  model_inventory_change_history: {
    model_id: 'model_inventories',
  },
  file_change_history: {
    file_id: 'files',
  },
  dataset_change_histories: {
    dataset_id: 'datasets',
  },
  model_risk_change_history: {
    model_risk_id: 'model_risks',
  },
  task_change_history: {
    task_id: 'tasks',
  },
  training_change_history: {
    training_id: 'trainingregistar',
  },
};

/**
 * Columns that should NOT be copied during migration.
 * These are typically auto-generated or will be set differently.
 */
export const EXCLUDED_COLUMNS: Record<string, string[]> = {
  '*': ['id'], // 'id' is excluded for all tables (will be auto-generated)
};

/**
 * Tables that reference struct tables (meta_id columns).
 * These IDs should NOT be remapped - they reference verifywise schema struct data.
 */
export const STRUCT_REFERENCES = [
  'controls_eu',      // control_meta_id -> controls_struct_eu
  'subcontrols_eu',   // subcontrol_meta_id -> subcontrols_struct_eu
  'answers_eu',       // question_meta_id -> questions_struct_eu
  'assessments',      // topic_meta_id, subtopic_meta_id -> topics_struct_eu, subtopics_struct_eu
  'subclauses_iso',   // clause_meta_id -> clauses_struct_iso
  'annexcategories_iso', // annex_meta_id -> annexcategories_struct_iso
  'subclauses_iso27001', // clause_meta_id -> clauses_struct_iso27001
  'annexcontrols_iso27001', // annex_meta_id, category_meta_id -> annexcategories_struct_iso27001
  // NOTE: nist_ai_rmf_subcategories is handled by dedicated migration with proper ID mapping
];

/**
 * Tables to SKIP in general migration - they have dedicated migrations
 * that handle special ID mapping (e.g., struct ID remapping).
 */
export const SKIP_TABLES = [
  // LLM Evals tables — owned by EvalServer (Alembic), schema mismatch with old tenant tables
  'llm_evals_organizations',
  'llm_evals_api_keys',
  'llm_evals_org_members',
  'llm_evals_projects',
  'llm_evals_datasets',
  'llm_evals_models',
  'llm_evals_scorers',
  'llm_evals_experiments',
  'llm_evals_bias_audits',
  'llm_evals_arena_comparisons',
  'llm_evals_logs',
  'llm_evals_metrics',
  'llm_evals_bias_audit_results',
  // NIST AI RMF tables — old schema has different structure (inline data vs struct/impl split)
  // Handled by migrateNistAiRmfData() which matches old rows to struct entries
  'nist_ai_rmf_subcategories',
  'nist_ai_rmf_subcategories__risks',
  // Custom framework tables use struct/impl split — handled by migrateCustomFrameworkPhase1/Phase2
  'custom_frameworks',
  'custom_framework_level1',
  'custom_framework_level2',
  'custom_framework_level3',
  'custom_framework_projects',
  'custom_framework_level2_impl',
  'custom_framework_level3_impl',
  'custom_framework_level2_risks',
  'custom_framework_level3_risks',
];

/**
 * Table name mapping: old tenant table name -> new verifywise table name.
 * Used when a table was renamed in the consolidated schema.
 */
export const TARGET_TABLE_MAP: Record<string, string> = {
  automation_actions: 'automation_actions_data',
};

/**
 * Migration key for tracking in migration_status table
 */
export const MIGRATION_KEY = 'tenant_to_shared_schema_v1';

/**
 * Batch size for bulk inserts
 */
export const BATCH_SIZE = 1000;

/**
 * Get all tables in migration order (flat array)
 */
export function getAllTablesInOrder(): string[] {
  return [
    ...MIGRATION_TABLE_ORDER.level0,
    ...MIGRATION_TABLE_ORDER.level1,
    ...MIGRATION_TABLE_ORDER.level2,
    ...MIGRATION_TABLE_ORDER.level3,
    ...MIGRATION_TABLE_ORDER.level4,
    ...MIGRATION_TABLE_ORDER.changeHistory,
  ];
}

/**
 * Interface for ID mapping during migration
 */
export interface IdMapping {
  [tableName: string]: {
    [oldId: number]: number;
  };
}

/**
 * Interface for validation report
 */
export interface ValidationReport {
  organizations: {
    [orgId: number]: {
      tenant_hash: string;
      tables: {
        [tableName: string]: {
          source_count: number;
          migrated_count: number;
          match: boolean;
        };
      };
    };
  };
  summary: {
    total_source_rows: number;
    total_migrated_rows: number;
    all_matched: boolean;
  };
}

/**
 * Interface for migration result
 */
export interface MigrationResult {
  success: boolean;
  status: 'completed' | 'just_completed' | 'failed' | 'no_tenants' | 'already_completed';
  organizationsMigrated: number;
  tablesProcessed: number;
  rowsMigrated: number;
  validationReport?: ValidationReport;
  error?: string;
  errors: string[];
}
