export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "get_nist_functions",
      description:
        "Retrieve all NIST AI RMF functions (GOVERN, MAP, MEASURE, MANAGE) with their categories. Returns the top-level function structure of the NIST AI Risk Management Framework. No parameters required.",
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
      name: "get_nist_categories_by_function",
      description:
        "Retrieve NIST AI RMF categories for a specific function. Returns category details including ID, description, and order number.",
      parameters: {
        type: "object",
        properties: {
          function_id: {
            type: "string",
            enum: ["GOVERN", "MAP", "MEASURE", "MANAGE"],
            description: "The NIST AI RMF function identifier to retrieve categories for.",
          },
        },
        required: ["function_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_nist_subcategory_detail",
      description:
        "Retrieve detailed information for a specific NIST AI RMF subcategory implementation record. Returns the subcategory with its status, owner, implementation description, and evidence links.",
      parameters: {
        type: "object",
        properties: {
          subcategory_id: {
            type: "number",
            description: "The ID of the subcategory implementation record to retrieve.",
          },
        },
        required: ["subcategory_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_nist_progress",
      description:
        "Get a summary of NIST AI RMF compliance progress for a project. Returns counts of total vs completed subcategories and total vs assigned subcategories.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "number",
            description: "The project ID to get NIST AI RMF progress for.",
          },
        },
        required: ["project_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_nist_progress_by_function",
      description:
        "Get NIST AI RMF compliance progress broken down by a specific function for a project. Returns subcategories grouped under their categories for the specified function, with status information.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "number",
            description: "The project ID to get NIST AI RMF progress for.",
          },
          function_id: {
            type: "string",
            enum: ["GOVERN", "MAP", "MEASURE", "MANAGE"],
            description: "The NIST AI RMF function to filter progress by.",
          },
        },
        required: ["project_id", "function_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_nist_status_breakdown",
      description:
        "Get a breakdown of NIST AI RMF subcategory statuses for a project. Returns the count of subcategories in each status (Not started, Draft, In progress, In review, Implemented).",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "number",
            description: "The project ID to get NIST AI RMF status breakdown for.",
          },
        },
        required: ["project_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_update_nist_subcategory",
      description:
        "Update a NIST AI RMF subcategory implementation for a project. Requires user confirmation before executing. Updates status, implementation description, and auditor feedback.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "number",
            description: "The project ID the subcategory belongs to (used for validation).",
          },
          subcategory_id: {
            type: "number",
            description: "The ID of the subcategory implementation record to update.",
          },
          status: {
            type: "string",
            enum: ["Not started", "Draft", "In progress", "In review", "Implemented"],
            description: "The new status for the subcategory.",
          },
          notes: {
            type: "string",
            description: "Implementation description for the subcategory.",
          },
          evidence: {
            type: "string",
            description: "Auditor feedback or evidence notes.",
          },
        },
        required: ["project_id", "subcategory_id"],
      },
    },
  },
];
