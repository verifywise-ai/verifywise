export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "fetch_share_links",
      description:
        "Retrieve share links for a specific entity or all share links in the organization. Share links allow external users to view specific resources without authentication.",
      parameters: {
        type: "object",
        properties: {
          entity_type: {
            type: "string",
            description:
              "Optional entity type to filter share links (e.g., 'project', 'vendor', 'risk', 'model', 'policy').",
          },
          entity_id: {
            type: "number",
            description: "Optional entity ID to filter share links for a specific resource.",
          },
          limit: {
            type: "number",
            description:
              "Maximum number of share links to return. Default returns all matching links.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_create_share_link",
      description:
        "Create a new share link for a specific entity. This generates a unique URL that can be shared with external users. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          entity_type: {
            type: "string",
            description:
              "The type of entity to create a share link for (e.g., 'project', 'vendor', 'risk', 'model', 'policy').",
          },
          entity_id: {
            type: "number",
            description: "The ID of the entity to create a share link for.",
          },
          expires_at: {
            type: "string",
            description:
              "Optional expiration date in ISO 8601 format. If not provided, the link does not expire.",
          },
          permissions: {
            type: "string",
            enum: ["read", "comment"],
            description: "Optional permission level for the share link. Default is 'read'.",
          },
        },
        required: ["entity_type", "entity_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_revoke_share_link",
      description:
        "Revoke an existing share link, making it permanently inaccessible. This is a destructive action. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          link_id: {
            type: "number",
            description: "The ID of the share link to revoke.",
          },
        },
        required: ["link_id"],
      },
    },
  },
];
