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
  {
    type: "function",
    function: {
      name: "agent_create_task",
      description:
        "Create a new task in the task management system. Requires human confirmation before execution.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "The title of the task.",
          },
          description: {
            type: "string",
            description: "Detailed description of the task.",
          },
          status: {
            type: "string",
            enum: ["Open", "In Progress", "Completed"],
            description: "Initial status. Defaults to 'Open'.",
          },
          priority: {
            type: "string",
            enum: ["Low", "Medium", "High"],
            description: "Priority level. Defaults to 'Medium'.",
          },
          category: {
            type: "string",
            description: "Category to assign to the task.",
          },
          assigned_to: {
            type: "number",
            description: "User ID to assign the task to.",
          },
          due_date: {
            type: "string",
            description: "Due date in ISO 8601 format (e.g., '2026-04-30').",
          },
          project_id: {
            type: "number",
            description: "Project ID to link the task to.",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_update_task",
      description:
        "Update an existing task's fields. Requires human confirmation before execution.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "number",
            description: "The ID of the task to update.",
          },
          title: {
            type: "string",
            description: "New title for the task.",
          },
          description: {
            type: "string",
            description: "New description for the task.",
          },
          status: {
            type: "string",
            enum: ["Open", "In Progress", "Completed"],
            description: "New status for the task.",
          },
          priority: {
            type: "string",
            enum: ["Low", "Medium", "High"],
            description: "New priority level.",
          },
          category: {
            type: "string",
            description: "New category for the task.",
          },
          due_date: {
            type: "string",
            description: "New due date in ISO 8601 format.",
          },
        },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_assign_task",
      description:
        "Assign a task to a specific user. Requires human confirmation before execution.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "number",
            description: "The ID of the task to assign.",
          },
          assigned_to: {
            type: "number",
            description: "The user ID to assign the task to.",
          },
        },
        required: ["task_id", "assigned_to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_update_task_status",
      description: "Update the status of a task. Requires human confirmation before execution.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "number",
            description: "The ID of the task to update.",
          },
          status: {
            type: "string",
            enum: ["Open", "In Progress", "Completed"],
            description: "The new status for the task.",
          },
        },
        required: ["task_id", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_set_task_priority",
      description:
        "Set the priority level of a task. Requires human confirmation before execution.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "number",
            description: "The ID of the task to update.",
          },
          priority: {
            type: "string",
            enum: ["Low", "Medium", "High"],
            description: "The new priority level.",
          },
        },
        required: ["task_id", "priority"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_delete_task",
      description:
        "Delete (archive) a task. This is a soft delete that can be reversed. Requires human confirmation before execution.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "number",
            description: "The ID of the task to delete.",
          },
        },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_restore_task",
      description:
        "Restore a previously deleted (archived) task back to Open status. Requires human confirmation before execution.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "number",
            description: "The ID of the task to restore.",
          },
        },
        required: ["task_id"],
      },
    },
  },
];
