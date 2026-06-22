export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "get_policy_linked_objects",
      description:
        "Get all objects linked to a specific policy. Returns linked risks, evidence items, and other entities that are associated with the policy for compliance tracking.",
      parameters: {
        type: "object",
        properties: {
          policy_id: {
            type: "number",
            description: "The policy ID to get linked objects for.",
          },
        },
        required: ["policy_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_link_object_to_policy",
      description:
        "Link an object (risk, evidence, etc.) to a policy. This creates an association between the object and the policy for compliance tracking. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          policy_id: {
            type: "number",
            description: "The policy ID to link the object to.",
          },
          object_type: {
            type: "string",
            enum: ["risk", "evidence", "control", "model", "vendor"],
            description: "The type of object to link to the policy.",
          },
          object_id: {
            type: "number",
            description: "The ID of the object to link.",
          },
        },
        required: ["policy_id", "object_type", "object_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_unlink_object_from_policy",
      description:
        "Remove the link between an object and a policy. This does not delete the object itself, only the association. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          policy_id: {
            type: "number",
            description: "The policy ID to unlink the object from.",
          },
          object_type: {
            type: "string",
            enum: ["risk", "evidence", "control", "model", "vendor"],
            description: "The type of object to unlink from the policy.",
          },
          object_id: {
            type: "number",
            description: "The ID of the object to unlink.",
          },
        },
        required: ["policy_id", "object_type", "object_id"],
      },
    },
  },
];
