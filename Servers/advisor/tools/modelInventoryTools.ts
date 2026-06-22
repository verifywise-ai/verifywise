export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "fetch_model_inventories",
      description:
        "Retrieve and filter AI models from the model inventory. Use this tool to search for specific models based on project, framework, status, security assessment, provider, hosting provider, or model name. Returns an array of model objects matching the specified criteria.",
      parameters: {
        type: "object",
        properties: {
          projectId: {
            type: "number",
            description:
              "Filter models by project ID. Use this to get models associated with a specific project.",
          },
          frameworkId: {
            type: "number",
            description:
              "Filter models by framework ID (e.g., ISO-42001, ISO-27001, EU AI Act). Use this to get models used within a specific compliance framework.",
          },
          status: {
            type: "string",
            enum: ["Approved", "Restricted", "Pending", "Blocked"],
            description:
              "Filter by model approval status. 'Approved' means ready for use, 'Restricted' has limitations, 'Pending' awaiting approval, 'Blocked' should not be used.",
          },
          security_assessment: {
            type: "boolean",
            description:
              "Filter by whether the model has undergone security assessment. true = assessed, false = not assessed.",
          },
          provider: {
            type: "string",
            description:
              "Filter by AI provider name (e.g., 'OpenAI', 'Anthropic', 'Google', 'Meta', 'Mistral AI'). Supports partial matching.",
          },
          hosting_provider: {
            type: "string",
            description:
              "Filter by hosting infrastructure provider (e.g., 'AWS', 'Google Cloud', 'Azure', 'On-premises'). Supports partial matching.",
          },
          model: {
            type: "string",
            description:
              "Filter by model name (e.g., 'GPT-4', 'Claude', 'Gemini', 'Llama'). Supports partial matching.",
          },
          limit: {
            type: "number",
            description:
              "Maximum number of models to return. Default is to return all matching models. Use this to get a preview or top N results.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_model_inventory_analytics",
      description:
        "Get comprehensive analytics and distributions for model inventory data. Use this tool to understand the model landscape, identify patterns, and generate insights about model distribution across different dimensions. Returns aggregated statistics including status distribution, provider breakdown, security assessment coverage, hosting provider distribution, and capabilities analysis.",
      parameters: {
        type: "object",
        properties: {
          projectId: {
            type: "number",
            description:
              "Optional: Scope analytics to a specific project. If not provided, returns analytics for all models in the tenant.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_model_inventory_executive_summary",
      description:
        "Get a high-level executive summary of the model inventory landscape. Use this tool for quick overview of total models, approval status breakdown, security assessment progress, top providers, recent additions, and hosting distribution. Ideal for answering questions about overall model inventory posture, what models are available, and what needs attention.",
      parameters: {
        type: "object",
        properties: {
          projectId: {
            type: "number",
            description:
              "Optional: Scope summary to a specific project. If not provided, returns summary for all models in the tenant.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_update_model",
      description:
        "Update properties of an existing model in the inventory. Only the provided fields will be updated. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          model_id: {
            type: "number",
            description: "The ID of the model to update.",
          },
          name: {
            type: "string",
            description: "Updated model name.",
          },
          model_type: {
            type: "string",
            description: "Updated provider/vendor name.",
          },
          version: {
            type: "string",
            description: "Updated version string.",
          },
          description: {
            type: "string",
            description: "Updated description of the model.",
          },
          status: {
            type: "string",
            enum: ["Approved", "Restricted", "Pending", "Blocked"],
            description: "Updated approval status.",
          },
          hosting_provider: {
            type: "string",
            description:
              "Updated hosting provider (e.g., 'AWS', 'Google Cloud', 'Azure', 'On-premises').",
          },
          capabilities: {
            type: "string",
            description: "Updated capabilities as a comma-separated string.",
          },
        },
        required: ["model_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_update_model_lifecycle_phase",
      description:
        "Update the lifecycle phase/status of a model in the inventory. Use this to transition a model between approval states (e.g., from 'Pending' to 'Approved'). Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          model_id: {
            type: "number",
            description: "The ID of the model to update.",
          },
          lifecycle_phase: {
            type: "string",
            enum: ["Approved", "Restricted", "Pending", "Blocked"],
            description: "The new lifecycle phase/status for the model.",
          },
        },
        required: ["model_id", "lifecycle_phase"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_retire_model",
      description:
        "Retire a model by setting its status to 'Blocked'. This indicates the model should no longer be used but preserves the record. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          model_id: {
            type: "number",
            description: "The ID of the model to retire.",
          },
        },
        required: ["model_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_delete_model",
      description:
        "Permanently delete a model from the inventory. This also removes associated project/framework links and optionally model risks. This action cannot be undone. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          model_id: {
            type: "number",
            description: "The ID of the model to delete.",
          },
        },
        required: ["model_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_link_model_to_project",
      description:
        "Link an existing model to a project. Creates an association between the model and the specified project. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          model_id: {
            type: "number",
            description: "The ID of the model to link.",
          },
          project_id: {
            type: "number",
            description: "The ID of the project to link the model to.",
          },
        },
        required: ["model_id", "project_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_models_for_use_case",
      description:
        "List all AI models linked to a specific use case (project). The product UI labels projects as 'use cases'. Returns models registered against the given use case across any framework context.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "number",
            description: "The use case (project) ID to look up linked models for.",
          },
        },
        required: ["project_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_use_cases_for_model",
      description:
        "List all use cases (projects) a given model is linked to. Inverse of list_models_for_use_case. Returns the project_id, project name, and goal for each linked use case.",
      parameters: {
        type: "object",
        properties: {
          model_id: {
            type: "number",
            description: "The model ID to look up linked use cases for.",
          },
        },
        required: ["model_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_unlink_model_from_use_case",
      description:
        "Remove the link between a model and a use case (project). Deletes all rows in the join table matching (model_id, project_id) regardless of framework context. Does not delete the model or the project. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          model_id: {
            type: "number",
            description: "The model ID.",
          },
          project_id: {
            type: "number",
            description: "The use case (project) ID to unlink from.",
          },
        },
        required: ["model_id", "project_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_models_for_framework",
      description:
        "List all AI models linked to a specific compliance framework (e.g., ISO 42001, ISO 27001, EU AI Act). Returns models that have been mapped into the framework's compliance scope.",
      parameters: {
        type: "object",
        properties: {
          framework_id: {
            type: "number",
            description: "The framework ID to look up linked models for.",
          },
        },
        required: ["framework_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_frameworks_for_model",
      description:
        "List all compliance frameworks a given model is mapped into. Inverse of list_models_for_framework. Returns framework_id and framework name for each link.",
      parameters: {
        type: "object",
        properties: {
          model_id: {
            type: "number",
            description: "The model ID to look up linked frameworks for.",
          },
        },
        required: ["model_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_link_model_to_framework",
      description:
        "Map a model into a compliance framework's scope under a specific use case (project). Inserts (model_id, project_id, framework_id) into the join table. The project context is required because the link table's UNIQUE constraint covers all three. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          model_id: {
            type: "number",
            description: "The model ID.",
          },
          project_id: {
            type: "number",
            description:
              "The use case (project) ID providing the context for this framework mapping.",
          },
          framework_id: {
            type: "number",
            description: "The framework ID to link the model to.",
          },
        },
        required: ["model_id", "project_id", "framework_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_unlink_model_from_framework",
      description:
        "Remove a model from a compliance framework's scope. Deletes rows from the join table matching (model_id, framework_id). If project_id is provided, deletion is scoped to that single project context; otherwise removes all framework links for the model. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          model_id: {
            type: "number",
            description: "The model ID.",
          },
          framework_id: {
            type: "number",
            description: "The framework ID to unlink from.",
          },
          project_id: {
            type: "number",
            description:
              "Optional. If provided, scopes the unlink to this single use case (project). If omitted, unlinks the model from this framework across all projects.",
          },
        },
        required: ["model_id", "framework_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files_for_model",
      description:
        "List all evidence files attached to a model. Returns file id, filename, type, size, version, review_status, uploaded_time and uploaded_by for each linked file. Files must already be uploaded via the file controller — this tool does not upload.",
      parameters: {
        type: "object",
        properties: {
          model_id: {
            type: "number",
            description: "The model ID to list attached files for.",
          },
          limit: {
            type: "number",
            description: "Optional max number of files to return.",
          },
        },
        required: ["model_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_attach_file_to_model",
      description:
        "Attach an existing uploaded file to a model as evidence. The file must already exist in the files table (uploaded via /api/files). Inserts a row into file_entity_links with entity_type='model_inventory'. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          model_id: {
            type: "number",
            description: "The model ID to attach the file to.",
          },
          file_id: {
            type: "number",
            description: "The ID of an already-uploaded file.",
          },
          project_id: {
            type: "number",
            description: "Optional project context for this evidence link.",
          },
        },
        required: ["model_id", "file_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_detach_file_from_model",
      description:
        "Remove the evidence link between a file and a model. Deletes the file_entity_links row but does NOT delete the underlying file (it may be linked to other entities). Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          model_id: {
            type: "number",
            description: "The model ID.",
          },
          file_id: {
            type: "number",
            description: "The file ID to detach from the model.",
          },
        },
        required: ["model_id", "file_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_datasets_for_model",
      description:
        "List all datasets a model is linked to (e.g., training data, evaluation data). Returns dataset id, name, version, owner, type, source, classification, contains_pii, status, plus the relationship_type from the join table.",
      parameters: {
        type: "object",
        properties: {
          model_id: {
            type: "number",
            description: "The model ID to list linked datasets for.",
          },
          limit: {
            type: "number",
            description: "Optional max number of datasets to return.",
          },
        },
        required: ["model_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_link_model_to_dataset",
      description:
        "Link a model to a dataset (e.g., declare that the model was trained or evaluated on the dataset). Inserts into dataset_model_inventories. If a link already exists, returns success=false. Requires user confirmation before executing. This is the model-side mirror of agent_link_dataset_to_model.",
      parameters: {
        type: "object",
        properties: {
          model_id: {
            type: "number",
            description: "The model ID.",
          },
          dataset_id: {
            type: "number",
            description: "The dataset ID to link the model to.",
          },
          relationship_type: {
            type: "string",
            description:
              "Optional relationship label (e.g., 'trained_on', 'evaluated_on', 'fine_tuned_on'). Defaults to 'trained_on' to match agent_link_dataset_to_model.",
          },
        },
        required: ["model_id", "dataset_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_risks_for_model",
      description:
        "Returns the model's metadata plus a guidance block on how to draft 3–5 governance risks tailored to this specific model. Call this AFTER a model has been approved and exists in the inventory (or any time the user asks for risk suggestions for an existing model). Then use the guidance to file individual agent_suggest_model_risk approval requests (NOT agent_create_model_risk — the suggest tool produces inline chat-card approvals), each with the resolved model_id. Do not propose generic, model-agnostic risks.",
      parameters: {
        type: "object",
        properties: {
          model_id: {
            type: "number",
            description:
              "The model ID to generate risk suggestions for. Resolve via fetch_model_inventories if you don't already have it.",
          },
        },
        required: ["model_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_unlink_model_from_dataset",
      description:
        "Remove the link between a model and a dataset. Deletes the row in dataset_model_inventories. Does not delete the model or the dataset. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          model_id: {
            type: "number",
            description: "The model ID.",
          },
          dataset_id: {
            type: "number",
            description: "The dataset ID to unlink from.",
          },
        },
        required: ["model_id", "dataset_id"],
      },
    },
  },
];
