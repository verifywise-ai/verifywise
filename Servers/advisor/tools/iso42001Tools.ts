export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "get_iso42001_clauses_structure",
      description:
        "Retrieve the ISO 42001 clauses structure (management system clauses). Returns all clause definitions from the framework struct tables. No parameters required.",
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
      name: "get_iso42001_annexes_structure",
      description:
        "Retrieve the ISO 42001 annexes structure (Annex A reference controls). Returns all annex definitions from the framework struct tables. No parameters required.",
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
      name: "get_iso42001_project_clauses",
      description:
        "Retrieve all ISO 42001 clauses with their subclauses for a specific project. Returns clause structure with implementation status, owners, and completion data for each subclause.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "number",
            description: "The project ID to retrieve ISO 42001 clause data for.",
          },
        },
        required: ["project_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_iso42001_project_annexes",
      description:
        "Retrieve all ISO 42001 annexes with their annex categories for a specific project. Returns annex structure with applicability, implementation status, and evidence links for each annex category.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "number",
            description: "The project ID to retrieve ISO 42001 annex data for.",
          },
        },
        required: ["project_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_iso42001_progress",
      description:
        "Get a summary of ISO 42001 compliance progress for a project. Returns counts of total vs completed subclauses and total vs completed annex categories.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "number",
            description: "The project ID to get ISO 42001 progress for.",
          },
        },
        required: ["project_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_save_iso42001_clauses",
      description:
        "Update an ISO 42001 subclause implementation for a project. Requires user confirmation before executing. Updates status, evidence notes, and implementation description.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "number",
            description: "The project ID the subclause belongs to.",
          },
          clause_id: {
            type: "number",
            description: "The ID of the subclause implementation record to update.",
          },
          status: {
            type: "string",
            enum: ["Not started", "Draft", "In progress", "In review", "Implemented"],
            description: "The new status for the subclause.",
          },
          evidence: {
            type: "string",
            description: "Auditor feedback or evidence notes.",
          },
          notes: {
            type: "string",
            description: "Implementation description for the subclause.",
          },
        },
        required: ["project_id", "clause_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_save_iso42001_annexes",
      description:
        "Update an ISO 42001 annex category implementation for a project. Requires user confirmation before executing. Updates status, applicability, evidence, and implementation description.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "number",
            description: "The project ID the annex category belongs to.",
          },
          annex_id: {
            type: "number",
            description: "The ID of the annex category implementation record to update.",
          },
          status: {
            type: "string",
            enum: ["Not started", "Draft", "In progress", "In review", "Implemented"],
            description: "The new status for the annex category.",
          },
          evidence: {
            type: "string",
            description: "Auditor feedback or evidence notes.",
          },
          notes: {
            type: "string",
            description: "Implementation description for the annex category.",
          },
        },
        required: ["project_id", "annex_id"],
      },
    },
  },
];
