/**
 * LLM-facing definition for the read-only `list_projects` tool.
 *
 * Purpose: let the LLM resolve a project name or use-case code mentioned
 * in chat ("the pricing engine project", "UC-7") into a numeric project
 * id, which write tools like `agent_create_risk` require for the
 * `project_ids` field. Without this the LLM has no way to populate
 * project-id fields without guessing.
 *
 * Note: the product surfaces these as "use cases" but the DB table is
 * `projects`. The LLM can use either term — we still return the same
 * rows. The heavier `fetch_use_cases` tool is still available for
 * analytic queries; this one is deliberately light for id resolution.
 */

export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "list_projects",
      description:
        "List projects (also called 'use cases' in the product UI) in the current organization. Use this to resolve a project name or use-case code (e.g. 'UC-7') mentioned by the user into a numeric project id, which write tools require for fields like `project_ids`. Returns id, uc_id, project_title, status, ai_risk_classification, and owner for each project. Supports an optional case-insensitive `search` filter that matches against `project_title` and `uc_id`. Prefer this lightweight tool for id resolution; use `fetch_use_cases` for deeper analytics.",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description:
              "Optional case-insensitive substring filter. Matches against project_title and uc_id. Use this when the user mentions a specific project by name or use-case code.",
          },
          limit: {
            type: "number",
            description:
              "Maximum number of projects to return. Default 50. Use a small limit when you already know the name and just need the id.",
          },
        },
        required: [],
      },
    },
  },
];
