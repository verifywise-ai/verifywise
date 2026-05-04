export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "fetch_incidents",
      description:
        "Retrieve and filter AI incidents from the incident management system. Use this tool to search for specific incidents based on type, severity, status, approval status, or AI project. Returns an array of incident objects matching the specified criteria.",
      parameters: {
        type: "object",
        properties: {
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
            description: "Filter by incident type.",
          },
          severity: {
            type: "string",
            enum: ["Minor", "Serious", "Very serious"],
            description:
              "Filter by incident severity. 'Minor' has limited impact, 'Serious' has significant impact, 'Very serious' has critical impact.",
          },
          status: {
            type: "string",
            enum: ["Open", "Investigating", "Mitigated", "Closed"],
            description:
              "Filter by incident status. 'Open' is newly reported, 'Investigating' is being analyzed, 'Mitigated' has been addressed, 'Closed' is fully resolved.",
          },
          approval_status: {
            type: "string",
            enum: ["Approved", "Rejected", "Pending", "Not required"],
            description: "Filter by approval status for incident reports.",
          },
          ai_project: {
            type: "string",
            description: "Filter by AI project name. Supports partial matching.",
          },
          archived: {
            type: "boolean",
            description:
              "Filter by archived status. true = archived incidents, false = active incidents.",
          },
          limit: {
            type: "number",
            description:
              "Maximum number of incidents to return. Default is to return all matching incidents.",
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
];
