export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "fetch_automations",
      description:
        "Retrieve automations configured for the organization. Returns automation rules with their trigger types and action configurations. Use this to see what automations exist and whether they are active.",
      parameters: {
        type: "object",
        properties: {
          is_active: {
            type: "boolean",
            description:
              "Filter by active/inactive status. If not provided, returns all automations.",
          },
          limit: {
            type: "number",
            description: "Maximum number of automations to return. Default is to return all.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_automation_detail",
      description:
        "Get full details of a specific automation including its trigger configuration, action chain, and execution parameters. Use this to inspect how a particular automation is set up.",
      parameters: {
        type: "object",
        properties: {
          automation_id: {
            type: "number",
            description: "The ID of the automation to retrieve.",
          },
        },
        required: ["automation_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_automation_triggers",
      description:
        "List all available automation trigger types. Returns the catalog of events that can start an automation (e.g., risk created, control updated, approval completed). Use this when building or modifying automations to see what triggers are available.",
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
      name: "get_automation_history",
      description:
        "Get execution history and logs for automations. Shows when automations were triggered, what actions ran, and whether they succeeded or failed. Use this to debug automation issues or audit past executions.",
      parameters: {
        type: "object",
        properties: {
          automation_id: {
            type: "number",
            description:
              "Filter history to a specific automation. If not provided, returns history for all automations.",
          },
          limit: {
            type: "number",
            description: "Maximum number of history entries to return. Default is 50.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_automation_stats",
      description:
        "Get summary statistics for automations including active count, total executions, success/failure rates, and last execution times. Use this for a quick health check on the automation system.",
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
      name: "get_automation_analytics",
      description:
        "Get detailed analytics on automations including trigger type distribution, action type usage, execution frequency over time, and error patterns. Use this to understand automation usage patterns and optimize the automation setup.",
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
      name: "get_automation_executive_summary",
      description:
        "Get a high-level executive summary of the automation landscape. Includes total automations, active vs inactive ratio, most-used triggers, recent execution stats, and any automations that may need attention. Ideal for quick status checks and leadership reporting.",
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
      name: "agent_create_automation",
      description:
        "Create a new automation rule with a trigger and action chain. The automation will execute its actions when the specified trigger event occurs. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "A descriptive name for the automation.",
          },
          trigger_id: {
            type: "number",
            description:
              "The ID of the trigger type (from fetch_automation_triggers) that starts this automation.",
          },
          actions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                action_type_id: {
                  type: "number",
                  description: "The ID of the action type to execute.",
                },
                params: {
                  type: "object",
                  description: "Parameters for this action (varies by action type).",
                },
              },
            },
            description: "Array of actions to execute in order when the trigger fires.",
          },
          is_active: {
            type: "boolean",
            description: "Whether the automation should be active immediately. Defaults to true.",
          },
        },
        required: ["name", "trigger_id", "actions"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_update_automation",
      description:
        "Update an existing automation's name, trigger, actions, or active status. Only the provided fields will be updated. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          automation_id: {
            type: "number",
            description: "The ID of the automation to update.",
          },
          name: {
            type: "string",
            description: "Updated name for the automation.",
          },
          trigger_id: {
            type: "number",
            description: "Updated trigger type ID.",
          },
          actions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                action_type_id: {
                  type: "number",
                  description: "The ID of the action type to execute.",
                },
                params: {
                  type: "object",
                  description: "Parameters for this action.",
                },
              },
            },
            description: "Updated array of actions. Replaces the entire action chain.",
          },
          is_active: {
            type: "boolean",
            description: "Updated active status.",
          },
        },
        required: ["automation_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_toggle_automation",
      description:
        "Enable or disable an automation. This is a lightweight operation that changes only the active status without modifying any other configuration. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          automation_id: {
            type: "number",
            description: "The ID of the automation to toggle.",
          },
          is_active: {
            type: "boolean",
            description: "Set to true to enable, false to disable the automation.",
          },
        },
        required: ["automation_id", "is_active"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_delete_automation",
      description:
        "Permanently delete an automation and all its action configurations. This cannot be undone. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          automation_id: {
            type: "number",
            description: "The ID of the automation to delete.",
          },
        },
        required: ["automation_id"],
      },
    },
  },
];
