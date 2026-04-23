/**
 * Swagger/OpenAPI Generator
 *
 * Reads all route files, extracts endpoints, and generates an OpenAPI 3.0 YAML spec.
 * Run: npx ts-node scripts/generateSwagger.ts
 *
 * What it does:
 * 1. Reads index.ts to get the base path -> route file mapping
 * 2. Reads each route file to extract method, path, middleware, handler name
 * 3. Groups endpoints by tag (derived from base path)
 * 4. Outputs a complete OpenAPI 3.0 spec to swagger.generated.yaml
 */

import * as fs from "fs";
import * as path from "path";

interface Endpoint {
  method: string;
  path: string;
  handlerName: string;
  auth: boolean;
  roles: string[];
  tag: string;
  basePath: string;
  routeFile: string;
}

interface RouteMapping {
  basePath: string;
  variableName: string;
}

const SERVERS_DIR = path.resolve(__dirname, "..");
const ROUTES_DIR = path.join(SERVERS_DIR, "routes");
const INDEX_FILE = path.join(SERVERS_DIR, "index.ts");
const OUTPUT_FILE = path.join(SERVERS_DIR, "swagger.generated.yaml");

// Step 1: Parse index.ts to get base path mappings
function parseIndexFile(): RouteMapping[] {
  const content = fs.readFileSync(INDEX_FILE, "utf-8");
  const mappings: RouteMapping[] = [];

  const regex = /app\.use\("(\/api\/[^"]+)",\s*(\w+)(?:\(\))?\)/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    mappings.push({
      basePath: match[1],
      variableName: match[2],
    });
  }

  if (content.includes('app.get("/health"')) {
    mappings.push({ basePath: "/health", variableName: "_inline_health" });
  }

  return mappings;
}

// Step 2: Parse a route file to extract endpoints
function parseRouteFile(filePath: string): {
  endpoints: Array<{
    method: string;
    routePath: string;
    handlerName: string;
    middlewares: string[];
  }>;
  routerLevelMiddlewares: string[];
} {
  const content = fs.readFileSync(filePath, "utf-8");
  const endpoints: Array<{
    method: string;
    routePath: string;
    handlerName: string;
    middlewares: string[];
  }> = [];

  // Detect router-level middleware
  const routerLevelMiddlewares: string[] = [];
  const routerUseRegex = /router\.use\(([^)]+)\)/g;
  let useMatch;
  while ((useMatch = routerUseRegex.exec(content)) !== null) {
    const args = useMatch[1];
    if (args.includes("authenticateJWT")) routerLevelMiddlewares.push("authenticateJWT");
    if (args.includes("superAdminOnly")) routerLevelMiddlewares.push("superAdminOnly");
    if (args.includes("authorize")) {
      const rolesMatch = args.match(/authorize\(\[([^\]]+)\]\)/);
      if (rolesMatch) routerLevelMiddlewares.push("authorize([" + rolesMatch[1] + "])");
    }
  }

  // Match router.method( ... ) including multi-line definitions
  // Strategy: find each router.method( then manually balance parens to find the closing )
  const routerCallRegex = /router\.(get|post|put|patch|delete)\s*\(/g;
  let routerCallMatch;

  while ((routerCallMatch = routerCallRegex.exec(content)) !== null) {
    const method = routerCallMatch[1];
    const startIdx = routerCallMatch.index + routerCallMatch[0].length;

    // Balance parens to find the matching closing )
    let depth = 1;
    let endIdx = startIdx;
    while (endIdx < content.length && depth > 0) {
      if (content[endIdx] === "(") depth++;
      if (content[endIdx] === ")") depth--;
      endIdx++;
    }

    const innerContent = content.substring(startIdx, endIdx - 1).trim();

    // Extract path (first quoted string)
    const pathMatch = innerContent.match(/^"([^"]*)"/);
    if (!pathMatch) continue;
    const routePath = pathMatch[1];
    const argsStr = innerContent.substring(pathMatch[0].length);

    // Split on commas that are NOT inside parentheses/brackets
    const args: string[] = [];
    let argDepth = 0;
    let current = "";
    for (const ch of argsStr) {
      if (ch === "(" || ch === "[") argDepth++;
      if (ch === ")" || ch === "]") argDepth--;
      if (ch === "," && argDepth === 0) {
        const trimmed = current.trim();
        if (trimmed) args.push(trimmed);
        current = "";
      } else {
        current += ch;
      }
    }
    const lastTrimmed = current.trim();
    if (lastTrimmed) args.push(lastTrimmed);

    const middlewares: string[] = [];
    let handlerName = "unknown";

    // Known middleware patterns to skip
    // Use word-boundary-aware matching for patterns that could be substrings of handler names
    const middlewarePatterns = [
      "authenticateJWT", "authorize", "superAdminOnly",
      "multer", "upload.", "express", "jsonParser", "rawParser", "proxy",
      "validateId", "validateVisibility", "validate", "limiter",
      "checkCache", "cacheResponse",
    ];

    // The last non-middleware argument is typically the handler.
    // Process in reverse to find the handler first, then collect middlewares.
    for (let i = args.length - 1; i >= 0; i--) {
      const arg = args[i];
      const isMiddleware = middlewarePatterns.some((mw) => arg.includes(mw));

      if (isMiddleware) {
        if (arg.includes("authenticateJWT")) middlewares.push("authenticateJWT");
        if (arg.includes("authorize")) middlewares.push(arg);
        if (arg.includes("superAdminOnly")) middlewares.push("superAdminOnly");
        if (arg.includes("upload")) middlewares.push("fileUpload");
      } else if (handlerName === "unknown") {
        // Try to identify the handler
        if (/^[a-zA-Z_]\w*$/.test(arg)) {
          // Simple identifier — this is the handler
          handlerName = arg;
        } else if (arg.includes("=>") || arg.includes("function")) {
          // Inline/anonymous handler — try to derive name from route path
          handlerName = "anonymous";
        }
      }
    }

    endpoints.push({ method, routePath, handlerName, middlewares });
  }

  return { endpoints, routerLevelMiddlewares };
}

