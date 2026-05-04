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
];
