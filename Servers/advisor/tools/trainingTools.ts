export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "fetch_training_records",
      description:
        "Retrieve and filter training records from the training registry. Use this tool to search for specific training programs based on status, department, or provider. Returns an array of training record objects.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["Planned", "In Progress", "Completed"],
            description: "Filter by training status.",
          },
          department: {
            type: "string",
            description: "Filter by department. Supports partial matching.",
          },
          provider: {
            type: "string",
            description: "Filter by training provider. Supports partial matching.",
          },
          limit: {
            type: "number",
            description: "Maximum number of training records to return.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_training_analytics",
      description:
        "Get comprehensive analytics for training registry data. Use this tool to understand training status distribution, department breakdown, provider statistics, and training coverage. Returns aggregated statistics.",
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
      name: "get_training_executive_summary",
      description:
        "Get a high-level executive summary of training programs. Use this tool for quick overview of completion rates, department coverage, and training gaps. Ideal for answering questions about overall training posture.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];
