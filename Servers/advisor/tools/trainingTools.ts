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
  {
    type: "function",
    function: {
      name: "agent_create_training_record",
      description:
        "Create a new training record in the training registry. Requires human confirmation before execution.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "The title/name of the training program.",
          },
          description: {
            type: "string",
            description: "Description of the training program.",
          },
          provider: {
            type: "string",
            description: "The training provider or organization.",
          },
          department: {
            type: "string",
            description: "The department this training is for.",
          },
          status: {
            type: "string",
            enum: ["Planned", "In Progress", "Completed"],
            description: "Initial status of the training. Defaults to 'Planned'.",
          },
          due_date: {
            type: "string",
            description: "Due date for the training in ISO format (e.g. '2026-06-30').",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_update_training_record",
      description:
        "Update an existing training record. Requires human confirmation before execution.",
      parameters: {
        type: "object",
        properties: {
          training_id: {
            type: "number",
            description: "The ID of the training record to update.",
          },
          title: {
            type: "string",
            description: "New title/name for the training program.",
          },
          description: {
            type: "string",
            description: "New description for the training program.",
          },
          provider: {
            type: "string",
            description: "New training provider.",
          },
          department: {
            type: "string",
            description: "New department assignment.",
          },
          status: {
            type: "string",
            enum: ["Planned", "In Progress", "Completed"],
            description: "New status for the training record.",
          },
          due_date: {
            type: "string",
            description: "New due date in ISO format.",
          },
        },
        required: ["training_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_assign_training_to_user",
      description:
        "Assign a training program to a specific user. Requires human confirmation before execution.",
      parameters: {
        type: "object",
        properties: {
          training_id: {
            type: "number",
            description: "The ID of the training record to assign.",
          },
          user_id: {
            type: "number",
            description: "The ID of the user to assign the training to.",
          },
        },
        required: ["training_id", "user_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_delete_training_record",
      description:
        "Permanently delete a training record. This action is irreversible. Requires human confirmation before execution.",
      parameters: {
        type: "object",
        properties: {
          training_id: {
            type: "number",
            description: "The ID of the training record to delete.",
          },
        },
        required: ["training_id"],
      },
    },
  },
];
