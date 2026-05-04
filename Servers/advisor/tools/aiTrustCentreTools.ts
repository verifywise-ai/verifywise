export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "fetch_trust_center_overview",
      description:
        "Get the AI Trust Center configuration including visibility settings, published resources, and subprocessors. Use this tool to understand what is publicly visible and configured in the trust center.",
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
      name: "get_trust_center_analytics",
      description:
        "Get analytics about the AI Trust Center. Use this tool to understand resource counts, subprocessor statistics, visibility status of sections, and overall trust center completeness.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];
