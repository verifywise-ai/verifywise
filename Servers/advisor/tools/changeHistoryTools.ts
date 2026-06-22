export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "get_risk_change_history",
      description:
        "Retrieve the change history for a specific risk. Shows all modifications made to the risk over time, including who made changes, what fields were modified, and the old/new values. Useful for audit trails and understanding how a risk evolved.",
      parameters: {
        type: "object",
        properties: {
          risk_id: {
            type: "number",
            description: "The ID of the risk to retrieve change history for.",
          },
          limit: {
            type: "number",
            description: "Maximum number of history entries to return. Default is 100.",
          },
          offset: {
            type: "number",
            description: "Number of entries to skip for pagination. Default is 0.",
          },
        },
        required: ["risk_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_vendor_change_history",
      description:
        "Retrieve the change history for a specific vendor. Shows all modifications made to the vendor over time, including field changes, status updates, and who made each change. Useful for vendor audit trails.",
      parameters: {
        type: "object",
        properties: {
          vendor_id: {
            type: "number",
            description: "The ID of the vendor to retrieve change history for.",
          },
          limit: {
            type: "number",
            description: "Maximum number of history entries to return. Default is 100.",
          },
          offset: {
            type: "number",
            description: "Number of entries to skip for pagination. Default is 0.",
          },
        },
        required: ["vendor_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_model_change_history",
      description:
        "Retrieve the change history for a specific model in the model inventory. Shows all modifications over time, including field changes and who made each change. Useful for model governance and audit trails.",
      parameters: {
        type: "object",
        properties: {
          model_id: {
            type: "number",
            description: "The ID of the model to retrieve change history for.",
          },
          limit: {
            type: "number",
            description: "Maximum number of history entries to return. Default is 100.",
          },
          offset: {
            type: "number",
            description: "Number of entries to skip for pagination. Default is 0.",
          },
        },
        required: ["model_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_policy_change_history",
      description:
        "Retrieve the change history for a specific policy. Shows all modifications over time, including status changes, content updates, and who made each change. Useful for policy compliance audits.",
      parameters: {
        type: "object",
        properties: {
          policy_id: {
            type: "number",
            description: "The ID of the policy to retrieve change history for.",
          },
          limit: {
            type: "number",
            description: "Maximum number of history entries to return. Default is 100.",
          },
          offset: {
            type: "number",
            description: "Number of entries to skip for pagination. Default is 0.",
          },
        },
        required: ["policy_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_incident_change_history",
      description:
        "Retrieve the change history for a specific incident. Shows all modifications over time, including status updates, severity changes, and who made each change. Useful for incident investigation and post-mortem reviews.",
      parameters: {
        type: "object",
        properties: {
          incident_id: {
            type: "number",
            description: "The ID of the incident to retrieve change history for.",
          },
          limit: {
            type: "number",
            description: "Maximum number of history entries to return. Default is 100.",
          },
          offset: {
            type: "number",
            description: "Number of entries to skip for pagination. Default is 0.",
          },
        },
        required: ["incident_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_task_change_history",
      description:
        "Retrieve the change history for a specific task. Shows all modifications over time, including status changes, assignee updates, and who made each change. Useful for task tracking and accountability.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "number",
            description: "The ID of the task to retrieve change history for.",
          },
          limit: {
            type: "number",
            description: "Maximum number of history entries to return. Default is 100.",
          },
          offset: {
            type: "number",
            description: "Number of entries to skip for pagination. Default is 0.",
          },
        },
        required: ["task_id"],
      },
    },
  },
];
