/**
 * Generates docs/api-docs/src/config/endpoints.ts from Servers/swagger.yaml
 *
 * Usage:  cd Servers && npx ts-node scripts/generateEndpointsTs.ts
 *
 * This ensures the public API reference stays in sync with the OpenAPI spec.
 */

import * as fs from "fs";
import * as path from "path";
import YAML from "yamljs";

// ---------------------------------------------------------------------------
// Types mirroring the Swagger / OpenAPI 3 subset we use
// ---------------------------------------------------------------------------
interface SwaggerParameter {
  name: string;
  in: "path" | "query" | "header";
  required?: boolean;
  description?: string;
  schema?: { type?: string; enum?: string[]; default?: unknown };
}

interface SwaggerOperation {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  security?: Record<string, unknown>[];
  parameters?: SwaggerParameter[];
  requestBody?: {
    required?: boolean;
    content?: Record<
      string,
      {
        schema?: {
          type?: string;
          required?: string[];
          properties?: Record<
            string,
            { type?: string; enum?: string[]; nullable?: boolean; $ref?: string }
          >;
          $ref?: string;
        };
      }
    >;
  };
  responses?: Record<
    string,
    {
      description?: string;
      content?: Record<string, { schema?: Record<string, unknown> }>;
    }
  >;
}

interface SwaggerDoc {
  info: { version: string };
  paths: Record<string, Record<string, SwaggerOperation>>;
  components?: { schemas?: Record<string, unknown> };
}

