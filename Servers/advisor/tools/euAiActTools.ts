export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "get_eu_ai_act_control_categories",
      description:
        "Retrieve all EU AI Act control categories (compliance tracker structure). Returns the list of control category groups defined in the EU AI Act framework. No parameters required.",
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
      name: "get_eu_ai_act_controls_by_category",
      description:
        "Retrieve EU AI Act controls and their subcontrols for a specific control category. Returns the controls with completion statistics (number of subcontrols, number done).",
      parameters: {
        type: "object",
        properties: {
          category_id: {
            type: "number",
            description: "The ID of the control category to retrieve controls for.",
          },
        },
        required: ["category_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_eu_ai_act_project_compliance",
      description:
        "Retrieve the full EU AI Act compliance tracker data for a specific project. Returns all control categories with their controls and subcontrols, showing compliance status for each.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "number",
            description: "The project ID to retrieve EU AI Act compliance data for.",
          },
        },
        required: ["project_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_eu_ai_act_project_assessment",
      description:
        "Retrieve the full EU AI Act assessment tracker data for a specific project. Returns all topics, subtopics, and question/answer pairs showing assessment progress.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "number",
            description: "The project ID to retrieve EU AI Act assessment data for.",
          },
        },
        required: ["project_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_eu_ai_act_compliance_progress",
      description:
        "Get a summary of EU AI Act compliance progress for a project. Returns counts of total vs completed subcontrols and total vs answered assessments.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "number",
            description: "The project ID to get EU AI Act compliance progress for.",
          },
        },
        required: ["project_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_save_eu_ai_act_control",
      description:
        "Update the status and notes of an EU AI Act control for a project. Requires user confirmation before executing. Only updates the specified fields.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "number",
            description: "The project ID the control belongs to.",
          },
          control_id: {
            type: "number",
            description: "The ID of the EU AI Act control to update.",
          },
          status: {
            type: "string",
            enum: ["Not started", "Draft", "In progress", "In review", "Done"],
            description: "The new status for the control.",
          },
          notes: {
            type: "string",
            description: "Implementation details or notes for the control.",
          },
        },
        required: ["project_id", "control_id", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_save_eu_ai_act_assessment_answer",
      description:
        "Update an EU AI Act assessment answer for a project. Requires user confirmation before executing. Sets the answer text for a specific question.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "number",
            description: "The project ID the assessment belongs to.",
          },
          question_id: {
            type: "number",
            description: "The ID of the answer record (answer_id) to update.",
          },
          answer: {
            type: "string",
            description: "The answer text for the assessment question.",
          },
        },
        required: ["project_id", "question_id", "answer"],
      },
    },
  },
];
