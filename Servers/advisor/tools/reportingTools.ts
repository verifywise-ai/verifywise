export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "fetch_reports",
      description:
        "Retrieve generated reports from the reporting system. Use this tool to list available reports with their type, project, and generation date. Returns an array of report metadata objects.",
      parameters: {
        type: "object",
        properties: {
          source: {
            type: "string",
            description:
              "Filter by report source/type (e.g., 'Project risks report', 'Compliance tracker report', 'Vendors and risks report'). Supports partial matching.",
          },
          limit: {
            type: "number",
            description: "Maximum number of reports to return.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_reporting_analytics",
      description:
        "Get analytics about generated reports. Use this tool to understand report counts by type, generation frequency, and project coverage. Returns aggregated statistics.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];