// ---------------------------------------------------------------------------
// Tag → variable-name mapping
// Uses singular form to match legacy endpoints.ts export names.
// Tags prefixed with "Users - " are merged into the "user" group.
// ---------------------------------------------------------------------------
function tagToVarName(tag: string): string {
  // Merge all "Users - *" sub-tags into "user"
  if (tag.startsWith("Users - ") || tag === "Users") return "user";

  const map: Record<string, string> = {
    "AI Advisor": "aiAdvisor",
    "AI Detection": "aiDetection",
    "AI Trust Centre": "aiTrustCentre",
    "Agent Discovery": "agentDiscovery",
    Authentication: "authentication",
    "Approval Requests": "approvalRequest",
    "Approval Workflows": "approvalWorkflow",
    Assessments: "assessment",
    Audit: "audit",
    Automations: "automation",
    "CE Marking": "ceMarking",
    "Change History": "changeHistory",
    Compliance: "compliance",
    Dashboard: "dashboard",
    Datasets: "dataset",
    "Demo Data": "demoData",
    "EU AI Act": "euAiAct",
    "Entity Graph": "entityGraph",
    Evidence: "evidenceHub",
    FRIA: "fria",
    Files: "file",
    Frameworks: "framework",
    "ISO 27001": "iso27001",
    "ISO 42001": "iso42001",
    Incidents: "aiIncident",
    "Intake Forms": "intakeForm",
    Integrations: "integration",
    Internal: "internal",
    Invitations: "invitation",
    "LLM Keys": "llmKey",
    Logger: "logger",
    Mail: "email",
    "Model Inventory": "modelInventory",
    "Model Risks": "modelRisk",
    "NIST AI RMF": "nistAiRmf",
    Notes: "note",
    Notifications: "notification",
    Organizations: "organization",
    Plugins: "plugin",
    Policies: "policy",
    "Post-Market Monitoring": "postMarketMonitoring",
    "Project Risks": "projectRisk",
    Projects: "project",
    "Quantitative Risks": "quantitativeRisk",
    Reporting: "reporting",
    "Risk Benchmarks": "riskBenchmark",
    "Risk History": "riskHistory",
    Roles: "role",
    Search: "search",
    Settings: "setting",
    "Shadow AI": "shadowAi",
    "Share Links": "shareLink",
    "Slack Webhooks": "slackWebhook",
    Subscriptions: "subscription",
    "Super Admin": "superAdmin",
    System: "system",
    Tasks: "task",
    Tiers: "tier",
    Tokens: "token",
    Training: "training",
    "User Preferences": "userPreference",
    "Vendor Risks": "vendorRisk",
    Vendors: "vendor",
    Webhooks: "webhook",
  };

  if (map[tag]) return map[tag];

  // Fallback: camelCase the tag
  return tag
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(" ")
    .map((w, i) =>
      i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join("");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

function schemaTypeString(schema: Record<string, unknown> | undefined): string {
  if (!schema) return "string";
  if (schema.$ref) {
    const ref = schema.$ref as string;
    return ref.split("/").pop() || "object";
  }
  return (schema.type as string) || "string";
}

function buildRequestBodyMap(op: SwaggerOperation): Record<string, string> | undefined {
  const content = op.requestBody?.content;
  if (!content) return undefined;

  const jsonSchema = content["application/json"]?.schema || content["multipart/form-data"]?.schema;
  if (!jsonSchema) return undefined;

  if (jsonSchema.$ref) {
    const refName = jsonSchema.$ref.split("/").pop() || "object";
    return { "(schema)": refName };
  }

  const props = jsonSchema.properties;
  if (!props || Object.keys(props).length === 0) return undefined;

  const requiredFields = new Set(jsonSchema.required || []);
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(props)) {
    const v = val as {
      type?: string;
      enum?: string[];
      nullable?: boolean;
      $ref?: string;
    };
    let typeStr = v.$ref ? v.$ref.split("/").pop() || "object" : v.type || "string";
    if (v.enum) typeStr = v.enum.join(" | ");
    const req = requiredFields.has(key) ? "required" : "optional";
    const nullable = v.nullable ? ", nullable" : "";
    result[key] = `${typeStr} (${req}${nullable})`;
  }
  return result;
}

function buildParameters(
  op: SwaggerOperation,
  pathParams: SwaggerParameter[] | undefined,
):
  | Array<{
      name: string;
      in: string;
      type: string;
      required: boolean;
      description: string;
    }>
  | undefined {
  const merged = [...(pathParams || []), ...(op.parameters || [])];
  const seen = new Set<string>();
  const validIn = new Set(["path", "query", "header"]);
  const params = merged.filter((p) => {
    if (!p.name || !p.in || !validIn.has(p.in)) return false;
    const key = `${p.name}:${p.in}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (params.length === 0) return undefined;

  return params.map((p) => ({
    name: p.name,
    in: p.in,
    type: schemaTypeString(p.schema as Record<string, unknown>),
    required: p.required ?? false,
    description: p.description || `The ${p.name}`,
  }));
}

function buildResponses(op: SwaggerOperation): Array<{ status: number; description: string }> {
  if (!op.responses) return [{ status: 200, description: "Success" }];
  return Object.entries(op.responses)
    .filter(([code]) => !isNaN(Number(code)))
    .map(([code, r]) => ({
      status: Number(code),
      description: r.description || "No description",
    }));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main(): void {
  const swaggerPath = path.resolve(__dirname, "..", "swagger.yaml");
  const outputPath = path.resolve(
    __dirname,
    "..",
    "..",
    "docs",
    "api-docs",
    "src",
    "config",
    "endpoints.ts",
  );

  console.log(`Reading ${swaggerPath}`);
  const doc: SwaggerDoc = YAML.load(swaggerPath);

  // Collect endpoints grouped by tag variable name
  const groups = new Map<string, { tag: string; endpoints: string[] }>();

  for (const [pathStr, methods] of Object.entries(doc.paths)) {
    const pathParams = (methods as Record<string, unknown>).parameters as
      | SwaggerParameter[]
      | undefined;

    for (const method of HTTP_METHODS) {
      const op = (methods as Record<string, SwaggerOperation>)[method];
      if (!op) continue;

      const tag = op.tags?.[0] || "Other";
      const varName = tagToVarName(tag);

      if (!groups.has(varName)) {
        groups.set(varName, { tag, endpoints: [] });
      }

      const requiresAuth = !!(op.security && op.security.length > 0);
      const params = buildParameters(op, pathParams);
      const reqBody = buildRequestBodyMap(op);
      const responses = buildResponses(op);
      const desc = op.description?.replace(/\n/g, " ").trim();

      let literal = "  {\n";
      literal += `    method: '${method.toUpperCase()}',\n`;
      literal += `    path: '${pathStr}',\n`;
      literal += `    summary: ${JSON.stringify(op.summary || `${method.toUpperCase()} ${pathStr}`)},\n`;
      if (desc) {
        literal += `    description: ${JSON.stringify(desc)},\n`;
      }
      literal += `    requiresAuth: ${requiresAuth},\n`;

      if (params) {
        literal += "    parameters: [\n";
        for (const p of params) {
          literal += `      { name: '${p.name}', in: '${p.in}', type: '${p.type}', required: ${p.required}, description: ${JSON.stringify(p.description)} },\n`;
        }
        literal += "    ],\n";
      }

      if (reqBody) {
        literal += "    requestBody: {\n";
        for (const [key, val] of Object.entries(reqBody)) {
          literal += `      ${JSON.stringify(key)}: ${JSON.stringify(val)},\n`;
        }
        literal += "    },\n";
      }

      literal += "    responses: [\n";
      for (const r of responses) {
        literal += `      { status: ${r.status}, description: ${JSON.stringify(r.description)} },\n`;
      }
      literal += "    ],\n";

      literal += `    tag: ${JSON.stringify(tag)},\n`;
      literal += "  }";

      groups.get(varName)!.endpoints.push(literal);
    }
  }

  // Build file content
  const version = doc.info?.version || "unknown";
  let output = `// Auto-generated from swagger.yaml for version ${version}\n`;
  output +=
    "// DO NOT EDIT MANUALLY — run: cd Servers && npx ts-node scripts/generateEndpointsTs.ts\n";
  output += "// This file contains all API endpoint definitions\n\n";

  // Interfaces
  output += `export interface Parameter {\n`;
  output += `  name: string;\n`;
  output += `  in: 'path' | 'query' | 'header';\n`;
  output += `  type: string;\n`;
  output += `  required: boolean;\n`;
  output += `  description: string;\n`;
  output += `}\n\n`;

  output += `export interface Response {\n`;
  output += `  status: number;\n`;
  output += `  description: string;\n`;
  output += `}\n\n`;

  output += `export interface Endpoint {\n`;
  output += `  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';\n`;
  output += `  path: string;\n`;
  output += `  summary: string;\n`;
  output += `  description?: string;\n`;
  output += `  requiresAuth: boolean;\n`;
  output += `  parameters?: Parameter[];\n`;
  output += `  requestBody?: Record<string, string>;\n`;
  output += `  responses: Response[];\n`;
  output += `  tag: string;\n`;
  output += `}\n\n`;

  // Endpoint arrays
  const sortedKeys = [...groups.keys()].sort();
  for (const varName of sortedKeys) {
    const group = groups.get(varName)!;
    output += `// ${group.tag} endpoints\n`;
    output += `export const ${varName}Endpoints: Endpoint[] = [\n`;
    output += group.endpoints.join(",\n");
    output += ",\n];\n\n";
  }

  // allEndpoints export
  output += "// Export all endpoints grouped\n";
  output += "export const allEndpoints = {\n";
  for (const varName of sortedKeys) {
    output += `  ${varName}: ${varName}Endpoints,\n`;
  }
  output += "};\n";

  fs.writeFileSync(outputPath, output, "utf-8");

  // Count endpoints
  let total = 0;
  for (const g of groups.values()) total += g.endpoints.length;
  console.log(`Generated ${outputPath}`);
  console.log(`  ${total} endpoints across ${groups.size} groups`);
}

main();
