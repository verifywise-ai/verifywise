export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "fetch_agent_primitives",
      description:
        "Retrieve and filter discovered agent primitives. Use this tool to search for agents by source system, primitive type, or review status. Returns an array of agent primitive objects.",
      parameters: {
        type: "object",
        properties: {
          source_system: {
            type: "string",
            description:
              "Filter by source system where the agent was discovered (e.g., 'GitHub', 'Azure', 'Manual').",
          },
          primitive_type: {
            type: "string",
            description:
              "Filter by agent primitive type (e.g., 'service_account', 'bot', 'automation').",
          },
          review_status: {
            type: "string",
            enum: ["unreviewed", "confirmed", "rejected"],
            description: "Filter by review status.",
          },
          is_stale: {
            type: "boolean",
            description: "Filter by stale status. Stale agents have not been seen in recent syncs.",
          },
          limit: {
            type: "number",
            description: "Maximum number of agent primitives to return.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_agent_discovery_analytics",
      description:
        "Get comprehensive analytics for discovered agents. Use this tool to understand agent distribution by source system, primitive type, review status, and stale status. Returns aggregated statistics.",
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
      name: "get_agent_discovery_executive_summary",
      description:
        "Get a high-level executive summary of agent discovery. Use this tool for quick overview of total agents, unreviewed count, stale count, and risk indicators. Ideal for understanding your agent landscape at a glance.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];
