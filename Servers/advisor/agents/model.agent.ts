/**
 * Phase 3 — Model Agent
 *
 * Handles AI model lifecycle, model risk assessment,
 * deployment governance, and dataset management.
 */

import { createDomainAgent } from "./baseAgent";

export function registerModelAgent() {
  return createDomainAgent({
    name: "model-agent",
    description:
      "AI model governance specialist — model lifecycle, risk assessment, deployment governance",
    domains: ["model", "model_inventory", "dataset"],
    keywords: [
      "model",
      "model inventory",
      "ai model",
      "machine learning",
      "deployment",
      "model risk",
      "dataset",
      "training data",
      "foundation model",
      "model lifecycle",
      "model card",
      "bias",
      "fairness",
      "accuracy",
      "model validation",
      "model monitoring",
      "model lineage",
    ],
    tools: [
      // Read tools
      "fetch_model_inventory",
      "get_model_inventory_by_id",
      "get_model_inventory_analytics",
      "get_model_inventory_changes_history",
      "search_model_inventory",
      "get_model_lifecycle_status",
      "get_model_deployment_info",
      "fetch_datasets",
      "get_dataset_by_id",
      "get_dataset_analytics",
      "get_dataset_changes_history",
      "fetch_model_risks",
      "get_model_risk_by_id",
      "get_model_risk_analytics",
      // Write tools
      "agent_register_model",
      "agent_update_model",
      "agent_retire_model",
      "agent_delete_model",
      "agent_update_model_lifecycle_phase",
      "agent_link_model_to_project",
      "agent_register_dataset",
      "agent_update_dataset",
      "agent_delete_dataset",
      "agent_link_dataset_to_model",
    ],
    systemPromptSuffix: `You are an AI model governance expert. When managing models:
- Track the full model lifecycle: development → validation → deployment → monitoring → retirement
- Assess model risks including bias, fairness, accuracy, and robustness
- Ensure model documentation (model cards) is complete
- Link models to their training datasets for lineage tracking
- Flag models approaching retirement or needing revalidation
- Consider EU AI Act high-risk model requirements`,
  });
}
