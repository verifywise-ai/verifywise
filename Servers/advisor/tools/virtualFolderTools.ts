export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "fetch_virtual_folders",
      description:
        "Retrieve all virtual folders for the organization. Returns a flat list of folders with file counts. Use this to browse the folder structure or find specific folders.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of folders to return. Default is to return all folders.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_folder_tree",
      description:
        "Get the full hierarchical folder tree structure. Returns nested folders with parent-child relationships and file counts at each level. Ideal for understanding the complete folder organization.",
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
      name: "get_folder_files",
      description:
        "Get all files within a specific virtual folder. Returns file metadata including filename, size, type, upload date, uploader, and project association.",
      parameters: {
        type: "object",
        properties: {
          folder_id: {
            type: "number",
            description: "The ID of the folder to get files for.",
          },
          limit: {
            type: "number",
            description:
              "Maximum number of files to return. Default is to return all files in the folder.",
          },
        },
        required: ["folder_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_uncategorized_files",
      description:
        "Get all files that are not assigned to any virtual folder. These are files that exist in the system but have not been organized into folders. Useful for identifying files that need categorization.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description:
              "Maximum number of uncategorized files to return. Default is to return all.",
          },
        },
        required: [],
      },
    },
  },
];
