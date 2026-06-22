export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "fetch_evidence",
      description:
        "Retrieve and filter evidence items from the evidence hub. Use this tool to search for specific evidence based on type or expiry status. Returns an array of evidence objects.",
      parameters: {
        type: "object",
        properties: {
          evidence_type: {
            type: "string",
            description:
              "Filter by evidence type (e.g., 'Audit Report', 'Test Results', 'Certification'). Supports partial matching.",
          },
          expired_only: {
            type: "boolean",
            description: "Set to true to only return evidence that has expired.",
          },
          expiring_soon: {
            type: "boolean",
            description: "Set to true to only return evidence expiring within the next 30 days.",
          },
          limit: {
            type: "number",
            description: "Maximum number of evidence items to return.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_evidence_analytics",
      description:
        "Get comprehensive analytics for evidence hub data. Use this tool to understand evidence type distribution, expiry status breakdown, and model coverage. Returns aggregated statistics.",
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
      name: "get_evidence_executive_summary",
      description:
        "Get a high-level executive summary of evidence. Use this tool for quick overview of total evidence, expired items, expiring-soon items, and coverage gaps. Ideal for compliance readiness questions.",
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
      name: "agent_create_evidence",
      description:
        "Create a new evidence item in the evidence hub. Evidence items document compliance artifacts such as audit reports, test results, and certifications. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "A descriptive name for the evidence item.",
          },
          type: {
            type: "string",
            description:
              "The type of evidence (e.g., 'Audit Report', 'Test Results', 'Certification', 'Policy Document').",
          },
          description: {
            type: "string",
            description: "Detailed description of the evidence item.",
          },
          model_id: {
            type: "number",
            description: "Optional model ID to map this evidence to a specific AI model.",
          },
          expiry_date: {
            type: "string",
            description:
              "Optional expiry date in ISO 8601 format (e.g., '2025-12-31'). Leave empty for non-expiring evidence.",
          },
        },
        required: ["name", "type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_update_evidence",
      description:
        "Update an existing evidence item's properties. Only the provided fields will be updated. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          evidence_id: {
            type: "number",
            description: "The ID of the evidence item to update.",
          },
          name: {
            type: "string",
            description: "Updated name for the evidence item.",
          },
          type: {
            type: "string",
            description: "Updated evidence type.",
          },
          description: {
            type: "string",
            description: "Updated description.",
          },
          expiry_date: {
            type: "string",
            description:
              "Updated expiry date in ISO 8601 format, or empty string to remove expiry.",
          },
        },
        required: ["evidence_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_delete_evidence",
      description:
        "Delete an evidence item from the evidence hub. This permanently removes the evidence and its file associations. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          evidence_id: {
            type: "number",
            description: "The ID of the evidence item to delete.",
          },
        },
        required: ["evidence_id"],
      },
    },
  },
];
