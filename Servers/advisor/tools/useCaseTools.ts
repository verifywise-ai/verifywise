export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "fetch_use_cases",
      description:
        "Retrieve and filter use cases (projects) from the database. Use this tool to search for specific use cases based on status, AI risk classification, or owner. Returns an array of use case objects matching the specified criteria.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["Draft", "In Progress", "Active", "Completed", "Archived"],
            description: "Filter by use case status.",
          },
          ai_risk_classification: {
            type: "string",
            enum: ["High risk", "Limited risk", "Minimal risk", "Unacceptable risk"],
            description: "Filter by EU AI Act risk classification level.",
          },
          limit: {
            type: "number",
            description:
              "Maximum number of use cases to return. Default is to return all matching use cases.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_use_case_analytics",
      description:
        "Get comprehensive analytics and distributions for use case data. Use this tool to understand the use case landscape, status distribution, risk classification breakdown, and framework adoption. Returns aggregated statistics.",
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
      name: "get_use_case_executive_summary",
      description:
        "Get a high-level executive summary of use cases. Use this tool for quick overview of total use cases, active vs draft counts, high-risk use cases, and compliance posture. Ideal for answering questions about overall use case portfolio.",
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
      name: "agent_create_use_case",
      description:
        "Create a new use case (project) in the system. Requires human confirmation before execution.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The title/name of the use case.",
          },
          description: {
            type: "string",
            description: "Description of the use case.",
          },
          status: {
            type: "string",
            enum: ["Draft", "In Progress", "Active", "Completed", "Archived"],
            description: "Initial status for the use case. Defaults to 'Draft'.",
          },
          risk_classification: {
            type: "string",
            enum: ["High risk", "Limited risk", "Minimal risk", "Unacceptable risk"],
            description: "EU AI Act risk classification level.",
          },
          industry: {
            type: "string",
            description: "Target industry for the use case.",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_update_use_case",
      description:
        "Update an existing use case (project). Requires human confirmation before execution.",
      parameters: {
        type: "object",
        properties: {
          use_case_id: {
            type: "number",
            description: "The ID of the use case to update.",
          },
          name: {
            type: "string",
            description: "New title/name for the use case.",
          },
          description: {
            type: "string",
            description: "New description for the use case.",
          },
          status: {
            type: "string",
            enum: ["Draft", "In Progress", "Active", "Completed", "Archived"],
            description: "New status for the use case.",
          },
          risk_classification: {
            type: "string",
            enum: ["High risk", "Limited risk", "Minimal risk", "Unacceptable risk"],
            description: "New EU AI Act risk classification level.",
          },
          industry: {
            type: "string",
            description: "New target industry for the use case.",
          },
          goal: {
            type: "string",
            description: "New goal for the use case.",
          },
        },
        required: ["use_case_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_update_use_case_status",
      description:
        "Update only the status of an existing use case. Requires human confirmation before execution.",
      parameters: {
        type: "object",
        properties: {
          use_case_id: {
            type: "number",
            description: "The ID of the use case to update.",
          },
          status: {
            type: "string",
            enum: ["Draft", "In Progress", "Active", "Completed", "Archived"],
            description: "New status for the use case.",
          },
        },
        required: ["use_case_id", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_add_member_to_use_case",
      description:
        "Add a team member to a use case (project). Requires human confirmation before execution.",
      parameters: {
        type: "object",
        properties: {
          use_case_id: {
            type: "number",
            description: "The ID of the use case to add the member to.",
          },
          user_id: {
            type: "number",
            description: "The ID of the user to add as a member.",
          },
          role: {
            type: "string",
            description: "Optional role description for the member within this use case.",
          },
        },
        required: ["use_case_id", "user_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_delete_use_case",
      description:
        "Permanently delete a use case (project) and all associated data. This action is irreversible. Requires human confirmation before execution.",
      parameters: {
        type: "object",
        properties: {
          use_case_id: {
            type: "number",
            description: "The ID of the use case to delete.",
          },
        },
        required: ["use_case_id"],
      },
    },
  },
];
