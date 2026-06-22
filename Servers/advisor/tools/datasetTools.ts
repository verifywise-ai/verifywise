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
  {
    type: "function",
    function: {
      name: "agent_register_dataset",
      description:
        "Register a new dataset in the system. Requires human confirmation before execution.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The name of the dataset.",
          },
          type: {
            type: "string",
            enum: ["Training", "Validation", "Testing", "Fine-tuning", "Evaluation", "Other"],
            description: "The type/purpose of the dataset.",
          },
          classification: {
            type: "string",
            enum: ["Public", "Internal", "Confidential", "Restricted"],
            description: "Data classification level.",
          },
          description: {
            type: "string",
            description: "Description of the dataset.",
          },
          pii_flag: {
            type: "boolean",
            description: "Whether the dataset contains personally identifiable information.",
          },
          model_id: {
            type: "number",
            description: "Optional model inventory ID to link this dataset to.",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_update_dataset",
      description:
        "Update an existing dataset's metadata. Requires human confirmation before execution.",
      parameters: {
        type: "object",
        properties: {
          dataset_id: {
            type: "number",
            description: "The ID of the dataset to update.",
          },
          name: {
            type: "string",
            description: "New name for the dataset.",
          },
          type: {
            type: "string",
            enum: ["Training", "Validation", "Testing", "Fine-tuning", "Evaluation", "Other"],
            description: "New type/purpose for the dataset.",
          },
          classification: {
            type: "string",
            enum: ["Public", "Internal", "Confidential", "Restricted"],
            description: "New data classification level.",
          },
          description: {
            type: "string",
            description: "New description for the dataset.",
          },
          pii_flag: {
            type: "boolean",
            description: "Whether the dataset contains personally identifiable information.",
          },
          status: {
            type: "string",
            enum: ["Active", "Inactive", "Under Review", "Deprecated"],
            description: "New status for the dataset.",
          },
        },
        required: ["dataset_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_link_dataset_to_model",
      description:
        "Link a dataset to a model inventory entry. Requires human confirmation before execution.",
      parameters: {
        type: "object",
        properties: {
          dataset_id: {
            type: "number",
            description: "The ID of the dataset to link.",
          },
          model_id: {
            type: "number",
            description: "The ID of the model inventory entry to link to.",
          },
        },
        required: ["dataset_id", "model_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_delete_dataset",
      description:
        "Permanently delete a dataset and all its associations. This action is irreversible. Requires human confirmation before execution.",
      parameters: {
        type: "object",
        properties: {
          dataset_id: {
            type: "number",
            description: "The ID of the dataset to delete.",
          },
        },
        required: ["dataset_id"],
      },
    },
  },
];
