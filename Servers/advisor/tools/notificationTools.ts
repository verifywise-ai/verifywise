export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "fetch_notifications",
      description:
        "Retrieve notifications for the current user with optional filters. Returns notifications in reverse chronological order (newest first). Use this to browse the user's notification inbox.",
      parameters: {
        type: "object",
        properties: {
          is_read: {
            type: "boolean",
            description:
              "Filter by read status. Set to true for read notifications, false for unread. Omit to get all notifications.",
          },
          limit: {
            type: "number",
            description: "Maximum number of notifications to return. Default is 50.",
          },
          offset: {
            type: "number",
            description: "Number of notifications to skip for pagination. Default is 0.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_unread_notification_count",
      description:
        "Get the count of unread notifications for the current user. Use this for a quick check of how many unread notifications exist without fetching the full list.",
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
      name: "get_notification_summary",
      description:
        "Get a notification summary including unread count, total count, and the most recent notifications. Ideal for providing a quick overview of the user's notification state, similar to what appears in the bell icon dropdown.",
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
      name: "get_notification_analytics",
      description:
        "Get aggregate analytics about notifications across the organization. Returns statistics such as notification counts by type, entity type distribution, read/unread ratios, and recent activity trends. Useful for understanding notification patterns.",
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
      name: "agent_mark_notification_read",
      description:
        "Mark a specific notification as read. This is a low-impact operation. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          notification_id: {
            type: "number",
            description: "The ID of the notification to mark as read.",
          },
        },
        required: ["notification_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_mark_all_notifications_read",
      description:
        "Mark all unread notifications as read for the current user. This is a low-impact operation. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];
