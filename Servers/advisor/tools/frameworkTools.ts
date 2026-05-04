export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "fetch_frameworks",
      description:
        "Retrieve all compliance frameworks with their control and project counts. Use this tool to list frameworks, see which projects use them, and understand the compliance landscape.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of frameworks to return.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_framework_analytics",
      description:
        "Get analytics about framework adoption and coverage. Use this tool to understand which frameworks are most used, project coverage statistics, and framework comparison data.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];
