export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "fetch_risks",
      description:
        "Retrieve and filter risks from the database. Use this tool to search for specific risks based on project, framework, severity, likelihood, category, mitigation status, risk level, or AI lifecycle phase. Returns an array of risk objects matching the specified criteria.",
      parameters: {
        type: "object",
        properties: {
          projectId: {
            type: "number",
            description:
              "Filter risks by project ID. Use this to get risks associated with a specific project.",
          },
          frameworkId: {
            type: "number",
            description:
              "Filter risks by framework ID (e.g., ISO-42001, ISO-27001, EU AI Act). Use this to get risks mapped to a specific compliance framework.",
          },
          severity: {
            type: "string",
            enum: ["Negligible", "Minor", "Moderate", "Major", "Catastrophic"],
            description:
              "Filter by risk severity level. Catastrophic is the highest severity, Negligible is the lowest.",
          },
          likelihood: {
            type: "string",
            enum: ["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"],
            description:
              "Filter by likelihood of occurrence. Almost Certain is the highest probability, Rare is the lowest.",
          },
          category: {
            type: "string",
            description:
              "Filter by risk category (e.g., 'Data Privacy', 'Model Bias', 'Security', 'Performance'). Supports partial matching.",
          },
          mitigationStatus: {
            type: "string",
            enum: [
              "Not Started",
              "In Progress",
              "Completed",
              "On Hold",
              "Deferred",
              "Canceled",
              "Requires review",
            ],
            description:
              "Filter by current mitigation status. Use this to find risks that need attention or have been resolved.",
          },
          riskLevel: {
            type: "string",
            enum: [
              "No risk",
              "Very low risk",
              "Low risk",
              "Medium risk",
              "High risk",
              "Very high risk",
            ],
            description:
              "Filter by auto-calculated risk level (based on severity × likelihood). Use this to find high-priority risks.",
          },
          aiLifecyclePhase: {
            type: "string",
            enum: [
              "Problem definition & planning",
              "Data collection & processing",
              "Model development & training",
              "Model validation & testing",
              "Deployment & integration",
              "Monitoring & maintenance",
              "Decommissioning & retirement",
            ],
            description: "Filter by AI lifecycle phase where the risk occurs.",
          },
          limit: {
            type: "number",
            description:
              "Maximum number of risks to return. Default is to return all matching risks. Use this to get a preview or top N results.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_risk_analytics",
      description:
        "Get comprehensive analytics and distributions for risk data. Use this tool to understand the risk landscape, identify patterns, and generate insights about risk distribution across different dimensions. Returns aggregated statistics, risk matrix data, category breakdowns, and phase distributions.",
      parameters: {
        type: "object",
        properties: {
          projectId: {
            type: "number",
            description:
              "Optional: Scope analytics to a specific project. If not provided, returns analytics for all risks in the tenant.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_executive_summary",
      description:
        "Get a high-level executive summary of the risk landscape. Use this tool for quick overview of critical metrics, urgent risks, mitigation progress, and top risk areas. Ideal for answering questions about overall risk posture, priorities, and what needs immediate attention.",
      parameters: {
        type: "object",
        properties: {
          projectId: {
            type: "number",
            description:
              "Optional: Scope summary to a specific project. If not provided, returns summary for all risks in the tenant.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_risk_history_timeseries",
      description:
        "Get historical timeseries data for risk parameters over a specified timeframe. Use this tool to show trends and changes over time for severity, likelihood, mitigation status, or risk level. Perfect for answering questions about risk trends, historical changes, and how risks have evolved. Returns time-stamped data points that can be visualized as line charts.",
      parameters: {
        type: "object",
        properties: {
          parameter: {
            type: "string",
            enum: ["severity", "likelihood", "mitigation_status", "risk_level"],
            description:
              "The risk parameter to track over time. 'severity' shows how risk severities changed, 'likelihood' tracks probability changes, 'mitigation_status' shows mitigation progress, and 'risk_level' tracks overall risk levels.",
          },
          timeframe: {
            type: "string",
            enum: ["7days", "15days", "1month", "3months", "6months", "1year"],
            description:
              "The time period to analyze. Shorter timeframes (7days, 15days, 1month) show daily data points, while longer timeframes (3months, 6months) show weekly data, and 1year shows monthly data.",
          },
        },
        required: ["parameter", "timeframe"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_create_risk",
      description:
        "Create a new PROJECT-level risk in the project risk register, scoped to a specific project (use case). Use this for organizational/operational risks tied to an AI initiative or project. DO NOT use this for risks specifically about an AI model's performance, bias, security, or data quality — for those, use agent_create_model_risk instead. Requires user confirmation before executing. Returns the created risk object.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "number",
            description: "The project ID to associate the risk with.",
          },
          risk_name: {
            type: "string",
            description: "A concise, descriptive name for the risk.",
          },
          risk_description: {
            type: "string",
            description:
              "Detailed description of the risk, including potential causes and consequences.",
          },
          severity: {
            type: "string",
            enum: ["Negligible", "Minor", "Moderate", "Major", "Catastrophic"],
            description: "The severity level of the risk.",
          },
          likelihood: {
            type: "string",
            enum: ["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"],
            description: "The likelihood of the risk occurring.",
          },
          impact: {
            type: "string",
            description: "Description of the potential impact if the risk materializes.",
          },
          category: {
            type: "string",
            description:
              "Risk category (e.g., 'Data Privacy', 'Model Bias', 'Security', 'Performance').",
          },
          risk_owner: {
            type: "number",
            description: "User ID of the person responsible for managing this risk.",
          },
        },
        required: ["project_id", "risk_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_update_risk",
      description:
        "Update an existing risk's properties. Requires user confirmation before executing. Only the provided fields will be updated.",
      parameters: {
        type: "object",
        properties: {
          risk_id: {
            type: "number",
            description: "The ID of the risk to update.",
          },
          risk_name: {
            type: "string",
            description: "Updated name for the risk.",
          },
          risk_description: {
            type: "string",
            description: "Updated description of the risk.",
          },
          severity: {
            type: "string",
            enum: ["Negligible", "Minor", "Moderate", "Major", "Catastrophic"],
            description: "Updated severity level.",
          },
          likelihood: {
            type: "string",
            enum: ["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"],
            description: "Updated likelihood of occurrence.",
          },
          impact: {
            type: "string",
            description: "Updated impact description.",
          },
          category: {
            type: "string",
            description: "Updated risk category.",
          },
          risk_owner: {
            type: "number",
            description: "Updated risk owner user ID.",
          },
          mitigation_status: {
            type: "string",
            enum: [
              "Not Started",
              "In Progress",
              "Completed",
              "On Hold",
              "Deferred",
              "Canceled",
              "Requires review",
            ],
            description: "Updated mitigation status.",
          },
          mitigation_plan: {
            type: "string",
            description: "Updated mitigation plan.",
          },
        },
        required: ["risk_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_delete_risk",
      description:
        "Soft-delete a risk from the risk register. This marks the risk as deleted but does not permanently remove it. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          risk_id: {
            type: "number",
            description: "The ID of the risk to delete.",
          },
        },
        required: ["risk_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_assign_risk_owner",
      description:
        "Assign or reassign the owner of a risk. This is a low-impact operation that updates who is responsible for managing the risk. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          risk_id: {
            type: "number",
            description: "The ID of the risk to assign an owner to.",
          },
          owner_user_id: {
            type: "number",
            description: "The user ID of the new risk owner.",
          },
        },
        required: ["risk_id", "owner_user_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_change_risk_status",
      description:
        "Change the mitigation status of a risk. Use this to move a risk through its mitigation workflow (e.g., from 'Not Started' to 'In Progress'). Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          risk_id: {
            type: "number",
            description: "The ID of the risk to update.",
          },
          status: {
            type: "string",
            enum: [
              "Not Started",
              "In Progress",
              "Completed",
              "On Hold",
              "Deferred",
              "Canceled",
              "Requires review",
            ],
            description: "The new mitigation status for the risk.",
          },
        },
        required: ["risk_id", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_bulk_update_risk_status",
      description:
        "Update the mitigation status of multiple risks at once. Useful for batch operations like marking several risks as completed or deferred. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          risk_ids: {
            type: "array",
            items: { type: "number" },
            description: "Array of risk IDs to update.",
          },
          status: {
            type: "string",
            enum: [
              "Not Started",
              "In Progress",
              "Completed",
              "On Hold",
              "Deferred",
              "Canceled",
              "Requires review",
            ],
            description: "The new mitigation status to apply to all specified risks.",
          },
        },
        required: ["risk_ids", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_link_risk_to_project",
      description:
        "Link an existing risk to an additional project. This creates an association between the risk and the project without removing existing project links. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          risk_id: {
            type: "number",
            description: "The ID of the risk to link.",
          },
          project_id: {
            type: "number",
            description: "The ID of the project to link the risk to.",
          },
        },
        required: ["risk_id", "project_id"],
      },
    },
  },
];
