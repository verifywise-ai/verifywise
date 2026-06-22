export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "global_search",
      description:
        "Search across all entity types in the organization using case-insensitive text matching. Searches projects, tasks, vendors, risks, models, evidence, policies, files, trainings, incidents, and more. Returns grouped results by entity type with match highlighting.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "The search query string. Minimum 3 characters. Searches across all text fields in each entity type using case-insensitive matching.",
          },
          entity_types: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "projects",
                "tasks",
                "vendors",
                "vendor_risks",
                "model_inventories",
                "evidence_hub",
                "project_risks",
                "file_manager",
                "policy_manager",
                "ai_trust_center_resources",
                "ai_trust_center_subprocessors",
                "training_registar",
                "incident_management",
                "llm_evals_projects",
              ],
            },
            description:
              "Optional array of entity types to search within. If not provided, searches all entity types.",
          },
          limit: {
            type: "number",
            description:
              "Maximum number of results per entity type. Default is 20, maximum is 100.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_within_entity",
      description:
        "Search within a specific entity type with optional filters. More targeted than global_search, allowing additional filtering by review status and other entity-specific criteria.",
      parameters: {
        type: "object",
        properties: {
          entity_type: {
            type: "string",
            enum: [
              "projects",
              "tasks",
              "vendors",
              "vendor_risks",
              "model_inventories",
              "evidence_hub",
              "project_risks",
              "file_manager",
              "policy_manager",
              "ai_trust_center_resources",
              "ai_trust_center_subprocessors",
              "training_registar",
              "incident_management",
              "llm_evals_projects",
            ],
            description: "The entity type to search within.",
          },
          query: {
            type: "string",
            description: "The search query string. Minimum 3 characters.",
          },
          filters: {
            type: "object",
            properties: {
              review_status: {
                type: "string",
                description:
                  "Filter by review status (e.g., 'draft', 'pending_review', 'approved', 'rejected'). Only applicable to entities with a review_status column.",
              },
            },
            description: "Optional filters to narrow search results.",
          },
          limit: {
            type: "number",
            description: "Maximum number of results. Default is 20, maximum is 100.",
          },
        },
        required: ["entity_type", "query"],
      },
    },
  },
];
