export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "fetch_approval_workflows",
      description:
        "Retrieve approval workflows configured for the organization. Returns workflow definitions with their steps and approver assignments. Use this to understand what approval processes exist and how they are structured.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of workflows to return. Default is to return all.",
          },
          offset: {
            type: "number",
            description: "Number of workflows to skip for pagination.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_approval_workflow_detail",
      description:
        "Get full details of a specific approval workflow including all steps, approver assignments, and configuration. Use this to inspect how a particular workflow is set up before submitting or modifying requests.",
      parameters: {
        type: "object",
        properties: {
          workflow_id: {
            type: "number",
            description: "The ID of the approval workflow to retrieve.",
          },
        },
        required: ["workflow_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_pending_approvals",
      description:
        "Retrieve approval requests that are waiting for a specific user's review. Returns requests where the user is an assigned approver on the current active step. Use this to show a user what they need to approve or reject.",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "number",
            description:
              "The user ID to check pending approvals for. If not provided, returns all pending approvals in the organization.",
          },
          limit: {
            type: "number",
            description: "Maximum number of pending approvals to return.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_my_approval_requests",
      description:
        "Retrieve approval requests submitted by the current user or filtered by status. Use this to check the progress of submitted requests or find requests in a specific state.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["Pending", "Approved", "Rejected", "Withdrawn"],
            description: "Filter requests by status.",
          },
          limit: {
            type: "number",
            description: "Maximum number of requests to return.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_approval_request_detail",
      description:
        "Get full details of a specific approval request including its timeline, step statuses, approver decisions, and comments. Use this to inspect the current state and history of an approval request.",
      parameters: {
        type: "object",
        properties: {
          request_id: {
            type: "number",
            description: "The ID of the approval request to retrieve.",
          },
        },
        required: ["request_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_approval_status_for_entity",
      description:
        "Check whether a specific entity (use case, file, etc.) has a pending or rejected approval request. Use this to determine if an entity is blocked by an approval workflow before taking action on it.",
      parameters: {
        type: "object",
        properties: {
          entity_type: {
            type: "string",
            enum: ["use_case", "file"],
            description: "The type of entity to check approval status for.",
          },
          entity_id: {
            type: "number",
            description: "The ID of the entity to check.",
          },
        },
        required: ["entity_type", "entity_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_approval_analytics",
      description:
        "Get comprehensive analytics on approval workflows including request counts by status, average approval times, bottleneck steps, and approver response rates. Use this to understand approval process efficiency and identify areas for improvement.",
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
      name: "get_approval_executive_summary",
      description:
        "Get a high-level executive summary of the approval landscape. Includes total pending requests, overdue approvals, approval rate, average time to completion, and most active workflows. Ideal for quick status checks and leadership reporting.",
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
      name: "agent_create_approval_request",
      description:
        "Submit a new approval request for an entity using a specified workflow. This starts the approval process and notifies the first step's approvers. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          workflow_id: {
            type: "number",
            description: "The ID of the approval workflow to use.",
          },
          entity_type: {
            type: "string",
            enum: ["use_case", "file"],
            description: "The type of entity requiring approval.",
          },
          entity_id: {
            type: "number",
            description: "The ID of the entity requiring approval.",
          },
          notes: {
            type: "string",
            description: "Optional notes or justification for the approval request.",
          },
        },
        required: ["workflow_id", "entity_type", "entity_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_approve_approval_step",
      description:
        "Approve the current step of an approval request. This may advance the request to the next step or mark it as fully approved if it was the last step. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          request_id: {
            type: "number",
            description: "The ID of the approval request.",
          },
          step_id: {
            type: "number",
            description: "The ID of the approval step to approve.",
          },
          comment: {
            type: "string",
            description: "Optional comment or rationale for the approval.",
          },
        },
        required: ["request_id", "step_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_reject_approval_step",
      description:
        "Reject the current step of an approval request. This marks the entire request as rejected and notifies the requester. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          request_id: {
            type: "number",
            description: "The ID of the approval request.",
          },
          step_id: {
            type: "number",
            description: "The ID of the approval step to reject.",
          },
          comment: {
            type: "string",
            description: "Optional comment or reason for the rejection.",
          },
        },
        required: ["request_id", "step_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_withdraw_approval_request",
      description:
        "Withdraw a pending approval request. This cancels the request so it no longer requires approval. Only the original requester should withdraw their own requests. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          request_id: {
            type: "number",
            description: "The ID of the approval request to withdraw.",
          },
        },
        required: ["request_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_create_approval_workflow",
      description:
        "Create a new approval workflow definition with named steps and approver assignments. This defines a reusable approval process that can be applied to entities. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The title/name of the approval workflow.",
          },
          description: {
            type: "string",
            description: "Optional description of the workflow's purpose.",
          },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                step_name: {
                  type: "string",
                  description: "Name of this approval step.",
                },
                description: {
                  type: "string",
                  description: "Description of what this step reviews.",
                },
                approver_ids: {
                  type: "array",
                  items: { type: "number" },
                  description: "User IDs of approvers for this step.",
                },
                requires_all_approvers: {
                  type: "boolean",
                  description: "Whether all approvers must approve (true) or just one (false).",
                },
              },
            },
            description: "Array of workflow steps in order of execution.",
          },
        },
        required: ["name"],
      },
    },
  },
];
