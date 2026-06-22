/**
 * LLM-facing tool definition for `agent_register_model`.
 *
 * Mirrors `./schema.ts`. The two are kept in sync by hand because they
 * serve different consumers (LLM vs TS runtime) and the shapes don't
 * round-trip cleanly.
 *
 * Required fields here are minimal because the model_inventories table
 * itself only requires a model name; everything else is enriched later
 * (security assessment, hosting provider, biases, limitations) through
 * the dedicated UI flow.
 */

import type { AiActionToolDefinition } from "../types";

export const registerModelToolDefinition: AiActionToolDefinition = {
  type: "function",
  function: {
    name: "agent_register_model",
    description:
      "Propose registering a new AI model in the model inventory. This is a WRITE action — it does NOT execute immediately. Instead, it files an approval request and returns a pending_approval status. A human Admin must approve before the model is actually created.\n\nIMPORTANT — collecting required fields:\n1. Use this tool ONLY when the user explicitly asks to register, add, or onboard a new model into the inventory.\n2. `name` is required (the model's identifier, e.g. 'GPT-4o', 'DeepSeek-V3', 'Claude 3.5 Sonnet'). The other fields are optional but should be filled when the user supplied them — do not invent values the user did not give.\n3. For project_id: if the user named a project/use case, call `list_projects` to resolve the numeric id. Do not guess.\n4. Once you have the user's stated info, call this tool exactly once. Then tell the user to open Pending Approvals to approve or reject.\n\nIf this tool throws a validation error, surface the specific failures to the user and ask for corrected values — do not retry blindly.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "The model name (e.g. 'GPT-4', 'Claude 3.5 Sonnet', 'DeepSeek-V3', 'Llama 3 70B'). Required. 1–255 characters.",
        },
        model_type: {
          type: "string",
          description:
            "The provider/vendor of the model (e.g. 'OpenAI', 'Anthropic', 'Google', 'DeepSeek', 'Meta'). Optional but strongly recommended. 1–255 characters.",
        },
        version: {
          type: "string",
          description:
            "Model version string (e.g. '1.0', '2024-01', 'turbo'). Optional. Max 100 characters.",
        },
        description: {
          type: "string",
          description:
            "Short description of the model's capabilities and intended use. Stored in the `capabilities` column. Optional. Max 2000 characters.",
        },
        project_id: {
          type: "number",
          description:
            "Optional id of an existing project (use case) to link the model to. Resolve via `list_projects` if the user mentions a project by name. Omit if the user didn't mention one.",
        },
      },
      required: ["name"],
    },
  },
};
