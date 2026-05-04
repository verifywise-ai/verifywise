export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "fetch_datasets",
      description:
        "Retrieve and filter datasets from the database. Use this tool to search for specific datasets based on type, classification, PII status, or dataset status. Returns an array of dataset objects matching the specified criteria.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["Training", "Validation", "Testing", "Fine-tuning", "Evaluation", "Other"],
            description: "Filter by dataset type/purpose.",
          },
          classification: {
            type: "string",
            enum: ["Public", "Internal", "Confidential", "Restricted"],
            description: "Filter by data classification level.",
          },
          contains_pii: {
            type: "boolean",
            description:
              "Filter by whether the dataset contains personally identifiable information.",
          },
          status: {
            type: "string",
            enum: ["Active", "Inactive", "Under Review", "Deprecated"],
            description: "Filter by dataset status.",
          },
          limit: {
            type: "number",
            description: "Maximum number of datasets to return.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dataset_analytics",
      description:
        "Get comprehensive analytics and distributions for dataset data. Use this tool to understand dataset landscape, type distribution, classification breakdown, PII exposure, and bias flags. Returns aggregated statistics.",
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
      name: "get_dataset_executive_summary",
      description:
        "Get a high-level executive summary of datasets. Use this tool for quick overview of total datasets, PII exposure rate, classification breakdown, and datasets with known biases. Ideal for data governance questions.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];
