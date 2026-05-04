export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "fetch_model_risks",
      description:
        "Retrieve and filter model-specific risks. Use this tool to search for risks associated with AI models based on category, level, status, owner, or model. Returns an array of model risk objects matching the specified criteria.",
      parameters: {
        type: "object",
        properties: {
          modelId: {
            type: "number",
            description:
              "Filter risks by model ID. Use this to get risks associated with a specific AI model.",
          },
          risk_category: {
            type: "string",
            enum: ["Performance", "Bias & Fairness", "Security", "Data Quality", "Compliance"],
            description:
              "Filter by risk category. 'Performance' for model performance issues, 'Bias & Fairness' for fairness concerns, 'Security' for security vulnerabilities, 'Data Quality' for data-related risks, 'Compliance' for regulatory compliance risks.",
          },
          risk_level: {
            type: "string",
            enum: ["Low", "Medium", "High", "Critical"],
            description:
              "Filter by risk severity level. 'Critical' requires immediate action, 'High' needs urgent attention, 'Medium' should be monitored, 'Low' is acceptable.",
          },
          status: {
            type: "string",
            enum: ["Open", "In Progress", "Resolved", "Accepted"],
            description:
              "Filter by risk status. 'Open' not yet addressed, 'In Progress' being mitigated, 'Resolved' successfully addressed, 'Accepted' risk accepted as-is.",
          },
          owner: {
            type: "string",
            description: "Filter by risk owner name. Supports partial matching.",
          },
          limit: {
            type: "number",
            description:
              "Maximum number of risks to return. Default is to return all matching risks. Use this to get a preview or top N results.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_model_risk_analytics",
      description:
        "Get comprehensive analytics and distributions for model risk data. Use this tool to understand the model risk landscape, identify patterns, and generate insights about risk distribution across different dimensions. Returns aggregated statistics including category distribution, level breakdown, status distribution, owner analysis, and risks by model.",
      parameters: {
        type: "object",
        properties: {
          modelId: {
            type: "number",
            description:
              "Optional: Scope analytics to a specific model. If not provided, returns analytics for all model risks in the tenant.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_model_risk_executive_summary",
      description:
        "Get a high-level executive summary of the model risk landscape. Use this tool for quick overview of total risks, severity breakdown, status progress, top categories, risks needing attention, and owner distribution. Ideal for answering questions about overall model risk posture, what needs attention, and risk mitigation progress.",
      parameters: {
        type: "object",
        properties: {
          modelId: {
            type: "number",
            description:
              "Optional: Scope summary to a specific model. If not provided, returns summary for all model risks in the tenant.",
          },
        },
        required: [],
      },
    },
  },
];
