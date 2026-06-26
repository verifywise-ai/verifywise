#!/usr/bin/env ts-node
/**
 * Tenant isolation schema-drift audit.
 *
 * Compares the set of tables that carry `organization_id` in the live
 * database against:
 *   1. the tenant-isolation registry, and
 *   2. a justified allow-list of intentionally shared tables.
 *
 * Exit codes:
 *   0 - coverage matches
 *   1 - uncovered scoped table(s) or missing registry table(s)
 *   2 - audit runtime error
 *
 * Usage:
 *   cd Servers && npx ts-node scripts/auditTenantIsolationCoverage.ts
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import { getRegisteredTenantTables } from "../tests/integration/tenant-isolation/tenantIsolation.registry";

const RUNBOOK_URL = "docs/technical/security/tenant-isolation.md";

interface SharedTableEntry {
  name: string;
  justification: string;
}

/**
 * Intentionally shared tables that carry an `organization_id` column (or that
 * match a documented naming pattern) but are not tenant-scoped.
 *
 * Every entry must include a justification reviewed in PR.
 */
const sharedTables: SharedTableEntry[] = [
  {
    name: "organizations",
    justification: "Tenant root; not scoped to an organization.",
  },
  {
    name: "roles",
    justification: "Global role definitions shared across all tenants.",
  },
  {
    name: "frameworks",
    justification: "Global framework catalog; per-tenant linkage is projects_frameworks.",
  },
  {
    name: "subscription_history",
    justification: "Billing metadata shared across tenants.",
  },
  {
    name: "subscriptions",
    justification: "Billing metadata shared across tenants.",
  },
  {
    name: "tiers",
    justification: "Billing tier definitions shared across tenants.",
  },
  {
    name: "*_struct_*",
    justification:
      "Framework structure/reference tables are global by convention; the wildcard matches all struct tables.",
  },
];

/**
 * Tenant-scoped tables that exist in the database but are intentionally deferred
 * to a future isolation wave. They still carry organization_id and must be
 * covered by the matrix before they can be removed from this list.
 */
