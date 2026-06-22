export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "fetch_notes",
      description:
        "Retrieve and filter notes from the database. Use this tool to search for notes by entity type, entity ID, author, or a combination. Returns an array of note objects matching the specified criteria.",
      parameters: {
        type: "object",
        properties: {
          entity_type: {
            type: "string",
            description:
              "Filter notes by the entity type they are attached to (e.g., 'risk', 'vendor', 'model_inventory', 'policy', 'task', 'incident').",
          },
          entity_id: {
            type: "string",
            description:
              "Filter notes by the entity ID they are attached to. Should be used together with entity_type.",
          },
          author_id: {
            type: "number",
            description:
              "Filter notes by the author's user ID. Use this to find all notes written by a specific user.",
          },
          limit: {
            type: "number",
            description:
              "Maximum number of notes to return. Default is to return all matching notes.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_notes_for_entity",
      description:
        "Get all notes attached to a specific entity. Returns notes in reverse chronological order (newest first) with author information.",
      parameters: {
        type: "object",
        properties: {
          entity_type: {
            type: "string",
            description:
              "The entity type the notes are attached to (e.g., 'risk', 'vendor', 'model_inventory', 'policy', 'task', 'incident').",
          },
          entity_id: {
            type: "string",
            description: "The entity ID the notes are attached to.",
          },
        },
        required: ["entity_type", "entity_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_note_detail",
      description:
        "Get the full details of a specific note by its ID. Returns the note content, author information, attached entity, and timestamps.",
      parameters: {
        type: "object",
        properties: {
          note_id: {
            type: "number",
            description: "The ID of the note to retrieve.",
          },
        },
        required: ["note_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_notes_analytics",
      description:
        "Get analytics about notes across the organization. Returns counts of notes grouped by entity type, recent note activity, and total counts. Useful for understanding note usage patterns.",
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
      name: "agent_create_note",
      description:
        "Create a new note attached to a specific entity. Requires user confirmation before executing. The note will be associated with the current user as the author.",
      parameters: {
        type: "object",
        properties: {
          entity_type: {
            type: "string",
            description:
              "The entity type to attach the note to (e.g., 'risk', 'vendor', 'model_inventory', 'policy', 'task', 'incident').",
          },
          entity_id: {
            type: "string",
            description: "The entity ID to attach the note to.",
          },
          content: {
            type: "string",
            description: "The content of the note.",
          },
        },
        required: ["entity_type", "entity_id", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_update_note",
      description:
        "Update the content of an existing note. Requires user confirmation before executing. Only the content field will be updated; the note will be marked as edited.",
      parameters: {
        type: "object",
        properties: {
          note_id: {
            type: "number",
            description: "The ID of the note to update.",
          },
          content: {
            type: "string",
            description: "The new content for the note.",
          },
        },
        required: ["note_id", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_delete_note",
      description:
        "Permanently delete a note. This action cannot be undone. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          note_id: {
            type: "number",
            description: "The ID of the note to delete.",
          },
        },
        required: ["note_id"],
      },
    },
  },
];
