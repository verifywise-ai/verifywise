/**
 * LLM-facing definition for the read-only `list_frameworks` lookup tool.
 *
 * Purpose: let the LLM resolve a framework name mentioned in chat
 * ("link this risk to EU AI Act") into a numeric framework id, which
 * write tools like `agent_create_risk` / `agent_update_risk` require
 * for the `framework_ids` field.
 *
 * NOTE: This is a LOOKUP tool in the same family as `list_users` and
 * `list_projects` — it exists for id resolution, not analytics. The
 * heavier `fetch_frameworks` / `get_framework_analytics` tools still
 * handle analytic queries. The definition lives in a separate file
 * from `frameworkTools.ts` (which holds the analytics tool defs)
 * to keep the two concerns distinct.
 */

export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "list_frameworks",
      description:
        "List available compliance frameworks (EU AI Act, ISO 42001, ISO 27001, NIST AI RMF, etc.). Returns id, name, description, and is_organizational for each. Frameworks come in two types: project-based (is_organizational=false, linked per project) and organizational (is_organizational=true, shared across a single org-wide project). Use this to resolve a framework name mentioned by the user into a numeric framework id, which write tools require for fields like 'framework_ids'. Supports an optional case-insensitive 'search' filter. Prefer this for id resolution; use 'fetch_frameworks' for analytics.",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description:
              "Optional case-insensitive substring filter. Matches against framework name. Use when the user mentions a specific framework.",
          },
        },
        required: [],
      },
    },
  },
];