const deferredScopedTables: SharedTableEntry[] = [
  {
    name: "advisor_conversations",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "agent_audit_log",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "agent_discovery_sync_log",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "agent_message_history",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "agent_primitives",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "agent_semantic_memory",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "agent_working_memory",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "ai_action_approvals",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "ai_action_audit_log",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "ai_approval_rules",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "ai_apps",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "ai_content_metadata",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "ai_detection_findings",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "ai_detection_repositories",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "ai_detection_risk_scoring_config",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "ai_detection_scans",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "ai_detection_suppressions",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "ai_detection_vulnerability_config",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "ai_detection_vulnerability_details",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "ai_incident_managements",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "ai_trust_center",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "ai_trust_center_company_description",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "ai_trust_center_compliance_badges",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "ai_trust_center_intro",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "ai_trust_center_resources",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "ai_trust_center_subprocessor",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "ai_trust_center_terms_and_contact",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "ai_trust_index_settings",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "ai_trust_index_tracked_apps",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "annexcategories_iso",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "annexcategories_iso__risks",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "annexcontrols_iso27001",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "annexcontrols_iso27001__risks",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "answers_eu",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "answers_eu__risks",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "api_tokens",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "approval_request_step_approvals",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "approval_request_steps",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "approval_requests",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "approval_step_approvers",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "approval_workflow_steps",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "approval_workflows",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "automation_actions_data",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "automation_execution_logs",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "automations",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "ce_marking_audit_trail",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "ce_marking_conformity_steps",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "ce_marking_evidences",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "ce_marking_incidents",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "ce_marking_policies",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "ce_markings",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "control_readiness_scores",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "controls_eu__pre_rollup_snapshot",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "controls_eu__risks",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "custom_field_definitions",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "custom_field_values",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "custom_framework_level2_impl",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "custom_framework_level2_risks",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "custom_framework_level3_impl",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "custom_framework_level3_risks",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "custom_framework_projects",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "custom_frameworks",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "dataset_change_histories",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "dataset_model_inventories",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "dataset_projects",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "datasets",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "entity_graph_annotations",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "entity_graph_gap_rules",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "entity_graph_views",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "evidence_ai_analysis",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "feature_settings",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "file_access_logs",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "file_folder_mappings",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "framework_readiness_scores",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "frameworks_risks",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "frameworks_vendorrisks",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "fria_assessments",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "fria_change_history",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "fria_model_links",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "fria_rights",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "fria_risk_items",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "fria_snapshots",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "github_tokens",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "governance_control_mappings",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "governance_coverage_cache",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "governance_org_preferences",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "governance_scenario_activations",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "governance_scenarios",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "incident_change_history",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "intake_forms",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "intake_submissions",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "invitations",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "llm_keys",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "mlflow_integrations",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "mlflow_model_records",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "model_inventories",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "model_inventories_projects_frameworks",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "model_inventory_change_history",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "model_inventory_history",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "model_risk_change_history",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "model_risks",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "nist_ai_rmf_subcategories",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "nist_ai_rmf_subcategories__risks",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "notes",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "notifications",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "plugin_installations",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "policy_change_history",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "policy_folder_mappings",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "policy_linked_objects",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "policy_manager",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "policy_manager__assigned_reviewer_ids",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "post_market_monitoring_configs",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "post_market_monitoring_cycles",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "post_market_monitoring_questions",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "post_market_monitoring_reports",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "post_market_monitoring_responses",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "project_risk_change_history",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "projects_members",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "projectscopes",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "readiness_history",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "risk_history",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "risk_portfolio_snapshots",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "shadow_ai_alert_history",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "shadow_ai_api_keys",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "shadow_ai_daily_rollups",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "shadow_ai_events",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "shadow_ai_monthly_rollups",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "shadow_ai_rule_notifications",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "shadow_ai_rules",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "shadow_ai_settings",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "shadow_ai_syslog_config",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "shadow_ai_tools",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "share_links",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "slack_webhooks",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "sso_configurations",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "subclauses_iso",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "subclauses_iso27001",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "subclauses_iso27001__risks",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "subclauses_iso__risks",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "subcontrols_eu__pre_rollup_snapshot",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "subcontrols_eu__risks",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "task_change_history",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "task_entity_links",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "training_change_history",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "trainingregistar",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "use_case_change_history",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "user_preferences",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "vendor_change_history",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "vendor_risk_change_history",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "vendorrisks",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
  {
    name: "virtual_folders",
    justification:
      "Deferred to a future isolation wave; not covered by the first-pass matrix. See runbook section 2.4.",
  },
];

function isDeferredScopedTable(tableName: string): boolean {
  return deferredScopedTables.some((entry) => entry.name === tableName);
}

function isSharedTable(tableName: string): boolean {
  return sharedTables.some((entry) => {
    if (entry.name.includes("*")) {
      const regex = new RegExp("^" + entry.name.split("*").map(escapeRegex).join(".*") + "$");
      return regex.test(tableName);
    }
    return entry.name === tableName;
  });
}

function escapeRegex(value: string): string {
  return value.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

async function main(): Promise<void> {
  let dbTables: string[] = [];
  try {
    const rows = await sequelize.query<{ table_name: string }>(
      `
      SELECT DISTINCT table_name
      FROM information_schema.columns
      WHERE table_schema = 'verifywise'
        AND column_name = 'organization_id'
      ORDER BY table_name
      `,
      { type: QueryTypes.SELECT },
    );
    dbTables = rows.map((row) => row.table_name);
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          runbook: RUNBOOK_URL,
          error: "Failed to query information_schema.columns",
          details: error instanceof Error ? error.message : String(error),
        },
        null,
        2,
      ),
    );
    process.exit(2);
  }

  const registryTables = new Set(getRegisteredTenantTables());

  const uncoveredScopedTables = dbTables.filter(
    (table) => !registryTables.has(table) && !isSharedTable(table) && !isDeferredScopedTable(table),
  );
  const missingRegistryTables = Array.from(registryTables).filter(
    (table) => !dbTables.includes(table),
  );

  if (uncoveredScopedTables.length > 0 || missingRegistryTables.length > 0) {
    console.error(
      JSON.stringify(
        {
          runbook: RUNBOOK_URL,
          message: "Tenant isolation coverage mismatch",
          uncoveredScopedTables,
          uncoveredCount: uncoveredScopedTables.length,
          missingRegistryTables,
          missingCount: missingRegistryTables.length,
          deferredScopedTables: deferredScopedTables.map((entry) => entry.name),
          sharedTables: sharedTables.map((entry) => entry.name),
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        runbook: RUNBOOK_URL,
        status: "ok",
        scopedTablesInDatabase: dbTables.length,
        registeredTables: registryTables.size,
        deferredScopedTables: deferredScopedTables.map((entry) => entry.name),
        sharedTables: sharedTables.map((entry) => entry.name),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify(
        {
          runbook: RUNBOOK_URL,
          error: "Audit script failed",
          details: error instanceof Error ? error.message : String(error),
        },
        null,
        2,
      ),
    );
    process.exit(2);
  })
  .finally(async () => {
    await sequelize.close();
  });
