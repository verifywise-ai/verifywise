export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "fetch_users",
      description:
        "Retrieve users in the organization. Supports filtering by role and status. Returns user details including name, email, role, and last login.",
      parameters: {
        type: "object",
        properties: {
          role: {
            type: "string",
            enum: ["Admin", "Reviewer", "Editor", "Auditor"],
            description: "Optional role to filter users by.",
          },
          status: {
            type: "string",
            enum: ["active", "inactive"],
            description: "Optional status to filter users by.",
          },
          limit: {
            type: "number",
            description: "Maximum number of users to return. Default returns all.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_detail",
      description:
        "Get detailed information about a specific user including their profile, role, projects they are a member of, and activity summary.",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "number",
            description: "The ID of the user to get details for.",
          },
        },
        required: ["user_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_progress",
      description:
        "Get progress metrics for a specific user including tasks assigned, tasks completed, risks owned, and project participation.",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "number",
            description: "The ID of the user to get progress for.",
          },
        },
        required: ["user_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_roles",
      description:
        "Retrieve all available roles in the system including their names, descriptions, and permission levels.",
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
      name: "get_organization_detail",
      description:
        "Get detailed information about the current organization including name, creation date, member count, and subscription status.",
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
      name: "fetch_invitations",
      description:
        "Retrieve pending and past invitations for the organization. Supports filtering by status.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["pending", "accepted", "expired", "revoked"],
            description: "Optional status to filter invitations by.",
          },
          limit: {
            type: "number",
            description: "Maximum number of invitations to return. Default returns all.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_subscription_info",
      description:
        "Get the current subscription information for the organization including tier, status, start date, and end date.",
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
      name: "fetch_auto_drivers",
      description:
        "Retrieve auto driver configurations for the organization. Auto drivers automate data seeding and demo setup tasks.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of auto drivers to return.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_slack_webhooks",
      description:
        "Retrieve all configured Slack webhooks for the organization. Returns webhook details including channel, team, and active status.",
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
      name: "agent_send_invitation",
      description:
        "Send an invitation email to a new user to join the organization with a specific role. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          email: {
            type: "string",
            description: "The email address to send the invitation to.",
          },
          role_id: {
            type: "number",
            description:
              "The role ID to assign to the invited user (1=Admin, 2=Reviewer, 3=Editor, 4=Auditor).",
          },
          name: {
            type: "string",
            description: "Optional name of the person being invited.",
          },
        },
        required: ["email", "role_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_run_auto_driver",
      description:
        "Trigger an auto driver to execute its configured automation task. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          driver_id: {
            type: "number",
            description: "The ID of the auto driver to run.",
          },
        },
        required: ["driver_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_send_slack_test_message",
      description:
        "Send a test message to a configured Slack webhook to verify the integration is working. This is a low-impact operation. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          webhook_id: {
            type: "number",
            description: "The ID of the Slack webhook to send the test message to.",
          },
          message: {
            type: "string",
            description:
              "Optional custom message to send. If not provided, a default test message will be sent.",
          },
        },
        required: ["webhook_id"],
      },
    },
  },
];
