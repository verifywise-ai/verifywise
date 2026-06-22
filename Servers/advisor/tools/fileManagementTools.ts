export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "fetch_files",
      description:
        "Retrieve and filter files from the database. Use this tool to search for files associated with a specific project, entity type, or to get a general file listing. Returns file metadata without binary content.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "number",
            description:
              "Filter files by project ID. Use this to get files associated with a specific project.",
          },
          entity_type: {
            type: "string",
            description:
              "Filter by entity type the file is associated with (e.g., 'risk', 'vendor', 'project', 'control', 'evidence').",
          },
          limit: {
            type: "number",
            description:
              "Maximum number of files to return. Default is to return all matching files.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_file_detail",
      description:
        "Get detailed metadata for a specific file by its ID. Returns filename, size, type, upload date, uploader, and associated project information. Does not return binary content.",
      parameters: {
        type: "object",
        properties: {
          file_id: {
            type: "number",
            description: "The ID of the file to retrieve details for.",
          },
        },
        required: ["file_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_files_by_entity",
      description:
        "Get all files associated with a specific entity (e.g., all files attached to a particular risk, vendor, or control). Returns file metadata for the entity.",
      parameters: {
        type: "object",
        properties: {
          entity_type: {
            type: "string",
            description:
              "The type of entity (e.g., 'risk', 'vendor', 'project', 'control', 'evidence').",
          },
          entity_id: {
            type: "number",
            description: "The ID of the entity to get files for.",
          },
        },
        required: ["entity_type", "entity_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_file_change_history",
      description:
        "Get the change history and audit trail for a specific file. Returns upload events, re-uploads, entity attachments, and folder assignments over time.",
      parameters: {
        type: "object",
        properties: {
          file_id: {
            type: "number",
            description: "The ID of the file to get history for.",
          },
        },
        required: ["file_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_file_analytics",
      description:
        "Get comprehensive analytics about file usage across the tenant. Returns total file count, storage distribution by project, file type breakdown, upload trends, and folder categorization stats.",
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
      name: "get_file_executive_summary",
      description:
        "Get a high-level executive summary of file management across the organization. Includes total files, storage usage, uncategorized file count, recent upload activity, and top uploaders.",
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
      name: "agent_attach_file_to_entity",
      description:
        "Attach an existing file to a specific entity (risk, vendor, control, etc.). Creates an association between the file and the entity. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          file_id: {
            type: "number",
            description: "The ID of the file to attach.",
          },
          entity_type: {
            type: "string",
            description:
              "The type of entity to attach the file to (e.g., 'risk', 'vendor', 'control', 'evidence').",
          },
          entity_id: {
            type: "number",
            description: "The ID of the entity to attach the file to.",
          },
        },
        required: ["file_id", "entity_type", "entity_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_detach_file_from_entity",
      description:
        "Detach a file from a specific entity. Removes the association between the file and the entity without deleting the file. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          file_id: {
            type: "number",
            description: "The ID of the file to detach.",
          },
          entity_type: {
            type: "string",
            description: "The type of entity to detach the file from.",
          },
          entity_id: {
            type: "number",
            description: "The ID of the entity to detach the file from.",
          },
        },
        required: ["file_id", "entity_type", "entity_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_create_virtual_folder",
      description:
        "Create a new virtual folder for organizing files. Folders can be nested via parent_folder_id. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The name of the virtual folder to create.",
          },
          parent_folder_id: {
            type: "number",
            description:
              "Optional parent folder ID to nest this folder under. If not provided, creates a root-level folder.",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_assign_file_to_folder",
      description:
        "Assign a file to a virtual folder. A file can belong to multiple folders. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          file_id: {
            type: "number",
            description: "The ID of the file to assign.",
          },
          folder_id: {
            type: "number",
            description: "The ID of the folder to assign the file to.",
          },
        },
        required: ["file_id", "folder_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_remove_file_from_folder",
      description:
        "Remove a file from a virtual folder. The file is not deleted, only the folder assignment is removed. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          file_id: {
            type: "number",
            description: "The ID of the file to remove from the folder.",
          },
          folder_id: {
            type: "number",
            description: "The ID of the folder to remove the file from.",
          },
        },
        required: ["file_id", "folder_id"],
      },
    },
  },
];
