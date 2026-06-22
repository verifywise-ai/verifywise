export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "get_pmm_config",
      description:
        "Retrieve the Post-Market Monitoring configuration for a specific project. Returns config details including frequency, escalation contacts, question count, and active cycle information.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "number",
            description: "The project ID to get the PMM configuration for.",
          },
        },
        required: ["project_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pmm_active_cycle",
      description:
        "Get the currently active PMM monitoring cycle for a project. Returns the cycle details including status, due date, and stakeholder assignment.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "number",
            description: "The project ID to get the active monitoring cycle for.",
          },
        },
        required: ["project_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pmm_cycle_detail",
      description:
        "Get detailed information about a specific PMM monitoring cycle by its ID. Returns cycle status, responses, and completion details.",
      parameters: {
        type: "object",
        properties: {
          cycle_id: {
            type: "number",
            description: "The ID of the PMM cycle to retrieve.",
          },
        },
        required: ["cycle_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pmm_cycle_responses",
      description:
        "Get all responses submitted for a specific PMM monitoring cycle. Returns the question-response pairs including any flagged concerns.",
      parameters: {
        type: "object",
        properties: {
          cycle_id: {
            type: "number",
            description: "The ID of the PMM cycle to get responses for.",
          },
        },
        required: ["cycle_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pmm_questions",
      description:
        "Get all PMM monitoring questions configured for a specific config. Returns the list of questions with their types and ordering.",
      parameters: {
        type: "object",
        properties: {
          config_id: {
            type: "number",
            description: "The PMM config ID to get questions for.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_pmm_reports",
      description:
        "Retrieve PMM monitoring reports for a project. Returns generated reports including summaries, findings, and recommendations from completed cycles.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "number",
            description: "Filter reports by project ID.",
          },
          limit: {
            type: "number",
            description:
              "Maximum number of reports to return. Default is to return all matching reports.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pmm_analytics",
      description:
        "Get comprehensive analytics across all PMM monitoring data. Returns cycle completion rates, response trends, flagged concern distributions, and monitoring health metrics.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pmm_executive_summary",
      description:
        "Get a high-level executive summary of Post-Market Monitoring across all projects. Includes active monitoring counts, overdue cycles, flagged concerns, and overall monitoring posture.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_create_pmm_config",
      description:
        "Create a new Post-Market Monitoring configuration for a project. Sets up the monitoring schedule, frequency, and escalation settings. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "number",
            description: "The project ID to create the PMM configuration for.",
          },
          frequency: {
            type: "string",
            description:
              "Monitoring frequency (e.g., '30 days', '7 days', '90 days'). Defaults to 30 days if not specified.",
          },
          stakeholder_id: {
            type: "number",
            description: "User ID of the stakeholder responsible for escalation.",
          },
        },
        required: ["project_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_update_pmm_config",
      description:
        "Update an existing PMM configuration's settings. Only the provided fields will be updated. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          config_id: {
            type: "number",
            description: "The ID of the PMM config to update.",
          },
          frequency: {
            type: "string",
            description: "Updated monitoring frequency (e.g., '30 days', '7 days', '90 days').",
          },
          stakeholder_id: {
            type: "number",
            description: "Updated escalation contact user ID.",
          },
          is_active: {
            type: "boolean",
            description: "Whether the PMM config is active.",
          },
        },
        required: ["config_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_add_pmm_question",
      description:
        "Add a new monitoring question to a PMM configuration. Questions are used in monitoring cycles to gather stakeholder responses. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          config_id: {
            type: "number",
            description: "The PMM config ID to add the question to.",
          },
          question_text: {
            type: "string",
            description: "The text of the monitoring question.",
          },
          question_type: {
            type: "string",
            enum: ["text", "yes_no", "rating", "multiple_choice"],
            description: "The type of question. Defaults to 'text' if not specified.",
          },
        },
        required: ["config_id", "question_text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_start_pmm_cycle",
      description:
        "Start a new PMM monitoring cycle for a configuration. Creates a new cycle and assigns it to the configured stakeholder. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          config_id: {
            type: "number",
            description: "The PMM config ID to start a new cycle for.",
          },
        },
        required: ["config_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_submit_pmm_responses",
      description:
        "Submit responses for a PMM monitoring cycle. Saves all question-response pairs for the specified cycle. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          cycle_id: {
            type: "number",
            description: "The cycle ID to submit responses for.",
          },
          responses: {
            type: "array",
            items: {
              type: "object",
              properties: {
                question_id: { type: "number" },
                response_value: { type: "string" },
              },
              required: ["question_id", "response_value"],
            },
            description: "Array of question-response pairs to submit.",
          },
        },
        required: ["cycle_id", "responses"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_flag_pmm_concern",
      description:
        "Flag a concern on a specific question response in a PMM cycle. Marks the response for escalation review. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          cycle_id: {
            type: "number",
            description: "The cycle ID containing the response.",
          },
          question_id: {
            type: "number",
            description: "The question ID to flag a concern for.",
          },
          concern_text: {
            type: "string",
            description: "Description of the concern being flagged.",
          },
        },
        required: ["cycle_id", "question_id", "concern_text"],
      },
    },
  },
];
