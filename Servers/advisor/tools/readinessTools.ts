export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "evaluate_evidence",
      description:
        "Evaluate the evidence strength for a specific control. Returns evidence count, average quality score, and freshness metrics.",
      parameters: {
        type: "object",
        properties: {
          control_id: {
            type: "number",
            description: "The ID of the control to evaluate evidence for.",
          },
          framework_type: {
            type: "string",
            description: "The framework type (e.g., 'eu_ai_act', 'iso_42001').",
          },
        },
        required: ["control_id", "framework_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_task_completion",
      description:
        "Check the completion rate of tasks linked to a specific control. Returns total tasks, completed count, and completion percentage.",
      parameters: {
        type: "object",
        properties: {
          control_id: {
            type: "number",
            description: "The ID of the control to check tasks for.",
          },
          framework_type: {
            type: "string",
            description: "The framework type (e.g., 'eu_ai_act', 'iso_42001').",
          },
        },
        required: ["control_id", "framework_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_risk_status",
      description:
        "Analyze the risk mitigation status for a specific control. Returns linked risks, mitigation rate, and severity breakdown.",
      parameters: {
        type: "object",
        properties: {
          control_id: {
            type: "number",
            description: "The ID of the control to analyze risks for.",
          },
          framework_type: {
            type: "string",
            description: "The framework type (e.g., 'eu_ai_act', 'iso_42001').",
          },
        },
        required: ["control_id", "framework_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_recommendations",
      description:
        "Generate actionable improvement recommendations based on per-control readiness scores. Returns prioritized list of recommendations.",
      parameters: {
        type: "object",
        properties: {
          framework_type: {
            type: "string",
            description: "The framework type to generate recommendations for.",
          },
          project_id: {
            type: "number",
            description: "Optional project ID to scope recommendations.",
          },
          limit: {
            type: "number",
            description: "Maximum number of recommendations to generate (default: 10).",
          },
        },
        required: ["framework_type"],
      },
    },
  },
];
