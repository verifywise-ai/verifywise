export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "get_compliance_score",
      description:
        "Calculate and retrieve the overall AI compliance score for a project or the entire organization. Returns module-level scores for risk management, vendor management, project governance, model lifecycle, and policy documentation.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "number",
            description:
              "Optional project ID to scope the compliance score. If not provided, returns organization-wide compliance score.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_compliance_details",
      description:
        "Get detailed compliance breakdown for a specific project, optionally filtered by framework. Returns component-level scores, data points, and quality metrics for each compliance module.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "number",
            description: "The project ID to get compliance details for.",
          },
          framework_id: {
            type: "number",
            description:
              "Optional framework ID to filter compliance details by a specific framework (e.g., EU AI Act, ISO 42001).",
          },
        },
        required: ["project_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dashboard_overview",
      description:
        "Get a high-level dashboard overview including project counts, training counts, model counts, report counts, and task radar (overdue, due soon, upcoming). Provides a quick snapshot of the organization's AI governance posture.",
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
      name: "get_project_compliance_progress",
      description:
        "Get the compliance progress for a specific project, including framework adoption, control completion rates, and assessment progress.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "number",
            description: "The project ID to get compliance progress for.",
          },
        },
        required: ["project_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_all_projects_compliance",
      description:
        "Get compliance scores for all projects in the organization. Returns a summary list with project names, overall scores, and module breakdowns for comparison across projects.",
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
      name: "get_project_stats",
      description:
        "Get detailed statistics for a specific project including risk counts, vendor counts, model counts, task counts, and compliance metrics.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "number",
            description: "The project ID to get statistics for.",
          },
        },
        required: ["project_id"],
      },
    },
  },
];
