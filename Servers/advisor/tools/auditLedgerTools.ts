export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "fetch_event_logs",
      description:
        "Retrieve event logs from the tamper-evident audit ledger. Supports filtering by entity type, entity ID, user, and action. Returns chronologically ordered audit entries with hash-chain integrity.",
      parameters: {
        type: "object",
        properties: {
          entity_type: {
            type: "string",
            description:
              "Optional entity type to filter logs (e.g., 'risk', 'vendor', 'project', 'policy', 'model').",
          },
          entity_id: {
            type: "number",
            description: "Optional entity ID to filter logs for a specific resource.",
          },
          user_id: {
            type: "number",
            description: "Optional user ID to filter logs by the user who performed the action.",
          },
          action: {
            type: "string",
            description:
              "Optional action type to filter logs (e.g., 'create', 'update', 'delete', 'approve', 'reject').",
          },
          limit: {
            type: "number",
            description: "Maximum number of log entries to return. Default is 50.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_audit_trail_for_entity",
      description:
        "Get the complete audit trail for a specific entity. Returns all changes, events, and actions related to the entity in chronological order. Useful for compliance auditing and change tracking.",
      parameters: {
        type: "object",
        properties: {
          entity_type: {
            type: "string",
            description:
              "The entity type to get the audit trail for (e.g., 'risk', 'vendor', 'project', 'policy', 'model').",
          },
          entity_id: {
            type: "number",
            description: "The ID of the entity to get the audit trail for.",
          },
          limit: {
            type: "number",
            description: "Maximum number of audit entries to return. Default is 100.",
          },
        },
        required: ["entity_type", "entity_id"],
      },
    },
  },
];
