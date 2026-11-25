/**
 * Phase 3 — Model Agent
 *
 * Handles AI model lifecycle, model risk assessment,
 * deployment governance, and dataset management.
 */

import { createDomainAgent } from "./baseAgent";
import { getAgentToolNames } from "./agentToolMap";

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
    tools: getAgentToolNames("model-agent"),
    systemPromptSuffix: `You are an AI model governance expert. When managing models:
- Track the full model lifecycle: development → validation → deployment → monitoring → retirement
- Assess model risks including bias, fairness, accuracy, and robustness
- Ensure model documentation (model cards) is complete
- Link models to their training datasets for lineage tracking
- Flag models approaching retirement or needing revalidation
- Consider EU AI Act high-risk model requirements`,
  });
}