// Step 3: Convert to full endpoint objects
function buildEndpoints(): Endpoint[] {
  const mappings = parseIndexFile();
  const allEndpoints: Endpoint[] = [];
  const indexContent = fs.readFileSync(INDEX_FILE, "utf-8");

  for (const mapping of mappings) {
    if (mapping.variableName === "_inline_health") {
      allEndpoints.push({
        method: "get",
        path: "/health",
        handlerName: "healthCheck",
        auth: false,
        roles: [],
        tag: "System",
        basePath: "",
        routeFile: "index.ts",
      });
      continue;
    }

    // Find which file this variable imports from
    let routeFilePath: string | null = null;
    const importLines = indexContent.match(
      new RegExp("(?:import|const).*" + mapping.variableName + '.*from.*"\\./routes/([^"]+)"')
    );

    if (importLines) {
      const fileRef = importLines[1];
      routeFilePath = path.join(SERVERS_DIR, "routes", fileRef);
      if (!routeFilePath.endsWith(".ts")) routeFilePath += ".ts";
      routeFilePath = routeFilePath.replace(".js.ts", ".ts").replace(".js", ".ts");
    }

    if (!routeFilePath || !fs.existsSync(routeFilePath)) {
      // Try finding by variable name pattern
      const possibleFiles = fs.readdirSync(ROUTES_DIR).filter((f) => f.endsWith(".route.ts"));
      for (const f of possibleFiles) {
        const baseName = f.replace(".route.ts", "");
        if (
          mapping.variableName.toLowerCase().includes(baseName.toLowerCase()) ||
          baseName.toLowerCase().includes(mapping.variableName.toLowerCase().replace("routes", ""))
        ) {
          routeFilePath = path.join(ROUTES_DIR, f);
          break;
        }
      }
    }

    if (!routeFilePath || !fs.existsSync(routeFilePath)) {
      console.warn("  Could not find route file for: " + mapping.basePath + " (" + mapping.variableName + ")");
      continue;
    }

    const { endpoints, routerLevelMiddlewares } = parseRouteFile(routeFilePath);
    const hasRouterAuth = routerLevelMiddlewares.includes("authenticateJWT");
    const hasSuperAdmin = routerLevelMiddlewares.includes("superAdminOnly");
    const tag = deriveTag(mapping.basePath);

    for (const ep of endpoints) {
      const fullPath = mapping.basePath + ep.routePath;
      const auth = hasRouterAuth || ep.middlewares.includes("authenticateJWT") || hasSuperAdmin;

      const roles: string[] = [];
      if (hasSuperAdmin) roles.push("Super Admin");

      const allMiddlewares = [...routerLevelMiddlewares, ...ep.middlewares];
      for (const mw of allMiddlewares) {
        const rolesMatch = mw.match(/authorize\(\[([^\]]+)\]\)/);
        if (rolesMatch) {
          rolesMatch[1]
            .split(",")
            .map((r: string) => r.trim().replace(/"/g, ""))
            .forEach((r: string) => {
              if (!roles.includes(r)) roles.push(r);
            });
        }
      }

      allEndpoints.push({
        method: ep.method,
        path: fullPath,
        handlerName: ep.handlerName,
        auth,
        roles,
        tag,
        basePath: mapping.basePath,
        routeFile: path.basename(routeFilePath!),
      });
    }
  }

  return allEndpoints;
}

function deriveTag(basePath: string): string {
  const tagMap: Record<string, string> = {
    "/api/users": "Users",
    "/api/projects": "Projects",
    "/api/projectRisks": "Project Risks",
    "/api/vendorRisks": "Vendor Risks",
    "/api/vendors": "Vendors",
    "/api/modelRisks": "Model Risks",
    "/api/modelInventory": "Model Inventory",
    "/api/modelInventoryHistory": "Model Inventory",
    "/api/datasets": "Datasets",
    "/api/dataset-bulk-upload": "Datasets",
    "/api/dataset-change-history": "Datasets",
    "/api/policies": "Policies",
    "/api/tasks": "Tasks",
    "/api/training": "Training",
    "/api/organizations": "Organizations",
    "/api/roles": "Roles",
    "/api/files": "Files",
    "/api/file-manager": "Files",
    "/api/virtual-folders": "Files",
    "/api/mail": "Mail",
    "/api/invitations": "Invitations",
    "/api/frameworks": "Frameworks",
    "/api/eu-ai-act": "EU AI Act",
    "/api/iso-42001": "ISO 42001",
    "/api/iso-27001": "ISO 27001",
    "/api/nist-ai-rmf": "NIST AI RMF",
    "/api/compliance": "Compliance",
    "/api/fria": "FRIA",
    "/api/ce-marking": "CE Marking",
    "/api/pmm": "Post-Market Monitoring",
    "/api/ai-gateway": "AI Gateway",
    "/api/ai-detection": "AI Detection",
    "/api/ai-detection/repositories": "AI Detection",
    "/api/shadow-ai": "Shadow AI",
    "/api/v1/shadow-ai": "Shadow AI",
    "/api/ai-incident-managements": "Incidents",
    "/api/approval-workflows": "Approval Workflows",
    "/api/approval-requests": "Approval Workflows",
    "/api/automations": "Automations",
    "/api/plugins": "Plugins",
    "/api/notifications": "Notifications",
    "/api/entity-graph": "Entity Graph",
    "/api/evidenceHub": "Evidence",
    "/api/search": "Search",
    "/api/notes": "Notes",
    "/api/shares": "Share Links",
    "/api/agent-primitives": "Agent Discovery",
    "/api/aiTrustCentre": "AI Trust Centre",
    "/api/super-admin": "Super Admin",
    "/api/internal": "Internal",
    "/api/audit-ledger": "Audit",
    "/api/feature-settings": "Settings",
    "/api/logger": "System",
    "/api/reporting": "Reporting",
    "/api/dashboard": "Dashboard",
    "/api/autoDrivers": "Demo Data",
    "/api/assessments": "Assessments",
    "/api/questions": "Assessments",
    "/api/webhooks": "Webhooks",
    "/api/slackWebhooks": "Integrations",
    "/api/integrations/github": "Integrations",
    "/api/tokens": "Authentication",
    "/api/llm-keys": "LLM Keys",
    "/api/evaluation-llm-keys": "LLM Evals",
    "/api/deepeval": "LLM Evals",
    "/api/tiers": "Subscriptions",
    "/api/subscriptions": "Subscriptions",
    "/api/user-preferences": "Users",
    "/api/advisor": "AI Advisor",
    "/api/intake": "Intake Forms",
    "/api/version": "System",
    "/api/policy-linked": "Policies",
    "/api/quantitative-risks": "Quantitative Risks",
    "/api/risk-benchmarks": "Risk Benchmarks",
    "/api/riskHistory": "Risk History",
  };

  if (basePath.includes("change-history")) {
    return "Change History";
  }

  return tagMap[basePath] || basePath.replace("/api/", "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Step 4: Generate OpenAPI YAML
function generateYaml(endpoints: Endpoint[]): string {
  const lines: string[] = [];

  lines.push("openapi: 3.0.0");
  lines.push("info:");
  lines.push("  title: VerifyWise API");
  lines.push("  description: AI Governance Platform API");
  lines.push("  version: 2.0.0");
  lines.push("servers:");
  lines.push("  - url: /api");
  lines.push("    description: Main API server");
  lines.push("");
  lines.push("components:");
  lines.push("  securitySchemes:");
  lines.push("    bearerAuth:");
  lines.push("      type: http");
  lines.push("      scheme: bearer");
  lines.push("      bearerFormat: JWT");
  lines.push("  schemas:");
  lines.push("    Error:");
  lines.push("      type: object");
  lines.push("      properties:");
  lines.push("        data:");
  lines.push("          type: string");
  lines.push("");

  const tags = [...new Set(endpoints.map((e) => e.tag))].sort();
  lines.push("tags:");
  for (const tag of tags) {
    lines.push("  - name: " + tag);
  }
  lines.push("");

  // Group by path (strip trailing slashes)
  const pathMap = new Map<string, Endpoint[]>();
  for (const ep of endpoints) {
    let openApiPath = ep.path
      .replace(/\/:(\w+)/g, "/{$1}")
      .replace(/^\/api/, "");

    // Strip trailing slash (but keep "/" itself)
    if (openApiPath.length > 1 && openApiPath.endsWith("/")) {
      openApiPath = openApiPath.slice(0, -1);
    }

    if (!pathMap.has(openApiPath)) {
      pathMap.set(openApiPath, []);
    }
    pathMap.get(openApiPath)!.push(ep);
  }

  const sortedPaths = [...pathMap.keys()].sort();
  const usedOperationIds = new Set<string>();

  lines.push("paths:");
  for (const pathKey of sortedPaths) {
    const eps = pathMap.get(pathKey)!;
    lines.push("  " + pathKey + ":");

    for (const ep of eps) {
      const summary = humanizeHandlerName(ep.handlerName);

      // Make operationId unique by prefixing with base path segment when needed
      let operationId = ep.handlerName;
      if (usedOperationIds.has(operationId)) {
        const prefix = ep.basePath.replace("/api/", "").replace(/[^a-zA-Z0-9]/g, "_");
        operationId = prefix + "_" + ep.handlerName;
      }
      usedOperationIds.add(operationId);

      lines.push("    " + ep.method + ":");
      lines.push("      tags:");
      lines.push("        - " + ep.tag);
      lines.push("      summary: " + summary);
      lines.push("      operationId: " + operationId);

      if (ep.auth) {
        lines.push("      security:");
        lines.push("        - bearerAuth: []");
      }

      if (ep.roles.length > 0) {
        lines.push('      description: "Requires role: ' + ep.roles.join(" or ") + '"');
      }

      // Path parameters
      const paramMatches = [...pathKey.matchAll(/\{(\w+)\}/g)];
      if (paramMatches.length > 0) {
        lines.push("      parameters:");
        for (const param of paramMatches) {
          lines.push("        - name: " + param[1]);
          lines.push("          in: path");
          lines.push("          required: true");
          lines.push("          schema:");
          const isId = param[1].toLowerCase().includes("id") || param[1] === "version";
          lines.push("            type: " + (isId ? "integer" : "string"));
        }
      }

      // Request body
      if (["post", "put", "patch"].includes(ep.method)) {
        lines.push("      requestBody:");
        lines.push("        content:");
        lines.push("          application/json:");
        lines.push("            schema:");
        lines.push("              type: object");
      }

      // Responses
      lines.push("      responses:");
      if (ep.method === "post") {
        lines.push('        "201":');
        lines.push("          description: Created successfully");
      } else if (ep.method === "delete") {
        lines.push('        "200":');
        lines.push("          description: Deleted successfully");
      } else {
        lines.push('        "200":');
        lines.push("          description: Success");
      }

      if (ep.auth) {
        lines.push('        "401":');
        lines.push("          description: Unauthorized");
      }
      if (ep.roles.length > 0) {
        lines.push('        "403":');
        lines.push("          description: Forbidden - insufficient role");
      }
      lines.push('        "500":');
      lines.push("          description: Internal server error");
    }
  }

  return lines.join("\n") + "\n";
}

function humanizeHandlerName(name: string): string {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

// Main
function main() {
  console.log("Parsing index.ts for route mappings...");
  const endpoints = buildEndpoints();
  console.log("Found " + endpoints.length + " endpoints");

  const tags = [...new Set(endpoints.map((e) => e.tag))];
  console.log("Tags: " + tags.length);
  console.log(
    "Methods: GET=" + endpoints.filter((e) => e.method === "get").length +
    ", POST=" + endpoints.filter((e) => e.method === "post").length +
    ", PUT=" + endpoints.filter((e) => e.method === "put").length +
    ", PATCH=" + endpoints.filter((e) => e.method === "patch").length +
    ", DELETE=" + endpoints.filter((e) => e.method === "delete").length
  );

  const unresolved = endpoints.filter((e) => e.handlerName === "unknown");
  if (unresolved.length > 0) {
    console.warn("\nWarning: " + unresolved.length + " endpoints with unresolved handlers:");
    unresolved.forEach((e) => console.warn("  " + e.method.toUpperCase() + " " + e.path));
  }

  console.log("\nGenerating OpenAPI YAML...");
  const yaml = generateYaml(endpoints);
  fs.writeFileSync(OUTPUT_FILE, yaml);
  console.log("Written to " + OUTPUT_FILE);
  console.log("Total paths: " + new Set(endpoints.map((e) => e.path)).size);
}

main();
