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
];
