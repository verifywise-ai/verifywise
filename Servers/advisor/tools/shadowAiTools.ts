export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "get_shadow_ai_summary",
      description:
        "Get a high-level summary of Shadow AI activity across the organization. Returns unique apps discovered, total AI users, highest-risk tool, most active department, and departments using AI. Use this for overview questions about Shadow AI posture.",
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
      name: "get_shadow_ai_tools_by_events",
      description:
        "Get top Shadow AI tools ranked by event count. Returns tool names with their total event counts for a given time period. Use this to identify the most actively used AI tools.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of tools to return. Defaults to 6.",
          },
          time_range: {
            type: "number",
            description: "Number of days to look back. Defaults to 30.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_shadow_ai_tools_by_users",
      description:
        "Get top Shadow AI tools ranked by unique user count. Returns tool names with their distinct user counts for a given time period. Use this to identify the most widely adopted AI tools.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of tools to return. Defaults to 6.",
          },
          time_range: {
            type: "number",
            description: "Number of days to look back. Defaults to 30.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_shadow_ai_trend",
      description:
        "Get Shadow AI trend data over time showing total events, unique users, and new tools discovered per time interval. Ideal for line charts and understanding adoption patterns.",
      parameters: {
        type: "object",
        properties: {
          time_range: {
            type: "number",
            description: "Number of days to look back. Defaults to 90.",
          },
          interval: {
            type: "string",
            enum: ["daily", "weekly", "monthly"],
            description: "Granularity of the trend data. Defaults to daily.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_shadow_ai_users_by_department",
      description:
        "Get Shadow AI user counts grouped by department. Returns department names with unique user counts. Use this for understanding which departments are using AI tools.",
      parameters: {
        type: "object",
        properties: {
          department: {
            type: "string",
            description: "Optional department name to filter by.",
          },
          limit: {
            type: "number",
            description: "Maximum number of departments to return. Defaults to all.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_shadow_ai_user_activity",
      description:
        "Get detailed Shadow AI activity for a specific user, including tools used, event counts, and risk scores. Use this to investigate individual user AI usage.",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "string",
            description: "The user email address to look up activity for.",
          },
        },
        required: ["user_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_shadow_ai_tool_detail",
      description:
        "Get detailed information about a specific Shadow AI tool, including its status, risk score, department breakdown, and top users. Use this to investigate a particular AI tool.",
      parameters: {
        type: "object",
        properties: {
          tool_id: {
            type: "number",
            description: "The ID of the Shadow AI tool to retrieve details for.",
          },
        },
        required: ["tool_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_shadow_ai_alert_history",
      description:
        "Get the history of Shadow AI alerts that have been triggered by rules. Returns fired alerts with their trigger data and actions taken. Use this to review past alerts and rule effectiveness.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of alerts to return. Defaults to 20.",
          },
          rule_id: {
            type: "number",
            description: "Optional rule ID to filter alerts by a specific rule.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_update_shadow_ai_tool_status",
      description:
        "Update the governance status of a Shadow AI tool (approved, blocked, or under_review). This changes how the tool is treated in the organization's AI governance policy. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          tool_id: {
            type: "number",
            description: "The ID of the Shadow AI tool to update.",
          },
          status: {
            type: "string",
            enum: ["approved", "blocked", "under_review"],
            description: "The new governance status for the tool.",
          },
        },
        required: ["tool_id", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_start_shadow_ai_governance",
      description:
        "Initiate a governance review process for a Shadow AI tool. This places the tool under formal review and optionally records governance notes. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          tool_id: {
            type: "number",
            description: "The ID of the Shadow AI tool to begin governance review for.",
          },
          governance_notes: {
            type: "string",
            description: "Optional notes to record for the governance review process.",
          },
        },
        required: ["tool_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_create_shadow_ai_alert_rule",
      description:
        "Create a new alert rule for Shadow AI monitoring. Rules trigger notifications when specified conditions are met (e.g., new tool detected, high-risk usage). Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "A descriptive name for the alert rule.",
          },
          condition: {
            type: "string",
            description:
              "The trigger type/condition for the rule (e.g., 'new_tool_detected', 'high_risk_usage', 'usage_threshold').",
          },
          threshold: {
            type: "number",
            description: "Optional numeric threshold for the condition.",
          },
          notification_channels: {
            type: "array",
            items: { type: "string" },
            description: "Optional list of notification channels (e.g., 'email', 'in_app').",
          },
        },
        required: ["name", "condition"],
      },
    },
  },
];
