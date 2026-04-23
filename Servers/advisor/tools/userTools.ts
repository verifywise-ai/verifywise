/**
 * LLM-facing definition for the read-only `list_users` tool.
 *
 * Purpose: let the LLM resolve a name or email mentioned in chat ("make
 * Sarah the approver") to a numeric user id, which the write tools (e.g.
 * `agent_create_risk`'s `approver` field) actually need. Without this the
 * LLM has no way to populate user-id fields and the create flow stalls.
 *
 * The function-side implementation lives in
 * `Servers/advisor/functions/userFunctions.ts`. Both halves are merged
 * into the LLM tool surface from `controllers/advisor.ctrl.ts`.
 */

export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "list_users",
      description:
        "List users in the current organization. Use this to resolve a user name or email mentioned by the user (e.g. 'assign Sarah as the approver') into a numeric user id, which write tools require. Returns id, name, surname, email, and role for each user. Supports an optional case-insensitive `search` filter that matches against name, surname, and email.",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description:
              "Optional case-insensitive substring filter. Matches against name, surname, and email. Use this when the user mentions a specific person.",
          },
          limit: {
            type: "number",
            description:
              "Maximum number of users to return. Default 50. Use a small limit when you already know the name and just need the id.",
          },
        },
        required: [],
      },
    },
  },
];
