export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "fetch_tasks",
      description:
        "Retrieve and filter tasks from the task management system. Use this tool to search for specific tasks based on status, priority, due date, category, or assignee. Returns an array of task objects matching the specified criteria.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["Open", "In Progress", "Completed"],
            description:
              "Filter by task status. 'Open' is new/unstarted, 'In Progress' is actively being worked on, 'Completed' is finished. Use 'overdue_only' parameter to filter overdue tasks.",
          },
          priority: {
            type: "string",
            enum: ["Low", "Medium", "High"],
            description: "Filter by task priority level.",
          },
          category: {
            type: "string",
            description: "Filter by task category. Supports partial matching.",
          },
          overdue_only: {
            type: "boolean",
            description: "Set to true to only return tasks that are past their due date.",
          },
          limit: {
            type: "number",
            description:
              "Maximum number of tasks to return. Default is to return all matching tasks.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_task_analytics",
      description:
        "Get comprehensive analytics and distributions for task data. Use this tool to understand task workload, identify patterns, and generate insights about task distribution across different dimensions. Returns aggregated statistics including status distribution, priority breakdown, category distribution, assignee workload, and overdue task analysis.",
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
      name: "get_task_executive_summary",
      description:
        "Get a high-level executive summary of the task landscape. Use this tool for quick overview of total tasks, status breakdown, overdue tasks, priority distribution, and tasks needing attention. Ideal for answering questions about overall task progress, workload, and areas needing immediate attention.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];
