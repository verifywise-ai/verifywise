/**
 * Change History Configuration
 *
 * This file defines the configuration for each entity that supports change history tracking.
 * When adding a new entity, simply add its configuration here and create the corresponding
 * database table using the migration template.
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import logger from "../utils/logger/fileLogger";

/**
 * User query result type for formatters
 */
interface UserQueryResult {
  id: number;
  name: string | null;
  surname: string | null;
  email: string | null;
}

/**
 * Framework object type for formatters
 */
interface FrameworkObject {
  name?: string;
  framework_id?: number;
  id?: number;
}

/**
 * Entity type enum - add new entity types here
 */
export type EntityType =
  | "model_inventory"
  | "vendor"
  | "use_case"
  | "project"
  | "framework"
  | "evidence_hub"
  | "risk"
  | "vendor_risk"
  | "policy"
  | "incident"
  | "file"
  | "model_lifecycle"
  | "task"
  | "training"
  | "model_risk"
  | "dataset"
  | "ai_gateway_endpoint"
  | "ai_gateway_guardrail";

/**
 * Field formatter function type
 */
export type FieldFormatter = (value: unknown) => Promise<string>;

/**
 * Entity configuration interface
 */
export interface EntityConfig {
  tableName: string;
  foreignKeyField: string;
  fieldsToTrack: string[];
  fieldLabels: { [key: string]: string };
  fieldFormatters?: { [key: string]: FieldFormatter };
}

/**
 * Generic field formatters that can be reused across entities
 */
export const GENERIC_FORMATTERS: { [key: string]: FieldFormatter } = {
  // Boolean formatter
  boolean: async (value: unknown): Promise<string> => {
    if (value === null || value === undefined) return "-";
    return value ? "Yes" : "No";
  },

  // Date formatter
  date: async (value: unknown): Promise<string> => {
    if (value === null || value === undefined || value === "") return "-";
    if (value instanceof Date) {
      return value.toISOString().split("T")[0];
    }
    if (typeof value === "string") {
      return value.split("T")[0];
    }
    return String(value);
  },

  // Array formatter (preserves order - IMPORTANT for tracking reordering)
  array: async (value: unknown): Promise<string> => {
    if (!value) return "-";
    if (Array.isArray(value)) {
      if (value.length === 0) return "-";
      // DO NOT SORT - order may be meaningful!
      return value
        .map((item) => String(item).trim())
        .join(", ");
    }
    // Handle string representations of arrays
    if (typeof value === "string" && (value.startsWith("[") || value.includes(","))) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          // DO NOT SORT - order may be meaningful!
          return parsed
            .map((item) => String(item).trim())
            .join(", ");
        }
      } catch {
        const items = value.split(",").map((item) => item.trim()).filter(Boolean);
        if (items.length > 1) {
          // DO NOT SORT - order may be meaningful!
          return items.join(", ");
        }
      }
    }
    return String(value);
  },

  // User lookup formatter (resolves user ID to name)
  user: async (value: unknown): Promise<string> => {
    if (!value) return "-";
    if (typeof value === "number") {
      try {
        const users = await sequelize.query<UserQueryResult>(
          `SELECT id, name, surname, email FROM users WHERE id = :userId`,
          {
            replacements: { userId: value },
            type: QueryTypes.SELECT,
          }
        );

        if (users && users.length > 0) {
          const user = users[0];
          if (user.name && user.surname) {
            return `${user.name} ${user.surname}`;
          } else if (user.email) {
            return user.email;
          }
        }
        // User not found
        return `User #${value}`;
      } catch (error) {
        // Database error - log and return fallback
        logger.error(`Error fetching user for ID ${value}: ${error}`);
        return `User #${value}`;
      }
    }
    return String(value);
  },

  // Default text formatter
  text: async (value: unknown): Promise<string> => {
    if (value === null || value === undefined || value === "") {
      return "-";
    }
    return String(value);
  },

  // User array formatter (resolves array of user IDs to names)
  userArray: async (value: unknown): Promise<string> => {
    if (!value) return "-";

    let userIds: number[] = [];
    if (Array.isArray(value)) {
      userIds = value.filter((id): id is number => typeof id === "number");
    } else if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          userIds = parsed.filter((id): id is number => typeof id === "number");
        }
      } catch {
        return value;
      }
    }

    if (userIds.length === 0) return "-";

    try {
      const users = await sequelize.query<UserQueryResult>(
        `SELECT id, name, surname, email FROM users WHERE id IN (:userIds)`,
        {
          replacements: { userIds },
          type: QueryTypes.SELECT,
        }
      );

      if (users && users.length > 0) {
        // Map user IDs to names in the original order
        const userMap = new Map(
          users.map((u) => [u.id, u.name && u.surname ? `${u.name} ${u.surname}` : u.email || `User #${u.id}`])
        );
        return userIds
          .map((id) => userMap.get(id) || `User #${id}`)
          .join(", ");
      }
      return userIds.map((id) => `User #${id}`).join(", ");
    } catch (error) {
      logger.error(`Error fetching users for IDs ${JSON.stringify(userIds)}: ${error}`);
      return userIds.map((id) => `User #${id}`).join(", ");
    }
  },

  // Framework array formatter (formats project frameworks)
  frameworkArray: async (value: unknown): Promise<string> => {
    if (!value) return "-";

    let frameworks: FrameworkObject[] = [];
    if (Array.isArray(value)) {
      frameworks = value;
    } else if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          frameworks = parsed;
        }
      } catch {
        return value;
      }
    }

    if (frameworks.length === 0) return "-";

    // Extract framework names from the array of framework objects
    const frameworkNames = frameworks
      .map((f) => {
        if (typeof f === "object" && f !== null) {
          return f.name || `Framework #${f.framework_id || f.id || "unknown"}`;
        }
        return String(f);
      })
      .filter(Boolean);

    return frameworkNames.length > 0 ? frameworkNames.join(", ") : "-";
  },
};

