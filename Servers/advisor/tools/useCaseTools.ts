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
];
