export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "fetch_policies",
      description:
        "Retrieve and filter policies from the policy management system. Use this tool to search for specific policies based on status, tags, review date, or author. Returns an array of policy objects matching the specified criteria.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["Draft", "Under Review", "Approved", "Published", "Archived", "Deprecated"],
            description:
              "Filter by policy status. 'Draft' is work in progress, 'Under Review' is being reviewed, 'Approved' is approved but not yet published, 'Published' is active and in effect, 'Archived' is no longer active, 'Deprecated' is obsolete.",
          },
          tag: {
            type: "string",
            enum: [
              "AI ethics",
              "Fairness",
              "Transparency",
              "Explainability",
              "Bias mitigation",
              "Privacy",
              "Data governance",
              "Model risk",
              "Accountability",
              "Security",
              "LLM",
              "Human oversight",
              "EU AI Act",
              "ISO 42001",
              "NIST RMF",
              "Red teaming",
              "Audit",
              "Monitoring",
              "Vendor management",
            ],
            description: "Filter by policy tag. Returns policies that include this tag.",
          },
          review_due_days: {
            type: "number",
            description:
              "Filter to policies with next_review_date within this many days from now. E.g., 30 returns policies due for review in the next 30 days.",
          },
          overdue_review: {
            type: "boolean",
            description: "Set to true to only return policies that are past their review date.",
          },
          limit: {
            type: "number",
            description:
              "Maximum number of policies to return. Default is to return all matching policies.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_policy_analytics",
      description:
        "Get comprehensive analytics and distributions for policy data. Use this tool to understand policy coverage, identify gaps, and generate insights about policy distribution across different dimensions. Returns aggregated statistics including status distribution, tag distribution, review schedule analysis, and author workload.",
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
      name: "get_policy_executive_summary",
      description:
        "Get a high-level executive summary of the policy landscape. Use this tool for quick overview of total policies, status breakdown, upcoming reviews, tag coverage, and policies needing attention. Ideal for answering questions about overall policy health, compliance coverage, and areas needing immediate attention.",
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
      name: "search_policy_templates",
      description:
        "Search the library of policy templates. Use this tool to help users find relevant policy templates by category or tag. Templates provide starting points for creating new policies based on best practices and regulatory requirements. The library includes the built-in system templates plus templates the organization has created or duplicated for its own use.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: [
              "Core AI governance policies",
              "Model lifecycle policies",
              "Data and security AI policies",
              "Legal and compliance",
              "People and organization",
              "Industry packs",
            ],
            description: "Filter templates by category.",
          },
          tag: {
            type: "string",
            description: "Filter templates by tag. Supports partial matching.",
          },
          search: {
            type: "string",
            description: "Search templates by title or description. Supports partial matching.",
          },
          limit: {
            type: "number",
            description: "Maximum number of templates to return. Default is 10.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_template_recommendations",
      description:
        "Get policy template recommendations based on the organization's current policy coverage. Analyzes existing policies and suggests templates that could fill gaps in coverage. Use this to help users identify which policy areas they should consider adding.",
      parameters: {
        type: "object",
        properties: {
          focus_area: {
            type: "string",
            enum: [
              "AI ethics",
              "Fairness",
              "Transparency",
              "Explainability",
              "Bias mitigation",
              "Privacy",
              "Data governance",
              "Model risk",
              "Accountability",
              "Security",
              "LLM",
              "Human oversight",
              "EU AI Act",
              "ISO 42001",
              "NIST RMF",
              "Red teaming",
              "Audit",
              "Monitoring",
              "Vendor management",
            ],
            description: "Optional focus area to prioritize in recommendations.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_policy_review_status",
      description:
        "Get the approval state of one policy: the pending approval request (workflow, current step, who requested it), the last approval decision with its comment, the organization's usable policy approval workflows, and whether the current user can submit it for approval, approve it directly or withdraw the request. Use this before suggesting agent_submit_policy_for_review or agent_approve_policy_review.",
      parameters: {
        type: "object",
        properties: {
          policy_id: {
            type: "number",
            description: "The ID of the policy.",
          },
        },
        required: ["policy_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_create_policy",
      description:
        "Create a new policy in the policy management system. Requires human confirmation before execution.",
      parameters: {
        type: "object",
        properties: {
          policy_name: {
            type: "string",
            description: "The title/name of the policy.",
          },
          description: {
            type: "string",
            description: "HTML content/description of the policy.",
          },
          status: {
            type: "string",
            enum: ["Draft", "Archived", "Deprecated"],
            description:
              "Initial status. Defaults to 'Draft'. A policy reaches Under Review, Approved and Published only through the approval flow.",
          },
          tags: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "AI ethics",
                "Fairness",
                "Transparency",
                "Explainability",
                "Bias mitigation",
                "Privacy",
                "Data governance",
                "Model risk",
                "Accountability",
                "Security",
                "LLM",
                "Human oversight",
                "EU AI Act",
                "ISO 42001",
                "NIST RMF",
                "Red teaming",
                "Audit",
                "Monitoring",
                "Vendor management",
              ],
            },
            description: "Tags to categorize the policy.",
          },
          review_date: {
            type: "string",
            description: "Next review date in ISO 8601 format (e.g., '2026-06-30').",
          },
          project_id: {
            type: "number",
            description: "Project ID to associate the policy with.",
          },
        },
        required: ["policy_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_update_policy",
      description:
        "Update an existing policy's fields. Requires human confirmation before execution. While the policy has a pending approval request its title and content cannot change (the request must be withdrawn first); other fields can.",
      parameters: {
        type: "object",
        properties: {
          policy_id: {
            type: "number",
            description: "The ID of the policy to update.",
          },
          policy_name: {
            type: "string",
            description: "New title/name for the policy.",
          },
          description: {
            type: "string",
            description: "New HTML content/description for the policy.",
          },
          status: {
            type: "string",
            enum: ["Draft", "Published", "Archived", "Deprecated"],
            description:
              "New status for the policy. Published only from Approved. Use agent_submit_policy_for_review to put a policy under review; Approved comes only from the approval workflow or an Admin's direct approval. The status cannot change while an approval request is pending.",
          },
          tags: {
            type: "array",
            items: {
              type: "string",
            },
            description: "New tags for the policy.",
          },
          review_date: {
            type: "string",
            description: "New next review date in ISO 8601 format.",
          },
        },
        required: ["policy_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_submit_policy_for_review",
      description:
        "Submit a Draft or Under Review policy for approval: opens an approval request on the organization's policy approval workflow and sets the policy to 'Under Review'. The workflow's approvers then approve or reject it. Fails when a request is already pending or the organization has no policy approval workflow (then an Admin approves directly with agent_approve_policy_review). Requires human confirmation before execution.",
      parameters: {
        type: "object",
        properties: {
          policy_id: {
            type: "number",
            description: "The ID of the policy to submit for approval.",
          },
          workflow_id: {
            type: "number",
            description:
              "The policy approval workflow to use. Required only when the organization has more than one; omit it otherwise.",
          },
        },
        required: ["policy_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_approve_policy_review",
      description:
        "An Admin approves a Draft or Under Review policy directly, setting it to 'Approved'. Allowed only when the organization has no policy approval workflow; otherwise the policy is decided through its approval request (agent_approve_approval_step). Requires human confirmation before execution.",
      parameters: {
        type: "object",
        properties: {
          policy_id: {
            type: "number",
            description: "The ID of the policy to approve.",
          },
          approval_notes: {
            type: "string",
            description: "Optional notes for the approval.",
          },
        },
        required: ["policy_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_delete_policy",
      description:
        "Delete a policy from the system. This is an irreversible operation. Requires human confirmation before execution.",
      parameters: {
        type: "object",
        properties: {
          policy_id: {
            type: "number",
            description: "The ID of the policy to delete.",
          },
        },
        required: ["policy_id"],
      },
    },
  },
];