/**
 * Entity configurations
 * Add new entity configurations here when adding change history to new entities
 */
export const ENTITY_CONFIGS: { [key in EntityType]: EntityConfig } = {
  model_inventory: {
    tableName: "model_inventory_change_history",
    foreignKeyField: "model_inventory_id",
    fieldsToTrack: [
      "provider",
      "model",
      "version",
      "approver",
      "capabilities",
      "security_assessment",
      "status",
      "status_date",
      "reference_link",
      "biases",
      "limitations",
      "hosting_provider",
    ],
    fieldLabels: {
      provider: "Provider",
      model: "Model",
      version: "Version",
      approver: "Approver",
      capabilities: "Capabilities",
      security_assessment: "Security assessment",
      status: "Status",
      status_date: "Status date",
      reference_link: "Reference link",
      biases: "Biases",
      limitations: "Limitations",
      hosting_provider: "Hosting provider",
    },
    fieldFormatters: {
      security_assessment: GENERIC_FORMATTERS.boolean,
      status_date: GENERIC_FORMATTERS.date,
      approver: GENERIC_FORMATTERS.user,
      capabilities: GENERIC_FORMATTERS.array,
    },
  },

  vendor: {
    tableName: "vendor_change_history",
    foreignKeyField: "vendor_id",
    fieldsToTrack: [
      "vendor_name",
      "vendor_provides",
      "website",
      "vendor_contact_person",
      "assignee",
      "reviewer",
      "review_status",
      "review_result",
      "review_date",
      "data_sensitivity",
      "business_criticality",
      "past_issues",
      "regulatory_exposure",
      "risk_score",
    ],
    fieldLabels: {
      vendor_name: "Vendor name",
      vendor_provides: "Vendor provides",
      website: "Website",
      vendor_contact_person: "Contact person",
      assignee: "Assignee",
      reviewer: "Reviewer",
      review_status: "Review status",
      review_result: "Review result",
      review_date: "Review date",
      data_sensitivity: "Data sensitivity",
      business_criticality: "Business criticality",
      past_issues: "Past issues",
      regulatory_exposure: "Regulatory exposure",
      risk_score: "Risk score",
    },
    fieldFormatters: {
      review_date: GENERIC_FORMATTERS.date,
      reviewer: GENERIC_FORMATTERS.user,
      assignee: GENERIC_FORMATTERS.user,
    },
  },

  use_case: {
    tableName: "use_case_change_history",
    foreignKeyField: "use_case_id",
    fieldsToTrack: [
      "project_title",
      "owner",
      "members",
      "start_date",
      "geography",
      "ai_risk_classification",
      "type_of_high_risk_role",
      "goal",
      "target_industry",
      "description",
      "status",
      "framework",
      "monitored_regulations_and_standards",
    ],
    fieldLabels: {
      project_title: "Name",
      owner: "Owner",
      members: "Team members",
      start_date: "Start date",
      geography: "Geography",
      ai_risk_classification: "AI risk classification",
      type_of_high_risk_role: "Type of high-risk role",
      goal: "Goal",
      target_industry: "Target industry",
      description: "Description",
      status: "Status",
      framework: "Frameworks",
      monitored_regulations_and_standards: "Monitored regulations and standards",
    },
    fieldFormatters: {
      owner: GENERIC_FORMATTERS.user,
      members: GENERIC_FORMATTERS.userArray,
      start_date: GENERIC_FORMATTERS.date,
      framework: GENERIC_FORMATTERS.frameworkArray,
      monitored_regulations_and_standards: GENERIC_FORMATTERS.array,
    },
  },

  project: {
    tableName: "project_change_history",
    foreignKeyField: "project_id",
    fieldsToTrack: [
      "name",
      "description",
    ],
    fieldLabels: {
      name: "Name",
      description: "Description",
    },
  },

  framework: {
    tableName: "framework_change_history",
    foreignKeyField: "framework_id",
    fieldsToTrack: [
      "name",
      "description",
    ],
    fieldLabels: {
      name: "Name",
      description: "Description",
    },
  },

  evidence_hub: {
    tableName: "evidence_hub_change_history",
    foreignKeyField: "evidence_hub_id",
    fieldsToTrack: [
      "name",
      "type",
      "description",
    ],
    fieldLabels: {
      name: "Name",
      type: "Type",
      description: "Description",
    },
  },

  risk: {
    tableName: "project_risk_change_history",
    foreignKeyField: "project_risk_id",
    fieldsToTrack: [
      "risk_name",
      "risk_owner",
      "ai_lifecycle_phase",
      "risk_description",
      "risk_category",
      "impact",
      "likelihood",
      "severity",
      "risk_level_autocalculated",
      "review_notes",
      "mitigation_status",
      "current_risk_level",
      "deadline",
      "mitigation_plan",
      "implementation_strategy",
      "likelihood_mitigation",
      "risk_severity",
      "final_risk_level",
      "risk_approval",
      "approval_status",
      "date_of_assessment",
    ],
    fieldLabels: {
      risk_name: "Risk name",
      risk_owner: "Risk owner",
      ai_lifecycle_phase: "AI lifecycle phase",
      risk_description: "Risk description",
      risk_category: "Risk category",
      impact: "Impact",
      likelihood: "Likelihood",
      severity: "Severity",
      risk_level_autocalculated: "Risk level (auto-calculated)",
      review_notes: "Review notes",
      mitigation_status: "Mitigation status",
      current_risk_level: "Current risk level",
      deadline: "Deadline",
      mitigation_plan: "Mitigation plan",
      implementation_strategy: "Implementation strategy",
      likelihood_mitigation: "Likelihood (mitigation)",
      risk_severity: "Risk severity",
      final_risk_level: "Final risk level",
      risk_approval: "Risk approver",
      approval_status: "Approval status",
      date_of_assessment: "Date of assessment",
    },
    fieldFormatters: {
      risk_owner: GENERIC_FORMATTERS.user,
      risk_approval: GENERIC_FORMATTERS.user,
      deadline: GENERIC_FORMATTERS.date,
      date_of_assessment: GENERIC_FORMATTERS.date,
      risk_category: GENERIC_FORMATTERS.array,
    },
  },

  vendor_risk: {
    tableName: "vendor_risk_change_history",
    foreignKeyField: "vendor_risk_id",
    fieldsToTrack: [
      "risk_description",
      "impact_description",
      "impact",
      "likelihood",
      "risk_severity",
      "action_plan",
      "action_owner",
      "risk_level",
    ],
    fieldLabels: {
      risk_description: "Risk description",
      impact_description: "Impact description",
      impact: "Impact",
      likelihood: "Likelihood",
      risk_severity: "Risk severity",
      action_plan: "Action plan",
      action_owner: "Action owner",
      risk_level: "Risk level",
    },
    fieldFormatters: {
      action_owner: GENERIC_FORMATTERS.user,
    },
  },

  policy: {
    tableName: "policy_change_history",
    foreignKeyField: "policy_id",
    fieldsToTrack: [
      "title",
      "status",
      "tags",
      "next_review_date",
      "assigned_reviewer_ids",
    ],
    fieldLabels: {
      title: "Title",
      status: "Status",
      tags: "Tags",
      next_review_date: "Next review date",
      assigned_reviewer_ids: "Assigned reviewers",
    },
    fieldFormatters: {
      tags: GENERIC_FORMATTERS.array,
      next_review_date: GENERIC_FORMATTERS.date,
      assigned_reviewer_ids: GENERIC_FORMATTERS.userArray,
    },
  },

  incident: {
    tableName: "incident_change_history",
    foreignKeyField: "incident_id",
    fieldsToTrack: [
      "ai_project",
      "type",
      "severity",
      "status",
      "occurred_date",
      "date_detected",
      "reporter",
      "categories_of_harm",
      "affected_persons_groups",
      "description",
      "relationship_causality",
      "immediate_mitigations",
      "planned_corrective_actions",
      "model_system_version",
      "interim_report",
      "archived",
      "approval_status",
      "approved_by",
      "approval_date",
      "approval_notes",
    ],
    fieldLabels: {
      ai_project: "AI use case or framework",
      type: "Incident type",
      severity: "Severity",
      status: "Status",
      occurred_date: "Occurred date",
      date_detected: "Detected date",
      reporter: "Reporter",
      categories_of_harm: "Categories of harm",
      affected_persons_groups: "Affected persons / groups",
      description: "Description",
      relationship_causality: "Relationship / causality",
      immediate_mitigations: "Immediate mitigations",
      planned_corrective_actions: "Planned corrective actions",
      model_system_version: "Model / system version",
      interim_report: "Interim report",
      archived: "Archived",
      approval_status: "Approval status",
      approved_by: "Approved by",
      approval_date: "Approval date",
      approval_notes: "Approval notes",
    },
    fieldFormatters: {
      occurred_date: GENERIC_FORMATTERS.date,
      date_detected: GENERIC_FORMATTERS.date,
      approval_date: GENERIC_FORMATTERS.date,
      interim_report: GENERIC_FORMATTERS.boolean,
      archived: GENERIC_FORMATTERS.boolean,
      categories_of_harm: GENERIC_FORMATTERS.array,
    },
  },

  file: {
    tableName: "file_change_history",
    foreignKeyField: "file_id",
    fieldsToTrack: [
      "filename",
      "version",
      "review_status",
      "tags",
      "expiry_date",
      "description",
    ],
    fieldLabels: {
      filename: "Filename",
      version: "Version",
      review_status: "Review status",
      tags: "Tags",
      expiry_date: "Expiry date",
      description: "Description",
    },
    fieldFormatters: {
      tags: GENERIC_FORMATTERS.array,
      expiry_date: GENERIC_FORMATTERS.date,
    },
  },

  model_lifecycle: {
    tableName: "model_lifecycle_change_history",
    foreignKeyField: "model_lifecycle_value_id",
    fieldsToTrack: [
      "value_text",
      "value_json",
    ],
    fieldLabels: {
      value_text: "Value",
      value_json: "Value (structured)",
    },
    fieldFormatters: {
      value_json: GENERIC_FORMATTERS.text,
    },
  },

  task: {
    tableName: "task_change_history",
    foreignKeyField: "task_id",
    fieldsToTrack: [
      "title",
      "description",
      "status",
      "priority",
      "due_date",
      "categories",
    ],
    fieldLabels: {
      title: "Title",
      description: "Description",
      status: "Status",
      priority: "Priority",
      due_date: "Due date",
      categories: "Categories",
    },
    fieldFormatters: {
      due_date: GENERIC_FORMATTERS.date,
      categories: GENERIC_FORMATTERS.array,
    },
  },

  training: {
    tableName: "training_change_history",
    foreignKeyField: "training_id",
    fieldsToTrack: [
      "training_name",
      "duration",
      "provider",
      "department",
      "status",
      "people",
      "description",
    ],
    fieldLabels: {
      training_name: "Training name",
      duration: "Duration",
      provider: "Provider",
      department: "Department",
      status: "Status",
      people: "Number of people",
      description: "Description",
    },
  },

  model_risk: {
    tableName: "model_risk_change_history",
    foreignKeyField: "model_risk_id",
    fieldsToTrack: [
      "risk_name",
      "risk_category",
      "risk_level",
      "status",
      "owner",
      "target_date",
      "description",
      "mitigation_plan",
      "impact",
      "likelihood",
      "model_id",
    ],
    fieldLabels: {
      risk_name: "Risk name",
      risk_category: "Risk category",
      risk_level: "Risk level",
      status: "Status",
      owner: "Owner",
      target_date: "Next review date",
      description: "Description",
      mitigation_plan: "Mitigation plan",
      impact: "Impact",
      likelihood: "Likelihood",
      model_id: "Associated model",
    },
    fieldFormatters: {
      target_date: GENERIC_FORMATTERS.date,
    },
  },

  dataset: {
    tableName: "dataset_change_histories",
    foreignKeyField: "dataset_id",
    fieldsToTrack: [
      "name",
      "description",
      "version",
      "owner",
      "type",
      "function",
      "source",
      "license",
      "format",
      "classification",
      "contains_pii",
      "pii_types",
      "status",
      "known_biases",
      "bias_mitigation",
      "collection_method",
      "preprocessing_steps",
    ],
    fieldLabels: {
      name: "Name",
      description: "Description",
      version: "Version",
      owner: "Owner",
      type: "Type",
      function: "Function",
      source: "Source",
      license: "License",
      format: "Format",
      classification: "Classification",
      contains_pii: "Contains PII",
      pii_types: "PII types",
      status: "Status",
      known_biases: "Known biases",
      bias_mitigation: "Bias mitigation",
      collection_method: "Collection method",
      preprocessing_steps: "Preprocessing steps",
    },
    fieldFormatters: {
      contains_pii: GENERIC_FORMATTERS.boolean,
      pii_types: GENERIC_FORMATTERS.array,
    },
  },
  ai_gateway_endpoint: {
    tableName: "ai_gateway_endpoint_change_history",
    foreignKeyField: "endpoint_id",
    fieldsToTrack: [
      "display_name",
      "slug",
      "provider",
      "model",
      "api_key_id",
      "max_tokens",
      "temperature",
      "system_prompt",
      "rate_limit_rpm",
      "is_active",
      "fallback_endpoint_id",
      "allowed_role_ids",
    ],
    fieldLabels: {
      display_name: "Display name",
      slug: "Slug",
      provider: "Provider",
      model: "Model",
      api_key_id: "API key",
      max_tokens: "Max tokens",
      temperature: "Temperature",
      system_prompt: "System prompt",
      rate_limit_rpm: "Rate limit (RPM)",
      is_active: "Active",
      fallback_endpoint_id: "Fallback endpoint",
      allowed_role_ids: "Allowed roles",
    },
    fieldFormatters: {
      is_active: GENERIC_FORMATTERS.boolean,
      allowed_role_ids: GENERIC_FORMATTERS.array,
    },
  },

  ai_gateway_guardrail: {
    tableName: "ai_gateway_guardrail_change_history",
    foreignKeyField: "guardrail_id",
    fieldsToTrack: [
      "name",
      "guardrail_type",
      "action",
      "scope",
      "is_active",
      "config",
    ],
    fieldLabels: {
      name: "Name",
      guardrail_type: "Type",
      action: "Action",
      scope: "Scope",
      is_active: "Active",
      config: "Configuration",
    },
    fieldFormatters: {
      is_active: GENERIC_FORMATTERS.boolean,
    },
  },
};

/**
 * Get entity configuration by type
 */
export const getEntityConfig = (entityType: EntityType): EntityConfig => {
  const config = ENTITY_CONFIGS[entityType];
  if (!config) {
    throw new Error(`No configuration found for entity type: ${entityType}`);
  }
  return config;
};
