export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "fetch_entity_annotations",
      description:
        "Retrieve annotations from the entity graph for a specific user. Use this tool to search for annotations on entities like models, risks, controls, vendors, and use cases. Returns an array of annotation objects with entity type, entity ID, and content.",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "number",
            description:
              "Filter annotations by user ID. If not provided, returns annotations for all users in the tenant.",
          },
          entity_type: {
            type: "string",
            description:
              "Filter by entity type (e.g., 'model', 'risk', 'control', 'vendor', 'useCase'). Supports exact matching.",
          },
          limit: {
            type: "number",
            description:
              "Maximum number of annotations to return. Default is to return all matching annotations.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_entity_annotation",
      description:
        "Get the annotation for a specific entity in the entity graph. Use this to retrieve the note or comment attached to a particular entity (e.g., a specific model or risk). Returns the annotation object or null if none exists.",
      parameters: {
        type: "object",
        properties: {
          entity_type: {
            type: "string",
            description:
              "The type of the entity (e.g., 'model', 'risk', 'control', 'vendor', 'useCase').",
          },
          entity_id: {
            type: "string",
            description: "The ID of the entity to retrieve the annotation for.",
          },
        },
        required: ["entity_type", "entity_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_entity_graph_views",
      description:
        "Retrieve saved entity graph views for a user. Views store layout configurations, filters, and visual preferences for the entity graph. Returns an array of view objects with name and config.",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "number",
            description:
              "Filter views by user ID. If not provided, returns views for all users in the tenant.",
          },
          limit: {
            type: "number",
            description: "Maximum number of views to return.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_gap_rules",
      description:
        "Get the gap detection rules configured for a user. Gap rules define what constitutes a compliance gap in the entity graph (e.g., a model without a risk assessment, a risk without a control). Returns the user's custom rules or null if none are configured.",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "number",
            description: "The user ID to retrieve gap rules for.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_default_gap_rules",
      description:
        "Get the default gap detection rules for the entity graph. These are the built-in rules that define standard compliance gaps (e.g., models without risks, risks without controls, controls without evidence). Use this as a reference or starting point for custom gap rules.",
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
      name: "agent_create_entity_annotation",
      description:
        "Create or update an annotation on an entity in the entity graph. Annotations are notes or comments attached to entities like models, risks, controls, or vendors. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          entity_type: {
            type: "string",
            description:
              "The type of the entity to annotate (e.g., 'model', 'risk', 'control', 'vendor', 'useCase').",
          },
          entity_id: {
            type: "string",
            description: "The ID of the entity to annotate.",
          },
          content: {
            type: "string",
            description: "The annotation content (text note or comment).",
          },
        },
        required: ["entity_type", "entity_id", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_delete_entity_annotation",
      description:
        "Delete an annotation from the entity graph. This permanently removes the annotation. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          annotation_id: {
            type: "number",
            description: "The ID of the annotation to delete.",
          },
        },
        required: ["annotation_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_save_entity_graph_view",
      description:
        "Save a new entity graph view with layout configuration, filters, and visual preferences. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "A descriptive name for the saved view.",
          },
          config: {
            type: "object",
            description:
              "The view configuration object containing layout, filters, zoom level, and other visual preferences.",
          },
        },
        required: ["name", "config"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_save_gap_rules",
      description:
        "Save custom gap detection rules for the entity graph. Rules define what compliance gaps to detect (e.g., models without risks, risks without controls). This creates or updates the user's gap rules. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          rules: {
            type: "object",
            description:
              "The gap rules configuration object. Should be an array of rule objects, each with entityType, requirement, severity, and enabled fields.",
          },
        },
        required: ["rules"],
      },
    },
  },
];
