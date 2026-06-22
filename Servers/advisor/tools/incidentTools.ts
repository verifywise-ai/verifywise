export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "fetch_incidents",
      description:
        "Retrieve AI incidents. CRITICAL: Pass ONLY filters the user explicitly mentioned. For 'show all/list incidents' use empty params {}. Never include default/example values. Do not pass type, severity, status unless user explicitly asks for that specific value. Passing unmatched filters returns 0 results.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            description:
              "ONLY include if user explicitly asks for this type. Valid values: Malfunction, Unexpected behavior, Model drift, Misuse, Data corruption, Security breach, Performance degradation. Omit this field entirely to get all types.",
          },
          severity: {
            type: "string",
            description:
              "ONLY include if user explicitly asks for this severity. Valid values: Minor, Serious, Very serious. Omit this field entirely to get all severities.",
          },
          status: {
            type: "string",
            description:
              "ONLY include if user explicitly asks for this status. Valid values: Open, Investigating, Mitigated, Closed. Omit this field entirely to get all statuses.",
          },
          approval_status: {
            type: "string",
            description:
              "ONLY include if user explicitly asks. Valid values: Approved, Rejected, Pending, Not required.",
          },
          ai_project: {
            type: "string",
            description:
              "Filter by AI project name. Supports partial matching. Only include if user names a project.",
          },
          limit: {
            type: "number",
            description: "Maximum number of incidents to return.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_incident_analytics",
      description:
        "Get comprehensive analytics and distributions for AI incident data. Use this tool to understand incident patterns, identify trends, and generate insights about incident distribution across different dimensions. Returns aggregated statistics including type distribution, severity breakdown, status distribution, approval status, and incidents by AI project.",
      parameters: {
        type: "object",
        properties: {
          includeArchived: {
            type: "boolean",
            description: "Whether to include archived incidents in analytics. Default is false.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_incident_executive_summary",
      description:
        "Get a high-level executive summary of the AI incident landscape. Use this tool for quick overview of total incidents, severity breakdown, open incidents requiring attention, resolution progress, and recent incident trends. Ideal for answering questions about overall incident posture and areas needing immediate attention.",
      parameters: {
        type: "object",
        properties: {
          includeArchived: {
            type: "boolean",
            description: "Whether to include archived incidents in summary. Default is false.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_create_incident",
      description:
        "Create a new AI incident report. Requires human confirmation before execution. Use this when the user asks to report or log a new incident.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description:
              "Title or short description of the incident, used as the AI project identifier.",
          },
          description: {
            type: "string",
            description: "Detailed description of the incident.",
          },
          type: {
            type: "string",
            enum: [
              "Malfunction",
              "Unexpected behavior",
              "Model drift",
              "Misuse",
              "Data corruption",
              "Security breach",
              "Performance degradation",
            ],
            description: "Type of incident.",
          },
          severity: {
            type: "string",
            enum: ["Minor", "Serious", "Very serious"],
            description: "Severity level of the incident.",
          },
          project_id: {
            type: "number",
            description: "Associated AI project ID.",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_update_incident",
      description:
        "Update an existing AI incident's details. Requires human confirmation before execution. Use this when the user asks to modify incident information.",
      parameters: {
        type: "object",
        properties: {
          incident_id: {
            type: "number",
            description: "ID of the incident to update.",
          },
          title: {
            type: "string",
            description: "Updated title/AI project name.",
          },
          description: {
            type: "string",
            description: "Updated description.",
          },
          type: {
            type: "string",
            enum: [
              "Malfunction",
              "Unexpected behavior",
              "Model drift",
              "Misuse",
              "Data corruption",
              "Security breach",
              "Performance degradation",
            ],
            description: "Updated incident type.",
          },
          severity: {
            type: "string",
            enum: ["Minor", "Serious", "Very serious"],
            description: "Updated severity level.",
          },
          status: {
            type: "string",
            enum: ["Open", "Investigating", "Mitigated", "Closed"],
            description: "Updated status.",
          },
        },
        required: ["incident_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_update_incident_status",
      description:
        "Update only the status of an AI incident. Requires human confirmation before execution. Use this when the user asks to change an incident's status (e.g., move to investigating, mitigate, close).",
      parameters: {
        type: "object",
        properties: {
          incident_id: {
            type: "number",
            description: "ID of the incident to update.",
          },
          status: {
            type: "string",
            enum: ["Open", "Investigating", "Mitigated", "Closed"],
            description: "New status for the incident.",
          },
        },
        required: ["incident_id", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_archive_incident",
      description:
        "Archive an AI incident. This removes it from the active view but preserves the data. Requires human confirmation before execution.",
      parameters: {
        type: "object",
        properties: {
          incident_id: {
            type: "number",
            description: "ID of the incident to archive.",
          },
        },
        required: ["incident_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_delete_incident",
      description:
        "Permanently delete an AI incident. This is irreversible. Requires human confirmation before execution.",
      parameters: {
        type: "object",
        properties: {
          incident_id: {
            type: "number",
            description: "ID of the incident to delete.",
          },
        },
        required: ["incident_id"],
      },
    },
  },
];
