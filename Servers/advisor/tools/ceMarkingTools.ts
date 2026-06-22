export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "get_ce_marking_status",
      description:
        "Get the CE Marking status and conformity assessment progress for a specific project. Returns details including high-risk classification, role in product, Annex III category, declaration status, registration status, and conformity step completion.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "number",
            description: "The project ID to get CE Marking status for.",
          },
        },
        required: ["project_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_update_ce_marking",
      description:
        "Update the CE Marking status for a project. Allows updating the declaration status, registration status, or adding notes. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "number",
            description: "The project ID to update CE Marking for.",
          },
          status: {
            type: "string",
            enum: ["draft", "in_review", "approved", "rejected"],
            description: "The new declaration status for the CE Marking.",
          },
          notes: {
            type: "string",
            description: "Optional notes to add to the CE Marking record.",
          },
        },
        required: ["project_id", "status"],
      },
    },
  },
];
