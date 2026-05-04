/**
 * Change History Configuration (Frontend)
 *
 * Configuration for entity change history tracking on the frontend.
 * Defines how each entity's history should be displayed.
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
  | "training"
  | "task"
  | "model_risk"
  | "dataset";

export interface EntityHistoryConfig {
  entityName: string; // Display name (e.g., "Model", "Vendor")
  emptyStateTitle: string;
  emptyStateMessage: string;
}

export const ENTITY_HISTORY_CONFIGS: {
  [key in EntityType]: EntityHistoryConfig;
} = {
  model_inventory: {
    entityName: "Model",
    emptyStateTitle: "Activity history",
    emptyStateMessage:
      "Automatically tracks every change to this model. See what your team is working on and what updates they've made, in real time.",
  },
  vendor: {
    entityName: "Vendor",
    emptyStateTitle: "Activity history",
    emptyStateMessage:
      "Automatically tracks every change to this vendor. See what your team is working on and what updates they've made, in real time.",
  },
  use_case: {
    entityName: "Use case",
    emptyStateTitle: "Activity history",
    emptyStateMessage:
      "Automatically tracks every change to this use case. See what your team is working on and what updates they've made, in real time.",
  },
  project: {
    entityName: "Project",
    emptyStateTitle: "Activity history",
    emptyStateMessage:
      "Automatically tracks every change to this project. See what your team is working on and what updates they've made, in real time.",
  },
  framework: {
    entityName: "Framework",
    emptyStateTitle: "Activity history",
    emptyStateMessage:
      "Automatically tracks every change to this framework. See what your team is working on and what updates they've made, in real time.",
  },
  evidence_hub: {
    entityName: "Evidence",
    emptyStateTitle: "Activity history",
    emptyStateMessage:
      "Automatically tracks every change to this evidence. See what your team is working on and what updates they've made, in real time.",
  },
  risk: {
    entityName: "Risk",
    emptyStateTitle: "Activity history",
    emptyStateMessage:
      "Automatically tracks every change to this risk. See what your team is working on and what updates they've made, in real time.",
  },
  vendor_risk: {
    entityName: "Vendor risk",
    emptyStateTitle: "Activity history",
    emptyStateMessage:
      "Automatically tracks every change to this vendor risk. See what your team is working on and what updates they've made, in real time.",
  },
  policy: {
    entityName: "Policy",
    emptyStateTitle: "Activity history",
    emptyStateMessage:
      "Automatically tracks every change to this policy. See what your team is working on and what updates they've made, in real time.",
  },
  incident: {
    entityName: "Incident",
    emptyStateTitle: "Activity history",
    emptyStateMessage:
      "Automatically tracks every change to this incident. See what your team is working on and what updates they've made, in real time.",
  },
  file: {
    entityName: "File",
    emptyStateTitle: "Activity history",
    emptyStateMessage:
      "Automatically tracks every change to this file. See what your team is working on and what updates they've made, in real time.",
  },
  model_lifecycle: {
    entityName: "Lifecycle item",
    emptyStateTitle: "Activity history",
    emptyStateMessage:
      "Automatically tracks every change to lifecycle items. See what your team is working on and what updates they've made, in real time.",
  },
  training: {
    entityName: "Training",
    emptyStateTitle: "Activity history",
    emptyStateMessage:
      "Automatically tracks every change to this training. See what your team is working on and what updates they've made, in real time.",
  },
  task: {
    entityName: "Task",
    emptyStateTitle: "Activity history",
    emptyStateMessage:
      "Automatically tracks every change to this task. See what your team is working on and what updates they've made, in real time.",
  },
  model_risk: {
    entityName: "Model risk",
    emptyStateTitle: "Activity history",
    emptyStateMessage:
      "Automatically tracks every change to this model risk. See what your team is working on and what updates they've made, in real time.",
  },
  dataset: {
    entityName: "Dataset",
    emptyStateTitle: "Activity history",
    emptyStateMessage:
      "Automatically tracks every change to this dataset. See what your team is working on and what updates they've made, in real time.",
  },
};

export const getEntityHistoryConfig = (entityType: EntityType): EntityHistoryConfig => {
  const config = ENTITY_HISTORY_CONFIGS[entityType];
  if (!config) {
    throw new Error(`No history configuration found for entity type: ${entityType}`);
  }
  return config;
};
